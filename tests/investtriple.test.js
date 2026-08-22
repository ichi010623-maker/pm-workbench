// 投资理财 · v5.9.28 三合一（基金监控/智能选股/基金投顾）纯函数测试
// 运行：node tests/investtriple.test.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");

const sandbox = {
  window: {},
  DB: { data: { growth: {} }, save() {} },
  document: {
    getElementById: () => null,
    createElement: () => ({}),
    head: { appendChild() {} },
    querySelector: () => null, querySelectorAll: () => []
  },
  escapeHtml: s => (s == null ? "" : String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")),
  today: () => "2026-08-10",
  render() {}, renderInvest() {}, navigate() {}, closeModal() {}, showToast() {}, showModal() {},
  fetch: () => Promise.reject(new Error("no-fetch")),
  console, JSON, Object, Array, String, Number, Math, Date, parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, "js", "invest.js"), "utf8"), sandbox);
// invest.js 内部会以真实实现覆盖 sandbox 的 render/renderInvest 桩；测试中置空避免访问 DOM
sandbox.render = function () {};
sandbox.renderInvest = function () {};

const {
  invParsePingzhong, invLatestNav, invCalcSupportResistance, invFundFloatPL,
  invParseEastmoneyClist, invRiskScore, INV_ADVISOR_QUESTIONS,
  invInvestBody, renderInvestMonitorDetail, invMonRangePoints, invOpenFundDetail,
  invCloseFundDetail, setInvMonRange, invSaveMonFund, invFetchScreener
} = sandbox;

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error("  ✗ " + msg); } }
function section(name) { console.log("\n▶ " + name); }

// 模拟 pingzhongdata JS（Data_netWorthTrend 20+ 条，末条 9.0819）
const TREND = [];
for (let i = 0; i < 30; i++) TREND.push({ x: 1780000000000 + i * 86400000, y: 8.5 + i * 0.02, equityReturn: i % 2 ? 0.5 : -0.3 });
TREND[TREND.length - 1] = { x: 1786032000000, y: 9.0819, equityReturn: 3.06 };
const PZ_SRC = 'var fS_name = "易方达瑞享混合E";var Data_netWorthTrend = ' + JSON.stringify(TREND) + ";var Data_ACWorthTrend = [];";

section("A. pingzhongdata 解析（invParsePingzhong / invLatestNav）");
(function () {
  const p = invParsePingzhong(PZ_SRC);
  ok(p.name === "易方达瑞享混合E", "解析基金名");
  ok(p.trend.length === 30, "解析趋势条数");
  const last = invLatestNav(p.trend);
  ok(last && last.nav === 9.0819, "最新净值");
  ok(last && last.ret === 3.06, "最新涨跌幅");
  ok(invParsePingzhong("").trend.length === 0, "空文本安全");
})();

section("B. 压力位/支撑位（invCalcSupportResistance，fund-168 公式）");
(function () {
  const p = invParsePingzhong(PZ_SRC);
  const cur = 9.0819;
  const sr = invCalcSupportResistance(p.trend, cur);
  ok(sr != null, "计算成功");
  // ma20 = 最近20条均值
  const n = 20;
  let sum = 0;
  for (let i = p.trend.length - n; i < p.trend.length; i++) sum += p.trend[i].y;
  const ma20 = sum / n;
  ok(Math.abs(sr.ma20 - ma20) < 1e-9, "20日均线正确");
  // 公式：pressure = (ma20*1.05 > cur) ? ma20*1.05 : cur*1.05
  const expectP = (ma20 * 1.05 > cur) ? ma20 * 1.05 : cur * 1.05;
  ok(Math.abs(sr.pressure - expectP) < 1e-9, "压力位公式正确");
  const expectS = (ma20 * 0.95 < cur) ? ma20 * 0.95 : cur * 0.95;
  ok(Math.abs(sr.support - expectS) < 1e-9, "支撑位公式正确");
  ok(sr.pressure > cur && sr.support < cur, "压力在上/支撑在下");
  ok(sr.toPressurePct > 0 && sr.toSupportPct > 0, "距压力/支撑百分比为正");
  ok(invCalcSupportResistance([], 1) == null, "空趋势返回 null");
  ok(invCalcSupportResistance(p.trend, 0) == null, "非法现价返回 null");
  // 分支覆盖：当 ma20*1.05 <= cur 时压力 = cur*1.05
  const flat = [{ y: 1 }, { y: 1 }, { y: 1 }];
  const sr2 = invCalcSupportResistance(flat.map((o, i) => ({ x: i, y: o.y, r: 0 })), 1.0);
  ok(sr2 && Math.abs(sr2.ma20 - 1) < 1e-9, "等值均线");
})();

