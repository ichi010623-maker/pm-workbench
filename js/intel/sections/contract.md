# Industry Intelligence v2.0 · Sections 契约（Sprint 1.5）

> 本契约定义「行业情报 v2.0」各 section（Today / World / Finance / Tech / AI / Industry / Product / Saved）
> 的**统一注册方式、接口签名与依赖声明**。任何新 section 都必须遵守本契约，
> 禁止在 `js/app.js` 或 `js/intel/*.js` 中散落 section 专属逻辑。

---

## 1. 文件位置与命名

```
js/intel/sections/
├── contract.md          ← 本文档
├── _template.js         ← 新 section 的起点模板（复制改名）
├── today.js             ← Sprint 2
├── world.js             ← Sprint 6
├── finance.js
├── tech.js
├── ai.js
├── industry.js
├── product.js
└── saved.js
```

每个 section 一个文件，**文件名 = section id**（`world.js` → id `"world"`）。

## 2. 全局注册（IIFE + root 挂载）

与 `js/intel/*.js` 现有约定一致：每个文件用 IIFE 包裹，**只向外暴露一个注册函数**：

```js
(function (root) {
  "use strict";

  // —— 唯一对外接口 ——
  // 注册 section 描述，返回 true 表示注册成功
  function registerIntelSection(registry) {
    registry["world"] = {
      id: "world",
      label: "🌍 国际",
      nav: true,              // 是否出现在行业情报顶部分组导航
      init: initWorld,        // 可选：首次进入时初始化（数据预取/状态重置）
      render: renderWorld,    // 必选：返回 section 的 HTML 字符串（或 null 表示不可用）
      requires: []            // 依赖的外部能力（见 §5）
    };
    return true;
  }

  // —— section 内部实现 ——
  function initWorld(state) { /* 可选：一次性数据准备 */ }
  function renderWorld(state) { return "<div>...</div>"; }

  // 暴露：挂到 globalThis，供 js/intel/sections/index.js 统一收集
  root.registerIntelSection = registerIntelSection;

})(typeof globalThis !== "undefined" ? globalThis : this);
```

## 3. 注册入口（sections/index.js，由 render 层统一调用）

```js
// js/intel/sections/index.js —— Sprint 1.5 提供，Sprint 2 起填充真实 section
(function (root) {
  "use strict";
  function collectIntelSections() {
    var registry = {};
    var registrars = [
      // Sprint 2 起逐个放开，加载顺序即导航顺序：
      // root.registerIntelSection_today,   // sections/today.js
      // root.registerIntelSection_world,   // sections/world.js
      // ...
    ];
    (registrars || []).forEach(function (fn) { try { fn && fn(registry); } catch (e) { console.error("[sections] 注册失败", e); } });
    return registry;
  }
  root.collectIntelSections = collectIntelSections;
})(typeof globalThis !== "undefined" ? globalThis : this);
```

**加载顺序要求**：`index.html` 中 section 文件必须在 `render.js` **之前**、`intel/*.js`（core/fav/...）**之后**加载。

## 4. Section 描述对象字段

| 字段 | 类型 | 必选 | 说明 |
|---|---|---|---|
| `id` | string | ✅ | 与文件名一致，全局唯一 |
| `label` | string | ✅ | 顶部导航显示文本（含 emoji） |
| `nav` | boolean | 默认 true | false = 不显示在导航（如 Saved 可能挂在收藏 tab 下） |
| `init(state)` | fn | 可选 | 首次进入 section 时调用一次（预取/重置） |
| `render(state)` | fn | ✅ | 返回 HTML 字符串；返回 `null`/`""` 时显示统一空态 |
| `requires` | string[] | ✅ 恒定义 | 依赖的外部能力标识（见 §5），无依赖给 `[]` |

## 5. requires 依赖标识（外部能力清单）

section 若使用下列能力，必须在 `requires` 中声明，渲染层据此决定是否可渲染：

| 标识 | 能力 | 说明 |
|---|---|---|
| `liveData.news` | 当日资讯 | `LiveData.news`（app.js 提供） |
| `liveData.aihot` | AIHOT 数据 | `LiveData.aihot` |
| `data.knowledge` | 每日知识卡 | `data/knowledge.json` |
| `data.newsSummary` | 新闻摘要 | `data/news_summary.json` |
| `intel.fav` | 收藏子系统 | `js/intel/fav.js`（DB.data.industryFav） |
| `intel.comments` | 评论子系统 | `js/intel/comments.js` |
| `llm.client` | AI 调用 | `js/intel/llm/client.js`（callIntelLLM 等） |
| `db` | 本地存储 | 全局 `DB`（读 DB.data / DB.save） |

## 6. state（渲染上下文）约定

Sprint 1.5 起，新 section 的 UI 瞬态（选中 tab / 筛选 / 搜索词）**一律**通过
`js/intel/state.js` 的 `intelState` 读写，**禁止**再新增 `window.__xxx`：

```js
intelState.get("worldCat");     // 读
intelState.set("worldCat", "tech"); // 写（内部触发可选 onChange）
```

存量 `window.__intel*`（newsCatFilter / favFilter / histSearch 等）属 Sprint 1 遗留，
**只允许在 render.js 中读写**，新代码不得再引用。

## 7. 红线（CI / 代码审查硬约束）

1. ❌ 禁止在 `js/app.js` 中为 section 添加 `case` / 渲染分支——只保留对 `renderIndustry()` 的委托。
2. ❌ 禁止新增 `window.__intelSectionXxx` 之类瞬态。
3. ❌ 禁止 section 之间直接互调（如需共享 → 提取到 `js/intel/core.js` 或 `js/intel/state.js`）。
4. ✅ 每个 section 必须能在**无该数据**时优雅降级（显示空态提示，不抛异常）。
5. ✅ 纯渲染函数不得直接修改 `DB.data`（写操作走 fav/comments 子系统或显式 `DB.save()`）。
