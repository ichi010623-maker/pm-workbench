// 投资理财 · 每日财经新闻 模块自动化测试
// 运行：node tests/investnews.test.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");

const NEWS_FIX = {
  generatedAt: "2026-08-08T21:43:32+08:00",
  categories: [
    { key: "finance", label: "财经新闻", icon: "💰" },
    { key: "cctv", label: "央视财经", icon: "📺" },
    { key: "intlfin", label: "国际金融", icon: "🌐" },
    { key: "world", label: "国际局势", icon: "🌍" },
    { key: "official", label: "官媒热点", icon: "🏛️" }
  ],
  items: [
    { id: "f1", category: "finance", priority: 1, title: "A股站上3940点", summary: "摘要A", source: "新浪财经", url: "https://a.com", pubTime: "09:00", tags: ["A股"] },
    { id: "f2", category: "finance", priority: 2, title: "央行连续增持黄金", summary: "摘要B", source: "财联社", url: "https://b.com", pubTime: "10:00" },
    { id: "c1", category: "cctv", priority: 3, title: "央视财经：服务消费回暖", summary: "摘要C", source: "央视", url: "https://c.com" },
    { id: "i1", category: "intlfin", priority: 4, title: "美联储非农减少2.3万", summary: "摘要D", source: "Reuters", url: "https://d.com" },
    { id: "w1", category: "world", priority: 5, title: "霍尔木兹谈判取得进展", summary: "摘要E", source: "The Hindu", url: "https://e.com" },
    { id: "o1", category: "official", priority: 1, title: "官媒头条（不应出现在财经新闻）", summary: "摘要X", source: "人民日报", url: "https://x.com" }
  ]
};

let toastLog = [];
let modalLog = [];
let aiCfg = { apiKey: "test-key", provider: "gemini", webSearch: true };

const sandbox = {
  window: {},
  DB: { data: { growth: {} }, save() {} },
  LiveData: { news: NEWS_FIX },
  document: {
    getElementById: (id) => (id === "app-content" ? { innerHTML: "", scrollTop: 0 } : null),
    querySelector: () => null, querySelectorAll: () => []
  },
  escapeHtml: s => (s == null ? "" : String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")),
  uid: () => "dn" + Math.random().toString(36).slice(2, 9),
  today: () => "2026-08-08",
  render() {}, renderInvest() {}, navigate() {}, closeModal() {},
  showToast: (m, t) => { toastLog.push({ m: m, t: t }); },
  showModal: h => { modalLog.push(h); },
  saveAiConfig: c => { aiCfg = c || {}; },
  loadAiConfig: () => aiCfg,
  // intel.js 同款解析函数（供 invest.js 复用）
  parseIntelLLM: text => {
    let s = String(text).trim();
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    const a = s.indexOf("{"), b = s.lastIndexOf("}");
    if (a < 0 || b < 0 || b < a) throw new Error("未找到 JSON 对象");
    return JSON.parse(s.slice(a, b + 1));
  },
  intelExtractTextLinks: text => {
    const out = [];
    const re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
    let m;
    while ((m = re.exec(text || ""))) {
      const url = m[2], title = m[1] || url;
      if (url && !out.some(x => x.url === url)) out.push({ title: title, url: url });
    }
    return out;
  },
  callLLMForPrompt: async (provider, apiKey, prompt) => ({
    text: JSON.stringify({
      summary: "执行摘要：宏观政策宽松，金价走高，出口强劲。",
      keyPoints: ["A股站上3940", "央行连续增持黄金"],
      themes: [
        { theme: "资本市场", items: [{ title: "A股站上3940点", time: "09:00", source: "新浪财经", url: "https://a.com", digest: "A股放量上行，站上3940点，成交活跃。", soWhat: "市场风险偏好回升，关注量能持续性。" }] },
        { theme: "货币黄金", items: [{ title: "央行连续增持黄金", time: "10:00", source: "财联社", url: "https://b.com", digest: "央行连续21个月增持黄金。", soWhat: "官方配置避险需求上升。" }] }
      ],
      signals: ["金价走强"],
      sources: [{ title: "来源A", url: "https://a.com" }]
    }),
    sources: [{ title: "联网来源", url: "https://grounding.com" }]
  }),
  INTEL_PROVIDERS: {
    gemini: { label: "Gemini", search: true, buildBodyForPrompt: () => ({}) }
  },
  console, JSON, Object, Array, String, Number, Math, Date, parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, "js", "invest.js"), "utf8"), sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, "js", "aioutputs.js"), "utf8"), sandbox);

