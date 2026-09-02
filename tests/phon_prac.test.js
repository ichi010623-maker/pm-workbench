// Phase 5 · 拼读实战（4 种训练模式）测试
// 运行：node tests/phon_prac.test.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log("  ✓ " + msg); } else { fail++; console.log("  ✗ " + msg); } }
function section(t) { console.log("\n▶ " + t); }

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
    "spelling_patterns": JSON.parse(fs.readFileSync(path.join(ROOT, "data/spelling_patterns.json"), "utf8")),
    "phonetics": JSON.parse(fs.readFileSync(path.join(ROOT, "data/phonetics.json"), "utf8"))
  };
  vm.createContext(sb);
  return sb;
}

function setup(sb) {
  const src = fs.readFileSync(path.join(ROOT, "js/language.js"), "utf8");
  vm.runInContext(src, sb, { filename: "language.js" });
  sb.__lgPhonetics = sb.__data["phonetics"];
  sb.lgLetters = sb.__data["letters"];
  sb.lgPairs = sb.__data["phoneme_pairs"];
  sb.lgSpell = sb.__data["spelling_patterns"];
  vm.runInContext("__lgPhonetics = __data['phonetics']; lgLetters = __data['letters']; lgPairs = __data['phoneme_pairs']; lgSpell = __data['spelling_patterns'];", sb);
}

// ============ A. 词库汇聚 ============
section("A. lgPracBank 词库汇聚");
{
  const sb = mkSandbox();
  setup(sb);
  const bank = vm.runInContext("lgPracBank()", sb);
  ok(bank.length === 51, "词库 = 51 个去重拼读词（实际 " + bank.length + "）");
  const hasCake = bank.some(x => x.w === "cake" && x.ipa === "/keɪk/");
  ok(hasCake, "含 cake /keɪk/（整词 IPA）");
  const hasSee = bank.some(x => x.w === "see" && x.ipa === "/siː/");
  ok(hasSee, "含 see /siː/（ee pattern 整词 IPA）");
  // 词库去重
  const words = new Set(bank.map(x => x.w));
  ok(words.size === bank.length, "词库无重复词");
  // 每题正确值唯一性：同音词（see/sea 均 /siː/）不影响判题——选项按值去重，听写答案相同
  const dupIpa = bank.filter(x => bank.filter(y => y.ipa === x.ipa).length > 1).map(x => x.ipa);
  const homophoneOnly = dupIpa.every(v => v === "/siː/");
  ok(homophoneOnly, "除同音词 see/sea 外无 IPA 冲突（唯一歧义即听写同答案，可接受）");
}

// ============ B. 模式主页 ============
section("B. prac 视图（模式主页）");
{
  const sb = mkSandbox();
  setup(sb);
  vm.runInContext("lgPhonView='prac';", sb);
  const html = vm.runInContext("lgRenderPhonics('en')", sb);
  ok(html.indexOf("拼读实战") >= 0, "含 Phase 5 标题");
  ok(html.indexOf("音标 → 单词") >= 0, "模式① 音标→单词");
  ok(html.indexOf("单词 → 音标") >= 0, "模式② 单词→音标");
  ok(html.indexOf("听音 → 单词") >= 0, "模式③ 听音→单词");
  ok(html.indexOf("听音 → 写音标") >= 0, "模式④ 听音→写音标");
}

// ============ C. 模式启动 + 渲染 ============
section("C. 训练题渲染");
{
  const sb = mkSandbox();
  setup(sb);
  vm.runInContext("lgPhonView='prac:ipa2word';lgPracStart('ipa2word');", sb);
  const h1 = vm.runInContext("lgRenderPhonics('en')", sb);
  ok(h1.indexOf("这个音标读什么") >= 0, "模式① 题干含音标提问");
  ok(h1.indexOf("phon-prac-opts") >= 0 && h1.indexOf("phon-train-opt") >= 0, "模式① 含 4 选项按钮");
  ok((h1.match(/phon-train-opt/g) || []).length === 4, "模式① 恰好 4 个选项");

  vm.runInContext("lgPhonView='prac:sound2word';lgPracStart('sound2word');", sb);
  const h3 = vm.runInContext("lgRenderPhonics('en')", sb);
  ok(h3.indexOf("你听到的是哪个单词") >= 0 && h3.indexOf("🔊 听发音") >= 0, "模式③ 含听音按钮");

  vm.runInContext("lgPhonView='prac:dictation';lgPracStart('dictation');", sb);
  const h4 = vm.runInContext("lgRenderPhonics('en')", sb);
  ok(h4.indexOf("phonPracIn") >= 0, "模式④ 含音标输入框");
  ok(h4.indexOf("phon-prac-pad") >= 0 && h4.indexOf("θ") >= 0 && h4.indexOf("ŋ") >= 0, "模式④ 含 IPA 符号面板（θ/ŋ 等）");
}

