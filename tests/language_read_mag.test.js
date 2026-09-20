// 精读「外刊 / TED / 划句式」回归测试（v5.9.164）
// 覆盖：
//  1) 顶层作用域：新增公开函数必须挂在全局（防「被吞进内层作用域」静默事故）
//  2) lgSplitSentences：缩写 / 小数 / 首字母缩写 / 引号收尾 / 中文 / 空串
//  3) lgPatKey / lgPatKnown：句式归一化（大小写、空白、弯引号）
//  4) 懒加载 lgEnsure：只发一次请求、失败不抛、缓存命中直接回调
//  5) 渲染接线：五个子视图 tab、外刊分类分层、TED 分组、句式库列表
//  6) 阅读页：划句式开关、句子可点、译文开关、来源链接
//  7) 打开外刊/TED 文章：未加载正文时给加载态且不崩
//  8) 句式卡 CRUD：新增 / 更新 / 删除 / 按标题去重
//  9) CSS：新增样式类必须存在
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const src = fs.readFileSync(path.join(ROOT, "js/language.js"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "css/style.v5.9.156.css"), "utf8");

let pass = 0, ok = true;
function chk(cond, label) { pass++; console.log((cond ? "  ✅ " : "  ❌ ") + label); if (!cond) ok = false; }
function eq(a, b, label) { chk(a === b, label + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function section(t) { console.log("\n【" + t + "】"); }
function has(hay, needle, label) { chk(String(hay).indexOf(needle) !== -1, label + " ⊃ " + JSON.stringify(needle)); }
function notHas(hay, needle, label) { chk(String(hay).indexOf(needle) === -1, label + " ⊅ " + JSON.stringify(needle)); }

const noop = () => {};
const els = {};
const toasts = [];
const fetches = [];
let lastModal = "";

function mkEl(id) {
  return {
    id: id, value: "", innerHTML: "", textContent: "", style: {}, dataset: {}, onclick: null,
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    setAttribute: noop, getAttribute: () => null, appendChild: noop, removeChild: noop,
    addEventListener: noop, focus: noop, remove: noop,
    querySelector: () => null, querySelectorAll: () => [], children: []
  };
}

function mkSandbox() {
  Object.keys(els).forEach(k => delete els[k]);
  const sb = {
    console: { log: noop, warn: noop, error: noop },
    localStorage: (function () { const m = {}; return {
      getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); },
      removeItem: k => { delete m[k]; }, clear: noop, key: () => null, get length() { return Object.keys(m).length; }
    }; })(),
    document: {
      getElementById: id => (id in els ? els[id] : null),
      querySelector: () => null, querySelectorAll: () => [],
      createElement: mkEl, body: mkEl(), head: mkEl(), documentElement: mkEl(),
      addEventListener: noop, readyState: "complete"
    },
    screen: { width: 390, height: 844 }, navigator: { userAgent: "node", language: "zh-CN" },
    location: { href: "http://localhost/", search: "", hash: "" },
    setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame: cb => setTimeout(cb, 0),
    SpeechSynthesisUtterance: function (t) { this.text = t; },
    speechSynthesis: { speak: noop, cancel: noop, getVoices: () => [], speaking: false, pending: false, paused: false },
    fetch: url => { fetches.push(url); return new Promise(() => {}); },
    escapeHtml: s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"),
    showToast: (m, t) => toasts.push({ m, t }),
    render: noop, closeModal: noop, showModal: h => { lastModal = h; },
    confirm: () => true, prompt: () => null,
    loadAiConfig: () => ({ provider: "minimax", apiKey: "", apiUrl: "", model: "" }),
    formatDateShort: s => String(s || "").slice(0, 10), today: () => "2026-09-20", bjTodayStr: () => "2026-09-20",
    openaiCall: noop, DB: { data: { growth: {} }, save: noop, logActivity: noop },
    APP_VERSION: "5.9.164"
  };
  sb.window = sb;
  vm.createContext(sb);
  return sb;
}

