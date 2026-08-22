// 🥗 饮食打卡（自由记录 + 输入菜名自动算热量）—— v5.9.1
// 设计：不再使用写死的「7天轮换计划」，改为按你实际吃了什么自由记录。
//  - 输入菜名 → 先在共享卡路里库(FT_FOOD_DB)里找；找不到就调用你配置的 AI 估算热量与三大营养素。
//  - 也能从「菜谱」一键添加（自带食材与热量，满足和菜谱联动）。
//  - 打卡完成度 = 今日饮食记录数（含健身模块的食物记录），≥2 餐即视为完成饮食打卡。
// 依赖（均在 diet.js 之前加载）：fitness.js(FT_FOOD_DB/ftBMR/ftGet)、intel.js(callLLMForPrompt/loadAiConfig)、recipes.js(RECIPE_DB/recipeById)。

var dietDate = today();

var DIET_MEALS = ["breakfast", "lunch", "dinner", "snack"];
var DIET_MEAL_NAMES = { breakfast: "🌅 早餐", lunch: "☀️ 午餐", dinner: "🌙 晚餐", snack: "🍎 加餐" };

// 读取/兜底饮食数据；新模型只用 logs（按日期的膳食记录数组）
function dietGet() {
  var g = DB.data.growth || (DB.data.growth = {});
  if (!g.diet) g.diet = { checkoffs: {}, cheatMeals: [], mealPlan: {}, logs: {} };
  var d = g.diet;
  if (!d.checkoffs) d.checkoffs = {};
  if (!d.cheatMeals) d.cheatMeals = [];
  if (!d.logs) d.logs = {};
  return d;
}

// 今日饮食打卡完成度：今日饮食记录数（含健身模块的食物记录）
function dietChecksToday() {
  var g = DB.data.growth || {};
  var cnt = 0;
  var logs = (g.diet && g.diet.logs && g.diet.logs[today()]) || [];
  cnt += logs.length;
  var fLogs = (g.fitness && g.fitness.dietLogs && g.fitness.dietLogs[today()]) || [];
  cnt += fLogs.length;
  return cnt;
}

function dietLogToday(dateStr) {
  var d = dietGet();
  return (d.logs && d.logs[dateStr || dietDate || today()]) || [];
}

// 每日目标摄入热量：优先用健身模块的 BMR×活动系数，否则默认 1800
function dietTargetKcal() {
  try {
    if (typeof ftBMR === "function" && typeof ftGet === "function") {
      var f = ftGet();
      if (f && f.profile) {
        var bmr = ftBMR(f.profile);
        var act = (f.profile.activity || "light");
        var factor = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725 }[act] || 1.375;
        return Math.round(bmr * factor);
      }
    }
  } catch (e) {}
  return 1800;
}

// 在共享卡路里库里按菜名查找（精确 → 包含）
function dietFoodLookup(name) {
  var db = (typeof FT_FOOD_DB !== "undefined") ? FT_FOOD_DB : [];
  var n = String(name || "").trim().toLowerCase();
  if (!n) return null;
  var hit = db.filter(function (f) { return f.name.toLowerCase() === n; })[0];
  if (hit) return hit;
  hit = db.filter(function (f) {
    var fn = f.name.toLowerCase();
    return fn.indexOf(n) >= 0 || n.indexOf(fn) >= 0;
  })[0];
  return hit || null;
}

// 解析 AI 返回的卡路里 JSON（容错：截取第一个 {...}）
function dietParseKcalText(text) {
  if (!text) return null;
  var s = String(text);
  var m = s.match(/\{[\s\S]*?\}/);
  if (!m) return null;
  try {
    var o = JSON.parse(m[0]);
    return {
      kcal: Math.max(0, Math.round(Number(o.kcal) || 0)),
      protein: Math.max(0, Math.round(Number(o.protein) || 0)),
      carb: Math.max(0, Math.round(Number(o.carb) || 0)),
      fat: Math.max(0, Math.round(Number(o.fat) || 0))
    };
  } catch (e) { return null; }
}

// 调用 AI 估算一份菜的热量与三大营养素
async function dietAiEstimate(name) {
  var cfg = (typeof loadAiConfig === "function") ? loadAiConfig() : {};
  var provider = cfg.provider || "gemini";
  var apiKey = cfg.apiKey || "";
  if (!apiKey) throw new Error("未配置 AI Key（设置 → 模型），可手动填写热量");
  var prompt = "请估算中式/家常菜品「" + name + "」一份常见分量的热量与三大营养素。\n" +
    "只返回 JSON：{\"kcal\":数字,\"protein\":数字,\"carb\":数字,\"fat\":数字}，单位 kcal / 克，不要任何解释文字。";
  var r = await callLLMForPrompt(provider, apiKey, prompt);
  return dietParseKcalText(r.text);
}

