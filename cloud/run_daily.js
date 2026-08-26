#!/usr/bin/env node
// 云端每日编排器：生成知识卡+资讯+AIHOT → 升版本 → 跑测试 → 同步 Gitee → GitHub Pages 部署
// 用法: node cloud/run_daily.js [repoDir] [YYYY-MM-DD]
// 环境变量: GH_TOKEN/GH_REPO(部署GitHub Pages必), GITEE_TOKEN/CLOUD=1 走 API 同步
const fs = require("fs");
const path = require("path");
const { execSync, spawnSync } = require("child_process");
const knowGen = require("./gen_knowledge_llm");
const newsGen = require("./gen_news_llm");
const readingGen = require("./gen_reading_llm");
const summaryGen = require("./gen_news_summary_llm");
const gitee = require("./lib_gitee");
const netlify = require("./deploy_netlify");
const githubPages = require("./deploy_github_pages");

function todayStr() { return new Date().toISOString().slice(0, 10); }
function bjTodayStr() { return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10); }

function bumpVersion(BASE) {
  const verFiles = {
    index: path.join(BASE, "index.html"),
    app: path.join(BASE, "js", "app.js"),
    sw: path.join(BASE, "sw.js")
  };
  // 读当前版本
  const title = fs.readFileSync(verFiles.index, "utf8");
  const m = title.match(/硬件PM工作台 v(\d+\.\d+\.\d+)/);
  if (!m) throw new Error("无法解析当前版本");
  let [maj, min, pat] = m[1].split(".").map(Number);
  pat += 1;
  const nv = `${maj}.${min}.${pat}`;
  const oldV = m[1];

  let s = fs.readFileSync(verFiles.index, "utf8");
  s = s.replace(new RegExp("v=" + oldV.replace(/\./g, "\\."), "g"), "v=" + nv);
  s = s.replace(/硬件PM工作台 v[\d.]+/, "硬件PM工作台 v" + nv);
  fs.writeFileSync(verFiles.index, s);

  let a = fs.readFileSync(verFiles.app, "utf8");
  a = a.replace(/APP_VERSION = "[^"]+"/, 'APP_VERSION = "' + nv + '"');
  fs.writeFileSync(verFiles.app, a);

  let w = fs.readFileSync(verFiles.sw, "utf8");
  w = w.replace(/CACHE_VERSION = "v[^"]+"/, 'CACHE_VERSION = "v' + nv + '"');
  fs.writeFileSync(verFiles.sw, w);

  console.log(`[version] ${oldV} → ${nv}`);
  return nv;
}

function runTests(BASE) {
  try {
    execSync("node tests/knowledge.test.js", { cwd: BASE, stdio: "inherit" });
    execSync("node tests/aihot.test.js", { cwd: BASE, stdio: "inherit" });
    console.log("[tests] 通过");
    return true;
  } catch (e) {
    console.error("[tests] 失败，中止部署");
    return false;
  }
}

async function syncToGitee(BASE, changedFiles, msg) {
  const files = changedFiles
    .map((f) => {
      const p = path.join(BASE, f);
      if (!fs.existsSync(p)) return null; // 该任务未生成的文件跳过（如 news 任务无 lang_reading.json）
      return { path: f, content: fs.readFileSync(p, "utf8") };
    })
    .filter(Boolean);
  if (files.length === 0) { console.warn("[gitee] 无文件可同步"); return; }
  await gitee.commitFiles(files, msg);
  console.log("[gitee] 已同步", files.length, "个文件");
}

function gitPush(BASE, msg) {
  try {
    execSync("git add -A && git commit -q -m '" + msg + "'", { cwd: BASE, stdio: "inherit" });
    execSync("git push -q origin main", { cwd: BASE, stdio: "inherit" });
    console.log("[git] 已推送");
  } catch (e) {
    console.error("[git] 推送失败(可能无凭据)，继续部署本地:", e.message);
  }
}

