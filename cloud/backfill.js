#!/usr/bin/env node
/**
 * 历史数据补录（一次性/按需）：按日期区间补齐缺失的知识卡 / 资讯 / 精读 / 新闻摘要
 *
 * 用法:
 *   node cloud/backfill.js 2026-08-24 2026-08-31 all
 *   node cloud/backfill.js 2026-08-24 2026-08-31 news
 *
 * 说明:
 *   - 各生成器均按日期幂等（已有则跳过），重复执行不会产生重复内容
 *   - 精读/摘要按「北京时间」日期，知识卡/资讯按「UTC」日期；本脚本统一按传入日期调用
 *   - 全部补完后统一升版本 → 测试 → push 主库 → 部署 GitHub Pages
 */
const path = require("path");
const fs = require("fs");
const { execSync, spawnSync } = require("child_process");

const BASE = path.join(__dirname, "..");
const START = process.argv[2];
const END = process.argv[3];
const KIND = (process.argv[4] || "all").toLowerCase();

// 读取凭据
(function loadEnv() {
  // 直连（与 local_run 一致）：移除沙箱代理，避免 git/RSS 挂起或 502
  ["HTTPS_PROXY", "HTTP_PROXY", "https_proxy", "http_proxy", "ALL_PROXY", "all_proxy"].forEach((k) => delete process.env[k]);
  const f = path.join(__dirname, "local.env");
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    const s = line.trim();
    if (!s || s.startsWith("#")) continue;
    const i = s.indexOf("=");
    if (i < 0) continue;
    const k = s.slice(0, i).trim();
    const v = s.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
})();
process.env.CLOUD = "1";

function dateRange(a, b) {
  const out = [];
  let d = new Date(a + "T00:00:00Z");
  const end = new Date(b + "T00:00:00Z");
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d = new Date(d.getTime() + 86400000);
  }
  return out;
}

async function main() {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(START || "") || !/^\d{4}-\d{2}-\d{2}$/.test(END || "")) {
    console.error("用法: node cloud/backfill.js <起始日期> <结束日期> <all|knowledge|news|reading|newssum>");
    process.exit(1);
  }
  const days = dateRange(START, END);
  console.log(`[backfill] 区间 ${START} ~ ${END}（${days.length} 天）类型=${KIND}`);

  const kg = require("./gen_knowledge_llm");
  const nw = require("./gen_news_llm");
  const rd = require("./gen_reading_llm");
  const ns = require("./gen_news_summary_llm");

  const stat = { knowledge: 0, news: 0, reading: 0, newssum: 0, failed: 0 };

  for (const d of days) {
    console.log(`\n----- ${d} -----`);
    const jobs = [];
    if (KIND === "all" || KIND === "knowledge") jobs.push(["knowledge", () => kg.main(d, BASE)]);
    if (KIND === "all" || KIND === "news") jobs.push(["news", () => nw.main(d, BASE, { refresh: false })]);
    if (KIND === "all" || KIND === "reading") jobs.push(["reading", () => rd.main(d, BASE)]);
    if (KIND === "all" || KIND === "newssum") jobs.push(["newssum", () => ns.main(d, BASE)]);

    for (const [name, fn] of jobs) {
      try {
        const r = await fn();
        if (r && !r.skipped) stat[name] += 1;
        if (r && r.skipped) console.log(`  ${name}: 跳过（已存在）`);
        else console.log(`  ${name}: 完成 ${JSON.stringify(r || {})}`);
      } catch (e) {
        stat.failed += 1;
        console.error(`  ${name}: 失败 - ${e.message}`);
      }
    }
  }

  console.log("\n[backfill] 生成统计:", JSON.stringify(stat));

  const runDaily = require("./run_daily");
  const nv = runDaily.bumpVersion(BASE);
  console.log(`[backfill] 版本升至 v${nv}`);

  const env = { ...process.env, PATH: `${process.execPath.replace(/\/node$/, "")}:${process.env.PATH}` };
  for (const tf of ["tests/knowledge.test.js", "tests/aihot.test.js"]) {
    const t = spawnSync(process.execPath, [tf], { cwd: BASE, stdio: "inherit", env });
    if (t.status !== 0) {
      console.error(`[backfill] ${tf} 测试未通过，中止发布`);
      process.exit(1);
    }
  }

  const files = ["data/knowledge.json", "data/news.json", "data/news-archive.json", "data/aihot.json",
    "data/lang_reading.json", "data/news_summary.json", "index.html", "js/app.js", "sw.js"];
  try {
    execSync(`git add ${files.map((f) => JSON.stringify(f)).join(" ")}`, { cwd: BASE, stdio: "inherit" });
    execSync(`git commit -q -m 'backfill: 补录 ${START}~${END} (${KIND})'`, { cwd: BASE, stdio: "inherit" });
    execSync("git push -q origin main", { cwd: BASE, stdio: "inherit" });
    console.log("[backfill] 已推送主库");
  } catch (e) {
    console.error("[backfill] push 失败:", e.message);
  }

  const gh = require("./deploy_github_pages");
  try {
    const url = await gh.deploy(BASE, process.env.GH_REPO, process.env.GH_TOKEN);
    console.log("[backfill] 已部署: " + url);
  } catch (e) {
    console.error("[backfill] 部署失败:", e.message);
  }
  console.log("[backfill] 完成");
}

main().catch((e) => { console.error("[backfill] ERR", e.message); process.exit(1); });
