// 语言学习 · 拼读实战 + 听辨训练 v5.9.125 测试
// 覆盖：
//   A) 题库扩展 (spelling_patterns.json ≥ 120, phoneme_pairs.json 每对 ≥ 5)
//   B) 错题持久化 + 复习模式入口 (localStorage 模拟)
//   C) dictation 模式 HTML 含「听音标(逐音)」按钮
//   D) ipa2word 模式 HTML 同时含「逐音读音标 + 听整词」按钮
//   E) 听辨训练错题持久化
//   F) 骨架修正 ch→chuh
// 用脚本：node tests/language_practice.test.js
const fs = require("fs");
const vm = require("vm");
const ROOT = "/Users/ichi/WorkBuddy/2026-07-30-21-36-02/pm-workbench-auto";

let pass = 0, fail = 0;
const results = [];
function t(name, ok, extra) {
  if (ok) { pass++; results.push("  ✅ " + name); }
  else { fail++; results.push("  ❌ " + name + (extra ? " :: " + extra : "")); }
}

// ========== A) 题库扩展 ==========
const SP = JSON.parse(fs.readFileSync(ROOT + "/data/spelling_patterns.json", "utf8"));
const PP = JSON.parse(fs.readFileSync(ROOT + "/data/phoneme_pairs.json", "utf8"));
const spWordCount = SP.patterns.reduce((a, p) => a + p.words.length, 0);
t("spelling_patterns ≥ 120 words (实际 " + spWordCount + ")", spWordCount >= 120);
t("spelling_patterns 含 short_vowel cat", !!SP.cats.find(c => c.id === "short_vowel"));
t("spelling_patterns 含 CVC patterns", SP.patterns.filter(p => p.cat === "short_vowel").length >= 3);

const allPairs = (PP.vowelPairs || []).concat(PP.consPairs || []);
const minGroupCount = Math.min.apply(null, allPairs.map(p => (p.pairs || []).length));
const avgGroupCount = allPairs.reduce((a, p) => a + (p.pairs || []).length, 0) / allPairs.length;
t("phoneme_pairs 每对 ≥ 5 组 (最少 " + minGroupCount + ", 平均 " + avgGroupCount.toFixed(1) + ")", minGroupCount >= 5);
t("phoneme_pairs 总组数 ≥ 100 (实际 " + allPairs.reduce((a, p) => a + (p.pairs || []).length, 0) + ")",
  allPairs.reduce((a, p) => a + (p.pairs || []).length, 0) >= 100);

// ========== F) 骨架修正 ch→chuh ==========
const PH = JSON.parse(fs.readFileSync(ROOT + "/data/phonetics.json", "utf8"));
const tch = (PH.vowels || []).concat(PH.consonants || []).find(p => p.symbol === "/tʃ/");
const dj  = (PH.vowels || []).concat(PH.consonants || []).find(p => p.symbol === "/dʒ/");
t("/tʃ/ 骨架 = chuh", tch && tch.speakText === "chuh", "actual:" + (tch && tch.speakText));
t("/dʒ/ 骨架 = juh", dj && dj.speakText === "juh", "actual:" + (dj && dj.speakText));

// ========== 加载沙箱测交互 ==========
const LANG = fs.readFileSync(ROOT + "/js/language.js", "utf8");
const SP2 = fs.readFileSync(ROOT + "/data/spelling_patterns.json", "utf8");
const PH2 = fs.readFileSync(ROOT + "/data/phonetics.json", "utf8");
const PP2 = fs.readFileSync(ROOT + "/data/phoneme_pairs.json", "utf8");

