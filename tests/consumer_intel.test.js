// Consumer Intelligence 模块测试 · v5.9.116
// 验证：数据 schema、6 项严格计数、Pain Status A-F、Evidence Level E1-E6、视图渲染、3 层分离、Insight-证据可追溯
const fs = require("fs");
const vm = require("vm");

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + msg); } }
function section(t) { console.log("\n▶ " + t); }

const CI_JS = fs.readFileSync("/Users/ichi/WorkBuddy/2026-07-30-21-36-02/pm-workbench-auto/js/consumer.js", "utf8");
const SEED = JSON.parse(fs.readFileSync("/Users/ichi/WorkBuddy/2026-07-30-21-36-02/pm-workbench-auto/data/consumer_intel.json", "utf8"));

function mkSandbox() {
  const m = {};
  const fakeEl = { innerHTML: "", querySelector: () => null, querySelectorAll: () => [], style: {}, value: "", classList: { add() {}, remove() {}, contains: () => false } };
  const containers = { "app-content": fakeEl };
  const sb = {
    console,
    Math, Date, JSON, Object, Array, String, Number, parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent, setInterval, clearInterval, setTimeout, clearTimeout,
    addEventListener() {}, removeEventListener() {},
    document: { getElementById: id => containers[id] || fakeEl, querySelector: () => null, querySelectorAll: () => [], addEventListener: (n, fn) => { m[n] = m[n] || []; m[n].push(fn); }, hidden: false, readyState: "complete" },
    window: { addEventListener: (n, fn) => { m["w_" + n] = m["w_" + n] || []; m["w_" + n].push(fn); } },
    localStorage: (function () { const store = { "ci_seed_loaded": "1" }; return { getItem: k => k in store ? store[k] : null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } }; })(),
    escapeHtml: s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"),
    showToast() {}, showModal() {}, closeModal() {}, navigate() {}, render() {},
    today: () => "2026-09-11",
    prompt: () => null,
    DB: { data: { consumerIntel: { researches: [] }, growth: { language: { en: {} } } }, save() {}, logActivity() {} },
    fetch: () => Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve("") })
  };
  sb.window.document = sb.document;
  sb.window = sb; // self-reference so consumer.js IIFE can write to global scope via window.xxx
  vm.createContext(sb);
  return sb;
}

// ============ A. 种子数据 schema 完整性 ============
section("A. 种子数据完整性");
{
  ok(SEED && SEED.researches && SEED.researches.length === 1, "seed 含 1 个研究");
  var r = SEED.researches[0];
  ok(r.subject === "MagSafe 手机散热器", "subject 正确");
  ok(r.targetUsers && r.targetUsers.length > 0, "targetUsers 完整");
  ok(r.platforms.length === 5, "5 平台齐全");
  ok(r.evidence.length === 36, "evidence 数 = 36");
  ok(r.insights.length === 7, "insights 数 = 7");
  // evidence 字段必填
  var evFieldsOK = r.evidence.every(function (e) {
    return e.id && e.rawText && e.source && e.painStatus && e.evidenceLevel && e.sceneTag && e.publishDate;
  });
  ok(evFieldsOK, "每条 evidence 含 7 必填字段");
  // insight 引用证据必须存在
  var evIds = {};
  r.evidence.forEach(function (e) { evIds[e.id] = 1; });
  var allRefsOK = r.insights.every(function (ins) {
    return (ins.evidenceIds || []).every(function (eid) { return evIds[eid]; });
  });
  ok(allRefsOK, "所有 insight.evidenceIds 都能追溯到 evidence");
  // Pain Status 必须是 A-F
  var painOK = r.evidence.every(function (e) { return ["A", "B", "C", "D", "E", "F"].indexOf(e.painStatus) >= 0; });
  ok(painOK, "painStatus 全部 ∈ A-F");
  // Evidence Level 必须是 E1-E6
  var evOK = r.evidence.every(function (e) { return ["E1", "E2", "E3", "E4", "E5", "E6"].indexOf(e.evidenceLevel) >= 0; });
  ok(evOK, "evidenceLevel 全部 ∈ E1-E6");
}

