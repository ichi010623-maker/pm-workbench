// 竞品删除 + 设置页模型配置 模块自动化测试
// 运行：node tests/competitor_settings.test.js
// 说明：从 js/app.js 抽取真实源码片段执行（deleteCompetitor + 设置页模型配置三函数）
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const appSrc = fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8");

// 抽取 deleteCompetitor（位于 submitEditCompetitor 之后、Planning 注释之前）
const sDel = appSrc.indexOf("function deleteCompetitor(");
const eDel = appSrc.indexOf("// ===== Planning");
if (sDel < 0 || eDel < 0 || eDel < sDel) { console.error("✗ 未定位 deleteCompetitor"); process.exit(1); }
const delSrc = appSrc.slice(sDel, eDel);

// 抽取设置页模型配置三函数（位于 async function renderSettings 之前）
const sSet = appSrc.indexOf("function settingsModelOptions()");
const eSet = appSrc.indexOf("async function renderSettings()");
if (sSet < 0 || eSet < 0 || eSet < sSet) { console.error("✗ 未定位 settingsModelOptions"); process.exit(1); }
const setSrc = appSrc.slice(sSet, eSet);

let saved = null;               // DB.save 调用次数
let renderCalls = 0;
let closeModalCalls = 0;
let confirmResult = true;
let toastLog = [];
let aiCfg = { apiKey: "", provider: "gemini", webSearch: true };

const sandbox = {
  DB: {
    data: {
      competitors: [
        { id: "c1", name: "竞品甲", brand: "A牌", platform: "淘宝", price: "99", rating: 4, pros: ["轻"], cons: ["短"] },
        { id: "c2", name: "竞品乙", brand: "B牌", platform: "京东", price: "199", rating: 3, pros: ["稳"], cons: ["重"] }
      ]
    },
    logActivity() {}, save() { saved = (saved || 0) + 1; }
  },
  confirm: () => confirmResult,
  closeModal() { closeModalCalls++; },
  render() { renderCalls++; },
  showToast: (m) => { toastLog.push(m); },
  document: {
    getElementById: (id) => {
      if (id === "set-model-key") return { value: "AIza-test-key" };
      if (id === "set-model-provider") return { value: "gemini" };
      return null;
    },
    querySelector: () => null, querySelectorAll: () => []
  },
  escapeHtml: s => (s == null ? "" : String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")),
  loadAiConfig: () => aiCfg,
  saveAiConfig: c => { aiCfg = c || {}; },
  INTEL_PROVIDERS: {
    gemini: { label: "Gemini", search: true, buildBodyForPrompt: () => ({}) },
    zhipu: { label: "智谱 GLM-4-Flash", search: true, buildBodyForPrompt: () => ({}) },
    siliconflow: { label: "硅基流动", search: true, buildBodyForPrompt: () => ({}) },
    plain: { label: "无prompt模型", search: true }   // 无 buildBodyForPrompt，不应出现在选项
  },
  console, JSON, Object, Array, String, Number, Math, parseInt, parseFloat
};
vm.createContext(sandbox);
vm.runInContext(delSrc, sandbox);
vm.runInContext(setSrc, sandbox);

const { deleteCompetitor, settingsModelOptions, saveSettingsModel, toggleSettingsWs } = sandbox;

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error("  ✗ " + msg); } }
function section(name) { console.log("\n▶ " + name); }

(function () {
  section("A. 删除竞品（确认 → splice → 保存 → 重渲染）");
  saved = 0; renderCalls = 0; closeModalCalls = 0; confirmResult = true; toastLog = [];
  deleteCompetitor("c1");
  ok(sandbox.DB.data.competitors.length === 1, "删除后剩余 1 条");
  ok(sandbox.DB.data.competitors[0].id === "c2", "删除的是指定竞品");
  ok(saved === 1, "触发 DB.save");
  ok(renderCalls === 1, "触发 render");
  ok(closeModalCalls === 1, "关闭弹窗");
  ok(toastLog.some(m => m.indexOf("已删除") >= 0), "删除 toast");

  section("B. 取消删除不生效");
  confirmResult = false; saved = 0; renderCalls = 0;
  deleteCompetitor("c2");
  ok(sandbox.DB.data.competitors.length === 1, "取消确认后数据不变");
  ok(saved === 0 && renderCalls === 0, "取消后不保存不重渲染");

  section("C. 删除不存在的 id 安全返回");
  confirmResult = true; saved = 0; renderCalls = 0;
  deleteCompetitor("no-such-id");
  ok(saved === 0 && renderCalls === 0, "不存在 id 不执行任何操作");

  section("D. 设置页模型下拉选项");
  var opts = settingsModelOptions();
  ok(opts.indexOf("value=\"gemini\"") >= 0, "含 Gemini");
  ok(opts.indexOf("value=\"zhipu\"") >= 0, "含 智谱");
  ok(opts.indexOf("plain") < 0, "无 buildBodyForPrompt 的模型不出现");
  ok(opts.indexOf("selected") >= 0, "默认模型带 selected（gemini）");
  aiCfg.provider = "zhipu";
  ok(settingsModelOptions().indexOf('value="zhipu" selected') >= 0, "跟随已配置 provider");

  section("E. 保存模型配置");
  aiCfg = { apiKey: "old", provider: "gemini", webSearch: true };
  toastLog = [];
  saveSettingsModel();
  ok(aiCfg.apiKey === "AIza-test-key", "保存了 Key（来自输入框）");
  ok(aiCfg.provider === "gemini", "保存了 provider");
  ok(toastLog.some(m => m.indexOf("已保存") >= 0), "保存 toast");
  ok(aiCfg.webSearch === true, "webSearch 未被破坏");

  section("F. 联网检索开关");
  var btn = { textContent: "" };
  toggleSettingsWs(btn);
  ok(aiCfg.webSearch === false && btn.textContent.indexOf("已关闭") >= 0, "开启 → 点击后关闭");
  toggleSettingsWs(btn);
  ok(aiCfg.webSearch === true && btn.textContent.indexOf("已开启") >= 0, "关闭 → 点击后恢复开启");
})();

console.log("\n通过 " + pass + " / " + (pass + fail) + (fail ? "  ❌ 有失败" : "  ✅ 全部通过"));
process.exit(fail ? 1 : 0);
