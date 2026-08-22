// 语言学习·单词库（雅思/外贸）模块自动化测试（Node vm 加载 js/language.js，stub DOM/DB）
// 运行：node tests/language.test.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const src = fs.readFileSync(path.join(ROOT, "js", "language.js"), "utf8");

// ---- 沙箱（模拟浏览器环境，仅满足函数可调用） ----
const fakeEl = { innerHTML: "", querySelector: () => null, querySelectorAll: () => [], classList: { add() {}, remove() {}, contains: () => false } };
const sandbox = {
  DB: { data: {}, save() {}, logActivity() {} },
  document: { getElementById: () => fakeEl, querySelector: () => null, querySelectorAll: () => [] },
  window: {},
  escapeHtml: s => (s == null ? "" : String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")),
  showModal() {}, closeModal() {}, showToast() {}, navigate() {}, render() {}, confirm() { return true; },
  formatDateShort() { return ""; }, today: () => "2026-08-06",
  console, encodeURIComponent, decodeURIComponent, Math, Date, JSON, Object, Array, String, Number, parseInt, parseFloat, isNaN,
  localStorage: (function () { var m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; })()
};
vm.createContext(sandbox);
vm.runInContext(src, sandbox);

const {
  LG_IELTS, LG_TRADE, lgWordPools, lgWordById, lgWordbankDefault,
  lgPickDailyWords, lgMarkWordInWb, lgWordbankReviewFromWb, lgWordbankStatsFromWb,
  langGet, renderLanguage, lgRenderWords
} = sandbox;

// ---- 断言框架 ----
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error("  ✗ " + msg); } }
function section(name) { console.log("\n▶ " + name); }

function mkWb() {
  return { lib: "ielts", enabled: { ielts: true, trade: true }, dailyCount: 20, daily: null, progress: {} };
}

