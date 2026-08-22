// 返回按钮导航回归测试：微信式「统一视图栈」——路由与子页签都压栈，返回恰好回退一层并恢复上一层视图
// 运行：node tests/nav_back.test.js
// 说明：直接从 js/app.js 抽取真实的 SUBVIEW_REGISTRY / setSubView / goBack 源码执行，
//       用 mock 的 navStack / currentRoute / render / navigate 驱动，验证微信式逐层返回。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const appSrc = fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8");

// 抽取真实的导航源码片段（从 SUBVIEW_REGISTRY 到 goBack 结束，位于 setFilter 之前）
const start = appSrc.indexOf("var SUBVIEW_REGISTRY");
const end = appSrc.indexOf("function setFilter");
if (start < 0 || end < 0) { console.error("✗ 未能在 app.js 中定位导航源码片段"); process.exit(1); }
const navSrc = appSrc.slice(start, end);

// ---- Mock 运行环境 ----
let renderCount = 0;
const navCalls = [];
let closeModalCalled = false;
let modalActive = false;

const sandbox = {
  window: {},                     // window.__insightsView / __competitorSub / __videosView
  industrySub: "news",            // 直接变量（与 app.js 一致）
  AudioSync: (function () { let s = "home"; return { getSub: () => s, setSub: v => { s = v; } }; })(),
  navStack: [],
  currentRoute: "home",
  render: function () { renderCount++; },
  navigate: function (route, opts) {
    navCalls.push({ route: route, opts: opts || {} });
    if (!(opts && opts.replace) && route !== sandbox.currentRoute) {
      sandbox.navStack.push(sandbox.currentRoute);
    }
    sandbox.currentRoute = route;
  },
  closeModal: function () { closeModalCalled = true; },
  document: {
    getElementById: function (id) {
      if (id === "modal-overlay") {
        return { classList: { contains: function (c) { return c === "active" && modalActive; } } };
      }
      return null;
    }
  },
  console, JSON, Object, Array, String, Number, Math, parseInt, parseFloat
};
vm.createContext(sandbox);
vm.runInContext(navSrc, sandbox);

const { SUBVIEW_REGISTRY, setSubView, goBack } = sandbox;

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error("  ✗ " + msg); } }
function eq(a, b, msg) { ok(a === b, msg + "（期望 " + JSON.stringify(b) + "，实际 " + JSON.stringify(a) + "）"); }
function section(name) { console.log("\n▶ " + name); }

function reset(opts) {
  opts = opts || {};
  renderCount = 0; closeModalCalled = false; modalActive = false; navCalls.length = 0;
  sandbox.navStack.length = 0;
  if (opts.navStack) opts.navStack.forEach(r => sandbox.navStack.push(r));
  sandbox.currentRoute = opts.route || "home";
  sandbox.window = {};
  sandbox.industrySub = "news";
  sandbox.AudioSync.setSub("home");
}