/** 造一篇文章体的外语数据 */
function seedMag(sb) {
  sb.__lgStore["mag:idx"] = {
    updatedAt: "2026-09-20T17:00:00+08:00",
    mags: [{
      key: "economist", name: "经济学人", en: "The Economist", emoji: "📗",
      issues: [{
        issue: "2026.09.19", date: "2026-09-19",
        src: "https://github.com/hehonghui/awesome-english-ebooks/tree/master/01_economist/te_2026.09.19",
        articles: [
          { id: "economist-2026.09.19-1", section: "Leaders", rubric: "Our cover", title: "Can the AI arms race be stopped?", words: 983 },
          { id: "economist-2026.09.19-2", section: "Leaders", rubric: "Not your bond", title: "Markets are waking up", words: 795 },
          { id: "economist-2026.09.19-3", section: "Business", rubric: "Spoils of war", title: "An oil-supply crisis", words: 1279 }
        ]
      }]
    }, {
      key: "newyorker", name: "纽约客", en: "The New Yorker", emoji: "🗽",
      issues: [{ issue: "2026.09.21", date: "2026-09-21", src: "https://github.com/x", articles: [
        { id: "newyorker-2026.09.21-1", section: "Photo Booth", title: "How a Skateboarder Sees Los Angeles", words: 1292 }
      ] }]
    }]
  };
  sb.__lgStore["mag:body:economist"] = {
    key: "economist", updatedAt: "2026-09-20T17:00:00+08:00",
    bodies: {
      "economist-2026.09.19-1": "America will struggle to make the technology safe. Dr. Smith said the race is on. It costs 3.5 billion dollars a year.\n\nSecond paragraph here.",
      "economist-2026.09.19-2": "Bond markets are twitchy. Investors are worried.",
      "economist-2026.09.19-3": "Oil supply is tight. Prices may rise."
    }
  };
}
function seedTed(sb) {
  sb.__lgStore["ted:idx"] = {
    updatedAt: "2026-09-20T17:00:00+08:00",
    groups: [
      { key: "tech", name: "科技与AI", count: 2, order: 1 },
      { key: "mind", name: "心理与成长", count: 1, order: 4 }
    ],
    talks: [
      { id: "111", slug: "a", title: "How to see (and stop) deforestation", speaker: "Someone", topic: "tech", topicName: "科技与AI", duration: 754, publishedAt: "2026-09-01", paras: 28, hasZh: true, src: "https://www.ted.com/talks/a" },
      { id: "222", slug: "b", title: "Why AI will never replace a great teacher", speaker: "Other", topic: "tech", topicName: "科技与AI", duration: 600, publishedAt: "2026-08-20", paras: 41, hasZh: true, src: "https://www.ted.com/talks/b" },
      { id: "333", slug: "c", title: "How to be a great listener", speaker: "Third", topic: "mind", topicName: "心理与成长", duration: 480, publishedAt: "2026-08-10", paras: 54, hasZh: false, src: "https://www.ted.com/talks/c" }
    ]
  };
  sb.__lgStore["ted:body:tech"] = {
    group: "tech", groupName: "科技与AI", updatedAt: "2026-09-20T17:00:00+08:00",
    bodies: {
      "111": { en: ["Forests are disappearing fast. Satellites can see it happen.", "We must act now."], zh: ["森林正在快速消失。卫星能看到这一切。", "我们必须现在就行动。"] },
      "222": { en: ["Teachers matter more than tools."], zh: ["老师比工具更重要。"] }
    }
  };
}

const sb = mkSandbox();
vm.runInContext(src, sb, { filename: "language.js" });
const e = sb.langGet("en");

