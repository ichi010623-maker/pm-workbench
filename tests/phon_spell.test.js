// Phase 4 · 自然拼读 Phonics × Spelling（Pattern → Sound → Word）测试
// 运行：node tests/phon_spell.test.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log("  ✓ " + msg); } else { fail++; console.log("  ✗ " + msg); } }
function section(t) { console.log("\n▶ " + t); }

// ============ A. 数据完整性 ============
section("A. data/spelling_patterns.json");
{
  const s = JSON.parse(fs.readFileSync(path.join(ROOT, "data/spelling_patterns.json"), "utf8"));
  ok(s.patterns && s.patterns.length >= 12, "Pattern ≥ 12 组");
  ok(s.cats && s.cats.length === 3, "3 大分类（Magic E / 元音组合 / 辅音组合）");

  // cake 拆解验证（用户规格核心示例）
  const ae = s.patterns.find(x => x.id === "a_e");
  ok(ae && ae.pattern === "a_e" && ae.sound === "/eɪ/", "a_e → /eɪ/ 存在");
  const cake = ae && ae.words.find(w => w.w === "cake");
  ok(!!cake && cake.ipa === "/keɪk/" && cake.zh === "蛋糕", "cake → /keɪk/ 蛋糕");
  ok(!!cake && cake.parts.length === 4 &&
    cake.parts[0][0] === "c" && cake.parts[0][1] === "/k/" &&
    cake.parts[1][0] === "a" && cake.parts[1][1] === "/eɪ/" &&
    cake.parts[2][0] === "k" && cake.parts[2][1] === "/k/" &&
    cake.parts[3][0] === "e" && cake.parts[3][1] === "∅",
    "cake 拆解 C/k/ + A/eɪ/ + K/k/ + E/∅（用户规格逐字母）");

  // 每 pattern ≥3 词、每词含 ipa/zh/parts
  const bad = s.patterns.filter(p => !p.rule || !p.sound || !p.pattern || !p.cat || (p.words || []).length < 3);
  ok(bad.length === 0, "每个 pattern 都有规律说明 + ≥3 个例词");
  const badW = [];
  s.patterns.forEach(p => (p.words || []).forEach(w => {
    if (!w.w || !w.ipa || !w.zh || !w.parts || !w.parts.length) badW.push(w.w || "?");
  }));
  ok(badW.length === 0, "每个词都有 ipa/zh/逐字母拆解 parts");

  // 分类覆盖
  const cset = new Set(s.patterns.map(p => p.cat));
  ok(cset.has("magic_e") && cset.has("vowel_team") && cset.has("cons_team"), "三类 pattern 全覆盖");
  // 关键 pattern 抽查
  ok(s.patterns.some(p => p.id === "sh" && p.sound === "/ʃ/"), "sh → /ʃ/");
  ok(s.patterns.some(p => p.id === "igh" && p.sound === "/aɪ/"), "igh → /aɪ/");
  ok(s.patterns.some(p => p.id === "ee" && p.sound === "/iː/"), "ee → /iː/");
}

// ============ vm 渲染 ============
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

// ============ B. Pattern 列表页 ============
section("B. spell 视图（Pattern 列表）");
{
  const sb = mkSandbox();
  setup(sb);
  vm.runInContext("lgPhonView='spell';", sb);
  const html = vm.runInContext("lgRenderPhonics('en')", sb);
  ok(typeof html === "string" && html.length > 0, "spell 视图渲染出 HTML");
  ok(html.indexOf("自然拼读") >= 0, "含 Phase 4 标题");
  ok(html.indexOf("Magic E") >= 0, "含 Magic E 分类");
  ok(html.indexOf("a_e") >= 0 && html.indexOf("/eɪ/") >= 0, "含 a_e → /eɪ/");
  ok(html.indexOf("cake") >= 0 && html.indexOf("make") >= 0, "含 a_e 例词 cake/make");
  ok(html.indexOf("sh") >= 0 && html.indexOf("/ʃ/") >= 0, "含 sh → /ʃ/");
}

// ============ C. Pattern 详情页（逐词拆解） ============
section("C. spell:a_e 详情页（逐字母拆解拼读）");
{
  const sb = mkSandbox();
  setup(sb);
  vm.runInContext("lgPhonView='spell:a_e';", sb);
  const html = vm.runInContext("lgRenderPhonics('en')", sb);
  ok(html.indexOf("cake") >= 0 && html.indexOf("/keɪk/") >= 0, "详情页含 cake /keɪk/");
  ok(html.indexOf("∅") >= 0, "含不发音 ∅ 标注（Magic E 关键）");
  ok(html.indexOf("phon-chip") >= 0, "含逐字母色块 chip");
  ok(html.indexOf("魔法") >= 0 || html.indexOf("结尾 e") >= 0, "含规则说明");
  // 访问详情会标记 done（写 localStorage）
  ok(vm.runInContext("lgSpellDone().indexOf('a_e') >= 0", sb), "访问详情后 a_e 记为已学");

  // 详情页的下一个未学 Pattern 导航
  const html2 = vm.runInContext("lgPhonView='spell:a_e'; lgSpellMarkDone('a_e'); lgSpellMarkDone('i_e'); lgRenderPhonics('en')", sb);
  ok(html2.indexOf("下一个") >= 0, "含「下一个 Pattern」导航");
}

// ============ D. 路径主页 Phase 4 解锁 ============
section("D. 路径主页 Phase 4 解锁 + 进度");
{
  const sb = mkSandbox();
  setup(sb);
  vm.runInContext("lgPhonView=null;", sb);
  const html = vm.runInContext("lgRenderPhonics('en')", sb);
  ok(html.indexOf("lgPhonView='spell'") >= 0, "Phase 4 卡 onClick 路由到 spell");
  // Phase 5 仍锁定
  ok(html.indexOf("拼读实战") >= 0, "Phase 5 标题仍在");
  ok(html.indexOf("🔒") >= 0, "Phase 5 显示锁定");
}

// ============ E. 进度持久化 ============
section("E. lgSpellDone 进度持久化");
{
  const sb = mkSandbox();
  setup(sb);
  const p0 = vm.runInContext("lgSpellProgress()", sb);
  ok(p0.total === 13, "共 13 个 pattern（total=13）");
  // 模拟学完 3 个
  vm.runInContext("lgSpellMarkDone('a_e'); lgSpellMarkDone('ee'); lgSpellMarkDone('sh');", sb);
  const p1 = vm.runInContext("lgSpellProgress()", sb);
  ok(p1.done === 3, "3 个已学计入");
  const stored = sb.localStorage.getItem("lgPhonSpellDone");
  ok(stored && stored.indexOf("a_e") >= 0 && stored.indexOf("ee") >= 0, "localStorage 持久化 lgPhonSpellDone");
}

console.log("\n========================================");
console.log("Phase 4 自然拼读测试：通过 " + pass + " / 失败 " + fail);
console.log("========================================");
process.exit(fail > 0 ? 1 : 0);