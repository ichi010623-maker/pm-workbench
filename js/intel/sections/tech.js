// ============================================================
// 行业情报 · sections/tech.js（Sprint 6 · 🔬 Tech 硬科技）
// 从当日资讯按关键词分流「芯片/通信/航天/量子/新材料」条目。
// 数据两阶段：先关键词分流 LiveData.news，后续数据源扩充再升级。
// 契约：sections/contract.md + sections/shell.js（SectionShell）
// ============================================================
(function (root) {
  "use strict";

  var CONF = {
    id: "tech",
    label: "硬科技",
    icon: "🔬",
    hint: "芯片 / 通信 / 航天 / 量子 / 材料 · 关键词自动分流",
    config: {
      subGroups: [
        { key: "chip", label: "💾 芯片与半导体", words: ["芯片", "半导体", "处理器", "CPU", "GPU", "光刻", "晶圆", "制程", "麒麟", "骁龙", "M2", "Ryzen", "5G 毫米波"] },
        { key: "space", label: "🚀 航天与前沿", words: ["卫星", "航天", "火箭", "空间站", "探月", "嫦娥", "量子", "探测器"] },
        { key: "comm", label: "📶 通信与网络", words: ["5G", "6G", "通信", "网络", "光纤", "Wi-Fi"] }
      ],
      include: ["科技", "研发", "新技术"],
      exclude: []
    },
    maxPerGroup: 5
  };

  var made = root.makeIntelThemeSection(CONF);
  function registerIntelSection(registry) { return made.register(registry); }
  root.registerIntelSection_tech = registerIntelSection;

})(typeof globalThis !== "undefined" ? globalThis : this);
