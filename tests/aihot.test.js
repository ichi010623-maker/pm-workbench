// AIHOT 视图单元测试（纯函数渲染 + 时间格式化 + HTML 转义）
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.join(__dirname, "..");

function escapeHtml(s) {
  if (s == null) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function today() { return "2026-08-10"; }

const sandbox = {
  console: console, escapeHtml: escapeHtml, today: today,
  window: {}, document: { getElementById: function () { return null; } },
  APP_VERSION: "5.9.30",
  fetch: function () { return Promise.reject(new Error("no-net")); },
  showToast: function () {}, showModal: function () {}, formatDateShort: function (d) { return d; },
  setTimeout: setTimeout, Promise: Promise, Date: Date, Math: Math, encodeURIComponent: encodeURIComponent
};
sandbox.global = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, "js", "aihot.js"), "utf8"), sandbox);

const { aihotFmt, aihotItemCard, aihotBriefHtml, aihotSelectedHtml, aihotHotHtml, aihotArchiveHtml, renderAihot } = sandbox;

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; } else { fail++; console.log("✗ " + m); } }

// 归档是「月历视图」，只渲染当前真实月份 → mock 必须用当月日期，否则断言必然失败
var __now = new Date();
var __ym = __now.getFullYear() + "-" + String(__now.getMonth() + 1).padStart(2, "0");
var __arcD1 = __ym + "-01";
var __arcD2 = __ym + "-02";

const d = {
  brief: {
    date: "2026-08-10", leadTitle: "Seedance 2.5 上线", url: "https://aihot.virxact.com/daily/2026-08-10",
    sections: [{ label: "技巧与观点", items: [{ title: "<b>测试</b> 标题", summary: "摘要", source: "公众号", links: { aihot: "https://aihot.virxact.com/items/x", original: "https://x.com/y" }, publishedAt: "2026-08-10T11:51:38Z", category: "ai-models" }] }]
  },
  selected: [{ title: "精选标题", summary: "s", source: "LMSYS", links: { aihot: "a", original: "o" }, publishedAt: "2026-08-10T11:51:38Z", category: "ai", score: 72 }],
  hotTopics: [{ rank: 1, title: "热点标题", source: "X", links: { aihot: "a", original: "o" }, sourceCount: 9, signalCount: 2, latestAt: "2026-08-10T11:44:29Z" }],
  dailies: [{ date: __arcD1, leadTitle: "本月日报", url: "u" }, { date: __arcD2, leadTitle: "次日日报", url: "u2" }]
};

(function () {
  ok(typeof renderAihot === "function", "renderAihot 是函数");
  ok(aihotFmt("2026-08-10T11:51:38Z").indexOf("08-10") >= 0, "aihotFmt 含日期");
  ok(aihotItemCard(d.selected[0]).indexOf("精选标题") >= 0, "itemCard 含标题");
  ok(aihotItemCard(d.brief.sections[0].items[0]).indexOf("&lt;b&gt;") >= 0, "itemCard 转义 HTML");
  ok(aihotBriefHtml(d).indexOf("每日简报") >= 0 && aihotBriefHtml(d).indexOf("Seedance 2.5 上线") >= 0, "brief 含简报与头条");
  ok(aihotSelectedHtml(d).indexOf("精选标题") >= 0, "selected 含标题");
  ok(aihotHotHtml(d).indexOf("#1") >= 0 && aihotHotHtml(d).indexOf("9 信源") >= 0, "hot 含排名与信源数");
  ok(aihotArchiveHtml(d).indexOf(__arcD2) >= 0 && aihotArchiveHtml(d).indexOf("aihotOpenDaily") >= 0, "archive 含日期与点击");
  ok(aihotArchiveHtml(d).indexOf("learn-cal-grid") >= 0, "archive 渲染月历网格");
})();

console.log("\n========== aihot.test.js: " + pass + " passed, " + fail + " failed ==========");
process.exit(fail ? 1 : 0);
