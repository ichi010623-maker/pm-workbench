#!/usr/bin/env node
// 测试：语法学习模块（v5.9.174 重构）
//
// 校验内容：
//   1. LG_GRAMMAR_BUILTIN 必须含 en/ja/ko 三语种，且 en 必须含 8 大类：
//      词性 / 句法成分 / 句子结构 / 时态 / 疑问代词 / 人称代词
//   2. langGet 自动注入 grammar 字段
//   3. lgNormalizeLang 补齐 grammar 缺失字段（customSeen 旧值=0 应被规整为 object）
//   4. lgGrammarSeedBuiltin 幂等：已有不覆盖；新增按 id 去重
//   5. lgRenderGrammar 列表视图：顶部统计/进度条/搜索/分类折叠
//   6. lgRenderGrammar 详情视图：标题/描述/例句/hi 高亮/朗读按钮
//   7. CRUD：lgGrammarFormSubmit/lgGrammarDel/lgGrammarMarkSeen
//   8. 搜索：中英文全文匹配（lowercase + trim）
//   9. lgGrammarHighlightEn 关键词高亮
//   10. CSS：.lg-grammar-* 类必须就位（新版 UI 对齐听力）
//
// 关键历史：
//   - v5.9.172 旧版 lgGrammarNew 用 showModal({title, body, okText, onOk}) 配置对象，
//     但项目内 showModal 实际只接受 (html) 字符串，弹窗打不开 → "新增按钮点进去没东西"。
//   - v5.9.174 改用与听力一致的「裸 HTML + 内嵌按钮 + closeModal」模式（参照 lgListenForm）。

"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const SRC = fs.readFileSync(path.join(ROOT, "js", "language.js"), "utf8");
const CSS = fs.readFileSync(path.join(ROOT, "css", "style.v5.9.156.css"), "utf8");
const APP = fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8");

let pass = 0, fail = 0;
function assert(name, cond, extra) {
  if (cond) { console.log("  ✅", name); pass++; }
  else { console.log("  ❌", name, extra || ""); fail++; }
}

// === 沙箱与基础 ===
const sb = makeSandbox();
try { vm.runInContext(SRC, sb); }
catch (e) { console.error("❌ language.js 执行失败:", e.message); process.exit(1); }

// === 1. 顶层函数完整性 ===
const fns = [
  "lgRenderGrammar", "lgGrammarOpen", "lgGrammarBack", "lgGrammarToggleCat",
  "lgGrammarNew", "lgGrammarEdit", "lgGrammarDel",
  "lgGrammarFormSubmit", "lgGrammarParseForm", "lgGrammarShowForm",
  "lgGrammarMarkSeen", "lgGrammarHighlightEn", "lgGrammarSpeakExample", "lgGrammarSpeakAll",
  "lgGrammarSeedBuiltin", "lgGrammarStats", "lgGrammarCatList",
  "lgGrammarOnSearch", "lgGrammarClearSearch", "lgGrammarDetailHtml", "lgGrammarListItemHtml"
];
fns.forEach(function (k) {
  assert("顶层函数存在: " + k, typeof sb[k] === "function");
});

// === 2. 内置库 ===
assert("LG_GRAMMAR_BUILTIN 含 en/ja/ko 三语种",
  ["en", "ja", "ko"].every(function (k) { return Array.isArray(sb.LG_GRAMMAR_BUILTIN[k]) && sb.LG_GRAMMAR_BUILTIN[k].length > 0; }));
assert("en builtin 至少 50 项（8 大类）", sb.LG_GRAMMAR_BUILTIN.en.length >= 50,
  "count=" + sb.LG_GRAMMAR_BUILTIN.en.length);
const enCats = new Set(sb.LG_GRAMMAR_BUILTIN.en.map(function (x) { return x.cat; }));
const needCats = ["词性", "句法成分", "句子结构", "时态", "疑问代词", "人称代词"];
needCats.forEach(function (c) {
  assert("en builtin 含「" + c + "」分类", enCats.has(c));
});
assert("builtin 项结构合法（含 cat/title/examples）",
  sb.LG_GRAMMAR_BUILTIN.en.every(function (x) { return x.cat && x.title && Array.isArray(x.examples) && x.examples.length > 0; }));
assert("example 结构合法（含 en/zh）",
  sb.LG_GRAMMAR_BUILTIN.en.every(function (x) {
    return x.examples.every(function (e) { return e.en && e.zh; });
  }));
