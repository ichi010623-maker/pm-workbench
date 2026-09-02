// ============================================================
// 行业情报 · sections/shell.js（Sprint 5 · SectionShell）
// 通用「主题流」渲染外壳：Sprint 6 的 World/Finance/AI/Tech/Industry 等
// 主题 section 只需给一份薄配置，本节负责：关键词分流 → 分组 → 列表渲染。
// 能力：
//   - 关键词分流：title/summary 命中任一 include 词即入选；exclude 命中即剔除
//   - 子组 chips：把关键词按 subGroup 分组（如 finance: 财报/融资/政策），chip 切换
//   - priority 置顶（5 最先），组内按 priority 降序
//   - 每组默认折叠、可展开；列表限 10 条 +「加载更多」逐组
//   - 复用 render.js intelItemCard（收藏/评论/导出可用），缺失时降级简单卡片
// 契约：sections/contract.md；依赖 root（LiveData/escapeHtml/intelState/DB）
// ============================================================
(function (root) {
  "use strict";

  // —— 匹配工具 ——
  function hitText(item) {
    return String(item.title || "") + " " + String(item.summary || "");
  }
  function includesHit(text, words) {
    for (var i = 0; i < (words || []).length; i++) {
      if (text.indexOf(words[i]) >= 0) return true;
    }
    return false;
  }

  // —— 小工具（不依赖 render.js，独立可用）——
  function esc(s) {
    return (typeof root.escapeHtml === "function") ? root.escapeHtml(s) : (s == null ? "" : String(s));
  }
  function card(t, bodyHtml, badge) {
    return '<div class="card"><div class="card-header"><div class="card-title">' + t + '</div>' +
      (badge ? '<span class="badge" style="background:#3d7fd622;color:#3d7fd6">' + esc(badge) + '</span>' : '') +
      '</div><div class="card-body">' + bodyHtml + '</div></div>';
  }
  function emptyState(icon, text, sub) {
    return '<div class="empty-state"><div class="empty-icon">' + icon + '</div><div class="empty-text">' + text +
      (sub ? '<br><span style="opacity:.7;font-size:12px">' + esc(sub) + '</span>' : '') + '</div></div>';
  }

  // —— 核心：把当日资讯按 config 分流成 [{groupKey, label, items}] ——
  // config: {
  //   subGroups: [{key, label, words: [..] }],   // 可选：组与命中词
  //   include: [..],   // 组未命中时的全局 include（组词优先）
  //   exclude: [..]    // 全局排除
  // }
  function shellGroupNews(config) {
    var nd = (typeof root.LiveData !== "undefined" && root.LiveData.news) ? root.LiveData.news : null;
    if (!nd || !nd.items || !nd.items.length) return { groups: [], date: null, total: 0 };
    var date = (nd.generatedAt || "").slice(0, 10);
    var items = nd.items || [];
    var groups = [];
    var leftover = [];
    // 1) 按子组命中分流（一条只进第一个命中组，防重复）
    (config.subGroups || []).forEach(function (g) {
      var picked = [];
      var rest = [];
      for (var i = 0; i < items.length; i++) {
        var t = hitText(items[i]);
        if (includesHit(t, g.words)) picked.push(items[i]); else rest.push(items[i]);
      }
      items = rest;
      if (picked.length) groups.push({ key: g.key, label: g.label, items: picked });
    });
    // 2) 全局 include 兜底（未命中任何子组的词进入「其他」）
    if (config.include && config.include.length) {
      var picked2 = [];
      var rest2 = [];
      for (var j = 0; j < items.length; j++) {
        var t2 = hitText(items[j]);
        if (includesHit(t2, config.include)) picked2.push(items[j]); else rest2.push(items[j]);
      }
      leftover = rest2;
      if (picked2.length) groups.push({ key: "__other", label: "🎯 其他相关", items: picked2 });
    } else {
      leftover = items;
    }
    // 3) 全局排除（从已收集的所有条目中剔除）
    if (config.exclude && config.exclude.length) {
      groups.forEach(function (g) {
        g.items = g.items.filter(function (it) { return !includesHit(hitText(it), config.exclude); });
      });
      groups = groups.filter(function (g) { return g.items.length > 0; });
    }
    // 组内排序：priority 5→1
    groups.forEach(function (g) {
      g.items = g.items.slice().sort(function (a, b) { return (b.priority || 5) - (a.priority || 5); });
    });
    return { groups: groups, date: date, total: nd.items.length, leftover: leftover };
  }

  // —— 渲染单条（复用 intelItemCard 若有，否则降级）——
  function shellItemHtml(item, date, scopePrefix, idx, catLabel) {
    if (typeof root.intelItemCard === "function") {
      try { return root.intelItemCard(item, date, scopePrefix, idx, catLabel); } catch (e) {}
    }
    var sum = (item.summary || "").slice(0, 120);
    return '<div class="card"><div class="card-header"><div class="card-title">' + esc(item.title) + '</div></div>' +
      (sum ? '<div class="card-body">' + esc(sum) + '</div>' : '') +
      (item.url ? '<div class="card-body" style="padding-top:0"><a href="' + esc(item.url) + '" target="_blank" rel="noopener">🔗 原文 ↗</a></div>' : '') +
      '</div>';
  }

  // —— 渲染主入口：返回 section HTML ——
  // state: { id, icon, title, sub, hint, config, maxPerGroup(默认5), itemScope(默认'news'), catLabelFn }
  function renderSectionShell(state) {
    var cfg = state.config || {};
    var grouped = shellGroupNews(cfg);
    if (!grouped.date) {
      return emptyState(state.icon || "📡", state.title + " 数据未就绪", "每日 7:00 自动抓取官媒与科技热点");
    }
    if (!grouped.groups.length) {
      return emptyState(state.icon || "📡", state.title + " · 今日暂无匹配资讯",
        "已扫 " + grouped.total + " 条 · 关键词可后续扩充" + (cfg.hint || ""));
    }
  // 状态键需在 state.js 注册（shellCat_<id>），此处动态读取时若未注册会返回 undefined → 兜底
  var st = (typeof root.intelState !== "undefined") ? root.intelState : null;
  var curKey = "all";
  if (st) {
    var v = st.get("shellCat_" + state.id);
    if (v != null) curKey = v;
  }
    var chips = '<div class="filter-bar" style="margin-bottom:8px">' +
      '<div class="chip' + (curKey === "all" ? " active" : "") + '" onclick="intelState.set(\'shellCat_' + state.id + '\',\'all\');render()">全部 ' + grouped.groups.reduce(function (a, g) { return a + g.items.length; }, 0) + '</div>' +
      grouped.groups.map(function (g) {
        var act = curKey === g.key ? " active" : "";
        return '<div class="chip' + act + '" onclick="intelState.set(\'shellCat_' + state.id + '\',\'' + g.key + '\');render()">' + esc(g.label) + ' ' + g.items.length + '</div>';
      }).join("") + '</div>';
    // 列表
    var listGroups = (curKey === "all") ? grouped.groups : grouped.groups.filter(function (g) { return g.key === curKey; });
    var baseMax = state.maxPerGroup || 5;
    var html = listGroups.map(function (g) {
      var max = root.shellMoreOf(state.id, g.key) || baseMax;
      var showItems = g.items.slice(0, max);
      var more = g.items.length > max;
      var rows = showItems.map(function (item, idx) {
        var catLabel = (state.catLabelFn ? state.catLabelFn(item) : "") || item.category || "";
        return shellItemHtml(item, grouped.date, state.itemScope || "news", idx, catLabel);
      }).join("");
      return '<div class="lg-card" style="margin-top:8px"><div class="lg-card-h">' + esc(g.label) + ' <span class="lg-sub">' + g.items.length + ' 条</span></div>' +
        rows +
        (more ? '<button class="btn btn-secondary" style="width:100%;margin-top:6px" onclick="shellMore(\'' + state.id + '\',\'' + g.key + '\')">加载更多（还有 ' + (g.items.length - max) + ' 条）</button>' : '') +
        '</div>';
    }).join("");
    var fresh = (grouped.date === (typeof root.today === "function" ? root.today() : "")) ? '<span class="badge badge-green" style="margin-left:6px">今日</span>' : '';
    var hintHtml = (state.hint ? '<div class="enm-hint" style="margin-bottom:6px">' + esc(state.hint) + '</div>' : '') +
      '<div class="enm-hint" style="margin-bottom:2px;opacity:.8">覆盖 ' + grouped.groups.length + ' 组 · 共 ' + grouped.total + ' 条资讯 ' + fresh + '</div>';
    return hintHtml + chips + html;
  }

  // 「加载更多」：把该组的 maxPerGroup 上限 +5 并重渲染（上限存 state）
  var SHELL_MORE = {};
  function shellMore(sectionId, groupKey) {
    var k = "shellMore_" + sectionId + "_" + groupKey;
    SHELL_MORE[k] = (SHELL_MORE[k] || 5) + 5;
    if (typeof root.render === "function") root.render();
  }
  function shellMoreOf(sectionId, groupKey) {
    return SHELL_MORE["shellMore_" + sectionId + "_" + groupKey] || 5;
  }

  // —— 主题 section 工厂：给薄配置生成符合契约的 descriptor ——
  // conf: { id, label, icon, hint, config(shellGroupNews), maxPerGroup }
  function makeIntelThemeSection(conf) {
    var SECTION_ID = conf.id;
    function render(state) {
      return root.renderSectionShell({
        id: SECTION_ID,
        icon: conf.icon,
        title: conf.label,
        hint: conf.hint,
        config: conf.config,
        maxPerGroup: conf.maxPerGroup,
        itemScope: "news",
        catLabelFn: conf.catLabelFn
      });
    }
    function register(registry) {
      registry[SECTION_ID] = {
        id: SECTION_ID,
        label: conf.icon + " " + conf.label,
        nav: true,
        init: conf.init,
        render: render,
        requires: ["liveData.news"]
      };
      return true;
    }
    return { register: register, render: render };
  }

  root.shellGroupNews = shellGroupNews;
  root.renderSectionShell = renderSectionShell;
  root.shellMore = shellMore;
  root.shellMoreOf = shellMoreOf;
  root.makeIntelThemeSection = makeIntelThemeSection;

})(typeof globalThis !== "undefined" ? globalThis : this);