function dietSourceLabel(src) {
  return ({ library: "📚 库", ai: "🤖 AI", recipe: "🍳 谱", manual: "✍️ 手填", unknown: "❓" })[src] || "❓";
}

// ==============================
// 渲染
// ==============================
function renderDiet() {
  var c = document.getElementById("app-content");
  if (!c) return;
  var p = (typeof checkinPartsToday === "function") ? checkinPartsToday() : null;
  var hint = p
    ? '<div class="enm-hint" style="margin-bottom:6px">今日已记录 ' + (p.mealsDone) + ' 餐 · ' +
      (p.food ? '已满足打卡条件 ✅' : '再记 ' + Math.max(0, 2 - p.mealsDone) + ' 餐即可完成饮食打卡') + '</div>'
    : "";
  c.innerHTML = hint + renderDietContent();
}

function renderDietContent() {
  var d = dietGet();
  var viewDate = dietDate || today();
  var isToday = viewDate === today();
  var logs = dietLogToday(viewDate);
  var cheatMeals = (d.cheatMeals || []).filter(function (cm) { return cm.date === viewDate; });

  var total = logs.reduce(function (a, x) {
    return { kcal: a.kcal + (x.kcal || 0), protein: a.protein + (x.protein || 0), carb: a.carb + (x.carb || 0), fat: a.fat + (x.fat || 0) };
  }, { kcal: 0, protein: 0, carb: 0, fat: 0 });
  var target = dietTargetKcal();
  var pct = target > 0 ? Math.min(100, Math.round(total.kcal / target * 100)) : 0;

  var html =
    '<div class="diet-date-nav">' +
      '<div class="date-arrow" onclick="shiftDietDate(-1)">◀</div>' +
      '<div class="date-display">' + formatDate(viewDate) + (isToday ? ' <span style="font-size:11px;color:var(--accent-green)">今天</span>' : '') + '</div>' +
      '<div class="date-arrow" onclick="shiftDietDate(1)">▶</div>' +
    '</div>' +

    // 总热量 vs 目标
    '<div class="diet-progress-card">' +
      '<div class="diet-progress-header"><span>🔥 今日热量</span><span style="font-weight:800;font-size:20px">' + total.kcal + ' <span style="font-size:12px;color:var(--text-secondary)">/ ' + target + ' kcal</span></span></div>' +
      '<div class="progress-bar" style="margin-top:8px"><div class="progress-fill" style="width:' + pct + '%;background:' + (pct > 100 ? 'var(--accent-red)' : pct >= 70 ? 'var(--accent-orange)' : 'var(--accent-green)') + '"></div></div>' +
      '<div class="diet-progress-stats">' +
        '<span>🥩 蛋白质 ' + total.protein + 'g</span>' +
        '<span>🍚 碳水 ' + total.carb + 'g</span>' +
        '<span>🥑 脂肪 ' + total.fat + 'g</span>' +
        '<span>🍽️ 已记 ' + logs.length + ' 餐</span>' +
      '</div>' +
    '</div>' +

    // 快速添加：输入菜名 → 自动算热量
    '<div class="diet-quick-add">' +
      '<div class="dqa-row">' +
        '<select id="diet-add-meal" class="form-input" style="max-width:110px;flex:0 0 auto">' +
          DIET_MEALS.map(function (k) { return '<option value="' + k + '">' + DIET_MEAL_NAMES[k].replace(/^[^ ]+ /, "") + '</option>'; }).join("") +
        '</select>' +
        '<input id="diet-add-name" class="form-input" type="text" placeholder="输入菜名，如：青椒肉丝 / 番茄炒蛋" style="flex:1" onkeydown="if(event.key===\'Enter\')dietAutoKcal()">' +
      '</div>' +
      '<div class="dqa-row">' +
        '<input id="diet-add-kcal" class="form-input" type="number" min="0" placeholder="热量 kcal（点右侧自动算）" style="flex:1">' +
        '<button id="diet-auto-btn" class="btn btn-secondary" type="button" onclick="dietAutoKcal()">🤖 自动算热量</button>' +
        '<button class="btn btn-primary" type="button" onclick="dietAddMeal()">添加</button>' +
      '</div>' +
      '<div class="dqa-hint">💡 输入菜名后点「自动算热量」：先在卡路里库匹配，没有就调用你配置的 AI 估算。也可从菜谱一键添加（自带食材与热量）。</div>' +
      '<button class="btn btn-ghost" type="button" onclick="dietRecipeModal()" style="margin-top:6px;width:100%">🍳 从菜谱添加（含食材与热量）</button>' +
    '</div>' +

    // 按餐分组展示
    dietMealGroupsHtml(logs) +

    // 放纵餐
    '<div class="section-title" style="margin-top:20px"><span>🍕 放纵餐记录</span><button class="btn btn-secondary" onclick="showAddCheatMeal()" style="padding:6px 12px;font-size:12px;margin-left:auto">+ 添加</button></div>' +
    (cheatMeals.length === 0
      ? '<div class="card"><div class="card-body" style="text-align:center;color:var(--text-secondary);font-size:13px">暂无放纵餐记录</div></div>'
      : cheatMeals.map(function (cm) {
          return '<div class="diet-cheat-item"><span>🍕</span><span style="flex:1">' + escapeHtml(cm.note) + '</span><span class="diet-cheat-del" onclick="event.stopPropagation();deleteCheatMeal(\'' + cm.id + '\')">✕</span></div>';
        }).join(""));

  return html;
}

