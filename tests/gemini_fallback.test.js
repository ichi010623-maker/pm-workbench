// Gemini 模型 404 自动降级测试（Node vm 加载 js/intel.js，stub fetch）
// 验证：当首选模型 gemini-2.5-flash 返回 404「模型不存在」时，自动尝试候选列表中的下一个模型。
// 运行：node tests/gemini_fallback.test.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const src = fs.readFileSync(path.join(ROOT, "js", "intel.js"), "utf8");

const fakeEl = { innerHTML: "", querySelector: () => null, querySelectorAll: () => [], classList: { add() {}, remove() {}, contains: () => false } };
const sandbox = {
  DB: { data: { industryHistory: {}, industryFav: [], industryCustom: [] }, save() {}, logActivity() {} },
  document: { getElementById: () => fakeEl, querySelector: () => null, querySelectorAll: () => [] },
  window: {},
  escapeHtml: s => (s == null ? "" : String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")),
  showModal() {}, closeModal() {}, showToast() {}, navigate() {}, render() {},
  today: () => "2026-08-06",
  uid: () => "id" + Math.random().toString(36).slice(2, 9),
  console, encodeURIComponent, decodeURIComponent, Math, Date, JSON, Object, Array, String, Number, parseInt, parseFloat, isNaN,
  localStorage: (function () { var m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; })()
};
vm.createContext(sandbox);
vm.runInContext(src, sandbox);

const { INTEL_PROVIDERS, callLLMForPrompt } = sandbox;

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log("  ✓ " + msg); } else { fail++; console.error("  ✗ " + msg); } }
function section(name) { console.log("\n▶ " + name); }

// 记录被请求过的模型（从 URL 中提取）
function modelOf(url) { var m = url.match(/models\/([^:]+):generateContent/); return m ? m[1] : null; }

(async function () {
  section("A. 首选模型 404 → 自动降级到下一个候选并成功");
  var hit = [];
  sandbox.fetch = async function (url) {
    var model = modelOf(url);
    hit.push(model);
    if (model === INTEL_PROVIDERS.gemini.models[0]) {
      return { ok: false, status: 404, text: async () => JSON.stringify({ error: { code: 404, message: "models/" + model + " is not found for API version v1beta, or is not supported for generateContent." } }) };
    }
    // 第二个候选返回成功
    return {
      ok: true, status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: "FALLBACK_OK" }] } }] })
    };
  };
  var res = await callLLMForPrompt("gemini", "FAKEKEY", "折叠屏趋势");
  ok(res && res.text === "FALLBACK_OK", "降级后成功返回模型文本");
  ok(hit.length === 2, "请求了 2 个模型（首个 404，次个成功）");
  ok(hit[0] === INTEL_PROVIDERS.gemini.models[0], "首次请求首选模型 " + INTEL_PROVIDERS.gemini.models[0]);
  ok(hit[1] === INTEL_PROVIDERS.gemini.models[1], "二次请求降级模型 " + INTEL_PROVIDERS.gemini.models[1]);

  section("B. 全部候选 404 → 抛出「模型不存在」且列出已尝试模型");
  sandbox.fetch = async function (url) {
    return { ok: false, status: 404, text: async () => JSON.stringify({ error: { code: 404, message: "not found" } }) };
  };
  var threw = false, msg = "";
  try { await callLLMForPrompt("gemini", "FAKEKEY", "x"); } catch (e) { threw = true; msg = String(e.message || e); }
  ok(threw, "全部 404 时抛出错误");
  ok(msg.indexOf("模型不存在") > 0, "错误信息含「模型不存在」");
  INTEL_PROVIDERS.gemini.models.forEach(function (m) { ok(msg.indexOf(m) > 0, "错误列出候选模型 " + m); });

  section("C. 非 404 错误（如 401 无效 Key）不降级、直接抛出");
  sandbox.fetch = async function () { return { ok: false, status: 401, text: async () => JSON.stringify({ error: { message: "API key not valid" } }) }; };
  var threw2 = false;
  try { await callLLMForPrompt("gemini", "BAD", "x"); } catch (e) { threw2 = true; }
  ok(threw2, "401 直接抛出（不重试）");

  section("D. 首选模型正常 → 不触发降级，请求数=1");
  var hit2 = [];
  sandbox.fetch = async function (url) { hit2.push(modelOf(url)); return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: "OK" }] } }] }) }; };
  await callLLMForPrompt("gemini", "KEY", "x");
  ok(hit2.length === 1 && hit2[0] === INTEL_PROVIDERS.gemini.models[0], "正常路径仅请求首选模型一次");

  console.log("\n=== Gemini 降级测试：" + pass + " 通过 / " + fail + " 失败 ===");
  process.exit(fail ? 1 : 0);
})();