(async function () {
  section("A. 词库数据集");
  ok(LG_IELTS.length === 100, "雅思词库 100 词");
  ok(LG_TRADE.length === 70, "外贸词库 70 词");
  ok(LG_IELTS[0].id === "ielts-1" && LG_IELTS[99].id === "ielts-100", "雅思 id 稳定 ielts-1..100");
  ok(LG_TRADE[0].id === "trade-1" && LG_TRADE[69].id === "trade-70", "外贸 id 稳定 trade-1..70");
  ok(LG_IELTS[0].word === "analyze" && LG_IELTS[0].phonetic === "/ˈænəlaɪz/" && LG_IELTS[0].example && LG_IELTS[0].exampleCn, "单词含音标+例句+译文");
  ok(LG_TRADE[0].word === "invoice" && LG_TRADE[0].phonetic && LG_TRADE[0].example, "外贸词含音标+例句");
  ok(lgWordPools().ielts.length === 100 && lgWordPools().trade.length === 70, "lgWordPools 两库齐全");
  ok(lgWordById("ielts-37") && lgWordById("ielts-37").word === "focus", "lgWordById 按 id 取词（ielts-37=focus）");
  ok(lgWordById("ielts-50") && lgWordById("ielts-50").word === "involve", "lgWordById 序号稳定（ielts-50=involve）");

  section("B. 每日选词 lgPickDailyWords（确定性 + 优先级）");
  var pools = lgWordPools();
  var wb = mkWb();
  var p1 = lgPickDailyWords(pools, wb.enabled, 20, {}, "2026-08-06");
  ok(p1.length === 20, "默认返回 20 个（每日词数）");
  ok(p1.every(function (id) { return id.indexOf("ielts") === 0 || id.indexOf("trade") === 0; }), "全为单词库 id");
  var p1b = lgPickDailyWords(pools, wb.enabled, 20, {}, "2026-08-06");
  ok(JSON.stringify(p1) === JSON.stringify(p1b), "同输入确定（每日推送稳定）");
  var p3 = lgPickDailyWords(pools, wb.enabled, 5, {}, "2026-08-06");
  ok(p3.length === 5, "count 截断为 5");
  var prog = {}; prog["trade-1"] = { status: "unknown", lastSeen: "2026-08-01", reps: 1 };
  var p4 = lgPickDailyWords(pools, wb.enabled, 10, prog, "2026-08-06");
  ok(p4[0] === "trade-1", "不会的单词优先推送（排第一）");
  var prog2 = {}; prog2["ielts-2"] = { status: "known", lastSeen: "2026-08-01", reps: 3 }; prog2["trade-3"] = { status: "vague", lastSeen: "2026-08-01", reps: 2 }; prog2["ielts-1"] = { status: "unknown", lastSeen: "2026-08-01", reps: 1 };
  var p5 = lgPickDailyWords(pools, wb.enabled, 10, prog2, "2026-08-06");
  ok(p5[0] === "ielts-1" && p5.indexOf("trade-3") < p5.indexOf("ielts-2"), "优先级 unknown<vague<known<未见");
  var en2 = { ielts: false, trade: true };
  var p6 = lgPickDailyWords(pools, en2, 20, {}, "2026-08-06");
  ok(p6.every(function (id) { return id.indexOf("trade") === 0; }), "关闭雅思后只推外贸");

  section("C. 标记单词 lgMarkWordInWb");
  var wb2 = mkWb();
  wb2.daily = { date: "2026-08-06", ids: ["ielts-1", "ielts-2", "trade-1"], results: {} };
  lgMarkWordInWb(wb2, "ielts-1", "unknown", "2026-08-06");
  ok(wb2.progress["ielts-1"].status === "unknown" && wb2.progress["ielts-1"].reps === 1, "标记写入 progress");
  ok(wb2.daily.results["ielts-1"] === "unknown", "今日 daily.results 同步标记");
  lgMarkWordInWb(wb2, "ielts-2", "known", "2026-08-06");
  ok(wb2.daily.results["ielts-2"] === "known", "known 也写入 results");
  var wb3 = mkWb();
  wb3.daily = { date: "2026-08-05", ids: ["ielts-1"], results: {} };
  lgMarkWordInWb(wb3, "ielts-1", "unknown", "2026-08-06");
  ok(!wb3.daily.results["ielts-1"], "非今日 daily 不写 results");
  ok(wb3.progress["ielts-1"].status === "unknown", "progress 仍更新");
  lgMarkWordInWb(wb2, "ielts-1", "vague", "2026-08-06");
  ok(wb2.progress["ielts-1"].reps === 2 && wb2.progress["ielts-1"].status === "vague", "重复标记 reps 累加");

  section("D. 重点复习列表 lgWordbankReviewFromWb（不会优先）");
  var wb4 = mkWb();
  wb4.progress = {
    "ielts-1": { status: "unknown", lastSeen: "2026-08-01", reps: 3 },
    "ielts-2": { status: "vague", lastSeen: "2026-08-01", reps: 1 },
    "trade-1": { status: "unknown", lastSeen: "2026-08-01", reps: 1 },
    "ielts-3": { status: "known", lastSeen: "2026-08-01", reps: 5 }
  };
  var rev = lgWordbankReviewFromWb(wb4, pools);
  ok(rev.length === 3, "复习列表仅含 不会/模糊（3 条）");
  ok(rev[0].status === "unknown" && rev[1].status === "unknown", "不会优先于模糊");
  ok(rev[0].id === "trade-1" && rev[1].id === "ielts-1", "不会内部按 reps 升序（trade-1 reps1 先于 ielts-1 reps3）");
  ok(rev[2].status === "vague" && rev[2].id === "ielts-2", "模糊排最后");

  section("E. 统计 lgWordbankStatsFromWb");
  var st = lgWordbankStatsFromWb(wb4, pools);
  ok(st.total === 170 && st.unknown === 2 && st.vague === 1 && st.known === 1 && st.studied === 4, "统计计数正确（total 170）");

  section("F. 默认结构 lgWordbankDefault");
  var d = lgWordbankDefault();
  ok(d.lib === "ielts" && d.enabled.ielts && d.enabled.trade && d.dailyCount === 20 && d.daily === null && d.progress && typeof d.progress === "object", "默认值含两库/每日20/空进度");

  section("G. 旧数据兜底（wordbank 补齐 + 空安全 + 渲染不抛错）");
  // 模拟 v5.8.73 之前的旧数据：langs.en 没有 wordbank 字段
  sandbox.DB.data.growth = {};
  sandbox.DB.data.growth.language = { langs: { en: { words: [], notes: [], materials: [], settings: {}, stats: {} } } };
  var enBack = langGet("en");
  ok(!!enBack.wordbank && enBack.wordbank.dailyCount === 20, "旧数据 langGet 自动补齐 wordbank");
  ok(!!enBack.wordbank.progress && !!enBack.wordbank.enabled && !!enBack.wordbank.dailyCount, "wordbank 结构完整（progress/enabled/dailyCount）");
  ok(JSON.stringify(lgWordbankReviewFromWb(undefined, lgWordPools())) === "[]", "wordbank 缺失时复习列表返回空数组不抛错");
  ok(lgWordbankStatsFromWb(undefined, lgWordPools()).total === 170, "wordbank 缺失时统计不抛错");
  var threwRender = false; try { renderLanguage(); } catch (e) { threwRender = true; }
  ok(!threwRender, "旧数据下 renderLanguage 不抛错（语言学习可进入）");
  var threwWords = false; try { lgRenderWords("en"); } catch (e) { threwWords = true; }
  ok(!threwWords, "单词库 tab 渲染不抛错");

  console.log("\n=== 语言学习·单词库 测试完成 ===");
  console.log("通过 " + pass + " / 失败 " + fail);
  if (fail > 0) process.exit(1);
})();
