// ============================================================
// 行业情报 · render（渲染层 · Sprint 1.5 自 app.js 下沉）
// 内容：Industry 段全部 UI 渲染函数（原 app.js L2415-L3674 中 intel 专属部分）
// 说明：纯搬移，无逻辑改动。依赖 app.js 全局（DB/LiveData/render/escapeHtml 等）
//       与 js/intel/{core,fav,comments,llm} 纯逻辑模块；以裸顶层函数存在（挂 window）
// 边界：openPatentModal（想法库）、Brief 段（writeBriefSnapshot/renderBrief 等）仍留 app.js
// 状态：渲染上下文统一走 intelState（见 state.js 注册表）
// ============================================================
// ===== Industry (含来源链接 + 手动粘贴) =====
function setIndustrySub(s) { setSubView("industry", s); }
function goAiOutputs() {
  try {
    if (currentRoute === "industry") { setSubView("industry", "outputs"); return; }
    navigate("industry");
    setSubView("industry", "outputs");
  } catch (e) { if (typeof navigate === "function") navigate("industry"); }
}
function setNewsCat(f) { intelState.newsCatFilter = f; render(); }

function renderIndustry() {
  var c = document.getElementById("app-content");
  var t = function (id, label) { return '<div class="chip' + (industrySub === id ? " active" : "") + '" onclick="setIndustrySub(\'' + id + '\')">' + label + '</div>'; };
  // v2.0 sections（Sprint 2 起）：由 js/intel/sections/*.js 注册、index.js 收集，导航自动并入最前
  var sections = (typeof collectIntelSections === "function") ? collectIntelSections() : {};
  var secBar = Object.keys(sections).filter(function (id) { return sections[id] && sections[id].nav !== false; })
    .map(function (id) { return t(id, sections[id].label); }).join("");
  var tabBar = '<div class="filter-bar" style="margin-bottom:10px">' +
    secBar +
    t("news", "🌐 资讯情报") + t("summary", "📝 新闻摘要") + t("history", "📅 历史回顾") + t("fav", "⭐ 收藏") + t("custom", "🤖 自定义情报") + t("opportunity", "📈 市场机会") + t("mine", "📋 我的情报") + t("outputs", "🤖 我的产出") +
    '</div>';
  // v2.0 section 渲染优先（init 首次进入调用一次；render 返回空时统一空态；异常不炸整页）
  if (sections[industrySub]) {
    var sec = sections[industrySub];
    try {
      var ctx = { rerender: function () { if (typeof render === "function") render(); } };
      if (typeof sec.init === "function") sec.init(ctx);
      var secHtml = sec.render(ctx);
      c.innerHTML = tabBar + (secHtml || '<div class="empty-state"><div class="empty-icon">📡</div><div class="empty-text">' + (sec.label || industrySub) + ' 暂无内容</div></div>');
      return;
    } catch (e) {
      c.innerHTML = tabBar + '<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-text">该板块渲染失败<br><span style="opacity:.7;font-size:12px">' + ((e && e.message) ? String(e.message).slice(0, 120) : "") + '</span></div></div>';
      return;
    }
  }
  if (industrySub === "history") c.innerHTML = tabBar + renderIntelHistory();
  else if (industrySub === "fav") c.innerHTML = tabBar + renderIntelFav();
  else if (industrySub === "custom") c.innerHTML = tabBar + renderIntelCustom();
  else if (industrySub === "opportunity") c.innerHTML = tabBar + renderIntelOpportunity();
  else if (industrySub === "mine") c.innerHTML = tabBar + renderMyIntel();
  else if (industrySub === "outputs") { c.innerHTML = tabBar + '<div id="aio-body"></div>'; if (typeof renderAiOutputs === "function") renderAiOutputs(); }
  else if (industrySub === "summary") c.innerHTML = tabBar + renderNewsSummary();
  else c.innerHTML = tabBar + renderLiveNews();
}

// 通用情报卡片（含收藏星标），供 资讯/历史 复用
function intelItemCard(item, dateStr, scope, idx, catLabel) {
  var fav = (typeof intelFavKey === "function") ? intelIsFav(DB.data.industryFav, intelFavKey(item, dateStr)) : false;
  var c = catLabel ? '<span class="badge" style="background:#3d7fd622;color:#3d7fd6">' + escapeHtml(catLabel) + '</span>' : '';
  var meta = [];
  if (item.source) meta.push(escapeHtml(item.source));
  if (item.pubTime) meta.push("🕒 " + escapeHtml(item.pubTime));
  else if (dateStr) meta.push("🕒 " + formatDateShort(dateStr));
  var tags = (item.tags || []).slice(0, 3).map(function (t) { return escapeHtml(t); }).join("/");
  var sum = item.summary || "";
  if (sum.length > 130) sum = sum.slice(0, 130) + "…";
  return '<div class="card">' +
    '<div class="card-header"><div class="card-title">' + escapeHtml(item.title) + '</div>' + c +
      '<button class="intel-star' + (fav ? " on" : "") + '" onclick="toggleIntelFav(\'' + scope + '\',' + idx + ')">' + (fav ? "★" : "☆") + '</button></div>' +
    (sum ? '<div class="card-body">' + escapeHtml(sum) + '</div>' : '') +
    '<div class="flex-between mt-12"><span class="text-xs text-secondary">' + meta.join(" · ") + (tags ? ' · ' + tags : '') + '</span>' +
      '<span class="intel-acts">' +
        (item.url ? '<a href="' + item.url + '" target="_blank" rel="noopener" class="source-link" onclick="event.stopPropagation()">🔗 原文 ↗</a>' : '') +
        '<button class="intel-act" onclick="openIntelComment(\'' + scope + '\',' + idx + ')">💬 ' + intelCommentCount(scope, idx) + '</button>' +
        intelExportBtn(scope, idx) +
      '</span>' +
    '</div></div>';
}

// —— 自动资讯（来自 Supabase Storage / news.json，每日 7:00 抓取）——
function renderLiveNews() {
  var nd = (typeof LiveData !== "undefined" && LiveData.news) ? LiveData.news : null;
  if (!nd || !nd.items || !nd.items.length) {
    return '<div class="empty-state"><div class="empty-icon">📰</div><div class="empty-text">今日资讯尚未生成<br>每日 7:00 自动抓取官媒与科技热点</div></div>';
  }
  if (intelState.newsCatFilter == null) intelState.newsCatFilter = "all";
  var cats = nd.categories || [];
  var catMap = {};
  cats.forEach(function (c) { catMap[c.key] = c.label; });
  var catHtml = '<div class="filter-bar" style="margin-bottom:8px">' +
    '<div class="chip' + (intelState.newsCatFilter === "all" ? " active" : "") + '" onclick="setNewsCat(\'all\')">全部</div>' +
    cats.map(function(cat) { return '<div class="chip' + (intelState.newsCatFilter === cat.key ? " active" : "") + '" onclick="setNewsCat(\'' + cat.key + '\')">' + (cat.icon || "") + ' ' + cat.label + '</div>'; }).join("") +
    '</div>';

  var items = nd.items.slice().sort(function(a, b) { return (a.priority || 5) - (b.priority || 5); });
  if (intelState.newsCatFilter !== "all") items = items.filter(function(n) { return (n.category || "") === intelState.newsCatFilter; });
  intelState.liveNews = { items: items, date: (nd.generatedAt || "").slice(0, 10) };

  var list = items.map(function(n, idx) {
    return intelItemCard(n, intelState.liveNews.date, "news", idx, catMap[n.category] || n.category);
  }).join("");

  var fresh = (nd.generatedAt && nd.generatedAt.slice(0, 10) === today()) ? '<span class="badge badge-green" style="margin-left:6px">今日已更新</span>' : '';
  return '<div class="enm-hint" style="margin-bottom:6px">每日 7:00 自动抓取官媒与科技热点' + fresh + ' · 点 ☆ 收藏</div>' + catHtml + list;
}

