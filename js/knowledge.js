// ===== 知识学习（个人成长）=====
// 数据来自 data/knowledge.json（按日期历史结构）：
//   pool   : 全部知识卡（扁平，含 cat 字段）
//   cats   : 分类元数据（id/name/icon/desc）
//   history: [{date, itemIds}] 每日发布记录（驱动日历圆点 + 每日 20 新知）
//   dailyCount: 每天新发布的卡数
// 交互：翻卡学习 / ⭐收藏 / 💬评论 / 📅微信式历史日历 / 全部 / 收藏。
// 收藏与评论存 localStorage（本机维度，无后端同步）。
// 依赖：escapeHtml / showToast / APP_VERSION / localStorage / document / Date

// ---------- 纯函数（可单测） ----------
function learnCatMeta(catId) {
  var d = learnData();
  if (!d || !d.cats) return { id: catId, name: catId, icon: "🧠" };
  var c = d.cats.filter(function (x) { return x.id === catId; })[0];
  return c || { id: catId, name: catId, icon: "🧠" };
}
// 每日发布选择：从 history 已用过的卡里跳过，续接循环；池用尽则回绕（允许重复）。
function learnNextDailyItemIds(pool, history, dailyCount) {
  dailyCount = dailyCount || 1;
  if (!pool || !pool.length) return [];
  var used = {};
  (history || []).forEach(function (h) {
    (h.itemIds || []).forEach(function (id) { used[id] = 1; });
  });
  var out = [], i = 0, guard = 0;
  while (out.length < dailyCount && guard < pool.length * 6) {
    var cand = pool[i % pool.length].id;
    if (!used[cand]) { out.push(cand); used[cand] = 1; }
    i++; guard++;
    // 池已用尽则重置 used，允许回绕重复，避免出现空数组导致每日停更
    if (i >= pool.length && out.length < dailyCount) used = {};
  }
  return out;
}

// ---------- 数据加载 ----------
function learnData() {
  return (window.__knowledge && window.__knowledge.pool) ? window.__knowledge : null;
}
async function learnLoad() {
  var t = (typeof today === "function") ? today() : new Date().toISOString().slice(0, 10);
  if (window.__knowledge && window.__knowledge.__date === t) return window.__knowledge;
  try {
    var ver = (typeof APP_VERSION !== "undefined") ? APP_VERSION : "";
    var r = await fetch("data/knowledge.json?v=" + ver + "&d=" + t);
    if (!r.ok) r = await fetch("data/knowledge.json?v=" + ver);
    if (!r.ok) return null;
    var j = await r.json();
    j.__date = t;
    window.__knowledge = j;
    return j;
  } catch (e) { return null; }
}
function learnPool() {
  var d = learnData();
  return d ? (d.pool || []) : [];
}
function learnItemById(id) {
  var p = learnPool();
  for (var i = 0; i < p.length; i++) if (p[i].id === id) return p[i];
  return null;
}
function learnHistory() {
  var d = learnData();
  return d ? (d.history || []) : [];
}
function learnHistoryByDate(date) {
  var h = learnHistory();
  for (var i = 0; i < h.length; i++) if (h[i].date === date) return h[i];
  return null;
}
function learnItemsByDate(date) {
  var h = learnHistoryByDate(date);
  if (!h) return [];
  return (h.itemIds || []).map(learnItemById).filter(Boolean);
}
function learnAllItems() { return learnPool(); }
function learnItemsByCat(cat) {
  var p = learnPool();
  if (!cat || cat === "all") return p;
  return p.filter(function (it) { return it.cat === cat; });
}
function learnTodayDate() {
  var h = learnHistory();
  if (h.length) return h[h.length - 1].date; // 最新一天
  return (typeof today === "function") ? today() : new Date().toISOString().slice(0, 10);
}
function learnStats() {
  return { total: learnPool().length, seen: learnCount(), fav: learnFavCount() };
}

// ---------- 学习进度（localStorage） ----------
function learnSeenKey() { return "hw_pm_learn_seen"; }
function learnSeen() {
  try { var s = localStorage.getItem(learnSeenKey()); return s ? (JSON.parse(s) || {}) : {}; }
  catch (e) { return {}; }
}
function learnCount() { return Object.keys(learnSeen()).length; }
function learnMark(id) {
  var seen = learnSeen();
  var r;
  if (seen[id]) { delete seen[id]; r = 0; } else { seen[id] = 1; r = 1; }
  try { localStorage.setItem(learnSeenKey(), JSON.stringify(seen)); } catch (e) {}
  return r;
}

// ---------- 收藏（localStorage） ----------
function learnFavKey() { return "hw_pm_learn_fav"; }
function learnFavSet() {
  try { var s = localStorage.getItem(learnFavKey()); return s ? (JSON.parse(s) || {}) : {}; }
  catch (e) { return {}; }
}
function learnFavCount() { return Object.keys(learnFavSet()).length; }
function learnIsFav(id) { return !!learnFavSet()[id]; }
function learnFavItems() {
  var f = learnFavSet();
  return learnPool().filter(function (it) { return f[it.id]; });
}

// ---------- 评论（localStorage） ----------
function learnCmtKey() { return "hw_pm_learn_comments"; }
function learnAllComments() {
  try { var s = localStorage.getItem(learnCmtKey()); return s ? (JSON.parse(s) || {}) : {}; }
  catch (e) { return {}; }
}
function learnCommentsFor(id) { return learnAllComments()[id] || []; }
function learnCmtCount(id) { return learnCommentsFor(id).length; }
function learnAddComment(id, text) {
  text = (text || "").trim();
  if (!text) return false;
  var all = learnAllComments();
  if (!all[id]) all[id] = [];
  all[id].push({ text: text, ts: Date.now() });
  try { localStorage.setItem(learnCmtKey(), JSON.stringify(all)); } catch (e) {}
  return true;
}
function learnDelComment(id, idx) {
  var all = learnAllComments();
  if (all[id] && all[id][idx]) { all[id].splice(idx, 1); if (!all[id].length) delete all[id]; }
  try { localStorage.setItem(learnCmtKey(), JSON.stringify(all)); } catch (e) {}
}

