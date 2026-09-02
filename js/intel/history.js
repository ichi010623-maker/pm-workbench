// ============================================================
// 行业情报 · history（历史回顾相关纯函数）
// 依赖：core（无直接依赖，独立纯函数）
// ============================================================
(function (root) {
  "use strict";

  // 返回历史日期列表（倒序，最新在前）
  function intelHistoryDates(history) {
    if (!history) return [];
    return Object.keys(history).sort().reverse();
  }

  // 取某一天留存的资讯条目
  function intelHistoryByDate(history, date) {
    if (!history || !history[date]) return [];
    return history[date].items || [];
  }

  // 历史回顾关键词搜索：匹配 标题/摘要/来源/标签（不区分大小写）
  function intelSearchItems(items, keyword) {
    items = items || [];
    keyword = String(keyword || "").trim().toLowerCase();
    if (!keyword) return items.slice();
    return items.filter(function (n) {
      var hay = [n.title, n.summary, n.source, (n.tags || []).join(" ")].join(" ").toLowerCase();
      return hay.indexOf(keyword) >= 0;
    });
  }

  // 历史回顾按分类筛选（day.categories 的 key）
  function intelFilterItemsByCategory(items, catKey) {
    items = items || [];
    if (!catKey || catKey === "all") return items.slice();
    return items.filter(function (n) { return (n.category || "") === catKey; });
  }

  root.intelHistoryDates = intelHistoryDates;
  root.intelHistoryByDate = intelHistoryByDate;
  root.intelSearchItems = intelSearchItems;
  root.intelFilterItemsByCategory = intelFilterItemsByCategory;
})(typeof globalThis !== "undefined" ? globalThis : this);