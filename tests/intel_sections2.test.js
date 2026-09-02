// Sprint 4-6：PM Insight / SectionShell / 主题 sections 测试（Node vm 沙箱，不触网）
// 运行：node tests/intel_sections2.test.js
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
    navigate() {}, render() {}, today: () => "2026-09-02", showToast() {}, showModal() {}, closeModal() {},
    LiveData: { news: null },
    fetch: () => Promise.resolve({ json: () => Promise.resolve({}), ok: false }),
    DB: { data: { industryPMInsight: [] }, save() {}, logActivity() {} },
    localStorage: (function () { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; })(),
    INTEL_PROVIDERS: { gemini: { name: "Gemini" }, zhipu: { name: "智谱 GLM" } },
    loadAiConfig: () => ({ provider: "gemini", key: "k" }),
    saveAiConfig() {},
    callLLMForPrompt: async () => ({ text: '{"title":"今日AI","summary":"AI加速","signals":["s1"],"impacts":["i1"],"actions":["a1"]}' }),
    Math, Date, JSON, Object, Array, String, Number, parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent
  };
  sb.window = sb;
  vm.createContext(sb);
  return sb;
}
function loadFiles(sb, files) {
  files.forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sb, { filename: f }));
  return sb;
}
// 标准加载链：state → shell → 各 section → index
const BASE = [
  "js/intel/state.js",
  "js/intel/sections/shell.js",
  "js/intel/sections/today.js",
  "js/intel/sections/pm.js",
  "js/intel/sections/world.js",
  "js/intel/sections/finance.js",
  "js/intel/sections/ai.js",
  "js/intel/sections/tech.js",
  "js/intel/sections/industry.js",
  "js/intel/sections/index.js"
];

// 注入当日资讯（分类混合，覆盖各主题关键词）
function injectNews(sb) {
  sb.LiveData.news = {
    generatedAt: "2026-09-02T07:00:00+08:00",
    categories: [
      { key: "official", label: "官媒热点" }, { key: "hardware", label: "消费电子" },
      { key: "ai", label: "AI" }, { key: "tech", label: "科技前沿" }
    ],
    items: [
      { id: "n1", category: "official", priority: 5, title: "美国宣布对华出口管制新规", summary: "涉及半导体设备与材料", source: "源A" },
      { id: "n2", category: "official", priority: 5, title: "国务院发布人工智能行动计划", summary: "推动 AI 与实体经济融合", source: "源B" },
      { id: "n3", category: "hardware", priority: 4, title: "华为发布折叠屏新机", summary: "供应链国产化率提升", source: "源C" },
      { id: "n4", category: "hardware", priority: 3, title: "某电池厂商完成 C 轮融资", summary: "估值 100 亿，扩产储能电池", source: "源D" },
      { id: "n5", category: "ai", priority: 4, title: "国产大模型发布多模态版本", summary: "支持图片视频理解", source: "源E" },
      { id: "n6", category: "tech", priority: 3, title: "量子通信卫星地面站建成", summary: "量子通信网络里程碑", source: "源F" },
      { id: "n7", category: "tech", priority: 2, title: "5G 毫米波芯片研发成功", summary: "全球首款", source: "源G" },
      { id: "n8", category: "hardware", priority: 2, title: "苹果智能手表出货超预期", summary: "可穿戴市场回暖", source: "源H" }
    ]
  };
}

// ============ A. 注册：5 主题 + PM 全注册 ============
section("A. Sprint 4-6 注册完整性");
{
  const sb = loadFiles(makeSandbox(), BASE);
  const reg = vm.runInContext("collectIntelSections()", sb);
  ok(!!reg.pm, "PM Insight section 已注册");
  ok(!!reg.world && !!reg.finance && !!reg.ai && !!reg.tech && !!reg.industry, "5 个主题 section 全部注册");
  ok(reg.pm.label === "💼 PM Insight", "PM label 正确");
  const keys = Object.keys(reg);
  ok(keys.indexOf("today") < keys.indexOf("pm") && keys.indexOf("pm") < keys.indexOf("world"), "导航顺序 Today → PM → World…");
  // requires 声明
  ok(Array.isArray(reg.world.requires) && reg.world.requires.indexOf("liveData.news") >= 0, "world requires 声明 liveData.news");
  ok(reg.pm.requires.indexOf("llm.client") >= 0, "pm requires 声明 llm.client");
}

// ============ B. SectionShell 分流逻辑 ============
section("B. shellGroupNews 关键词分流");
{
  const sb = loadFiles(makeSandbox(), BASE);
  injectNews(sb);
  // world 配置
  const g = vm.runInContext("shellGroupNews({ subGroups:[{key:'trade',label:'贸易',words:['美国','出口管制']},{key:'o',label:'出海',words:['出海']}], include:['国际','全球'], exclude:[] })", sb);
  ok(g.groups.length >= 1, "world 有命中组");
  const trade = g.groups.find(x => x.key === "trade");
  ok(!!trade && trade.items.some(i => i.title.indexOf("出口管制") >= 0), "贸易组命中出口管制条目");
  // priority 排序：组内 priority 5 在前
  ok(g.groups.every(x => { for (let i = 1; i < x.items.length; i++) if ((x.items[i].priority || 5) > (x.items[i - 1].priority || 5)) return false; return true; }), "各组内按 priority 降序");
}

