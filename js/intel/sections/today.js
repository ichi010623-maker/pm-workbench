// ============================================================
// 行业情报 · sections/today.js（Sprint 2 · Today Intelligence）
// 聚合三块，每块独立优雅降级（无数据显示空态，不抛异常）：
//   1) 📋 Today's Brief  —— data/news_summary.json 当日一句话简报（异步，nsLoad 优先）
//   2) 🔥 今日要点 Top5  —— LiveData.news.items 按 priority 取前 5
//   3) 💡 每日知识       —— window.__knowledge 当日卡片（learnItemsByDate）
// 契约：js/intel/sections/contract.md
// 依赖：app.js 全局（LiveData / escapeHtml / nsLoad / __newsSummary / today）
//      render.js（intelItemCard 复用，可选：缺失时退化为简化卡片）
// ============================================================
(function (root) {
  "use strict";

  var SECTION_ID = "today";
  var SECTION_LABEL = "📋 Today";
  var REQUIRES = ["liveData.news", "data.knowledge", "data.newsSummary"];

  var HINT = '<div class="enm-hint" style="margin-bottom:6px">📋 Today · 每日 10-15 分钟掌握世界动态 · 简报 + 要点 + 知识</div>';

  function esc(s) {
    return (typeof root.escapeHtml === "function") ? root.escapeHtml(s) : (s == null ? "" : String(s));
  }

  // —— 空态 ——
  function emptyState(icon, text, sub) {
    return '<div class="empty-state"><div class="empty-icon">' + icon + '</div><div class="empty-text">' + text +
      (sub ? '<br><span style="opacity:.7;font-size:12px">' + esc(sub) + '</span>' : '') + '</div></div>';
  }

  function card(title, bodyHtml, badge) {
    return '<div class="card"><div class="card-header"><div class="card-title">' + title + '</div>' +
      (badge ? '<span class="badge" style="background:#3d7fd622;color:#3d7fd6">' + esc(badge) + '</span>' : '') +
      '</div><div class="card-body">' + bodyHtml + '</div></div>';
  }

  // —— 1) Today's Brief（异步：nsLoad 拉 news_summary，缓存到 intelState）——
  function briefBody(state) {
    var cached = (typeof root.intelState !== "undefined") ? root.intelState.briefData : null;
    var entry = cached || null;
    if (!entry) {
      // 尚未加载：触发异步拉取，加载完由 rerender 回调刷新
      loadBrief(state && state.rerender);
      return emptyState("📰", "正在加载今日简报…", "每日北京时间 08:00 云端生成");
    }
    if (!entry || !entry.groups || !entry.groups.length) {
      return emptyState("📰", "今日简报尚未生成", "每日北京时间 08:00 云端自动生成");
    }
    var brief = (entry.brief || []).slice(0, 6).map(function (b) {
      return '<div style="padding:4px 0;border-bottom:1px solid var(--border)">• ' + esc(b) + '</div>';
    }).join("");
    var total = (entry.groups || []).reduce(function (a, g) { return a + ((g.items || []).length); }, 0);
    var cats = (entry.groups || []).map(function (g) {
      return esc(g.icon || "📌") + " " + esc(g.cat) + " " + ((g.items || []).length);
    }).join(" · ");
    var head = '<div style="margin-bottom:6px;color:var(--text-secondary);font-size:12px">共 <b>' + total + '</b> 条 · ' + cats +
      (entry.mode === "rss" ? ' · <span style="opacity:.7">RSS 素材模式</span>' : '') + '</div>';
    return head + brief;
  }

  // 读取 app.js newssum 已加载的摘要（经 nsSummaryToday 封装，避免直接耦合 window.__newsSummary）
  function nsSummaryToday() {
    var d = (typeof root.__newsSummary !== "undefined") ? root.__newsSummary : null;
    if (!d || !d.days) return null;
    return d.days[bjToday()] || null;
  }

  // 异步拉取 news_summary 当日条目（优先复用 app.js 的 nsLoad）
  function loadBrief(rerender) {
    var finish = function () {
      var e = nsSummaryToday();
      if (typeof root.intelState !== "undefined") root.intelState.briefData = e || { __none: true };
      if (typeof rerender === "function") rerender();
    };
    // 已由 newssum 路由或其它处加载过 → 直接用
    if (nsSummaryToday()) { finish(); return; }
    if (typeof root.nsLoad === "function") { root.nsLoad(finish); return; }
    // 兜底：自行 fetch（不依赖 app.js newssum 内部变量）
    try {
      var ver = (typeof root.APP_VERSION !== "undefined") ? root.APP_VERSION : "";
      root.fetch("data/news_summary.json?v=" + ver + "&d=" + bjToday() + "&_=" + Date.now())
        .then(function (r) { return r.json(); })
        .then(function (j) {
          var e = (j && j.days) ? (j.days[bjToday()] || null) : null;
          if (typeof root.intelState !== "undefined") root.intelState.briefData = e || { __none: true };
          finish();
        }).catch(finish);
    } catch (e) { finish(); }
  }

  function bjToday() {
    return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  }

  // —— 2) 今日要点 Top5 ——
  function highlightsBody() {
    var nd = (typeof root.LiveData !== "undefined" && root.LiveData.news) ? root.LiveData.news : null;
    if (!nd || !nd.items || !nd.items.length) {
      return emptyState("📰", "今日资讯尚未生成", "每日 7:00 自动抓取官媒与科技热点");
    }
    var catMap = {};
    (nd.categories || []).forEach(function (c) { catMap[c.key] = c.label; });
    // priority 语义：5 = 最重要（与 render.js 原排序一致），降序取前 5；null/undefined 按 5 兜底，0 合法保留
    var items = nd.items.slice().sort(function (a, b) {
      var pa = (a.priority != null) ? a.priority : 5;
      var pb = (b.priority != null) ? b.priority : 5;
      return pb - pa;
    }).slice(0, 5);
    var rows = items.map(function (n) {
      var label = catMap[n.category] || n.category || "";
      return '<div style="padding:8px 0;border-bottom:1px solid var(--border)">' +
        '<div style="font-weight:600;margin-bottom:2px">' + esc(n.title) + '</div>' +
        '<div class="text-sm text-secondary">' + esc((n.summary || "").slice(0, 90)) + ((n.summary || "").length > 90 ? "…" : "") + '</div>' +
        '<div style="margin-top:3px;font-size:12px;color:var(--text-muted)">' +
          (label ? '🏷 ' + esc(label) + ' · ' : '') + esc(n.source || "") +
          (n.url ? ' · <a href="' + esc(n.url) + '" target="_blank" rel="noopener" class="source-link" onclick="event.stopPropagation()">原文 ↗</a>' : '') +
        '</div></div>';
    }).join("");
    var fresh = (nd.generatedAt && nd.generatedAt.slice(0, 10) === (typeof root.today === "function" ? root.today() : bjToday()))
      ? '<span class="badge badge-green" style="margin-left:6px">今日已更新</span>' : '';
    return '<div style="margin-bottom:6px;color:var(--text-secondary);font-size:12px">共 ' + nd.items.length + ' 条，按重要性取前 ' + items.length + fresh + '</div>' + rows;
  }

  // —— 3) 每日知识（今日 1 张卡）——
  function knowledgeBody() {
    var k = (typeof root.__knowledge !== "undefined") ? root.__knowledge : null;
    var items = [];
    if (typeof root.learnItemsByDate === "function") {
      try {
        var d = (typeof root.learnTodayDate === "function") ? root.learnTodayDate() : bjToday();
        items = root.learnItemsByDate(d) || [];
      } catch (e) { items = []; }
    }
    if ((!items || !items.length) && k && k.pool && k.history && k.history.length) {
      // 回退：直接从 history 取当日 id
      var last = k.history[k.history.length - 1];
      var ids = (last && last.itemIds) || [];
      items = (k.pool || []).filter(function (p) { return ids.indexOf(p.id) >= 0; });
    }
    if (!items || !items.length) {
      return emptyState("💡", "今日知识卡尚未生成", "每日 7:10 自动生成 50 张卡片");
    }
    var c = items[0];
    var points = (c.points || []).slice(0, 3).map(function (p) { return '<div>• ' + esc(p) + '</div>'; }).join("");
    return '<div style="font-weight:600;margin-bottom:4px">' + esc(c.title || "") +
      (c.tag ? ' <span class="badge" style="background:#3d7fd622;color:#3d7fd6">' + esc(c.tag) + '</span>' : '') + '</div>' +
      '<div class="text-sm text-secondary" style="margin-bottom:6px">' + esc(c.content || "") + '</div>' +
      points +
      (c.tip ? '<div style="margin-top:6px;padding:6px 8px;background:rgba(61,127,214,0.08);border-radius:6px;font-size:12px">💡 ' + esc(c.tip) + '</div>' : '') +
      '<div style="margin-top:6px;font-size:12px;color:var(--text-muted)">今日共 ' + items.length + ' 张 · ' +
      '<span style="cursor:pointer;color:var(--accent-blue)" onclick="navigate(\'learn\')">查看全部 →</span></div>';
  }

  // —— init：预取简报（首次进入 Today 时调用一次）——
  var _inited = false;
  function initToday(state) {
    if (_inited) return;
    _inited = true;
    loadBrief(state && state.rerender);
  }

  // —— render：返回 Today section 的 HTML ——
  function renderToday(state) {
    var out = HINT;
    out += card("📋 Today's Brief", briefBody(state), "08:00 更新");
    out += card("🔥 今日要点 Top 5", highlightsBody(), "7:00 抓取");
    out += card("💡 每日知识", knowledgeBody(), "7:10 生成");
    return out;
  }

  function registerIntelSection(registry) {
    registry[SECTION_ID] = {
      id: SECTION_ID,
      label: SECTION_LABEL,
      nav: true,
      init: initToday,
      render: renderToday,
      requires: REQUIRES
    };
    return true;
  }

  // 按契约暴露：注册函数名带 section id 后缀，便于 index.js 显式收集
  root.registerIntelSection_today = registerIntelSection;

})(typeof globalThis !== "undefined" ? globalThis : this);