assert("例句可带 hi 关键词高亮数组",
  sb.LG_GRAMMAR_BUILTIN.en.some(function (x) { return x.examples.some(function (e) { return Array.isArray(e.hi) && e.hi.length; }); }));

// === 3. langGet 自动注入 grammar 字段 ===
sb.DB.data = { growth: { language: { langs: {}, curLang: "en" } } };
var lang = sb.langGet("en");
assert("langGet 自动注入 grammar", lang && typeof lang.grammar === "object");
assert("grammar.builtin 是数组", Array.isArray(lang.grammar.builtin));
assert("grammar.custom 是数组", Array.isArray(lang.grammar.custom));
assert("grammar.customSeen 是 object（支持 seen[id]=1）",
  typeof lang.grammar.customSeen === "object");

// === 4. lgGrammarSeedBuiltin 幂等 ===
sb.lgGrammarSeedBuiltin("en", lang);
var seed1Count = lang.grammar.builtin.length;
sb.lgGrammarSeedBuiltin("en", lang);
assert("lgGrammarSeedBuiltin 幂等（重复不增）", lang.grammar.builtin.length === seed1Count);

// === 5. 列表视图 ===
sb.LG_GRAMMAR_VIEW = "list";
sb.LG_GRAMMAR_CUR_ID = null;
sb.LG_GRAMMAR_SEARCH = "";
var html = sb.lgRenderGrammar("en");
assert("列表渲染含顶部统计行", html.indexOf("lg-grammar-head") >= 0);
assert("列表渲染含进度条", html.indexOf("lg-grammar-prog-bar") >= 0);
assert("列表渲染含搜索框", html.indexOf("lg-grammar-search") >= 0);
assert("列表渲染含分类头", html.indexOf("lg-grammar-cat-h") >= 0);
assert("列表渲染含内置项卡片", /lg-grammar-item/.test(html) && /内置/.test(html));
assert("列表渲染含「新增语法」按钮", html.indexOf("lgGrammarNew") >= 0);
assert("列表渲染含至少 6 个分类（8 大类）",
  (html.match(/lg-grammar-cat-h/g) || []).length >= 6);

// === 6. 详情视图（选时态类，验证 hi 高亮 + 朗读按钮） ===
var tenseItem = sb.LG_GRAMMAR_BUILTIN.en.filter(function (x) { return x.cat === "时态"; })[0];
sb.LG_GRAMMAR_VIEW = "detail";
sb.LG_GRAMMAR_CUR_ID = tenseItem.id;
sb.LG_GRAMMAR_CUR_IS_CUSTOM = false;
var detailHtml = sb.lgRenderGrammar("en");
assert("详情视图含时态标题", detailHtml.indexOf(tenseItem.title.slice(0, 4)) >= 0);
assert("详情视图含 hi 高亮 .lg-grammar-hi",
  detailHtml.indexOf("lg-grammar-hi") >= 0);
assert("详情视图含 🔊 朗读按钮",
  detailHtml.indexOf("🔊") >= 0);
assert("详情视图含「朗读全部例句」按钮",
  detailHtml.indexOf("lgGrammarSpeakAll") >= 0);
assert("详情视图含 cat 标签", detailHtml.indexOf("lg-grammar-detail-cat") >= 0);
sb.LG_GRAMMAR_VIEW = "list";

// === 7. CRUD（不依赖 showModal，模拟 DOM + 直接调函数） ===
sb.DB.data.growth.language.langs.en.grammar.custom = [];
function mockDom(values) {
  sb.document.getElementById = function (id) {
    return { value: (values[id] !== undefined ? values[id] : "") };
  };
}
sb.LG_GRAMMAR_DRAFT = { mode: "new", cat: "动词" };
mockDom({
  "lg-g-cat": "动词",
  "lg-g-title": "现在完成时（测试）",
  "lg-g-desc": "have + 过去分词",
  "lg-g-ex": "I have done it.|我完成了。|完成动作\nShe has gone.|她走了。|go 的现在完成时",
  "lg-g-notes": "have / has 区分主语"
});
var saveResult = sb.lgGrammarFormSubmit();
assert("lgGrammarFormSubmit 新增成功", saveResult === true);
assert("新增后 custom 数组 +1",
  sb.DB.data.growth.language.langs.en.grammar.custom.length === 1);
