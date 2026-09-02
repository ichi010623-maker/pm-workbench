// Sprint 3：收藏来源筛选（Saved sub-filter）+ origin 正确性测试
// 运行：node tests/intel_saved.test.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log("  ✓ " + msg); } else { fail++; console.log("  ✗ " + msg); } }
function section(t) { console.log("\n▶ " + t); }

function makeSandbox() {
  const fakeEl = { innerHTML: "", querySelector: () => null, querySelectorAll: () => [], style: {}, value: "", classList: { add() {}, remove() {}, contains: () => false } };
  const sb = {
    console,
    document: { getElementById: () => fakeEl, querySelector: () => null, querySelectorAll: () => [] },
    escapeHtml: s => (s == null ? "" : String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")),
    showModal() {}, closeModal() {}, showToast() {}, navigate() {}, render() {},
    today: () => "2026-09-02", uid: () => "id1",
    DB: { data: { industryHistory: {}, industryFav: [], industryCustom: [], industryComments: {}, industryFavCats: [], marketOpp: [], industry: [] }, save() {}, logActivity() {} },
    LiveData: { news: null }, __knowledge: null, __newsSummary: null,
    nsLoad(cb) { cb && cb(); },
    learnItemsByDate: () => [], learnTodayDate: () => "2026-09-02",
    formatDateShort: d => d, intelHistoryByDate: () => [],
    encodeURIComponent, decodeURIComponent, Math, Date, JSON, Object, Array, String, Number, parseInt, parseFloat, isNaN,
    fetch: () => Promise.resolve({ json: () => Promise.resolve({}) }),
    localStorage: (function () { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; })()
  };
  sb.window = sb;
  vm.createContext(sb);
  return sb;
}

function loadAll(sb) {
  const files = [
    "js/intel/core.js", "js/intel/history.js", "js/intel/fav.js", "js/intel/comments.js",
    "js/intel/llm/prompts.js", "js/intel/llm/providers.js", "js/intel/llm/parser.js", "js/intel/llm/client.js",
    "js/intel/sections/index.js", "js/intel/sections/today.js", "js/intel/state.js", "js/intel/render.js", "js/aioutputs.js"
  ];
  files.forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sb, { filename: f }));
  return sb;
}

// ============ I. 来源筛选 UI ============
section("I. renderIntelFav 来源筛选条");
{
  const sb = loadAll(makeSandbox());
  // 构造三类收藏
  vm.runInContext(`DB.data.industryFavCats = [{id:"market",name:"市场"},{id:"tech",name:"技术"}];
    DB.data.industryFav = [
      { key:"k1", date:"2026-09-01", title:"资讯条", summary:"a", source:"源", origin:"news", catId:"market" },
      { key:"k2", date:"2026-09-01", title:"我的情报条", summary:"b", source:"手动", origin:"mine", catId:"tech" },
      { key:"k3", date:"2026-09-01", title:"自定义条", summary:"c", source:"AI", origin:"custom", catId:"market" },
      { key:"k4", date:"2026-09-01", title:"旧无来源", summary:"d", source:"旧", catId:"market" }
    ];`, sb);
  const html = vm.runInContext("renderIntelFav()", sb);
  ok(html.indexOf("全部 4") >= 0, "来源条含全部计数（4 条）");
  ok(html.indexOf("🌐 资讯 2") >= 0, "来源条含资讯计数（k1 显式 + k4 旧无来源归 news = 2）");
  ok(html.indexOf("📋 我的情报 1") >= 0, "来源条含我的情报计数（1）");
  ok(html.indexOf("🤖 自定义 1") >= 0, "来源条含自定义计数（1）");
  ok(html.indexOf("setIntelFavOrigin") >= 0, "来源 chips 绑定 setIntelFavOrigin");
  ok(typeof vm.runInContext("setIntelFavOrigin", sb) === "function", "setIntelFavOrigin 全局可用");
}