// ---------- SVG 示意图（16 种，内置手绘） ----------
function ldSvg(inner) {
  return '<svg viewBox="0 0 300 120" width="100%" height="120" xmlns="http://www.w3.org/2000/svg" role="img">' +
    '<defs><marker id="ldarr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">' +
    '<path d="M0,0 L10,5 L0,10 z" fill="#94a3b8"/></marker></defs>' + inner + '</svg>';
}
function ldBox(x, y, w, h, label, fill, fc, fs) {
  return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="9" fill="' + fill + '" stroke="#cbd5e1" stroke-width="1"/>' +
    '<text x="' + (x + w / 2) + '" y="' + (y + h / 2 + 4) + '" text-anchor="middle" font-size="' + (fs || 12) + '" font-weight="600" fill="' + (fc || "#334155") + '">' + label + '</text>';
}
function ldText(x, y, label, size, fill, weight) {
  return '<text x="' + x + '" y="' + y + '" font-size="' + (size || 11) + '" fill="' + (fill || "#64748b") + '" font-weight="' + (weight || 400) + '">' + label + '</text>';
}
function ldArrow(x1, y1, x2, y2) {
  return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="#94a3b8" stroke-width="2" marker-end="url(#ldarr)"/>';
}
function ldCircle(cx, cy, r, fill) { return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + fill + '"/>'; }
function ldLine(x1, y1, x2, y2, color, w, dash) {
  return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + (color || "#94a3b8") + '" stroke-width="' + (w || 2) + '"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + '/>';
}
function ldPoly(points, stroke) { return '<polyline points="' + points + '" fill="none" stroke="' + (stroke || "#3b82f6") + '" stroke-width="2.5" stroke-linejoin="round"/>'; }

