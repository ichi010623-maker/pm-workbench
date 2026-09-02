// Sprint 2：v2.0 sections 契约与 Today section 测试（Node vm 沙箱，不触网）
// 运行：node tests/intel_sections.test.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log("  ✓ " + msg); } else { fail++; console.log("  ✗ " + msg); } }
function section(t) { console.log("\n▶ " + t); }

// —— 沙箱：模拟浏览器全局（含 app.js 提供的依赖桩）——
function makeSandbox() {
  const fakeEl = { innerHTML: "", querySelector: () => null, querySelectorAll: () => [], style: {}, value: "", classList: { add() {}, remove() {}, contains: () => false } };
  const sb = {
    console,
    document: { getElementById: () => fakeEl, querySelector: () => null, querySelectorAll: () => [] },
    escapeHtml: s => (s == null ? "" : String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")),
    navigate() {}, render() {}, today: () => "2026-09-02",
    // 数据源桩
    LiveData: { news: null },
    __knowledge: null,
    __newsSummary: null,
    nsLoad(cb) { cb && cb(); },
    fetch: () => Promise.resolve({ json: () => Promise.resolve({}) }),
    fetchOk: true,
    // 知识模块函数桩
    learnItemsByDate: () => [],
    learnTodayDate: () => "2026-09-02",
    Math, Date, JSON, Object, Array, String, Number, parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent,
    localStorage: (function () { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; })()
  };
  sb.window = sb;
  vm.createContext(sb);
  return sb;
}

function loadFiles(sb, files) {
  files.forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sb, { filename: f }));
  return sb;
}

const SECTION_FILES = [
  "js/intel/state.js",
  "js/intel/sections/index.js",
  "js/intel/sections/today.js"
];

// ============ I. 注册中心 ============
section("I. sections 注册中心（index.js）");
{
  const sb = loadFiles(makeSandbox(), SECTION_FILES);
  ok(typeof sb.collectIntelSections === "function", "collectIntelSections 已挂全局");
  ok(typeof sb.getIntelSection === "function", "getIntelSection 已挂全局");

  const reg = vm.runInContext("collectIntelSections()", sb);
  ok(!!reg.today, "Today section 已注册");
  ok(reg.today.id === "today", "Today id = today");
  ok(reg.today.label === "📋 Today", "Today label = 📋 Today");
  ok(reg.today.nav === true, "Today nav = true（显示在导航）");
  ok(typeof reg.today.render === "function", "Today render 是函数");
  ok(typeof reg.today.init === "function", "Today init 是函数");
  ok(Array.isArray(reg.today.requires) && reg.today.requires.length === 3, "Today requires 声明 3 项依赖");

  const one = vm.runInContext("getIntelSection('today')", sb);
  ok(!!one && one.id === "today", "getIntelSection('today') 可取回描述");
  ok(vm.runInContext("getIntelSection('world')", sb) === null, "未注册 section 返回 null（不抛错）");
}

// ============ II. Today 空态降级（无数据）============
section("II. Today 优雅降级（全部无数据）");
{
  const sb = loadFiles(makeSandbox(), SECTION_FILES);
  const html = vm.runInContext("collectIntelSections().today.render({})", sb);
  ok(typeof html === "string" && html.length > 0, "无数据时仍返回 HTML（不抛异常）");
  ok(html.indexOf("Today's Brief") >= 0, "含 Today's Brief 区块");
  ok(html.indexOf("今日要点") >= 0, "含今日要点区块");
  ok(html.indexOf("每日知识") >= 0, "含每日知识区块");
  ok((html.match(/empty-state/g) || []).length === 3, "三块各自显示空态（共 3 个 empty-state）");
  ok(html.indexOf("尚未生成") >= 0, "空态含明确文案");
}

