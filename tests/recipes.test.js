// 菜谱模块自动化测试（Node vm 加载 js/recipes.js，stub DOM/DB）
// 运行：node tests/recipes.test.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const src = fs.readFileSync(path.join(ROOT, "js", "recipes.js"), "utf8");

// ---- 沙箱（模拟浏览器环境，仅满足函数可调用） ----
const fakeEl = { innerHTML: "", querySelector: () => null, querySelectorAll: () => [], classList: { add() {}, remove() {}, contains: () => false } };
const sandbox = {
  DB: { data: { growth: {} }, save() {} },
  document: { getElementById: () => fakeEl, querySelector: () => null, querySelectorAll: () => [] },
  window: {},
  escapeHtml: s => (s == null ? "" : String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")),
  showModal() {}, closeModal() {}, showToast() {}, navigate() {}, render() {},
  today: () => "2026-08-05",
  nowISO: () => new Date().toISOString(),
  uid: () => "id" + Math.random().toString(36).slice(2, 9),
  console, encodeURIComponent, decodeURIComponent, Math, Date, JSON, Object, Array, String, Number, parseInt, parseFloat, isNaN
};
vm.createContext(sandbox);
vm.runInContext(src, sandbox);

const {
  RECIPE_DB, RECIPE_CUISINES, RECIPE_TYPES, RECIPE_TAGS, DIET_GOALS, DIET_GOAL_ORDER, RECIPE_NOTES,
  filterRecipes, recipeById, recipeNutritionTotal, planWeek, recipePool, recipeSiteUrl, recipeVideoUrl,
  recipeNote, ingredientCores, fridgeItemDaysLeft, fridgeItemStatus, matchCoreToFridge,
  recipeStockStatus, weekPlanShopping, getFridgeItems,
  bmrMifflin, activityFactor, computeTargets, recommendDishes, buildDietPlan, weekPlanFromDietPlan,
  itemCore, coreInSet, onHandCoresFromFridge, recipeOnHand, rankRecipesByOnHand, onHandShoppingList,
  DIET_PROVIDERS, parseDietLLM, buildDietPlanFromLLM, callDietLLM,
  ensureRecipes, toggleRecipeFav, generateWeekPlan, saveWeekPlan, loadSavedWeekPlan, ensureWeekPlanLoaded
} = sandbox;

// ---- 断言框架 ----
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error("  ✗ " + msg); } }
function eq(a, b, msg) { ok(a === b, msg + " (得到 " + JSON.stringify(a) + "，期望 " + JSON.stringify(b) + ")"); }
function section(name) { console.log("\n▶ " + name); }

// ============================================================
section("A. RECIPE_DB 数据完整性");
ok(RECIPE_DB.length >= 40, "菜谱数量 >= 40（实际 " + RECIPE_DB.length + "）");
const cuisineIds = RECIPE_CUISINES.map(c => c.id);
const seen = {};
let integOk = true;
RECIPE_DB.forEach(r => {
  if (!r.id || typeof r.id !== "string") integOk = false;
  if (seen[r.id]) integOk = false; seen[r.id] = 1;
  if (cuisineIds.indexOf(r.cuisine) < 0) integOk = false;
  if (RECIPE_TYPES.indexOf(r.type) < 0) integOk = false;
  if (!Array.isArray(r.tags)) integOk = false;
  ["kcal", "protein", "carb", "fat", "time", "serves"].forEach(k => { if (typeof r[k] !== "number" || r[k] < 0) integOk = false; });
  if (r.time <= 0 || r.serves <= 0) integOk = false;
  if (!Array.isArray(r.ingredients) || !r.ingredients.length) integOk = false;
  if (!Array.isArray(r.steps) || !r.steps.length) integOk = false;
});
ok(integOk, "每条菜谱字段完整（id唯一 / 菜系·类型合法 / 营养为非负数字 / 食材步骤非空）");

