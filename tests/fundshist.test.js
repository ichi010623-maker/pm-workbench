// 投资理财 · 基金估值历史（微信日历查看）模块自动化测试
// 运行：node tests/fundshist.test.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");

const sandbox = {
  window: {},
  DB: { data: { growth: {} }, save() {} },
  document: {
    getElementById: () => null,
    querySelector: () => null, querySelectorAll: () => []
  },
  escapeHtml: s => (s == null ? "" : String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")),
  today: () => "2026-08-10",
  render() {}, renderInvest() {}, navigate() {}, closeModal() {},
  showToast() {}, showModal() {},
  fetch: () => Promise.reject(new Error("no-fetch")),
  console, JSON, Object, Array, String, Number, Math, Date, parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, "js", "invest.js"), "utf8"), sandbox);

const {
  invSnapFundsForDate, invFundHistoryDates, invFundHistoryByDate, invSearchFunds, invFundCalCells
} = sandbox;

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error("  ✗ " + msg); } }
function section(name) { console.log("\n▶ " + name); }

const EST_NORM = {
  抓取时间: "2026-08-10 07:47:23",
  抓取平台: "同花顺爱基金",
  results: [
    { "基金代码": "001438", "基金名称": "易方达瑞享混合E(001438)", "估值数值": -1.43, "预计涨跌幅": "-1.43%", "报告期": "2026-06-30", "重仓股数": 10 },
    { "基金代码": "018104", "基金名称": "某ETF联接(018104)", "估值数值": null, "预计涨跌幅": "—", "报告期": "—", "重仓股数": 0 },
    { "基金代码": "007789", "基金名称": "富国中证(007789)", "估值数值": 0.85, "预计涨跌幅": "+0.85%", "报告期": "2026-06-30", "重仓股数": 5 }
  ]
};

section("A. 快照并入历史（invSnapFundsForDate）");
(function () {
  const h1 = invSnapFundsForDate(EST_NORM, {}, null, "2026-08-10 07:47:23");
  ok(h1["2026-08-10"], "应生成 2026-08-10 键");
  ok(h1["2026-08-10"].items.length === 3, "应含 3 只基金");
  ok(h1["2026-08-10"].成功数 === 2, "成功数应为 2（有 1 只 ETF 无估值）");
  ok(h1["2026-08-10"].items[0]["基金代码"] === "001438", "首只基金代码正确");

  // 当天幂等覆盖
  const h2 = invSnapFundsForDate({ 抓取时间: "2026-08-10 15:30:11", results: EST_NORM.results.slice(0, 1) }, h1, null, "2026-08-10 15:30:11");
  ok(Object.keys(h2).length === 1, "同一天覆盖不新增键");
  ok(h2["2026-08-10"].抓取时间 === "2026-08-10 15:30:11", "同一天保留最后一次抓取时间");
  ok(h2["2026-08-10"].items.length === 1, "同一天覆盖为新内容");

  // 空结果不写入
  const h3 = invSnapFundsForDate({ 抓取时间: "2026-08-11 15:30:00", results: [] }, h1, null, "2026-08-11 15:30:00");
  ok(!h3["2026-08-11"], "空结果不新增日期");
  ok(h3["2026-08-10"], "原历史不受影响");

  // 多天累积
  const h4 = invSnapFundsForDate({ 抓取时间: "2026-08-07 15:30:00", results: EST_NORM.results }, h1, null, "2026-08-07 15:30:00");
  ok(h4["2026-08-07"] && h4["2026-08-10"], "多天累积成功");
})();

section("B. 日期列表与按日取值");
(function () {
  const h = invSnapFundsForDate(EST_NORM, {}, null, "2026-08-10 07:47:23");
  const dates = invFundHistoryDates(h);
  ok(dates.length === 1 && dates[0] === "2026-08-10", "日期列表倒序");
  const items = invFundHistoryByDate(h, "2026-08-10");
  ok(items.length === 3, "按日取值数量正确");
  ok(invFundHistoryByDate(h, "2020-01-01").length === 0, "不存在日期返回空数组");
  ok(invFundHistoryByDate(null, "2026-08-10").length === 0, "null 历史返回空数组");
})();

section("C. 搜索（invSearchFunds）");
(function () {
  const items = EST_NORM.results;
  ok(invSearchFunds(items, "").length === 3, "空关键词返回全部");
  ok(invSearchFunds(items, "001438").length === 1, "按代码搜索");
  ok(invSearchFunds(items, "ETF").length === 1, "按名称关键字搜索（仅 ETF联接 命中）");
  ok(invSearchFunds(items, "00").length === 2, "按代码片段匹配（001438/007789 含 00）");
  ok(invSearchFunds(items, "不存在基金xyz").length === 0, "无匹配返回空");
})();

section("D. 月历格子（invFundCalCells）");
(function () {
  const h = invSnapFundsForDate(EST_NORM, {}, null, "2026-08-10 07:47:23");
  const cells = invFundCalCells(h, "2026-08");
  ok(cells.length === 36, "2026-08 月历格子数（8/1 为周六→周一开头补 5 格 + 31 天）");
  const hasCount = cells.filter(c => c.has).length;
  ok(hasCount === 1, "红点日期数 = 1（8/10）");
  const today = cells.filter(c => c.today);
  ok(today.length === 1 && today[0].date === "2026-08-10", "今天标记正确");
})();

console.log("\n========== fundshist.test.js: " + pass + " passed, " + fail + " failed ==========");
process.exit(fail ? 1 : 0);