function learnDiag(kind) {
  var B = "#3b82f6", G = "#22c55e", O = "#f59e0b", P = "#8b5cf6", R = "#ef4444", T = "#64748b";
  var bf = "#dbeafe", gf = "#dcfce7", of = "#fef3c7", pf = "#ede9fe", rf = "#fee2e2";
  switch (kind) {
    case "llm": return ldSvg(
      ldBox(8, 45, 62, 34, "输入文字", bf, "#1d4ed8") + ldArrow(72, 62, 92, 62) +
      ldBox(94, 33, 100, 56, "大语言模型", pf, "#6d28d9", 13) + ldText(144, 80, "概率大脑", 10, "#8b5cf6") +
      ldArrow(196, 62, 214, 62) + ldBox(216, 45, 76, 34, "输出下一句", gf, "#15803d") +
      ldText(150, 20, "预测“下一个词最可能是什么”", 11, T, 600) + ldText(150, 112, "读得够多 → 说得像人", 10.5, T));
    case "token": return ldSvg(
      ldBox(8, 40, 52, 40, "我", bf, "#1d4ed8", 15) + ldBox(64, 40, 52, 40, "爱", bf, "#1d4ed8", 15) + ldBox(120, 40, 52, 40, "AI", bf, "#1d4ed8", 15) +
      ldText(146, 108, "1 个汉字 ≈ 1~2 Token", 11, T, 600) + ldArrow(176, 60, 196, 60) +
      ldBox(198, 40, 94, 40, "计费：输入+输出", of, "#b45309", 12) + ldText(150, 20, "“我爱AI”被切成小块 → 按块收费", 11, T, 600));
    case "prompt": return ldSvg(
      ldBox(8, 22, 84, 76, "", of, "", 0) + ldText(50, 42, "角色：你是专家", 10.5, "#92400e", 600) + ldText(50, 60, "任务：帮我分析", 10.5, "#92400e", 600) +
      ldText(50, 78, "要求：用表格输出", 10.5, "#92400e", 600) + ldText(50, 94, "格式：分 3 点", 10.5, "#92400e", 600) +
      ldArrow(94, 62, 112, 62) + ldBox(114, 40, 74, 44, "模型", pf, "#6d28d9", 12) + ldArrow(190, 62, 208, 62) +
      ldBox(210, 40, 82, 44, "想要的好答案", gf, "#15803d", 12) + ldText(150, 14, "说清楚 → 答得准", 11, T, 600));
    case "context": return ldSvg(
      ldBox(8, 30, 284, 40, "", bf, "", 0) + ldText(24, 55, "对话开始", 10.5, "#1d4ed8", 600) +
      ldBox(70, 38, 120, 26, "上下文窗口 8K~128K", "#bfdbfe", "#1e40af", 10.5) + ldText(24, 90, "← 早期内容被挤出", 10.5, R, 600) +
      ldArrow(150, 30, 150, 12) + ldText(150, 8, "窗口 = AI 一次能记住多长", 10.5, T, 600) + ldText(210, 100, "128K ≈ 20万字", 10.5, "#1d4ed8", 600));
    case "embedding": return ldSvg(
      ldBox(8, 18, 66, 84, "", gf, "", 0) + ldText(41, 40, "苹果", 11, "#15803d", 700) + ldText(41, 58, "水果", 11, "#15803d", 700) +
      ldText(41, 76, "华为", 11, "#15803d", 700) + ldText(41, 94, "手机", 11, "#15803d", 700) + ldArrow(76, 60, 96, 60) +
      ldCircle(130, 40, 6, "#22c55e") + ldText(142, 44, "水果", 10.5, T) + ldCircle(128, 72, 6, "#22c55e") + ldText(140, 76, "苹果", 10.5, T) +
      ldCircle(200, 62, 6, "#3b82f6") + ldText(212, 66, "华为", 10.5, T) + ldCircle(196, 92, 6, "#3b82f6") + ldText(208, 96, "手机", 10.5, T) +
      ldText(255, 30, "语义近", 9.5, "#15803d", 600) + ldText(255, 46, "距离近", 9.5, "#15803d", 600) +
      ldText(255, 84, "语义远", 9.5, "#b45309", 600) + ldText(255, 100, "距离远", 9.5, "#b45309", 600) + ldText(150, 10, "词 → 数字坐标，意思相近 → 挨得近", 10.5, T, 600));
    case "rag": return ldSvg(
      ldBox(8, 20, 64, 30, "你的提问", bf, "#1d4ed8", 11) + ldArrow(74, 35, 94, 35) + ldBox(96, 18, 84, 34, "检索你的知识库", of, "#b45309", 11) +
      ldText(138, 66, "找到相关资料", 9.5, "#92400e") + ldArrow(182, 35, 202, 35) + ldBox(204, 18, 88, 34, "模型看着资料回答", pf, "#6d28d9", 11) +
      ldText(150, 12, "先翻书，再答题（不用重训练）", 10.5, T, 600) + ldText(150, 110, "答案可溯源 · 资料随时更新", 10.5, T));
    case "agent": return ldSvg(
      ldBox(8, 20, 76, 32, "目标", gf, "#15803d", 11) + ldText(46, 66, "拆解步骤", 9.5, "#166534") + ldArrow(86, 36, 106, 36) +
      ldBox(108, 20, 76, 32, "规划行动", bf, "#1d4ed8", 11) + ldArrow(186, 36, 206, 36) + ldBox(208, 20, 84, 32, "调用工具", of, "#b45309", 11) +
      ldText(250, 66, "搜索/代码/软件", 9.5, "#92400e") + ldLine(250, 54, 250, 78, "#94a3b8", 2) + ldLine(250, 78, 46, 78, "#94a3b8", 2, "4 3") +
      ldArrow(46, 78, 46, 54) + ldText(150, 12, "自己动手 · 循环迭代直到完成", 10.5, T, 600) + ldText(150, 108, "聊天 AI 是顾问，Agent 是执行者", 10.5, T, 600));
    case "multimodal": return ldSvg(
      ldBox(8, 14, 58, 30, "📝 文字", bf, "#1d4ed8", 11) + ldBox(8, 48, 58, 30, "🖼 图片", gf, "#15803d", 11) + ldBox(8, 82, 58, 30, "🎙 声音", of, "#b45309", 11) +
      ldArrow(68, 29, 92, 52) + ldArrow(68, 63, 92, 60) + ldArrow(68, 97, 92, 68) + ldBox(94, 30, 96, 60, "同一个模型", pf, "#6d28d9", 13) +
      ldText(142, 76, "统一理解", 10, "#8b5cf6") + ldArrow(192, 60, 212, 60) + ldBox(214, 40, 78, 40, "看图/听音/读文", gf, "#15803d", 11) +
      ldText(150, 112, "多模态 = 看得见、听得着", 10.5, T, 600));
    case "compound": return ldSvg(
      ldCircle(28, 92, 8, "#f59e0b") + ldCircle(64, 80, 11, "#f59e0b") + ldCircle(104, 66, 15, "#f59e0b") + ldCircle(150, 50, 20, "#fbbf24") +
      ldCircle(206, 36, 27, "#f59e0b") + ldCircle(266, 24, 36, "#f59e0b") + ldText(150, 16, "本金+利息 → 一起再生息", 11, T, 600) +
      ldLine(30, 108, 270, 108, "#e2e8f0", 1) + ldPoly("28,92 64,80 104,66 150,50 206,36 266,24", "#f59e0b") + ldText(150, 116, "时间越长，雪球越大", 10, "#b45309", 600));
    case "dca": return ldSvg(
      ldLine(12, 30, 288, 30, "#e2e8f0", 1) + ldText(292, 34, "价格", 9.5, T) +
      ldPoly("20,60 60,34 100,72 140,50 180,80 220,56 260,66 284,44", "#3b82f6") + ldLine(20, 58, 284, 58, "#ef4444", 2, "5 4") +
      ldText(150, 74, "成本线被摊平", 10, "#dc2626", 600) + ldText(150, 16, "跌时买得多 · 涨时买得少", 11, T, 600) + ldText(150, 108, "定时定额，机械执行", 10, "#15803d", 600));
    case "pe": return ldSvg(
      ldBox(10, 24, 80, 40, "股价 100", bf, "#1d4ed8", 12) + ldText(50, 84, "÷", 16, T, 700) + ldBox(110, 24, 80, 40, "每股年收益 5", gf, "#15803d", 12) +
      ldText(150, 84, "=", 16, T, 700) + ldBox(210, 24, 80, 40, "PE = 20", of, "#b45309", 13) + ldText(150, 14, "PE = 股价 ÷ 每股收益", 11, T, 700) +
      ldText(150, 110, "≈ 按当前盈利，20 年回本", 10.5, "#92400e", 600));
    case "inflation": return ldSvg(
      ldBox(14, 26, 84, 44, "今天 100 元", gf, "#15803d", 12) + ldArrow(100, 48, 118, 48) + ldBox(120, 26, 84, 44, "明年 100 元", bf, "#1d4ed8", 12) +
      ldText(162, 86, "买到的东西变少", 10, "#1d4ed8", 600) + ldPoly("120,26 204,26 162,70", "#bfdbfe") + ldText(150, 16, "物价上涨 = 购买力下降", 11, T, 700) +
      ldText(150, 110, "现金长期会“缩水” → 需要资产跑赢通胀", 10, "#b45309", 600));
    case "diversify": return ldSvg(
      ldCircle(52, 60, 30, of) + ldText(52, 56, "股票", 11, "#92400e", 700) + ldText(52, 74, "50%", 10, "#92400e") +
      ldCircle(150, 60, 30, bf) + ldText(150, 56, "债券", 11, "#1d4ed8", 700) + ldText(150, 74, "30%", 10, "#1d4ed8") +
      ldCircle(248, 60, 30, gf) + ldText(248, 56, "现金", 11, "#15803d", 700) + ldText(248, 74, "20%", 10, "#15803d") +
      ldText(150, 14, "鸡蛋分篮 · 跨资产配置", 11, T, 700) + ldText(150, 110, "一个跌了，别的可能涨 → 整体更稳", 10, T, 600));
    case "rule72": return ldSvg(
      ldBox(14, 22, 84, 40, "72 ÷ 8%", of, "#b45309", 13) + ldText(56, 82, "年化收益", 9.5, "#92400e") + ldArrow(100, 42, 118, 42) +
      ldBox(120, 22, 84, 40, "≈ 9 年", gf, "#15803d", 14) + ldText(162, 82, "翻倍", 9.5, "#166534") + ldArrow(206, 42, 224, 42) +
      ldBox(226, 22, 64, 40, "翻倍！", bf, "#1d4ed8", 13) + ldText(150, 14, "翻倍年数 ≈ 72 ÷ 年化收益率", 11, T, 700) + ldText(150, 110, "年化 12% → 6 年翻倍 · 也能量通胀", 10, "#92400e", 600));
    case "nav": return ldSvg(
      ldLine(12, 98, 288, 98, "#e2e8f0", 1) + ldPoly("16,90 52,84 88,88 124,72 160,78 196,60 232,66 268,44", "#3b82f6") + ldCircle(268, 44, 4, "#3b82f6") +
      ldText(196, 30, "净值 1.82", 10, "#1d4ed8", 700) + ldText(150, 14, "净值曲线 = 基金涨跌记录", 11, T, 700) + ldText(150, 112, "净值高低 ≠ 贵贱，比涨幅才公平", 10, "#15803d", 600));
    case "bond": return ldSvg(
      ldCircle(44, 60, 30, bf) + ldText(44, 56, "你", 12, "#1d4ed8", 700) + ldText(44, 74, "借出钱", 9.5, "#1d4ed8") + ldArrow(76, 60, 106, 60) +
      ldBox(108, 38, 84, 44, "债券（借条）", of, "#b45309", 12) + ldText(150, 96, "到期还本付息", 9.5, "#92400e") + ldArrow(194, 60, 224, 60) +
      ldCircle(258, 60, 30, gf) + ldText(258, 56, "政府/公司", 10, "#15803d", 700) + ldText(258, 74, "付利息", 9.5, "#15803d") +
      ldText(150, 14, "本质：一张“借条”", 11, T, 700) + ldText(150, 114, "比股票稳（固定利息），但别忘违约风险", 10, T, 600));
    // ===== 认知思维 =====
    case "think-compound": return ldSvg(
      ldCircle(42, 96, 8, G) + ldCircle(42, 78, 13, "#86efac") + ldArrow(42, 65, 42, 50) + ldText(42, 113, "知识", 10, "#15803d", 700) +
      ldCircle(150, 96, 8, B) + ldCircle(150, 78, 13, "#bfdbfe") + ldArrow(150, 65, 150, 50) + ldText(150, 113, "关系", 10, "#1d4ed8", 700) +
      ldCircle(258, 96, 8, O) + ldCircle(258, 78, 13, "#fde68a") + ldArrow(258, 65, 258, 50) + ldText(258, 113, "健康", 10, "#b45309", 700) +
      ldText(150, 30, "每天 +1% → 长期指数增长", 11, T, 600) + ldText(150, 46, "↑ 雪球越滚越大", 10, "#16a34a", 600) +
      ldText(150, 14, "能力·关系·健康，都吃复利", 11, T, 700));
    case "second-curve": return ldSvg(
      ldLine(12, 100, 288, 100, "#e2e8f0", 1) +
      ldPoly("20,90 70,55 120,40 170,52 220,72 270,90", "#3b82f6") + ldText(120, 32, "第一曲线", 10, "#1d4ed8", 700) +
      ldPoly("120,72 160,55 200,42 240,30 270,22 285,18", "#22c55e") + ldText(252, 16, "第二曲线", 10, "#15803d", 700) +
      ldCircle(120, 72, 4, "#ef4444") + ldText(120, 86, "在巅峰时布局", 9.5, "#dc2626", 600) +
      ldText(150, 116, "第一曲线未衰，就启动下一曲线", 10, T, 600));
    case "systems": return ldSvg(
      ldCircle(60, 64, 26, bf) + ldText(60, 60, "库存", 10, "#1d4ed8", 700) + ldText(60, 78, "低→补", 9, "#1d4ed8") +
      ldCircle(150, 30, 26, of) + ldText(150, 26, "生产", 10, "#b45309", 700) + ldText(150, 44, "提速", 9, "#b45309") +
      ldCircle(240, 64, 26, gf) + ldText(240, 60, "销量", 10, "#15803d", 700) + ldText(240, 78, "↑", 9, "#15803d") +
      ldArrow(86, 52, 124, 42) + ldArrow(176, 42, 214, 52) + ldArrow(240, 90, 150, 94, "#94a3b8", 2, "4 3") + ldArrow(150, 94, 60, 90, "#94a3b8", 2, "4 3") +
      ldText(150, 14, "环环相扣：改动一处，全网变", 11, T, 700) + ldText(150, 114, "系统思考 = 看回路，不只看单点", 10, T, 600));
    case "pareto": return ldSvg(
      ldBox(20, 22, 60, 78, "20% 投入", bf, "#1d4ed8", 12) + ldText(50, 116, "少量关键", 9.5, "#1d4ed8", 600) +
      ldBox(100, 62, 60, 38, "80% 结果", gf, "#15803d", 12) + ldText(130, 116, "大多产出", 9.5, "#15803d", 600) +
      ldArrow(168, 42, 188, 42) + ldBox(190, 22, 60, 78, "80% 投入", of, "#b45309", 12) + ldText(220, 116, "大量琐碎", 9.5, "#b45309", 600) +
      ldBox(270, 62, 24, 38, "20%", rf, "#dc2626", 12) +
      ldText(150, 12, "关键少数 → 决定多数结果", 11, T, 700) + ldText(150, 108, "把精力放在那 20% 上", 10, "#15803d", 600));
    case "feedback": return ldSvg(
      ldCircle(90, 64, 28, gf) + ldText(90, 60, "结果", 10, "#15803d", 700) + ldText(90, 78, "变好", 10, "#15803d") +
      ldArrow(118, 64, 144, 64) + ldBox(146, 52, 70, 24, "强化行为", bf, "#1d4ed8", 10) + ldArrow(216, 64, 240, 64) +
      ldArrow(240, 64, 196, 92, "#94a3b8", 2, "4 3") + ldLine(196, 92, 90, 92, "#94a3b8", 2) + ldArrow(90, 92, 90, 78) +
      ldText(150, 20, "正反馈：结果越好 → 越投入 → 更好", 11, T, 700) +
      ldText(150, 112, "负反馈则相反：偏离 → 自动纠回平衡", 10, T, 600));
    default: return ldSvg(ldText(150, 60, "示意图", 13, T, 700));
  }
}