// ============ D. 判题与统计 ============
section("D. 判题 + 持久化统计");
{
  const sb = mkSandbox();
  setup(sb);
  // 启动模式① 并渲染一次（渲染会记录该题 _rightVal/_opts）
  vm.runInContext("lgPracStart('ipa2word'); lgPhonView='prac:ipa2word';", sb);
  vm.runInContext("lgRenderPhonics('en')", sb);
  const q = vm.runInContext("lgPrac.round[0]", sb);
  const rightVal = vm.runInContext("lgPrac._rightVal", sb);
  ok(!!rightVal && rightVal === q.w, "状态记录当前题正确答案（词）");
  // 答对：用 _rightVal 作答
  vm.runInContext("lgPracAnswer('ipa2word', lgPrac._rightVal)", sb);
  const st1 = vm.runInContext("lgPrac", sb);
  ok(st1.answered === true && st1.lastOk === true && st1.correct === 1, "答对 → correct=1 lastOk=true");
  const acc = vm.runInContext("lgPracAcc('ipa2word')", sb);
  ok(acc === 100, "Accuracy 100%");
  // 答错：下一题，选一个非正确值
  vm.runInContext("lgPracNext('ipa2word');", sb);
  vm.runInContext("lgRenderPhonics('en')", sb); // 重渲染刷新 _opts
  const wrongVal = vm.runInContext("lgPrac._opts.filter(function(v){return v !== lgPrac._rightVal;})[0]", sb);
  vm.runInContext("lgPracAnswer('ipa2word', " + JSON.stringify(wrongVal) + ")", sb);
  const st2 = vm.runInContext("lgPrac", sb);
  ok(st2.lastOk === false && st2.correct === 1 && st2.wrongs.length === 1, "答错 → correct 不变 + 记入 wrongs");

  // 打字模式判题：先正确
  vm.runInContext("lgPracStart('dictation');", sb);
  const expectIpa = vm.runInContext("lgPrac.round[0].ipa", sb);
  sb.document.getElementById = () => ({ value: expectIpa, focus() {} });
  vm.runInContext("lgPracType('dictation')", sb);
  const st3 = vm.runInContext("lgPrac", sb);
  ok(st3.lastOk === true, "打字模式：输入正确音标判对");

  // 打字判错：只输入前半段 → 判错
  vm.runInContext("lgPracNext('dictation');", sb);
  vm.runInContext("lgPrac._opts=[];", sb); // 无关清理
  sb.document.getElementById = () => ({ value: "/keɪ/", focus() {} });
  vm.runInContext("lgPracType('dictation')", sb);
  const st4 = vm.runInContext("lgPrac", sb);
  ok(st4.lastOk === false, "打字模式：残缺音标判错");

  // 统计持久化
  const stored = sb.localStorage.getItem("lgPhonPracStats");
  ok(stored && stored.indexOf("ipa2word") >= 0 && stored.indexOf("dictation") >= 0, "lgPhonPracStats 持久化两类目");
}

// ============ E. 路径主页 Phase 5 解锁 ============
section("E. 路径主页 Phase 5 解锁");
{
  const sb = mkSandbox();
  setup(sb);
  vm.runInContext("lgPhonView=null;", sb);
  const html = vm.runInContext("lgRenderPhonics('en')", sb);
  ok(html.indexOf("lgPhonView='prac'") >= 0, "Phase 5 卡 onClick 路由到 prac");
  ok(html.indexOf("🔒") < 0, "5 个 Phase 全部解锁（无锁）");
  // 进度显示：做完 2 个模式后 Phase 5 显示 2/4
  vm.runInContext("lgPracStats = { ipa2word: {n:10,c:8}, word2ipa: {n:10,c:7} };", sb);
  const html2 = vm.runInContext("lgRenderPhonics('en')", sb);
  ok(html2.indexOf("2/4") >= 0, "Phase 5 进度显示 2/4 模式");
}

console.log("\n========================================");
console.log("Phase 5 拼读实战测试：通过 " + pass + " / 失败 " + fail);
console.log("========================================");
process.exit(fail > 0 ? 1 : 0);