// 听力素材 CRUD 回归测试（v5.9.160）
// 覆盖：
//  1) 编辑/删除相关函数必须是「顶层全局函数」（防「被吞进内层作用域」静默事故）
//  2) lgParseListenSents / lgSerializeListenSents 双向无损（编辑再保存不会污染数据）
//  3) 新增 / 编辑 / 删除 的实际行为
//  4) 列表与详情视图都渲染出 ✏️ 编辑 / 🗑 删除 入口
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
let confirmAnswer = true;
const toasts = [];

function mkSandbox() {
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
    render: noop, closeModal: noop,
    showModal: html => { lastModalHtml = html; },
    confirm: () => confirmAnswer, prompt: () => null,
    loadAiConfig: () => ({ provider: "minimax", apiKey: "", apiUrl: "", model: "" }),
    formatDateShort: s => String(s || "").slice(0, 10), today: () => "2026-09-20", bjTodayStr: () => "2026-09-20",
    openaiCall: noop, DB: { data: { growth: {} }, save: noop, logActivity: noop }
  };
  sb.window = sb;
  vm.createContext(sb);
  return sb;
}

let ok = true;
const chk = (cond, label) => { console.log((cond ? "  ✅ " : "  ❌ ") + label); if (!cond) ok = false; };

const sb = mkSandbox();
try {
  vm.runInContext(src, sb, { filename: "js/language.js" });
} catch (e) {
  console.log("  ❌ language.js 加载失败：" + e.message);
  process.exit(1);
}

console.log("【顶层作用域（防内层吞并事故）】");
["lgRenderListening", "lgListenForm", "lgListenSave", "lgListenEdit", "lgListenDel",
 "lgParseListenSents", "lgSerializeListenSents"]
  .forEach(f => chk(typeof sb[f] === "function", f + " 必须为顶层函数"));

console.log("【文本 ⇄ 句子数组：双向无损】");
const P = sb.lgParseListenSents, S = sb.lgSerializeListenSents;

let r = P("Can I have a latte? | 大杯拿铁可以吗？\nHow much is it? | 多少钱？");
chk(r.length === 2 && r[0].t === "Can I have a latte?" && r[0].tr === "大杯拿铁可以吗？", "新格式 | 分隔解析正确");

r = P("Hello\n你好\nBye\n再见");
chk(r.length === 2 && r[0].tr === "你好" && r[1].t === "Bye" && r[1].tr === "再见", "旧格式奇偶行兜底解析正确");

r = P("Only original line");
chk(r.length === 1 && r[0].t === "Only original line" && r[0].tr === "", "单句无翻译解析正确");

// 关键：无翻译句 + 有翻译句混排，序列化再解析必须不变（旧实现会串行错配）
const mixed = [{ t: "A", tr: "" }, { t: "B", tr: "乙" }, { t: "C", tr: "" }];
const round = P(S(mixed));
chk(round.length === 3, "混排序列化后句数不变（实际 " + round.length + "）");
chk(round[0].t === "A" && round[0].tr === "", "混排第 1 句原文/翻译不错配");
chk(round[1].t === "B" && round[1].tr === "乙", "混排第 2 句原文/翻译不错配");
chk(round[2].t === "C" && round[2].tr === "", "混排第 3 句原文/翻译不错配");

r = P("");
chk(Array.isArray(r) && r.length === 0, "空输入返回空数组");
r = P("I like A | B | C");
chk(r.length === 1 && r[0].t === "I like A" && r[0].tr === "B | C", "译文内含 | 时以首个 | 切分且不丢内容");

console.log("【新增 / 编辑 / 删除 行为】");
// 直接操作数据层（弹窗内 DOM 读取由 document.getElementById 桩控制，这里走 save 的数据分支）
const E = sb.langGet(sb.langCur());
E.listening.length = 0;
const gid = sb.lgUid();
E.listening.push({ id: gid, title: "旧标题", sentences: [{ t: "A", tr: "甲" }], date: "2026-09-01T00:00:00.000Z" });
chk(E.listening.length === 1, "初始 1 组素材");

// lgListenForm(id) 进入编辑态并回填
sb.lgListenForm(gid);
chk(lastModalHtml.indexOf("编辑听力素材") >= 0, "lgListenForm(id) 打开「编辑听力素材」弹窗");
chk(lastModalHtml.indexOf('value="旧标题"') >= 0, "编辑弹窗回填标题");
chk(lastModalHtml.indexOf("A | 甲") >= 0, "编辑弹窗回填句子（带 | 分隔）");
chk(lastModalHtml.indexOf('id="lgl-title"') >= 0 && lastModalHtml.indexOf('id="lgl-sents"') >= 0, "编辑弹窗含标题/句子输入框");

// 新增态
sb.lgListenForm();
chk(lastModalHtml.indexOf("添加听力素材") >= 0, "lgListenForm() 打开「添加听力素材」弹窗");
chk(lastModalHtml.indexOf("lgListenEditId") < 0, "弹窗 HTML 不泄漏内部状态变量");
chk(lastModalHtml.indexOf('value=""') >= 0 || lastModalHtml.indexOf('id="lgl-title"') >= 0, "新增弹窗标题为空");

// 删除
confirmAnswer = false;
sb.lgListenDel(gid);
chk(E.listening.length === 1, "confirm 取消时不删除");
confirmAnswer = true;
sb.lgListenDel(gid);
chk(E.listening.length === 0, "confirm 确认后删除成功");
sb.lgListenDel(gid);
chk(E.listening.length === 0, "删除不存在的 id 不报错、不抛异常");

console.log("【视图入口（编辑/删除按钮必须渲染出来）】");
E.listening.push({ id: "x1", title: "咖啡店点单", sentences: [{ t: "A", tr: "甲" }, { t: "B", tr: "乙" }], date: "2026-09-02T00:00:00.000Z" });
const listHtml = sb.lgRenderListening("en");
chk(listHtml.indexOf("lgListenEdit('x1')") >= 0, "列表卡片渲染 ✏️ 编辑入口");
chk(listHtml.indexOf("lgListenDel('x1')") >= 0, "列表卡片渲染 🗑 删除入口");
chk(listHtml.indexOf("event.stopPropagation()") >= 0, "编辑/删除点击不冒泡（否则会误触进入详情）");
chk(listHtml.indexOf("lg-mat-head") >= 0 && listHtml.indexOf("lg-mat-ops") >= 0, "列表卡片使用新的 lg-mat-head/ops 结构");

sb.lgListenId = "x1";
const detailHtml = sb.lgRenderListening("en");
chk(detailHtml.indexOf("lgListenEdit('x1')") >= 0, "详情页渲染 ✏️ 编辑按钮");
chk(detailHtml.indexOf("lgListenDel('x1')") >= 0, "详情页渲染 🗑 删除按钮");
sb.lgListenId = null;

console.log("【删除当前打开项后状态复位】");
sb.lgListenId = "x1";
sb.lgListenDel("x1");
chk(sb.lgListenId === null, "删除正在查看的素材后 lgListenId 复位（否则详情页空白）");

console.log(ok ? "\n🎉 全部通过" : "\n⚠️ 存在失败项");
process.exit(ok ? 0 : 1);