// —— 新闻摘要（按领域聚合当日资讯要点，客户端汇总，无需后端）——
function renderNewsSummary() {
  var nd = (typeof LiveData !== "undefined" && LiveData.news) ? LiveData.news : null;
  if (!nd || !nd.items || !nd.items.length) {
    return '<div class="empty-state"><div class="empty-icon">📝</div><div class="empty-text">今日资讯尚未生成<br>每日 7:00 自动抓取官媒与科技热点</div></div>';
  }
  var catMap = {}; (nd.categories || []).forEach(function (c) { catMap[c.key] = c; });
  var groups = {};
  nd.items.forEach(function (n) { var k = n.category || "other"; (groups[k] = groups[k] || []).push(n); });
  var catKeys = Object.keys(groups);
  var total = nd.items.length;
  var overview = '今日共 <b>' + total + '</b> 条资讯，覆盖 <b>' + catKeys.length + '</b> 个领域：' +
    catKeys.map(function (k) { return (catMap[k] ? catMap[k].label : k) + ' ' + groups[k].length; }).join(' · ');
  var html = '<div class="enm-hint" style="margin-bottom:8px">📝 新闻摘要 · 按领域聚合的当日要点（生成于 ' + escapeHtml((nd.generatedAt || "").slice(0, 10)) + '）</div>';
  html += '<div class="card" style="margin-bottom:10px"><div class="card-body">' + overview + '</div></div>';
  html += catKeys.map(function (k) {
    var items = groups[k].slice().sort(function (a, b) { return (a.priority || 5) - (b.priority || 5); });
    var label = catMap[k] ? ((catMap[k].icon || "") + " " + catMap[k].label) : k;
    return '<div class="lg-card"><div class="lg-card-h">' + escapeHtml(label) + ' <span class="lg-sub">' + items.length + ' 条</span></div>' +
      items.map(function (n) {
        var sum = n.summary || "";
        return '<div style="padding:8px 0;border-bottom:1px solid var(--border)">' +
          '<div style="font-weight:600;margin-bottom:2px">' + escapeHtml(n.title) + '</div>' +
          (sum ? '<div class="text-sm text-secondary">' + escapeHtml(sum) + '</div>' : '') +
          (n.url ? ' <a href="' + encodeURI(n.url) + '" target="_blank" rel="noopener" class="source-link" style="margin-top:4px;display:inline-block">🔗 原文 ↗</a>' : '') +
          '</div>';
      }).join("") + '</div>';
  }).join("");
  return html;
}

// —— 我的情报（手动粘贴录入）——
function renderMyIntel() {
  var allTags = Array.from(new Set(DB.data.industry.flatMap(function(i) { return i.tags; })));
  var tags = ["all"].concat(allTags);
  var filtered = DB.data.industry;
  if (currentFilter !== "all") filtered = filtered.filter(function(i) { return i.tags.indexOf(currentFilter) >= 0; });
  intelState.myIntel = filtered;
  var html =
    '<div class="filter-bar">' + tags.map(function(t) { return '<div class="chip' + (currentFilter === t ? ' active' : '') + '" onclick="setFilter(\'' + t + '\')">' + (t === "all" ? "全部" : t) + '</div>'; }).join("") + '</div>' +
    '<div style="margin-bottom:12px"><button class="btn btn-secondary" onclick="openPasteIndustry()" style="width:100%;justify-content:center;gap:6px">📋 粘贴情报内容</button></div>' +
    (filtered.length === 0 ? '<div class="empty-state"><div class="empty-icon">📰</div><div class="empty-text">还没有行业情报</div></div>' : filtered.map(function(i, idx) {
      var key = intelFavKey(i, i.date); var fav = intelIsFav(DB.data.industryFav, key);
      return '<div class="card">' +
        '<div class="card-header"><div class="card-title">' + escapeHtml(i.title) + '</div>' + (i.important ? '<span class="badge badge-red">重要</span>' : '') +
          '<button class="intel-star' + (fav ? ' on' : '') + '" onclick="toggleIntelFav(\'mine\',' + idx + ')">' + (fav ? '★' : '☆') + '</button></div>' +
        '<div class="card-body">' + escapeHtml(i.summary) + '</div>' +
        '<div style="margin-top:8px">' + i.tags.map(function(t) { return '<span class="badge badge-teal">' + escapeHtml(t) + '</span>'; }).join("") + '</div>' +
        '<div class="flex-between mt-12">' +
          '<span class="text-xs text-secondary">' + escapeHtml(i.source) + ' · ' + formatDateShort(i.date) + '</span>' +
          '<span class="intel-acts">' +
            (i.url ? '<a href="' + i.url + '" target="_blank" rel="noopener" class="source-link" onclick="event.stopPropagation()">🔗 查看原文 →</a>' : '<button class="source-link" onclick="event.stopPropagation();editIndustryUrl(\'' + i.id + '\')">🔗 添加链接</button>') +
            '<button class="intel-act" onclick="openIntelComment(\'mine\',' + idx + ')">💬 ' + intelCommentCount('mine', idx) + '</button>' +
            intelExportBtn('mine', idx) +
          '</span>' +
        '</div>' +
      '</div>';
    }).join(""));
  return html;
}