section("C. 浮盈亏（invFundFloatPL）");
(function () {
  ok(Math.abs(invFundFloatPL(8.5, 9.0819) - (9.0819 - 8.5) / 8.5 * 100) < 1e-9, "盈利计算");
  ok(invFundFloatPL(10, 9) === -10, "亏损计算");
  ok(invFundFloatPL(null, 9) == null, "无成本返回 null");
  ok(invFundFloatPL(8, null) == null, "无现价返回 null");
})();

section("D. 东财选股解析（invParseEastmoneyClist）");
(function () {
  const json = { data: { diff: [
    { f2: 73.92, f3: 20.0, f5: 105575, f6: 760585430, f9: 35.86, f12: "688073", f14: "毕得医药", f20: 6718067516 },
    { f2: 77.7, f3: 20.0, f5: 295610, f6: 2264869005, f9: 70.41, f12: "301080", f14: "百普赛斯", f20: 13028662807 }
  ] } };
  const rows = invParseEastmoneyClist(json);
  ok(rows.length === 2, "解析行数");
  ok(rows[0].code === "688073" && rows[0].name === "毕得医药" && rows[0].pct === 20.0, "字段映射");
  ok(rows[0].pe === 35.86 && rows[0].cap === 6718067516, "PE/市值映射");
  ok(invParseEastmoneyClist({}).length === 0, "空数据安全");
})();

section("E. 风险评级（invRiskScore）");
(function () {
  ok(INV_ADVISOR_QUESTIONS.length === 5, "问卷 5 题");
  ok(invRiskScore({}).level === "保守" && invRiskScore({}).score === 0, "未作答默认保守");
  // 全选 1 分 → 5 分 → 保守
  const c = invRiskScore({ q1: 1, q2: 1, q3: 1, q4: 1, q5: 1 });
  ok(c.score === 5 && c.level === "保守" && c.pct.bond === 80, "保守：债80/股15");
  // 全选 3 分 → 15 分 → 进取
  const a = invRiskScore({ q1: 3, q2: 3, q3: 3, q4: 3, q5: 3 });
  ok(a.score === 15 && a.level === "进取" && a.pct.stock === 55, "进取：债40/股55");
  // 稳健：9-14 分
  const w = invRiskScore({ q1: 2, q2: 2, q3: 2, q4: 2, q5: 2 });
  ok(w.score === 10 && w.level === "稳健" && w.pct.bond === 60, "稳健：债60/股35");
  // 边界：8 分 → 保守；9 分 → 稳健
  ok(invRiskScore({ q1: 2, q2: 2, q3: 2, q4: 1, q5: 1 }).level === "保守", "8分=保守");
  ok(invRiskScore({ q1: 2, q2: 2, q3: 2, q4: 2, q5: 1 }).level === "稳健", "9分=稳健");
})();

