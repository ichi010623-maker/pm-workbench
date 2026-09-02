// 共享：按依赖顺序加载 js/intel/* 子模块到 vm 沙箱（Sprint 1 拆分后 8 文件）
// 用法：
//   const { loadIntel, makeIntelSandbox } = require("./lib/intel_load");
//   const sb = makeIntelSandbox();           // 默认 stub DOM/DB/localStorage/fetch
//   loadIntel(sb, { withRender: false });    // withRender=true 额外加载 state/render
//   // 或 loadIntelWithExtras(sb, ["js/intel/state.js"]) 追加
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..", "..");
// 纯逻辑 8 文件（依赖顺序固定）
const CORE_FILES = [
  "js/intel/core.js",
  "js/intel/history.js",
  "js/intel/fav.js",
  "js/intel/comments.js",
  "js/intel/llm/prompts.js",
  "js/intel/llm/providers.js",
  "js/intel/llm/parser.js",
  "js/intel/llm/client.js"
];
// 渲染层（依赖 app.js 全局，vm 中仅当传入足够 stub 时可用）
const RENDER_FILES = ["js/intel/state.js", "js/intel/render.js"];

function makeIntelSandbox(extra) {
  const fakeEl = { innerHTML: "", querySelector: () => null, querySelectorAll: () => [], style: {}, value: "", disabled: false, textContent: "", classList: { add() {}, remove() {}, contains: () => false }, addEventListener() {} };
  const sb = Object.assign({
    DB: { data: { industryHistory: {}, industryFav: [], industryCustom: [], industryComments: {}, industryFavCats: [], marketOpp: [], industry: [] }, save() {}, logActivity() {} },
    document: { getElementById: () => fakeEl, querySelector: () => null, querySelectorAll: () => [] },
    window: {},
    escapeHtml: s => (s == null ? "" : String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")),
    showModal() {}, closeModal() {}, showToast() {}, navigate() {}, render() {},
    today: () => "2026-08-06",
    uid: () => "id" + Math.random().toString(36).slice(2, 9),
    console, encodeURIComponent, decodeURIComponent, Math, Date, JSON, Object, Array, String, Number, parseInt, parseFloat, isNaN,
    localStorage: (function () { var m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; })()
  }, extra || {});
  vm.createContext(sb);
  return sb;
}

function loadFiles(sandbox, files, opts) {
  files.forEach((f) => {
    const p = path.join(ROOT, f);
    const src = fs.readFileSync(p, "utf8");
    vm.runInContext(src, sandbox, { filename: f });
  });
  if (opts && opts.onDone) opts.onDone(sandbox);
  return sandbox;
}

// 纯逻辑（8 文件）
function loadIntel(sandbox) { return loadFiles(sandbox, CORE_FILES); }
// 纯逻辑 + 渲染层（state/render）
function loadIntelWithRender(sandbox) { return loadFiles(sandbox, CORE_FILES.concat(RENDER_FILES)); }

module.exports = { ROOT, CORE_FILES, RENDER_FILES, makeIntelSandbox, loadFiles, loadIntel, loadIntelWithRender };
