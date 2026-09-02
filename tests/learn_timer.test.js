// v5.9.101 全局学习计时器（lgLearnTimer）测试
// 运行：node tests/learn_timer.test.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log("  ✓ " + msg); } else { fail++; console.log("  ✗ " + msg); } }
function section(t) { console.log("\n▶ " + t); }

function mkSandbox(opts) {
  opts = opts || {};
  const m = {};
  const fakeEl = { innerHTML: "", querySelector: () => null, querySelectorAll: () => [], style: {}, value: "", classList: { add() {}, remove() {}, contains: () => false } };
  const sb = {
    console,
    document: {
      getElementById: () => fakeEl,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: (n, fn) => { m[n] = m[n] || []; m[n].push(fn); },
      hidden: opts.hidden || false,
      readyState: "complete"
    },
    window: {
      addEventListener: (n, fn) => { m["w_" + n] = m["w_" + n] || []; m["w_" + n].push(fn); },
      speechSynthesis: { cancel() {}, getVoices() { return [{ lang: "en-US" }]; }, speak() {}, onvoiceschanged: null }
    },
    escapeHtml: s => (s == null ? "" : String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")),
    showModal() {}, closeModal() {}, showToast() {}, navigate() {}, render() {},
    today: opts.today || (() => "2026-09-02"),
    lgAddDays: (d, n) => {
      var dt = new Date(d + "T00:00:00Z");
      dt.setUTCDate(dt.getUTCDate() + n);
      return dt.toISOString().slice(0, 10);
    },
    uid: () => "id1",
    DB: { data: {}, save() {}, logActivity() {} },
    speechSynthesis: { cancel() {}, getVoices() { return [{ lang: "en-US" }]; }, speak() {}, onvoiceschanged: null },
    SpeechSynthesisUtterance: function (text) { this.text = text; this.lang = ""; this.rate = 1; this.voice = null; },
    lgEscapeJs: s => String(s).replace(/'/g, "\\'"),
    lgPhonSpeak() {},
    Math, Date, JSON, Object, Array, String, Number, parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent, setInterval, clearInterval, setTimeout, clearTimeout,
    addEventListener() {}, removeEventListener() {},
    fetch: () => Promise.resolve({ json: () => Promise.resolve({}) }),
    localStorage: (function () {
      const store = {};
      return {
        getItem: k => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: k => { delete store[k]; }
      };
    })()
  };
  sb.window = sb;
  vm.createContext(sb);
  return sb;
}

function setup(sb) {
  const src = fs.readFileSync(path.join(ROOT, "js/language.js"), "utf8");
  vm.runInContext(src, sb, { filename: "language.js" });
}

// ============ A. lgLT_load 与初始状态 ============
section("A. lgLT_load 初始化");
{
  const sb = mkSandbox();
  setup(sb);
  vm.runInContext("lgLT_load()", sb);
  const t = vm.runInContext("__lgLT.today", sb);
  ok(t && t.date === "2026-09-02" && t.sec === 0, "今日 today 初始 { date: '2026-09-02', sec: 0 }");
  const s = vm.runInContext("__lgLT.streak", sb);
  ok(s && s.streak === 0 && s.lastDate === null, "streak 初始 { lastDate: null, streak: 0 }");
  const stored = sb.localStorage.getItem("lgLearnToday");
  ok(stored && stored.indexOf("2026-09-02") >= 0, "lgLearnToday 已写 localStorage");
}

// ============ B. lgTouchActive 标记今日学习日 ============
section("B. lgTouchActive 标记学习日 + streak +1");
{
  const sb = mkSandbox();
  setup(sb);
  vm.runInContext("lgLT_load()", sb);
  // 第一次触发：streak 1，lastDate=今天
  vm.runInContext("lgTouchActive('click')", sb);
  let s = vm.runInContext("__lgLT.streak", sb);
  ok(s.streak === 1 && s.lastDate === "2026-09-02", "首次 lgTouchActive → streak=1, lastDate=今天");
  // 同一天再触发：streak 不变
  vm.runInContext("lgTouchActive('tts:see')", sb);
  s = vm.runInContext("__lgLT.streak", sb);
  ok(s.streak === 1, "同一天多次 lgTouchActive streak 仍 1");

  // 模拟隔天：今天 2026-09-02，lgTouchActive 触发的 lastDate = 2026-09-02，streak=1
  // 改 today 为 09-03 + 预置 streak.lastDate=昨天（streak 续接 +1）
  const sb2 = mkSandbox({ today: () => "2026-09-03" });
  setup(sb2);
  sb2.localStorage.setItem("lgLearnStreak", JSON.stringify({ lastDate: "2026-09-02", streak: 1 }));
  vm.runInContext("lgLT_load(); lgTouchActive('click')", sb2);
  s = vm.runInContext("__lgLT.streak", sb2);
  ok(s.streak === 2 && s.lastDate === "2026-09-03", "跨日续接 streak：昨天是 09-02 今天 09-03 → streak=2");

  // 跨日断签：lastDate = 09-01，今天 09-03 → streak 重置为 1
  const sb3 = mkSandbox({ today: () => "2026-09-03" });
  setup(sb3);
  sb3.localStorage.setItem("lgLearnStreak", JSON.stringify({ lastDate: "2026-09-01", streak: 5 }));
  vm.runInContext("lgLT_load(); lgTouchActive('click')", sb3);
  s = vm.runInContext("__lgLT.streak", sb3);
  ok(s.streak === 1 && s.lastDate === "2026-09-03", "跨日断签 streak 重置为 1");
}

// ============ C. lgLT_tick 5 秒步长累计 ============
section("C. lgLT_tick 5s 步长累计");
{
  const sb = mkSandbox();
  setup(sb);
  vm.runInContext("lgLT_load()", sb);
  // 模拟"刚刚活动"：把 lastActiveTs 设为当前
  vm.runInContext("__lgLT.lastActiveTs = Date.now()", sb);
  // 模拟 3 次 tick（应累计 +15s）
  vm.runInContext("lgLT_tick(); lgLT_tick(); lgLT_tick()", sb);
  const t = vm.runInContext("__lgLT.today", sb);
  ok(t.sec === 15, "3 次 tick 后 sec=15（5s × 3）");
  // lgLT_saveToday 应已写入 localStorage
  const stored = sb.localStorage.getItem("lgLearnToday");
  ok(stored && stored.indexOf("\"sec\":15") >= 0, "localStorage.sec = 15 已持久化");
}

// ============ D. 闲置 90 秒自动暂停 ============
section("D. 闲置 90 秒暂停");
{
  const sb = mkSandbox();
  setup(sb);
  vm.runInContext("lgLT_load()", sb);
  // lastActiveTs 设为 100 秒前
  vm.runInContext("__lgLT.lastActiveTs = Date.now() - 100000", sb);
  vm.runInContext("lgLT_tick()", sb);
  const p = vm.runInContext("__lgLT.paused", sb);
  ok(p === true, "闲置 100s 后 tick 触发 paused=true");
  // 后续 tick 不再累加
  vm.runInContext("__lgLT.paused = true; lgLT_tick(); lgLT_tick()", sb);
  const sec = vm.runInContext("__lgLT.today.sec", sb);
  ok(sec === 0, "暂停期间 tick 不累加（sec=0）");
  // 用户重新活动后解除暂停
  vm.runInContext("lgTouchActive('click')", sb);
  vm.runInContext("__lgLT.lastActiveTs = Date.now()", sb);
  vm.runInContext("lgLT_tick()", sb);
  const p2 = vm.runInContext("__lgLT.paused", sb);
  const sec2 = vm.runInContext("__lgLT.today.sec", sb);
  ok(p2 === false && sec2 === 5, "恢复活动后 paused=false，tick 重新累加");
}

// ============ E. 页面后台不累加 ============
section("E. 页面 hidden 不累加");
{
  const sb = mkSandbox({ hidden: true });
  setup(sb);
  vm.runInContext("lgLT_load(); __lgLT.lastActiveTs = Date.now()", sb);
  vm.runInContext("lgLT_tick()", sb);
  const sec = vm.runInContext("__lgLT.today.sec", sb);
  ok(sec === 0, "document.hidden=true 时 tick 不累加");
}

// ============ F. lgLT_dashboardHtml 渲染 ============
section("F. UI 仪表盘");
{
  const sb = mkSandbox();
  setup(sb);
  vm.runInContext("lgLT_load(); __lgLT.today.sec = 600; __lgLT.streak = {lastDate:'2026-09-02',streak:3}", sb);
  const html = vm.runInContext("lgLT_dashboardHtml()", sb);
  ok(html.indexOf("今日已学") >= 0, "仪表盘含「今日已学」");
  ok(html.indexOf("<b>10</b>") >= 0 && html.indexOf("分钟") >= 0, "显示 10 分钟（600s）");
  ok(html.indexOf("连续") >= 0 && html.indexOf("<b>3</b>") >= 0, "显示连续 3 天");
  ok(html.indexOf("phon-progress-fill") >= 0, "含进度条");
  ok(html.indexOf("lg-learn-card") >= 0, "用 lg-learn-card 类");
}

// ============ G. 路径主页注入仪表盘 ============
section("G. 路径主页顶部出现仪表盘");
{
  const sb = mkSandbox();
  setup(sb);
  vm.runInContext("__lgLT = { today: { date: '2026-09-02', sec: 120 }, streak: { lastDate: '2026-09-02', streak: 1 }, lastActiveTs: Date.now(), paused: false, intervalId: null }; lgLT_load()", sb);
  vm.runInContext("lgPhonView=null; __lgPhonetics = { updatedAt: 'x', vowels: [], consonants: [] }", sb);
  const html = vm.runInContext("lgRenderPhonics('en')", sb);
  ok(html.indexOf("lg-learn-card") >= 0, "主页路径含学习仪表盘卡");
  const dashIdx = html.indexOf("lg-learn-card");
  const pathIdx = html.indexOf("phon-phase");
  ok(dashIdx < pathIdx && dashIdx >= 0, "仪表盘卡在 Phase 卡之前（顶部）");
}

// ============ H. lgPhonSpeak 末尾触发 lgTouchActive ============
section("H. lgPhonSpeak 自动计为学习动作");
{
  const sb = mkSandbox();
  setup(sb);
  // monkey-patch lgPhonSpeak 不真正发 TTS（mock 已 mock speechSynthesis.speak）
  vm.runInContext("lgLT_load()", sb);
  // 模拟调用
  vm.runInContext("lgPhonSpeak('see','US')", sb);
  const ts = vm.runInContext("__lgLT.lastActiveTs > 0", sb);
  ok(ts, "lgPhonSpeak 调用后 lastActiveTs 被更新（学习动作被记录）");
  const s = vm.runInContext("__lgLT.streak", sb);
  ok(s.lastDate === "2026-09-02", "lgPhonSpeak 触发当天 streak 记号");
}

console.log("\n========================================");
console.log("v5.9.101 学习计时器测试：通过 " + pass + " / 失败 " + fail);
console.log("========================================");
process.exit(fail > 0 ? 1 : 0);