// 听力「点击单词加入词库」回归测试（v5.9.162）
// 覆盖：
//  1) 点词相关函数必须是「顶层全局函数」（防「被吞进内层作用域」静默事故）
//  2) lgWordNormalize 归一化：句首大写 / 全大写 / 弯引号 / 尾随标点 / 非英文不动
//  3) lgListenSentHtml：只对英文切词、标点与空格原样保留、已在词库加 .inbank
//  4) 加入 / 移出 词库行为：大小写不敏感去重、来源标记、标签默认值、词库释义回填
//  5) 听力详情页真的渲染出可点单词（函数在顶层 ≠ 界面接上了）
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const src = fs.readFileSync(path.join(ROOT, "js/language.js"), "utf8");

const noop = () => {};
const mkEl = () => ({
  value: "", innerHTML: "", textContent: "", style: {}, dataset: {}, onclick: null,
  classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  setAttribute: noop, getAttribute: () => null, appendChild: noop, removeChild: noop,
  addEventListener: noop, focus: noop, remove: noop,
  querySelector: () => null, querySelectorAll: () => [], children: []
});

let lastModalHtml = "";
const toasts = [];
let els = {};

function mkSandbox() {
  const sb = {
    console: { log: noop, warn: noop, error: noop },
    localStorage: (function () { const m = {}; return {
      getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); },
      removeItem: k => { delete m[k]; }, clear: noop, key: () => null, get length() { return Object.keys(m).length; }
    }; })(),
    document: {
      getElementById: id => (els[id] || null),
      querySelector: () => null, querySelectorAll: () => [],
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
    render: noop, closeModal: noop,
    showModal: html => { lastModalHtml = html; },
    confirm: () => true, prompt: () => null,
    loadAiConfig: () => ({ provider: "minimax", apiKey: "", apiUrl: "", model: "" }),
    formatDateShort: s => String(s || "").slice(0, 10), today: () => "2026-09-20", bjTodayStr: () => "2026-09-20",
    openaiCall: noop, DB: { data: { growth: {} }, save: noop, logActivity: noop }
  };
  sb.window = sb;
  vm.createContext(sb);
  return sb;
}