function dietMealGroupsHtml(logs) {
  return DIET_MEALS.map(function (k) {
    var items = logs.filter(function (x) { return x.meal === k; });
    var kcal = items.reduce(function (a, x) { return a + (x.kcal || 0); }, 0);
    return '<div class="diet-group">' +
      '<div class="diet-group-h">' + DIET_MEAL_NAMES[k] + (kcal ? ' <span class="sp-sub">' + kcal + ' kcal</span>' : '') + '</div>' +
      (items.length
        ? items.map(function (x) {
            return '<div class="diet-log-item">' +
              '<span class="dl-name">' + escapeHtml(x.name) + '</span>' +
              (x.source ? '<span class="dl-badge dl-' + x.source + '">' + dietSourceLabel(x.source) + '</span>' : '') +
              (x.ingredients ? '<span class="dl-ing" title="' + escapeHtml(x.ingredients) + '">🥬 ' + escapeHtml(x.ingredients) + '</span>' : '') +
              '<span class="dl-kcal">' + (x.kcal || 0) + ' kcal</span>' +
              '<span class="diet-cheat-del" onclick="dietDelMeal(\'' + x.id + '\')">✕</span>' +
            '</div>';
          }).join("")
        : '<div class="diet-empty">未记录</div>') +
    '</div>';
  }).join("");
}

// ==============================
// 交互
// ==============================
function dietAutoKcal() {
  var nameEl = document.getElementById("diet-add-name");
  var name = nameEl ? (nameEl.value || "").trim() : "";
  if (!name) { if (typeof showToast === "function") showToast("先输入菜名", "warn"); return; }

  // 1) 先在卡路里库找
  var hit = dietFoodLookup(name);
  if (hit) {
    var kEl = document.getElementById("diet-add-kcal");
    if (kEl) kEl.value = hit.kcal;
    if (typeof showToast === "function") showToast("📚 卡路里库匹配：" + hit.name + " ≈ " + hit.kcal + " kcal（" + (hit.unit || "") + "）", "success");
    return;
  }

  // 2) 库里没有 → 调 AI 估算
  var btn = document.getElementById("diet-auto-btn");
  if (btn) { btn.disabled = true; btn.textContent = "🤖 估算中…"; }
  dietAiEstimate(name).then(function (res) {
    if (res && res.kcal) {
      var kEl = document.getElementById("diet-add-kcal");
      if (kEl) kEl.value = res.kcal;
      if (typeof showToast === "function") showToast("🤖 AI 估算：" + name + " ≈ " + res.kcal + " kcal（蛋" + res.protein + "/碳" + res.carb + "/脂" + res.fat + "）", "success");
    } else {
      if (typeof showToast === "function") showToast("AI 未返回有效热量，请手动填写", "warn");
    }
  }).catch(function (e) {
    if (typeof showToast === "function") showToast("自动估算失败：" + (e && e.message ? e.message : e) + "（可手动填热量）", "warn");
  }).then(function () {
    if (btn) { btn.disabled = false; btn.textContent = "🤖 自动算热量"; }
  });
}