function mkSb() {
  const fakeEl = { innerHTML: "", querySelector: () => null, querySelectorAll: () => [], style: {}, value: "", classList: { add() {}, remove() {}, contains: () => false }, focus() {} };
  const containers = { "app-content": fakeEl };
  const sb = {
    console, Math, Date, JSON, Object, Array, String, Number, parseInt, parseFloat, isNaN,
    encodeURIComponent, decodeURIComponent,
    setTimeout: () => 0, setInterval: () => 0, clearInterval() {}, clearTimeout() {},
    today: () => "2026-09-12", APP_VERSION: "5.9.125", render() {}, showToast() {},
    escapeHtml: s => String(s == null ? "" : s),
    lgEscapeJs: s => String(s == null ? "" : s),
    document: { getElementById: id => containers[id] || fakeEl, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, hidden: false, readyState: "complete" },
    window: { addEventListener() {} },
    localStorage: (function () { const s = {}; return { getItem: k => k in s ? s[k] : null, setItem: (k, v) => { s[k] = String(v); }, removeItem: k => { delete s[k]; } }; })(),
    speechSynthesis: { getVoices: () => [], cancel() {}, speak() {}, paused: false, speaking: false, pending: false, resume() {}, onvoiceschanged: null },
    SpeechSynthesisUtterance: function (t) { this.text = t; },
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
    DB: { data: {}, logActivity() {}, save() {} },
    confirm: () => true
  };
  sb.window = sb;
  vm.createContext(sb);
  return sb;
}

function loadModule(sb) {
  vm.runInContext(LANG, sb);
  sb.__lgPhonetics = JSON.parse(PH2);
  sb.lgPairs = JSON.parse(PP2);
  sb.lgSpell = JSON.parse(SP2);
}

// ========== B) 错题持久化 ==========
{
  const sb = mkSb(); loadModule(sb);
  vm.runInContext('lgPracMissLoad(); lgPracMissClear()', sb); // baseline
  vm.runInContext('lgPracStart("ipa2word")', sb);
  vm.runInContext('lgPrac = { mode: "ipa2word", idx: 0, correct: 0, answered: false, wrongs: [], reviewOnly: false, round: [{w:"test",ipa:"/test/",zh:"测试",src:"x"}] }', sb);
  vm.runInContext('lgPracAnswer("ipa2word","wrong")', sb);
  const c1 = vm.runInContext("lgPracMissCount()", sb);
  t("错题池持久化：答错 1 题后 count=1", c1 === 1, "actual=" + c1);
  // 验证 localStorage 真有数据
  const stored = sb.localStorage.getItem("lgPhonPracMiss_v1");
  t("localStorage lgPhonPracMiss_v1 已写入", !!stored && stored.indexOf("test") >= 0);
  // 答对自动移除（复习模式）
  vm.runInContext('lgPrac = { mode: "ipa2word", idx: 0, correct: 0, answered: false, wrongs: [], reviewOnly: true, round: [{w:"test",ipa:"/test/",zh:"测试",src:"x"}] }', sb);
  vm.runInContext('lgPracAnswer("ipa2word","test")', sb);
  const c2 = vm.runInContext("lgPracMissCount()", sb);
  t("复习模式答对自动移除 (count=0)", c2 === 0, "actual=" + c2);
  // 多模式汇总
  vm.runInContext('lgPrac = { mode: "word2ipa", idx: 0, correct: 0, answered: false, wrongs: [], reviewOnly: false, round: [{w:"a",ipa:"/a/",zh:"a",src:"x"}] }', sb);
  vm.runInContext('lgPracAnswer("word2ipa","b")', sb);
  vm.runInContext('lgPrac = { mode: "dictation", idx: 0, correct: 0, answered: false, wrongs: [], reviewOnly: false, round: [{w:"c",ipa:"/c/",zh:"c",src:"x"}] }', sb);
  vm.runInContext('lgPracType("dictation")', sb); // 空输入，错
  const c3 = vm.runInContext("lgPracMissCount()", sb);
  t("跨模式错题汇总 (count=2)", c3 === 2, "actual=" + c3);
}