var addedId = sb.DB.data.growth.language.langs.en.grammar.custom[0].id;
assert("新增项 id 以 custom- 开头", /^custom-/.test(addedId));

// markSeen
sb.lgGrammarMarkSeen(addedId, true);
assert("markSeen=true 写入 customSeen",
  sb.DB.data.growth.language.langs.en.grammar.customSeen[addedId] === 1);
sb.lgGrammarMarkSeen(addedId, false);
assert("markSeen=false 清空",
  !sb.DB.data.growth.language.langs.en.grammar.customSeen[addedId]);

// 编辑
sb.LG_GRAMMAR_DRAFT = { mode: "edit", id: addedId };
mockDom({
  "lg-g-cat": "时态",
  "lg-g-title": "现在完成时（已编辑）",
  "lg-g-desc": "have + 过去分词（updated）",
  "lg-g-ex": "Edited.|已编辑。",
  "lg-g-notes": ""
});
var editResult = sb.lgGrammarFormSubmit();
assert("编辑保存成功", editResult === true);
var edited = sb.DB.data.growth.language.langs.en.grammar.custom[0];
assert("编辑后 cat 已更新", edited.cat === "时态");
assert("编辑后 title 已更新", edited.title === "现在完成时（已编辑）");

// 删除
var before = sb.DB.data.growth.language.langs.en.grammar.custom.length;
sb.lgGrammarDel(addedId);
assert("删除后 custom 数组 -1",
  sb.DB.data.growth.language.langs.en.grammar.custom.length === before - 1);

var builtinBefore = sb.DB.data.growth.language.langs.en.grammar.builtin.length;
sb.lgGrammarDel("en-tense-01");
assert("删除不影响 builtin", sb.DB.data.growth.language.langs.en.grammar.builtin.length === builtinBefore);

// === 8. 搜索（中英文均支持） ===
sb.LG_GRAMMAR_SEARCH = "现在完成时";
sb.LG_GRAMMAR_VIEW = "list";
var searchHtml1 = sb.lgRenderGrammar("en");
assert("中文搜索「现在完成时」命中",
  searchHtml1.indexOf("完成时") >= 0);
sb.LG_GRAMMAR_SEARCH = "present";
var searchHtml2 = sb.lgRenderGrammar("en");
assert("英文搜索「present」命中（大小写不敏感）",
  /present/i.test(searchHtml2));
sb.LG_GRAMMAR_SEARCH = "HOW ARE";
var searchHtml3 = sb.lgRenderGrammar("en");
assert("英文搜索大小写不敏感（HOW ARE → how）",
  /how/i.test(searchHtml3));
sb.LG_GRAMMAR_SEARCH = "不存在的语法 xyz";
var emptyHtml = sb.lgRenderGrammar("en");
assert("搜索无结果显示空态",
  emptyHtml.indexOf("没有匹配") >= 0);
sb.LG_GRAMMAR_SEARCH = "";

// === 9. lgGrammarHighlightEn 高亮 ===
var hi = sb.lgGrammarHighlightEn("I have done it.", ["have", "done"]);
assert("highlight 包含 hi 包装", /lg-grammar-hi/.test(hi));
assert("highlight 高亮 have",
  hi.indexOf("have") >= 0 && /<span class="lg-grammar-hi">have<\/span>/.test(hi));
assert("highlight 高亮 done",
  /<span class="lg-grammar-hi">done<\/span>/.test(hi));
assert("highlight 未高亮 it（不在 hi 数组）",
  !/<span class="lg-grammar-hi">it<\/span>/.test(hi));

// === 10. lgNormalizeLang 补齐 grammar ===
sb.DB.data.growth.language.langs.en.grammar = null;
var reGet = sb.langGet("en");
assert("lgNormalizeLang 补齐 null → 完整对象",
  reGet && Array.isArray(reGet.grammar.builtin) && Array.isArray(reGet.grammar.custom) && typeof reGet.grammar.customSeen === "object");
sb.DB.data.growth.language.langs.en.grammar = { builtin: null };
var reGet2 = sb.langGet("en");
assert("lgNormalizeLang 补齐 builtin=null → []",
  Array.isArray(reGet2.grammar.builtin) && reGet2.grammar.builtin.length === 0);