// 每个菜系与目标标签都有覆盖
section("B. 筛选函数 filterRecipes");
["cn", "west", "kr", "jp"].forEach(c => ok(filterRecipes({ cuisine: c }).every(r => r.cuisine === c), "按菜系筛选「" + c + "」结果全部匹配"));
RECIPE_TYPES.forEach(t => ok(filterRecipes({ type: t }).every(r => r.type === t), "按类型筛选「" + t + "」结果全部匹配"));
RECIPE_TAGS.forEach(t => {
  const list = filterRecipes({ tag: t });
  ok(list.length > 0 && list.every(r => r.tags.indexOf(t) >= 0), "按标签「" + t + "」有结果且全部含该标签（" + list.length + " 道）");
});
const q = filterRecipes({ query: "三文鱼" });
ok(q.length >= 2 && q.every(r => r.name.indexOf("三文鱼") >= 0), "搜索「三文鱼」返回相关菜谱");
eq(filterRecipes({ cuisine: "jp", type: "汤羹" }).length, 4, "组合筛选 日料+汤羹 = 4 道（含豚汁/关东煮）");
ok(filterRecipes({ cuisine: "all", type: "all", tag: "all", query: "" }).length === RECIPE_DB.length, "无筛选返回全部");

section("B2. 分类最小数量（用户需求 v5.8.66）");
ok(filterRecipes({ type: "咖啡" }).length >= 15, "咖啡 >= 15（实际 " + filterRecipes({ type: "咖啡" }).length + "）");
ok(filterRecipes({ type: "甜点" }).length >= 15, "甜点 >= 15（实际 " + filterRecipes({ type: "甜点" }).length + "）");
ok(filterRecipes({ type: "饮品" }).length >= 15, "饮品 >= 15（实际 " + filterRecipes({ type: "饮品" }).length + "）");
ok(filterRecipes({ type: "酒类" }).length >= 15, "酒类 >= 15（实际 " + filterRecipes({ type: "酒类" }).length + "）");
ok(filterRecipes({ type: "饭店菜" }).length >= 31, "饭店菜 > 30（实际 " + filterRecipes({ type: "饭店菜" }).length + "）");
ok(filterRecipes({ type: "家常菜" }).length >= 46, "家常菜 > 45（实际 " + filterRecipes({ type: "家常菜" }).length + "）");
ok(filterRecipes({ cuisine: "cn" }).length >= 60, "中餐 > 60（实际 " + filterRecipes({ cuisine: "cn" }).length + "）");
ok(filterRecipes({ cuisine: "west" }).length >= 20, "西餐 > 20（实际 " + filterRecipes({ cuisine: "west" }).length + "）");
ok(filterRecipes({ cuisine: "kr" }).length >= 16, "韩餐 > 15（实际 " + filterRecipes({ cuisine: "kr" }).length + "）");
ok(filterRecipes({ cuisine: "jp" }).length >= 16, "日料 > 15（实际 " + filterRecipes({ cuisine: "jp" }).length + "）");
ok(filterRecipes({ cuisine: "other" }).length >= 11, "其他 > 10（实际 " + filterRecipes({ cuisine: "other" }).length + "）");

section("C. recipeNutritionTotal 求和");
const sum = recipeNutritionTotal(["rc01", "rc06"]); // 番茄炒蛋180/10/8/12 + 清炒西兰花120/6/10/7
eq(sum.kcal, 300, "热量求和");
eq(sum.protein, 16, "蛋白质求和");
eq(recipeNutritionTotal(["nope"]).kcal, 0, "未知 id 求和安全返回 0");

section("D. 链接生成");
ok(recipeSiteUrl("番茄炒蛋").indexOf("xiachufang.com") >= 0, "下厨房详情链接格式正确");
ok(recipeVideoUrl("番茄炒蛋").indexOf("bilibili.com") >= 0, "B站视频链接格式正确");

