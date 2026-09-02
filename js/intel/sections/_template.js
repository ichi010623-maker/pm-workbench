// js/intel/sections/_template.js —— 新 section 起点模板（Sprint 1.5）
// 用法：复制为 sections/<id>.js，按契约（sections/contract.md）替换 TODO 后注册。
// 注册后：在 sections/index.js 的 registrars 数组放开对应行，并在 index.html 加载该文件。
(function (root) {
  "use strict";

  // ===== 1) 元信息 =====
  var SECTION_ID = "TODO";          // 与文件名一致，如 "world"
  var SECTION_LABEL = "🌐 TODO";    // 导航显示文本

  // ===== 2) 依赖声明（见 contract.md §5）=====
  var REQUIRES = [];                // 如 ["liveData.news", "llm.client"]

  // ===== 3) 内部状态：一律走 intelState，禁止 window.__xxx =====
  // var _stateKey = SECTION_ID + "Filter";

  // ===== 4) 实现 =====
  function initTODO(state) {
    // 可选：首次进入时预取/重置（如默认筛选）
  }

  function renderTODO(state) {
    // 返回 HTML 字符串；无数据时返回空态提示（不抛异常）
    // 可用依赖：root.LiveData / root.DB / root.intelState / root.escapeHtml 等
    return '<div class="empty-state"><div class="empty-icon">📡</div><div class="empty-text">' + SECTION_LABEL + ' 数据未就绪</div></div>';
  }

  // ===== 5) 唯一对外接口 =====
  function registerIntelSection(registry) {
    registry[SECTION_ID] = {
      id: SECTION_ID,
      label: SECTION_LABEL,
      nav: true,
      init: initTODO,
      render: renderTODO,
      requires: REQUIRES
    };
    return true;
  }

  root.registerIntelSection = registerIntelSection;

})(typeof globalThis !== "undefined" ? globalThis : this);