/* ---------------- 1. 顶层作用域 ---------------- */
section("顶层作用域");
["lgEnsure", "lgSplitSentences", "lgPatKey", "lgPatKnown", "lgReadSentHtml", "lgReadWordHtml",
 "lgWordblockHtml", "lgReadingArticleHtml", "lgRenderReading", "lgReadTabs", "lgReadDailyHtml",
 "lgReadMineHtml", "lgReadPatHtml", "lgReadMagHtml", "lgReadTedHtml", "lgOpenMag", "lgOpenMagArt",
 "lgOpenTedGroup", "lgOpenTedArt", "lgPickMagIssue", "lgMagCurrent", "lgFmtDur", "lgSetReadView",
 "lgPatPick", "lgPatSave", "lgPatNew", "lgPatEdit", "lgPatUpdate", "lgPatDel", "lgReadOpened",
 "lgLoadingCard", "lgEmptyCard"
].forEach(f => eq(typeof sb[f], "function", f + " 在顶层"));
// 旧的入口仍在（app.js / 其它模块可能引用）
eq(typeof sb.m1, "function", "m1 仍在顶层");
has(src, "function lgOpenDailyArt", "lgOpenDailyArt 仍存在");
has(src, "function lgAddMaterial", "lgAddMaterial 仍存在");
has(src, "function lgImportReading", "lgImportReading 仍存在");

/* ---------------- 2. 切句 ---------------- */
section("lgSplitSentences 切句");
eq(sb.lgSplitSentences("One. Two. Three.").length, 3, "三个短句");
eq(sb.lgSplitSentences("Hello world")[0], "Hello world", "无句末标点也算一句");
eq(sb.lgSplitSentences("") .length, 0, "空串 → 0 句");
eq(sb.lgSplitSentences("   ").length, 0, "全空白 → 0 句");
let ss = sb.lgSplitSentences("Mr. Smith went home. He was tired.");
eq(ss.length, 2, "Mr. 缩写不断句");
eq(ss[0], "Mr. Smith went home.", "第一句完整");
ss = sb.lgSplitSentences("It grew 3.5 percent. That is a lot.");
eq(ss.length, 2, "小数点不断句");
eq(ss[0], "It grew 3.5 percent.", "小数保留在句内");
ss = sb.lgSplitSentences("The U.S. market fell. Then it rose.");
eq(ss.length, 2, "U.S. 首字母缩写不断句");
ss = sb.lgSplitSentences('He said "stop." Then he left.');
eq(ss.length, 2, "引号收尾算句末");
ss = sb.lgSplitSentences("Wait! Are you sure? Yes.");
eq(ss.length, 3, "! 与 ? 都断句");
ss = sb.lgSplitSentences("今天天气很好。我们出去走走！好吗？");
eq(ss.length, 3, "中文按句末标点切");
ss = sb.lgSplitSentences("A. B. C. Done.");
chk(ss.length >= 1, "单字母句不产生空串（实得 " + ss.length + "）");
chk(ss.every(x => x.trim().length > 0), "每句非空");
// 段落内的英文长句 + 换行
ss = sb.lgSplitSentences("First one. Second one.\n\nignored");
chk(ss.length >= 2, "多句可切（实得 " + ss.length + "）");

/* ---------------- 3. 句式键归一化 ---------------- */
section("lgPatKey / lgPatKnown");
eq(sb.lgPatKey("  It  is  Good. "), "it is good.", "空白折叠 + 小写");
eq(sb.lgPatKey("don\u2019t stop"), "don't stop", "弯引号拉直");
eq(sb.lgPatKey("\u201cQuote\u201d"), '"quote"', "双弯引号拉直");
eq(sb.lgPatKey(null), "", "null → 空");
e.patterns.push({ id: "p1", text: "Not only A but also B.", struct: "", note: "", tags: [], source: "精读", date: "2026-09-20" });
const known = sb.lgPatKnown("en");
eq(known[sb.lgPatKey("not only a but also b.")], 1, "已收藏句式可被命中（大小写无关）");
eq(!!known[sb.lgPatKey("别的句子")], false, "未收藏句式不命中");

/* ---------------- 4. lgEnsure 懒加载 ---------------- */
section("lgEnsure 懒加载");
const before = fetches.length;
let cbCount = 0;
delete sb.__lgStore["probe:x"];
sb.lgEnsure("probe:x", "data/probe.json", () => { cbCount++; });
sb.lgEnsure("probe:x", "data/probe.json", () => { cbCount++; });
eq(fetches.length - before, 1, "同一 key 只发一次请求");
eq(cbCount, 0, "请求未回来前不回调");
sb.__lgStore["probe:x"] = { hi: 1 };
let cb2 = 0;
sb.lgEnsure("probe:x", "data/probe.json", () => { cb2++; });
eq(cb2, 1, "缓存命中立即回调");
has(fetches[fetches.length - 1], "?v=", "请求带版本号（防缓存）");