section("E. planWeek 一周计划（各目标）");
  DIET_GOAL_ORDER.forEach(goal => {
  const plan = planWeek(goal, {});
  const poolSize = recipePool(goal).length;
  eq(plan.days.length, 7, "[" + goal + "] 7 天");
  let structOk = true, kcalOk = true, macrosOk = true, distinct = {}, sameDayOk = true;
  const prevMain = { lunch: null, dinner: null };
  plan.days.forEach(d => {
    const m = d.meals;
    if (!m.breakfast || !m.lunch || !m.dinner) structOk = false;
    ["breakfast", "lunch", "dinner"].forEach(k => {
      const r = m[k];
      if (!r) return;
      distinct[r.id] = 1;
      if (r.kcal < 0 || r.protein < 0 || r.carb < 0 || r.fat < 0) macrosOk = false;
      if (r.kcal < 40 || r.kcal > 1600) kcalOk = false; // 单人单餐合理区间（含清淡汤品）
    });
    // 同日三餐 id 互不相同
    if (m.breakfast && m.lunch && m.breakfast.id === m.lunch.id) sameDayOk = false;
    if (m.lunch && m.dinner && m.lunch.id === m.dinner.id) sameDayOk = false;
    if (m.breakfast && m.dinner && m.breakfast.id === m.dinner.id) sameDayOk = false;
    // 主食材连续日不重复（lunch/dinner 槽位）
    if (prevMain.lunch && m.lunch && prevMain.lunch === m.lunch.main) sameDayOk = false;
    if (prevMain.dinner && m.dinner && prevMain.dinner === m.dinner.main) sameDayOk = false;
    prevMain.lunch = m.lunch ? m.lunch.main : null;
    prevMain.dinner = m.dinner ? m.dinner.main : null;
  });
  ok(structOk, "[" + goal + "] 每天早/午/晚三餐齐全");
  ok(kcalOk, "[" + goal + "] 每餐热量在 40–1600 kcal 合理区间");
  ok(macrosOk, "[" + goal + "] 营养值均非负");
  ok(sameDayOk, "[" + goal + "] 同日不重复菜、相邻日同槽位主食材不重复");
  ok(Object.keys(distinct).length >= Math.min(8, poolSize), "[" + goal + "] 一周使用 >= min(8,池" + poolSize + ") 道不同菜（多样性，" + Object.keys(distinct).length + "）");
  eq(plan.totals.avgKcal, Math.round(plan.totals.kcal / 7), "[" + goal + "] 日均热量=周总/7");
  // 目标约束
  if (goal === "mediterranean") ok(plan.days.every(d => ["breakfast", "lunch", "dinner"].every(k => d.meals[k] && d.meals[k].tags.indexOf("地中海") >= 0)), "[地中海] 全部为地中海标签菜");
  if (goal === "chinese") ok(plan.days.every(d => ["breakfast", "lunch", "dinner"].every(k => d.meals[k] && d.meals[k].cuisine === "cn")), "[中式养生] 全部为中餐");
  if (goal === "lose") ok(plan.days.every(d => ["breakfast", "lunch", "dinner"].every(k => d.meals[k] && d.meals[k].tags.indexOf("减脂") >= 0)), "[减脂] 全部为减脂标签菜");
  if (goal === "muscle") ok(plan.days.every(d => ["breakfast", "lunch", "dinner"].every(k => d.meals[k] && d.meals[k].tags.indexOf("高蛋白") >= 0)), "[增肌] 全部为高蛋白标签菜");
});

section("F. 收藏 roundtrip");
ensureRecipes();
toggleRecipeFav("rc01");
ok(sandbox.DB.data.growth.recipes.favs.indexOf("rc01") >= 0, "收藏 rc01 后进入 favs");
toggleRecipeFav("rc01");
ok(sandbox.DB.data.growth.recipes.favs.indexOf("rc01") < 0, "再次切换取消收藏");

section("G. 一周计划保存 / 读取");
generateWeekPlan("healthy");
ok(sandbox.recipeWeekCache && sandbox.recipeWeekCache.days.length === 7, "generateWeekPlan 生成缓存（7天）");
saveWeekPlan();
const saved = loadSavedWeekPlan();
ok(saved && saved.dayIds.length === 7, "saveWeekPlan 写入 plans（7天 id）");
ok(saved.dayIds.every(d => d.b && d.l && d.din), "每天含早/午/晚三个菜 id");
sandbox.recipeWeekCache = null;
ensureWeekPlanLoaded();
ok(sandbox.recipeWeekCache && sandbox.recipeWeekCache.days.length === 7, "ensureWeekPlanLoaded 从已保存计划重建缓存");

// ============================================================
section("H. 库存联动（食材解析 / 匹配 / 状态 / 采购）");
function shiftDate(days) {
  var t = new Date(); t.setDate(t.getDate() + days);
  return t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0");
}
// 食材名解析
eq(ingredientCores("鸡蛋 3个").join(","), "鸡蛋", "解析「鸡蛋 3个」→ 鸡蛋");
ok(ingredientCores("菠菜 胡萝卜 豆芽 各1把").join(",") === "菠菜,胡萝卜,豆芽", "复合食材「各1把」拆分正确");
eq(ingredientCores("姜 丝").join(","), "姜", "形状词「丝」忽略");
eq(ingredientCores("番茄 2个").join(","), "番茄", "量词「2个」忽略");

