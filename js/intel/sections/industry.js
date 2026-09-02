// ============================================================
// 行业情报 · sections/industry.js（Sprint 6 · 🏭 Industry 产业脉搏）
// 从当日资讯按关键词分流「消费电子/硬件产品/供应链/新能源/政策」条目——
// 面向硬件 PM：这组最贴近日常产品决策。
// 数据两阶段：先关键词分流 LiveData.news，后续数据源扩充再升级。
// 契约：sections/contract.md + sections/shell.js（SectionShell）
// ============================================================
(function (root) {
  "use strict";

  var CONF = {
    id: "industry",
    label: "产业脉搏",
    icon: "🏭",
    hint: "消费电子 / 供应链 / 新能源 / 产业政策 · 关键词自动分流",
    config: {
      subGroups: [
        { key: "ce", label: "📱 消费电子", words: ["手机", "笔记本", "电脑", "耳机", "平板", "可穿戴", "智能手表", "折叠屏", "显示", "面板", "苹果", "华为", "小米", "三星"] },
        { key: "supply", label: "🔗 供应链与制造", words: ["供应链", "产能", "工厂", "制造", "代工", "订单", "出货", "采购", "零部件"] },
        { key: "energy", label: "🔋 新能源与电池", words: ["新能源", "电池", "储能", "光伏", "锂电", "充电", "电动"] },
        { key: "policy", label: "📜 产业政策", words: ["工信部", "国务院", "发改委", "网信办", "行动计划", "指导意见", "规划", "政策", "标准"] }
      ],
      include: ["产业", "行业", "产品"],
      exclude: []
    },
    maxPerGroup: 5
  };

  var made = root.makeIntelThemeSection(CONF);
  function registerIntelSection(registry) { return made.register(registry); }
  root.registerIntelSection_industry = registerIntelSection;

})(typeof globalThis !== "undefined" ? globalThis : this);
