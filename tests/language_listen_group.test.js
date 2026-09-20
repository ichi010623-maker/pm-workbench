// 听力素材「按名称分类 + 已掌握/未掌握」回归测试（v5.9.163）
// 覆盖：
//  1) 相关函数必须是「顶层全局函数」（防「被吞进内层作用域」静默事故）
//  2) lgListenCat 分类规则：新概念按册 / 其他来源按 " · " 前缀 / 其余归「我的素材」
//  3) lgNaturalCompare 自然序：L2 排在 L10 之前
//  4) lgListenGroupList：组间顺序、组内排序、不污染入参数组
//  5) lgListenStats / lgListenFilterList：统计与筛选、不修改原数组
//  6) 掌握状态：单条切换、按分类批量、幂等、非法 id 安全
//  7) 渲染接线：筛选 tab 计数、分组标题、折叠、卡片三入口、详情页掌握按钮
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const src = fs.readFileSync(path.join(ROOT, "js/language.js"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "css/style.v5.9.156.css"), "utf8");

const noop = () => {};
const mkEl = () => ({
  value: "", innerHTML: "", textContent: "", style: {}, dataset: {}, onclick: null,
  classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  setAttribute: noop, getAttribute: () => null, appendChild: noop, removeChild: noop,
  addEventListener: noop, focus: noop, remove: noop,
  querySelector: () => null, querySelectorAll: () => [], children: []
});

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
    render: noop, closeModal: noop, showModal: noop,
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
["lgListenCat", "lgNaturalCompare", "lgListenGroupList", "lgListenStats", "lgListenFilterList",
 "lgListenCardHtml", "lgListenListHtml", "lgListenFind", "lgListenMaster", "lgListenMasterCat",
 "lgSetListenFilter", "lgListenToggleCat", "lgRenderListening"
].forEach(f => eq(typeof sb[f], "function", f + " 在顶层"));

/* ---------------- 2. 分类规则 ---------------- */
section("lgListenCat 分类规则");
let c = sb.lgListenCat("📘 新概念 1 · L12 Goodbye and good luck");
eq(c.key, "nce:1", "第一册 key");
eq(c.label, "📘 新概念 第一册", "第一册显示名");
c = sb.lgListenCat("📘 新概念 2 · L1 A private conversation");
eq(c.key, "nce:2", "第二册 key");
eq(c.label, "📘 新概念 第二册", "第二册显示名");
c = sb.lgListenCat("🎙 BBC 6 Minute English · Coffee culture");
eq(c.key, "src:🎙 BBC 6 Minute English", "其他来源按 “ · ” 前缀分组");
eq(c.label, "🎙 BBC 6 Minute English", "来源组显示名为前缀本身");
eq(sb.lgListenCat("☕ 咖啡店点单").key, "mine", "无分隔符 → 归我的素材");
eq(sb.lgListenCat("🎧 旧格式标题").key, "mine", "开头 🎧 被剥离后再判类");
eq(sb.lgListenCat("📘 新概念 一 · L1 x").key, "nce:1", "中文数字册号也识别");
eq(sb.lgListenCat(null).key, "mine", "null 安全");
eq(sb.lgListenCat("").key, "mine", "空串安全");
chk(sb.lgListenCat("📘 新概念 1 · L1 x").order < sb.lgListenCat("📘 新概念 2 · L1 x").order, "第一册组序在第二册前");
chk(sb.lgListenCat("📘 新概念 2 · L1 x").order < sb.lgListenCat("🎙 BBC x · y").order, "新概念组序在其他来源前");
chk(sb.lgListenCat("🎙 BBC x · y").order < sb.lgListenCat("自建素材").order, "来源组序在我的素材前");

/* ---------------- 3. 自然序 ---------------- */
section("lgNaturalCompare 自然序");
chk(sb.lgNaturalCompare("L2 a", "L10 b") < 0, "L2 排在 L10 之前（非字典序）");
chk(sb.lgNaturalCompare("L10 a", "L2 b") > 0, "反向亦成立");
eq(sb.lgNaturalCompare("abc", "abc"), 0, "完全相同为 0");
chk(sb.lgNaturalCompare("A", "B") < 0, "纯文本按字符序");
chk(sb.lgNaturalCompare("L2", "L2 a") < 0, "短串在前");
eq(sb.lgNaturalCompare(null, ""), 0, "null 与空串等价");

/* ---------------- 4. 分组 ---------------- */
section("lgListenGroupList 分组");
const raw = [
  { id: "b", title: "📘 新概念 1 · L10 X" },
  { id: "a", title: "📘 新概念 1 · L2 Y" },
  { id: "c", title: "📘 新概念 2 · L1 Z" },
  { id: "d", title: "🎙 BBC 6 Minute English · Work-life balance" },
  { id: "e", title: "我的自建素材" },
  { id: "f", title: "📘 新概念 1 · L1 W" }
];
const order0 = raw.map(x => x.id).join(",");
const gs = sb.lgListenGroupList(raw);
eq(gs.length, 4, "分成 4 个分类");
eq(gs[0].key, "nce:1", "第一个分类是第一册");
eq(gs[1].key, "nce:2", "第二个分类是第二册");
eq(gs[2].key, "src:🎙 BBC 6 Minute English", "第三个分类是 BBC 来源");
eq(gs[3].key, "mine", "最后是我的素材");
eq(gs[0].items.map(x => x.id).join(","), "f,a,b", "组内按课号自然序 L1→L2→L10");
eq(gs[3].items.length, 1, "我的素材组收纳无来源素材");
eq(raw.map(x => x.id).join(","), order0, "不污染传入的数组顺序");
eq(sb.lgListenGroupList([]).length, 0, "空列表返回空分组");
eq(sb.lgListenGroupList(null).length, 0, "null 安全");

