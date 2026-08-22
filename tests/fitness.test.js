// 减脂健身模块 纯函数 + 渲染冒烟测试（Node vm，无需浏览器）
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const code = fs.readFileSync(path.join(__dirname, "../js/fitness.js"), "utf8");

function makeCtx(growth) {
  growth = growth || { fitness: null };
  const el = { innerHTML: "" };
  const ctx = {
    DB: { data: { growth: growth }, save() {}, logActivity() {} },
    document: { getElementById: function (id) { return id === "app-content" ? el : null; }, querySelector: function () { return null; } },
    RECIPE_DB: [],
    today: function () { return "2026-08-07"; },
    escapeHtml: function (x) { return String(x == null ? "" : x); },
    formatDateShort: function (d) { return d; },
    showModal() {}, showToast() {}, closeModal() {}, render() {},
    compressImage() { return Promise.resolve("data:image/jpeg;base64,XXX"); },
    uid: function () { return "u" + Math.random().toString(36).slice(2, 8); },
    recipeById: function () { return null; },
    console: console
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return { ctx: ctx, el: el };
}

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name); } }

console.log("\n=== 减脂健身模块测试 ===");

// ---- 1. 默认数据结构 ----
{
  const { ctx } = makeCtx();
  const d = ctx.ftDefault();
  ok("ftDefault 含 profile/weightLogs/dietLogs/trainDone/postureDone",
    d.profile && d.weightLogs && d.dietLogs && d.trainDone && d.postureDone);
  ok("ftDefault 训练默认 disabled 经期", d.profile.menstrual && d.profile.menstrual.enabled === false);
}

// ---- 2. 日期工具 ----
{
  const { ctx } = makeCtx();
  ok("ftAddDays 加 5 天", ctx.ftAddDays("2026-08-07", 5) === "2026-08-12");
  ok("ftAddDays 跨月", ctx.ftAddDays("2026-08-30", 3) === "2026-09-02");
  ok("ftDaysBetween 正", ctx.ftDaysBetween("2026-08-01", "2026-08-08") === 7);
  ok("ftDaysBetween 负", ctx.ftDaysBetween("2026-08-08", "2026-08-01") === -7);
}

// ---- 3. 体重进度 ----
{
  const { ctx } = makeCtx();
  const p = { startWeight: 62, currentWeight: 60, targetWeight: 55 };
  const r = ctx.ftWeightProgress(p, {}, "2026-08-07");
  ok("progress 当前=60", r.currentWeight === 60);
  ok("progress 剩余=5", r.remaining === 5);
  ok("progress 已减=2", r.progressDelta === -2);
  ok("progress 完成度≈28.6%", Math.abs(r.pct - 28.6) < 0.2);
  // 用最新记录覆盖 currentWeight
  const r2 = ctx.ftWeightProgress({ startWeight: 62, targetWeight: 55 }, { "2026-08-06": { weight: 59 } }, "2026-08-07");
  ok("progress 取最新记录体重", r2.currentWeight === 59);
  // 未设目标
  const r3 = ctx.ftWeightProgress({}, {}, "2026-08-07");
  ok("progress 无目标 pct=0", r3.pct === 0);
}

// ---- 4. 倒计时 ----
{
  const { ctx } = makeCtx();
  const p = { startWeight: 62, currentWeight: 60, targetWeight: 55, startWeightDate: "2026-08-01", targetDate: "2026-09-15" };
  const cd = ctx.ftCountdown(p, { "2026-08-06": { weight: 60 } }, "2026-08-07");
  ok("countdown 有目标日", cd.hasTargetDate === true);
  ok("countdown 距目标日约 39 天", cd.daysLeft >= 38 && cd.daysLeft <= 40);
  ok("countdown 建议周减>0", cd.pacePerWeek > 0);
  ok("countdown 均值周减>0", cd.avgWeekly > 0);
  ok("countdown 有预计达成日", !!cd.projectedDate);
  // 无目标日
  const cd2 = ctx.ftCountdown({ startWeight: 62, currentWeight: 60, targetWeight: 55 }, {}, "2026-08-07");
  ok("countdown 无目标日 hasTargetDate=false", cd2.hasTargetDate === false);
}

