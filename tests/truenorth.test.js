// 需求洞察 · TrueNorth 产品方向校准 模块自动化测试
// 运行：node tests/truenorth.test.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");

let toastLog = [];
let aiCfg = { apiKey: "test-key", provider: "gemini", webSearch: true };
const savedFlag = { n: 0 };

const sandbox = {
  window: {},
  DB: { data: { growth: {} }, save() { savedFlag.n++; }, logActivity() {} },
  document: {
    getElementById: (id) => {
      if (id === "app-content") return { innerHTML: "", scrollTop: 0 };
      if (id === "tn-product") return { value: "面向新手妈妈的家用辅食机" };
      if (id === "tn-stage") return { value: "已有原型" };
      if (id === "tn-user") return { value: "新手妈妈" };
      if (id === "tn-confuse") return { value: "先做哪些功能" };
      if (id === "tn-known") return { value: "" };
      if (id === "tn-expect") return { value: "" };
      if (id === "tn-provider") return { value: "gemini" };
      return null;
    },
    querySelector: () => null, querySelectorAll: () => [],
    createElement: () => ({ href: "", download: "", click() {}, remove() {} }),
    body: { appendChild() {} }
  },
  escapeHtml: s => (s == null ? "" : String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")),
  uid: () => "tn" + Math.random().toString(36).slice(2, 9),
  today: () => "2026-08-08",
  render() {}, navigate() {}, closeModal() {},
  showModal() {}, showToast: (m) => { toastLog.push(m); },
  loadAiConfig: () => aiCfg,
  saveAiConfig: c => { aiCfg = c || {}; },
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
    while ((m = re.exec(text || ""))) { const url = m[2], title = m[1] || url; if (url && !out.some(x => x.url === url)) out.push({ title, url }); }
    return out;
  },
  callLLMForPrompt: async (provider, apiKey, prompt) => ({
    text: JSON.stringify({
      summary: "执行摘要：10 位模拟用户，关键发现 6 条，假设 4 条中 2 条支持。",
      research: "产品理解：面向新手妈妈的家用辅食机。",
      personas: [{ name: "焦虑的新手妈妈", demo: "28岁/全职/一线城市", scene: "早上8点厨房", pain: "辅食费时", alt: "成品辅食", intensity: "强", why: "访谈一致" }],
      hypotheses: [{ no: "H1", content: "新手妈妈愿意为省时付费", persona: "焦虑的新手妈妈", priority: "高", method: "问卷", ifFalse: "换目标用户" }],
      voices: [{ source: "小红书·辅食吐槽", quote: "每天做辅食太累了", signal: "痛点真实", hypothesis: "支持 H1" }],
      competitors: [{ name: "某辅食机", form: "App", review: "好用", pain: "贵", lesson: "主打性价比" }],
      trends: ["辅食自动化增长"],
      users: [{ no: 1, name: "王芳", match: "焦虑的新手妈妈·强匹配", profile: "28岁全职妈妈", personality: "爱操心", painScore: 4, payWilling: "100-300", answers: [{ q: "每天花多久做辅食？", a: "一小时，太累了" }], quote: "省时间最重要" }],
      hypothesisResults: [{ no: "H1", result: "支持", note: "7/10 愿付费" }],
      findings: [{ finding: "省时是核心", evidence: "8/10 提及" }],
      payAnalysis: "7 人愿付，平均 200 元。",
      deviation: "原始假设偏高端，真实更偏性价比。",
      opportunities: [{ direction: "主打省时", evidence: "高频提及", verify: "小范围预售" }],
      nextSteps: ["做 10 人访谈"],
      sources: [{ title: "来源A", url: "https://a.com" }]
    }),
    sources: [{ title: "联网来源", url: "https://grounding.com" }]
  }),
  INTEL_PROVIDERS: { gemini: { label: "Gemini", buildBodyForPrompt: () => ({}) } },
  console, JSON, Object, Array, String, Number, Math, Date, parseInt, parseFloat, encodeURIComponent, decodeURIComponent, URL, Blob
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, "js", "truenorth.js"), "utf8"), sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, "js", "aioutputs.js"), "utf8"), sandbox);

const {
  tnGet, tnSaveReport, tnBuildPrompt, tnNormalize, tnRenderReportBody,
  truenorthReportHtmlForHub, tnBuildMarkdown, tnRunResearch, tnToggleWs
} = sandbox;
const {
  AI_OUTPUT_MODULES, aiOutputTitle, aiOutputSummary, aiOutputModel, aiOutputViewHtml, aiOutputList
} = sandbox;

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error("  ✗ " + msg); } }
function section(name) { console.log("\n▶ " + name); }

function reset() {
  toastLog = []; savedFlag.n = 0;
  sandbox.DB.data = { growth: {} };
  aiCfg = { apiKey: "test-key", provider: "gemini", webSearch: true };
}

