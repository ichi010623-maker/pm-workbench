// 饮食打卡模块自动化测试（Node vm 加载 js/diet.js，stub DOM/DB/AI/食物库）
// 运行：node tests/diet.test.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const src = fs.readFileSync(path.join(ROOT, "js", "diet.js"), "utf8");

let saved = 0;
const fakeEl = { _html: "", get innerHTML() { return this._html; }, set innerHTML(v) { this._html = v; }, value: "", scrollTop: 0, scrollHeight: 0, appendChild() {}, classList: { add() {}, remove() {}, contains: () => false }, querySelector: () => null, querySelectorAll: () => [] };
function mkEl() { return { _html: "", value: "", scrollTop: 0, scrollHeight: 0, className: "", id: "", get innerHTML() { return this._html; }, set innerHTML(v) { this._html = v; }, appendChild() {}, classList: { add() {}, remove() {}, contains: () => false } }; }

const SANDBOX_DB = { data: { growth: { diet: { logs: {}, cheatMeals: [] } } }, save() { saved++; }, logActivity() {} };

const sandbox = {
  DB: SANDBOX_DB,
  document: { getElementById: (id) => (id === "app-content" ? fakeEl : (fakeElStore[id] || (fakeElStore[id] = mkEl()))), createElement: () => mkEl(), querySelector: () => null, querySelectorAll: () => [] },
  window: {},
  localStorage: (function () { var m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; })(),
  today: () => "2026-08-08",
  escapeHtml: s => (s == null ? "" : String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")),
  formatDate: d => d,
  showModal() {}, closeModal() {}, showToast() {}, render() {}, navigate() {}, confirm() { return true; },
  uid: () => "u" + Math.random().toString(36).slice(2, 9),
  // 共享食物卡路里库（stub）
  FT_FOOD_DB: [
    { id: "x1", cat: "家常菜", name: "青椒肉丝", kcal: 260, unit: "1盘(2人份)" },
    { id: "x2", cat: "家常菜", name: "番茄炒蛋", kcal: 180, unit: "1盘(2人份)" },
    { id: "x3", cat: "零食", name: "薯片", kcal: 530, unit: "100g" }
  ],
  RECIPE_DB: [
    { id: "r1", name: "清炒西兰花", kcal: 120, protein: 6, carb: 10, fat: 7, ingredients: ["西兰花 1颗", "蒜 2瓣"] },
    { id: "r2", name: "宫保鸡丁", kcal: 280, protein: 26, carb: 14, fat: 13, ingredients: ["鸡胸 250g", "花生 30g"] }
  ],
  recipeById: function (id) { return (this.RECIPE_DB || []).filter(r => r.id === id)[0] || null; },
  ftGet: () => null,        // 无健身档案 → dietTargetKcal 退回默认 1800
  ftBMR: () => 1500,
  loadAiConfig: () => ({ provider: "gemini", apiKey: "test-key" }),
  callLLMForPrompt: async (provider, apiKey, prompt) => ({ text: '{"kcal":280,"protein":26,"carb":14,"fat":13}' }),
  console, encodeURIComponent, decodeURIComponent, Math, Date, JSON, Object, Array, String, Number, parseInt, parseFloat, isNaN
};
var fakeElStore = {};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox);

const {
  dietGet, dietChecksToday, dietFoodLookup, dietParseKcalText, dietAiEstimate,
  renderDietContent, dietRecipeModal
} = sandbox;

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error("  ✗ " + msg); } }
function section(name) { console.log("\n▶ " + name); }

console.log("\n=== 饮食打卡模块测试 ===");

// ---- 1. dietGet 兜底播种 logs ----
section("dietGet 数据结构");
{
  const d = dietGet();
  ok(d && d.logs && typeof d.logs === "object", "dietGet 含 logs 对象");
  ok(Array.isArray(d.cheatMeals), "dietGet 含 cheatMeals 数组");
}