// ---------- 卡片 ----------
function learnCardHtml(it, opts) {
  opts = opts || {};
  var seen = learnSeen();
  var isSeen = !!seen[it.id];
  var isFav = learnIsFav(it.id);
  var cmt = learnCmtCount(it.id);
  var cm = learnCatMeta(it.cat);
  return '<div class="learn-card' + (isSeen ? " learned" : "") + '" id="learn-card-' + it.id + '" onclick="learnFlip(\'' + it.id + '\')">' +
    '<div class="learn-inner">' +
      '<div class="learn-face learn-front">' +
        '<div class="learn-front-tag">' +
          '<span class="learn-tag">' + escapeHtml(it.tag || "知识") + '</span>' +
          '<span class="learn-front-acts">' +
            (cmt ? '<span class="learn-cmt-badge" title="评论">💬' + cmt + '</span>' : '') +
            '<span class="learn-fav-btn' + (isFav ? " on" : "") + '" onclick="event.stopPropagation();learnToggleFav(\'' + it.id + '\')">' + (isFav ? "★" : "☆") + '</span>' +
          '</span>' +
        '</div>' +
        '<div class="learn-front-q">' + escapeHtml(it.title || "") + '</div>' +
        (it.question ? '<div class="learn-front-sub">' + escapeHtml(it.question) + '</div>' : '') +
        (opts.date ? '<div class="learn-front-date">' + escapeHtml(opts.date) + (opts.catName ? ' · ' + escapeHtml(opts.catName) : '') + '</div>' : '') +
        (isSeen ? '<div class="learn-done-foot">✓ 已学</div>' : '<div class="learn-flip-hint-foot">点击翻面 ▶</div>') +
      '</div>' +
      '<div class="learn-face learn-back">' +
        '<div class="learn-back-scroll">' +
          learnDiag(it.diagram) +
          '<div class="learn-content">' + escapeHtml(it.content || "") + '</div>' +
          '<div class="learn-points">' + (it.points || []).map(function (p) { return '<div class="learn-point">• ' + escapeHtml(p) + '</div>'; }).join("") + '</div>' +
          (it.tip ? '<div class="learn-tip">💡 ' + escapeHtml(it.tip) + '</div>' : '') +
        '</div>' +
        '<div class="learn-back-actions">' +
          '<button class="learn-speak-btn" data-learn-speak="' + it.id + '" onclick="event.stopPropagation();learnSpeak(\'' + it.id + '\')">🔊 朗读</button>' +
          '<button class="learn-mark-btn' + (isSeen ? " done" : "") + '" onclick="event.stopPropagation();learnMarkFromCard(\'' + it.id + '\')">' + (isSeen ? "✓ 已学会" : "✓ 标记学会") + '</button>' +
          '<button class="learn-cmt-btn" onclick="event.stopPropagation();learnOpenComments(\'' + it.id + '\')">💬 评论' + (cmt ? ' ' + cmt : '') + '</button>' +
        '</div>' +
      '</div>' +
    '</div>' +
  '</div>';
}
function learnMarkFromCard(id) {
  var r = learnMark(id);
  renderLearnBody();
  showToast(r === 1 ? "已标记学会 🎉" : "已取消标记");
}
// ---------- 今日 AI 新知（浏览器端用已配置 Gemini 生成，localStorage 缓存当天） ----------
function learnShDate(offset) {
  var n = new Date();
  var sh = new Date(n.getTime() + (n.getTimezoneOffset() * 60000) + (8 * 3600000));
  if (offset) sh.setDate(sh.getDate() + offset);
  return sh.getFullYear() + "-" + String(sh.getMonth() + 1).padStart(2, "0") + "-" + String(sh.getDate()).padStart(2, "0");
}
function learnAiTodayKey() { return "hw_pm_learn_ai_today"; }
function learnAiTodayMap() {
  try { var s = localStorage.getItem(learnAiTodayKey()); return s ? (JSON.parse(s) || {}) : {}; }
  catch (e) { return {}; }
}
async function learnAiCall(prompt) {
  var cfg = null;
  try { cfg = JSON.parse(localStorage.getItem("hw_pm_ai_config") || "{}"); } catch (e) {}
  var key = (cfg && cfg.key) || "";
  if (!key) throw new Error("NO_KEY");
  if (typeof INTEL_PROVIDERS === "undefined" || !INTEL_PROVIDERS.gemini) throw new Error("NO_PROVIDER");
  var p = INTEL_PROVIDERS.gemini;
  var models = p.models || [p.models && p.models[0]];
  var lastErr = null;
  for (var mi = 0; mi < models.length; mi++) {
    try {
      var url = p.buildUrl(key, mi);
      var body = { contents: [{ parts: [{ text: prompt }] }] };
      var res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { lastErr = new Error("HTTP " + res.status); continue; }
      var j = await res.json();
      var txt = ((p.parse(j) || {}).text) || "";
      return txt;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("AI_CALL_FAILED");
}
function learnAiTodayCat(td) {
  var cats = ["ai", "finance", "think"];
  var h = 0; for (var i = 0; i < td.length; i++) h = (h * 31 + td.charCodeAt(i)) >>> 0;
  return cats[h % cats.length];
}
async function learnAiGenCard(td) {
  var cat = learnAiTodayCat(td);
  var catName = { ai: "AI 小知识", finance: "金融小知识", think: "认知思维" }[cat] || "知识";
  var prompt = "你是面向产品经理的「每日知识卡片」生成器。请生成一张关于【" + catName + "】的硬核又易懂的知识卡。\n" +
    "只输出一个 JSON 对象（不要 markdown 代码块、不要任何解释文字），格式：\n" +
    "{\"tag\":\"简短标签(≤6字)\",\"title\":\"一句吸引人的标题(≤20字)\",\"question\":\"一个引发思考的问题(≤30字)\",\"points\":[\"要点1\",\"要点2\",\"要点3\"],\"tip\":\"一句实用建议(≤30字)\",\"source\":\"一句话依据/出处(≤25字)\"}\n" +
    "要求：内容准确、有信息量、适合碎片时间记忆。";
  var raw = await learnAiCall(prompt);
  var m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("NO_JSON");
  var o = JSON.parse(m[0]);
  return {
    id: "ai-" + td,
    cat: cat,
    tag: o.tag || catName,
    title: o.title || "今日新知",
    question: o.question || "",
    content: "",
    points: Array.isArray(o.points) ? o.points.slice(0, 4) : [],
    tip: o.tip || "",
    diagram: null,
    source: o.source || ""
  };
}
function learnAiTodayBlock(card) {
  var cm = learnCatMeta(card.cat);
  return '<div class="learn-ai-today">' +
    '<div class="learn-ai-today-head">✨ 今日 AI 新知 <span style="margin-left:auto;font-size:11px;color:#94a3b8">' + escapeHtml(cm.name) + ' · 每天自动生成</span></div>' +
    learnCardHtml(card, { catName: cm.name }) +
  '</div>';
}
async function learnRenderAiToday() {
  var el = document.getElementById("learn-ai-today");
  if (!el) return;
  var td = learnShDate(0);
  var map = learnAiTodayMap();
  if (map[td]) { el.innerHTML = learnAiTodayBlock(map[td]); return; }
  el.innerHTML = '<div class="learn-ai-loading">✨ 正在生成今日 AI 新知…</div>';
  try {
    var card = await learnAiGenCard(td);
    map[td] = card;
    try { localStorage.setItem(learnAiTodayKey(), JSON.stringify(map)); } catch (e) {}
    el.innerHTML = learnAiTodayBlock(card);
  } catch (e) {
    var msg = (e && e.message === "NO_KEY") ? "未配置 AI 模型（设置→模型配置填 Gemini Key 后即可每日生成新知）" : "今日新知生成失败，请稍后重试";
    el.innerHTML = '<div class="learn-ai-fail">⚠️ ' + msg + '</div>';
  }
}

// ---------- 翻卡（点击卡片正反面切换） ----------
function learnFlip(id) {
  var el = document.getElementById("learn-card-" + id);
  if (el) el.classList.toggle("flipped");
}

// ---------- 语言播报（Web Speech API 自动朗读卡片知识） ----------
var __learnSpeakingId = null;
// 单卡朗读文本（单条朗读与自动播放共用）
function learnCardText(it) {
  if (!it) return "";
  var parts = [];
  if (it.title) parts.push(it.title);
  if (it.content) parts.push(it.content);
  (it.points || []).forEach(function (p) { if (p) parts.push(p); });
  if (it.tip) parts.push(it.tip);
  return parts.join("。");
}
function learnSpeakText() {
  return learnCardText(learnItemById(__learnSpeakingId));
}
function learnSpeak(id) {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    if (typeof showToast === "function") showToast("当前浏览器不支持语音播报", "error");
    return;
  }
  var sp = window.speechSynthesis;
  // 手动朗读与自动播放互斥：自动播放中先停止
  if (__learnAutoPlay) learnAutoStop();
  // 点击同一个：切换 停止/继续
  if (__learnSpeakingId === id && sp.speaking) { sp.cancel(); return; }
  sp.cancel();
  __learnSpeakingId = id;
  var text = learnSpeakText();
  if (!text) return;
  var u = new SpeechSynthesisUtterance(text);
  u.lang = "zh-CN";
  u.rate = 1.0;
  u.pitch = 1.0;
  u.onend = function () { __learnSpeakingId = null; learnUpdateSpeakBtns(); };
  u.onerror = function () { __learnSpeakingId = null; learnUpdateSpeakBtns(); };
  sp.speak(u);
  learnUpdateSpeakBtns();
  if (typeof showToast === "function") showToast("正在朗读 🔊");
}
function learnIsSpeaking(id) { return __learnSpeakingId === id; }
function learnUpdateSpeakBtns() {
  // 刷新所有朗读按钮文案
  try {
    var btns = document.querySelectorAll("[data-learn-speak]");
    for (var i = 0; i < btns.length; i++) {
      var id = btns[i].getAttribute("data-learn-speak");
      var on = learnIsSpeaking(id);
      btns[i].innerHTML = on ? "⏹ 停止" : "🔊 朗读";
      btns[i].className = "learn-speak-btn" + (on ? " on" : "");
    }
  } catch (e) {}
}

// ---------- 自动播放每日（当天卡片连续朗读） ----------
var __learnAutoPlay = null; // { date, ids[], idx }
function learnAutoStop() {
  if (!__learnAutoPlay) return;
  __learnAutoPlay = null;
  if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
  learnAutoClearFocus();
  learnUpdateAutoBtns();
}
function learnAutoPlay(date) {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    if (typeof showToast === "function") showToast("当前浏览器不支持语音播报", "error");
    return;
  }
  // 已在播同一日期 → 停止
  if (__learnAutoPlay && __learnAutoPlay.date === date) {
    learnAutoStop();
    if (typeof showToast === "function") showToast("已停止播放 ⏹");
    return;
  }
  // 切换日期 → 重启；并停止单卡手动朗读
  if (__learnAutoPlay) learnAutoStop();
  var sp = window.speechSynthesis;
  sp.cancel();
  if (__learnSpeakingId) { __learnSpeakingId = null; learnUpdateSpeakBtns(); }
  var items = learnItemsByDate(date);
  if (!items.length) {
    if (typeof showToast === "function") showToast("这一天还没有卡片可播放");
    return;
  }
  __learnAutoPlay = { date: date, ids: items.map(function (it) { return it.id; }), idx: 0 };
  if (typeof showToast === "function") showToast("开始自动播放 " + date + " 共 " + items.length + " 张 🔊");
  learnAutoSpeakCurrent();
}
function learnAutoSpeakCurrent() {
  var ap = __learnAutoPlay;
  if (!ap) return;
  var it = learnItemById(ap.ids[ap.idx]);
  if (!it) { ap.idx++; learnAutoSpeakNext(); return; }
  // 定位当前卡：翻面 + 高亮 + 滚入视野
  learnAutoFocusCard(it.id);
  var u = new SpeechSynthesisUtterance(learnCardText(it));
  u.lang = "zh-CN";
  u.rate = 1.0;
  u.pitch = 1.0;
  u.onend = function () { learnAutoSpeakNext(); };
  u.onerror = function () { learnAutoSpeakNext(); };
  window.speechSynthesis.speak(u);
  learnUpdateAutoBtns();
}
function learnAutoSpeakNext() {
  var ap = __learnAutoPlay;
  if (!ap) return;
  ap.idx++;
  if (ap.idx >= ap.ids.length) {
    var n = ap.ids.length;
    __learnAutoPlay = null;
    learnAutoClearFocus();
    learnUpdateAutoBtns();
    if (typeof showToast === "function") showToast("今日 " + n + " 张已全部播完 🎉");
    return;
  }
  // 上一张翻回正面，播下一张
  var prevEl = document.getElementById("learn-card-" + ap.ids[ap.idx - 1]);
  if (prevEl) prevEl.classList.remove("flipped");
  learnAutoSpeakCurrent();
}
function learnAutoFocusCard(id) {
  learnAutoClearFocus();
  var el = document.getElementById("learn-card-" + id);
  if (!el) return;
  el.classList.add("flipped", "learn-auto-playing");
  try { el.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) { el.scrollIntoView(); }
}
function learnAutoClearFocus() {
  try {
    var els = document.querySelectorAll(".learn-auto-playing");
    for (var i = 0; i < els.length; i++) els[i].classList.remove("learn-auto-playing");
  } catch (e) {}
}
function learnUpdateAutoBtns() {
  try {
    var btns = document.querySelectorAll("[data-learn-autoplay]");
    for (var i = 0; i < btns.length; i++) {
      var date = btns[i].getAttribute("data-learn-autoplay");
      var ap = __learnAutoPlay;
      var on = !!(ap && ap.date === date);
      btns[i].innerHTML = on ? "⏹ 停止 " + (ap.idx + 1) + "/" + ap.ids.length : "🔊 自动播放今日";
      btns[i].className = "learn-autoplay-btn" + (on ? " on" : "");
    }
  } catch (e) {}
}

