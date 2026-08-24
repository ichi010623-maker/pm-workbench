#!/usr/bin/env node
// 云端每日编排器：生成知识卡+资讯+AIHOT → 升版本 → 跑测试 → 同步 Gitee → EdgeOne 部署
// 用法: node cloud/run_daily.js [repoDir] [YYYY-MM-DD]
// 环境变量: EDGEONE_TOKEN(必), TENCENTCLOUD_SECRET_ID/KEY(部署用COS), GITEE_TOKEN/CLOUD=1 走 API 同步
const fs = require("fs");
const path = require("path");
const { execSync, spawnSync } = require("child_process");
const knowGen = require("./gen_knowledge_llm");
const newsGen = require("./gen_news_llm");
const gitee = require("./lib_gitee");

function todayStr() { return new Date().toISOString().slice(0, 10); }

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
  const files = changedFiles.map((f) => ({
    path: f,
    content: fs.readFileSync(path.join(BASE, f), "utf8")
  }));
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

function deployEdgeOne(BASE) {
  const token = process.env.EDGEONE_TOKEN;
  if (!token) throw new Error("缺少 EDGEONE_TOKEN");
  const env = { ...process.env,
    TENCENTCLOUD_SECRET_ID: process.env.TENCENTCLOUD_SECRET_ID || "",
    TENCENTCLOUD_SECRET_KEY: process.env.TENCENTCLOUD_SECRET_KEY || "" };
  // 优先用本地 node_modules 里的 edgeone，否则回退 npx
  const localBin = path.join(BASE, "node_modules", ".bin", "edgeone");
  const cmd = fs.existsSync(localBin) ? localBin : "edgeone";
  const r = spawnSync(cmd, [
    "makers", "deploy", BASE, "-n", "pm-workbench",
    "-t", token, "-e", "production", "-a", "global"
  ], { cwd: BASE, env, stdio: "inherit" });
  if (r.status !== 0) throw new Error("EdgeOne 部署失败");
  console.log("[deploy] EdgeOne 部署完成");
}

async function main() {
  const BASE = process.argv[2] || path.join(__dirname, "..");
  const DATE = process.argv[3] || todayStr();
  const CLOUD = process.env.CLOUD === "1";

  console.log(`[run_daily] BASE=${BASE} DATE=${DATE} CLOUD=${CLOUD}`);

  // 1. 生成
  const k = await knowGen.main();
  const nw = await newsGen.main();
  // AIHOT 抓取（已有脚本，免费 API）
  try {
    spawnSync("node", [path.join(BASE, "scripts", "fetch_aihot_daily.js")], { cwd: BASE, stdio: "inherit" });
    console.log("[aihot] 抓取完成");
  } catch (e) { console.warn("[aihot] 抓取失败(非致命):", e.message); }

  // 2. 升版本
  const nv = bumpVersion(BASE);

  // 3. 测试
  if (!runTests(BASE)) throw new Error("测试未通过，已中止");

  // 4. 同步
  const changed = [
    "data/knowledge.json", "data/news.json", "data/news-archive.json", "data/aihot.json",
    "index.html", "js/app.js", "sw.js"
  ];
  const msg = `云端自动更新 v${nv} (${DATE})`;
  if (CLOUD && process.env.GITEE_TOKEN) {
    await syncToGitee(BASE, changed, msg);
  } else {
    gitPush(BASE, msg);
  }

  // 5. 部署
  deployEdgeOne(BASE);

  console.log(`[run_daily] 完成 ${DATE} → v${nv}`);
}

if (require.main === module) {
  main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
}
module.exports = { main, bumpVersion };
