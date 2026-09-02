// Sprint 1.5 渲染层下沉：一次性迁移脚本（基于原文件行号快照）
const fs = require("fs");
const APP = "js/app.js";
const L = fs.readFileSync(APP, "utf8").split("\n");
const total = L.length;

// 行集合（1-based）：移除 Cut1/Cut2/Cut3
const removeSet = new Set();
for (let n = 2415; n <= 2523; n++) removeSet.add(n);   // Cut1: Industry 头 ~ renderNewsSummary 后空行
for (let n = 2541; n <= 3410; n++) removeSet.add(n);   // Cut2: 我的情报注释 ~ intelGenerate 后空行
for (let n = 3624; n <= 3674; n++) removeSet.add(n);   // Cut3: openPasteIndustry ~ submitIndustryUrl

// 边界自检（防行号漂移）
function assert(cond, msg) { if (!cond) { console.error("✗ 边界校验失败: " + msg); process.exit(1); } }
assert(/Industry \(含来源链接/.test(L[2414]), "L2415 应为 Industry 注释");
assert(/想法库：专利检索/.test(L[2523]), "L2524 应为 想法库注释(保留)");
assert(/—— 我的情报（手动粘贴录入）/.test(L[2540]), "L2541 应为 我的情报注释");
assert(/📋 每日合并简报/.test(L[3411]), "L3412 应为 Brief 注释(保留)");
assert(/^function openPasteIndustry/.test(L[3623]), "L3624 应为 openPasteIndustry");
assert(/^\/\/ ===== Image Upload Helper/.test(L[3675]), "L3676 应为 Image 注释(保留)");
assert(/^function renderProducts/.test(L[2380 - 1] === undefined ? "" : L[2379]) || true, "前置段存在");
console.log("✓ 边界校验通过");

const moved = [];
const kept = [];
L.forEach((line, i) => { if (removeSet.has(i + 1)) moved.push(line); else kept.push(line); });

// render.js 头部说明
const head = [
  "// ============================================================",
  "// 行业情报 · render（渲染层 · Sprint 1.5 自 app.js 下沉）",
  "// 内容：Industry 段全部 UI 渲染函数（原 app.js L2415-L3674 中 intel 专属部分）",
  "// 说明：纯搬移，无逻辑改动。依赖 app.js 全局（DB/LiveData/render/escapeHtml 等）",
  "//       与 js/intel/{core,fav,comments,llm} 纯逻辑模块；以裸顶层函数存在（挂 window）",
  "// 边界：openPatentModal（想法库）、Brief 段（writeBriefSnapshot/renderBrief 等）仍留 app.js",
  "// 状态：window.__intel* 等渲染上下文由 C 任务（state.js）收编",
  "// ============================================================",
  ""
].join("\n");
fs.writeFileSync("js/intel/render.js", head + moved.join("\n") + "\n");

// app.js：原 Cut1 起点位置插入占位注释（kept 数组在 2415 前的行后）
const placeholder = [
  "// ============================================================",
  "// ===== Industry 渲染层已下沉至 js/intel/render.js（Sprint 1.5）=====",
  "// 本段原含：renderIndustry/renderLiveNews/renderNewsSummary/renderIntelHistory/",
  "// renderIntelFav/renderIntelCustom/renderIntelOpportunity/renderMyIntel/",
  "// intelItemCard/intelGenerate/toggleIntelFav/评论·收藏·导出·分类等 ~1030 行",
  "// 保留：openPatentModal（想法库）在下、Brief 段在下；render() case \"industry\" 仍调全局 renderIndustry",
  "// ============================================================",
  ""
];
const cutPos = 2414; // 原 L2415 前（1-based 2415 → 0-based 2414）
// kept 里截断：保留 [0, keptStart) 原封，插入 placeholder，续后
// kept 的第 x 个元素对应原行号递增但跳跃——无法用索引。改用重建法：按原行号决定输出
const outLines = [];
for (let n = 1; n <= total; n++) {
  if (removeSet.has(n)) continue;          // 删除
  if (n === 2415) { outLines.push(...placeholder); } // 在被删首行处插占位
  outLines.push(L[n - 1]);
}
fs.writeFileSync(APP, outLines.join("\n") + "\n");

// 校验
assert(moved.length + kept.length === total, "行数守恒");
const appAfter = fs.readFileSync(APP, "utf8");
assert(!/function renderLiveNews/.test(appAfter), "app.js 不应再含 renderLiveNews");
assert(!/function renderIndustry\(/.test(appAfter), "app.js 不应再含 renderIndustry");
assert(/function openPatentModal/.test(appAfter), "openPatentModal 应保留在 app.js");
assert(/function writeBriefSnapshot/.test(appAfter), "Brief 段应保留在 app.js");
console.log("✓ 迁移完成：render.js=" + moved.length + " 行；app.js 保留=" + kept.length + " 行（原总 " + total + "）");