// ---------- 收藏条 / 统计 ----------
function learnStatsHtml() {
  var s = learnStats();
  var pct = s.total ? Math.round(s.seen / s.total * 100) : 0;
  return '<div class="learn-stats">' +
    '<div class="learn-stats-row"><span>📖 已学 <b>' + s.seen + '</b> / ' + s.total + '</span><span>⭐ 收藏 ' + s.fav + '</span></div>' +
    '<div class="learn-progress"><div class="learn-progress-in" style="width:' + pct + '%"></div></div>' +
  '</div>';
}

// ---------- 顶部子标签 ----------
var __learnTab = "calendar";
function learnTabBar() {
  var tabs = [
    { id: "calendar", label: "📅 日历" },
    { id: "all", label: "📚 全部" },
    { id: "fav", label: "⭐ 收藏" }
  ];
  return '<div class="filter-bar" style="margin:2px 0 12px">' +
    tabs.map(function (t) { return '<div class="chip' + (__learnTab === t.id ? " active" : "") + '" onclick="learnSetTab(\'' + t.id + '\')">' + t.label + '</div>'; }).join("") +
  '</div>';
}
function learnSetTab(tab) { __learnTab = tab; learnAutoStop(); renderLearnBody(); }

// ---------- 微信式日历 ----------
var __learnCalY = 0, __learnCalM = 0, __learnSelDate = "";
function learnCalInit() {
  if (__learnCalY) return;
  var d = new Date();
  __learnCalY = d.getFullYear(); __learnCalM = d.getMonth() + 1;
  __learnSelDate = learnTodayDate();
}
function learnCalPrev() { __learnCalM--; if (__learnCalM < 1) { __learnCalM = 12; __learnCalY--; } renderLearnBody(); }
function learnCalNext() { __learnCalM++; if (__learnCalM > 12) { __learnCalM = 1; __learnCalY++; } renderLearnBody(); }
function learnSelectDate(d) { __learnSelDate = d; learnAutoStop(); renderLearnBody(); }
function learnCalDotMap() {
  var map = {};
  learnHistory().forEach(function (h) { map[h.date] = (h.itemIds || []).length; });
  return map;
}
function learnCalendarHtml() {
  learnCalInit();
  var y = __learnCalY, m = __learnCalM;
  var first = new Date(y, m - 1, 1);
  var startDow = first.getDay(); // 0=Sun
  var daysInMonth = new Date(y, m, 0).getDate();
  var dots = learnCalDotMap();
  var cells = "";
  var weekNames = ["日", "一", "二", "三", "四", "五", "六"];
  var head = '<div class="learn-cal-week">' + weekNames.map(function (w) { return '<span>' + w + '</span>'; }).join("") + '</div>';
  // 前置空格
  for (var i = 0; i < startDow; i++) cells += '<div class="learn-cal-cell empty"></div>';
  for (var d = 1; d <= daysInMonth; d++) {
    var ds = y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
    var cnt = dots[ds] || 0;
    var cls = "learn-cal-cell";
    if (ds === __learnSelDate) cls += " selected";
    if (ds === (typeof today === "function" ? today() : "")) cls += " today";
    cells += '<div class="' + cls + '" onclick="learnSelectDate(\'' + ds + '\')">' +
      '<span class="learn-cal-num">' + d + '</span>' +
      (cnt ? '<span class="learn-cal-dot' + (cnt > 1 ? " many" : "") + '"></span>' : '') +
    '</div>';
  }
  return '<div class="learn-cal">' +
    '<div class="learn-cal-bar">' +
      '<button class="learn-cal-nav" onclick="learnCalPrev()">‹</button>' +
      '<span class="learn-cal-title">' + y + ' 年 ' + m + ' 月</span>' +
      '<button class="learn-cal-nav" onclick="learnCalNext()">›</button>' +
    '</div>' +
    head +
    '<div class="learn-cal-grid">' + cells + '</div>' +
  '</div>';
}
function learnDateItemsHtml() {
  var ds = __learnSelDate;
  var items = learnItemsByDate(ds);
  var isToday = ds === (typeof today === "function" ? today() : "");
  var head = '<div class="learn-date-head">' +
    (isToday ? '📌 今日学习 · ' : '📅 ') + escapeHtml(ds) +
    (items.length ? '<span class="learn-date-cnt">' + items.length + ' 张</span>' : '') +
    (items.length ? '<button class="learn-autoplay-btn" data-learn-autoplay="' + ds + '" onclick="learnAutoPlay(\'' + ds + '\')">🔊 自动播放今日</button>' : '') +
  '</div>';
  if (!items.length) {
    return head + '<div class="card" style="text-align:center;color:#94a3b8;padding:20px">这一天还没有知识卡片～换个日期看看吧</div>';
  }
  return head + '<div class="learn-grid">' + items.map(function (it) {
    return learnCardHtml(it, { date: ds, catName: learnCatMeta(it.cat).name });
  }).join("") + '</div>';
}

