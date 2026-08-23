// 知识学习模块单元测试（日期历史结构 / 翻卡 / 收藏 / 评论 / 微信式日历 / 每日一词）
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.join(__dirname, "..");

function escapeHtml(s) {
  if (s == null) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "knowledge.json"), "utf8"));
function today() { const h = DATA.history || []; return h.length ? h[h.length - 1].date : "2026-08-11"; }

const store = {};
const sandbox = {
  console: console, escapeHtml: escapeHtml, today: today,
  window: {}, APP_VERSION: "5.9.30",
  document: {
    getElementById: function () { return null; },
    createElement: function () { return { className: "", style: {}, addEventListener: function () {}, appendChild: function () {} }; },
    body: { appendChild: function () {} }
  },
  fetch: function () { return Promise.reject(new Error("no-net")); },
  showToast: function () {}, showModal: function () {}, formatDateShort: function (d) { return d; },
  localStorage: {
    getItem: function (k) { return (k in store) ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); },
    removeItem: function (k) { delete store[k]; }
  },
  setTimeout: setTimeout, Promise: Promise, Date: Date, Math: Math,
  encodeURIComponent: encodeURIComponent
};
sandbox.global = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, "js", "knowledge.js"), "utf8"), sandbox);
// 注入知识库数据（模拟 fetch 成功后的 __knowledge）
sandbox.window.__knowledge = DATA;
sandbox.window.__knowledge.__date = today();

const F = sandbox;

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; } else { fail++; console.log("✗ " + m); } }