let ok = true, pass = 0;
function chk(cond, label) { pass++; console.log((cond ? "  ✅ " : "  ❌ ") + label); if (!cond) ok = false; }
function eq(a, b, label) { chk(a === b, label + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function section(t) { console.log("\n【" + t + "】"); }

const sb = mkSandbox();
vm.runInContext(src, sb, { filename: "language.js" });

/* ---------------- 1. 顶层作用域 ---------------- */
section("顶层作用域");
["lgWordQuick", "lgWordQuickAdd", "lgWordQuickDel", "lgWordNormalize", "lgWordKnown",
 "lgListenSentHtml", "lgListenWord", "lgListenWordFromBank", "lgArtWord", "lgArtAddWord", "lgAttr"
].forEach(f => eq(typeof sb[f], "function", f + " 在顶层"));

/* ---------------- 2. 归一化 ---------------- */
section("lgWordNormalize 归一化");
const N = (cur, t) => sb.lgWordNormalize(cur, t);
eq(N("en", "Excuse"), "excuse", "句首大写归一为小写");
eq(N("en", "DON'T"), "don't", "全大写归一为小写");
eq(N("en", "don\u2019t"), "don't", "弯引号 ’ 归一为 ASCII '");
eq(N("en", "house,"), "house,", "尾随逗号不在此处理（切词阶段已剥离）");
eq(N("en", "dogs\u2019"), "dogs", "尾随弯引号剥离");
eq(N("en", "well-known"), "well-known", "连字符词保留");
eq(N("en", "  Hello  "), "hello", "首尾空格裁剪");
eq(N("en", "中文"), "中文", "非英文词原样返回");
eq(N("ja", "ABC"), "ABC", "非英语种不做小写化");
eq(N("ja", "食べる"), "食べる", "日语原样返回");
eq(N("en", ""), "", "空串安全");

/* ---------------- 3. 句子切分 ---------------- */
section("lgListenSentHtml 句子切分");
const H = (t, cur) => sb.lgListenSentHtml(t, cur || "en");
let h = H("Excuse me!");
chk(h.indexOf('<span class="lg-listen-word"') >= 0, "英文句子产出可点单词");
chk(h.indexOf(">Excuse<") >= 0 && h.indexOf(">me<") >= 0, "单词正文完整");
chk(h.indexOf(">!<") >= 0 || h.indexOf("!</") >= 0 || h.indexOf("!") >= 0, "句末标点保留");
chk(h.indexOf('onclick="event.stopPropagation();lgListenWord(') >= 0, "onclick 已阻断冒泡并调 lgListenWord");
chk((h.match(/lg-listen-word"/g) || []).length === 2, "只有 2 个单词被包成 span（标点不包）");
eq(H("Excuse me!", "ja"), "Excuse me!", "非英语种原样输出（不切词）");
eq(H(""), "", "空句子安全");
eq(H(null), "", "null 安全");

// 含撇号 / 连字符 / 逗号的真实文本
h = H("Don\u2019t worry, it\u2019s well-known.");
chk(h.indexOf(">Don\u2019t<") >= 0, "弯撇号词整体作为一个可点词");
chk(h.indexOf(">well-known<") >= 0, "连字符词不被拆开");
chk(h.indexOf('lgListenWord(\'Don') >= 0, "onclick 参数被转义为可安全拼接的字符串");

// 已在词库 → inbank
sb.langGet("en").words.length = 0;
sb.langGet("en").words.push({ id: "w1", term: "excuse", meaning: "原谅", tags: [] });
h = H("Excuse me, excuse yourself.");
chk((h.match(/ inbank/g) || []).length === 2, "已在词库的词（含句首大写）都标 inbank");
sb.langGet("en").words.length = 0;
h = H("Excuse me!");
chk(h.indexOf(" inbank") < 0, "词库清空后不再标 inbank");

/* ---------------- 4. 加入 / 移出 ---------------- */
section("加入词库行为");
const W = () => sb.langGet("en").words;
W().length = 0;
els = {};
toasts.length = 0;

// 弹窗内容
sb.lgListenWord("Excuse");
chk(lastModalHtml.indexOf("Excuse") >= 0, "弹窗标题显示用户点到的原文（大写）");
chk(lastModalHtml.indexOf("＋ 加入词库") >= 0, "未入库时按钮为「＋ 加入词库」");
chk(lastModalHtml.indexOf("lgw-mean") >= 0 && lastModalHtml.indexOf("lgw-tags") >= 0, "弹窗含释义与标签输入框");
chk(lastModalHtml.indexOf('value="听力"') >= 0, "听力来源默认标签为「听力」");

// 无释义直接加入
els["lgw-mean"] = { value: "" };
els["lgw-tags"] = { value: "听力" };
sb.lgWordQuickAdd("Excuse", "listening");
eq(W().length, 1, "加入 1 个词");
eq(W()[0].term, "excuse", "落库词条已归一为小写");
eq(W()[0].from, "listening", "来源标记为 listening");
eq(W()[0].tags.join(","), "听力", "标签生效");
eq(W()[0].next, "2026-09-20", "已排入复习队列（next=today）");

// 大小写不敏感去重
toasts.length = 0;
sb.lgWordQuickAdd("EXCUSE", "listening");
eq(W().length, 1, "重复加入（不同大小写）不新增词条");
chk(toasts.some(t => /已在生词库/.test(t.m)), "重复加入给出提示");

// 已在词库时弹窗给「移出」入口
sb.lgListenWord("excuse");
chk(lastModalHtml.indexOf("移出词库") >= 0, "已在词库时弹窗显示「🗑 移出词库」");
chk(lastModalHtml.indexOf("＋ 加入词库") < 0, "已在词库时不再显示「＋ 加入词库」主按钮");

// 自定义释义 + 中英文逗号分隔标签
W().length = 0;
els["lgw-mean"] = { value: "原谅；借口" };
els["lgw-tags"] = { value: "听力，通勤, 难词" };
sb.lgWordQuickAdd("Excuse", "listening");
eq(W()[0].meaning, "原谅；借口", "自定义释义优先");
eq(W()[0].tags.join("|"), "听力|通勤|难词", "中英文逗号都能分隔标签");

// 标签留空 → 回落来源默认标签
W().length = 0;
els["lgw-mean"] = { value: "" };
els["lgw-tags"] = { value: "" };
sb.lgWordQuickAdd("handbag", "listening");
eq(W()[0].tags.join(","), "听力", "标签留空回落为「听力」");

// 内置词库命中 → 音标 / 例句 / 释义回填（"work" 在 LG_WORDBANK 中）
W().length = 0;
els["lgw-mean"] = { value: "" };
els["lgw-tags"] = { value: "" };
sb.lgWordQuickAdd("work", "listening");
chk(!!W()[0].reading, "命中内置词库时带出音标：" + JSON.stringify(W()[0].reading));
chk(!!W()[0].meaning, "命中内置词库时带出释义：" + JSON.stringify(W()[0].meaning));
chk(!!W()[0].example, "命中内置词库时带出例句");

// 句首大写也要能命中内置词库（归一化的核心价值）
sb.langGet("en").words.length = 0;
sb.lgListenWord("Work");
chk(lastModalHtml.indexOf("/w\u025c\u02d0rk/") >= 0, "句首大写 Work 也能带出音标（否则查不到）");
chk(lastModalHtml.indexOf('value="工作"') >= 0, "句首大写 Work 也能预填释义");

// 精读来源不受影响（回归）
W().length = 0;
els["lgw-mean"] = { value: "" };
els["lgw-tags"] = { value: "" };
sb.langGet("en").words.length = 0;
sb.lgArtWord("theatre");
chk(lastModalHtml.indexOf('value="精读"') >= 0, "精读来源默认标签仍为「精读」");
els["lgw-mean"] = { value: "" };
els["lgw-tags"] = { value: "" };
sb.lgArtAddWord("theatre");
eq(W()[0].from, "reading", "精读加入仍标记 reading 来源");
eq(W()[0].tags.join(","), "精读", "精读默认标签不受影响");

// 移出（大小写不敏感）
sb.lgWordQuickDel("THEATRE", "listening");
eq(W().length, 0, "移出词库大小写不敏感");

// 空词保护
W().length = 0;
toasts.length = 0;
els["lgw-mean"] = { value: "" };
els["lgw-tags"] = { value: "" };
sb.lgWordQuickAdd("   ", "listening");
eq(W().length, 0, "空白词不落库");
chk(toasts.some(t => /单词为空/.test(t.m)), "空白词给出提示");

/* ---------------- 5. 渲染接线 ---------------- */
section("听力详情页接线");
const E = sb.langGet("en");
E.listening.length = 0;
E.listening.push({ id: "L1", title: "测试素材", date: "2026-09-20T00:00:00.000Z",
  sentences: [{ t: "Excuse me!", tr: "对不起！" }, { t: "Is this your handbag?", tr: "这是你的手提包吗？" }] });
E.words.length = 0;
E.words.push({ id: "w1", term: "handbag", meaning: "手提包", tags: [] });

sb.lgTab = "listening";
sb.langSet ? sb.langSet("en") : null;
if (typeof sb.lgLangSet === "function") sb.lgLangSet("en");
sb.languageCurrent = "en";
sb.lgListenId = "L1";
// 直接以 en 调渲染（渲染函数第一参数即语种）
let detail = sb.lgRenderListening("en");
chk(detail.indexOf("lg-listen-word") >= 0, "详情页渲染出可点单词");
chk((detail.match(/lgListenWord\(/g) || []).length >= 5, "多句多词都有加入词库入口");
chk(detail.indexOf("lg-listen-word inbank") >= 0, "已在词库的词渲染 inbank 弱化样式");
chk(detail.indexOf("点击句中单词可加入词库") >= 0, "详情页提示文案提到加入词库");
chk(detail.indexOf("❌ 听不懂") >= 0 && detail.indexOf("⭐ 收藏") >= 0, "原有操作入口未被破坏");
chk(detail.indexOf("对不起！") >= 0, "中文翻译行正常渲染");

let jaDetail = sb.lgRenderListening("ja");
chk(jaDetail.indexOf("lg-listen-word") < 0, "非英语种不渲染可点单词（避免按字符切碎）");

// 精读页回归
sb.lgReadingId = null;
const rd = sb.lgRenderReading("en");
chk(rd.indexOf("lgArtWord(") >= 0 || rd.indexOf("lg-art-word") >= 0 || rd.indexOf("lg-mat-list") >= 0 || rd.length > 0,
  "精读页渲染未报错");

console.log("\n" + (ok ? "🎉 听力点词入词库 " + pass + " 项断言全部通过" : "❌ 存在失败项"));
process.exit(ok ? 0 : 1);