// ---- 2. 食物库查找 ----
section("dietFoodLookup 菜名→热量");
{
  const a = dietFoodLookup("青椒肉丝");
  ok(a && a.kcal === 260, "精确匹配 青椒肉丝=260");
  const b = dietFoodLookup("番茄炒");
  ok(b && b.name === "番茄炒蛋", "包含匹配 番茄炒→番茄炒蛋");
  const c = dietFoodLookup("随便一道不存在的菜");
  ok(c === null, "库中无 → null");
  ok(dietFoodLookup("") === null, "空名 → null");
}

// ---- 3. AI 返回解析（容错） ----
section("dietParseKcalText 解析容错");
{
  ok(dietParseKcalText('{"kcal":280,"protein":26,"carb":14,"fat":13}').kcal === 280, "纯 JSON");
  ok(dietParseKcalText('好的：{"kcal":180,"protein":10,"carb":8,"fat":12} 供参考').kcal === 180, "JSON 前后带文字");
  ok(dietParseKcalText('没有数字') === null, "无 JSON → null");
  ok(dietParseKcalText("") === null, "空 → null");
}

// ---- 4. AI 估算（走 callLLMForPrompt stub） ----
section("dietAiEstimate 调用 AI");
{
  dietAiEstimate("宫保鸡丁").then(r => {
    ok(r && r.kcal === 280 && r.protein === 26, "返回解析后的三大营养素");
    // 缺 Key 应抛错
    sandbox.loadAiConfig = () => ({ provider: "gemini", apiKey: "" });
    dietAiEstimate("xx").then(() => { ok(false, "缺 Key 应抛错"); finish(); })
      .catch(e => { ok(/AI Key/.test(e.message), "缺 Key 抛明确错误"); finish(); });
  }).catch(e => { ok(false, "dietAiEstimate 不应抛:" + e.message); finish(); });
}

// ---- 5. 打卡完成度：合并饮食记录 + 健身食物记录 ----
section("dietChecksToday 合并两处记录");
{
  SANDBOX_DB.data.growth.diet.logs = {
    "2026-08-08": [ { id: "a", meal: "lunch", name: "青椒肉丝", kcal: 260 }, { id: "b", meal: "dinner", name: "番茄炒蛋", kcal: 180 } ],
    "2026-08-07": [ { id: "c", meal: "breakfast", name: "燕麦", kcal: 300 } ]
  };
  SANDBOX_DB.data.growth.fitness = { dietLogs: { "2026-08-08": [ { id: "f1", meal: "snack", name: "薯片", kcal: 530 } ] } };
  ok(dietChecksToday() === 3, "今日饮食2 + 健身1 = 3");

  // 清空后应为 0
  SANDBOX_DB.data.growth.diet.logs = {};
  SANDBOX_DB.data.growth.fitness = { dietLogs: {} };
  ok(dietChecksToday() === 0, "清空后为 0");
}

// ---- 6. 渲染冒烟（不抛错，含总热量/分组/菜谱按钮） ----
section("renderDietContent 渲染冒烟");
{
  SANDBOX_DB.data.growth.diet.logs = { "2026-08-08": [ { id: "a", meal: "lunch", name: "青椒肉丝", kcal: 260, source: "library" } ] };
  const html = renderDietContent();
  ok(typeof html === "string" && html.length > 100, "返回非空 HTML");
  ok(html.indexOf("青椒肉丝") >= 0, "包含已记录菜名");
  ok(html.indexOf("自动算热量") >= 0, "含自动算热量按钮");
  ok(html.indexOf("从菜谱添加") >= 0, "含从菜谱添加按钮");
  ok(html.indexOf("1800") >= 0, "目标热量默认 1800（无健身档案）");
  ok(html.indexOf("📚 库") >= 0, "含来源徽章");
  let threw = false;
  try { dietRecipeModal(); } catch (e) { threw = true; console.error(e); }
  ok(!threw, "dietRecipeModal 不抛错");
}

// ---- 汇总 ----
var finishedFlag = false;
function finish() {
  if (finishedFlag) return;
  finishedFlag = true;
  console.log("\n──────────────────────────");
  console.log("✅ 通过 " + pass + " · ❌ 失败 " + fail);
  console.log("──────────────────────────\n");
  process.exit(fail ? 1 : 0);
}
// 异步分支（dietAiEstimate）完成后调用 finish；保险兜底延时汇总
setTimeout(finish, 800);