// —— 历史回顾（微信聊天记录式：月历 + 聊天气泡）——
// 月历格子：monthStr 形如 "2026-08"；有留存的日期打红点
function intelCalCells(history, monthStr) {
  var hist = history || {};
  var y = parseInt(monthStr.slice(0, 4), 10);
  var m = parseInt(monthStr.slice(5, 7), 10);
  var first = new Date(Date.UTC(y, m - 1, 1, 12));
  var last = new Date(Date.UTC(y, m, 0, 12));
  var out = [];
  var lead = (first.getUTCDay() + 6) % 7; // 周一为一周起始
  for (var i = 0; i < lead; i++) out.push({ date: "", day: "", has: false, inMonth: false, today: false });
  for (var d = new Date(Date.UTC(y, m - 1, 1, 12)); d <= last; d.setUTCDate(d.getUTCDate() + 1)) {
    var ds = d.toISOString().slice(0, 10);
    out.push({ date: ds, day: d.getUTCDate(), has: !!hist[ds], inMonth: true, today: ds === (typeof today === "function" ? today() : "") });
  }
  return out;
}
function intelCalMonthNav(delta) {
  var y = parseInt(intelState.intelCalMonth.slice(0, 4), 10);
  var m = parseInt(intelState.intelCalMonth.slice(5, 7), 10);
  var d = new Date(Date.UTC(y, m - 1 + delta, 1, 12));
  intelState.intelCalMonth = d.toISOString().slice(0, 7);
  render();
}
// 日期分隔条（微信聊天记录式居中时间胶囊）
function intelBubbleDateTag(dateStr) {
  var t = formatDateShort(dateStr);
  var now = new Date(); var d = new Date(dateStr + "T00:00:00");
  var diff = Math.floor((now - d) / 86400000);
  if (diff === 0 || diff === 1) return t;
  return t + " · " + (d.getMonth() + 1) + "月" + d.getDate() + "日 周" + "日一二三四五六".charAt(d.getDay());
}
function renderIntelHistory() {
  var history = DB.data.industryHistory || {};
  var dates = intelHistoryDates(history);
  if (!dates.length) {
    return '<div class="empty-state"><div class="empty-icon">📅</div><div class="empty-text">还没有历史推送记录<br>从今日起，每日 7:00 抓取的资讯会自动留存，可在此回顾</div></div>';
  }
  if (!intelState.intelSelDate || dates.indexOf(intelState.intelSelDate) < 0) intelState.intelSelDate = dates[0];
  if (!intelState.intelCalMonth) intelState.intelCalMonth = intelState.intelSelDate.slice(0, 7);
  if (intelState.intelHistSearch == null) intelState.intelHistSearch = "";
  if (intelState.intelHistCat == null) intelState.intelHistCat = "all";
  var sel = intelState.intelSelDate;
  var day = history[sel] || {};
  var cats = day.categories || [];
  // 缓存当日基准数据，供搜索/筛选局部刷新（不丢焦点）
  intelState.intelHistDay = { sel: sel, items: intelHistoryByDate(history, sel), cats: cats };

  // 月历卡片
  var cells = intelCalCells(history, intelState.intelCalMonth);
  var calHtml = '<div class="wx-cal">' +
    '<div class="wx-cal-nav"><button class="btn btn-secondary" onclick="intelCalMonthNav(-1)" style="padding:4px 10px">‹</button>' +
      '<span class="wx-cal-month">' + intelState.intelCalMonth + '</span>' +
      '<button class="btn btn-secondary" onclick="intelCalMonthNav(1)" style="padding:4px 10px">›</button></div>' +
    '<div class="wx-week-h"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div>' +
    '<div class="wx-cal-grid">' + cells.map(function (cell) {
      if (!cell.inMonth) return '<div class="wx-cell empty"></div>';
      var cls = "wx-cell";
      if (cell.today) cls += " today";
      if (cell.has) cls += " has";
      if (cell.date === sel) cls += " sel";
      return '<div class="' + cls + '" onclick="setIntelHistoryDate(\'' + cell.date + '\')">' +
        '<span class="wx-day">' + cell.day + '</span>' +
        (cell.has ? '<span class="wx-dot"></span>' : '') +
        '</div>';
    }).join("") + '</div>' +
    '<div class="wx-cal-legend"><span><i class="wx-dot"></i> 有情报</span><span><b>描边</b> 今天</span><span><b>高亮</b> 当前查看</span></div></div>';

  // 日期快捷条（横滑，保留快速切换）
  var dateBar = '<div class="wx-date-strip">' +
    dates.slice(0, 21).map(function(d) {
      return '<div class="wx-date-chip' + (d === sel ? ' active' : '') + '" onclick="setIntelHistoryDate(\'' + d + '\')">' +
        '<span class="wx-date-m">' + (d.slice(5, 7) + "/" + d.slice(8, 10)) + '</span>' +
        '<span class="wx-date-w">' + formatDateShort(d) + '</span></div>';
    }).join("") + '</div>';

  var catMap = {}; cats.forEach(function(c) { catMap[c.key] = c.label; });
  var catFilter = '<div class="filter-bar" style="margin:8px 0">' +
    '<div class="chip' + (intelState.intelHistCat === "all" ? " active" : "") + '" onclick="setIntelHistCat(\'all\')">全部</div>' +
    cats.map(function (c) { return '<div class="chip' + (intelState.intelHistCat === c.key ? " active" : "") + '" onclick="setIntelHistCat(\'' + c.key + '\')">' + escapeHtml(c.label) + '</div>'; }).join("") +
    '</div>';

  var searchBox = '<div class="intel-search-row">' +
    '<input id="intel-hist-search" class="intel-key" placeholder="🔍 搜索标题/摘要/来源…" value="' + escapeHtml(intelState.intelHistSearch) + '" oninput="applyIntelHistFilter()">' +
    '<button id="intel-hist-clear" class="intel-search-clear" style="display:' + (intelState.intelHistSearch ? "flex" : "none") + '" onclick="clearIntelHistSearch()">✕</button>' +
    '</div>';

  var head = '<div class="wx-chat-head">' +
    '<span class="wx-chat-title">💬 ' + sel + ' 情报记录</span>' +
    '<span class="wx-chat-count">' + intelHistoryByDate(history, sel).length + ' 条</span></div>';

  return '<div class="enm-hint" style="margin-bottom:6px">📅 已留存 ' + dates.length + ' 天资讯 · 点日历日期查看当天情报</div>' +
    calHtml + dateBar + head + searchBox + catFilter +
    '<div id="intel-hist-list">' + intelHistListHtml() + '</div>';
}
// 气泡列表 HTML（依据当前 搜索词 + 分类筛选 计算）——微信聊天记录样式
function intelHistListHtml() {
  var d = intelState.intelHistDay;
  if (!d) return "";
  var catMap = {}; (d.cats || []).forEach(function (c) { catMap[c.key] = c.label; });
  var items = intelSearchItems(d.items, intelState.intelHistSearch);
  items = intelFilterItemsByCategory(items, intelState.intelHistCat);
  intelState.liveNews = { items: items, date: d.sel };
  if (!items.length) return '<div class="empty-state" style="padding:18px 0"><div class="empty-icon">🔍</div><div class="empty-text">没有匹配的资讯</div></div>';
  return '<div class="wx-bubble-date">' + intelBubbleDateTag(d.sel) + '</div>' +
    items.map(function (n, idx) {
      return intelBubbleCard(n, d.sel, idx, catMap[n.category] || n.category);
    }).join("");
}
// 单条情报气泡（微信风格：左侧头像点 + 白色圆角气泡）
function intelBubbleCard(item, dateStr, idx, catLabel) {
  var fav = (typeof intelFavKey === "function") ? intelIsFav(DB.data.industryFav, intelFavKey(item, dateStr)) : false;
  var c = catLabel ? '<span class="wx-bubble-cat">' + escapeHtml(catLabel) + '</span>' : '';
  var meta = [];
  if (item.source) meta.push(escapeHtml(item.source));
  var pub = item.pubTime || "";
  // 微信风格：同一留存日的条目只显示时间（时分）；纯日期且同一天则省略
  if (pub) {
    if (pub.slice(0, 10) === dateStr) pub = pub.slice(11).trim();
    if (pub) meta.push("🕒 " + escapeHtml(pub));
  }
  var tags = (item.tags || []).slice(0, 3).map(function (t) { return escapeHtml(t); }).join("/");
  var sum = item.summary || "";
  if (sum.length > 150) sum = sum.slice(0, 150) + "…";
  var star = '<button class="intel-star' + (fav ? " on" : "") + '" onclick="toggleIntelFav(\'news\',' + idx + ')">' + (fav ? "★" : "☆") + '</button>';
  return '<div class="wx-msg">' +
    '<div class="wx-avatar">📰</div>' +
    '<div class="wx-bubble">' +
      '<div class="wx-bubble-h">' + c + '<span class="wx-bubble-meta">' + meta.join(" · ") + (tags ? ' · ' + tags : '') + '</span>' + star + '</div>' +
      '<div class="wx-bubble-title">' + escapeHtml(item.title) + '</div>' +
      (sum ? '<div class="wx-bubble-body">' + escapeHtml(sum) + '</div>' : '') +
      '<div class="wx-bubble-acts">' +
        (item.url ? '<a href="' + item.url + '" target="_blank" rel="noopener" class="source-link" onclick="event.stopPropagation()">🔗 原文 ↗</a>' : '') +
        '<button class="intel-act" onclick="openIntelComment(\'news\',' + idx + ')">💬 ' + intelCommentCount('news', idx) + '</button>' +
        intelExportBtn('news', idx) +
      '</div>' +
    '</div></div>';
}
// 关键词输入：仅刷新列表，保持输入框焦点
function applyIntelHistFilter() {
  var el = document.getElementById("intel-hist-search");
  intelState.intelHistSearch = el ? el.value : "";
  var list = document.getElementById("intel-hist-list");
  if (list) list.innerHTML = intelHistListHtml();
  var cb = document.getElementById("intel-hist-clear");
  if (cb) cb.style.display = intelState.intelHistSearch ? "flex" : "none";
}
function clearIntelHistSearch() {
  intelState.intelHistSearch = "";
  var el = document.getElementById("intel-hist-search");
  if (el) el.value = "";
  var cb = document.getElementById("intel-hist-clear");
  if (cb) cb.style.display = "none";
  var list = document.getElementById("intel-hist-list");
  if (list) list.innerHTML = intelHistListHtml();
}
function setIntelHistCat(catKey) { intelState.intelHistCat = catKey; render(); }
function setIntelHistoryDate(d) { intelState.intelSelDate = d; render(); }

// —— 收藏列表（按分类分组 + 筛选 + 重命名/删除分类）——
function renderIntelFav() {
  var fav = DB.data.industryFav || [];
  intelState.favItems = fav;
  if (!fav.length) {
    return '<div class="empty-state"><div class="empty-icon">⭐</div><div class="empty-text">还没有收藏的情报<br>在资讯 / 历史 / 我的情报中点击 ☆ 即可收藏并选择分类</div></div>';
  }
  var cats = DB.data.industryFavCats || [];
  if (intelState.intelFavFilter == null) intelState.intelFavFilter = "all";
  if (intelState.intelFavSearch == null) intelState.intelFavSearch = "";
  intelState.intelFavBase = fav; // 供搜索局部刷新
  var hint = '<div class="intel-fav-hint"><div class="intel-fav-hint-l">已收藏 <b>' + fav.length + '</b> 条 · ' + cats.length + ' 个分类</div>' +
    '<button class="intel-export-btn" onclick="downloadIntelFavExport()">📤 导出</button></div>';
  var searchBox = '<div class="intel-search-row">' +
    '<input id="intel-fav-search" class="intel-key" placeholder="🔍 搜索标题/摘要/评论…" value="' + escapeHtml(intelState.intelFavSearch) + '" oninput="applyIntelFavFilter()">' +
    '<button id="intel-fav-clear" class="intel-search-clear" style="display:' + (intelState.intelFavSearch ? "flex" : "none") + '" onclick="clearIntelFavSearch()">✕</button>' +
    '</div>';
  var filterBar = '<div class="filter-bar" style="margin:8px 0">' +
    '<div class="chip' + (intelState.intelFavFilter === "all" ? " active" : "") + '" onclick="setIntelFavFilter(\'all\')">全部</div>' +
    cats.map(function (c) { return '<div class="chip' + (intelState.intelFavFilter === c.id ? " active" : "") + '" onclick="setIntelFavFilter(\'' + c.id + '\')">' + escapeHtml(c.name) + '</div>'; }).join("") +
    '</div>';
  return hint + searchBox + filterBar + '<div id="intel-fav-body">' + intelFavBodyHtml() + '</div>';
}