// 临期/过期判定
var itemOk = { id: "i1", name: "鸡蛋", expire: "2099-01-01" };
var itemExp = { id: "i2", name: "西红柿", expire: shiftDate(-1) };
var itemNear = { id: "i3", name: "牛肉", expire: shiftDate(2) };
eq(fridgeItemStatus(itemOk), "正常", "远未过期→正常");
eq(fridgeItemStatus(itemExp), "已过期", "过期日期→已过期");
eq(fridgeItemStatus(itemNear), "临期", "2天内→临期");
eq(fridgeItemDaysLeft(itemNear), 2, "daysLeft 计算正确");

// 别名匹配
var items = [itemOk, itemExp, itemNear, { id: "i4", name: "土鸡蛋" }, { id: "i5", name: "五花肉" }];
ok(matchCoreToFridge("番茄", items) && matchCoreToFridge("番茄", items).name === "西红柿", "「番茄」通过别名命中「西红柿」");
ok(matchCoreToFridge("鸡蛋", items) && matchCoreToFridge("鸡蛋", items).name.indexOf("鸡蛋") >= 0, "「鸡蛋」命中含「鸡蛋」的物品");
ok(matchCoreToFridge("猪肉", items) && matchCoreToFridge("猪肉", items).name === "五花肉", "「猪肉」命中「五花肉」");
eq(matchCoreToFridge("虾仁", items), null, "无虾类→未命中");

// 单菜库存状态
var rec = recipeById("rc01"); // 番茄炒蛋: 鸡蛋/番茄/葱花/盐/糖（番茄为过期品）
var st = recipeStockStatus(rec, items);
ok(st.have.indexOf("鸡蛋") >= 0, "已有：鸡蛋命中");
ok(st.expiring.some(function (e) { return e.core === "番茄"; }), "临期/过期：西红柿(番茄)进入临期");
ok(st.missing.indexOf("葱花") >= 0, "缺：葱花(无库存)");

// 一周采购聚合
var plan = planWeek("healthy", {});
var shop = weekPlanShopping(plan, items);
ok(Array.isArray(shop.buy) && Array.isArray(shop.expiring), "weekPlanShopping 返回 buy/expiring 数组");
ok(shop.expiring.some(function (e) { return e.core === "番茄"; }), "周计划临期汇总含西红柿(番茄)");

// 地中海中文标注
ok(recipeNote("rc34").length > 0, "地中海菜 rc34 有中文标注");
ok(recipeNote("rc01") === "", "非地中海菜 rc01 无标注");
var medNoNote = RECIPE_DB.filter(function (r) { return (r.tags || []).indexOf("地中海") >= 0 && !recipeNote(r.id); });
ok(medNoNote.length === 0, "全部地中海标签菜均有中文标注（缺 " + medNoNote.length + "）");

// 数据集规模
ok(RECIPE_DB.length >= 120, "菜谱总数 >= 120（实际 " + RECIPE_DB.length + "）");

