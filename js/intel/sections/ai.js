// ============================================================
// 行业情报 · sections/ai.js（Sprint 6 · 🤖 AI 前沿）
// 从当日资讯按关键词分流「大模型/AI 应用/AI 硬件/智算」条目。
// 数据两阶段：先关键词分流 LiveData.news，后续数据源扩充再升级。
// 契约：sections/contract.md + sections/shell.js（SectionShell）
// ============================================================
(function (root) {
  "use strict";

  var CONF = {
    id: "ai",
    label: "AI 前沿",
    icon: "🤖",
    hint: "大模型 / AI 应用 / AI 硬件 / 智算 · 关键词自动分流",
    config: {
      subGroups: [
        { key: "model", label: "🧠 大模型与产品", words: ["大模型", "人工智能", "GPT", "文心", "通义", "豆包", "智谱", "DeepSeek", "Claude", "Gemini", "多模态", "AI 助手", "智能体", "AIGC", "生成式"] },
        { key: "ai_hw", label: "📟 AI 硬件与芯片", words: ["AI 芯片", "NPU", "算力", "智算", "AI 手机", "AI PC", "端侧 AI", "自动驾驶", "智能驾驶"] },
        { key: "ai_app", label: "🔌 AI 应用落地", words: ["AI 应用", "AI 医疗", "AI 教育", "智能客服", "AIGC", "智能体", "具身智能", "人形机器人"] }
      ],
      include: ["AI", "智能"],
      exclude: ["人工智能与实体经济"] // 政策类留在 official，避免重复刷屏
    },
    maxPerGroup: 5
  };

  var made = root.makeIntelThemeSection(CONF);
  function registerIntelSection(registry) { return made.register(registry); }
  root.registerIntelSection_ai = registerIntelSection;

})(typeof globalThis !== "undefined" ? globalThis : this);
