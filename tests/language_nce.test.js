// 新概念英语素材库回归测试（v5.9.161）
// 覆盖：
//  1) 数据文件：第一册 144 课 / 第二册 96 课、课号连续、句子格式合法、派生标题全局唯一
//  2) JS：素材库相关函数必须是「顶层全局函数」（防「被吞进内层作用域」静默事故）
//  3) 导入行为：范围导入 / 单课导入 / 重复导入去重 / 范围反转拒绝 / 越界收紧 / 两册互不干扰
//  4) 面板渲染与搜索筛选
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const src = fs.readFileSync(path.join(ROOT, "js/language.js"), "utf8");

let ok = true;
const chk = (cond, label) => { console.log((cond ? "  ✅ " : "  ❌ ") + label); if (!cond) ok = false; };

/* ---------- 1. 数据文件校验 ---------- */
console.log("【数据文件】");
const BOOKS = [
  { id: 1, file: "data/lang_listen_nce1.json", count: 144 },
  { id: 2, file: "data/lang_listen_nce2.json", count: 96 }
];
const data = {};
let dataOk = true;
BOOKS.forEach(b => {
  const p = path.join(ROOT, b.file);
  if (!fs.existsSync(p)) { chk(false, b.file + " 存在"); dataOk = false; return; }
  try {
    data[b.id] = JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    chk(false, b.file + " JSON 可解析：" + e.message);
    dataOk = false;
    return;
  }
  chk(true, b.file + " JSON 可解析（" + (fs.statSync(p).size / 1024).toFixed(1) + "KB）");
});
if (!dataOk) { console.log("\n❌ 数据文件不可用，中止"); process.exit(1); }

const allTitles = {};
BOOKS.forEach(b => {
  const d = data[b.id];
  chk(d.lessons.length === b.count, "第" + b.id + "册 课数 = " + b.count + "（实际 " + d.lessons.length + "）");

  let contiguous = true, badSent = 0, emptyField = 0;
  d.lessons.forEach((l, i) => {
    if (l.n !== i + 1) contiguous = false;
    if (!l.t || !String(l.t).trim()) emptyField++;
    (l.s || []).forEach(s => {
      const parts = String(s).split("|");
      if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) badSent++;
    });
  });
  chk(contiguous, "第" + b.id + "册 课号 1–" + b.count + " 连续无缺");
  chk(badSent === 0, "第" + b.id + "册 全部句子均为「英文|中文」双段（异常 " + badSent + " 句）");
  chk(emptyField === 0, "第" + b.id + "册 无空课名");

  const totalSent = d.lessons.reduce((a, l) => a + l.s.length, 0);
  chk(totalSent === b.count * 3, "第" + b.id + "册 每课 3 句（合计 " + totalSent + "）");

  d.lessons.forEach(l => {
    const t = "📘 新概念 " + b.id + " · L" + l.n + " " + l.t;
    if (allTitles[t]) allTitles[t] = allTitles[t] + 1; else allTitles[t] = 1;
  });
});
const dupTitles = Object.keys(allTitles).filter(k => allTitles[k] > 1);
chk(dupTitles.length === 0, "两册合计 240 课的「导入标题」全局唯一（重复 " + dupTitles.length + " 个）");

/* ---------- 2. 沙箱 ---------- */
const noop = () => {};
const mkEl = () => ({
  value: "", innerHTML: "", textContent: "", style: {}, dataset: {}, onclick: null,
  classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  setAttribute: noop, getAttribute: () => null, appendChild: noop, removeChild: noop,
  addEventListener: noop, focus: noop, remove: noop,
  querySelector: () => null, querySelectorAll: () => [], children: []
});
const toasts = [];
const sb = {
  console: { log: noop, warn: noop, error: noop },
  localStorage: (function () { const m = {}; return {
    getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); },
    removeItem: k => { delete m[k]; }, clear: noop, key: () => null, get length() { return Object.keys(m).length; }
  }; })(),
  document: {
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    createElement: mkEl, body: mkEl(), head: mkEl(), documentElement: mkEl(),
    addEventListener: noop, readyState: "complete"
  },
  screen: { width: 390, height: 844 }, navigator: { userAgent: "node", language: "zh-CN" },
  location: { href: "http://localhost/", search: "", hash: "" },
  setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: cb => setTimeout(cb, 0),
  SpeechSynthesisUtterance: function (t) { this.text = t; },
  speechSynthesis: { speak: noop, cancel: noop, getVoices: () => [] },
  fetch: () => Promise.resolve({ json: () => Promise.resolve({}) }),
  escapeHtml: s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"),
  showToast: (m, t) => toasts.push({ m, t }),
  render: noop, closeModal: noop, showModal: noop,
  confirm: () => true, prompt: () => null,
  loadAiConfig: () => ({ provider: "minimax", apiKey: "", apiUrl: "", model: "" }),
  formatDateShort: s => String(s || "").slice(0, 10), today: () => "2026-09-20", bjTodayStr: () => "2026-09-20",
  openaiCall: noop, DB: { data: { growth: {} }, save: noop, logActivity: noop }
};
sb.window = sb;
vm.createContext(sb);
try {
  vm.runInContext(src, sb, { filename: "js/language.js" });
} catch (e) {
  console.log("  ❌ language.js 加载失败：" + e.message);
  process.exit(1);
}