// ============ II. 来源过滤行为 ============
section("II. intelFavBodyHtml 按来源过滤");
{
  const sb = loadAll(makeSandbox());
  vm.runInContext(`DB.data.industryFavCats = [{id:"market",name:"市场"},{id:"tech",name:"技术"}];
    DB.data.industryFav = [
      { key:"k1", date:"2026-09-01", title:"资讯条", summary:"a", origin:"news", catId:"market" },
      { key:"k2", date:"2026-09-01", title:"我的情报条", summary:"b", origin:"mine", catId:"tech" },
      { key:"k3", date:"2026-09-01", title:"自定义条", summary:"c", origin:"custom", catId:"market" }
    ];`, sb);
  vm.runInContext("intelState.intelFavBase = DB.data.industryFav; intelState.intelFavSearch = ''; intelState.intelFavFilter = 'all'; intelState.intelFavOrigin = 'mine';", sb);
  const mineHtml = vm.runInContext("intelFavBodyHtml()", sb);
  ok(mineHtml.indexOf("我的情报条") >= 0, "来源=mine 时含我的情报条");
  ok(mineHtml.indexOf("资讯条") < 0, "来源=mine 时不含资讯条");
  ok(mineHtml.indexOf("自定义条") < 0, "来源=mine 时不含自定义条");

  vm.runInContext("intelState.intelFavOrigin = 'news';", sb);
  const newsHtml = vm.runInContext("intelFavBodyHtml()", sb);
  ok(newsHtml.indexOf("资讯条") >= 0, "来源=news 时含资讯条");
  ok(newsHtml.indexOf("我的情报条") < 0, "来源=news 时不含我的情报条");

  vm.runInContext("intelState.intelFavOrigin = 'all';", sb);
  const allHtml = vm.runInContext("intelFavBodyHtml()", sb);
  ok(allHtml.indexOf("资讯条") >= 0 && allHtml.indexOf("我的情报条") >= 0 && allHtml.indexOf("自定义条") >= 0, "来源=all 时三类全含");
}

// ============ III. origin 写入正确性 ============
section("III. 收藏写入 origin（mine 不再误存 news）");
{
  const sb = loadAll(makeSandbox());
  vm.runInContext(`DB.data.industryFavCats = [{id:"market",name:"市场"}];
    DB.data.industry = [{ id:"m1", title:"手动条", summary:"x", tags:["a"], date:"2026-09-02", important:false }];
    intelState.myIntel = DB.data.industry;
    // 模拟 resolveIntelItem(scope='mine')
    var _r = resolveIntelItem('mine', 0);
    // 触发收藏：直接走 confirmIntelFav 的等价路径（用 intelAddFav + origin 注入逻辑）
    var favItem = _r.item;
    if (_r.origin && !favItem.origin) { favItem = Object.assign({}, _r.item, { origin: _r.origin }); }
    DB.data.industryFav = intelAddFav(DB.data.industryFav, favItem, _r.dateStr, 'market');
  `, sb);
  const saved = vm.runInContext("DB.data.industryFav[0]", sb);
  ok(!!saved && saved.origin === "mine", "从「我的情报」收藏后 origin=mine（修复前误为 news）");
  ok(saved.title === "手动条", "收藏记录标题正确");

  // news 来源
  const sb2 = loadAll(makeSandbox());
  vm.runInContext(`DB.data.industryFavCats = [{id:"market",name:"市场"}];
    LiveData.news = { generatedAt:"2026-09-02T07:00:00+08:00", categories:[], items:[{id:"n1", title:"资讯条", summary:"x", source:"源", url:"", category:"ai", priority:3}] };
    intelState.liveNews = { items: LiveData.news.items, date: "2026-09-02" };
    var _r2 = resolveIntelItem('news', 0);
    var favItem2 = _r2.item;
    if (_r2.origin && !favItem2.origin) { favItem2 = Object.assign({}, _r2.item, { origin: _r2.origin }); }
    DB.data.industryFav = intelAddFav(DB.data.industryFav, favItem2, _r2.dateStr, 'market');
  `, sb2);
  const saved2 = vm.runInContext("DB.data.industryFav[0]", sb2);
  ok(!!saved2 && saved2.origin === "news", "从「资讯」收藏后 origin=news");
}

console.log("\n========================================");
console.log("Sprint 3 收藏来源筛选测试：通过 " + pass + " / 失败 " + fail);
console.log("========================================");
process.exit(fail > 0 ? 1 : 0);