// 收藏分组 HTML（依据当前 搜索词 + 分类筛选 计算）；卡片索引指向原始收藏数组
function intelFavBodyHtml() {
  var fav = intelState.intelFavBase || [];
  var cats = DB.data.industryFavCats || [];
  var searched = intelSearchFav(fav, intelState.intelFavSearch, DB.data.industryComments);
  var visible = (intelState.intelFavFilter === "all") ? searched : searched.filter(function (f) { return (f.catId || "") === intelState.intelFavFilter; });
  if (!visible.length) return '<div class="empty-state" style="padding:18px 0"><div class="empty-icon">🔍</div><div class="empty-text">没有匹配的收藏</div></div>';
  var groups = [];
  cats.forEach(function (c) { groups.push({ cat: c, items: visible.filter(function (f) { return (f.catId || "") === c.id; }) }); });
  var uncat = visible.filter(function (f) { return !f.catId || !cats.some(function (c) { return c.id === f.catId; }); });
  if (uncat.length) groups.push({ cat: { id: "", name: "未分类" }, items: uncat });
  return groups.filter(function (g) { return g.items.length; }).map(function (g) {
    var header = '<div class="intel-fav-group-h"><span>' + escapeHtml(g.cat.name) + ' · ' + g.items.length + '</span>' +
      (g.cat.id ? '<span class="intel-fav-group-acts"><button class="intel-cmt-del" onclick="renameIntelFavCat(\'' + g.cat.id + '\')">✎ 重命名</button><button class="intel-cmt-del" onclick="removeIntelFavCat(\'' + g.cat.id + '\')">🗑 删除</button></span>' : '') +
      '</div>';
    var cards = g.items.map(function (f) {
      var realIdx = fav.indexOf(f);
      var meta = [];
      if (f.source) meta.push(escapeHtml(f.source));
      meta.push("🕒 " + formatDateShort(f.date));
      var tags = (f.tags || []).slice(0, 3).map(function (t) { return escapeHtml(t); }).join("/");
      return '<div class="card">' +
        '<div class="card-header"><div class="card-title">' + escapeHtml(f.title) + '</div>' +
          '<button class="intel-star on" onclick="toggleIntelFav(\'fav\',' + realIdx + ')">★</button></div>' +
        (f.summary ? '<div class="card-body">' + escapeHtml(f.summary) + '</div>' : '') +
        '<div style="margin-top:8px">' + (f.tags || []).map(function (t) { return '<span class="badge badge-teal">' + escapeHtml(t) + '</span>'; }).join("") + '</div>' +
        '<div class="flex-between mt-12"><span class="text-xs text-secondary">' + meta.join(" · ") + (tags ? ' · ' + tags : '') + '</span>' +
          '<span class="intel-acts">' +
            (f.url ? '<a href="' + f.url + '" target="_blank" rel="noopener" class="source-link" onclick="event.stopPropagation()">🔗 原文 ↗</a>' : '') +
            '<button class="intel-act" onclick="openIntelComment(\'fav\',' + realIdx + ')">💬 ' + intelCommentCount('fav', realIdx) + '</button>' +
            intelExportBtn('fav', realIdx) +
          '</span>' +
        '</div></div>';
    }).join("");
    return header + cards;
  }).join("");
}

// 收藏搜索：仅刷新分组，保持输入框焦点
function applyIntelFavFilter() {
  var el = document.getElementById("intel-fav-search");
  intelState.intelFavSearch = el ? el.value : "";
  var body = document.getElementById("intel-fav-body");
  if (body) body.innerHTML = intelFavBodyHtml();
  var cb = document.getElementById("intel-fav-clear");
  if (cb) cb.style.display = intelState.intelFavSearch ? "flex" : "none";
}
function clearIntelFavSearch() {
  intelState.intelFavSearch = "";
  var el = document.getElementById("intel-fav-search");
  if (el) el.value = "";
  var cb = document.getElementById("intel-fav-clear");
  if (cb) cb.style.display = "none";
  var body = document.getElementById("intel-fav-body");
  if (body) body.innerHTML = intelFavBodyHtml();
}
// 导出收藏（含分类名 + 评论数）为 JSON 下载
function downloadIntelFavExport() {
  if (typeof ensureIndustry === "function") ensureIndustry();
  var fav = DB.data.industryFav || [];
  var cats = DB.data.industryFavCats || [];
  var catName = function (id) { return intelFavCatName(cats, id); };
  var rows = fav.map(function (f) {
    return {
      title: f.title, summary: f.summary, source: f.source, url: f.url,
      date: f.date, category: catName(f.catId), tags: f.tags || [],
      commentCount: (DB.data.industryComments && f.key && DB.data.industryComments[f.key]) ? DB.data.industryComments[f.key].length : 0
    };
  });
  try {
    var blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), count: rows.length, favorites: rows }, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = "硬件PM情报收藏_" + today() + ".json";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (typeof showToast === "function") showToast("已导出 " + rows.length + " 条收藏", "success");
  } catch (e) {
    if (typeof showToast === "function") showToast("导出失败：" + (e && e.message ? e.message : e), "error");
  }
}

// —— 自定义情报（免费大模型按需求收集）——
function renderIntelCustom() {
  var cfg = (typeof loadAiConfig === "function") ? loadAiConfig() : {};
  var defProv = cfg.provider || "gemini";
  var provOpts = Object.keys(INTEL_PROVIDERS).map(function(k) {
    var p = INTEL_PROVIDERS[k];
    var sel = (defProv === k) ? " selected" : "";
    return '<option value="' + k + '"' + sel + '>' + p.name + intelProvBadge(k) + '</option>';
  }).join("");
  var keyVal = cfg.key ? cfg.key : "";
  var input =
    '<div class="card intel-custom">' +
      '<div class="card-title">🤖 按需求收集情报</div>' +
      '<textarea id="intel-need" class="intel-need" rows="3" placeholder="例如：调研折叠屏铰链供应商格局与成本趋势 / 分析磁吸车载支架海外差评痛点 / 跟进 AI 硬件最新融资动态"></textarea>' +
      '<div class="intel-row"><select id="intel-prov" class="intel-prov">' + provOpts + '</select></div>' +
      '<div class="intel-row"><input id="intel-key" class="intel-key" type="password" placeholder="API Key（仅存本机）" value="' + escapeHtml(keyVal) + '"></div>' +
      '<label class="intel-ws"><input type="checkbox" id="intel-ws"' + ((cfg.webSearch !== false) ? " checked" : "") + ' onchange="intelToggleWs(this)"> 🌐 联网检索（获取真实来源链接·智谱搜索约¥0.01/次）</label>' +
      '<button id="intel-gen-btn" class="btn btn-primary" style="width:100%;justify-content:center;gap:6px" onclick="intelGenerate()">🤖 生成情报</button>' +
      '<div id="intel-gen-err" class="intel-gen-err" style="display:none"></div>' +
      '<div class="intel-help">默认 <b>Gemini（AI Studio 免费 Key · 联网搜索带来源）</b>；大陆需开 VPN 直连。无 VPN 可改用 <b>智谱 GLM-4-Flash / 硅基流动（国内·免费）</b>。Key 仅存本机，不上云。</div>' +
      '<div class="intel-guide-link"><button class="intel-export-btn" onclick="openFreeApiGuide()">🔑 如何获取免费 Key（Gemini / 智谱）？</button></div>' +
    '</div>';

  var results = DB.data.industryCustom || [];
  var flat = [];
  var resHtml = results.length ? '' : '<div class="empty-state"><div class="empty-icon">🤖</div><div class="empty-text">还没有自定义情报<br>输入需求，让免费大模型帮你收集</div></div>';
  if (results.length) {
    resHtml = results.map(function(r) {
      var itemsHtml = (r.items || []).map(function(it, j) {
        var fIdx = flat.length;
        var flatItem = { id: r.id + "#" + j, title: it.title, summary: it.point, source: it.source, url: it.url, tags: it.tags || [], date: r.date, origin: "custom" };
        flat.push(flatItem);
        var fav = intelIsFav(DB.data.industryFav, intelFavKey(flatItem, r.date));
        var meta = [];
        if (it.source) meta.push(escapeHtml(it.source));
        var tags = (it.tags || []).slice(0, 3).map(function(t) { return escapeHtml(t); }).join("/");
        return '<div class="intel-sub">' +
          '<div class="intel-sub-head"><span>' + escapeHtml(it.title) + '</span>' +
            '<button class="intel-star' + (fav ? ' on' : '') + '" onclick="toggleIntelFav(\'custom\',' + fIdx + ')">' + (fav ? '★' : '☆') + '</button></div>' +
          (it.point ? '<div class="intel-sub-body">' + escapeHtml(it.point) + '</div>' : '') +
          '<div class="flex-between mt-12"><span class="text-xs text-secondary">' + meta.join(" · ") + (tags ? ' · ' + tags : '') + '</span>' +
            '<span class="intel-acts">' +
              (it.url ? '<a href="' + it.url + '" target="_blank" rel="noopener" class="source-link" onclick="event.stopPropagation()">🔗 来源 ↗</a>' : '') +
              '<button class="intel-act" onclick="openIntelComment(\'custom\',' + fIdx + ')">💬 ' + intelCommentCount('custom', fIdx) + '</button>' +
              intelExportBtn('custom', fIdx) +
            '</span>' +
          '</div></div>';
      }).join("");
      var srcHtml = (r.sources || []).length ? '<div class="intel-sources">参考来源：' + (r.sources || []).map(function(s) {
        return s.url ? '<a href="' + s.url + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">' + escapeHtml(s.title || s.url) + ' ↗</a>' : escapeHtml(s.title || "");
      }).join(" · ") + '</div>' : '';
      return '<div class="card" style="margin-top:10px">' +
        '<div class="card-header"><div class="card-title">' + escapeHtml(r.title) + '</div><span class="badge" style="background:#7c5cff22;color:#7c5cff">自定义</span></div>' +
        (r.summary ? '<div class="card-body">' + escapeHtml(r.summary) + '</div>' : '') +
        (r.need ? '<div class="enm-hint" style="margin:6px 0">需求：' + escapeHtml(r.need) + '</div>' : '') +
        itemsHtml + srcHtml +
        '<div class="intel-custom-actions"><button class="intel-export-btn" onclick="saveCustomToMyIntel(\'' + r.id + '\')">📥 转存「我的情报」</button><button class="intel-export-btn" onclick="goAiOutputs()">🤖 我的产出</button></div>' +
      '</div>';
    }).join("");
  }
  intelState.customIntelItems = flat;
  return input + resHtml;
}