// ============================================================
section("I. 饮食方案（个性化方案 → 周计划）");
// BMR（Mifflin-St Jeor）
eq(bmrMifflin("f", 60, 165, 30), 1320, "女 60kg/165cm/30岁 BMR≈1320");
eq(bmrMifflin("m", 70, 175, 30), 1649, "男 70kg/175cm/30岁 BMR≈1649");
// 活动系数
eq(activityFactor("low"), 1.2, "久坐 1.2");
eq(activityFactor("mid"), 1.55, "中等 1.55");
eq(activityFactor("high"), 1.725, "高强度 1.725");
// 热量目标调整
var tHealthy = computeTargets({ goal: "healthy", sex: "f", age: 30, weightKg: 60, heightCm: 165, activity: "mid" });
var tLose = computeTargets({ goal: "lose", sex: "f", age: 30, weightKg: 60, heightCm: 165, activity: "mid" });
var tMuscle = computeTargets({ goal: "muscle", sex: "f", age: 30, weightKg: 60, heightCm: 165, activity: "mid" });
ok(tLose.kcal < tHealthy.kcal, "[减脂] 热量低于健康维持");
ok(tMuscle.kcal > tHealthy.kcal, "[增肌] 热量高于健康维持");
ok(tHealthy.kcal >= 1200 && tHealthy.kcal <= 4000, "[健康] 热量在合理区间");
ok(tLose.kcal >= 1200, "[减脂] 热量不低于 1200 下限");
// 营养素总和 ≈ 热量（蛋白4 + 碳水4 + 脂肪9）
[["healthy", tHealthy], ["lose", tLose], ["muscle", tMuscle]].forEach(function (p) {
  var t = p[1];
  var sum = t.protein * 4 + t.carb * 4 + t.fat * 9;
  ok(Math.abs(sum - t.kcal) <= t.kcal * 0.06, "[" + p[0] + "] 三大营养素供能≈热量(" + sum + " vs " + t.kcal + ")");
});
// 补钙目标
ok(DIET_GOAL_ORDER.indexOf("calcium") >= 0, "目标含「补钙」");
var tCal = computeTargets({ goal: "calcium", sex: "f", age: 30, weightKg: 60, heightCm: 165, activity: "mid" });
ok(tCal.kcal >= 1200, "[补钙] 热量合理");
// 推荐菜约束
var recLose = recommendDishes("lose");
ok(recLose.length >= 12, "[减脂] 推荐菜 >= 12（实际 " + recLose.length + "）");
ok(recLose.every(function (id) { var r = recipeById(id); return r && (r.tags || []).indexOf("减脂") >= 0; }), "[减脂] 推荐菜全部带「减脂」标签");
var recMuscle = recommendDishes("muscle");
ok(recMuscle.every(function (id) { var r = recipeById(id); return r && (r.tags || []).indexOf("高蛋白") >= 0; }), "[增肌] 推荐菜全部带「高蛋白」标签");
var recCal = recommendDishes("calcium");
ok(recCal.length >= 12, "[补钙] 推荐菜 >= 12（实际 " + recCal.length + "）");
ok(recCal.some(function (id) { var r = recipeById(id); return r && (r.tags || []).indexOf("补钙") >= 0; }), "[补钙] 推荐菜含补钙标签菜");
// buildDietPlan：默认 dishes = 推荐菜；自定义 dishes 生效
var dp1 = buildDietPlan({ goal: "lose", sex: "f", age: 30, weightKg: 60, heightCm: 165, activity: "mid" });
ok(dp1.dishes.length === recommendDishes("lose").length, "buildDietPlan 默认 dishes=推荐菜");
ok(dp1.targets && dp1.targets.kcal > 0, "buildDietPlan 含计算后的 targets");
var dp2 = buildDietPlan({ goal: "lose", dishes: ["rc01", "rc02", "rc03"] });
ok(dp2.dishes.join(",") === "rc01,rc02,rc03", "buildDietPlan 自定义 dishes 生效");
// 周计划仅使用方案菜（flow：方案 → 周计划）
var myPlan = { goal: "lose", dishes: ["rc01", "rc02", "rc03", "rc20", "rc21"] };
var wp = weekPlanFromDietPlan(myPlan);
ok(wp.days.length === 7, "weekPlanFromDietPlan 生成 7 天");
var allIn = wp.days.every(function (d) {
  return ["breakfast", "lunch", "dinner"].every(function (k) {
    var m = d.meals[k]; return !m || myPlan.dishes.indexOf(m.id) >= 0;
  });
});
ok(allIn, "周计划每餐均来自方案所选菜（不混入方案外菜）");
// 确定性：同方案两次生成一致
var wp2 = weekPlanFromDietPlan(myPlan);
ok(JSON.stringify(wp.days) === JSON.stringify(wp2.days), "同一方案生成结果确定（可测试）");
// 方案为空时回退到目标候选池
var wpFallback = weekPlanFromDietPlan({ goal: "lose", dishes: [] });
ok(wpFallback.days.length === 7, "方案菜为空时回退到目标候选池仍生成 7 天");