// ---------- 分类筛选（全部视图） ----------
var __learnCat = "all";
function learnChipsHtml(active) {
  var chips = [{ id: "all", label: "📚 全部" }];
  var d = learnData();
  if (d && d.cats) d.cats.forEach(function (c) { chips.push({ id: c.id, label: c.icon + " " + c.name }); });
  return '<div class="filter-bar" style="margin:2px 0 12px">' +
    chips.map(function (c) { return '<div class="chip' + (active === c.id ? " active" : "") + '" onclick="learnSetCat(\'' + c.id + '\')">' + c.label + '</div>'; }).join("") +
  '</div>';
}
function learnSetCat(cat) { __learnCat = cat; renderLearnBody(); }

// ---------- 评论弹窗 ----------
function learnOpenComments(id) {
  var it = learnItemById(id);
  if (!it) return;
  var overlay = document.getElementById("learn-cmt-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "learn-cmt-overlay";
    overlay.className = "learn-cmt-overlay";
    document.body.appendChild(overlay);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) overlay.style.display = "none"; });
  }
  function render() {
    var list = learnCommentsFor(id);
    var cm = learnCatMeta(it.cat);
    overlay.innerHTML =
      '<div class="learn-cmt-modal">' +
        '<div class="learn-cmt-head"><span>' + escapeHtml(it.title || "") + '</span><button class="learn-cmt-close" onclick="learnCloseComments()">✕</button></div>' +
        '<div class="learn-cmt-sub">' + escapeHtml(cm.name) + ' · ' + (list.length ? list.length + ' 条评论' : '还没有评论，来抢沙发') + '</div>' +
        '<div class="learn-cmt-list" id="learn-cmt-list">' +
          (list.length ? list.map(function (c, i) {
            return '<div class="learn-cmt-item"><div class="learn-cmt-text">' + escapeHtml(c.text) + '</div>' +
              '<div class="learn-cmt-meta"><span>' + new Date(c.ts).toLocaleString("zh-CN") + '</span><button class="learn-cmt-del" onclick="learnDelComment(\'' + id + '\',' + i + ')">删除</button></div></div>';
          }).join("") : '<div class="learn-cmt-empty">💬 写下你的理解、疑问或记忆口诀吧</div>') +
        '</div>' +
        '<div class="learn-cmt-input">' +
          '<input id="learn-cmt-text" class="rs-input" placeholder="说点什么…（回车发送）" onkeydown="if(event.key===\'Enter\')learnAddComment(\'' + id + '\')" />' +
          '<button class="learn-cmt-send" onclick="learnAddComment(\'' + id + '\')">发送</button>' +
        '</div>' +
      '</div>';
  }
  render();
  overlay.style.display = "flex";
  var inp = document.getElementById("learn-cmt-text");
  if (inp) setTimeout(function () { inp.focus(); }, 30);
}
function learnCloseComments() {
  var o = document.getElementById("learn-cmt-overlay");
  if (o) o.style.display = "none";
}
// 底层存储（纯写入，无 UI）
function learnSaveComment(id, text) {
  text = (text || "").trim();
  if (!text) return false;
  var all = learnAllComments();
  if (!all[id]) all[id] = [];
  all[id].push({ text: text, ts: Date.now() });
  try { localStorage.setItem(learnCmtKey(), JSON.stringify(all)); } catch (e) {}
  return true;
}
// 发送评论（来自弹窗输入框）
function learnAddComment(id) {
  var inp = document.getElementById("learn-cmt-text");
  if (!inp) return;
  if (!learnSaveComment(id, inp.value)) { showToast("评论不能为空"); return; }
  inp.value = "";
  // 重新渲染弹窗列表
  var o = document.getElementById("learn-cmt-overlay");
  if (o) {
    var it = learnItemById(id); if (!it) return;
    var list = learnCommentsFor(id);
    var cm = learnCatMeta(it.cat);
    var listEl = document.getElementById("learn-cmt-list");
    var subEl = o.querySelector(".learn-cmt-sub");
    if (subEl) subEl.textContent = cm.name + ' · ' + (list.length ? list.length + ' 条评论' : '还没有评论');
    if (listEl) {
      listEl.innerHTML = list.length ? list.map(function (c, i) {
        return '<div class="learn-cmt-item"><div class="learn-cmt-text">' + escapeHtml(c.text) + '</div>' +
          '<div class="learn-cmt-meta"><span>' + new Date(c.ts).toLocaleString("zh-CN") + '</span><button class="learn-cmt-del" onclick="learnDelComment(\'' + id + '\',' + i + ')">删除</button></div></div>';
      }).join("") : '<div class="learn-cmt-empty">💬 写下你的理解、疑问或记忆口诀吧</div>';
    }
  }
  // 同步卡片上的评论角标
  renderLearnBody();
  showToast("评论已保存 💬");
}
function learnToggleFav(id) {
  var now = learnToggleFavRaw(id);
  renderLearnBody();
  showToast(now ? "已收藏 ⭐" : "已取消收藏");
}
function learnToggleFavRaw(id) {
  var f = learnFavSet();
  var now;
  if (f[id]) { delete f[id]; now = false; } else { f[id] = 1; now = true; }
  try { localStorage.setItem(learnFavKey(), JSON.stringify(f)); } catch (e) {}
  return now;
}