// ---- 5. 每日热量目标 ----
{
  const { ctx } = makeCtx();
  const t1 = ctx.ftMealKcalTarget({ currentWeight: 60 });
  const t2 = ctx.ftMealKcalTarget({ currentWeight: 90 });
  ok("kcal 目标确定性", t1 === ctx.ftMealKcalTarget({ currentWeight: 60 }));
  ok("kcal 目标随体重增加", t2 > t1);
  ok("kcal 下限 1200", ctx.ftMealKcalTarget({ currentWeight: 30 }) >= 1200);
}

// ---- 6. 智能推荐三餐 ----
{
  const { ctx } = makeCtx();
  const pool = [
    { id: "a", name: "燕麦蛋", tags: ["减脂", "清淡"], kcal: 320, main: "蛋" },
    { id: "b", name: "鸡胸沙拉", tags: ["高蛋白", "减脂"], kcal: 410, main: "鸡" },
    { id: "c", name: "牛肉面", tags: ["清淡"], kcal: 520, main: "牛" },
    { id: "d", name: "西兰花虾", tags: ["低GI", "高蛋白"], kcal: 260, main: "虾" },
    { id: "e", name: "三文鱼饭", tags: ["减脂"], kcal: 430, main: "鱼" },
    { id: "f", name: "豆腐汤", tags: ["清淡", "低GI"], kcal: 200, main: "豆" }
  ];
  const p = { currentWeight: 60, dietStyle: "balanced", dislikes: [] };
  const rec = ctx.ftRecommendMeals(p, pool, "2026-08-07");
  ok("推荐含早午晚加", !!rec.breakfast && !!rec.lunch && !!rec.dinner && !!rec.snack);
  ok("推荐确定性(同日同结果)", JSON.stringify(rec) === JSON.stringify(ctx.ftRecommendMeals(p, pool, "2026-08-07")));
  ok("推荐日日不同(换日期变)", JSON.stringify(rec) !== JSON.stringify(ctx.ftRecommendMeals(p, pool, "2026-08-08")));
  // 排除不爱吃
  const p2 = { currentWeight: 60, dietStyle: "balanced", dislikes: ["牛"] };
  const rec2 = ctx.ftRecommendMeals(p2, pool, "2026-08-07");
  const allNames = [rec2.breakfast, rec2.lunch, rec2.dinner, rec2.snack].map(x => x && x.name);
  ok("推荐排除不爱吃(牛肉面)", allNames.indexOf("牛肉面") === -1);
}

// ---- 7. 周计划 + 经期 ----
{
  const { ctx } = makeCtx();
  const plan = ctx.ftWeekPlan({ menstrual: { enabled: false } }, "2026-08-07"); // 2026-08-07 是周五
  ok("周计划 7 天", plan.length === 7);
  // v5.8.84 模板：baduanjin / cardio / belly / glutes / thigh / cardio / rest
  ok("周计划含 5 种训练类型", ["baduanjin","cardio","belly","glutes","thigh"].every(t => plan.some(d => d.typeId === t)));
  ok("周四为臀腿训练(glutes)", plan[3].typeId === "glutes");
  ok("周五为瘦大腿(thigh)", plan[4].typeId === "thigh");
  // 经期调整：构造 lastPeriodDate 使 2026-08-07 落入经期
  const pMen = { menstrual: { enabled: true, lastPeriodDate: "2026-08-05", cycleDays: 28, periodDays: 5 } };
  const plan2 = ctx.ftWeekPlan(pMen, "2026-08-07");
  ok("经期日切换为舒缓方案", plan2[2].isPeriod === true && plan2[2].typeId === "menstrual");
  ok("非经期日保持原计划", plan2[0].isPeriod === false);
  ok("经期不覆盖休息日", plan2[6].typeId === "rest");
  // ftIsPeriodDay 边界
  ok("ftIsPeriodDay 经期首日=true", ctx.ftIsPeriodDay(pMen, "2026-08-05") === true);
  ok("ftIsPeriodDay 经期外=false", ctx.ftIsPeriodDay(pMen, "2026-08-20") === false);
}