section("F. 投顾白屏修复（invInvestBody advisor 分支）");
(function () {
  sandbox.investTab = "advisor";
  const html = invInvestBody({ funds: [] });
  ok(typeof html === "string" && html.length > 50, "advisor 返回非空正文");
  ok(html.indexOf("风险测评问卷") >= 0, "advisor 渲染问卷（不再是空 div 白屏）");
  ok(html.indexOf('id="inv-advisor-donut"') >= 0, "advisor 含饼图容器");
  // monitor 选中基金 → 详情；未选中 → 列表
  sandbox.investTab = "monitor";
  sandbox.window.__invMonSel = null;
  const listHtml = invInvestBody({ funds: [{ code: "001438" }] });
  ok(listHtml.indexOf("inv-fund-card") >= 0, "monitor 无选中→列表");
  sandbox.window.__invMonSel = "001438";
  sandbox.window.__invMonData = { "001438": { name: "测试基金", trend: TREND } };
  sandbox.window.__invMonRange = "1y";
  const detailHtml = invInvestBody({ funds: [{ code: "001438", nickname: "测试" }] });
  ok(detailHtml.indexOf("返回监控列表") >= 0, "monitor 选中→详情含返回");
  ok(detailHtml.indexOf("inv-mon-chart") >= 0, "详情含折线图容器");
  ok(detailHtml.indexOf("持有份额") >= 0 && detailHtml.indexOf("成本净值") >= 0, "详情含份额/成本编辑");
  sandbox.window.__invMonSel = null;
  sandbox.window.__invMonData = {};
})();

section("G. 监控历史净值范围截取（invMonRangePoints）");
(function () {
  ok(invMonRangePoints([], "1y").length === 0, "空趋势返回空");
  const all = invMonRangePoints(TREND, "all");
  ok(all.length === TREND.length, "全部=全量");
  ok(all[0].value === TREND[0].y && all[all.length - 1].value === TREND[TREND.length - 1].y, "全部映射 value");
  // 时间相关范围：用相对 now 的时间戳，确保确定性
  const now = Date.now();
  const rel = [];
  for (let i = 0; i < 60; i++) rel.push({ x: now - (59 - i) * 86400000, y: 1 + i * 0.01 });
  const oneM = invMonRangePoints(rel, "1m"); // 近21天
  ok(oneM.length > 0 && oneM.length <= 22, "近1月截取约21点（≤22）");
  ok(oneM.length < rel.length, "范围截取少于全量");
  const farPast = [{ x: 1, y: 5 }, { x: 2, y: 6 }];
  const fb = invMonRangePoints(farPast, "1m"); // 全部被过滤 → 兜底返回末点
  ok(fb.length === 1 && fb[0].value === 6, "全过滤→兜底末点");
})();

section("H. 智能选股 JSONP（invFetchScreener 改用 script 注入）");
(function () {
  let appended = null;
  const origCreate = sandbox.document.createElement;
  sandbox.document.createElement = function (tag) {
    if (tag === "script") { const el = { src: "", onerror: null, onload: null, parentNode: null }; appended = el; return el; }
    return origCreate(tag);
  };
  const origAppend = sandbox.document.head.appendChild;
  sandbox.document.head.appendChild = function (el) { if (appended === el) appended.parentNode = sandbox.document.head; return el; };
  sandbox.investTab = "screener";
  invFetchScreener("rise");
  ok(appended != null, "选股触发 script 注入");
  ok(appended && appended.src.indexOf("push2.eastmoney.com") >= 0, "请求东财接口");
  ok(appended && appended.src.indexOf("cb=__invScCb_") >= 0, "带 JSONP 回调参数");
  // 模拟回调：验证解析写入 rows
  const cbMatch = appended.src.match(/cb=([^&]+)/);
  ok(cbMatch != null, "可提取回调名");
  const json = { data: { diff: [{ f2: 1, f3: 2, f5: 3, f6: 4, f9: 5, f12: "600000", f14: "浦发银行", f20: 300000000000 }] } };
  sandbox.window[cbMatch[1]](json);
  ok(sandbox.window.__invScreenerRows && sandbox.window.__invScreenerRows.length === 1, "JSONP 回调解析写入行");
  ok(sandbox.window.__invScreenerRows[0].code === "600000", "解析字段正确");
  ok(sandbox.window.__invScreenerLoading === false, "加载态复位");
  sandbox.document.createElement = origCreate;
  sandbox.document.head.appendChild = origAppend;
})();

console.log("\n========== investtriple.test.js: " + pass + " passed, " + fail + " failed ==========");
process.exit(fail ? 1 : 0);