// ---------- 视图渲染 ----------
function renderLearnGrid(items) {
  var el = document.getElementById("learn-grid");
  if (el) el.innerHTML = items.length ? items.map(function (it) { return learnCardHtml(it); }).join("") :
    '<div class="card" style="text-align:center;color:#94a3b8">这里还没有卡片</div>';
}
function renderLearnBody() {
  var el = document.getElementById("learn-body");
  if (!el) return;
  var html = "";
  if (__learnTab === "calendar") {
    html = learnCalendarHtml() + '<div style="height:12px"></div>' + learnDateItemsHtml();
  } else if (__learnTab === "all") {
    var items = learnItemsByCat(__learnCat);
    html = learnChipsHtml(__learnCat) + '<div class="learn-grid" id="learn-grid"></div>';
    el.innerHTML = html;
    renderLearnGrid(items);
    return;
  } else if (__learnTab === "fav") {
    var favs = learnFavItems();
    html = '<div class="section-title" style="margin-bottom:8px"><span class="emoji">⭐</span> 我的收藏</div>' +
      (favs.length ? '<div class="learn-grid">' + favs.map(function (it) { return learnCardHtml(it); }).join("") + '</div>'
        : '<div class="card" style="text-align:center;color:#94a3b8;padding:20px">还没有收藏～在卡片右上角点 ☆ 即可收藏</div>');
    el.innerHTML = html;
    return;
  }
  el.innerHTML = html;
}
async function renderLearn() {
  var c = document.getElementById("app-content");
  if (!c) return;
  var d = await learnLoad();
  if (!d) {
    c.innerHTML = '<div class="section-title"><span class="emoji">🧠</span> 知识学习</div>' +
      '<div class="card" style="color:#b45309">知识库加载失败，请下拉刷新重试。</div>';
    return;
  }
  c.innerHTML =
    '<div class="learn-hero">' +
      '<div class="learn-hero-title">🧠 知识学习</div>' +
      '<div class="learn-hero-sub">每日 20 新知 · 翻卡记忆 · 收藏评论 · 历史日历</div>' +
    '</div>' +
    learnStatsHtml() +
    '<div id="learn-ai-today"></div>' +
    learnTabBar() +
    '<div id="learn-body"></div>';
  learnCalInit();
  renderLearnBody();
  learnRenderAiToday();
}