// —— 市场机会（六维分析 · 免费大模型）——
function renderIntelOpportunity() {
  var cfg = (typeof loadAiConfig === "function") ? loadAiConfig() : {};
  var defProv = cfg.provider || "gemini";
  var provOpts = Object.keys(INTEL_PROVIDERS).map(function (k) {
    var p = INTEL_PROVIDERS[k];
    var sel = (defProv === k) ? " selected" : "";
    return '<option value="' + k + '"' + sel + '>' + p.name + intelProvBadge(k) + '</option>';
  }).join("");
  var keyVal = cfg.key ? cfg.key : "";
  var input =
    '<div class="card intel-custom mkt-input">' +
      '<div class="card-title">📈 市场机会研究</div>' +
      '<div class="enm-hint" style="margin:4px 0 10px">输入你想研究的市场，用<b>国内免费大模型（智谱/硅基流动·直连）</b>生成六维市场机会报告（规模/渗透/增量/未满足需求/蓝海/替代）。</div>' +
      '<textarea id="mkt-market" class="intel-need" rows="2" placeholder="例如：折叠屏手机支架 / 便携美拍镜 / 散热无线充电宝 / MagSafe 磁吸风扇灯 / 挂腰摄影风扇"></textarea>' +
      '<div class="intel-row"><select id="mkt-prov" class="intel-prov">' + provOpts + '</select></div>' +
      '<div class="intel-row"><input id="mkt-key" class="intel-key" type="password" placeholder="API Key（仅存本机，与自定义情报共享）" value="' + escapeHtml(keyVal) + '"></div>' +
      '<label class="intel-ws"><input type="checkbox" id="mkt-ws"' + ((cfg.webSearch !== false) ? " checked" : "") + ' onchange="intelToggleWs(this)"> 🌐 联网检索（获取真实来源链接·智谱搜索约¥0.01/次）</label>' +
      '<button id="mkt-gen-btn" class="btn btn-primary" style="width:100%;justify-content:center;gap:6px" onclick="mktGenerate()">📈 生成市场机会报告</button>' +
      '<div id="mkt-gen-err" class="intel-gen-err" style="display:none"></div>' +
      '<div class="intel-help">默认 <b>Gemini（AI Studio 免费 Key · 联网搜索带来源）</b>；大陆需开 VPN 直连。无 VPN 可改用 <b>智谱 GLM-4-Flash / 硅基流动（国内·免费）</b>，与「🤖 自定义情报」共享配置，已设置则自动沿用。Key 仅存本机、不上云。</div>' +
      '<div class="intel-guide-link"><button class="intel-export-btn" onclick="openFreeApiGuide()">🔑 如何获取免费 Key（Gemini / 智谱）？</button></div>' +
    '</div>';

  var list = DB.data.marketOpp || [];
  var resHtml = list.length ? '' : '<div class="empty-state"><div class="empty-icon">📈</div><div class="empty-text">还没有市场机会报告<br>输入一个市场，让免费大模型帮你做六维机会分析</div></div>';
  if (list.length) {
    resHtml = list.slice().reverse().map(function (r) { return mktReportCard(r); }).join("");
  }
  return input + resHtml;
}

// 联网检索开关：写入共享 AI 配置（智谱 Web Search，用于产出真实来源链接）
function intelToggleWs(el) {
  var cfg = (typeof loadAiConfig === "function") ? loadAiConfig() : {};
  cfg.webSearch = !!el.checked;
  if (typeof saveAiConfig === "function") saveAiConfig(cfg);
}

