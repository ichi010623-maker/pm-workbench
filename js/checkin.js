// =============================================================
// 🎯 每日打卡 + 阶段奖励（纯逻辑，Node vm 可测）
// 数据挂 DB.data.growth.checkin
// 打卡 = 当日 英语学习 + 饮食打卡 + 运动记录 三件事全部完成
// 奖励阶梯：每天=神秘小奖励；连续7天(每满7天)=中奖励；首个30天=大奖励；首个90天=超大奖励
// =============================================================

var CK_REWARD_POOLS = {
  small: [
    "喝一杯手冲咖啡 ☕",
    "听一首喜欢的歌 🎧",
    "出门散步 15 分钟 🚶",
    "给在乎的人发条消息 💌",
    "读一页闲书 📖",
    "深呼吸放松 60 秒 🌬️",
    "奖励一颗黑巧克力 🍫",
    "整理桌面 5 分钟 🗂️",
    "夸一夸今天的自己 🌟",
    "喝一大杯水，早点睡 🌙"
  ],
  medium: [
    "买一本喜欢的书 📚",
    "看一部收藏已久的电影 🎬",
    "安排一顿健康大餐 🍱",
    "给自己做一次 30 分钟拉伸/按摩 💆",
    "买一束花装点房间 💐",
    "约朋友吃顿饭 🍜"
  ],
  large: [
    "给自己放一天假 🏖️",
    "买一件心仪已久的物品 🎁",
    "安排一次短途旅行/郊游 🧳",
    "升级运动装备（跑鞋/耳机）👟",
    "做一次全面体检，奖励自律的自己 🩺"
  ],
  xl: [
    "一场说走就走的旅行 ✈️",
    "升级一件提升生活品质的大件 🏆",
    "三天充电计划：远离屏幕，回归自然 🔋",
    "完成一次断舍离大扫除，焕新生活空间 🏡",
    "犒劳自己一次特别体验（潜水/演出/美食之旅）🎉"
  ]
};

var CK_REWARD_NAMES = { small: "🎁 神秘小奖励", medium: "🎉 阶段中奖励", large: "🏅 月度大奖励", xl: "👑 季度超大奖励" };

function ckDefault() {
  return {
    days: {},        // { "2026-08-06": { english, food, sport, done } }
    rewards: { small: [], medium: [], large: [], xl: [] },   // [{ date, streak, text }]
    streak: 0,       // 当前连续打卡天数（截至今天）
    lastDate: null,  // 最近一次打卡成功日期
    best: 0          // 历史最高连续天数
  };
}