(function () {
  section("A. 需求洞察 → 需求挖掘：返回逐层回父级（微信式一层一层）");
  reset({ route: "insights", navStack: ["home"] });
  sandbox.window.__insightsView = "list";
  setSubView("insights", "demand");
  eq(sandbox.window.__insightsView, "demand", "切到需求挖掘");
  eq(sandbox.navStack.length, 2, "子页签切换压栈一层");
  goBack();
  eq(sandbox.window.__insightsView, "list", "第一次返回：回到父级「我的洞察」");
  eq(sandbox.currentRoute, "insights", "仍停留在 insights 模块");
  goBack();
  eq(sandbox.currentRoute, "home", "第二次返回：回到首页");

  section("B. 恢复「上一层那个子页签」，而非默认（微信核心语义）");
  reset({ route: "insights", navStack: ["home"] });
  sandbox.window.__insightsView = "list";
  setSubView("insights", "mr");
  setSubView("insights", "demand");
  goBack();
  eq(sandbox.window.__insightsView, "mr", "从 demand 返回应回到上一层的 mr，而不是默认 list");
  goBack();
  eq(sandbox.window.__insightsView, "list", "从 mr 返回回到 list");
  goBack();
  eq(sandbox.currentRoute, "home", "从 list 返回回到首页");

  section("C. 默认视图（list）直接返回 → 首页");
  reset({ route: "insights", navStack: ["home"] });
  sandbox.window.__insightsView = "list";
  goBack();
  eq(sandbox.currentRoute, "home", "list 默认视图返回直达首页");
  ok(sandbox.navStack.length === 0, "栈已清空");

  section("D. 行业情报 → 我的产出（outputs）两级返回");
  reset({ route: "industry", navStack: ["home"] });
  setSubView("industry", "outputs");
  eq(sandbox.industrySub, "outputs", "切到 outputs");
  goBack();
  eq(sandbox.industrySub, "news", "返回恢复到上一层的 news");
  goBack();
  eq(sandbox.currentRoute, "home", "再返回回首页");

  section("E. 竞品研判 → Amazon 调研 两级返回");
  reset({ route: "competitors", navStack: ["home"] });
  setSubView("competitors", "amazon");
  goBack();
  eq(sandbox.window.__competitorSub, "list", "回到 list");
  eq(sandbox.currentRoute, "competitors", "停留在 competitors 模块");
  goBack();
  eq(sandbox.currentRoute, "home", "再返回回首页");

  section("F. 语言/视频 → 小红书爆款笔记 两级返回");
  reset({ route: "videos", navStack: ["home"] });
  setSubView("videos", "xhs");
  goBack();
  eq(sandbox.window.__videosView, "list", "回到 list");
  goBack();
  eq(sandbox.currentRoute, "home", "再返回回首页");

  section("G. 熏听同步 → 素材管理/设置 两级返回");
  reset({ route: "rsync", navStack: ["growth"] });
  setSubView("rsync", "settings");
  eq(sandbox.AudioSync.getSub(), "settings", "切到设置");
  goBack();
  eq(sandbox.AudioSync.getSub(), "home", "返回恢复到 home");
  eq(sandbox.currentRoute, "rsync", "停留在 rsync 模块");
  goBack();
  eq(sandbox.currentRoute, "growth", "再返回回到 growth 父级");

  section("H. 相同子页签重复点击：不压栈");
  reset({ route: "insights", navStack: ["home"] });
  sandbox.window.__insightsView = "list";
  setSubView("insights", "list");
  eq(sandbox.navStack.length, 1, "点击当前子页签不压栈");
  goBack();
  eq(sandbox.currentRoute, "home", "直接返回首页");

  section("I. 路由与子页签交叉（微信栈完整还原）");
  reset({ route: "insights", navStack: ["home"] });
  sandbox.window.__insightsView = "list";
  setSubView("insights", "demand");                 // home → insights → demand
  sandbox.navigate("home");                          // 直接切回首页（模拟其它入口）
  eq(sandbox.currentRoute, "home", "切回首页");
  goBack();                                          // 返回最近一层：insights
  eq(sandbox.currentRoute, "insights", "回到 insights");
  eq(sandbox.window.__insightsView, "demand", "且保留当时所在的需求挖掘（微信恢复页面状态）");
  goBack();
  eq(sandbox.window.__insightsView, "list", "再返回：需求挖掘 → 我的洞察");
  goBack();
  eq(sandbox.currentRoute, "home", "最后回到首页");

  section("J. 无子视图且栈为空：非首页 → 回首页");
  reset({ route: "settings", navStack: [] });
  goBack();
  eq(sandbox.currentRoute, "home", "应回首页");

  section("K. 弹窗打开时返回：仅关闭弹窗，不动路由");
  reset({ route: "insights", navStack: ["home"] });
  sandbox.window.__insightsView = "demand";
  modalActive = true;
  goBack();
  ok(closeModalCalled, "弹窗激活时应调用 closeModal");
  eq(sandbox.currentRoute, "insights", "路由未变");
  eq(sandbox.window.__insightsView, "demand", "子视图未变");
})();

console.log("\n通过 " + pass + " / " + (pass + fail) + (fail ? "  ❌ 有失败" : "  ✅ 全部通过"));
process.exit(fail ? 1 : 0);
