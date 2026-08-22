// =============================================================
// 🏃 运动记录模块（纯逻辑，Node vm 可测）
// 数据挂 DB.data.growth.sport = { logs: { "2026-08-06": { type, durationMin, kcal, note } }, preset }
// =============================================================

var SPORT_TYPES = ["跑步", "快走", "骑行", "游泳", "力量训练", "瑜伽", "跳绳", "羽毛球", "篮球", "健身操", "徒步", "球类", "其他"];

function spDefault() {
  return { logs: {}, preset: "跑步" };
}

// 记录某天运动（直接更新并返回 sport）
function spLogDay(sport, dateStr, type, durationMin, kcal, note) {
  if (!sport.logs) sport.logs = {};
  durationMin = parseInt(durationMin, 10) || 0;
  if (durationMin <= 0) throw new Error("运动时长必须大于 0");
  sport.logs[dateStr] = {
    type: String(type || "其他"),
    durationMin: durationMin,
    kcal: parseInt(kcal, 10) || 0,
    note: String(note || "").trim()
  };
  if (type) sport.preset = String(type);
  return sport;
}

// 删除某天运动记录
function spRemoveLog(sport, dateStr) {
  if (!sport.logs) sport.logs = {};
  delete sport.logs[dateStr];
  return sport;
}

// 本周汇总（周一为一周起始）
function spWeekSummary(sport, todayStr) {
  var logs = (sport && sport.logs) || {};
  var d = new Date(todayStr + "T12:00:00Z");
  var dow = (d.getUTCDay() + 6) % 7;   // 0=周一
  var monday = new Date(d); monday.setUTCDate(d.getUTCDate() - dow);
  var sunday = new Date(monday); sunday.setUTCDate(monday.getUTCDate() + 6);
  var days = 0, totalMin = 0, totalKcal = 0, types = {};
  for (var i = 0; i < 7; i++) {
    var ds = new Date(monday); ds.setUTCDate(monday.getUTCDate() + i);
    var key = ds.toISOString().slice(0, 10);
    var rec = logs[key];
    if (rec) {
      days++;
      totalMin += rec.durationMin || 0;
      totalKcal += rec.kcal || 0;
      types[rec.type] = (types[rec.type] || 0) + (rec.durationMin || 0);
    }
  }
  var topType = "—";
  var topMin = 0;
  Object.keys(types).forEach(function (t) { if (types[t] > topMin) { topMin = types[t]; topType = t; } });
  return { monday: monday.toISOString().slice(0, 10), sunday: sunday.toISOString().slice(0, 10), days: days, totalMin: totalMin, totalKcal: totalKcal, topType: topType };
}

// 总统计
function spStats(sport) {
  var logs = (sport && sport.logs) || {};
  var dates = Object.keys(logs).sort();
  var totalDays = dates.length;
  var totalMin = 0, totalKcal = 0;
  dates.forEach(function (k) { totalMin += logs[k].durationMin || 0; totalKcal += logs[k].kcal || 0; });
  // 连续运动天数（截至最近一次记录，含今天与否皆可）
  var streak = 0;
  if (dates.length) {
    var d = new Date((typeof today === "function" ? today() : "2026-01-01") + "T12:00:00Z");
    if (!logs[d.toISOString().slice(0, 10)]) d.setUTCDate(d.getUTCDate() - 1);
    while (logs[d.toISOString().slice(0, 10)]) { streak++; d.setUTCDate(d.getUTCDate() - 1); }
  }
  return { totalDays: totalDays, totalMin: totalMin, totalKcal: totalKcal, streak: streak };
}