// 日期加减（UTC 安全，避免本地时区偏移 bug）
function ckAddDays(dateStr, delta) {
  var d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

// 确定性伪随机（同一天同奖励稳定，神秘但可复现）
function ckHash(seed) {
  var h = 0;
  var s = String(seed);
  for (var i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
  return (h >>> 0) / 4294967296;
}

// 从奖励池确定性抽取一条
function ckPickReward(level, dateStr, pool) {
  var arr = (pool || CK_REWARD_POOLS)[level] || [];
  if (!arr.length) return "";
  return arr[Math.floor(ckHash(dateStr + ":" + level) * arr.length)];
}

// 写入某天三件事完成情况（直接更新并返回 checkin）
function ckComputeDay(checkin, dateStr, englishDone, foodDone, sportDone) {
  if (!checkin.days) checkin.days = {};
  var day = checkin.days[dateStr] = checkin.days[dateStr] || {};
  day.english = !!englishDone;
  day.food = !!foodDone;
  day.sport = !!sportDone;
  day.done = !!(englishDone && foodDone && sportDone);
  return checkin;
}

// 截至 upToDate 的连续打卡天数（今天未完成不算断，从昨天起数）
function ckStreakOf(checkin, upToDate) {
  var days = checkin.days || {};
  var d = upToDate;
  if (!days[d] || !days[d].done) d = ckAddDays(d, -1);
  var streak = 0;
  while (days[d] && days[d].done) { streak++; d = ckAddDays(d, -1); }
  return streak;
}

// 计算并写回 streak / lastDate / best（best 全量扫描历史，防漏算）
function ckUpdateStreak(checkin, dateStr) {
  checkin.days = checkin.days || {};
  checkin.streak = ckStreakOf(checkin, dateStr);
  if (checkin.days[dateStr] && checkin.days[dateStr].done) checkin.lastDate = dateStr;
  var dates = Object.keys(checkin.days).filter(function (d) { return checkin.days[d].done; }).sort();
  var best = 0, run = 0, prev = null;
  dates.forEach(function (d) {
    if (prev && ckAddDays(prev, 1) === d) { run++; } else { run = 1; }
    if (run > best) best = run;
    prev = d;
  });
  if (best > (checkin.best || 0)) checkin.best = best;
  return checkin;
}

// 今天应发但尚未发放的奖励（幂等判定）
function ckRewardsDue(checkin, dateStr) {
  var due = [];
  var streak = ckStreakOf(checkin, dateStr);
  if (streak >= 1) {
    var smallDates = (checkin.rewards.small || []).map(function (r) { return r.date; });
    if (smallDates.indexOf(dateStr) < 0) due.push({ level: "small", streak: streak });
  }
  if (streak >= 7 && streak % 7 === 0) {
    var m = checkin.rewards.medium || [];
    if (!m.some(function (r) { return r.streak === streak; })) due.push({ level: "medium", streak: streak });
  }
  if (streak >= 30 && !(checkin.rewards.large || []).length) due.push({ level: "large", streak: 30 });
  if (streak >= 90 && !(checkin.rewards.xl || []).length) due.push({ level: "xl", streak: 90 });
  return due;
}

// 发放今日到期奖励（幂等；返回 granted 列表）
function ckEnsureRewards(checkin, dateStr) {
  if (!checkin.rewards) checkin.rewards = { small: [], medium: [], large: [], xl: [] };
  var granted = [];
  ckRewardsDue(checkin, dateStr).forEach(function (d) {
    var text = ckPickReward(d.level, dateStr, CK_REWARD_POOLS);
    checkin.rewards[d.level].push({ date: dateStr, streak: d.streak, text: text });
    granted.push({ level: d.level, streak: d.streak, text: text });
  });
  return { checkin: checkin, granted: granted };
}

// 汇总：today 三件事状态 + 连续天数 + 下个里程碑
function ckTodayView(checkin, dateStr, englishDone, foodDone, sportDone) {
  checkin = ckComputeDay(checkin, dateStr, englishDone, foodDone, sportDone);
  checkin = ckUpdateStreak(checkin, dateStr);
  var day = checkin.days[dateStr];
  var milestones = [7, 30, 90];
  var nxt = null;
  for (var i = 0; i < milestones.length; i++) { if (checkin.streak < milestones[i]) { nxt = milestones[i]; break; } }
  return {
    date: dateStr,
    english: day.english, food: day.food, sport: day.sport, done: day.done,
    streak: checkin.streak, best: checkin.best || 0, lastDate: checkin.lastDate,
    nextMilestone: nxt
  };
}

// 日历格子数据：monthStr 形如 "2026-08"；historyDates 为有简报留存的日期数组
function ckCalendarCells(checkin, historyDates, monthStr) {
  var days = (checkin && checkin.days) || {};
  var hist = historyDates || [];
  var y = parseInt(monthStr.slice(0, 4), 10);
  var m = parseInt(monthStr.slice(5, 7), 10);
  var first = new Date(Date.UTC(y, m - 1, 1, 12));
  var last = new Date(Date.UTC(y, m, 0, 12));
  var out = [];
  var d = new Date(Date.UTC(y, m - 1, 1, 12));
  // 补齐月历头部（周一为一周起始）
  var lead = (first.getUTCDay() + 6) % 7;
  for (var i = 0; i < lead; i++) out.push({ date: "", day: "", done: false, brief: false, english: false, food: false, sport: false, inMonth: false, today: false });
  for (d = new Date(Date.UTC(y, m - 1, 1, 12)); d <= last; d.setUTCDate(d.getUTCDate() + 1)) {
    var ds = d.toISOString().slice(0, 10);
    var rec = days[ds] || {};
    out.push({
      date: ds, day: d.getUTCDate(), done: !!rec.done, brief: hist.indexOf(ds) !== -1,
      english: !!rec.english, food: !!rec.food, sport: !!rec.sport,
      inMonth: true, today: ds === (typeof today === "function" ? today() : "")
    });
  }
  return out;
}