// ============================================================
section("J. 手边食材搭配（现有食材 → 可现做 / 缺料清单）");
// itemCore 清洗量词/单位/括号
eq(itemCore("鸡蛋 3个"), "鸡蛋", "itemCore 清洗「鸡蛋 3个」→ 鸡蛋");
eq(itemCore("牛奶 1盒"), "牛奶", "itemCore 清洗「牛奶 1盒」→ 牛奶");
eq(itemCore("西红柿(小) 2个"), "西红柿", "itemCore 清洗括号「西红柿(小) 2个」→ 西红柿");
eq(itemCore("番茄 200g"), "番茄", "itemCore 清洗单位「番茄 200g」→ 番茄");
// coreInSet 双向别名
ok(coreInSet("番茄", { "西红柿": 1 }), "coreInSet 番茄 命中别名 西红柿");
ok(coreInSet("鸡蛋", { "土鸡蛋": 1 }), "coreInSet 鸡蛋 命中别名 土鸡蛋");
ok(!coreInSet("牛肉", { "鸡蛋": 1, "西红柿": 1 }), "coreInSet 牛肉 在未含牛肉集合中不命中");
// 单菜匹配：鸡蛋+番茄(别名西红柿)全有 → 可现做
var recA = { id: "rcA", name: "测试A", ingredients: ["鸡蛋 2个", "番茄 1个"], kcal: 100, protein: 8, tags: [] };
var stA = recipeOnHand(recA, { "鸡蛋": 1, "西红柿": 1 });
ok(stA.allHave === true, "recipeOnHand 鸡蛋+番茄(别名) 全有 → 可现做");
ok(stA.have.indexOf("鸡蛋") >= 0 && stA.have.indexOf("番茄") >= 0, "recipeOnHand have 含 鸡蛋/番茄");
ok(stA.missing.length === 0, "recipeOnHand 无缺料");
// 单菜匹配：缺牛肉/西兰花 → 标缺
var recB = { id: "rcB", name: "测试B", ingredients: ["牛肉 200g", "西兰花 1颗"], kcal: 200, protein: 20, tags: [] };
var stB = recipeOnHand(recB, { "鸡蛋": 1, "西红柿": 1 });
ok(stB.allHave === false, "recipeOnHand 缺料 → 不可现做");
ok(stB.missing.indexOf("牛肉") >= 0 && stB.missing.indexOf("西兰花") >= 0, "recipeOnHand missing 含 牛肉/西兰花");
// rankRecipesByOnHand：可现做优先、覆盖率降序
var ranked = rankRecipesByOnHand([recA, recB], { "鸡蛋": 1, "西红柿": 1 });
ok(ranked[0].recipe.id === "rcA" && ranked[0].allHave === true, "rank 可现做(recA) 排最前");
ok(ranked[1].recipe.id === "rcB" && ranked[1].allHave === false, "rank 缺料(recB) 排其后");
// onHandCoresFromFridge：仅计入已选且未用完/未丢弃
var fridgeItems = [
  { id: "f1", name: "鸡蛋 10个" },
  { id: "f2", name: "西红柿 3个" },
  { id: "f3", name: "牛奶 1盒", usedUp: true },
  { id: "f4", name: "牛肉 1斤", discarded: true }
];
var haveC = onHandCoresFromFridge(fridgeItems, ["f1", "f2", "f3", "f4"]);
ok(haveC["鸡蛋"] && haveC["西红柿"], "onHandCoresFromFridge 计入已选 鸡蛋/西红柿");
ok(!haveC["牛奶"] && !haveC["牛肉"], "onHandCoresFromFridge 跳过 usedUp/discarded");
// onHandShoppingList：聚合缺料计数
var shopAgg = onHandShoppingList([stB], { "鸡蛋": 1 });
ok(shopAgg.length === 2 && shopAgg[0].core === "牛肉" && shopAgg[0].times === 1, "onHandShoppingList 聚合缺料(牛肉/西兰花 各1)");