// ============ B. 6 项严格计数（mention/unique/relevant/pain/seeking/switched） ============
section("B. ciRecomputeStats 6 项严格计数");
{
  const sb = mkSandbox();
  vm.runInContext(CI_JS, sb);
  // 直接用 seed
  vm.runInContext("DB.data.consumerIntel.researches = __seed.researches", Object.assign(sb, { __seed: SEED }));
  var stats = vm.runInContext("ciRecomputeStats(ciGetResearch('r_magsafe_cooler_2026'))", sb);
  ok(stats.totalRaw === 36, "totalRaw = 36 (实际 evidence 数)");
  ok(stats.uniqueUsers === 28, "uniqueUsers 去重后 = 28（< 36 体现去重）");
  ok(stats.relevantUsers === 25, "relevantUsers (E2+) = 25（< 28 排除纯情绪）");
  ok(stats.painConfirmed === 8, "painConfirmed (C+D) = 8");
  ok(stats.solutionSeeking === 5, "solutionSeeking = 5");
  ok(stats.switched === 13, "switched = 13（已购买/退货/弃用）");
  // 必须是对象类型且 6 字段齐全
  ok(typeof stats === "object" && Object.keys(stats).length === 6, "返回 6 字段对象");
  // 漏斗严格递减：提及 > 去重 > 相关 > 明确痛苦
  ok(stats.totalRaw > stats.uniqueUsers, "提及数 > 去重用户数（Mention ≠ Unique）");
  ok(stats.uniqueUsers >= stats.relevantUsers, "去重用户 ≥ 相关用户（排除纯情绪）");
  ok(stats.relevantUsers > stats.painConfirmed, "相关用户 > 明确痛苦（Mention ≠ Pain）");
}

// ============ C. 痛点状态分布 + 证据等级分布 ============
section("C. ciPainDistribution + ciEvidenceDistribution");
{
  const sb = mkSandbox();
  vm.runInContext(CI_JS, sb);
  vm.runInContext("DB.data.consumerIntel.researches = __seed.researches", Object.assign(sb, { __seed: SEED }));
  var pd = vm.runInContext("ciPainDistribution(ciGetResearch('r_magsafe_cooler_2026'))", sb);
  ok(Object.keys(pd).length === 6, "6 个状态键齐全");
  ok(pd.C >= 5 && pd.D >= 3, "C+D 比例合理 (C=" + pd.C + " D=" + pd.D + ")");
  ok(pd.E >= 10, "E（已行动）≥ 10 (当前=" + pd.E + ")");

  var ed = vm.runInContext("ciEvidenceDistribution(ciGetResearch('r_magsafe_cooler_2026'))", sb);
  ok(Object.keys(ed).length === 6, "6 个证据等级键齐全");
  ok(ed.E4 >= 8, "E4（问题+后果）≥ 8 (当前=" + ed.E4 + ")");
}

// ============ D. Top 场景聚合 ============
section("D. ciTopScenes");
{
  const sb = mkSandbox();
  vm.runInContext(CI_JS, sb);
  vm.runInContext("DB.data.consumerIntel.researches = __seed.researches", Object.assign(sb, { __seed: SEED }));
  var ts = vm.runInContext("ciTopScenes(ciGetResearch('r_magsafe_cooler_2026'), 5)", sb);
  ok(ts.length <= 5, "top 5 ≤ 5");
  ok(ts.length >= 3, "至少 3 个场景");
  ok(ts[0].count >= ts[ts.length - 1].count, "排序正确（降序）");
}

