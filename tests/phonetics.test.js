// 音标发音修复测试：验证汇总页的 🔊 朗读的是 phonetics.json 的 speakText（音素本身），
// 而不是 examples[0][0]（含前后辅音的例词）。
// 运行：node tests/phonetics.test.js
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const phonData = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "phonetics.json"), "utf8"));

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error("  ✗ " + msg); } }
function section(name) { console.log("\n▶ " + name); }

(async function () {
  section("A. 数据完整性：每个音标都有 speakText");
  ok(phonData.vowels.length === 20, "20 个元音");
  ok(phonData.consonants.length === 24, "24 个辅音");
  const all = phonData.vowels.concat(phonData.consonants);
  const noSpeak = all.filter(p => !p.speakText);
  ok(noSpeak.length === 0, "44 个音标全部含 speakText（缺失 " + noSpeak.length + "）");

  section("B. speakText 是单音节骨架词（≤4 字符），不再误传多音节例词");
  const leaks = all.filter(p => {
    const ex = p.examples && p.examples[0] && p.examples[0][0];
    // 反向断言修复目的：避免传整词（含前后辅音污染）作为音素朗读。骨架词 / 单音节纯净词（如 "ee"/"th"/"air"）允许
    return ex && p.speakText && ex.length > 4 && p.speakText.toLowerCase() === ex.toLowerCase();
  });
  ok(leaks.length === 0, "无 speakText 仍指回长例词的条目（命中 " + leaks.length + " 个，应为 0）");
  const longSpeaks = all.filter(p => p.speakText && p.speakText.length > 4);
  ok(longSpeaks.length === 0, "所有 speakText ≤4 字符（命中 " + longSpeaks.length + " 个长词，应为 0）");

  section("C. 关键音标 speakText 正确（修复 case）");
  const bySymbol = {};
  all.forEach(p => { bySymbol[p.symbol] = p; });
  ok(bySymbol["/iː/"].speakText === "ee", "/iː/ → ee（之前是 see，会带 /s/）");
  ok(bySymbol["/ɪ/"].speakText === "ih", "/ɪ/ → ih（短元音）");
  ok(bySymbol["/e/"].speakText === "eh", "/e/ → eh（之前是 bed，会带 /b//d/）");
  ok(bySymbol["/p/"].speakText === "puh", "/p/ → puh（清辅音骨架）");
  ok(bySymbol["/b/"].speakText === "buh", "/b/ → buh（浊辅音骨架）");
  ok(bySymbol["/θ/"].speakText === "th", "/θ/ → th（TTS 多读 /θ/）");
  ok(bySymbol["/ʃ/"].speakText === "sh", "/ʃ/ → sh");
  ok(bySymbol["/ʒ/"].speakText === "zh", "/ʒ/ → zh");
  ok(bySymbol["/tʃ/"].speakText === "ch", "/tʃ/ → ch");
  ok(bySymbol["/ŋ/"].speakText === "ng", "/ŋ/ → ng");

  section("D. 汇总页 HTML onclick 朗读 speakText");
  // 模拟 lgPhonSummaryCell 的产出
  const Sandbox = require("vm");
  const src = fs.readFileSync(path.join(ROOT, "js", "language.js"), "utf8");
  const fakeEl = { innerHTML: "", querySelector: () => null, querySelectorAll: () => [], classList: { add() {}, remove() {}, contains: () => false } };
  const sb = {
    DB: { data: {}, save() {}, logActivity() {} },
    document: { getElementById: () => fakeEl, querySelector: () => null, querySelectorAll: () => [] },
    window: {},
    escapeHtml: s => (s == null ? "" : String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")),
    showModal() {}, closeModal() {}, showToast() {}, navigate() {}, render() {}, confirm() { return true; },
    formatDateShort() { return ""; }, today: () => "2026-09-02",
    console, encodeURIComponent, decodeURIComponent, Math, Date, JSON, Object, Array, String, Number, parseInt, parseFloat, isNaN,
    localStorage: (function () { var m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; })()
  };
  Sandbox.createContext(sb);
  Sandbox.runInContext(src, sb);
  // 注入音标数据
  sb.__lgPhonetics = phonData;
  sb.lgPhonRegion = "US";
  const { lgPhonSummaryCell } = sb;
  // 抽 5 个关键音标检查 onclick 字符串
  const samples = ["/iː/", "/ɪ/", "/e/", "/p/", "/θ/"];
  samples.forEach(sym => {
    const p = bySymbol[sym];
    const html = lgPhonSummaryCell(p, "US");
    const expectedText = p.speakText.replace(/'/g, "\\'");
    ok(html.indexOf("lgPhonSpeak('" + expectedText + "','US')") >= 0, sym + " 汇总页 onclick 朗读 " + p.speakText);
    // 反向断言：不应该再朗读 examples[0][0]
    const ex = p.examples && p.examples[0] && p.examples[0][0];
    if (ex && ex.toLowerCase() !== p.speakText.toLowerCase()) {
      ok(html.indexOf("lgPhonSpeak('" + ex + "',") === -1, sym + " 汇总页不再朗读例词 " + ex);
    }
  });

  section("E. 详情页例词按钮仍读例词（行为未破坏）");
  // 详情页 lgPhonExamplesHtml / lgPhonCombosHtml 走的是单词路径，rate 0.8，不应受影响
  const { lgPhonExamplesHtml, lgPhonCombosHtml } = sb;
  const p1 = bySymbol["/iː/"];
  const ex1 = p1.examples[0][0];
  ok(lgPhonExamplesHtml(p1.examples, "US").indexOf("lgPhonSpeak('" + ex1 + "','US')") >= 0, "/iː/ 详情页第一个例词 " + ex1 + " 按钮仍朗读该词");
  const c1 = p1.combos[0];
  ok(lgPhonCombosHtml([c1], "US").indexOf("lgPhonSpeak('" + c1.words[0][0] + "','US')") >= 0, "/iː/ 字母组合 " + c1.letters + " 按钮仍朗读组合词 " + c1.words[0][0]);

  console.log("\n=== 音标发音修复 测试完成 ===");
  console.log("通过 " + pass + " / 失败 " + fail);
  if (fail > 0) process.exit(1);
})();