// ============================================================
section("K. 自定义目标（调用免费大模型科学定制）");
// DIET_GOALS 含 custom
ok(DIET_GOAL_ORDER.indexOf("custom") >= 0, "目标含「自定义(AI)」");
ok(!!DIET_GOALS.custom, "DIET_GOALS.custom 已定义");
// 4 个免费 provider
["gemini", "groq", "deepseek", "openrouter"].forEach(function (p) {
  ok(!!DIET_PROVIDERS[p], "DIET_PROVIDERS 含 " + p);
});
// gemini：body 含 responseMimeType json；groq/deepseek/openrouter：headers 含 Authorization + response_format
var gemBody = DIET_PROVIDERS.gemini.buildBody("测试", [{ id: "rc01", name: "蛋", tags: ["补钙"], main: "蛋", kcal: 90, protein: 8 }]);
ok(gemBody.generationConfig && gemBody.generationConfig.responseMimeType === "application/json", "gemini buildBody 要求 JSON 输出");
ok(typeof gemBody.contents[0].parts[0].text === "string" && gemBody.contents[0].parts[0].text.indexOf("rc01") >= 0, "gemini prompt 含菜谱索引");
var groqH = DIET_PROVIDERS.groq.buildHeaders("KEY123");
ok(groqH["Authorization"] === "Bearer KEY123", "groq buildHeaders 注入 Authorization Bearer");
var groqBody = DIET_PROVIDERS.groq.buildBody("测试", []);
ok(groqBody.response_format && groqBody.response_format.type === "json_object", "groq buildBody 要求 JSON 对象");
// parseDietLLM：从带噪声文本稳健提取 JSON
var messy = '好的，这是方案：\n```json\n{"kcal":1850,"protein":120,"carb":180,"fat":60,"focusTags":["高蛋白","补钙"],"recipeIds":["rc01","rc02"],"note":"增肌补钙"}\n```\n希望帮到你';
var parsed = parseDietLLM(messy);
ok(parsed && parsed.kcal === 1850 && parsed.protein === 120, "parseDietLLM 从代码块噪声中提取 JSON");
ok(parsed && parsed.recipeIds.join(",") === "rc01,rc02", "parseDietLLM 提取 recipeIds");
eq(parseDietLLM("没有 json 内容"), null, "parseDietLLM 无 JSON 返回 null");
// buildDietPlanFromLLM：有效 id 保留、无效 id 过滤、focusTags 兜底、targets 钳制
var llm = { kcal: 1850, protein: 120, carb: 180, fat: 60, focusTags: ["补钙"], recipeIds: ["rc01", "rcBad", "rc93"], note: "补钙增肌" };
var bp = buildDietPlanFromLLM(llm, { customGoalText: "我在补钙" });
ok(bp.goal === "custom", "buildDietPlanFromLLM goal=custom");
ok(bp.dishes.join(",") === "rc01,rc93", "buildDietPlanFromLLM 仅保留有效 recipeId（过滤 rcBad）");
ok(bp.targets.kcal === 1850 && bp.targets.protein === 120, "buildDietPlanFromLLM targets 来自 LLM");
ok(bp.focusTags.join(",") === "补钙" && bp.note === "补钙增肌", "buildDietPlanFromLLM 保留 focusTags/note");
ok(bp.customGoalText === "我在补钙", "buildDietPlanFromLLM 透传 customGoalText");
// focusTags 兜底：无有效 id 时按 focusTags 选菜
var bp2 = buildDietPlanFromLLM({ kcal: 1900, focusTags: ["补钙"], recipeIds: ["rcX"], note: "n" }, {});
ok(bp2.dishes.length > 0, "buildDietPlanFromLLM 无有效 id 时按 focusTags 兜底选菜");
// targets 钳制非负
var bp3 = buildDietPlanFromLLM({ kcal: -50, protein: -5, carb: 0, fat: 0, recipeIds: [] }, {});
ok(bp3.targets.kcal === 0 && bp3.targets.protein === 0, "buildDietPlanFromLLM targets 钳制为非负");
// computeTargets 对 custom 走默认（maintain），不崩溃
var tCustom = computeTargets({ goal: "custom", sex: "f", age: 30, weightKg: 60, heightCm: 165, activity: "mid" });
ok(tCustom.kcal > 0, "computeTargets(custom) 仍返回合法热量");
// buildDietPlan(custom) 透传 customTargets
var dpC = buildDietPlan({ goal: "custom", customTargets: { kcal: 1750, protein: 110, carb: 170, fat: 55 } });
ok(dpC.targets.kcal === 1750 && dpC.targets.protein === 110, "buildDietPlan(custom) 使用 customTargets");

// ============================================================
console.log("\n========================================");
console.log("通过 " + pass + " 项，失败 " + fail + " 项");
if (fail > 0) { console.error("❌ 测试未通过"); process.exit(1); }
console.log("✅ 全部通过");