/* ---------------- 5. 统计与筛选 ---------------- */
section("lgListenStats / lgListenFilterList");
const withDone = [{ id: 1, mastered: true }, { id: 2 }, { id: 3, mastered: false }, { id: 4, mastered: true }];
let st = sb.lgListenStats(withDone);
eq(st.total, 4, "总数 4");
eq(st.done, 2, "已掌握 2");
eq(st.todo, 2, "未掌握 2");
eq(sb.lgListenStats([]).total, 0, "空列表统计为 0");
let fl = sb.lgListenFilterList(withDone, "todo");
eq(fl.length, 2, "筛选未掌握 → 2");
eq(fl[0].id, 2, "未掌握含未标记项");
eq(sb.lgListenFilterList(withDone, "done").length, 2, "筛选已掌握 → 2");
eq(sb.lgListenFilterList(withDone, "all").length, 4, "全部 → 4");
eq(sb.lgListenFilterList(withDone, "乱写").length, 4, "非法筛选值按全部处理");
eq(withDone.length, 4, "筛选不修改原数组");

/* ---------------- 6. 掌握状态 ---------------- */
section("掌握状态（单条 / 批量）");
const E = sb.langGet("en");
E.listening.length = 0;
E.listening.push(
  { id: "n1", title: "📘 新概念 1 · L1 W", date: "2026-09-20T00:00:00.000Z", sentences: [{ t: "A", tr: "甲" }] },
  { id: "n2", title: "📘 新概念 1 · L2 X", date: "2026-09-20T00:00:00.000Z", sentences: [{ t: "B", tr: "乙" }] },
  { id: "n3", title: "📘 新概念 2 · L1 Y", date: "2026-09-20T00:00:00.000Z", sentences: [{ t: "C", tr: "丙" }] },
  { id: "m1", title: "自建素材", date: "2026-09-20T00:00:00.000Z", sentences: [{ t: "D", tr: "丁" }] }
);
eq(sb.lgListenStats(E.listening).done, 0, "初始全部未掌握（老数据无 mastered 字段）");
sb.lgListenMaster("n1");
chk(!!sb.lgListenFind("n1").mastered, "单条标记已掌握");
chk(!!sb.lgListenFind("n1").masteredAt, "标记时写入 masteredAt");
sb.lgListenMaster("n1");
chk(!sb.lgListenFind("n1").mastered, "再点一次取消掌握");
eq(sb.lgListenFind("n1").masteredAt, null, "取消时清空 masteredAt");
sb.lgListenMaster("不存在的id");
chk(true, "不存在的 id 不抛错");

sb.lgListenMasterCat("nce:1", true);
eq(sb.lgListenStats(sb.langGet("en").listening).done, 2, "整类标记 → 第一册 2 组已掌握");
chk(!sb.lgListenFind("n3").mastered, "只影响该分类（第二册未被带动）");
chk(!sb.lgListenFind("m1").mastered, "只影响该分类（我的素材未被带动）");
toasts.length = 0;
sb.lgListenMasterCat("nce:1", true);
eq(toasts.length, 1, "幂等：重复标记仍有且仅有 1 条提示");
chk(/无需变更/.test(toasts[0].m), "幂等提示文案为「无需变更」");
sb.lgListenMasterCat("nce:1", false);
eq(sb.lgListenStats(sb.langGet("en").listening).done, 0, "整类取消 → 全部回到未掌握");

/* ---------------- 7. 渲染接线 ---------------- */
section("列表渲染");
// 卡片根节点：class="lg-mat"（未掌握）或 class="lg-mat mastered"（已掌握）
// 不能用 /class="lg-mat /，否则未掌握的卡片（无尾随空格）会被漏掉
const countCards = h => (h.match(/class="lg-mat[" ]/g) || []).length;
sb.lgListenFilter = "all";
sb.lgListenCollapsed = {};
let html = sb.lgListenListHtml("en");
eq((html.match(/class="lg-listen-tab[" ]/g) || []).length, 3, "渲染 3 个筛选 tab");
chk(html.indexOf("全部 <span class=\"lg-listen-cnt\">4</span>") >= 0, "全部 tab 计数 = 4");
chk(html.indexOf("掌握进度 0 / 4") >= 0, "掌握进度条渲染");
chk(html.indexOf("📘 新概念 第一册") >= 0 && html.indexOf("📘 新概念 第二册") >= 0, "分类标题渲染");
chk(html.indexOf("📝 我的素材") >= 0, "兜底分类渲染");
chk(html.indexOf("2 组 · 已掌握 0/2") >= 0, "分类内计数渲染");
eq(countCards(html), 4, "全部视图渲染 4 张卡片");
chk(html.indexOf("lgListenMaster('n1')") >= 0, "卡片带「标记已掌握」入口");
chk(html.indexOf("lgListenEdit('n1')") >= 0, "卡片保留编辑入口");
chk(html.indexOf("lgListenDel('n1')") >= 0, "卡片保留删除入口");
chk(html.indexOf("event.stopPropagation();lgListenMaster") >= 0, "操作按钮阻止冒泡（不误触进详情）");
chk(html.indexOf("lgListenMasterCat('nce:1',true)") >= 0, "分类头带「全掌握」批量入口");