const {
  ensureInvest, invNewsItems, renderInvestNews, setInvNewsCat, invNewsBuildPrompt,
  invNormalizeDigest, invNewsSaveDigest, invNewsToday, invNewsDigestBodyHtml,
  invNewsReportHtmlForHub, invGenNewsDigest, invNewsProviderOptions, invToggleWs
} = sandbox;
const {
  AI_OUTPUT_MODULES, aiOutputTitle, aiOutputSummary, aiOutputModel, aiOutputViewHtml, aiOutputList
} = sandbox;

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error("  ✗ " + msg); } }
function section(name) { console.log("\n▶ " + name); }

function reset() {
  toastLog = []; modalLog = [];
  sandbox.DB.data.growth = {};
  sandbox.window.__invNewsCat = null;
  sandbox.investTab = "news"; // 让内部 renderInvest 停留在财经新闻 tab（避免图表 DOM 依赖）
  aiCfg = { apiKey: "test-key", provider: "gemini", webSearch: true };
}

(async function () {
  section("A. 数据种子与过滤");
  reset();
  var inv = ensureInvest();
  ok(Array.isArray(inv.dailyNews), "ensureInvest 种子含 dailyNews 数组");
  delete inv.dailyNews;
  ok(Array.isArray(ensureInvest().dailyNews), "老数据兼容：缺失时补 dailyNews 数组");
  var items = invNewsItems();
  ok(items.length === 5, "invNewsItems 只取 财经/央视/国际金融/国际局势（实际 " + items.length + "）");
  ok(!items.some(n => n.category === "official"), "官媒热点不在财经新闻列表");

  section("B. 数据驱动渲染");
  reset();
  var html = renderInvestNews(inv);
  ok(html.indexOf("每日财经新闻") >= 0, "渲染含标题「每日财经新闻」");
  ok(html.indexOf("A股站上3940点") >= 0, "渲染含财经新闻条目");
  ok(html.indexOf("官媒头条") < 0, "渲染不含官媒条目");
  ok(html.indexOf("央视财经") >= 0, "渲染含央视财经分类");
  ok(html.indexOf("不构成投资建议") >= 0, "渲染含免责声明");
  ok(html.indexOf("AI 深度摘要") >= 0, "未生成时显示 AI 生成入口");
  ok(html.indexOf("inv-news-provider") >= 0, "生成入口含模型下拉");
  sandbox.LiveData.news = null;
  var empty = renderInvestNews(inv);
  ok(empty.indexOf("empty-state") >= 0, "无新闻数据时显示空状态");
  sandbox.LiveData.news = NEWS_FIX;
  setInvNewsCat("finance");
  ok(sandbox.window.__invNewsCat === "finance", "setInvNewsCat 更新分类状态");
  setInvNewsCat("all");

  section("C. AI 深度摘要管线");
  reset();
  var prompt = invNewsBuildPrompt(items);
  ok(prompt.indexOf("A股站上3940点") >= 0, "prompt 含新闻上下文");
  ok(prompt.indexOf("所以呢") >= 0, "prompt 要求「所以呢」");
  ok(prompt.indexOf("keyPoints") >= 0 && prompt.indexOf("themes") >= 0, "prompt 含 JSON 结构要求");
  var parsed = JSON.parse(prompt.indexOf("KEY") < 0 ? "{}" : "{}");
  var norm = invNormalizeDigest({
    summary: "摘要",
    keyPoints: ["K1", "", "K2"],
    themes: [
      { theme: "资本市场", items: [{ title: "T1", digest: "D1", soWhat: "S1" }] },
      { theme: "空主题", items: [] },
      { items: [{ title: "T2" }] }
    ],
    signals: ["信号1"],
    sources: [{ title: "来源A", url: "https://a.com" }]
  }, { provider: "gemini", date: "2026-08-08", text: "正文 [链接](https://text.com)", sources: [{ title: "联网来源", url: "https://grounding.com" }] });
  ok(norm.keyPoints.length === 2, "keyPoints 过滤空值（实际 " + norm.keyPoints.length + "）");
  ok(norm.themes.length === 2, "themes 过滤空主题（实际 " + norm.themes.length + "）");
  ok(norm.themes[0].items[0].soWhat === "S1", "主题条目含 soWhat");
  ok(norm.sources.some(s => s.url === "https://grounding.com"), "合并 API 返回来源");
  ok(norm.sources.some(s => s.url === "https://text.com"), "合并正文 markdown 链接");
  ok(norm.sources.filter(s => s.url === "https://a.com").length === 1, "来源去重");

  section("D. 落库与当日摘要");
  reset();
  var rec = invNormalizeDigest({ summary: "S", keyPoints: ["K"], themes: [{ theme: "T", items: [{ title: "X" }] }] }, { provider: "gemini", date: "2026-08-08" });
  invNewsSaveDigest(rec);
  ok(invNewsToday() && invNewsToday().id === rec.id, "invNewsToday 命中当日摘要");
  for (var i = 0; i < 35; i++) invNewsSaveDigest(invNormalizeDigest({ summary: "S" }, { provider: "g", date: "2026-08-0" + (i % 9 + 1) }));
  ok(inv.dailyNews.length <= 30, "dailyNews cap 30（实际 " + inv.dailyNews.length + "）");
  var body = invNewsDigestBodyHtml(rec);
  ok(body.indexOf("所以呢") < 0 && body.indexOf("K") >= 0, "摘要正文渲染 keyPoints");
  var hubHtml = invNewsReportHtmlForHub(rec);
  ok(hubHtml.length > 0, "hub 渲染器可用");

  section("E. 我的产出 hub 接入");
  reset();
  var hubRec = invNormalizeDigest({ summary: "hub摘要", keyPoints: ["K"], themes: [{ theme: "T", items: [{ title: "X" }] }] }, { provider: "gemini", date: "2026-08-08" });
  invNewsSaveDigest(hubRec);
  ok(AI_OUTPUT_MODULES.some(m => m.source === "investnews"), "AI_OUTPUT_MODULES 含 investnews 源");
  ok(aiOutputTitle("investnews", { date: "2026-08-08" }).indexOf("财经新闻摘要") >= 0, "hub 标题");
  ok(aiOutputSummary("investnews", { summary: "执行摘要abc" }).indexOf("执行摘要") >= 0, "hub 摘要");
  ok(aiOutputModel("investnews", { provider: "gemini" }) === "gemini", "hub 模型");
  var vh = aiOutputViewHtml("investnews", hubRec);
  ok(vh.length > 0, "hub 查看渲染 investnews");
  ok(aiOutputList().some(x => x.source === "investnews"), "aiOutputList 含 investnews");

  section("F. AI 生成主流程（stub LLM）");
  reset();
  await invGenNewsDigest();
  var todayRec = invNewsToday();
  ok(todayRec && todayRec.summary.indexOf("执行摘要") >= 0, "生成成功并落库当日摘要");
  ok(ensureInvest().dailyNews.length === 1, "dailyNews 恰好 1 条");
  ok(toastLog.some(t => (t.m || "").indexOf("已生成") >= 0), "生成成功 toast");
  ok(invNewsProviderOptions().length >= 1, "模型下拉至少一个选项");

  section("G. 联网开关");
  reset();
  var btn = { textContent: "" };
  invToggleWs(btn);
  ok(btn.textContent.indexOf("🚫") >= 0, "开启状态 → 点击后关闭联网");
  invToggleWs(btn);
  ok(btn.textContent.indexOf("🌐") >= 0, "关闭状态 → 点击后恢复联网");
})()
  .then(() => { console.log("\n通过 " + pass + " / " + (pass + fail) + (fail ? "  ❌ 有失败" : "  ✅ 全部通过")); process.exit(fail ? 1 : 0); })
  .catch(e => { console.error("测试运行异常：", e); process.exit(1); });