(function () {
  // A. 日期历史结构完整性
  ok(Array.isArray(DATA.pool) && DATA.pool.length === 591, "pool 共 591 张（AI 126 + 金融 125 + 认知 120 + 硬件PM 110 + 营销 110）");
  ok(Array.isArray(DATA.cats) && DATA.cats.length === 5, "cats 共 5 个分类");
  ok(Array.isArray(DATA.history) && DATA.history.length >= 20, "history 已回填 ≥ 20 天");
  ok(F.learnItemsByCat("ai").length === 126, "AI 小知识 126 张");
  ok(F.learnItemsByCat("finance").length === 125, "金融小知识 125 张");
  ok(F.learnItemsByCat("think").length === 120, "认知思维 120 张");
  ok(F.learnItemsByCat("hwpm").length === 110, "硬件产品经理 110 张");
  ok(F.learnItemsByCat("mkt").length === 110, "市场营销 110 张");
  ok(F.learnItemsByCat("all").length === 591, "全部 591 张");
  ok(F.learnCatMeta("ai").name === "AI 小知识", "分类元信息含名称");
  ok(DATA.pool.every(function (it) { return it.id && it.title && it.content && it.points && it.points.length === 3 && it.tip && it.diagram && it.cat; }),
    "每张卡含 id/标题/内容/3要点/口诀/图示/分类");

  // B. SVG 图示
  const KINDS = DATA.pool.map(function (it) { return it.diagram; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
  ok(KINDS.length >= 14, "图示种类 ≥ 14 种（实际 " + KINDS.length + "）");
  ok(KINDS.every(function (k) { var s = F.learnDiag(k); return s.indexOf("<svg") === 0 && s.indexOf("viewBox") > 0 && s.indexOf("</svg>") > 0; }),
    "每个图示都是完整 SVG");
  ok(F.learnDiag("nope").indexOf("示意图") >= 0, "未知图示返回兜底");

  // C. 每日一词 / 历史驱动
  const ids = F.learnNextDailyItemIds(DATA.pool, DATA.history, 1);
  ok(ids.length === 1, "每日一词选 1 张");
  ok(DATA.history.every(function (h) { return !ids.includes(h.itemIds[0]); }), "当日新词跳过已发布历史");
  const lastDate = DATA.history[DATA.history.length - 1].date;
  const dayItems = F.learnItemsByDate(lastDate);
  ok(dayItems.length >= 1 && dayItems[0] && dayItems[0].id, "learnItemsByDate 返回当日卡");
  ok(F.learnHistoryByDate(lastDate).date === lastDate, "learnHistoryByDate 命中");

  // D. 卡片渲染（含日期与已学）
  store["hw_pm_learn_seen"] = JSON.stringify({ "ai-001": 1 });
  const card = F.learnCardHtml(DATA.pool[0], { date: lastDate, catName: "AI 小知识" });
  ok(card.indexOf("learn-card-ai-001") >= 0, "卡片含 id");
  ok(card.indexOf("onclick=\"learnFlip('ai-001')\"") >= 0, "卡片可翻面");
  ok(card.indexOf("learn-front") >= 0 && card.indexOf("learn-back") >= 0, "正反两面齐全");
  ok(card.indexOf("已学") >= 0, "已学卡片显示徽标");
  ok(card.indexOf("★") >= 0 || card.indexOf("☆") >= 0, "卡片含收藏按钮");
  ok(card.indexOf("💬") >= 0, "卡片含评论入口");
  const card2 = F.learnCardHtml(DATA.pool[1], {});
  ok(card2.indexOf("标记学会") >= 0, "背面含学会按钮");
  ok(card2.indexOf("&lt;") >= 0 || card2.indexOf("&amp;") >= 0 || DATA.pool[1].title.indexOf("<") < 0, "HTML 安全渲染");

  // E. 收藏（localStorage）
  delete store["hw_pm_learn_fav"];
  ok(F.learnIsFav("ai-002") === false, "初始未收藏");
  F.learnToggleFav("ai-002");
  ok(F.learnIsFav("ai-002") === true, "收藏后变 true");
  ok(F.learnFavItems().length === 1 && F.learnFavItems()[0].id === "ai-002", "收藏列表含该卡");
  F.learnToggleFav("ai-002");
  ok(F.learnIsFav("ai-002") === false, "取消收藏变 false");

  // F. 评论（localStorage）
  delete store["hw_pm_learn_comments"];
  ok(F.learnCmtCount("ai-001") === 0, "初始无评论");
  F.learnSaveComment("ai-001", "复利越早开始越好");
  ok(F.learnCmtCount("ai-001") === 1, "评论数变为 1");
  ok(F.learnCommentsFor("ai-001")[0].text === "复利越早开始越好", "评论内容正确");
  F.learnDelComment("ai-001", 0);
  ok(F.learnCmtCount("ai-001") === 0, "删除评论后归零");

  // G. 微信式日历渲染
  const cal = F.learnCalendarHtml();
  ok(cal.indexOf("learn-cal-grid") >= 0, "日历网格渲染");
  ok(cal.indexOf("learn-cal-dot") >= 0, "有历史记录的日期显示圆点");
  const sel = F.learnSelectDate(lastDate);
  const dayHtml = F.learnDateItemsHtml();
  ok(dayHtml.indexOf("learn-grid") >= 0 && dayHtml.indexOf("learn-card-") >= 0, "选中日期渲染卡片列表");
  ok(dayHtml.indexOf("learn-autoplay-btn") >= 0 && dayHtml.indexOf("data-learn-autoplay") >= 0, "日期头部有自动播放按钮");
  // 无记录日期
  F.learnSelectDate("2000-01-01");
  ok(F.learnDateItemsHtml().indexOf("还没有知识卡片") >= 0, "无记录日期显示空态");

  // G2. 朗读文本（单条朗读与自动播放共用）
  const it0 = DATA.pool[0];
  const txt = F.learnCardText(it0);
  ok(typeof txt === "string" && txt.length > 0, "learnCardText 返回非空文本");
  ok(txt.indexOf(it0.title) >= 0, "朗读文本含标题");
  ok(txt.indexOf(it0.content) >= 0, "朗读文本含内容");
  if (it0.tip) ok(txt.indexOf(it0.tip) >= 0, "朗读文本含口诀");
  ok(F.learnCardText(null) === "", "空对象返回空串");

  // H. 统计
  delete store["hw_pm_learn_seen"]; delete store["hw_pm_learn_fav"];
  ok(F.learnStats().total === 591, "统计总数 591");
  ok(typeof F.learnStats().seen === "number" && typeof F.learnStats().fav === "number", "统计含已学/收藏数");
})();

console.log("========== knowledge.test.js: " + pass + " passed, " + fail + " failed ==========");
process.exit(fail ? 1 : 0);
