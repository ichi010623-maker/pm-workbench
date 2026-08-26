#!/usr/bin/env node
// GitHub Actions 入口（替代腾讯云 SCF scf_handler.js）
// 由 .github/workflows/ci.yml 调用，按传入的 job 分派到云端编排器 run_daily.js / patrol.js
// 用法: node cloud/ci_run.js <daily|news|reading|newssum|patrol> [repoDir]
//
// 与 SCF 的差异：
//   - Actions 已通过 actions/checkout 拉取最新主库，无需再从 Gitee 拉数据（prepareWorkdir 整段删除）
//   - 生成的 data 文件由 finish() 经 git push 回写主库（GITHUB_TOKEN），保证次日 checkout 最新
//   - 部署仍走 GitHub Pages（deploy_github_pages.js，使用 GH_TOKEN secret 指向 pm-workbench-site）
const fs = require("fs");
const path = require("path");

const runDaily = require("./run_daily");

function todayStr() { return new Date().toISOString().slice(0, 10); }
function bjTodayStr() { return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10); }

async function main() {
  const job = (process.argv[2] || "daily").toLowerCase();
  const BASE = process.argv[3] || path.join(__dirname, "..");
  const DATE = todayStr();
  const bjDate = bjTodayStr();

  console.log(`[ci_run] JOB=${job} BASE=${BASE} DATE=${DATE} bjDate=${bjDate}`);

  switch (job) {
    case "news":
      return await runDaily.mainNews(BASE, DATE);
    case "reading":
      return await runDaily.mainReading(BASE, bjDate);
    case "newssum":
      return await runDaily.mainNewsSummary(BASE, bjDate);
    case "patrol": {
      const patrol = require("./patrol");
      return await patrol.main(BASE);
    }
    case "daily":
    default:
      return await runDaily.main(BASE, DATE);
  }
}

if (require.main === module) {
  main()
    .then((r) => { console.log("[ci_run] 完成", JSON.stringify(r || {})); process.exit(0); })
    .catch((e) => { console.error("[ci_run] 失败:", e.message); process.exit(1); });
}

module.exports = { main };