// ============ E. 视图渲染：list / research:ID ============
section("E. 渲染：list + research:ID");
{
  const sb = mkSandbox();
  vm.runInContext(CI_JS, sb);
  vm.runInContext("DB.data.consumerIntel.researches = __seed.researches; CI_VIEW='list'", Object.assign(sb, { __seed: SEED }));
  var html = vm.runInContext("(function(){ var c=document.getElementById('app-content'); c.innerHTML=''; renderConsumer(); return c.innerHTML; })()", sb);
  ok(html.indexOf("Consumer Intelligence") >= 0, "list 标题");
  ok(html.indexOf("MagSafe 手机散热器") >= 0, "list 含 demo 主题");
  ok(html.indexOf("ci-research-card") >= 0, "list 渲染 research card");
  ok(html.indexOf("ci-research-stats") >= 0, "list 含 6 项 stat 网格");
  ok(html.indexOf("+ 新建研究") >= 0, "list 含新建按钮");

  vm.runInContext("CI_VIEW='research:r_magsafe_cooler_2026'", sb);
  html = vm.runInContext("(function(){ var c=document.getElementById('app-content'); c.innerHTML=''; renderConsumer(); return c.innerHTML; })()", sb);
  ok(html.indexOf("ci-research-head") >= 0, "research 详情头部");
  ok(html.indexOf("ci-strict-stats") >= 0, "research 含 6 项严格计数");
  ok(html.indexOf("Mention · 提及次数") >= 0, "research 含 Mention 标签");
  ok(html.indexOf("Unique · 去重用户") >= 0, "research 含 Unique 标签");
  ok(html.indexOf("Pain-confirmed · 明确痛苦") >= 0, "research 含 Pain-confirmed 标签");
  ok(html.indexOf("Switched · 已购买/换") >= 0, "research 含 Switched 标签");
  ok(html.indexOf("ci-report") >= 0, "research 含 8 段报告容器");
  // 8 段报告
  ok(html.indexOf("01") >= 0 && html.indexOf("用户是谁") >= 0, "01 用户是谁");
  ok(html.indexOf("02") >= 0 && html.indexOf("用户在哪") >= 0 || html.indexOf("场景") >= 0, "02 场景");
  ok(html.indexOf("03") >= 0 && html.indexOf("用户遇到了什么") >= 0, "03 痛点");
  ok(html.indexOf("04") >= 0 && html.indexOf("痛点有多真实") >= 0, "04 痛点真实性");
  ok(html.indexOf("05") >= 0 && html.indexOf("现在怎么解决") >= 0, "05 现有方案");
  ok(html.indexOf("06") >= 0 && html.indexOf("生命周期") >= 0, "06 生命周期");
  ok(html.indexOf("07") >= 0 && html.indexOf("机会方向") >= 0, "07 机会");
  ok(html.indexOf("08") >= 0 && html.indexOf("Evidence") >= 0, "08 Evidence");
}

// ============ F. 3 层分离：Fact / Interpretation / Hypothesis ============
section("F. 3 层输出分离");
{
  const sb = mkSandbox();
  vm.runInContext(CI_JS, sb);
  vm.runInContext("DB.data.consumerIntel.researches = __seed.researches; CI_VIEW='research:r_magsafe_cooler_2026'", Object.assign(sb, { __seed: SEED }));
  var html = vm.runInContext("(function(){ var c=document.getElementById('app-content'); c.innerHTML=''; renderConsumer(); return c.innerHTML; })()", sb);
  ok(html.indexOf("事实 · FACT") >= 0, "含 FACT 层标签");
  ok(html.indexOf("解释 · INTERPRETATION") >= 0, "含 INTERPRETATION 层标签");
  ok(html.indexOf("假设 · HYPOTHESIS") >= 0, "含 HYPOTHESIS 层标签");
  ok(html.indexOf("ci-fact") >= 0, "FACT 类名");
  ok(html.indexOf("ci-inter") >= 0, "INTER 类名");
  ok(html.indexOf("ci-hypo") >= 0, "HYPO 类名");
}

// ============ G. Pain Lifecycle SVG ============
section("G. Pain Lifecycle SVG 流程图");
{
  const sb = mkSandbox();
  vm.runInContext(CI_JS, sb);
  vm.runInContext("DB.data.consumerIntel.researches = __seed.researches; CI_VIEW='research:r_magsafe_cooler_2026'", Object.assign(sb, { __seed: SEED }));
  var html = vm.runInContext("(function(){ var c=document.getElementById('app-content'); c.innerHTML=''; renderConsumer(); return c.innerHTML; })()", sb);
  ok(html.indexOf("ci-lifecycle-svg") >= 0, "lifecycle SVG 容器");
  ok(html.indexOf("<svg") >= 0, "SVG 元素存在");
  ok(html.indexOf("viewBox") >= 0, "SVG 含 viewBox");
  // 9 个 lifecycle 步骤 + 6 个状态标注都应渲染
  ok(html.indexOf("触发") >= 0 && html.indexOf("偶发不爽") >= 0, "lifecycle 步骤文字");
  ok(html.indexOf("A·") >= 0 && html.indexOf("C·") >= 0 && html.indexOf("E·") >= 0, "Pain Status 锚点");
}

