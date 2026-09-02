// ============================================================
// 行业情报 · state（UI 瞬态统一存储）—— Sprint 1.5
// 用法（render.js 等渲染层已按此改写，行为与旧 window.__intel* 完全一致）：
//   intelState.newsCatFilter = "all";        // 写（纯引用存储，无深拷贝）
//   var x = intelState.newsCatFilter;        // 读
//   intelState.reset("newsCatFilter");       // 重置单键为注册默认
//   intelState.resetAll();                   // 清空全部瞬态（离开路由/初始化）
// 说明：
//   - 键直接作为 intelState 的属性存在（含嵌套对象引用语义，如 favPick.catId 可原地改）
//   - registry 声明了 v1.0 存量键（随 render 层从 window.__intel* 迁来）与默认值；
//     v2.0 sections 新增键先在此登记，禁止在业务代码里发明新 window.__xxx
// 依赖：无（core 之后、render 之前加载即可）
// ============================================================
(function (root) {
  "use strict";

  // 注册表：键名 → 默认值（undefined = 无默认，读取为 undefined）
  var REGISTRY = {
    // —— v1.0 存量瞬态（自 window.__intel* / window.__newsCatFilter 等迁移）——
    newsCatFilter: "all",     // 资讯分类筛选
    liveNews: undefined,      // 当前资讯列表快照 {items,date}
    myIntel: undefined,       // 我的情报过滤结果
    customIntelItems: undefined, // 自定义情报 flat 列表
    favItems: undefined,      // 收藏过滤结果
    intelFavBase: undefined,  // 收藏全量（供搜索局部刷新）
    intelFavFilter: "all",    // 收藏分类筛选
    intelFavOrigin: "all",    // Sprint 3：收藏来源筛选（all/news/mine/custom）
    intelFavSearch: "",       // 收藏搜索词
    intelCalMonth: undefined, // 历史月历当前月 YYYY-MM
    intelSelDate: undefined,  // 历史选中日期
    intelHistSearch: "",      // 历史搜索词
    intelHistCat: "all",      // 历史分类筛选
    intelHistDay: undefined,  // 历史当日快照 {sel,items,cats}
    favPick: undefined,       // 收藏分类选择器暂存 {scope,idx,key,catId}
    cmtKey: undefined,        // 评论面板 key
    cmtTitle: undefined,      // 评论面板标题
    cmtEditing: undefined,    // 正在编辑的评论 id
    // —— v2.0 sections 新增键从此处向下登记 ——
    // worldCat: "tech",
  };

  // 存储本体：键直接作为属性（引用语义，无深拷贝 → favPick.catId 原地修改有效）
  var _store = {};

  // 用注册默认值初始化
  Object.keys(REGISTRY).forEach(function (k) {
    if (REGISTRY[k] !== undefined) _store[k] = REGISTRY[k];
  });

  var intelState = {
    // 读（不存在返回注册默认）
    get: function (k) {
      if (Object.prototype.hasOwnProperty.call(_store, k)) return _store[k];
      return REGISTRY[k];
    },
    // 写（纯引用存储，与旧 window.__x = v 语义一致）
    set: function (k, v) { _store[k] = v; return v; },
    // 重置单键为默认（无默认 → 删除，读取回到 REGISTRY 默认/undefined）
    reset: function (k) {
      if (REGISTRY[k] !== undefined) _store[k] = REGISTRY[k];
      else delete _store[k];
    },
    // 全量重置（离开 industry 路由或初始化）
    resetAll: function () {
      _store = {};
      Object.keys(REGISTRY).forEach(function (k) {
        if (REGISTRY[k] !== undefined) _store[k] = REGISTRY[k];
      });
    },
    // 巡检：当前已被写入的键
    usedKeys: function () { return Object.keys(_store); },
    registry: Object.keys(REGISTRY),
    _store: _store
  };

  // 属性式读写兼容：把 _store 的键以 getter/setter 挂到 intelState，
  // 使 `intelState.newsCatFilter = "x"` 与 `intelState.newsCatFilter` 生效
  Object.keys(REGISTRY).forEach(function (k) {
    Object.defineProperty(intelState, k, {
      get: function () { return _store[k]; },
      set: function (v) { _store[k] = v; },
      enumerable: false,
      configurable: true
    });
  });

  root.intelState = intelState;

})(typeof globalThis !== "undefined" ? globalThis : this);
