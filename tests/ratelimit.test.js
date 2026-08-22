// 速率限制（HTTP 429）处理测试（Node vm 加载 js/intel.js，stub fetch）
// 验证：① 429 时做退避重试，瞬时突发可恢复；② 持续 429 抛出含绕开建议的专属报错。
// 运行：node tests/ratelimit.test.js
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
  console, encodeURIComponent, decodeURIComponent, Math, Date, JSON, Object, Array, String, Number, parseInt, parseFloat, isNaN, setTimeout,
  localStorage: (function () { var m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; })()
};
vm.createContext(sandbox);
vm.runInContext(src, sandbox);

const { INTEL_PROVIDERS, callLLMForPrompt } = sandbox;

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log("  ✓ " + msg); } else { fail++; console.error("  ✗ " + msg); } }
function section(name) { console.log("\n▶ " + name); }
function modelOf(url) { var m = url.match(/models\/([^:]+):generateContent/); return m ? m[1] : null; }

(async function () {
  section("A. 429 退避重试：首次 429 → 重试成功（不报错）");
  var hit = [];
  sandbox.fetch = async function (url) {
    hit.push(modelOf(url));
    if (hit.length === 1) return { ok: false, status: 429, text: async () => JSON.stringify({ error: { code: 429, message: "Resource has been exhausted (e.g. check quota)." } }) };
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: "RECOVER_OK" }] } }] }) };
  };
  var res = await callLLMForPrompt("gemini", "FAKEKEY", "折叠屏趋势");
  ok(res && res.text === "RECOVER_OK", "429 后重试成功返回文本");
  ok(hit.length === 2, "共请求 2 次（1 次 429 + 1 次成功）");

  section("B. 持续 429（超过重试上限）→ 抛出专属报错且给出绕开建议");
  sandbox.fetch = async function () { return { ok: false, status: 429, text: async () => JSON.stringify({ error: { code: 429, message: "Resource has been exhausted (e.g. check quota)." } }) }; };
  var threw = false, msg = "";
  try { await callLLMForPrompt("gemini", "FAKEKEY", "x"); } catch (e) { threw = true; msg = String(e.message || e); }
  ok(threw, "持续 429 时抛出错误");
  ok(msg.indexOf("429") > 0, "错误信息含 HTTP 429");
  ok(msg.indexOf("限速") > 0, "错误信息提示已被限速");
  ok(msg.indexOf("切换") > 0, "错误信息建议切换到其他联网模型绕开");

  section("C. OpenAI 429 同样走退避+专属报错（chat 类联网模型）");
  var hitO = [];
  sandbox.fetch = async function (url) { hitO.push(url); return { ok: false, status: 429, text: async () => JSON.stringify({ error: { message: "Rate limit reached" } }) }; };
  var threwO = false, msgO = "";
  try { await callLLMForPrompt("openai", "FAKEKEY", "x"); } catch (e) { threwO = true; msgO = String(e.message || e); }
  ok(threwO, "OpenAI 429 抛出错误");
  ok(msgO.indexOf("429") > 0 && msgO.indexOf("限速") > 0, "OpenAI 429 同样含限速提示");

  console.log("\n=== 速率限制(429)测试：" + pass + " 通过 / " + fail + " 失败 ===");
  process.exit(fail ? 1 : 0);
})();