function ensureEdgeone(BASE) {
  // 优先：本地打包的 /opt 层 或 项目内
  const candidates = [
    path.join(BASE, "node_modules", ".bin", "edgeone"),
    "/opt/node_modules/.bin/edgeone"
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  // 云端兜底：运行时安装到 /tmp/eo（免 Layer/COS）
  // SCF 的 HOME 指向不可写的 /home/qcloud，必须重定向到 /tmp
  const dir = "/tmp/eo";
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync("/tmp/npm-cache", { recursive: true });
  const bin = path.join(dir, "node_modules", ".bin", "edgeone");
  if (!fs.existsSync(bin)) {
    console.log("[deploy] 运行时安装 edgeone CLI ...");
    const env = { ...process.env, HOME: "/tmp", npm_config_cache: "/tmp/npm-cache" };
    const r = spawnSync("npm", ["install", "edgeone", "--prefix", dir, "--no-audit", "--no-fund"], { cwd: dir, env, stdio: "inherit" });
    if (r.status !== 0) throw new Error("edgeone 安装失败: npm exit " + r.status);
  }
  return bin;
}

async function deployGitHubPages(BASE) {
  if (!process.env.GH_TOKEN || !process.env.GH_REPO) {
    console.warn("[deploy] 云端模式：缺少 GH_TOKEN/GH_REPO，跳过 GitHub 部署（内容已同步 Gitee 主库）");
    return false;
  }
  try {
    const url = await githubPages.deploy(BASE, process.env.GH_REPO, process.env.GH_TOKEN);
    if (url) console.log("[deploy] GitHub Pages 已上线: " + url);
    return true;
  } catch (e) {
    console.warn("[deploy] GitHub Pages 部署失败:", e.message);
    return false;
  }
}

async function deployEdgeOne(BASE) {
  // 云端模式：主部署通道 = GitHub Pages（免费托管、无额度限制、可访问）
  if (process.env.CLOUD === "1") {
    const ok = await deployGitHubPages(BASE);
    if (!ok) {
      console.warn("[deploy] 主部署失败——内容已同步至 Gitee 主库，可在本地手动补救（node cloud/deploy_github_pages.js）。");
    }
    return;
  }
  // 本地/手动模式：EdgeOne CLI 兜底（失败仅告警）
  const token = process.env.EDGEONE_TOKEN;
  if (!token) { console.warn("[deploy] 无 EDGEONE_TOKEN，跳过 CLI 部署"); return; }
  let cmd;
  try { cmd = ensureEdgeone(BASE); }
  catch (e) { console.warn("[deploy] edgeone CLI 不可用，跳过:", e.message); return; }
  const env = { ...process.env,
    TENCENTCLOUD_SECRET_ID: process.env.TENCENTCLOUD_SECRET_ID || "",
    TENCENTCLOUD_SECRET_KEY: process.env.TENCENTCLOUD_SECRET_KEY || "" };
  const r = spawnSync(cmd, [
    "makers", "deploy", BASE, "-n", "pm-workbench",
    "-t", token, "-e", "production", "-a", "global"
  ], { cwd: BASE, env, stdio: "inherit" });
  if (r.status !== 0) console.warn("[deploy] EdgeOne CLI 部署未完成(exit " + r.status + ")");
  else console.log("[deploy] EdgeOne CLI 部署完成");
}

// 收尾：升版本→测试→Gitee 同步→部署（daily 与 news 共用）
async function finish(BASE, DATE, nv, CLOUD) {
  if (!runTests(BASE)) throw new Error("测试未通过，已中止");
  const changed = [
    "data/knowledge.json", "data/news.json", "data/news-archive.json", "data/aihot.json",
    "data/lang_reading.json", "data/news_summary.json", "index.html", "js/app.js", "sw.js"
  ];
  const msg = `云端自动更新 v${nv} (${DATE})`;
  if (CLOUD && process.env.GITEE_TOKEN) {
    await syncToGitee(BASE, changed, msg);
  } else {
    gitPush(BASE, msg);
  }
  await deployEdgeOne(BASE);
}

async function main(baseArg, dateArg) {
  const BASE = baseArg || process.argv[2] || path.join(__dirname, "..");
  const DATE = dateArg || process.argv[3] || todayStr();
  const CLOUD = process.env.CLOUD === "1";

  console.log(`[run_daily] BASE=${BASE} DATE=${DATE} CLOUD=${CLOUD}`);

  // 1. 生成（知识卡 / 资讯 / 精读 10 篇 / AIHOT）
  // 精读按北京时间切日（App 端 lgBjToday 同口径），知识卡/资讯仍按 UTC 日期
  const k = await knowGen.main(DATE, BASE);
  const nw = await newsGen.main(DATE, BASE);
  try { await readingGen.main(bjTodayStr(), BASE); } catch (e) { console.warn("[reading] 生成失败(非致命):", e.message); }
  try {
    spawnSync("node", [path.join(BASE, "scripts", "fetch_aihot_daily.js")], { cwd: BASE, stdio: "inherit" });
    console.log("[aihot] 抓取完成");
  } catch (e) { console.warn("[aihot] 抓取失败(非致命):", e.message); }

  // 2. 升版本 → 3/4/5. 测试+同步+部署
  const nv = bumpVersion(BASE);
  await finish(BASE, DATE, nv, CLOUD);
  console.log(`[run_daily] 完成 ${DATE} → v${nv}`);
}

// 12:00 / 18:00 资讯刷新：仅重抓当日资讯（覆盖旧资讯），再升版本部署
async function mainNews(baseArg, dateArg) {
  const BASE = baseArg || process.argv[2] || path.join(__dirname, "..");
  const DATE = dateArg || process.argv[3] || todayStr();
  const CLOUD = process.env.CLOUD === "1";

  console.log(`[run_news] BASE=${BASE} DATE=${DATE} CLOUD=${CLOUD}（当日资讯刷新）`);
  const nw = await newsGen.main(DATE, BASE, { refresh: true });
  const nv = bumpVersion(BASE);
  await finish(BASE, DATE, nv, CLOUD);
  console.log(`[run_news] 完成 ${DATE} 资讯刷新 → v${nv}`);
}

// 北京时间 0 点后精读刷新：仅生成当日精读（北京时间切日），再升版本部署
async function mainReading(baseArg, dateArg) {
  const BASE = baseArg || process.argv[2] || path.join(__dirname, "..");
  const DATE = dateArg || process.argv[3] || bjTodayStr();
  const CLOUD = process.env.CLOUD === "1";

  console.log(`[run_reading] BASE=${BASE} DATE=${DATE} CLOUD=${CLOUD}（北京时间精读刷新）`);
  const rd = await readingGen.main(DATE, BASE);
  const nv = bumpVersion(BASE);
  await finish(BASE, DATE, nv, CLOUD);
  console.log(`[run_reading] 完成 ${DATE} 精读刷新 → v${nv}`);
}

// 北京时间 08:00 新闻摘要：仅生成当日新闻摘要（北京时间切日），再升版本部署
async function mainNewsSummary(baseArg, dateArg) {
  const BASE = baseArg || process.argv[2] || path.join(__dirname, "..");
  const DATE = dateArg || process.argv[3] || bjTodayStr();
  const CLOUD = process.env.CLOUD === "1";

  console.log(`[run_newssum] BASE=${BASE} DATE=${DATE} CLOUD=${CLOUD}（北京时间新闻摘要）`);
  const r = await summaryGen.main(DATE, BASE);
  const nv = bumpVersion(BASE);
  await finish(BASE, DATE, nv, CLOUD);
  console.log(`[run_newssum] 完成 ${DATE} 新闻摘要 → v${nv}`);
}

if (require.main === module) {
  main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
}
module.exports = { main, mainNews, mainReading, mainNewsSummary, bumpVersion };