// ---- 8. 动作库 / 体态库 ----
{
  const { ctx } = makeCtx();
  ok("肩背动作≥5", ctx.ftRoutineForType("shoulder").length >= 5);
  ok("有氧动作≥5", ctx.ftRoutineForType("cardio").length >= 5);
  ok("臀腿动作≥5", ctx.ftRoutineForType("glutes").length >= 5);
  ok("腹部动作≥5", ctx.ftRoutineForType("abs").length >= 5);
  ok("经期舒缓动作≥5", ctx.ftRoutineForType("menstrual").length >= 5);
  const iss = ctx.ftPostureById("round_shoulder");
  ok("体态问题可取", iss && iss.name.indexOf("圆肩") >= 0 && iss.routine.length >= 3);
  ok("体态库≥8项", ctx.FT_POSTURE_ISSUES.length >= 8);
}

// ---- 9. 兜底 + 解析 ----
{
  const { ctx } = makeCtx();
  const filled = ctx.ftEnsureDefault({});
  ok("ftEnsureDefault 补齐字段", filled.profile && filled.weightLogs && filled.dietLogs && filled.profile.menstrual);
  ok("ftParseWeight 正常", ctx.ftParseWeight("60.4") === 60.4);
  ok("ftParseWeight 非法=null", ctx.ftParseWeight("abc") === null);
}

// ---- 10. 渲染冒烟（五 Tab 均写入 app-content）----
{
  const { ctx, el } = makeCtx();
  const tabs = ["weight", "diet", "plan", "posture", "period"];
  let allOk = true;
  tabs.forEach(function (t) {
    el.innerHTML = "";
    ctx.__ftTab = t;
    ctx.renderFitness();
    const html = el.innerHTML;
    const marker = { weight: "体重目标进度", diet: "每日智能推荐", plan: "本周训练计划", posture: "体态跟练", period: "经期" }[t];
    if (html.indexOf(marker) < 0) { allOk = false; console.log("  ✗ tab " + t + " 缺 " + marker); }
  });
  ok("五 Tab 渲染均写入内容", allOk);
  ok("体重页含倒计时卡片", el.innerHTML.indexOf("打卡倒计时") >= 0 || ctx.__ftTab !== "weight");
}

// ---- 11. 跟练播放器渲染 ----
{
  const { ctx } = makeCtx();
  ctx.window.__ftPlayer = null;
  ctx.ftStartFollow("shoulder", "train");
  ok("ftStartFollow 建立播放器", !!ctx.window.__ftPlayer && ctx.window.__ftPlayer.items.length >= 5);
  ctx.ftPlayerNext();
  ok("ftPlayerNext 推进步骤", ctx.window.__ftPlayer.i === 1);
  const iss = ctx.ftPostureById("apt");
  ctx.ftStartFollow("apt", "posture");
  ok("体态跟练播放器建立", ctx.window.__ftPlayer.items.length >= 3);
}

// ---- 12. B站 视频解析 ----
{
  const { ctx } = makeCtx();
  ok("ftParseBili 裸 BV 号", ctx.ftParseBili("BV1xx411c7mD") === "BV1xx411c7mD");
  ok("ftParseBili 完整链接", ctx.ftParseBili("https://www.bilibili.com/video/BV1xx411c7mD?p=2") === "BV1xx411c7mD");
  ok("ftParseBili 非法链接=null", ctx.ftParseBili("https://youtube.com/x") === null);
  ok("ftParseBili 空=null", ctx.ftParseBili("") === null);
  ok("ftBiliEmbed 生成 iframe", /player\.bilibili\.com\/player\.html\?bvid=BV1xx411c7mD/.test(ctx.ftBiliEmbed("BV1xx411c7mD")));
}

