#!/usr/bin/env node
// 腾讯云 SCF 入口（Node.js 运行时）
// 定时器触发：通过环境变量 JOB=daily|patrol 区分任务。
// 云端模式(CLOUD=1)：从 Gitee 拉最新数据 → 本地生成 → 写回 Gitee → GitHub Pages 部署。
const fs = require("fs");
const path = require("path");
const os = require("os");

const gitee = require("./lib_gitee");

const SYNC_FILES = [
  "data/knowledge.json", "data/news.json", "data/news-archive.json",
  "data/aihot.json", "data/lang_reading.json", "data/news_summary.json", "data/phonetics.json",
  "js/language.js", "css/style.css",
  "index.html", "js/app.js", "sw.js"
];

// 把打包进函数的仓库快照复制到 /tmp 工作区，并从 Gitee 拉取最新版本（覆盖快照，保证基于最新数据）
async function prepareWorkdir() {
  const src = "/var/user"; // SCF 代码目录（含本仓库快照）
  const work = path.join(os.tmpdir(), "pmwb_work");
  fs.rmSync(work, { recursive: true, force: true });
  fs.cpSync(src, work, { recursive: true });

  // 从 Gitee 拉取最新数据文件覆盖（避免函数包陈旧）
  for (const f of SYNC_FILES) {
    try {
      const got = await gitee.getFile(f);
      if (got) {
        fs.mkdirSync(path.dirname(path.join(work, f)), { recursive: true });
        fs.writeFileSync(path.join(work, f), got.content);
      }
    } catch (e) {
      console.warn("[prepare] 拉取 " + f + " 失败(用快照): " + e.message);
    }
  }
  return work;
}

async function main(event = {}, context = {}) {
  // 任务分派：显式 JOB 优先；其次按定时器名精确识别（TriggerName）；
  // 兜底按北京时间——7 点=daily(全量)，12/18 点=news(资讯刷新)，其余=patrol
  const tn = (event && event.TriggerName) || "";
  const bjHour = new Date(Date.now() + 8 * 3600 * 1000).getUTCHours();
  const fallback = bjHour === 7 ? "daily" : (bjHour === 12 || bjHour === 18 ? "news" : "patrol");
  let job = process.env.JOB || (event && event.job);
  if (!job) {
    if (tn === "reading-0005") job = "reading";
    else if (tn === "daily-0710") job = "daily";
    else if (tn === "news-1200" || tn === "news-1800") job = "news";
    else if (tn === "summary-0800") job = "newssum";
    else if (tn === "patrol-6h") job = "patrol";
    else job = fallback;
  }
  console.log("[scf] JOB=" + job + " (trigger=" + tn + " bjHour=" + bjHour + ")");

  if (job === "patrol") {
    const work = await prepareWorkdir();
    const patrol = require("./patrol");
    return await patrol.main(work);
  }

  if (job === "news") {
    const work = await prepareWorkdir();
    const runDaily = require("./run_daily");
    return await runDaily.mainNews(work, new Date().toISOString().slice(0, 10));
  }

  if (job === "reading") {
    const work = await prepareWorkdir();
    const runDaily = require("./run_daily");
    // 精读按北京时间切日
    const bjDate = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    return await runDaily.mainReading(work, bjDate);
  }

  if (job === "newssum") {
    const work = await prepareWorkdir();
    const runDaily = require("./run_daily");
    // 新闻摘要按北京时间切日
    const bjDate = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    return await runDaily.mainNewsSummary(work, bjDate);
  }

  // daily
  const work = await prepareWorkdir();
  const runDaily = require("./run_daily");
  return await runDaily.main(work, new Date().toISOString().slice(0, 10));
}

// SCF Node 运行时入口
exports.main_handler = async (event, context) => {
  try {
    const r = await main(event, context);
    return { ok: true, result: r };
  } catch (e) {
    console.error("[scf] 失败:", e.message);
    return { ok: false, error: e.message };
  }
};

if (require.main === module) {
  main().then((r) => console.log(JSON.stringify(r))).catch((e) => { console.error(e); process.exit(1); });
}