/* ---------------- 5. 子视图渲染 ---------------- */
section("子视图渲染");
seedMag(sb);
seedTed(sb);
sb.lgReadView = "daily";
let h = sb.lgRenderReading("en");
has(h, "lg-read-tabs", "顶部有子视图 tab");
["📅 每日", "📰 外刊", "🎙 TED", "✍️ 我的", "🔖 句式"].forEach(t => has(h, t, "tab 含 " + t));

sb.lgReadView = "mag";
h = sb.lgRenderReading("en");
has(h, "英文外刊", "外刊视图标题");
has(h, "经济学人", "刊物名");
has(h, "纽约客", "第二本刊物");
has(h, "2 刊", "刊物数统计");
has(h, "lg-mag-name", "刊物分类卡");
notHas(h, "Leaders", "未展开时不泄露栏目");

sb.lgOpenMag("economist");
h = sb.lgRenderReading("en");
eq(sb.lgMagOpen, "economist", "展开刊物");
eq(sb.lgMagIssue, "2026.09.19", "默认选中最新一期");
has(h, "2026.09.19", "期号 tab");
has(h, "Leaders", "栏目分类头");
has(h, "Business", "第二个栏目");
has(h, "Can the AI arms race be stopped?", "文章标题");
has(h, "Our cover", "副题");
has(h, "983 词", "词数");
has(h, "lg-mag-sec", "栏目分组容器");
// 3 篇：Leaders 2 + Business 1
eq((h.match(/lg-mat-title">/g) || []).length, 3, "文章行数 = 3");

sb.lgOpenMag("economist"); // 再点一次 → 收起
eq(sb.lgMagOpen, null, "再点收起");

sb.lgReadView = "ted";
h = sb.lgRenderReading("en");
has(h, "TED 演讲精读", "TED 视图标题");
has(h, "3 场", "场次统计");
has(h, "2 类", "分类统计");
has(h, "科技与AI", "分类名");
has(h, "心理与成长", "第二分类");
sb.lgOpenTedGroup("mind");
h = sb.lgRenderReading("en");
has(h, "How to be a great listener", "展开后可见演讲");
has(h, "Third", "讲者名");
has(h, "8:00", "时长格式化 480s → 8:00");
eq(sb.lgFmtDur(754), "12:34", "lgFmtDur 754s");
eq(sb.lgFmtDur(0), "0:00", "lgFmtDur 0");
eq(sb.lgFmtDur(59), "0:59", "lgFmtDur 59s 补零");

sb.lgReadView = "pat";
h = sb.lgRenderReading("en");
has(h, "句式库", "句式库标题");
has(h, "Not only A but also B.", "已收藏句式");
has(h, "lg-pat", "句式卡容器");
sb.lgPatSearch = "not only";
h = sb.lgRenderReading("en");
has(h, "Not only", "搜索命中");
sb.lgPatSearch = "不存在的句子xyz";
h = sb.lgRenderReading("en");
has(h, "没有匹配的句式", "搜索无结果提示");
sb.lgPatSearch = "";

sb.lgReadView = "mine";
h = sb.lgRenderReading("en");
has(h, "我的精读素材", "我的素材标题");
has(h, "粘贴导入文本", "导入入口");
has(h, "内置精选", "内置入口");
has(h, "句式库（1）", "句式数量入口");

sb.lgSetReadView("daily");
eq(sb.lgReadView, "daily", "lgSetReadView 切换");
eq(sb.lgMagArt, null, "切视图清空外刊文章");
eq(sb.lgReadPatMode, false, "切视图关掉划句式");

/* ---------------- 6. 阅读页：划句式 ---------------- */
section("阅读页 · 划句式");
e.patterns = [];
sb.lgReadPatMode = false;
h = sb.lgReadingArticleHtml({
  title: "Test Art", content: "One sentence. Two sentence. Three here.",
  translation: "译文一。译文二。", meta: ["经济学人", "2026.09.19"], src: "https://example.com/x"
}, "en", e, "<button>back</button>");
has(h, "Test Art", "标题");
has(h, "🖍 划句式", "划句式按钮");
has(h, "lg-art-word", "默认点词模式");
notHas(h, "lg-sent", "默认不渲染句子");
has(h, "来源", "来源链接文字");
has(h, "https://example.com/x", "来源地址");
notHas(h, "译文一", "翻译默认隐藏");
sb.lgReadingShowTrans = true;
h = sb.lgReadingArticleHtml({ title: "T", content: "Hi there.", translation: "你好。" }, "en", e, "");
has(h, "你好。", "翻译开关打开后显示译文");
sb.lgReadingShowTrans = false;

sb.lgReadPatMode = true;
h = sb.lgReadingArticleHtml({ title: "T", content: "One sentence. Two sentence.\n\nNew paragraph here." }, "en", e, "");
has(h, "lg-sent", "划句式模式渲染句子");
eq((h.match(/class="lg-sent[" ]/g) || []).length, 3, "3 句 = 3 个可点 span（容下无尾随空格写法）");
eq(sb.lgReadSentBuf.length, 3, "句子缓存长度 3");
eq(sb.lgReadSentBuf[0], "One sentence.", "缓存首句");
notHas(h, "lg-art-word", "划句式下不再渲染点词");
chk(h.indexOf("lgPatPick(0)") !== -1, "首句 onclick 传下标 0");
// 已收藏的句子加 saved
e.patterns = [{ id: "p2", text: "Two sentence.", struct: "", note: "", tags: [], source: "精读", date: "2026-09-20" }];
h = sb.lgReadingArticleHtml({ title: "T", content: "One sentence. Two sentence." }, "en", e, "");
eq((h.match(/lg-sent saved/g) || []).length, 1, "已收藏句子加 saved 类");
e.patterns = [];
sb.lgReadPatMode = false;

/* ---------------- 7. 打开外刊 / TED 文章 ---------------- */
section("打开外刊 / TED 文章");
sb.lgOpenMagArt("economist", "2026.09.19", "economist-2026.09.19-1");
eq(sb.lgMagArt && sb.lgMagArt.id, "economist-2026.09.19-1", "记录外刊文章");
eq(sb.lgReadPatMode, false, "打开文章时关掉划句式");
h = sb.lgReadOpened("en", e);
has(h, "Can the AI arms race be stopped?", "外刊正文标题");
has(h, "America will struggle", "正文内容");
has(h, "Leaders", "meta 带栏目");
eq(sb.lgReadSrcLabel, "经济学人 · Leaders", "句式归属标签 = 刊物·栏目");

sb.lgMagArt = { key: "economist", issue: "2026.09.19", id: "not-in-store" };
h = sb.lgReadOpened("en", e);
has(h, "正在加载", "正文缺失时给加载态");
notHas(h, "undefined", "加载态不含 undefined");
sb.lgMagArt = null;

sb.lgOpenTedArt("tech", "111");
h = sb.lgReadOpened("en", e);
has(h, "How to see (and stop) deforestation", "TED 标题");
has(h, "Forests are disappearing fast.", "英文字幕正文");
eq(sb.lgReadSrcLabel, "TED", "TED 句式归属");
sb.lgOpenTedArt("tech", "999");
h = sb.lgReadOpened("en", e);
has(h, "正在加载", "TED 正文缺失时给加载态");
sb.lgTedArt = null;

// 每日推送 / 我的素材仍可打开
sb.__lgReading = { days: { "2026-09-20": [{ level: "入门", title: "Daily A", content: "Hi. There.", translation: "你好。" }] } };
sb.lgReadingDaily = { date: "2026-09-20", idx: 0 };
h = sb.lgReadOpened("en", e);
has(h, "Daily A", "每日推送文章可打开");
eq(sb.lgReadSrcLabel, "每日精读", "每日推送归属标签");
sb.lgReadingDaily = null;

e.materials.push({ id: "m1", title: "My Art", content: "Some text.", translation: "", date: "2026-09-20T00:00:00Z", marks: [] });
sb.lgReadingId = "m1";
h = sb.lgReadOpened("en", e);
has(h, "My Art", "我的素材可打开");
eq(sb.lgReadSrcLabel, "我的素材", "我的素材归属标签");
sb.lgReadingId = null;

/* ---------------- 8. 句式卡 CRUD ---------------- */
section("句式卡 CRUD");
const t0 = toasts.length;
sb.lgReadSentBuf = ["Saved sentence here."];
lastModal = "";
sb.lgPatPick(0);
has(lastModal, "Saved sentence here.", "弹窗预填原句");
has(lastModal, "lgp-struct", "弹窗有句型结构输入框");
has(lastModal, "lgp-note", "弹窗有笔记输入框");
has(lastModal, "收藏句式", "弹窗有收藏按钮");
has(lastModal, "🖍 划句式", "弹窗标题");
lastModal = "";
sb.lgPatPick(99);
eq(lastModal, "", "非法下标不弹窗（直接返回）");

els["lgp-text"] = mkEl("lgp-text"); els["lgp-text"].value = "Saved sentence here.";
els["lgp-struct"] = mkEl("lgp-struct"); els["lgp-struct"].value = "It is + adj. + that…";
els["lgp-note"] = mkEl("lgp-note"); els["lgp-note"].value = "仿写：It is clear that…";
els["lgp-tags"] = mkEl("lgp-tags"); els["lgp-tags"].value = "精读,句型";
sb.lgReadSrcLabel = "经济学人 · Leaders";
sb.lgPatSave();
eq(e.patterns.length, 1, "新增 1 条句式");
eq(e.patterns[0].text, "Saved sentence here.", "文本入库存");
eq(e.patterns[0].struct, "It is + adj. + that…", "结构入库存");
eq(e.patterns[0].tags.length, 2, "标签按中英文逗号切分");
eq(e.patterns[0].source, "经济学人 · Leaders", "来源标签入库存");
eq(e.patterns[0].date, "2026-09-20", "日期入库存");
chk(toasts.length > t0, "新增后有提示");

// 空句子不落库
els["lgp-text"] = mkEl("lgp-text"); els["lgp-text"].value = "";
const n1 = e.patterns.length;
sb.lgPatSave();
eq(e.patterns.length, n1, "空句子不新增");
chk(toasts[toasts.length - 1].t === "warning", "空句子给 warning");

const pid = e.patterns[0].id;
sb.lgPatEdit(pid);
eq(els["lgp-struct"].value, "It is + adj. + that…", "编辑弹窗回填结构");
eq(els["lgp-tags"].value, "精读,句型", "编辑弹窗回填标签");
els["lgp-struct"].value = "改为疑问句式";
els["lgp-note"].value = "新笔记";
els["lgp-tags"].value = "精读";
sb.lgPatUpdate(pid);
eq(e.patterns[0].struct, "改为疑问句式", "更新结构");
eq(e.patterns[0].note, "新笔记", "更新笔记");
eq(e.patterns[0].tags.length, 1, "更新标签");
sb.lgPatDel(pid);
eq(e.patterns.length, 0, "删除句式");
eq(sb.lgPatKnown("en")[sb.lgPatKey("Saved sentence here.")], undefined, "删除后不再命中");

/* ---------------- 9. CSS ---------------- */
section("CSS 新增类");
[".lg-read-tabs", ".lg-read-tab.active", ".lg-mag-head", ".lg-mag-sec", ".lg-mag-chip",
 ".lg-mag-src", ".lg-gmat-sub", ".lg-sent", ".lg-sent.saved", ".lg-pat-text", ".lg-pat-struct",
 ".lg-pat-note", ".lg-pat-foot", ".lg-pat-tag", ".lg-art-p", ".lg-btn.sm"
].forEach(sel => {
  const probe = sel === ".lg-gmat-sub" ? ".lg-mat-sub" : sel;
  has(css, probe, "CSS 有 " + probe);
});

/* ---------------- 结果 ---------------- */
console.log("\n" + (ok ? "✅ 全部通过" : "❌ 存在失败") + " —— 断言 " + pass + " 条");
process.exit(ok ? 0 : 1);