// ============ H. Pain Status A-F 分布条 ============
section("H. Pain Status A-F 分布条");
{
  const sb = mkSandbox();
  vm.runInContext(CI_JS, sb);
  vm.runInContext("DB.data.consumerIntel.researches = __seed.researches; CI_VIEW='research:r_magsafe_cooler_2026'", Object.assign(sb, { __seed: SEED }));
  var html = vm.runInContext("(function(){ var c=document.getElementById('app-content'); c.innerHTML=''; renderConsumer(); return c.innerHTML; })()", sb);
  ok(html.indexOf("ci-pain-bars") >= 0, "pain 分布容器");
  ok(html.indexOf("随口吐槽") >= 0, "A 随口吐槽");
  ok(html.indexOf("短期不爽") >= 0, "B 短期不爽");
  ok(html.indexOf("持续困扰") >= 0, "C 持续困扰");
  ok(html.indexOf("强烈痛点") >= 0, "D 强烈痛点");
  ok(html.indexOf("已采取行动") >= 0, "E 已采取行动");
  ok(html.indexOf("已解决") >= 0, "F 已解决");
}

// ============ I. Evidence 库 + 筛选 ============
section("I. Evidence 库 + 筛选");
{
  const sb = mkSandbox();
  vm.runInContext(CI_JS, sb);
  vm.runInContext("DB.data.consumerIntel.researches = __seed.researches; CI_VIEW='research:r_magsafe_cooler_2026'", Object.assign(sb, { __seed: SEED }));
  var html = vm.runInContext("(function(){ var c=document.getElementById('app-content'); c.innerHTML=''; renderConsumer(); return c.innerHTML; })()", sb);
  ok(html.indexOf("ci-ev-list") >= 0, "evidence 列表");
  ok(html.indexOf("ci-ev-filters") >= 0, "evidence 筛选器");
  ok(html.indexOf("ci-ev-quote") >= 0, "evidence 引文");
  // evidence 至少展示 33 条（默认无筛选）
  var evCount = (html.match(/ci-ev-card/g) || []).length;
  ok(evCount >= 36, "默认展示 36 条 evidence（实际 " + evCount + "）");

  // 筛选：painStatus=C
  vm.runInContext("CI_FILTER.painStatus='C'", sb);
  html = vm.runInContext("(function(){ var c=document.getElementById('app-content'); c.innerHTML=''; renderConsumer(); return c.innerHTML; })()", sb);
  var evCountC = (html.match(/ci-ev-card/g) || []).length;
  ok(evCountC < 36 && evCountC > 0, "筛选 painStatus=C 后 evidence 数 < 36 (" + evCountC + ")");
}

// ============ J. Insight 详情视图 ============
section("J. Insight 详情视图");
{
  const sb = mkSandbox();
  vm.runInContext(CI_JS, sb);
  vm.runInContext("DB.data.consumerIntel.researches = __seed.researches; CI_VIEW='insight:r_magsafe_cooler_2026:ins_01'", Object.assign(sb, { __seed: SEED }));
  var html = vm.runInContext("(function(){ var c=document.getElementById('app-content'); c.innerHTML=''; renderConsumer(); return c.innerHTML; })()", sb);
  ok(html.indexOf("ci-insight-card") >= 0, "insight 大卡");
  ok(html.indexOf("ci-ins-rank-big") >= 0, "insight 排名徽章");
  ok(html.indexOf("户外连续拍摄") >= 0, "insight 标题");
  ok(html.indexOf("高频场景") >= 0, "insight 含场景段");
  ok(html.indexOf("痛点详情") >= 0, "insight 含痛点段");
  ok(html.indexOf("痛点持续性") >= 0, "insight 含 lifecycle");
  ok(html.indexOf("当前解决方案") >= 0, "insight 含现有方案");
  ok(html.indexOf("产品机会方向") >= 0, "insight 含机会");
  ok(html.indexOf("支撑证据") >= 0, "insight 含 evidence 段");
  ok(html.indexOf("ci-ev-card") >= 0, "insight 含至少 1 条证据");
}

