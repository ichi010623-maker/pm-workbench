// ============================================================
// 行业情报 · sections/finance.js（Sprint 6 · 💰 Finance 财经动态）
// 从当日资讯按关键词分流「财报/融资/资本市场/金融政策」条目。
// 数据两阶段：先关键词分流 LiveData.news，后续数据源扩充再升级。
// 契约：sections/contract.md + sections/shell.js（SectionShell）
// ============================================================
(function (root) {
  "use strict";

  var CONF = {
    id: "finance",
    label: "财经动态",
    icon: "💰",
    hint: "财报 / 融资 / 股价 / 金融政策 · 关键词自动分流",
    config: {
      subGroups: [
        { key: "market", label: "📈 融资与资本", words: ["融资", "融资轮", "IPO", "上市", "股价", "市值", "投资", "并购", "收购", "估值", "财报", "营收", "净利", "增长 %"] },
        { key: "finance_policy", label: "🏦 金融政策", words: ["央行", "利率", "货币", "金融", "银行", "降息", "汇率", "人民币", "美元", "证券", "基金"] }
      ],
      include: ["财经", "资本", "经济"],
      exclude: []
    },
    maxPerGroup: 5
  };

  var made = root.makeIntelThemeSection(CONF);
  function registerIntelSection(registry) { return made.register(registry); }
  root.registerIntelSection_finance = registerIntelSection;

})(typeof globalThis !== "undefined" ? globalThis : this);
