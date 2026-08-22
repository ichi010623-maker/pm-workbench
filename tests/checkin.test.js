// 每日打卡 + 阶段奖励模块自动化测试（Node vm 加载 js/checkin.js）
// 运行：node tests/checkin.test.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const src = fs.readFileSync(path.join(ROOT, "js", "checkin.js"), "utf8");

const sandbox = {
  console, Math, Date, JSON, Object, Array, String, Number, parseInt, parseFloat, isNaN,
  today: () => "2026-08-06"
};
vm.createContext(sandbox);
vm.runInContext(src, sandbox);

const {
  CK_REWARD_POOLS, CK_REWARD_NAMES, ckDefault, ckAddDays, ckPickReward,
  ckComputeDay, ckStreakOf, ckUpdateStreak, ckRewardsDue, ckEnsureRewards,
  ckTodayView, ckCalendarCells
} = sandbox;

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error("  ✗ " + msg); } }
function section(name) { console.log("\n▶ " + name); }

section("A. 默认结构与奖励池");
var d = ckDefault();
ok(d.days && d.rewards && d.rewards.small && d.rewards.medium && d.rewards.large && d.rewards.xl, "默认结构含 days + 四级 rewards");
ok(d.streak === 0 && d.best === 0 && d.lastDate === null, "默认 streak/best/lastDate 正确");
ok(CK_REWARD_POOLS.small.length >= 5 && CK_REWARD_POOLS.medium.length >= 3 && CK_REWARD_POOLS.large.length >= 3 && CK_REWARD_POOLS.xl.length >= 3, "四级奖励池齐全");
ok(CK_REWARD_NAMES.small && CK_REWARD_NAMES.xl, "奖励级别中文名齐全");
ok(ckAddDays("2026-08-06", 1) === "2026-08-07" && ckAddDays("2026-08-01", -1) === "2026-07-31", "ckAddDays UTC 跨月/跨年正确");

section("B. ckComputeDay 三件事判定");
var c1 = ckDefault();
ckComputeDay(c1, "2026-08-06", true, true, true);
ok(c1.days["2026-08-06"].done === true && c1.days["2026-08-06"].english && c1.days["2026-08-06"].food && c1.days["2026-08-06"].sport, "三件事全完成 → done");
var c2 = ckDefault();
ckComputeDay(c2, "2026-08-06", true, false, true);
ok(c2.days["2026-08-06"].done === false, "缺一件 → done=false");
var c3 = ckDefault();
ckComputeDay(c3, "2026-08-06", 0, "", null);
ok(c3.days["2026-08-06"].done === false && c3.days["2026-08-06"].english === false, "0/空/null 视为未完成");

section("C. ckStreakOf 连续天数");
var s = ckDefault();
ckComputeDay(s, "2026-08-04", true, true, true);
ckComputeDay(s, "2026-08-05", true, true, true);
ckComputeDay(s, "2026-08-06", true, true, true);
ok(ckStreakOf(s, "2026-08-06") === 3, "连续 3 天（含今天）");
var s2 = ckDefault();
ckComputeDay(s2, "2026-08-04", true, true, true);
ckComputeDay(s2, "2026-08-05", true, true, true);
// 今天 8-06 未打卡 → 不算断，streak 数到昨天
ok(ckStreakOf(s2, "2026-08-06") === 2, "今天未打卡从昨天起数，连续 2 天");
var s3 = ckDefault();
ckComputeDay(s3, "2026-08-02", true, true, true);
ckComputeDay(s3, "2026-08-04", true, true, true);
ok(ckStreakOf(s3, "2026-08-06") === 0, "中间断档 → 0（今天未打卡且昨天未打卡）");
var s4 = ckDefault();
ckComputeDay(s4, "2026-08-01", true, true, true);
ckComputeDay(s4, "2026-08-02", true, true, true);
ckComputeDay(s4, "2026-08-04", true, true, true);
ckUpdateStreak(s4, "2026-08-04");
ok(s4.streak === 1 && s4.best === 2, "best 记录历史最高 2 天，当前 1 天");