// ============ K. 新建研究流程 ============
section("K. 新建研究流程");
{
  const sb = mkSandbox();
  vm.runInContext(CI_JS, sb);
  vm.runInContext("CI_VIEW='new'", sb);
  var html = vm.runInContext("(function(){ var c=document.getElementById('app-content'); c.innerHTML=''; renderConsumer(); return c.innerHTML; })()", sb);
  ok(html.indexOf("ci-subject") >= 0, "含 subject 输入");
  ok(html.indexOf("ci-users") >= 0, "含 users 输入");
  ok(html.indexOf("ci-plat") >= 0, "含平台 checkbox");
  ok(html.indexOf("ciCreateResearch") >= 0, "含创建函数引用");
}

// ============ L. 全局可访问：CI_VIEW / CI_FILTER / CI_PAIN_STATUS / CI_E_LEVEL ============
section("L. 全局 API");
{
  const sb = mkSandbox();
  vm.runInContext(CI_JS, sb);
  ok(sb.window.CI_VIEW !== undefined, "CI_VIEW 暴露");
  ok(sb.window.CI_FILTER !== undefined, "CI_FILTER 暴露");
  ok(sb.window.CI_PAIN_STATUS !== undefined, "CI_PAIN_STATUS 暴露");
  ok(sb.window.CI_E_LEVEL !== undefined, "CI_E_LEVEL 暴露");
  ok(sb.window.renderConsumer !== undefined, "renderConsumer 暴露");
  ok(sb.window.ciCreateResearch !== undefined, "ciCreateResearch 暴露");
  ok(typeof sb.window.renderConsumer === "function", "renderConsumer 是函数");
  // Pain Status 6 状态齐全
  var painKeys = Object.keys(sb.window.CI_PAIN_STATUS);
  ok(painKeys.length === 6, "CI_PAIN_STATUS 6 状态齐全");
  ok(painKeys.indexOf("A") >= 0 && painKeys.indexOf("F") >= 0, "含 A 和 F");
  // Evidence Level 6 等级齐全
  var evKeys = Object.keys(sb.window.CI_E_LEVEL);
  ok(evKeys.length === 6, "CI_E_LEVEL 6 等级齐全");
  ok(evKeys.indexOf("E6") >= 0, "含 E6 黄金证据");
}

// ============ M. 工作台首页接线（消费者洞察必须出现在首页模块网格） ============
section("M. 工作台首页接线");
{
  // 静态检查 app.js 的三处接线（首页 sections 网格 + 路由 case + 标题映射）
  const appJs = fs.readFileSync("/Users/ichi/WorkBuddy/2026-07-30-21-36-02/pm-workbench-auto/js/app.js", "utf8");
  ok(appJs.indexOf('case "consumer": renderConsumer();') >= 0, "navigate 路由含 case consumer");
  ok(appJs.indexOf('consumer: ["Consumer Intelligence"') >= 0, "moduleTitles 含 consumer 标题");
  ok(appJs.indexOf('id: "consumer", icon: "🧠", title: "消费者洞察"') >= 0, "首页 sections 网格含「消费者洞察」卡片");
  // 该卡片必须与「需求洞察」同区（工作模块区），而不是埋在被移除的成长 hub 里
  const insIdx = appJs.indexOf('title: "需求洞察"');
  const ciIdx = appJs.indexOf('title: "消费者洞察"');
  ok(insIdx >= 0 && ciIdx > insIdx, "「消费者洞察」紧跟「需求洞察」之后（同属工作模块区）");
  ok(appJs.indexOf('desc: "消费者洞察引擎') === -1, "成长 hub 中的重复卡片已移除");
  // index.html 必须加载模块脚本
  const idxHtml = fs.readFileSync("/Users/ichi/WorkBuddy/2026-07-30-21-36-02/pm-workbench-auto/index.html", "utf8");
  ok(idxHtml.indexOf("js/consumer.js") >= 0, "index.html 已加载 js/consumer.js");
}

console.log("\n=========================================");
console.log("v5.9.116 Consumer Intelligence 测试：通过 " + pass + " / 失败 " + fail);
console.log("=========================================");
process.exit(fail > 0 ? 1 : 0);