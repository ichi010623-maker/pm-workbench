// Pronunciation 学习路径升级测试（Phase 1 字母 + Phase 2 听辨）
// 运行：node tests/phon_path.test.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log("  ✓ " + msg); } else { fail++; console.log("  ✗ " + msg); } }
function section(t) { console.log("\n▶ " + t); }

// ============ 数据文件校验 ============
section("A. data/letters.json（Phase 1）");
{
  const l = JSON.parse(fs.readFileSync(path.join(ROOT, "data/letters.json"), "utf8"));
  ok(l.letters && l.letters.length === 26, "26 个字母");
  const a = l.letters.find(x => x.ch === "A");
  ok(!!a && a.name === "/eɪ/", "A 字母名 /eɪ/");
  ok(!!a && a.sounds.length >= 2 && a.sounds[0].ipa === "/æ/" && a.sounds[0].word === "apple", "A 含 /æ/ apple");
  const e = l.letters.find(x => x.ch === "E");
  ok(!!e && e.name === "/iː/" && e.sounds[0].ipa === "/e/", "E 字母名 /iː/ 但首音 /e/（印证 Name≠Sound）");
  const z = l.letters.find(x => x.ch === "Z");
  ok(!!z && z.sounds[0].ipa === "/z/", "Z 有发音");
  // 每个字母至少 1 个 sound，name 格式 /.../
  const bad = l.letters.filter(x => !x.sounds.length || !/^\//.test(x.name));
  ok(bad.length === 0, "每个字母都有 sounds 且 name 为 IPA 格式");
}

section("B. data/phoneme_pairs.json（Phase 2 Minimal Pairs）");
{
  const p = JSON.parse(fs.readFileSync(path.join(ROOT, "data/phoneme_pairs.json"), "utf8"));
  ok(p.vowelPairs && p.vowelPairs.length >= 8, "元音 Pair ≥ 8 组");
  ok(p.consPairs && p.consPairs.length >= 8, "辅音清浊 Pair ≥ 8 组");
  const i = p.vowelPairs.find(x => x.id === "i_ɪ");
  ok(!!i && i.a === "/iː/" && i.b === "/ɪ/" && i.aWord === "sheep" && i.bWord === "ship", "核心 iː/ɪ sheep/ship 存在");
  ok(i.pairs.some(pr => pr[0] === "sheep" && pr[1] === "ship"), "sheep/ship 词对存在");
  // level 覆盖 L1-L4
  const lvs = new Set(p.vowelPairs.map(x => x.level));
  ok(lvs.has("L1") && lvs.has("L2") && lvs.has("L3") && lvs.has("L4"), "Level 1-4 全覆盖");
}

// ============ vm 渲染测试 ============
function mkSandbox() {
  const fakeEl = { innerHTML: "", querySelector: () => null, querySelectorAll: () => [], style: {}, value: "", classList: { add() {}, remove() {}, contains: () => false } };
  const sb = {
    console,
    document: { getElementById: () => fakeEl, querySelector: () => null, querySelectorAll: () => [] },
    window: {}, escapeHtml: s => (s == null ? "" : String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")),
    showModal() {}, closeModal() {}, showToast() {}, navigate() {}, render() {},
    today: () => "2026-09-02", uid: () => "id1",
    DB: { data: {}, save() {}, logActivity() {} },
    speechSynthesis: { cancel() {}, getVoices() { return [{ lang: "en-US" }]; }, speak() {}, onvoiceschanged: null },
    lgEscapeJs: s => String(s).replace(/'/g, "\\'"),
    lgPhonSpeak() {},
    Math, Date, JSON, Object, Array, String, Number, parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent,
    fetch: (u) => Promise.resolve({ json: () => { const f = u.split("?")[0]; const file = f.replace("data/", "").replace(".json", ""); return Promise.resolve(sb.__data[file]); } }),
    localStorage: (function () { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; })()
  };
  sb.window = sb;
  sb.__data = {
    "letters": JSON.parse(fs.readFileSync(path.join(ROOT, "data/letters.json"), "utf8")),
    "phoneme_pairs": JSON.parse(fs.readFileSync(path.join(ROOT, "data/phoneme_pairs.json"), "utf8")),
    "phonetics": JSON.parse(fs.readFileSync(path.join(ROOT, "data/phonetics.json"), "utf8"))
  };
  vm.createContext(sb);
  return sb;
}

section("C. 视图分发与渲染");
{
  const sb = mkSandbox();
  const src = fs.readFileSync(path.join(ROOT, "js/language.js"), "utf8");
  vm.runInContext(src, sb, { filename: "language.js" });
  // 同步预置数据（避免 fetch 异步时序）
  sb.__lgPhonetics = sb.__data["phonetics"];
  sb.lgLetters = sb.__data["letters"];
  sb.lgPairs = sb.__data["phoneme_pairs"];
  vm.runInContext("__lgPhonetics = __data['phonetics']; lgLetters = __data['letters']; lgPairs = __data['phoneme_pairs'];", sb);

  // 1) path 主页（lgPhonView=null）
  const pathHtml = vm.runInContext("lgPhonView=null;lgRenderPhonics('en')", sb);
  ok(typeof pathHtml === "string" && pathHtml.length > 0, "路径主页渲染出 HTML");
  ok(pathHtml.indexOf("Pronunciation") >= 0, "主页含 Pronunciation 标题");
  ok(pathHtml.indexOf("字母与声音基础") >= 0, "主页含 Phase 1 卡");
  ok(pathHtml.indexOf("Minimal Pairs") >= 0 || pathHtml.indexOf("最小对立对") >= 0, "主页含 Phase 2 听辨卡");
  ok(pathHtml.indexOf("🔒") >= 0, "Phase 4/5 显示锁定");

  // 2) 字母页
  const ltrHtml = vm.runInContext("lgPhonView='letters';lgRenderPhonics('en')", sb);
  ok(ltrHtml.indexOf(">A<") >= 0 || ltrHtml.indexOf(">A</") >= 0 || (ltrHtml.indexOf("A") >= 0 && ltrHtml.indexOf("Z") >= 0), "字母页含 A-Z");
  ok(ltrHtml.indexOf("/eɪ/") >= 0, "字母页含字母名 IPA");

  // 3) 字母详情（关键：Letter Name ≠ Sound 提示）
  const det = vm.runInContext("lgPhonView='letter:A';lgRenderPhonics('en')", sb);
  ok(det.indexOf("Letter Name") >= 0 && det.indexOf("Letter Sound") >= 0, "详情含 Letter Name/Sound 区块");
  ok(det.indexOf("≠") >= 0, "含 Name ≠ Sound 核心提示");
  ok(det.indexOf("/æ/") >= 0 && det.indexOf("apple") >= 0, "A 的常见发音 /æ/ apple 展示");
  ok(det.indexOf("下一个") >= 0, "有「下一个」导航");

  // 4) Pairs 页
  const pr = vm.runInContext("lgPhonView='pairs';lgRenderPhonics('en')", sb);
  ok(pr.indexOf("sheep") >= 0 && pr.indexOf("ship") >= 0, "Pairs 页含 sheep/ship");
  ok(pr.indexOf("Level 1") >= 0, "Pairs 页按 Level 分组");
}

section("D. 听辨训练逻辑");
{
  const sb = mkSandbox();
  const src = fs.readFileSync(path.join(ROOT, "js/language.js"), "utf8");
  vm.runInContext(src, sb, { filename: "language.js" });
  sb.__lgPhonetics = sb.__data["phonetics"];
  sb.lgLetters = sb.__data["letters"];
  sb.lgPairs = sb.__data["phoneme_pairs"];
  vm.runInContext("__lgPhonetics = __data['phonetics']; lgPairs = __data['phoneme_pairs']; lgPhonView='pair:i_ɪ';", sb);
  const train = vm.runInContext("lgRenderPhonics('en')", sb);
  ok(train.indexOf("你听到的是") >= 0, "训练器含听辨问题");
  ok(train.indexOf("🔊 听发音") >= 0, "训练器含听发音按钮");
  ok(train.indexOf("/iː/") >= 0 && train.indexOf("/ɪ/") >= 0, "训练器含两个选项音标");
  ok(train.indexOf("Accuracy") >= 0, "含 Accuracy 统计");

  // 判题逻辑：手动置 right 后调 lgPairAnswer 校验
  vm.runInContext("lgPairState.i_ɪ = { idx:0, correct:0, total:0, answered:false, _rightIsA:true }; lgPairAnswer('i_ɪ','A')", sb);
  const st = vm.runInContext("lgPairState.i_ɪ", sb);
  ok(st.total === 1 && st.correct === 1 && st.answered === true, "答对：total=1 correct=1");
  // 答错用例：需先重置 answered（模拟点过「下一个」后的新题）
  vm.runInContext("lgPairState.i_ɪ.answered=false; lgPairState.i_ɪ._rightIsA=false; lgPairAnswer('i_ɪ','A')", sb);
  const st2 = vm.runInContext("lgPairState.i_ɪ", sb);
  ok(st2.total === 2 && st2.correct === 1, "答错：total=2 correct=1");

  // 下一题轮转
  vm.runInContext("lgPairNext('i_ɪ')", sb);
  const st3 = vm.runInContext("lgPairState.i_ɪ", sb);
  ok(st3.answered === false, "lgPairNext 重置 answered");
}

console.log("\n========================================");
console.log("Pronunciation 路径测试：通过 " + pass + " / 失败 " + fail);
console.log("========================================");
process.exit(fail > 0 ? 1 : 0);