section("D. 奖励发放（每日/7天/30天/90天 + 幂等）");
var r = ckDefault();
for (var i = 6; i >= 1; i--) { ckComputeDay(r, ckAddDays("2026-08-06", -i), true, true, true); }
ckComputeDay(r, "2026-08-06", true, true, true);
ckUpdateStreak(r, "2026-08-06");
ok(r.streak === 7, "构造出连续 7 天");
var due1 = ckRewardsDue(r, "2026-08-06");
ok(due1.some(function (x) { return x.level === "small"; }), "每天发神秘小奖励");
ok(due1.some(function (x) { return x.level === "medium"; }), "连续 7 天发中奖励");
var g1 = ckEnsureRewards(r, "2026-08-06").granted;
ok(g1.some(function (x) { return x.level === "small"; }) && g1.some(function (x) { return x.level === "medium"; }), "本次发放包含小+中奖励");
var g2 = ckEnsureRewards(r, "2026-08-06").granted;
ok(g2.length === 0, "同日重复 ensure 幂等不重发");
var same = ckPickReward("small", "2026-08-06", CK_REWARD_POOLS);
ok(same === ckPickReward("small", "2026-08-06", CK_REWARD_POOLS), "同日期抽奖确定性（神秘但稳定）");
// 30 天大奖励
var r30 = ckDefault();
for (var j = 29; j >= 0; j--) { ckComputeDay(r30, ckAddDays("2026-08-06", -j), true, true, true); }
ckUpdateStreak(r30, "2026-08-06");
ok(r30.streak === 30, "构造出连续 30 天");
var due30 = ckRewardsDue(r30, "2026-08-06");
ok(due30.some(function (x) { return x.level === "large"; }), "30 天发大奖励");
var g30 = ckEnsureRewards(r30, "2026-08-06").granted;
ok(g30.some(function (x) { return x.level === "large"; }), "30 天大奖励发放成功");
var g30b = ckEnsureRewards(r30, "2026-08-07").granted; // 31 天
ok(!g30b.some(function (x) { return x.level === "large"; }), "大奖励只发一次（31 天不再发）");
// 90 天超大奖励
var r90 = ckDefault();
for (var k = 89; k >= 0; k--) { ckComputeDay(r90, ckAddDays("2026-08-06", -k), true, true, true); }
ckUpdateStreak(r90, "2026-08-06");
ok(r90.streak === 90, "构造出连续 90 天");
var due90 = ckRewardsDue(r90, "2026-08-06");
ok(due90.some(function (x) { return x.level === "xl"; }), "90 天发超大奖励");
var g90 = ckEnsureRewards(r90, "2026-08-06").granted;
ok(g90.some(function (x) { return x.level === "xl"; }), "超大奖励发放成功");
// 7 天倍数：14 天再发一个中奖励
var r14 = ckDefault();
for (var n = 13; n >= 0; n--) { ckComputeDay(r14, ckAddDays("2026-08-06", -n), true, true, true); }
ckUpdateStreak(r14, "2026-08-06");
var due14 = ckRewardsDue(r14, "2026-08-06");
ok(due14.some(function (x) { return x.level === "medium"; }), "连续 14 天再发中奖励（每满 7 天）");

section("E. 日历格子 ckCalendarCells");
var cal = ckDefault();
ckComputeDay(cal, "2026-08-05", true, true, true);
var cells = ckCalendarCells(cal, ["2026-08-05", "2026-08-06"], "2026-08");
ok(cells.filter(function (x) { return x.inMonth; }).length === 31, "8 月共 31 天");
var c0506 = cells.filter(function (x) { return x.date === "2026-08-05"; })[0];
ok(c0506.done && c0506.brief, "8-05 打卡成功且简报完成标记");
var c06 = cells.filter(function (x) { return x.date === "2026-08-06"; })[0];
ok(c06.brief && c06.today, "8-06 简报完成 + today 标记");
var lead = cells.filter(function (x) { return !x.inMonth; }).length;
ok(lead === 5, "2026-08-01 为周六，周一起始补 5 个空位");
var c0701 = ckCalendarCells(ckDefault(), [], "2026-07");
ok(c0701.filter(function (x) { return x.inMonth; }).length === 31, "7 月 31 天");

section("F. ckTodayView 汇总");
var tv = ckTodayView(ckDefault(), "2026-08-06", true, true, true);
ok(tv.done && tv.streak === 1 && tv.nextMilestone === 7, "今天完成 → streak 1、下一里程碑 7 天");
var tv2 = ckTodayView(ckDefault(), "2026-08-06", true, false, true);
ok(tv2.done === false && tv2.nextMilestone === 7, "缺一件未完成");

console.log("\n=== 每日打卡·奖励模块 测试完成 ===");
console.log("通过 " + pass + " / 失败 " + fail);
if (fail > 0) process.exit(1);
