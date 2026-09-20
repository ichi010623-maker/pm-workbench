// 冒烟测试：验证 language.js 可加载且 XHS / 笔记 / 各 tab 渲染函数均在全局作用域
const fs = require("fs");
const vm = require("vm");

const src = fs.readFileSync(__dirname + "/../js/language.js", "utf8");

// 最小 DOM / 运行时桩
const noop = () => {};
const el = () => ({
  value: "", innerHTML: "", textContent: "", style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  setAttribute: noop, getAttribute: () => null, appendChild: noop, removeChild: noop, addEventListener: noop,
  focus: noop, remove: noop, querySelector: () => el(), querySelectorAll: () => [], children: [], dataset: {}, onclick: null
});
const sb = {
  console,
  localStorage: (() => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; }, clear: () => {}, key: () => null, get length() { return Object.keys(m).length; } }; })(),
  document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: el, body: el(), head: el(), addEventListener: noop, documentElement: el(), readyState: "complete" },
  screen: { width: 390, height: 844 },
  navigator: { userAgent: "node", language: "zh-CN" },
  location: { href: "http://localhost/", search: "", hash: "" },
  setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: (cb) => setTimeout(cb, 0),
  fetch: () => Promise.resolve({ json: () => Promise.resolve({}) }),
  showToast: noop, render: noop, showModal: noop, closeModal: noop, escapeHtml: (s) => String(s == null ? "" : s),
  loadAiConfig: () => ({ provider: "minimax", apiKey: "", apiUrl: "", model: "" }),
  formatDateShort: (s) => String(s || ""), today: () => "2026-09-20", bjTodayStr: () => "2026-09-20",
  openaiCall: noop, callLLMForPrompt: noop, DB: { data: { growth: {} } }, langGet: () => ({ notes: [], words: [], materials: [], listening: [], wrongList: [] })
};
sb.window = sb;
sb.globalThis = sb;
vm.createContext(sb);

let ok = true;
function chk(cond, label) {
  console.log((cond ? "  ✅ " : "  ❌ ") + label);
  if (!cond) ok = false;
}

try {
  vm.runInContext(src, sb, { filename: "js/language.js" });
} catch (e) {
  console.log("  ❌ 加载失败：" + e.message);
  process.exit(1);
}
console.log("【language.js 加载成功，全局函数检查】");
["renderLanguage", "lgRenderNotes", "lgRenderXhs", "lgXhsSummarize", "lgXhsSaveDraft", "lgXhsView", "lgXhsDel", "lgXhsCallMinimax", "lgXhsExtract", "lgXhsLoad", "lgXhsSave", "renderMarkdownToHtml"]
  .forEach((f) => chk(typeof sb[f] === "function", f + " 为顶层函数"));

console.log("【XHS 行为】");
sb.localStorage.setItem("hw_pm_lg_xhs_v1", JSON.stringify({ items: [{ id: "xhs_t1", url: "https://x.com/a", title: "t", body: "Hello world", lang: "en", summary: "## 翻译摘要\n测试", createdAt: Date.now() }] }));
const loaded = sb.lgXhsLoad();
chk(loaded && loaded.items && loaded.items.length === 1, "lgXhsLoad 读取 1 条记录");

const html = sb.lgRenderXhs("en");
chk(typeof html === "string" && html.indexOf("xhs-item") !== -1, "lgRenderXhs 产出包含历史条目");
chk(typeof html === "string" && html.indexOf("lg-xhs-body") !== -1, "lgRenderXhs 产出包含正文输入框");
chk(typeof html === "string" && html.indexOf("lgXhsSummarize()") !== -1, "lgRenderXhs 产出包含总结按钮");

const md = sb.renderMarkdownToHtml("## 翻译摘要\n- 单词 **apple**\n\n段落句");
chk(/<h2>/.test(md) && /<strong>apple<\/strong>/.test(md) && /•/.test(md), "renderMarkdownToHtml 正常渲染 h2/bold/bullet");

const ex = sb.lgXhsExtract("## 翻译摘要\n这是摘要\n## 重点词汇\n- apple 苹果\n## 关键句\n- I like it.\n## 学习建议\n- 多读");
chk(ex.text.indexOf("这是摘要") !== -1 && ex.vocab.length === 1 && ex.sentences.length === 1 && ex.advice.length === 1, "lgXhsExtract 四段解析正确");

const notesHtml = sb.lgRenderNotes("en");
chk(typeof notesHtml === "string" && notesHtml.indexOf("笔记中心") !== -1, "lgRenderNotes 正常渲染笔记中心");

console.log(ok ? "\n🎉 全部通过" : "\n⚠️ 存在失败项");
process.exit(ok ? 0 : 1);