/* ---------- 3. 顶层作用域 ---------- */
console.log("【顶层作用域（防内层吞并事故）】");
["lgNcePanel", "lgNceLoad", "lgNceToggle", "lgNcePickBook", "lgNceImportRange",
 "lgNceImportInput", "lgNceImportAll", "lgNceImportOne", "lgNceListHtml",
 "lgNceSetQ", "lgNceTitle", "lgNceImportedCount"]
  .forEach(f => chk(typeof sb[f] === "function", f + " 必须为顶层函数"));

/* ---------- 4. 导入行为 ---------- */
console.log("【导入行为】");
// 预置素材库缓存，避免依赖网络
sb.lgNceCache[1] = data[1];
sb.lgNceCache[2] = data[2];

const E = sb.langGet(sb.langCur());
E.listening.length = 0;
chk(sb.lgNceImportedCount("en", 1) === 0, "初始 第一册 已导入 0 课");

sb.lgNceImportRange(1, 1, 20);
chk(E.listening.length === 20, "导入 L1–L20 → 20 组（实际 " + E.listening.length + "）");
chk(E.listening[0].sentences.length === 3, "每组 3 句");
chk(E.listening[0].sentences[0].t === "Excuse me, is this your seat?", "首句英文正确");
chk(E.listening[0].sentences[0].tr === "对不起，这是你的座位吗？", "首句中文正确");
chk(E.listening[0].title === "📘 新概念 1 · L1 Excuse me!", "标题含册号与课号：" + E.listening[0].title);
chk(sb.lgNceImportedCount("en", 1) === 20, "已导入计数 = 20");

sb.lgNceImportRange(1, 1, 20);
chk(E.listening.length === 20, "重复导入同一范围不产生重复（仍 " + E.listening.length + " 组）");

sb.lgNceImportRange(1, 15, 25);
chk(E.listening.length === 25, "重叠范围只补差额（15–20 跳过，21–25 新增）→ 25 组");

sb.lgNceImportOne(1, 100);
chk(E.listening.length === 26, "单课导入 L100 → 26 组");
chk(sb.lgNceImportedCount("en", 1) === 26, "已导入计数 = 26");

const before = E.listening.length;
sb.lgNceImportRange(1, 30, 10);
chk(E.listening.length === before, "范围反转（30–10）被拒绝，数量不变");
chk(toasts.some(t => /范围不对/.test(t.m)), "范围反转给出提示");

sb.lgNceImportRange(1, 140, 999);
chk(E.listening.length === before + 5, "课号越界收紧到 144（140–144 共 5 课）→ " + E.listening.length + " 组");

// 第二册独立、互不干扰
const n1 = sb.lgNceImportedCount("en", 1);
sb.lgNceImportRange(2, 1, 5);
chk(E.listening.length === before + 5 + 5, "第二册 L1–L5 → 再 +5 组");
chk(sb.lgNceImportedCount("en", 2) === 5, "第二册计数 = 5");
chk(sb.lgNceImportedCount("en", 1) === n1, "第一册计数不受第二册导入影响");
chk(E.listening.some(x => x.title === "📘 新概念 2 · L1 A private conversation"), "第二册标题前缀正确");

// 课名重复的两课必须都能各自导入（靠课号区分，不被去重误杀）
sb.lgNceImportRange(1, 2, 4);
chk(E.listening.filter(x => /L2 Is this your/.test(x.title)).length === 1, "L2 已存在");
chk(E.listening.filter(x => /L4 Is this your/.test(x.title)).length === 1, "L4（与 L2 同名）也能独立导入");

/* ---------- 5. 面板与筛选 ---------- */
console.log("【面板与筛选】");
sb.lgNceBook = 1;
const panel = sb.lgNcePanel("en");
chk(panel.indexOf("lg-nce") >= 0, "英文语种渲染出素材库面板");
chk(panel.indexOf("第一册") >= 0 && panel.indexOf("第二册") >= 0, "面板含两册切换");
chk(panel.indexOf("整册导入") >= 0, "面板含整册导入按钮");
chk(panel.indexOf("已导入") >= 0, "面板显示已导入计数");
chk(sb.lgNcePanel("ja") === "", "非英文语种不渲染新概念面板");

sb.lgNceQ = "theatre";
let listHtml = sb.lgNceListHtml("en", 1);
chk(listHtml.indexOf("Excuse me!") === -1, "搜索 theatre 时不匹配 L1");

sb.lgNceQ = "excuse";
listHtml = sb.lgNceListHtml("en", 1);
chk(listHtml.indexOf("Excuse me!") >= 0, "搜索 excuse 能匹配 L1");

sb.lgNceQ = "144";
listHtml = sb.lgNceListHtml("en", 1);
chk(listHtml.indexOf("L144") >= 0, "搜索 144 能匹配第 144 课");

sb.lgNceQ = "";
listHtml = sb.lgNceListHtml("en", 1);
chk(listHtml.indexOf("lg-nce-done") >= 0, "已导入的课渲染 ✓ 标记");
chk(listHtml.indexOf("lg-nce-add") >= 0, "未导入的课渲染 ＋ 入口");
chk((listHtml.match(/lg-nce-row/g) || []).length === 144, "默认列出全部 144 课");

console.log(ok ? "\n🎉 新概念素材库全部通过" : "\n❌ 存在失败项");
process.exit(ok ? 0 : 1);