// ============ III. Today 有数据渲染 ============
section("III. Today 真实数据渲染");
{
  const sb = loadFiles(makeSandbox(), SECTION_FILES);
  // 注入资讯数据（5 条，priority 不同）
  sb.LiveData.news = {
    generatedAt: "2026-09-02T07:00:00+08:00",
    categories: [{ key: "ai", label: "AI", icon: "🤖" }, { key: "tech", label: "科技", icon: "🔬" }],
    items: [
      { id: "a1", category: "ai", priority: 5, title: "AI 重大突破", summary: "摘要摘要摘要", source: "源A", url: "https://e.com/1" },
      { id: "a2", category: "tech", priority: 1, title: "芯片新闻", summary: "芯片摘要", source: "源B", url: "https://e.com/2" },
      { id: "a3", category: "ai", priority: 3, title: "第三条", summary: "摘要三", source: "源C", url: "" },
      { id: "a4", category: "tech", priority: 2, title: "第四条", summary: "摘要四", source: "源D", url: "" },
      { id: "a5", category: "ai", priority: 4, title: "第五条", summary: "摘要五", source: "源E", url: "" },
      { id: "a6", category: "ai", priority: 0, title: "第六条（应被截断）", summary: "摘要六", source: "源F", url: "" }
    ]
  };
  // 注入知识卡
  sb.learnItemsByDate = () => ([{
    cat: "ai", title: "模型泛化", tag: "泛化",
    content: "AI 模型需要泛化能力以便在未见过的数据上准确预测。",
    points: ["减少过拟合", "提高鲁棒性", "适应新数据"],
    tip: "选择数据量充足的训练集。"
  }]);
  const html = vm.runInContext("collectIntelSections().today.render({})", sb);
  ok(html.indexOf("AI 重大突破") >= 0, "Top5 含 priority 最高条目（AI 重大突破 =5）");
  ok(html.indexOf("芯片新闻") >= 0, "priority=1 的芯片新闻仍在 Top5（第 5 席）");
  ok(html.indexOf("第六条（应被截断）") < 0, "priority=0 最低的第 6 条被截断（仅取 Top5）");
  ok(html.indexOf("共 6 条") >= 0, "统计显示总条数 6");
  ok(html.indexOf("模型泛化") >= 0, "每日知识区块显示卡片标题");
  ok(html.indexOf("减少过拟合") >= 0, "每日知识显示要点");
  // 断言精确到「要点区不含空态」（Brief 区无 news_summary 数据时空态属正常降级）
  const hl = html.slice(html.indexOf("今日要点"), html.indexOf("每日知识"));
  ok(hl.indexOf("empty-state") < 0, "有数据时今日要点区不显示空态");
}

// ============ IV. Today's Brief（news_summary）============
section("IV. Today's Brief 异步简报");
{
  const sb = loadFiles(makeSandbox(), SECTION_FILES);
  // 模拟已加载的 news_summary（含今日条目）
  const bjd = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  sb.__newsSummary = {
    days: {
      [bjd]: {
        mode: "rss",
        brief: ["要点一", "要点二", "要点三"],
        groups: [{ cat: "科技", icon: "🔬", items: [{ title: "t1", summary: "s1" }] }]
      }
    }
  };
  // init 会拉取并写入 intelState.briefData
  vm.runInContext("collectIntelSections().today.init({})", sb);
  const cached = vm.runInContext("intelState.briefData", sb);
  ok(!!cached && cached.brief, "init 后简报数据已缓存到 intelState.briefData");

  const html = vm.runInContext("collectIntelSections().today.render({})", sb);
  ok(html.indexOf("要点一") >= 0, "简报渲染出 brief 条目");
  ok(html.indexOf("RSS 素材模式") >= 0, "显示数据来源模式标记");
  ok(html.indexOf("共 <b>1</b> 条") >= 0, "显示聚合统计（groups 合计 1 条）");
}

// ============ V. 契约红线 ============
section("V. 契约红线（禁止 window.__ 散落 / 禁 section 互调）");
{
  // 红线语义：禁止「新增」window.__/root.__ 瞬态（写入），读取 app.js 已有全局（__newsSummary/__knowledge）属正常依赖
  for (const f of ["js/intel/sections/today.js", "js/intel/sections/index.js"]) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    const code = src.replace(/^\s*(\/\/|\*|\/\*).*$/gm, ""); // 去注释行后判定
    ok(!/(window|root)\s*\.\s*__[A-Za-z_]+\s*=[^=]/.test(code), f + " 未新增 window.__ 瞬态（无写入）");
    ok(!/DB\.data\s*\.\w+\s*=/.test(code), f + " 未直写 DB.data（写操作走子系统）");
  }
  const tsrc = fs.readFileSync(path.join(ROOT, "js/intel/sections/today.js"), "utf8");
  ok(/registerIntelSection_today/.test(tsrc), "today.js 暴露 registerIntelSection_today（index.js 显式收集）");
}

// ============ 结果 ============
console.log("\n========================================");
console.log("Sprint 2 sections 测试：通过 " + pass + " / 失败 " + fail);
console.log("========================================");
process.exit(fail > 0 ? 1 : 0);