sb.DB.data.growth.language.langs.en.grammar = { customSeen: 0 };
var reGet3 = sb.langGet("en");
assert("lgNormalizeLang 把 customSeen=0 规整为 object",
  typeof reGet3.grammar.customSeen === "object");

// === 11. CSS（新版 UI 对齐听力） ===
const cssClasses = [
  ".lg-grammar-head", ".lg-grammar-head-title", ".lg-grammar-head-meta",
  ".lg-grammar-chip", ".lg-grammar-prog-bar", ".lg-grammar-prog-fill",
  ".lg-grammar-toolbar", ".lg-grammar-search", ".lg-grammar-empty",
  ".lg-grammar-cat", ".lg-grammar-cat-h", ".lg-grammar-cat-toggle",
  ".lg-grammar-cat-name", ".lg-grammar-cat-count",
  ".lg-grammar-item", ".lg-grammar-tag.sys", ".lg-grammar-tag.my",
  ".lg-grammar-seen", ".lg-grammar-readonly",
  ".lg-grammar-item-main", ".lg-grammar-item-title", ".lg-grammar-item-desc", ".lg-grammar-item-meta",
  ".lg-grammar-ops", ".lg-btn.xs", ".lg-btn.danger", ".lg-btn.primary",
  ".lg-grammar-detail-top", ".lg-grammar-detail", ".lg-grammar-detail-cat",
  ".lg-grammar-detail-title", ".lg-grammar-detail-desc",
  ".lg-grammar-section-h", ".lg-grammar-notes",
  ".lg-grammar-examples", ".lg-grammar-ex",
  ".lg-grammar-ex-n", ".lg-grammar-ex-main", ".lg-grammar-ex-en",
  ".lg-grammar-speak", ".lg-grammar-ex-zh", ".lg-grammar-ex-note",
  ".lg-grammar-hi", ".lg-grammar-hi.cat-词性", ".lg-grammar-hi.cat-时态",
  ".lg-grammar-word.inbank", ".lg-grammar-foot"
];
cssClasses.forEach(function (cls) {
  assert("CSS 含 " + cls, CSS.indexOf(cls) >= 0);
});

// === 12. lgGrammarStats ===
var stats = sb.lgGrammarStats("en");
assert("lgGrammarStats 返回对象含 builtin/custom/seen",
  typeof stats.builtin === "number" && typeof stats.custom === "number" && typeof stats.seen === "number");

// === 13. 修复关键 bug：showModal 是裸字符串，不是配置对象 ===
assert("showModal 是裸字符串签名（不是配置对象）",
  /function\s+showModal\(\s*html\s*\)/.test(APP));
assert("lgGrammarShowForm 函数体内调用 showModal(html)（裸字符串）",
  /function\s+lgGrammarShowForm[\s\S]*?showModal\(html\)/.test(SRC));

// 反向验证：v5.9.172 的反模式（showModal({title,...})）已不再出现在 lgGrammar 模块
var lggStart = SRC.indexOf("/* =============================================================");
var lggEnd = SRC.indexOf("function lgGrammarStats");
var lggBody = lggStart >= 0 && lggEnd > lggStart ? SRC.slice(lggStart, lggEnd) : "";
assert("语法模块不再调用 showModal 配置对象形式",
  lggBody.indexOf("showModal({") < 0);

console.log("----");
console.log(fail === 0 ? "✅ 全部通过 —— 断言 " + pass + " 条" : "❌ 失败 " + fail + " / 通过 " + pass);
process.exit(fail === 0 ? 0 : 1);

// ============== helpers ==============
function makeSandbox() {
  const s = {
    console, setTimeout, clearTimeout, Date, Math, JSON,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: {
      getElementById: () => null, querySelector: () => null, addEventListener() {},
      createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, setAttribute() {}, appendChild() {} })
    },
    navigator: {}, location: { href: "" }
  };
  vm.createContext(s); s.window = s;
  s.DB = { data: { growth: { language: { langs: {}, curLang: "en" } } }, save() {} };
  s.showToast = function () {};
  s.showModal = function () {};
  s.closeModal = function () {};
  s.escapeHtml = require("./escape_helper.js");
  s.lgUid = function () { return Date.now().toString(36); };
  s.lgWordNormalize = function (x) { return String(x || "").toLowerCase().replace(/[']/g, ""); };
  s.render = function () {};
  s.confirm = function () { return true; };
  s.speechSynthesis = null;
  s.lgSpeak = function () {};
  return s;
}