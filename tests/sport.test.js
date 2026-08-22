// 运动记录模块自动化测试（Node vm 加载 js/sport.js）
// 运行：node tests/sport.test.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const src = fs.readFileSync(path.join(ROOT, "js", "sport.js"), "utf8");

const sandbox = {
  console, Math, Date, JSON, Object, Array, String, Number, parseInt, parseFloat, isNaN,
  today: () => "2026-08-06"   // 周四
};
vm.createContext(sandbox);
vm.runInContext(src, sandbox);

const { SPORT_TYPES, spDefault, spLogDay, spRemoveLog, spWeekSummary, spStats } = sandbox;

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error("  ✗ " + msg); } }
function section(name) { console.log("\n▶ " + name); }

section("A. 默认结构");
var d = spDefault();
ok(d.logs && typeof d.logs === "object" && d.preset === "跑步", "默认 logs 空 + preset=跑步");
ok(SPORT_TYPES.indexOf("跑步") >= 0 && SPORT_TYPES.length >= 8, "运动类型齐全");

section("B. spLogDay 记录");
var s = spDefault();
spLogDay(s, "2026-08-06", "跑步", 30, 200, "晨跑");
ok(s.logs["2026-08-06"].type === "跑步" && s.logs["2026-08-06"].durationMin === 30 && s.logs["2026-08-06"].kcal === 200 && s.logs["2026-08-06"].note === "晨跑", "记录类型/时长/千卡/备注");
ok(s.preset === "跑步", "preset 更新为上次类型");
var threw = false;
try { spLogDay(spDefault(), "2026-08-06", "跑步", 0, 0, ""); } catch (e) { threw = true; }
ok(threw, "时长为 0 抛错（UI 拦截，函数兜底）");
spRemoveLog(s, "2026-08-06");
ok(!s.logs["2026-08-06"], "删除某天记录");

section("C. spWeekSummary 本周汇总");
// 2026-08-06 是周四，本周一 = 08-03
var w = spDefault();
spLogDay(w, "2026-08-03", "跑步", 30, 200, "");
spLogDay(w, "2026-08-05", "骑行", 45, 250, "");
spLogDay(w, "2026-08-06", "跑步", 20, 120, "");
spLogDay(w, "2026-07-30", "游泳", 60, 400, "");   // 上周，不应计入本周
var wk = spWeekSummary(w, "2026-08-06");
ok(wk.monday === "2026-08-03" && wk.sunday === "2026-08-09", "周一起始范围正确");
ok(wk.days === 3, "本周运动 3 天");
ok(wk.totalMin === 95, "本周总时长 95 分钟（不含上周）");
ok(wk.totalKcal === 570, "本周总千卡 570");
ok(wk.topType === "跑步", "主力类型=跑步（50 分钟 > 45）");

section("D. spStats 总统计");
var st = spStats(w);
ok(st.totalDays === 4 && st.totalMin === 155 && st.totalKcal === 970, "总天数/时长/千卡统计");
ok(st.streak === 2, "连续运动 2 天（8-05、8-06 连续；8-03 与 8-05 间缺 8-04）");
var s2 = spDefault();
spLogDay(s2, "2026-08-04", "跑步", 20, 0, "");
spLogDay(s2, "2026-08-05", "跑步", 20, 0, "");
spLogDay(s2, "2026-08-06", "跑步", 20, 0, "");
ok(spStats(s2).streak === 3, "连续运动 3 天");
var s3 = spDefault();
spLogDay(s3, "2026-08-04", "跑步", 20, 0, "");
spLogDay(s3, "2026-08-06", "跑步", 20, 0, "");
ok(spStats(s3).streak === 1, "中断后仅 1 天连续");

console.log("\n=== 运动记录模块 测试完成 ===");
console.log("通过 " + pass + " / 失败 " + fail);
if (fail > 0) process.exit(1);
