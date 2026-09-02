// ============================================================
// 行业情报 · sections/world.js（Sprint 6 · 🌍 World 国际视野）
// 从当日资讯按关键词分流「国际/地缘/贸易/出海」相关条目。
// 数据两阶段：先关键词分流 LiveData.news，后续数据源扩充再升级。
// 契约：sections/contract.md + sections/shell.js（SectionShell）
// ============================================================
(function (root) {
  "use strict";

  var CONF = {
    id: "world",
    label: "国际视野",
    icon: "🌍",
    hint: "国际 / 地缘 / 贸易 / 出海相关资讯 · 关键词自动分流",
    config: {
      subGroups: [
        { key: "trade", label: "🌐 贸易与地缘", words: ["美国", "欧盟", "英国", "日本", "韩国", "印度", "关税", "贸易", "制裁", "出口管制", "地缘", "外交", "峰会", "协议"] },
        { key: "overseas", label: "🚢 出海与市场", words: ["出海", "海外", "国际市场", "跨境电商", "全球化", "东南亚", "中东", "拉美", "俄罗斯"] }
      ],
      include: ["国际", "全球", "海外"],
      exclude: []
    },
    maxPerGroup: 5
  };

  var made = root.makeIntelThemeSection(CONF);
  function registerIntelSection(registry) { return made.register(registry); }
  root.registerIntelSection_world = registerIntelSection;

})(typeof globalThis !== "undefined" ? globalThis : this);
