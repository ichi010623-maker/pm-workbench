// ============================================================
// 行业情报 · sections 注册中心（Sprint 2）
// 职责：收集所有已加载的 section 描述，供 render.js 的 renderIndustry() 渲染导航与内容。
// 契约见 sections/contract.md；新 section 复制 _template.js 后在下方 registrars 放开。
// 依赖：无（各 section 文件需在本文件之前加载）
// ============================================================
(function (root) {
  "use strict";

  // 各 section 的注册函数（按导航顺序）。section 文件加载后挂到 root。
  function registrars() {
    var list = [];
    // —— Sprint 2 起逐个放开（顺序 = 顶部导航顺序）——
    if (typeof root.registerIntelSection_today === "function") list.push(root.registerIntelSection_today);
    // Sprint 4 · PM Insight（AI 解读）
    if (typeof root.registerIntelSection_pm === "function") list.push(root.registerIntelSection_pm);
    // Sprint 6 · 主题流（SectionShell 关键词分流）
    if (typeof root.registerIntelSection_world === "function") list.push(root.registerIntelSection_world);
    if (typeof root.registerIntelSection_finance === "function") list.push(root.registerIntelSection_finance);
    if (typeof root.registerIntelSection_ai === "function") list.push(root.registerIntelSection_ai);
    if (typeof root.registerIntelSection_tech === "function") list.push(root.registerIntelSection_tech);
    if (typeof root.registerIntelSection_industry === "function") list.push(root.registerIntelSection_industry);
    return list;
  }

  // 收集全部 section → { id: descriptor }（保序）
  function collectIntelSections() {
    var registry = {};
    registrars().forEach(function (fn) {
      try {
        fn(registry);
      } catch (e) {
        if (typeof console !== "undefined") console.error("[sections] 注册失败:", e && e.message);
      }
    });
    return registry;
  }

  // 取一个 section 的描述（不存在返回 null）
  function getIntelSection(id) {
    var reg = collectIntelSections();
    return Object.prototype.hasOwnProperty.call(reg, id) ? reg[id] : null;
  }

  root.collectIntelSections = collectIntelSections;
  root.getIntelSection = getIntelSection;

})(typeof globalThis !== "undefined" ? globalThis : this);
