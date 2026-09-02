// Phase 3 · 辅音系统（按发音机制分组 + 清浊对比）测试
// 运行：node tests/phon_cons.test.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log("  ✓ " + msg); } else { fail++; console.log("  ✗ " + msg); } }
function section(t) { console.log("\n▶ " + t); }

// ============ A. 数据完整性 ============
section("A. data/phoneme_pairs.json · consGroups + consPairs");
{
  const p = JSON.parse(fs.readFileSync(path.join(ROOT, "data/phoneme_pairs.json"), "utf8"));
  ok(p.consGroups && p.consGroups.length === 4, "consGroups 4 大机制");
  ok(p.consPairs && p.consPairs.length === 9, "consPairs 共 9 对");

  const mechs = new Set(p.consPairs.map(x => x.mechanism));
  ok(mechs.has("plosive") && mechs.has("fricative") && mechs.has("affricate") && mechs.has("nasal"), "四种 mechanism 标签全覆盖");

  // 每对都有 aVoice/bVoice/tip
  const noTip = p.consPairs.filter(x => !x.tip || typeof x.aVoice !== "boolean" || typeof x.bVoice !== "boolean");
  ok(noTip.length === 0, "每对都有 tip + aVoice + bVoice");

  // 关键对验证
  const pb = p.consPairs.find(x => x.id === "p_b");
  ok(pb && pb.a === "/p/" && pb.b === "/b/" && pb.aVoice === false && pb.bVoice === true, "p_b 清浊标签正确");
  const mn = p.consPairs.find(x => x.id === "m_n");
  ok(mn && mn.aVoice === true && mn.bVoice === true, "m_n 双浊音标签正确");
  const td = p.consPairs.find(x => x.id === "t_d");
  ok(td && td.aVoice === false && td.bVoice === true, "t_d 清浊标签正确");

  // consTip
  ok(p.consTip && p.consTip.indexOf("把手放在喉咙") >= 0, "含「把手放在喉咙」教学提示");
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
    "phonetics": JSON.parse(fs.readFileSync(path.join(ROOT, "data/phonetics.json"), "utf8"))
  };
  vm.createContext(sb);
  return sb;
}

// ============ B. 视图分发 ============
section("B. 视图分发 cons → lgPhonConsPage");
{
  const sb = mkSandbox();
  const src = fs.readFileSync(path.join(ROOT, "js/language.js"), "utf8");
  vm.runInContext(src, sb, { filename: "language.js" });
  sb.__lgPhonetics = sb.__data["phonetics"];
  sb.lgLetters = sb.__data["letters"];
  sb.lgPairs = sb.__data["phoneme_pairs"];

  // cons 视图
  vm.runInContext("__lgPhonetics = __data['phonetics']; lgLetters = __data['letters']; lgPairs = __data['phoneme_pairs']; lgPhonView='cons';", sb);
  const html = vm.runInContext("lgRenderPhonics('en')", sb);
  ok(typeof html === "string" && html.length > 0, "cons 视图渲染出 HTML");

  // 核心交互
  ok(html.indexOf("把手放在喉咙") >= 0, "含「把手放在喉咙」教学卡");
  ok(html.indexOf("Voiceless") >= 0 && html.indexOf("Voiced") >= 0, "含清音/浊音对比标签");
  ok(html.indexOf("/p/") >= 0 && html.indexOf("/b/") >= 0, "含示例 /p/ vs /b/");

  // 4 大机制（按 group 名字识别）
  ok(html.indexOf("爆破音") >= 0, "含 ① 爆破音");
  ok(html.indexOf("摩擦音") >= 0, "含 ② 摩擦音");
  ok(html.indexOf("破擦音") >= 0, "含 ③ 破擦音");
  ok(html.indexOf("鼻音") >= 0, "含 ④ 鼻音");

  // 关键 pair 在对应机制下展示
  ok(html.indexOf("pat") >= 0 && html.indexOf("bat") >= 0, "含 p_b 爆破音对 pat/bat");
  ok(html.indexOf("thin") >= 0 && html.indexOf("this") >= 0, "含 θ_ð 摩擦音对 thin/this");
  ok(html.indexOf("cheap") >= 0 && html.indexOf("jeep") >= 0, "含 tʃ_dʒ 破擦音对 cheap/jeep");
  ok(html.indexOf("map") >= 0 && html.indexOf("nap") >= 0, "含 m_n 鼻音对 map/nap");

  // 教学 tip 展示
  ok(html.indexOf("💡") >= 0 && html.indexOf("声带") >= 0, "含声带震动教学提示");
}

// ============ C. 路径主页 Phase 3 路由 ============
section("C. 路径主页 Phase 3 路由 + 进度");
{
  const sb = mkSandbox();
  const src = fs.readFileSync(path.join(ROOT, "js/language.js"), "utf8");
  vm.runInContext(src, sb, { filename: "language.js" });
  sb.__lgPhonetics = sb.__data["phonetics"];
  sb.lgLetters = sb.__data["letters"];
  sb.lgPairs = sb.__data["phoneme_pairs"];
  vm.runInContext("__lgPhonetics = __data['phonetics']; lgLetters = __data['letters']; lgPairs = __data['phoneme_pairs']; lgPhonView=null;", sb);
  const pathHtml = vm.runInContext("lgRenderPhonics('en')", sb);
  // Phase 3 现在应该路由到 'cons' 而不是 'lib'
  ok(pathHtml.indexOf("lgPhonView='cons'") >= 0, "Phase 3 卡片 onclick 改为 lgPhonView='cons'");
  ok(pathHtml.indexOf("辅音系统") >= 0, "Phase 3 标题展示");
  // 不应再路由到 'lib'
  // (lib 仍作为整体图书馆入口存在，是 OK 的；只验证 Phase 3 卡片用的是 cons)
}

// ============ D. 进度计算 ============
section("D. lgConsProgress 进度计算");
{
  const sb = mkSandbox();
  const src = fs.readFileSync(path.join(ROOT, "js/language.js"), "utf8");
  vm.runInContext(src, sb, { filename: "language.js" });
  sb.__lgPhonetics = sb.__data["phonetics"];
  sb.lgLetters = sb.__data["letters"];
  sb.lgPairs = sb.__data["phoneme_pairs"];
  vm.runInContext("__lgPhonetics = __data['phonetics']; lgPairs = __data['phoneme_pairs'];", sb);

  const p0 = vm.runInContext("lgConsProgress()", sb);
  ok(p0.done === 0 && p0.total === 9 && p0.pct === 0, "初始进度 0/9 = 0%");

  // 模拟答 3 题（≥2 即视为「完成」该对）
  vm.runInContext("lgPairState.p_b = {idx:0,correct:1,total:2,answered:false}; lgPairState.t_d = {idx:0,correct:0,total:2,answered:false}; lgPairState.m_n = {idx:0,correct:1,total:3,answered:false};", sb);
  const p1 = vm.runInContext("lgConsProgress()", sb);
  ok(p1.done === 3 && p1.total === 9 && p1.pct === 33, "3 对完成 → 3/9 = 33%");

  // 不够 2 次的不算完成
  vm.runInContext("lgPairState.k_g = {idx:0,correct:0,total:1,answered:false};", sb);
  const p2 = vm.runInContext("lgConsProgress()", sb);
  ok(p2.done === 3, "total<2 不计入完成");
}

console.log("\n========================================");
console.log("Phase 3 辅音系统测试：通过 " + pass + " / 失败 " + fail);
console.log("========================================");
process.exit(fail > 0 ? 1 : 0);