sb.lgListenMaster("n1");
sb.lgListenMaster("n3");
html = sb.lgListenListHtml("en");
chk(html.indexOf("class=\"lg-mat mastered\"") >= 0, "已掌握卡片加 mastered 类（弱化显示）");
chk(html.indexOf("lg-done-tag") >= 0, "已掌握卡片带标签");
chk(html.indexOf("✅ 📘 新概念 1 · L1 W") >= 0, "已掌握卡片标题前置 ✅");
chk(html.indexOf("掌握进度 2 / 4") >= 0, "进度随掌握状态更新");
chk(html.indexOf("还有 2 组未掌握") >= 0, "未掌握提示渲染");
chk(html.indexOf("lgListenMasterCat('nce:1',false)") >= 0, "有已掌握项时出现「全取消」");

sb.lgSetListenFilter("todo");
eq(sb.lgListenFilter, "todo", "筛选状态已切换");
let todoHtml = sb.lgListenListHtml("en");
eq(countCards(todoHtml), 2, "未掌握视图只渲染 2 张卡片");
chk(todoHtml.indexOf("n2") >= 0 && todoHtml.indexOf("m1") >= 0, "未掌握视图含正确条目");
sb.lgSetListenFilter("done");
let doneHtml = sb.lgListenListHtml("en");
eq(countCards(doneHtml), 2, "已掌握视图只渲染 2 张卡片");
chk(doneHtml.indexOf("全部 <span class=\"lg-listen-cnt\">4</span>") >= 0, "筛选后 tab 计数仍按全量统计");
sb.lgSetListenFilter("乱写");
eq(sb.lgListenFilter, "all", "非法筛选值回落 all");

section("分类折叠");
sb.lgListenFilter = "all";
sb.lgListenCollapsed["nce:1"] = true;
let colHtml = sb.lgListenListHtml("en");
chk(colHtml.indexOf("▶ 📘 新概念 第一册") >= 0, "折叠后分类标题显示 ▶");
eq(countCards(colHtml), 2, "折叠分类的卡片不渲染（4-2=2）");
sb.lgListenToggleCat("nce:1");
chk(!sb.lgListenCollapsed["nce:1"], "再点分类头展开");
eq(countCards(sb.lgListenListHtml("en")), 4, "展开后卡片恢复");

section("空态与整页接线");
const Eja = sb.langGet("ja");
Eja.listening.length = 0;
chk(sb.lgListenListHtml("ja").indexOf("还没有听力素材") >= 0, "空列表给出提示");
sb.lgListenFilter = "done";
chk(sb.lgListenListHtml("ja").indexOf("还没有标记为「已掌握」") >= 0, "已掌握为空时给出引导文案");
sb.lgListenFilter = "all";

sb.lgListenId = null;
const page = sb.lgRenderListening("en");
chk(page.indexOf("lg-listen-tabs") >= 0, "听力页真的把筛选 tab 渲染进页面（函数在顶层 ≠ 界面接上了）");
chk(page.indexOf("lg-listen-group") >= 0, "听力页渲染出分类分组");
chk(page.indexOf("已掌握 2") >= 0, "卡片头显示已掌握数量");
sb.lgListenId = "n2";
const detail = sb.lgRenderListening("en");
chk(detail.indexOf("✅ 标记已掌握") >= 0, "详情页未掌握时显示「标记已掌握」");
chk(detail.indexOf("lgListenMaster('n2')") >= 0, "详情页掌握按钮接线正确");
sb.lgListenId = "n1";
chk(sb.lgRenderListening("en").indexOf("↩️ 取消掌握") >= 0, "详情页已掌握时显示「取消掌握」");
sb.lgListenId = null;

section("样式就位");
[".lg-listen-tabs{", ".lg-listen-tab.on{", ".lg-listen-bar{", ".lg-listen-group{",
 ".lg-listen-gt{", ".lg-listen-gop{", ".lg-mat.mastered{", ".lg-done-tag{"].forEach(k =>
  chk(css.indexOf(k) >= 0, "CSS 含 " + k));

console.log("\n" + (ok ? "🎉 听力分类与掌握状态 " + pass + " 项断言全部通过" : "❌ 存在失败项"));
process.exit(ok ? 0 : 1);