(async function () {
  section("A. 存储与 cap");
  reset();
  ok(Array.isArray(tnGet()), "tnGet 兜底返回数组");
  for (var i = 0; i < 35; i++) tnSaveReport({ id: "r" + i, product: "P" + i });
  ok(tnGet().length === 30, "cap 30（实际 " + tnGet().length + "）");

  section("B. prompt 构建");
  reset();
  var p = tnBuildPrompt({ product: "辅食机", stage: "已有原型", user: "新手妈妈", confuse: "功能", known: "", expect: "" });
  ok(p.indexOf("辅食机") >= 0, "prompt 含产品");
  ok(p.indexOf("personas") >= 0 && p.indexOf("hypotheses") >= 0 && p.indexOf("users") >= 0, "prompt 含完整 JSON 结构");
  ok(p.indexOf("模拟 10 位用户") >= 0, "prompt 要求模拟 10 位用户");

  section("C. 归一化");
  reset();
  var norm = tnNormalize({
    summary: "S", research: "R",
    personas: [{ name: "P1" }, { name: "" }],
    hypotheses: [{ no: "H1", content: "C1" }, {}],
    users: [{ name: "王芳" }, {}],
    voices: [{ quote: "Q" }, {}],
    competitors: [{ name: "竞品" }],
    trends: ["t1", "", "t2"],
    findings: [{ finding: "f" }],
    hypothesisResults: [{ no: "H1", result: "支持" }],
    opportunities: [{ direction: "d" }],
    nextSteps: ["s1", "", "s2"],
    sources: [{ title: "A", url: "https://a.com" }]
  }, { product: "辅食机", stage: "已有原型", provider: "gemini", text: "正文 [链接](https://text.com)", sources: [{ title: "G", url: "https://grounding.com" }] });
  ok(norm.product === "辅食机" && norm.fav === false, "基础字段 + fav:false");
  ok(norm.personas.length === 1, "personas 过滤空项");
  ok(norm.users.length === 1 && norm.users[0].name === "王芳", "users 过滤空项");
  ok(norm.trends.length === 2 && norm.nextSteps.length === 2, "trends/nextSteps 过滤空串");
  ok(norm.sources.some(s => s.url === "https://grounding.com") && norm.sources.some(s => s.url === "https://text.com"), "来源合并 + 正文链接");
  ok(norm.sources.filter(s => s.url === "https://a.com").length === 1, "来源去重");

  section("D. 报告渲染");
  reset();
  var body = tnRenderReportBody(norm);
  ok(body.indexOf("执行摘要") >= 0 && body.indexOf("P1") >= 0, "渲染摘要+画像");
  ok(body.indexOf("待验证假设") >= 0 && body.indexOf("H1") >= 0, "渲染假设表");
  ok(body.indexOf("模拟用户调研") >= 0 && body.indexOf("王芳") >= 0, "渲染模拟调研");
  ok(body.indexOf("免责声明") >= 0, "渲染免责声明");
  ok(tnRenderReportBody(null) === "", "空记录渲染为空");
  ok(truenorthReportHtmlForHub(norm).length > 0, "hub 渲染器可用");

  section("E. 我的产出 hub 接入");
  reset();
  tnSaveReport(norm);
  ok(AI_OUTPUT_MODULES.some(m => m.source === "truenorth"), "AI_OUTPUT_MODULES 含 truenorth");
  ok(aiOutputTitle("truenorth", norm).indexOf("辅食机") >= 0, "hub 标题含产品");
  ok(aiOutputSummary("truenorth", norm).length > 0, "hub 摘要");
  ok(aiOutputModel("truenorth", norm) === "gemini", "hub 模型");
  ok(aiOutputViewHtml("truenorth", norm).indexOf("执行摘要") >= 0, "hub 查看渲染");
  ok(aiOutputList().some(x => x.source === "truenorth"), "aiOutputList 含 truenorth");

  section("F. 生成主流程（stub LLM）");
  reset();
  await tnRunResearch();
  var list = tnGet();
  ok(list.length === 1, "生成并落库 1 条");
  ok(list[0].product === "面向新手妈妈的家用辅食机", "记录产品字段");
  ok(list[0].summary.indexOf("执行摘要") >= 0, "记录摘要字段");
  ok(toastLog.some(m => m.indexOf("已生成") >= 0), "生成成功 toast");

  section("G. Markdown 导出");
  reset();
  var md = tnBuildMarkdown(norm);
  ok(md.indexOf("# 🧭 TrueNorth") >= 0 && md.indexOf("辅食机") >= 0, "md 含标题与产品");
  ok(md.indexOf("## 执行摘要") >= 0 && md.indexOf("## 模拟用户调研") >= 0, "md 含章节");
  ok(md.indexOf("免责声明") >= 0, "md 含免责声明");
  ok(tnBuildMarkdown(null) === "", "空记录 md 为空");

  section("H. 联网开关");
  reset();
  var btn = { textContent: "" };
  tnToggleWs(btn);
  ok(aiCfg.webSearch === false && btn.textContent.indexOf("🚫") >= 0, "开启 → 关闭");
  tnToggleWs(btn);
  ok(aiCfg.webSearch === true && btn.textContent.indexOf("🌐") >= 0, "关闭 → 开启");
})()
  .then(() => { console.log("\n通过 " + pass + " / " + (pass + fail) + (fail ? "  ❌ 有失败" : "  ✅ 全部通过")); process.exit(fail ? 1 : 0); })
  .catch(e => { console.error("测试运行异常：", e); process.exit(1); });