// ============ C. 主题 section 渲染 ============
section("C. 主题 section render（有数据）");
{
  const sb = loadFiles(makeSandbox(), BASE);
  injectNews(sb);
  // world：命中 n1（美国/出口管制）与 trade 组
  const wHtml = vm.runInContext("collectIntelSections().world.render({})", sb);
  ok(wHtml.indexOf("出口管制新规") >= 0, "world 渲染含美国出口管制");
  ok(wHtml.indexOf("filter-bar") >= 0 && wHtml.indexOf("全部") >= 0, "world 含分类 chips");
  ok(wHtml.indexOf("lg-card") >= 0, "world 用卡片列表");
  // finance：命中 n4（融资/估值）
  const fHtml = vm.runInContext("collectIntelSections().finance.render({})", sb);
  ok(fHtml.indexOf("C 轮融资") >= 0, "finance 渲染含电池融资条目");
  // industry：命中 n3 华为折叠屏（手机组）
  const iHtml = vm.runInContext("collectIntelSections().industry.render({})", sb);
  ok(iHtml.indexOf("折叠屏") >= 0 || iHtml.indexOf("华为") >= 0, "industry 渲染含折叠屏/华为");
  // ai：命中 n5（大模型/多模态）
  const aHtml = vm.runInContext("collectIntelSections().ai.render({})", sb);
  ok(aHtml.indexOf("多模态") >= 0, "ai 渲染含大模型多模态");
}

// ============ D. 主题 section 空态降级（无匹配） ============
section("D. 主题 section 空态降级");
{
  const sb = loadFiles(makeSandbox(), BASE);
  // 无资讯数据
  const html1 = vm.runInContext("collectIntelSections().world.render({})", sb);
  ok(html1.indexOf("数据未就绪") >= 0 || html1.indexOf("暂无匹配") >= 0, "无 LiveData 时 world 优雅空态");
  // 有资讯但无匹配关键词
  sb.LiveData.news = { generatedAt: "2026-09-02T07:00:00+08:00", categories: [], items: [{ id: "x1", category: "official", priority: 5, title: "无关民生新闻", summary: "与硬件无关" }] };
  const html2 = vm.runInContext("collectIntelSections().world.render({})", sb);
  ok(html2.indexOf("暂无匹配") >= 0, "有资讯但无关键词命中 → 空态提示");
}

// ============ E. PM Insight 空态（生成入口） ============
section("E. PM Insight 无缓存 → 生成入口");
{
  const sb = loadFiles(makeSandbox(), BASE);
  injectNews(sb);
  const html = vm.runInContext("collectIntelSections().pm.render({})", sb);
  ok(html.indexOf("AI 解读今日情报") >= 0, "无缓存显示生成入口标题");
  ok(html.indexOf("pm-prov") >= 0 && html.indexOf("pm-key") >= 0, "含模型/Key 选择（复用 AI 配置 UI）");
  ok(html.indexOf("pmGenerateInsight") >= 0, "含生成按钮");
}

// ============ F. PM Insight 生成 → 缓存展示 ============
section("F. PM Insight 生成并缓存展示");
{
  const sb = loadFiles(makeSandbox(), BASE);
  injectNews(sb);
  // 模拟用户点生成：直接调 pmGenerateInsight（DOM stub 提供控件值）
  const getEl = id => ({ value: id === "pm-prov" ? "gemini" : (id === "pm-key" ? "test-key" : ""), checked: false, style: {} });
  sb.document.getElementById = getEl;
  vm.runInContext("pmGenerateInsight()", sb).then(() => {
    // 已缓存
    const cache = vm.runInContext("pmCacheToday()", sb);
    ok(!!cache && cache.date === "2026-09-02", "生成后当日缓存存在");
    ok(cache.signals && cache.signals.length >= 1, "解析出 signals 数组");
    ok(cache.refTitles && cache.refTitles.length >= 1, "记录参考条目标题");
    // 渲染展示
    const html = vm.runInContext("collectIntelSections().pm.render({})", sb);
    ok(html.indexOf("宏观信号") >= 0, "展示宏观信号区块");
    ok(html.indexOf("行动建议") >= 0, "展示行动建议区块");
    ok(html.indexOf("重新生成") >= 0, "含重新生成入口");
  }).catch(e => { console.error("err", e); ok(false, "pmGenerateInsight 不抛错"); }).then(() => finish());
}

// ============ G. 契约红线 ============
section("G. 契约红线（新 section 无 window.__ 散落）");
{
  for (const f of ["shell.js", "pm.js", "world.js", "finance.js", "ai.js", "tech.js", "industry.js"]) {
    const src = fs.readFileSync(path.join(ROOT, "js/intel/sections", f), "utf8");
    const code = src.replace(/^\s*(\/\/|\*|\/\*).*$/gm, "");
    ok(!/(window|root)\s*\.\s*__[A-Za-z_]+\s*=[^=]/.test(code), f + " 未新增 window.__ 瞬态写入");
  }
  const pmsrc = fs.readFileSync(path.join(ROOT, "js/intel/sections/pm.js"), "utf8");
  ok(/registerIntelSection_pm/.test(pmsrc), "pm.js 暴露 registerIntelSection_pm");
  ok(/registerIntelSection_world/.test(fs.readFileSync(path.join(ROOT, "js/intel/sections/world.js"), "utf8")), "world.js 暴露 registerIntelSection_world");
}

let finished = false;
function finish() {
  if (finished) return; finished = true;
  console.log("\n========================================");
  console.log("Sprint 4-6 sections 测试：通过 " + pass + " / 失败 " + fail);
  console.log("========================================");
  process.exit(fail > 0 ? 1 : 0);
}
// 同步部分完成后若没有异步挂起也收尾
setTimeout(finish, 1500);