// ========== 复习模式入口 ==========
{
  const sb = mkSb(); loadModule(sb);
  vm.runInContext('lgPracMissLoad(); lgPracMissClear()', sb);
  // 直接往错题池塞几条数据
  vm.runInContext(`lgPracMissAdd("ipa2word",{w:"a",ipa:"/a/",zh:"a",src:"x"});
                   lgPracMissAdd("ipa2word",{w:"b",ipa:"/b/",zh:"b",src:"x"});
                   lgPracMissAdd("dictation",{w:"c",ipa:"/c/",zh:"c",src:"x"});`, sb);
  // 首页应显示「📝 复习错题 (3)」
  const home = vm.runInContext('lgPhonPracHome()', sb);
  t("首页显示「📝 复习错题 (3)」", home.indexOf("复习错题") >= 0 && home.indexOf("(3)") >= 0);
  // 各模式卡显示错题数
  t("首页模式卡显示 ipa2word 错题数", home.indexOf("错 2") >= 0);
  t("首页模式卡显示 dictation 错题数", home.indexOf("错 1") >= 0);
  // 复习首页
  const review = vm.runInContext('lgPracReviewHome()', sb);
  t("复习首页入口存在", review.indexOf("复习错题") >= 0 && review.indexOf("清空错题") >= 0);
  // 进入复习模式只抽错题
  vm.runInContext('lgPracStart("ipa2word",{reviewOnly:true})', sb);
  const round = vm.runInContext('JSON.stringify(lgPrac.round.map(function(q){return q.w}))', sb);
  t("复习模式 round 只含错题 (w in [a,b])", round === '["a","b"]' || round === '["b","a"]', "actual=" + round);
  // lgPracReviewHome 空错题不报错
  vm.runInContext('lgPracMissClear()', sb);
  const review2 = vm.runInContext('lgPhonPracHome()', sb);
  t("无错题时首页不显示「复习错题」按钮", review2.indexOf("复习错题") < 0);
}

// ========== E) 听辨训练错题 ==========
{
  const sb = mkSb(); loadModule(sb);
  vm.runInContext('lgPairMissLoadAll(); for (var k in lgPairMissBank) delete lgPairMissBank[k]; lgPairMissSaveAll()', sb);
  // 加入一对错题
  vm.runInContext('lgPairMissAdd("i_ɪ","sheep","ship"); lgPairMissAdd("i_ɪ","seat","sit")', sb);
  const stored = sb.localStorage.getItem("lgPhonPairMiss_v1");
  t("听辨错题持久化到 localStorage", !!stored && stored.indexOf("sheep") >= 0);
  // 训练页进入应先做错题
  const html = vm.runInContext('lgPhonPairTrain("i_ɪ")', sb);
  t("听辨训练页渲染", html && html.indexOf("听辨训练") >= 0);
}

// ========== C) dictation 模式含逐音按钮 ==========
{
  const sb = mkSb(); loadModule(sb);
  vm.runInContext(`lgPrac = { mode: "dictation", idx: 0, correct: 0, answered: false, wrongs: [], reviewOnly: false, round: [{w:"cake",ipa:"/keɪk/",zh:"蛋糕",src:"a_e"}] }; lgPhonView = "prac:dictation"`, sb);
  const html = vm.runInContext('lgPhonPracPlay("dictation")', sb);
  t("dictation 模式含「🔊 听音标（逐音）」按钮", html.indexOf("听音标（逐音）") >= 0 || html.indexOf("听音标(逐音)") >= 0, "html=" + (html || "").slice(0, 300));
  t("dictation 模式保留「🔊 再听一次」单词 TTS", html.indexOf("再听一次") >= 0);
}

// ========== D) ipa2word 含两按钮 ==========
{
  const sb = mkSb(); loadModule(sb);
  vm.runInContext(`lgPrac = { mode: "ipa2word", idx: 0, correct: 0, answered: false, wrongs: [], reviewOnly: false, round: [{w:"cake",ipa:"/keɪk/",zh:"蛋糕",src:"a_e"}] }; lgPhonView = "prac:ipa2word"`, sb);
  const html = vm.runInContext('lgPhonPracPlay("ipa2word")', sb);
  t("ipa2word 含「🔊 逐音读音标」按钮", html.indexOf("逐音读音标") >= 0, "snippet:" + html.slice(0, 250));
  t("ipa2word 含「🔊 听整词」按钮", html.indexOf("听整词") >= 0);
}

// ========== 输出 ==========
console.log(results.join("\n"));
console.log("\n" + (fail === 0 ? "✅ 全部通过" : "❌ " + fail + " 项失败") + " · 通过 " + pass);
process.exit(fail === 0 ? 0 : 1);