function dietAddMeal() {
  var nameEl = document.getElementById("diet-add-name");
  var mealEl = document.getElementById("diet-add-meal");
  var kcalEl = document.getElementById("diet-add-kcal");
  var name = nameEl ? (nameEl.value || "").trim() : "";
  var meal = mealEl ? (mealEl.value || "lunch") : "lunch";
  var kcal = kcalEl ? (parseInt(kcalEl.value, 10) || 0) : 0;
  if (!name) { if (typeof showToast === "function") showToast("先输入吃了什么", "warn"); return; }
  var d = dietGet();
  var date = dietDate || today();
  if (!d.logs[date]) d.logs[date] = [];
  d.logs[date].push({
    id: (typeof uid === "function" ? uid() : String(Math.random())),
    meal: meal, name: name, kcal: kcal,
    protein: 0, carb: 0, fat: 0,
    source: kcal > 0 ? "manual" : "unknown",
    ingredients: "", note: ""
  });
  DB.save();
  if (typeof DB.logActivity === "function") DB.logActivity("diet", "饮食打卡：" + name);
  render();
  if (typeof showToast === "function") showToast("已记录 " + name + (kcal ? " · " + kcal + " kcal" : ""), "success");
}

function dietDelMeal(id) {
  var d = dietGet();
  var date = dietDate || today();
  if (d.logs[date]) d.logs[date] = d.logs[date].filter(function (x) { return x.id !== id; });
  DB.save();
  render();
}

function dietRecipeModal() {
  var list = (typeof RECIPE_DB !== "undefined") ? RECIPE_DB : [];
  var cards = list.map(function (r) {
    return '<div class="diet-rec-card" onclick="dietAddRecipeMeal(\'' + r.id + '\')">' +
      '<div class="dr-top"><div class="dr-name">' + escapeHtml(r.name) + '</div><div class="dr-kcal">' + (r.kcal || 0) + ' kcal</div></div>' +
      '<div class="dr-ing">' + (r.ingredients || []).map(function (i) { return escapeHtml(i); }).join("、") + '</div>' +
    '</div>';
  }).join("");
  showModal(
    '<div class="modal-title">🍳 从菜谱添加（含食材与热量）</div>' +
    '<div class="diet-rec-grid">' + (cards || '<div class="card-body" style="text-align:center;color:var(--text-secondary)">暂无菜谱</div>') + '</div>' +
    '<div class="btn-row"><button class="btn btn-secondary" onclick="closeModal()">关闭</button></div>'
  );
}

function dietAddRecipeMeal(rid) {
  var r = (typeof recipeById === "function") ? recipeById(rid) : null;
  if (!r) return;
  var d = dietGet();
  var date = dietDate || today();
  if (!d.logs[date]) d.logs[date] = [];
  d.logs[date].push({
    id: (typeof uid === "function" ? uid() : String(Math.random())),
    meal: "lunch", name: r.name,
    kcal: r.kcal || 0, protein: r.protein || 0, carb: r.carb || 0, fat: r.fat || 0,
    source: "recipe",
    ingredients: (r.ingredients || []).join("、"),
    note: ""
  });
  DB.save();
  if (typeof DB.logActivity === "function") DB.logActivity("diet", "饮食打卡(菜谱)：" + r.name);
  closeModal();
  render();
  if (typeof showToast === "function") showToast("已添加 " + r.name + " · " + (r.kcal || 0) + " kcal", "success");
}

// ==============================
// 放纵餐（保留）
// ==============================
function showAddCheatMeal() {
  showModal(
    '<div class="modal-title">🍕 记录放纵餐</div>' +
    '<form onsubmit="submitCheatMeal(event)">' +
    '<div class="form-group"><div class="form-label">日期</div><input class="form-input" type="date" name="date" value="' + (dietDate || today()) + '"></div>' +
    '<div class="form-group"><div class="form-label">吃了什么？</div><textarea class="form-textarea" name="note" placeholder="记录放纵餐内容..." required></textarea></div>' +
    '<div class="btn-row"><button type="button" class="btn btn-secondary" onclick="closeModal()">取消</button><button type="submit" class="btn btn-primary">保存</button></div>' +
    '</form>'
  );
}

function submitCheatMeal(event) {
  event.preventDefault();
  var fd = new FormData(event.target);
  var data = Object.fromEntries(fd);
  var d = dietGet();
  if (!d.cheatMeals) d.cheatMeals = [];
  d.cheatMeals.unshift({ id: (typeof uid === "function" ? uid() : String(Math.random())), date: data.date, note: data.note });
  DB.save();
  dietDate = data.date;
  closeModal();
  render();
}

function deleteCheatMeal(id) {
  var d = dietGet();
  d.cheatMeals = (d.cheatMeals || []).filter(function (c) { return c.id !== id; });
  DB.save();
  render();
}

function shiftDietDate(offset) {
  var d = new Date(dietDate || today());
  d.setDate(d.getDate() + offset);
  dietDate = d.toISOString().slice(0, 10);
  render();
}