// 市场机会评级徽章
function mktRatingBadge(rating) {
  var map = { "高": ["badge-red", "高机会"], "中": ["badge-orange", "中机会"], "低": ["badge-gray", "低机会"] };
  var key = String(rating || "").trim();
  var m = map[key] || ["badge-blue", (key ? "机会:" + key : "待评级")];
  return '<span class="badge ' + m[0] + '">' + m[1] + '</span>';
}
function mktKv(k, v) {
  if (!v) return "";
  return '<div class="mkt-kv"><span class="mkt-k">' + escapeHtml(k) + '</span><span class="mkt-v">' + escapeHtml(v) + '</span></div>';
}
function mktTbl(headers, rows) {
  if (!rows || !rows.length) return "";
  var th = headers.map(function (h) { return '<th>' + escapeHtml(h) + '</th>'; }).join("");
  var tr = rows.map(function (row) {
    return '<tr>' + row.map(function (c) { return '<td>' + escapeHtml(c == null ? "" : c) + '</td>'; }).join("") + '</tr>';
  }).join("");
  return '<table class="mkt-tbl"><thead><tr>' + th + '</tr></thead><tbody>' + tr + '</tbody></table>';
}
function mktDim(title, body) {
  if (!body) return "";
  return '<div class="mkt-dim"><div class="mkt-dim-t">' + title + '</div>' + body + '</div>';
}
// 渲染一条市场机会报告（六维）
function mktReportCard(r) {
  if (!r) return "";
  var d = r.dims || {};
  var s = d.scale || {}, pen = d.penetration || {}, inc = d.increment || {}, unm = d.unmet || {}, blue = d.blueocean || {}, sub = d.substitution || {};

  var scaleHtml = mktKv("当前规模(TAM)", s.tam) + mktKv("增速(CAGR)", s.cagr);
  if (s.segments && s.segments.length) scaleHtml += mktTbl(["细分市场", "规模", "占比", "增速", "阶段"], s.segments.map(function (x) { return [x.name, x.size, x.share, x.growth, x.stage]; }));
  if (s.drivers && s.drivers.length) scaleHtml += '<div class="mkt-sub">驱动因素</div>' + mktTbl(["驱动因素", "影响"], s.drivers.map(function (x) { return [x.factor, x.impact]; }));

  var penHtml = mktKv("当前渗透率", pen.rate) + mktKv("理论上限", pen.ceiling) + mktKv("剩余空间", pen.space) + mktKv("生命周期", pen.stage);
  if (pen.segments && pen.segments.length) penHtml += mktTbl(["群体/区域/场景", "渗透率", "与总体差距", "增长潜力"], pen.segments.map(function (x) { return [x.group, x.rate, x.gap, x.potential]; }));

  var incHtml = mktKv("存量规模", inc.stock) + mktKv("增量规模", inc.incremental);
  if (inc.sources && inc.sources.length) incHtml += mktTbl(["增量来源", "规模", "占比", "增速"], inc.sources.map(function (x) { return [x.source, x.size, x.share, x.growth]; }));
  if (inc.scenarios && inc.scenarios.length) incHtml += mktTbl(["情景", "假设", "增量空间", "概率"], inc.scenarios.map(function (x) { return [x.name, x.assumption, x.space, x.prob]; }));

  var unmHtml = "";
  if (unm.needs && unm.needs.length) unmHtml += '<div class="mkt-sub">需求层次</div>' + mktTbl(["需求", "满足度", "缺口", "优先级"], unm.needs.map(function (x) { return [x.need, x.satisfaction, x.gap, x.priority]; }));
  if (unm.pains && unm.pains.length) unmHtml += '<div class="mkt-sub">用户痛点</div>' + mktTbl(["痛点", "影响", "普遍性", "解决难度", "机会价值"], unm.pains.map(function (x) { return [x.pain, x.impact, x.universality, x.solutionDifficulty, x.opportunityValue]; }));
  if (unm.trends && unm.trends.length) unmHtml += '<div class="mkt-sub">需求趋势</div>' + mktTbl(["趋势", "速度", "潜力"], unm.trends.map(function (x) { return [x.trend, x.speed, x.potential]; }));

  var blueHtml = "";
  if (blue.redsea && (blue.redsea.competition || blue.redsea.priceWar || blue.redsea.profit || blue.redsea.diff)) {
    blueHtml += mktKv("竞争强度", blue.redsea.competition) + mktKv("价格战", blue.redsea.priceWar) + mktKv("利润空间", blue.redsea.profit) + mktKv("差异化", blue.redsea.diff);
  }
  if (blue.canvas && blue.canvas.length) blueHtml += '<div class="mkt-sub">价值曲线画布</div>' + mktTbl(["竞争要素", "行业", "我们", "动作"], blue.canvas.map(function (x) { return [x.factor, x.industry, x.ours, x.action]; }));
  if (blue.opportunities && blue.opportunities.length) blueHtml += '<div class="mkt-sub">蓝海机会</div>' + mktTbl(["机会", "目标用户", "价值主张", "可行性", "评分"], blue.opportunities.map(function (x) { return [x.desc, x.target, x.value, x.feasibility, x.score]; }));

  var subHtml = "";
  if (sub.direct && sub.direct.length) subHtml += '<div class="mkt-sub">直接替代品</div>' + mktTbl(["替代品", "替代度", "威胁", "趋势"], sub.direct.map(function (x) { return [x.item, x.degree, x.threat, x.trend]; }));
  if (sub.adjacent && sub.adjacent.length) subHtml += '<div class="mkt-sub">相邻/跨界市场</div>' + mktTbl(["相邻市场", "关联度", "进入难度", "机会"], sub.adjacent.map(function (x) { return [x.market, x.relevance, x.difficulty, x.opportunity]; }));
  if (sub.opportunities && sub.opportunities.length) subHtml += '<div class="mkt-sub">替代市场机会</div>' + mktTbl(["机会", "替代逻辑", "相对优势", "潜在规模"], sub.opportunities.map(function (x) { return [x.desc, x.logic, x.advantage, x.size]; }));

  var findings = (r.findings || []).map(function (f) { return '<li>' + escapeHtml(f) + '</li>'; }).join("");
  var sugg = (r.suggestions || []).map(function (f) { return '<li>' + escapeHtml(f) + '</li>'; }).join("");
  var src = (r.sources || []).map(function (x) { return x.url ? '<a href="' + x.url + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">' + escapeHtml(x.title || x.url) + ' ↗</a>' : escapeHtml(x.title || ""); }).join(" · ");

  return '<div class="card mkt-report">' +
    '<div class="card-header"><div class="card-title">📈 ' + escapeHtml(r.market || "市场机会") + '</div>' + mktRatingBadge(r.rating) +
      '<button class="intel-act" onclick="mktDelete(\'' + r.id + '\')">🗑</button></div>' +
    (r.summary ? '<div class="card-body">' + escapeHtml(r.summary) + '</div>' : '') +
    (r.ratingReason ? '<div class="enm-hint">评级理由：' + escapeHtml(r.ratingReason) + '</div>' : '') +
    mktDim("📊 市场规模", scaleHtml) +
    mktDim("🌊 渗透率", penHtml) +
    mktDim("📈 增量空间", incHtml) +
    mktDim("💡 未被满足需求", unmHtml) +
    mktDim("🌟 蓝海机会", blueHtml) +
    mktDim("🔄 替代市场", subHtml) +
    (findings ? '<div class="mkt-sec"><div class="mkt-sec-t">🔑 核心发现</div><ul class="mkt-ul">' + findings + '</ul></div>' : '') +
    (sugg ? '<div class="mkt-sec"><div class="mkt-sec-t">✅ 行动建议</div><ul class="mkt-ul">' + sugg + '</ul></div>' : '') +
    (src ? '<div class="intel-sources">参考来源：' + src + '</div>' : '') +
    '<div class="mkt-card-actions"><button class="intel-export-btn" onclick="goAiOutputs()">🤖 查看「我的产出」</button></div>' +
  '</div>';
}

// 生成市场机会报告（复用共享 AI 配置 + callLLMForPrompt 六维提示词）
async function mktGenerate() {
  var mEl = document.getElementById("mkt-market");
  var provEl = document.getElementById("mkt-prov");
  var keyEl = document.getElementById("mkt-key");
  var btn = document.getElementById("mkt-gen-btn");
  if (!mEl || !provEl || !keyEl) return;
  var market = mEl.value.trim();
  var provider = provEl.value;
  var key = keyEl.value.trim();
  if (!market) { if (typeof showToast === "function") showToast("请先输入你想研究的市场", "warn"); if (mEl) mEl.focus(); return; }
  if (!key) { if (typeof showToast === "function") showToast("请填写 API Key（免费获取见下方说明）", "warn"); if (keyEl) keyEl.focus(); return; }
  if (typeof saveAiConfig === "function") saveAiConfig({ provider: provider, key: key });
  var errBox = document.getElementById("mkt-gen-err");
  if (errBox) errBox.style.display = "none";
  if (btn) { btn.disabled = true; btn.textContent = "📈 生成中…（约 20-40 秒）"; }
  try {
    var prompt = marketOpportunityPrompt(market, typeof today === "function" ? today() : "nodate");
    var parsed = await callLLMForPrompt(provider, key, prompt);
    var obj = parseMarketOpportunity(parsed.text);
    var result = buildMarketOpportunityResult(obj, { market: market, provider: provider, sources: parsed.sources, text: parsed.text, date: (typeof today === "function" ? today() : "nodate") });
    DB.data.marketOpp = DB.data.marketOpp || [];
    DB.data.marketOpp.unshift(result);
    DB.save();
    if (typeof DB.logActivity === "function") DB.logActivity("industry", "生成市场机会报告：" + market);
    if (typeof showToast === "function") showToast("已生成「" + market + "」市场机会报告", "success");
    render();
  } catch (e) {
    var msg = (e && e.message ? e.message : String(e));
    if (errBox) {
      errBox.style.display = "block";
      errBox.textContent = "❌ 生成失败：" + msg;
      if (typeof showToast === "function") showToast("生成失败，详见下方红字提示", "error");
    } else {
      if (typeof showToast === "function") showToast("生成失败：" + msg.slice(0, 80), "error");
    }
    if (btn) { btn.disabled = false; btn.textContent = "📈 生成市场机会报告"; }
  }
}

// 删除市场机会报告
function mktDelete(id) {
  if (typeof confirm === "function" && !confirm("确定删除这份市场机会报告？")) return;
  DB.data.marketOpp = (DB.data.marketOpp || []).filter(function (r) { return r.id !== id; });
  DB.save();
  render();
}

// 自定义情报 → 一键转存为「我的情报」
function saveCustomToMyIntel(id) {
  var list = DB.data.industryCustom || [];
  var r = null;
  for (var i = 0; i < list.length; i++) { if (list[i].id === id) { r = list[i]; break; } }
  if (!r) { if (typeof showToast === "function") showToast("未找到该条情报", "warn"); return; }
  if (typeof ensureIndustry === "function") ensureIndustry();
  DB.data.industry = DB.data.industry || [];
  var entries = customIntelToMyIntel(r);
  DB.data.industry = entries.concat(DB.data.industry); // 新转存的置顶
  DB.save();
  if (typeof DB.logActivity === "function") DB.logActivity("industry", "转存自定义情报到我的情报：" + (r.title || ""));
  if (typeof showToast === "function") showToast("已转存 " + entries.length + " 条到「我的情报」", "success");
  render();
}

// —— Gemini Key 申请引导页（应用内）——
function openFreeApiGuide() {
  var step = function (n, title, body) {
    return '<div class="gemini-step"><span class="gemini-step-num">' + n + '</span><div class="gemini-step-body"><div class="gemini-step-t">' + title + '</div><div class="gemini-step-d">' + body + '</div></div></div>';
  };
  var html =
    '<div class="modal-title">🔑 获取免费大模型 Key</div>' +
    '<div class="gemini-guide">' +
      '<div style="margin-bottom:10px;color:var(--text-secondary);font-size:13px"><b>默认模型：Google Gemini（AI Studio 免费 Key · 联网搜索带来源链接）</b>。Gemini 在大陆需开 VPN 才能直连；若不便用 VPN，可改用下方国内免费方案兜底。</div>' +
      step(1, "方案A·Gemini（推荐·免费·有来源）", '打开 <a href="https://aistudio.google.com/" target="_blank" rel="noopener">aistudio.google.com</a>，用 Google 账号登录，左侧「Get API key」创建密钥（<b>免费额度、无需信用卡、带 google_search 接地可返回真实来源链接</b>）。<br><b>注意：大陆网络需开启 VPN 后才能调用。</b>') +
      step(2, "方案B·智谱 GLM-4-Flash（国内·永久免费）", '打开 <a href="https://open.bigmodel.cn/" target="_blank" rel="noopener">open.bigmodel.cn</a>，手机号注册登录，进入「API Keys」创建密钥（无需信用卡、国内直连）。') +
      step(3, "方案C·硅基流动 SiliconFlow（国内·多模型免费）", '打开 <a href="https://cloud.siliconflow.cn/" target="_blank" rel="noopener">cloud.siliconflow.cn</a>，手机号注册，左侧「API 密钥」新建密钥；免费模型含 Qwen2.5-7B、GLM-4-9B 等。') +
      step(4, "复制 Key 并回填", "复制密钥（Gemini 形如 <code>AIza...</code>，国内厂形如 <code>xxx.xxxx</code>），妥善保存、勿公开；回到本模块在 API Key 框粘贴即可（与「🤖 自定义情报 / 📈 市场机会 / 爆款视频 / 市场调研」共享配置）。Key 仅存本机、不上云。") +
    '</div>' +
    '<div class="gemini-tip">💡 默认模型已设为「Gemini」；有 VPN 直接用，享受联网检索 + 真实来源。无 VPN 时在下拉切「智谱 GLM-4-Flash / 硅基流动」。联网检索开关默认开启（Gemini 接地≈免费，国内模型约¥0.01/次）。</div>' +
    '<div class="btn-row" style="margin-top:14px"><button class="btn btn-secondary" onclick="closeModal()">关闭</button><button class="btn btn-primary" onclick="closeFreeApiGuide()">我已复制 Key，去填写 →</button></div>';
  showModal(html);
}
function closeFreeApiGuide() {
  closeModal();
  var k = document.getElementById("intel-key");
  if (k) k.focus();
}

// —— 收藏切换：点击 ☆ 打开分类选择器（不再直接 toggle）——
function toggleIntelFav(scope, idx) {
  var r = resolveIntelItem(scope, idx);
  if (!r) return;
  openIntelFavPicker(scope, idx);
}

// 解析某张卡片对应的条目与收藏状态（收藏 / 评论共用）
function resolveIntelItem(scope, idx) {
  var item = null, dateStr = null;
  if (scope === "news") { var l = intelState.liveNews; if (l) { item = l.items[idx]; dateStr = l.date; } }
  else if (scope === "mine") { item = (intelState.myIntel || [])[idx]; }
  else if (scope === "custom") { item = (intelState.customIntelItems || [])[idx]; }
  else if (scope === "fav") { item = (intelState.favItems || [])[idx]; }
  if (!item) return null;
  var key = item.key || intelFavKey(item, dateStr);
  var isFav = intelIsFav(DB.data.industryFav, key);
  var catId = null;
  if (isFav) {
    var f = null;
    for (var i = 0; i < DB.data.industryFav.length; i++) { if (DB.data.industryFav[i].key === key) { f = DB.data.industryFav[i]; break; } }
    catId = f ? f.catId : null;
  }
  return { item: item, dateStr: dateStr, key: key, isFav: isFav, catId: catId, title: item.title || "" };
}

// —— 收藏分类选择器 ——
function openIntelFavPicker(scope, idx) {
  var r = resolveIntelItem(scope, idx);
  if (!r) return;
  var cats = DB.data.industryFavCats || [];
  intelState.favPick = {
    scope: scope, idx: idx, key: r.key, isFav: r.isFav, title: r.title,
    catId: r.catId || (cats[0] ? cats[0].id : null)
  };
  renderIntelFavPicker();
}
function renderIntelFavPicker() {
  var p = intelState.favPick;
  if (!p) return;
  var cats = DB.data.industryFavCats || [];
  var chips = cats.map(function (c) {
    return '<div class="chip' + (c.id === p.catId ? " active" : "") + '" onclick="setIntelFavCat(\'' + c.id + '\')">' + escapeHtml(c.name) + '</div>';
  }).join("");
  var html =
    '<div class="modal-title">⭐ 收藏到分类</div>' +
    '<div class="intel-fav-item">' + escapeHtml(p.title || "") + '</div>' +
    '<div class="form-label">选择分类</div>' +
    '<div class="filter-bar intel-cat-chips">' + chips + '</div>' +
    '<div class="intel-row" style="display:flex;gap:8px;margin-top:10px">' +
      '<input id="intel-new-cat" class="intel-key" placeholder="自定义分类名称…" style="flex:1">' +
      '<button class="btn btn-secondary" onclick="addIntelFavCat()">+ 添加</button>' +
    '</div>' +
    '<div class="btn-row" style="margin-top:16px">' +
      '<button class="btn btn-secondary" onclick="closeModal()">取消</button>' +
      (p.isFav ? '<button class="btn" style="color:var(--accent-red)" onclick="removeIntelFavNow()">取消收藏</button>' : '') +
      '<button class="btn btn-primary" onclick="confirmIntelFav()">确认收藏</button>' +
    '</div>';
  showModal(html);
}
function setIntelFavCat(id) { if (intelState.favPick) { intelState.favPick.catId = id; renderIntelFavPicker(); } }
function addIntelFavCat() {
  var p = intelState.favPick; if (!p) return;
  var el = document.getElementById("intel-new-cat");
  if (!el) return;
  var name = el.value.trim();
  if (!name) { if (typeof showToast === "function") showToast("请输入分类名称", "warn"); return; }
  if (typeof ensureIndustry === "function") ensureIndustry();
  var res = intelAddFavCat(DB.data.industryFavCats, name);
  DB.data.industryFavCats = res.cats;
  p.catId = res.id;
  DB.save();
  renderIntelFavPicker();
}
function confirmIntelFav() {
  var p = intelState.favPick; if (!p || !p.catId) { if (typeof showToast === "function") showToast("请选择分类", "warn"); return; }
  var r = resolveIntelItem(p.scope, p.idx);
  if (!r) return;
  if (p.isFav) {
    DB.data.industryFav = DB.data.industryFav.map(function (f) { if (f.key === p.key) f.catId = p.catId; return f; });
  } else {
    DB.data.industryFav = intelAddFav(DB.data.industryFav, r.item, r.dateStr, p.catId);
  }
  DB.save();
  if (typeof DB.logActivity === "function") DB.logActivity("industry", (p.isFav ? "更新收藏分类" : "收藏") + "情报：" + (r.title || ""));
  closeModal();
  render();
  if (typeof showToast === "function") showToast(p.isFav ? "已更新分类 ⭐" : "已收藏 ⭐", "success");
}
function removeIntelFavNow() {
  var p = intelState.favPick; if (!p) return;
  DB.data.industryFav = intelRemoveFav(DB.data.industryFav, p.key);
  DB.save();
  if (typeof DB.logActivity === "function") DB.logActivity("industry", "取消收藏情报：" + (p.title || ""));
  closeModal();
  render();
  if (typeof showToast === "function") showToast("已取消收藏", "success");
}
function renameIntelFavCat(id) {
  var cats = DB.data.industryFavCats || [];
  var cat = null;
  for (var i = 0; i < cats.length; i++) { if (cats[i].id === id) { cat = cats[i]; break; } }
  if (!cat) return;
  showModal(
    '<div class="modal-title">重命名分类</div>' +
    '<div class="form-group"><div class="form-label">分类名称</div><input id="intel-cat-name" class="form-input" value="' + escapeHtml(cat.name) + '"></div>' +
    '<div class="btn-row"><button class="btn btn-secondary" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="submitRenameFavCat(\'' + id + '\')">保存</button></div>'
  );
}
function submitRenameFavCat(id) {
  var el = document.getElementById("intel-cat-name");
  if (!el) return;
  var name = el.value.trim();
  if (!name) { if (typeof showToast === "function") showToast("名称不能为空", "warn"); return; }
  DB.data.industryFavCats = intelRenameFavCat(DB.data.industryFavCats, id, name);
  DB.save();
  closeModal();
  render();
}
function removeIntelFavCat(id) {
  showConfirmDialog("🗑", "删除分类", "删除后该分类下的收藏将自动移到其余分类，确定删除？", [
    { text: "取消", cls: "btn-secondary", action: function () { closeModal(); } },
    { text: "删除", cls: "btn-primary", style: "color:#fff;background:var(--accent-red)", action: function () { doRemoveIntelFavCat(id); } }
  ]);
}
function doRemoveIntelFavCat(id) {
  var res = intelRemoveFavCat(DB.data.industryFavCats, id);
  DB.data.industryFavCats = res.cats;
  DB.data.industryFav = (DB.data.industryFav || []).map(function (f) { if (f.catId === id) f.catId = res.reassignTo; return f; });
  DB.save();
  if (intelState.intelFavFilter === id) intelState.intelFavFilter = "all";
  closeModal();
  render();
  if (typeof showToast === "function") showToast("已删除分类", "success");
}
function setIntelFavFilter(id) { intelState.intelFavFilter = id; render(); }

// —— 评论 ——
function openIntelComment(scope, idx) {
  var r = resolveIntelItem(scope, idx);
  if (!r) return;
  intelState.cmtKey = r.key;
  intelState.cmtTitle = r.title;
  intelState.cmtEditing = null;
  renderIntelCommentModal();
}
function renderIntelCommentModal() {
  var key = intelState.cmtKey;
  var list = intelListComments(DB.data.industryComments, key);
  var itemsHtml = list.length ? list.map(function (c) {
    if (intelState.cmtEditing === c.id) {
      return '<div class="intel-cmt intel-cmt-editing">' +
        '<textarea id="intel-cmt-edit" class="intel-need" rows="3">' + escapeHtml(c.text) + '</textarea>' +
        '<div class="intel-cmt-edit-acts">' +
          '<button class="intel-cmt-del" onclick="cancelEditIntelComment()">取消</button>' +
          '<button class="intel-act" onclick="updateIntelComment(\'' + c.id + '\')">保存</button>' +
        '</div></div>';
    }
    return '<div class="intel-cmt">' +
      '<div class="intel-cmt-text">' + escapeHtml(c.text) + '</div>' +
      '<div class="intel-cmt-meta"><span>' + formatDateShort((c.createdAt || "").slice(0, 10)) + (c.updatedAt ? ' · 已编辑' : '') + '</span>' +
        '<span class="intel-cmt-meta-acts">' +
          '<button class="intel-cmt-del" onclick="editIntelComment(\'' + c.id + '\')">编辑</button>' +
          '<button class="intel-cmt-del" onclick="removeIntelComment(\'' + c.id + '\')">删除</button>' +
        '</span></div>' +
      '</div>';
  }).join("") : '<div class="empty-state" style="padding:18px 0"><div class="empty-icon">💬</div><div class="empty-text">还没有评论，来写第一条</div></div>';
  var html =
    '<div class="modal-title">💬 评论</div>' +
    '<div class="intel-fav-item" style="margin-bottom:10px">' + escapeHtml(intelState.cmtTitle || "") + '</div>' +
    '<div class="intel-cmt-list">' + itemsHtml + '</div>' +
    '<textarea id="intel-cmt-input" class="intel-need" rows="3" placeholder="写下你的评论…"></textarea>' +
    '<div class="btn-row" style="margin-top:10px">' +
      (list.length ? '<button class="btn btn-secondary" onclick="downloadIntelCommentsExport()">📤 导出评论</button>' : '') +
      '<button class="btn btn-secondary" onclick="closeModal()">关闭</button><button class="btn btn-primary" onclick="addIntelComment()">发布评论</button></div>';
  showModal(html);
}
function editIntelComment(cmtId) { intelState.cmtEditing = cmtId; renderIntelCommentModal(); }
function cancelEditIntelComment() { intelState.cmtEditing = null; renderIntelCommentModal(); }
function updateIntelComment(cmtId) {
  var el = document.getElementById("intel-cmt-edit");
  if (!el) return;
  var t = el.value.trim();
  if (!t) { if (typeof showToast === "function") showToast("评论不能为空", "warn"); return; }
  var res = intelUpdateComment(DB.data.industryComments, intelState.cmtKey, cmtId, t);
  DB.data.industryComments = res.comments;
  DB.save();
  intelState.cmtEditing = null;
  renderIntelCommentModal();
  render();
  if (typeof showToast === "function") showToast("评论已更新", "success");
}
// 导出当前条目的评论为 JSON 下载
function downloadIntelCommentsExport() {
  var key = intelState.cmtKey;
  var title = intelState.cmtTitle || "";
  var list = intelListComments(DB.data.industryComments, key);
  if (!list.length) { if (typeof showToast === "function") showToast("暂无评论可导出", "warn"); return; }
  try {
    var blob = new Blob([JSON.stringify({ title: title, key: key, exportedAt: new Date().toISOString(), comments: list }, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = "情报评论_" + (key || "item") + ".json";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (typeof showToast === "function") showToast("已导出 " + list.length + " 条评论", "success");
  } catch (e) {
    if (typeof showToast === "function") showToast("导出失败：" + (e && e.message ? e.message : e), "error");
  }
}
function addIntelComment() {
  var el = document.getElementById("intel-cmt-input");
  if (!el) return;
  var t = el.value.trim();
  if (!t) { if (typeof showToast === "function") showToast("评论不能为空", "warn"); return; }
  DB.data.industryComments = intelAddComment(DB.data.industryComments, intelState.cmtKey, t).comments;
  DB.save();
  renderIntelCommentModal();
  render();
}
// 按条目导出整页情报（含评论），下载为 JSON
function exportIntelItem(scope, idx) {
  var r = resolveIntelItem(scope, idx);
  if (!r) { if (typeof showToast === "function") showToast("未找到该条情报", "warn"); return; }
  var item = r.item;
  var comments = intelListComments(DB.data.industryComments, r.key);
  var data = {
    title: item.title || "",
    summary: item.summary || item.point || "",
    tags: item.tags || [],
    source: item.source || "",
    url: item.url || "",
    date: r.dateStr || item.date || "",
    category: item.category || (item.origin === "custom" ? "自定义情报" : ""),
    scope: scope,
    favCat: r.catId ? intelFavCatName(DB.data.industryFavCats, r.catId) : "",
    exportedAt: new Date().toISOString(),
    comments: comments.map(function (c) { return { text: c.text, createdAt: c.createdAt, updatedAt: c.updatedAt || null }; })
  };
  try {
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var fname = (item.title ? item.title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 40) : (r.key || "item"));
    var a = document.createElement("a");
    a.href = url; a.download = "情报_" + fname + ".json";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (typeof showToast === "function") showToast("已导出情报（含 " + comments.length + " 条评论）", "success");
  } catch (e) {
    if (typeof showToast === "function") showToast("导出失败：" + (e && e.message ? e.message : e), "error");
  }
}
// 情报卡上的导出按钮 HTML
function intelExportBtn(scope, idx) {
  return '<button class="intel-act" onclick="exportIntelItem(\'' + scope + '\',' + idx + ')">📤 导出</button>';
}
function removeIntelComment(cmtId) {
  DB.data.industryComments = intelRemoveComment(DB.data.industryComments, intelState.cmtKey, cmtId);
  DB.save();
  renderIntelCommentModal();
  render();
}
function intelCommentCount(scope, idx) {
  var r = resolveIntelItem(scope, idx);
  if (!r) return 0;
  return intelListComments(DB.data.industryComments, r.key).length;
}

// —— 自定义情报生成（浏览器侧调用免费大模型）——
async function intelGenerate() {
  var needEl = document.getElementById("intel-need");
  var provEl = document.getElementById("intel-prov");
  var keyEl = document.getElementById("intel-key");
  var btn = document.getElementById("intel-gen-btn");
  if (!needEl || !provEl || !keyEl) return;
  var need = needEl.value.trim();
  var provider = provEl.value;
  var key = keyEl.value.trim();
  if (!need) { if (typeof showToast === "function") showToast("请先描述你的情报需求", "warn"); return; }
  if (!key) { if (typeof showToast === "function") showToast("请填写 API Key（免费获取见下方说明）", "warn"); return; }
  if (typeof saveAiConfig === "function") saveAiConfig({ provider: provider, key: key });
  var errBox = document.getElementById("intel-gen-err");
  if (errBox) errBox.style.display = "none";
  if (btn) { btn.disabled = true; btn.textContent = "🤖 生成中…"; }
  try {
    var result = await callIntelLLM(provider, key, need);
    DB.data.industryCustom = DB.data.industryCustom || [];
    DB.data.industryCustom.unshift(result);
    DB.save();
    if (typeof DB.logActivity === "function") DB.logActivity("industry", "生成自定义情报：" + (result.title || need));
    if (typeof showToast === "function") showToast("已生成 " + result.items.length + " 条情报", "success");
    render();
  } catch (e) {
    var msg = (e && e.message ? e.message : String(e));
    if (errBox) {
      errBox.style.display = "block";
      errBox.textContent = "❌ 生成失败：" + msg;
      if (typeof showToast === "function") showToast("生成失败，详见下方红字提示", "error");
    } else {
      if (typeof showToast === "function") showToast("生成失败：" + msg.slice(0, 80), "error");
    }
    if (btn) { btn.disabled = false; btn.textContent = "🤖 生成情报"; }
  }
}

function openPasteIndustry() {
  showModal(
    '<div class="modal-title">📋 粘贴行业情报</div>' +
    '<form onsubmit="submitPasteIndustry(event)">' +
    '<div class="form-group"><div class="form-label">标题</div><input class="form-input" name="title" placeholder="情报标题..." required></div>' +
    '<div class="form-group"><div class="form-label">来源</div><input class="form-input" name="source" placeholder="来源 / 渠道" value="手动录入"></div>' +
    '<div class="form-group"><div class="form-label">内容摘要（直接粘贴）</div><textarea class="paste-area" name="summary" placeholder="在这里粘贴你看到的情报内容、文章摘录、数据截图文字...&#10;&#10;支持多行粘贴" required></textarea></div>' +
    '<div class="form-group"><div class="form-label">原文链接（可选）</div><input class="form-input" name="url" placeholder="https://..."></div>' +
    '<div class="form-group"><div class="form-label">标签（逗号分隔）</div><input class="form-input" name="tags" placeholder="无线充电, Qi2, 行业趋势"></div>' +
    '<div class="form-group"><label style="display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer"><input type="checkbox" name="important" style="width:20px;height:20px"> 标记为重要</label></div>' +
    '<div class="btn-row"><button type="button" class="btn btn-secondary" onclick="closeModal()">取消</button><button type="submit" class="btn btn-primary">保存</button></div>' +
    '</form>'
  );
}

function submitPasteIndustry(event) {
  event.preventDefault();
  var fd = new FormData(event.target);
  var data = Object.fromEntries(fd);
  DB.data.industry.unshift({
    id: uid(), title: data.title, source: data.source || "手动录入",
    url: data.url || "", summary: data.summary,
    tags: data.tags ? data.tags.split(",").map(function(s) { return s.trim(); }).filter(Boolean) : [],
    date: today(), important: data.important === "on"
  });
  DB.logActivity("industry", "手动录入情报：" + data.title);
  DB.save();
  closeModal();
  render();
}

function editIndustryUrl(id) {
  var item = DB.data.industry.find(function(i) { return i.id === id; });
  if (!item) return;
  showModal(
    '<div class="modal-title">编辑链接</div>' +
    '<form onsubmit="submitIndustryUrl(event,\'' + id + '\')">' +
    '<div class="form-group"><div class="form-label">原文链接</div><input class="form-input" name="url" placeholder="https://..." value="' + escapeHtml(item.url || "") + '"></div>' +
    '<div class="btn-row"><button type="button" class="btn btn-secondary" onclick="closeModal()">取消</button><button type="submit" class="btn btn-primary">保存</button></div>' +
    '</form>'
  );
}

function submitIndustryUrl(event, id) {
  event.preventDefault();
  var fd = new FormData(event.target);
  var item = DB.data.industry.find(function(i) { return i.id === id; });
  if (item) { item.url = fd.get("url"); DB.save(); }
  closeModal();
  render();
}