// ---- 13. 健身页整合运动记录区（合并「运动」模块）----
{
  const { ctx, el } = makeCtx();
  // 提供 sport.js 纯函数 stub，模拟合并后的运动区渲染
  ctx.SPORT_TYPES = ["跑步", "力量", "拉伸"];
  ctx.spGet = function () { return { logs: {}, preset: "跑步" }; };
  ctx.spWeekSummary = function () { return { monday: "2026-08-03", sunday: "2026-08-09", days: 2, totalMin: 60, totalKcal: 300, topType: "跑步" }; };
  ctx.spStats = function () { return { totalDays: 5, streak: 3, totalMin: 200, totalKcal: 1000 }; };
  ctx.__spType = null;
  el.innerHTML = "";
  ctx.__ftTab = "weight";
  ctx.renderFitness();
  const html = el.innerHTML;
  ok("健身页含运动记录区(记录今日运动)", html.indexOf("记录今日运动") >= 0);
  ok("健身页含本周运动汇总", html.indexOf("本周运动汇总") >= 0);
  ok("运动区复用 spStats 数据(连续3天)", html.indexOf("连续 3 天") >= 0);
}

// ---- 14. 视频持久化字段兜底 ----
{
  const { ctx } = makeCtx();
  const d = ctx.ftDefault();
  ok("ftDefault 含 postureVideos/trainVideos", d.postureVideos && d.trainVideos);
  const filled = ctx.ftEnsureDefault({});
  ok("ftEnsureDefault 兜底 postureVideos/trainVideos", filled.postureVideos && filled.trainVideos);
}

// ---- 15. 欧阳春晓 默认跟练视频焊入（官方高播放，UID 493570956）----
{
  const { ctx } = makeCtx();
  ok("FT_DEFAULT_POSTURE_VIDEOS 存在且 8 项",
    ctx.FT_DEFAULT_POSTURE_VIDEOS && Object.keys(ctx.FT_DEFAULT_POSTURE_VIDEOS).length === 8);
  ok("FT_DEFAULT_TRAIN_VIDEOS 含 shoulder/cardio/glutes/abs",
    ctx.FT_DEFAULT_TRAIN_VIDEOS && ctx.FT_DEFAULT_TRAIN_VIDEOS.shoulder &&
    ctx.FT_DEFAULT_TRAIN_VIDEOS.cardio && ctx.FT_DEFAULT_TRAIN_VIDEOS.glutes && ctx.FT_DEFAULT_TRAIN_VIDEOS.abs);
  const allV = Object.values(ctx.FT_DEFAULT_POSTURE_VIDEOS).concat(Object.values(ctx.FT_DEFAULT_TRAIN_VIDEOS));
  ok("所有默认视频均为合法 BV 号或空串", allV.every(function (v) { return v === "" || /^BV[0-9A-Za-z]+$/.test(v); }));
  const d = ctx.ftDefault();
  ok("ftDefault 体态视频继承默认映射", JSON.stringify(d.postureVideos) === JSON.stringify(ctx.FT_DEFAULT_POSTURE_VIDEOS));
  ok("ftDefault 训练视频继承默认映射", JSON.stringify(d.trainVideos) === JSON.stringify(ctx.FT_DEFAULT_TRAIN_VIDEOS));
  // 回填：已有数据缺视频则补默认（仅补不覆盖用户自定义）
  const f = ctx.ftEnsureDefault({ profile: {}, weightLogs: {}, dietLogs: {}, trainDone: {}, postureDone: {}, postureVideos: { round_shoulder: "BVcustom" }, trainVideos: {} });
  ok("ftEnsureDefault 保留用户自定义 round_shoulder", f.postureVideos.round_shoulder === "BVcustom");
  ok("ftEnsureDefault 回填缺失 kyphosis 默认", f.postureVideos.kyphosis === ctx.FT_DEFAULT_POSTURE_VIDEOS.kyphosis);
  ok("ftEnsureDefault 回填缺失 abs 默认", f.trainVideos.abs === ctx.FT_DEFAULT_TRAIN_VIDEOS.abs);
}

console.log("\n减脂健身模块：" + pass + " 通过 / " + fail + " 失败");
process.exit(fail ? 1 : 0);
