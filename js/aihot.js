// ===== AI 资讯（AIHOT）=====
// 数据来自 data/aihot.json（每日 08:00 自动化抓取 AIHOT 生成）。
// 视图：每日简报（默认）/ 精选 / 热点 / 日报归档（归档点击实时拉取当日日报）。
// 归档实时拉取走客户端 fetch，AIHOT 已开放 CORS（access-control-allow-origin: *）。

function aihotFmt(iso) {
  if (!iso) return "";
  try {
    var d = new Date(iso);
    var s = d.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
    return s.replace(/\//g, "-");
  } catch (e) { return String(iso || "").slice(0, 10); }
}

async function aihotLoad() {
  var t = (typeof today === "function") ? today() : new Date().toISOString().slice(0, 10);
  if (window.__aihot && window.__aihot.__date === t) return window.__aihot;
  try {
    var ver = (typeof APP_VERSION !== "undefined") ? APP_VERSION : "";
    var r = await fetch("data/aihot.json?v=" + ver + "&d=" + t);
    if (!r.ok) r = await fetch("data/aihot.json?v=" + ver);
    if (!r.ok) return null;
    var j = await r.json();
    j.__date = t;
    window.__aihot = j;
    return j;
  } catch (e) { return null; }
}

function aihotItemCard(it) {
  return '<div class="aihot-card">' +
    '<a class="aihot-title" href="' + escapeHtml(it.links && (it.links.aihot || it.links.original) || "#") + '" target="_blank" rel="noopener">' + escapeHtml(it.title || "") + '</a>' +
    (it.summary ? '<div class="aihot-summary">' + escapeHtml(it.summary) + '</div>' : '') +
    '<div class="aihot-meta">' +
      (it.source ? '<span>📰 ' + escapeHtml(it.source) + '</span>' : '') +
      (it.publishedAt ? '<span>🕒 ' + aihotFmt(it.publishedAt) + '</span>' : '') +
      (it.category ? '<span class="aihot-cat">' + escapeHtml(it.category) + '</span>' : '') +
      (it.links && it.links.original ? '<a class="aihot-src-link" href="' + escapeHtml(it.links.original) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">原文 ↗</a>' : '') +
    '</div>' +
  '</div>';
}

function aihotTabBar() {
  var tabs = [["brief", "📋 每日简报"], ["selected", "⭐ 精选"], ["hot", "🔥 热点"], ["archive", "🗓 日报归档"]];
  return '<div class="filter-bar" style="margin:2px 0 12px">' +
    tabs.map(function (t) {
      return '<div class="chip' + (window.__aihotTab === t[0] ? " active" : "") + '" onclick="aihotSetTab(\'' + t[0] + '\')">' + t[1] + '</div>';
    }).join("") + '</div>';
}

function aihotBriefHtml(d) {
  var b = d.brief || {};
  var secs = (b.sections || []).map(function (s) {
    return '<div class="aihot-sec"><div class="aihot-sec-h">📑 ' + escapeHtml(s.label || "") + '</div>' +
      (s.items || []).map(aihotItemCard).join("") + '</div>';
  }).join("");
  return '<div class="aihot-brief">' +
    '<div class="aihot-brief-hero">' +
      '<div class="aihot-brief-date">📋 AIHOT 每日简报 · ' + escapeHtml(b.date || "") + '</div>' +
      (b.leadTitle ? '<div class="aihot-brief-lead">' + escapeHtml(b.leadTitle) + '</div>' : '') +
      (b.url ? '<a class="aihot-brief-link" href="' + escapeHtml(b.url) + '" target="_blank" rel="noopener">查看完整日报 ↗</a>' : '') +
    '</div>' +
    (secs || '<div class="brief-empty">今日日报暂无分段内容</div>') +
  '</div>';
}

function aihotSelectedHtml(d) {
  var list = d.selected || [];
  if (!list.length) return '<div class="empty-state"><div class="empty-icon">⭐</div><div class="empty-text">过去 24 小时暂无精选内容</div></div>';
  return '<div class="aihot-list">' + list.map(aihotItemCard).join("") + '</div>';
}

function aihotHotHtml(d) {
  var list = d.hotTopics || [];
  if (!list.length) return '<div class="empty-state"><div class="empty-icon">🔥</div><div class="empty-text">当前没有热点话题</div></div>';
  return '<div class="aihot-hot">' + list.map(function (h) {
    return '<div class="aihot-hot-item" onclick="window.open(\'' + escapeHtml((h.links && h.links.aihot) || (h.links && h.links.original) || "#") + '\',\'_blank\')">' +
      '<div class="aihot-hot-rank">#' + (h.rank || "?") + '</div>' +
      '<div class="aihot-hot-body">' +
        '<div class="aihot-hot-title">' + escapeHtml(h.title || "") + '</div>' +
        '<div class="aihot-meta">' +
          (h.source ? '<span>📰 ' + escapeHtml(h.source) + '</span>' : '') +
          (h.sourceCount ? '<span>🔗 ' + h.sourceCount + ' 信源</span>' : '') +
          (h.signalCount ? '<span>📡 ' + h.signalCount + ' 信号</span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="aihot-hot-go">↗</div>' +
    '</div>';
  }).join("") + '</div>';
}

function aihotArchiveHtml(d) {
  var list = d.dailies || [];
  if (!list.length) return '<div class="empty-state"><div class="empty-icon">🗓</div><div class="empty-text">暂无可回看的日报</div></div>';
  return aihotCalendarHtml(list);
}

// ---------- 日报归档 · 日历记录（复用知识学习的月历样式） ----------
var __aihotCalY = 0, __aihotCalM = 0, __aihotSelDate = "";
function aihotCalInit(dailies) {
  if (__aihotCalY) return;
  var now = new Date();
  __aihotCalY = now.getFullYear(); __aihotCalM = now.getMonth() + 1;
  var sorted = (dailies || []).slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  __aihotSelDate = sorted.length ? sorted[0].date : (typeof today === "function" ? today() : "");
}
function aihotCalPrev() { __aihotCalM--; if (__aihotCalM < 1) { __aihotCalM = 12; __aihotCalY--; } renderAihot(); }
function aihotCalNext() { __aihotCalM++; if (__aihotCalM > 12) { __aihotCalM = 1; __aihotCalY++; } renderAihot(); }
function aihotSelectDate(d) { __aihotSelDate = d; renderAihot(); }
function aihotCalDotMap(dailies) {
  var map = {};
  (dailies || []).forEach(function (x) { map[x.date] = 1; });
  return map;
}
function aihotDayByDate(dailies, date) {
  for (var i = 0; i < (dailies || []).length; i++) if (dailies[i].date === date) return dailies[i];
  return null;
}
function aihotCalendarHtml(dailies) {
  aihotCalInit(dailies);
  var y = __aihotCalY, m = __aihotCalM;
  var first = new Date(y, m - 1, 1);
  var startDow = first.getDay(); // 0=Sun
  var daysInMonth = new Date(y, m, 0).getDate();
  var dots = aihotCalDotMap(dailies);
  var weekNames = ["日", "一", "二", "三", "四", "五", "六"];
  var head = '<div class="learn-cal-week">' + weekNames.map(function (w) { return '<span>' + w + '</span>'; }).join("") + '</div>';
  var cells = "";
  for (var i = 0; i < startDow; i++) cells += '<div class="learn-cal-cell empty"></div>';
  for (var dd = 1; dd <= daysInMonth; dd++) {
    var ds = y + "-" + String(m).padStart(2, "0") + "-" + String(dd).padStart(2, "0");
    var has = !!dots[ds];
    var cls = "learn-cal-cell";
    if (ds === __aihotSelDate) cls += " selected";
    if (ds === (typeof today === "function" ? today() : "")) cls += " today";
    cells += '<div class="' + cls + '"' + (has ? ' onclick="aihotSelectDate(\'' + ds + '\')"' : '') + '>' +
      '<span class="learn-cal-num">' + dd + '</span>' +
      (has ? '<span class="learn-cal-dot"></span>' : '') +
    '</div>';
  }
  var cal = '<div class="learn-cal">' +
    '<div class="learn-cal-bar">' +
      '<button class="learn-cal-nav" onclick="aihotCalPrev()">‹</button>' +
      '<span class="learn-cal-title">' + y + ' 年 ' + m + ' 月</span>' +
      '<button class="learn-cal-nav" onclick="aihotCalNext()">›</button>' +
    '</div>' +
    head +
    '<div class="learn-cal-grid">' + cells + '</div>' +
  '</div>';

  // 选中日期详情
  var sel = aihotDayByDate(dailies, __aihotSelDate);
  var selHtml = '<div class="aihot-archive-day">' +
    '<div class="aihot-archive-day-h">🗓 ' + escapeHtml(__aihotSelDate) + ' 日报</div>';
  if (sel) {
    selHtml += '<div class="aihot-archive-day-title">' + escapeHtml(sel.leadTitle || "当日日报") + '</div>' +
      '<button class="btn btn-primary" style="width:100%;justify-content:center" onclick="aihotOpenDaily(\'' + escapeHtml(sel.date) + '\')">📖 查看完整日报 ↗</button>';
  } else {
    selHtml += '<div class="brief-empty" style="margin:0">该日期暂无日报记录</div>';
  }
  selHtml += '</div>';

  return '<div class="enm-hint" style="margin-bottom:6px">点有圆点的日期查看当日日报</div>' + cal + selHtml;
}

async function aihotOpenDaily(date) {
  if (typeof showToast === "function") showToast("正在加载 " + date + " 日报…", "info");
  try {
    var r = await fetch("https://aihot.virxact.com/api/v1/dailies/" + date, { headers: { "Accept": "application/json" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    var j = await r.json();
    var rep = (j && j.report) || {};
    var secs = (rep.sections || []).map(function (s) {
      return '<div class="aihot-sec"><div class="aihot-sec-h">📑 ' + escapeHtml(s.label || "") + '</div>' +
        (s.items || []).map(aihotItemCard).join("") + '</div>';
    }).join("");
    var html = '<div class="modal-title">🗓 AIHOT 日报 · ' + escapeHtml(rep.date || date) + '</div>' +
      (rep.lead && rep.lead.title ? '<div class="aihot-brief-lead" style="margin:6px 0 10px">' + escapeHtml(rep.lead.title) + '</div>' : '') +
      (secs || '<div class="brief-empty">当日无详细内容</div>') +
      '<div class="btn-row" style="margin-top:14px">' +
        '<a class="btn btn-primary" style="flex:1;justify-content:center;text-decoration:none" href="https://aihot.virxact.com/daily/' + encodeURIComponent(date) + '" target="_blank" rel="noopener">查看完整日报 ↗</a>' +
        '<button class="btn btn-secondary" style="flex:1" onclick="closeModal()">关闭</button>' +
      '</div>';
    if (typeof showModal === "function") showModal(html);
  } catch (e) {
    var url = "https://aihot.virxact.com/daily/" + encodeURIComponent(date);
    var html2 = '<div class="modal-title">🗓 AIHOT 日报 · ' + escapeHtml(date) + '</div>' +
      '<div class="brief-empty">加载失败（' + escapeHtml(e && e.message ? e.message : String(e)) + '），可前往官网查看</div>' +
      '<div class="btn-row" style="margin-top:14px">' +
        '<a class="btn btn-primary" style="flex:1;justify-content:center;text-decoration:none" href="' + url + '" target="_blank" rel="noopener">官网查看 ↗</a>' +
        '<button class="btn btn-secondary" style="flex:1" onclick="closeModal()">关闭</button>' +
      '</div>';
    if (typeof showModal === "function") showModal(html2);
  }
}

function aihotSetTab(t) { window.__aihotTab = t; renderAihot(); }

async function renderAihot() {
  var c = document.getElementById("app-content");
  if (!c) return;
  if (!window.__aihotTab) window.__aihotTab = "brief";
  var data = await aihotLoad();
  var fresh = (data && data.brief && data.brief.date === ((typeof today === "function") ? today() : "")) ? '<span class="badge badge-green" style="margin-left:6px">今日已更新</span>' : '';
  var html =
    '<div class="section-title"><span class="emoji">🤖</span> AI 资讯</div>' +
    '<div class="enm-hint" style="margin-bottom:6px">AIHOT 每日 08:00 自动更新 · 数据由 AIHOT 提供' + fresh + '</div>' +
    aihotTabBar();
  if (!data) {
    html += '<div class="empty-state"><div class="empty-icon">🤖</div><div class="empty-text">AI 资讯尚未生成<br>每日 08:00 自动抓取 AIHOT</div></div>';
  } else {
    if (window.__aihotTab === "brief") html += aihotBriefHtml(data);
    else if (window.__aihotTab === "selected") html += aihotSelectedHtml(data);
    else if (window.__aihotTab === "hot") html += aihotHotHtml(data);
    else html += aihotArchiveHtml(data);
  }
  c.innerHTML = html;
}
