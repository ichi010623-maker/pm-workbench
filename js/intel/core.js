// ============================================================
// 行业情报 · core（初始化 + 收藏分类常量 + 历史快照 + AI 配置）
// 纯函数，不依赖 DOM，便于 Node vm 自动化测试
// 依赖：外部 today() / uid() / localStorage / DB（沙箱注入）
// ============================================================
(function (root) {
  "use strict";

  // 把某一天抓取的资讯快照写入 history（按 generatedAt 的日期分桶）；同一天重复抓取幂等不覆盖
  function snapshotNewsForDate(news, history) {
    if (!news || !news.items || !news.items.length || !news.generatedAt) return history || {};
    var date = String(news.generatedAt).slice(0, 10);
    history = history || {};
    if (history[date] && history[date].generatedAt === news.generatedAt) return history; // 当天已留存，幂等
    var items = news.items.map(function (n) {
      return {
        id: n.id, category: n.category, priority: n.priority,
        title: n.title, summary: n.summary, source: n.source,
        url: n.url, pubTime: n.pubTime, tags: Array.isArray(n.tags) ? n.tags : []
      };
    });
    var copy = {};
    for (var k in history) if (history.hasOwnProperty(k)) copy[k] = history[k];
    copy[date] = { generatedAt: news.generatedAt, categories: news.categories || [], items: items };
    return copy;
  }

  // 用服务端每日归档（news-archive.json）补齐本地缺失日期（幂等：已有日期不覆盖）
  function reconcileIntelHistory(archive, history) {
    history = history || {};
    if (!archive || typeof archive !== "object") return history;
    var dates = Object.keys(archive).sort();
    var changed = false;
    for (var i = 0; i < dates.length; i++) {
      var date = dates[i];
      var day = archive[date];
      if (!day || !day.items || !day.items.length) continue;
      if (history[date] && history[date].items && history[date].items.length) continue; // 已有，保留
      history[date] = {
        generatedAt: day.generatedAt || date + "T00:00:00+08:00",
        categories: Array.isArray(day.categories) ? day.categories : [],
        items: (day.items || []).map(function (n) {
          return {
            id: n.id, category: n.category, priority: n.priority,
            title: n.title, summary: n.summary, source: n.source,
            url: n.url, pubTime: n.pubTime, tags: Array.isArray(n.tags) ? n.tags : []
          };
        })
      };
      changed = true;
    }
    return changed ? history : history;
  }

  // 收藏分类默认集（用户可自定义名称 / 新增 / 重命名 / 删除）
  var INTEL_FAV_CATS_DEFAULT = [
    { id: "market", name: "市场" },
    { id: "competitor", name: "竞品" },
    { id: "tech", name: "技术" },
    { id: "supply", name: "供应链" },
    { id: "policy", name: "政策" }
  ];

  function ensureIndustry() {
    if (typeof DB === "undefined" || !DB.data) return;
    if (!DB.data.industryHistory) DB.data.industryHistory = {};
    if (!DB.data.industryFav) DB.data.industryFav = [];
    if (!DB.data.industryCustom) DB.data.industryCustom = [];
    if (!DB.data.industryComments) DB.data.industryComments = {};
    if (!DB.data.industryFavCats) DB.data.industryFavCats = INTEL_FAV_CATS_DEFAULT.map(function (c) { return { id: c.id, name: c.name }; });
    if (!Array.isArray(DB.data.marketOpp)) DB.data.marketOpp = [];
  }

  // ---------- API Key 配置（与 recipes 共享 localStorage 键 hw_pm_ai_config） ----------
  function loadAiConfig() {
    try { return JSON.parse((typeof localStorage !== "undefined" ? localStorage.getItem("hw_pm_ai_config") : null) || "{}"); }
    catch (e) { return {}; }
  }
  function saveAiConfig(cfg) {
    try { if (typeof localStorage !== "undefined") localStorage.setItem("hw_pm_ai_config", JSON.stringify(cfg || {})); } catch (e) {}
  }

  root.snapshotNewsForDate = snapshotNewsForDate;
  root.reconcileIntelHistory = reconcileIntelHistory;
  root.INTEL_FAV_CATS_DEFAULT = INTEL_FAV_CATS_DEFAULT;
  root.ensureIndustry = ensureIndustry;
  root.loadAiConfig = loadAiConfig;
  root.saveAiConfig = saveAiConfig;
})(typeof globalThis !== "undefined" ? globalThis : this);