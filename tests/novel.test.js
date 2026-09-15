// 小说创作模块测试 · v5.9.133（skill 化版本）
// 覆盖：字数统计 / CRUD / 伏笔状态机 / 5 维评审 / P0-P2 红线 / spec 字段 / 推进队列 / UI 渲染
const fs = require("fs");
const vm = require("vm");

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log("  ✗ " + msg); } }
function eq(a, b, msg) { ok(a === b, msg + " (实际 " + JSON.stringify(a) + " ≠ 期望 " + JSON.stringify(b) + ")"); }
function section(t) { console.log("\n▶ " + t); }

const ROOT = "/Users/ichi/WorkBuddy/2026-07-30-21-36-02/pm-workbench-auto";
const SRC = fs.readFileSync(ROOT + "/js/novel.js", "utf8");
const SEED = JSON.parse(fs.readFileSync(ROOT + "/data/novel.json", "utf8"));

function mkSandbox(opts) {
  opts = opts || {};
  const fakeEl = { innerHTML: "", querySelector: () => null, querySelectorAll: () => [], style: {}, value: "", classList: { add() {}, remove() {}, contains: () => false } };
  const containers = { "app-content": fakeEl };
  const sb = {
    console, Math, Date, JSON, Object, Array, String, Number, parseInt, parseFloat, isNaN,
    encodeURIComponent, decodeURIComponent, setInterval, clearInterval, setTimeout, clearTimeout,
    addEventListener() {}, removeEventListener() {},
    document: {
      getElementById: id => containers[id] || fakeEl,
      querySelector: () => null, querySelectorAll: () => [],
      createElement: () => ({ click() {}, setAttribute() {}, style: {}, appendChild() {}, removeChild() {} }),
      body: { appendChild() {}, removeChild() {} },
      addEventListener() {}, hidden: false, readyState: "complete"
    },
    window: { addEventListener() {} },
    URL: { createObjectURL: () => "blob:test", revokeObjectURL() {} },
    Blob: function () { return {}; },
    FileReader: function () { this.readAsText = function () { setTimeout(() => this.onload && this.onload(), 0); }; },
    localStorage: (function () { const s = opts.seedLoaded ? { nv_seed_loaded: "1" } : {}; return { getItem: k => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); }, removeItem: k => { delete s[k]; } }; })(),
    escapeHtml: s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"),
    showToast(msg) { this.__lastToast = msg; },
    render() {},
    today: () => opts.today || "2026-09-15",
    APP_VERSION: "5.9.133",
    DB: { data: {}, save() { this.__saveCount = (this.__saveCount || 0) + 1; } },
    fetch: () => Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve("") })
  };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(SRC, sb);
  return sb;
}

function withSeed(sb) {
  Object.assign(sb, { __seed: SEED });
  vm.runInContext("Novel.db()", sb);
  vm.runInContext(
    ["books","chars","events","foreshadows","chapters","reviews","milestones","advances"].map(function(k){
      return "DB.data.novel['" + k + "'] = __seed['" + k + "'].slice()";
    }).join(";"),
    sb
  );
}

// ============ A. 字数统计 ============
section("A. 字数统计（仅中文字符）");
{
  const sb = mkSandbox();
  eq(sb.Novel.cnWordCount(""), 0, "空串 0");
  eq(sb.Novel.cnWordCount("hello world"), 0, "纯英文 0");
  eq(sb.Novel.cnWordCount("你好世界"), 4, "4 中文字 = 4");
  eq(sb.Novel.cnWordCount("Hi 你好！world 世"), 3, "中英混合 3 中文");
  eq(sb.Novel.cnWordCount("「你好」世界。"), 4, "标点不计入");
}

// ============ B. 数据层 CRUD ============
section("B. 数据层 CRUD");
{
  const sb = mkSandbox();
  withSeed(sb);
  eq(sb.Novel.db().books.length, 2, "2 本书");
  eq(sb.Novel.db().chars.length, 12, "12 角色");
  eq(sb.Novel.db().foreshadows.length, 16, "16 伏笔");
  eq(sb.Novel.db().chapters.length, 12, "12 章");
  var book = sb.Novel.get("book_xuanshenji");
  ok(book && book.title === "荒神祭", "nvGet 拿书");
  var ch = sb.Novel.chapter("ch1_01");
  ok(ch && ch.title === "灭门之夜", "nvChapter 拿章");
  eq(sb.Novel.get("nope"), null, "不存在返 null");
}

// ============ C. 书的总字数 ============
section("C. 书的总字数");
{
  const sb = mkSandbox();
  withSeed(sb);
  var w1 = sb.Novel.bookWordCount("book_xuanshenji");
  var w2 = sb.Novel.bookWordCount("book_fuguang");
  ok(w1 > 0 && w2 > 0, "两本书均有字数");
}

// ============ D. 伏笔状态机 ============
section("D. 伏笔状态机合法迁移");
{
  const sb = mkSandbox();
  withSeed(sb);
  var fsobj = sb.Novel.foreshadow("fs1_04");
  eq(fsobj.status, "setup", "fs1_04 起始 setup");
  var r1 = sb.Novel.fsTrans(fsobj, "pending");
  ok(r1.ok && fsobj.status === "pending", "setup → pending 合法");
  var r2 = sb.Novel.fsTrans(fsobj, "paid");
  ok(r2.ok && fsobj.status === "paid" && fsobj.payoffChapter !== null, "pending → paid 自动设 payoffChapter");
  var r3 = sb.Novel.fsTrans(fsobj, "setup");
  ok(!r3.ok, "paid → setup 非法");
  sb.Novel.fsTrans(fsobj, "pending");
  var r4 = sb.Novel.fsTrans(fsobj, "lost");
  ok(r4.ok, "pending → lost 合法");
  var r5 = sb.Novel.fsTrans(fsobj, "garbage");
  ok(!r5.ok, "非法状态名被拒");
}

// ============ E. 伏笔按书分组 ============
section("E. 伏笔按书分组");
{
  const sb = mkSandbox();
  withSeed(sb);
  var g = sb.Novel.bookFs("book_xuanshenji");
  eq(g.setup.length + g.pending.length + g.paid.length + g.lost.length, 8, "荒神祭 8 伏笔分配");
  var pending = sb.Novel.pendingFs("book_fuguang");
  ok(pending.every(function (f) { return f.status === "setup" || f.status === "pending"; }), "pendingFs 只返 setup+pending");
}

// ============ F. 红线扫描 P0/P1/P2 ============
section("F. 红线扫描（P0/P1/P2）");
{
  const sb = mkSandbox();
  withSeed(sb);
  var h1 = sb.Novel.scanRedLines("众所周知，火从宗门大殿一路烧到了后山。");
  ok(h1.some(function(x){return x.level==="P0" && x.id==="ai_phrase";}), "P0: ai_phrase 命中");
  var h2 = sb.Novel.scanRedLines("火起时，他明白了一切。");
  ok(h2.some(function(x){return x.level==="P0" && x.id==="insight_ending";}), "P0: insight_ending 命中");
  var h3 = sb.Novel.scanRedLines("他感到非常孤独。");
  ok(h3.some(function(x){return x.level==="P1" && x.id==="abstract_psych";}), "P1: abstract_psych 命中");
  var h4 = sb.Novel.scanRedLines("火从宗门大殿一路烧到了后山，老丹的左臂已经被烧得卷了边。");
  eq(h4.length, 0, "正常文本 0 命中");
}

// ============ G. 5 维评审（自动跑分） ============
section("G. 5 维评审自动跑分");
{
  const sb = mkSandbox();
  withSeed(sb);
  var rev = sb.Novel.autoReview("ch1_01");
  ok(rev, "autoReview 返非空");
  ok(rev.scores && rev.scores.reader, "含 reader 维度");
  ok(rev.scores && rev.scores.editor, "含 editor 维度");
  ok(rev.scores && rev.scores.storyteller, "含 storyteller 维度");
  ok(rev.scores && rev.scores.literary, "含 literary 维度");
  ok(rev.scores && rev.scores.troll, "含 troll 维度");
  ok(typeof rev.finalScore === "number" && rev.finalScore >= 0 && rev.finalScore <= 100, "finalScore 在 0-100");
  var totalW = 0;
  sb.Novel.REVIEW_ROLES.forEach(function(r){ totalW += r.weight; });
  eq(totalW, 100, "5 维权重和 = 100");
  ok(rev.scores.editor.score < 90, "命中 P0 → editor 扣分");
}

// ============ H. 评审保存 ============
section("H. 评审保存 + finalScore 计算");
{
  const sb = mkSandbox();
  withSeed(sb);
  var r = sb.Novel.saveReview("ch1_02", null, ["P0:test"], "测试评审");
  ok(r.ok && typeof r.final === "number", "saveReview 返 ok + final 分数");
  var rev = sb.Novel.reviewByCh("ch1_02");
  ok(rev && rev.notes === "测试评审", "notes 已保存");
  ok(rev.flags.indexOf("P0:test") >= 0, "flags 已保存");
}

// ============ I. spec 字段 ============
section("I. spec 字段（章节规格）");
{
  const sb = mkSandbox();
  withSeed(sb);
  var ch = sb.Novel.chapter("ch1_01");
  ok(ch.spec && ch.spec.before && ch.spec.after, "ch1_01 有 before/after state");
  ok(ch.spec.must_happen && ch.spec.must_happen.length > 0, "有 must_happen");
  ok(ch.spec.tension && ch.spec.tension.length >= 2, "有 tension_curve 多点");
  ok(ch.spec.key_scenes && ch.spec.key_scenes.length > 0, "有 key_scenes");
  ok(ch.spec.new_hooks && ch.spec.new_hooks.length > 0, "有 new_hooks");
}

// ============ J. 润色 / 续写脚手架 ============
section("J. 润色 + 续写脚手架");
{
  const sb = mkSandbox();
  withSeed(sb);
  var r1 = sb.Novel.polish("ch1_01", { location: "开篇", issueType: "啰嗦", expect: "压成一句", keep: "火、宗门" });
  ok(r1.ok, "polish 返 ok");
  var ch = sb.Novel.chapter("ch1_01");
  ok(ch.notes && ch.notes.length >= 1 && ch.notes[ch.notes.length-1].kind === "polish", "chapter.notes 增加 polish");
  var r2 = sb.Novel.continue("book_fuguang", { tailFromPrev: "硬盘亮起", goal: "揭示真相", mustChars: "陈哲", foreshadowIds: ["fs2_01"] });
  ok(r2.ok, "continue 返 ok");
  ok(r2.outline.indexOf("承接") >= 0 && r2.outline.indexOf("本章目标") >= 0, "提纲含承接 + 本章目标");
  ok(r2.mustPay.length === 1, "必兑现 1 条");
}

// ============ K. 自动化推进队列 ============
section("K. 自动化推进队列");
{
  const sb = mkSandbox();
  withSeed(sb);
  var task = sb.Novel.enqueueAdvance("book_fuguang", 10, { threshold: 85 });
  ok(task && task.id && task.total === 10 && task.status === "pending", "enqueueAdvance 创建任务");
  eq(sb.Novel.db().advances.length, 1, "advances 表有 1 条");
  var r1 = sb.Novel.advanceStep(task.id);
  ok(r1.ok && r1.chapter && r1.chapter.num >= 6, "step1 生成下一章");
  ok(r1.chapter.spec && r1.chapter.spec.before, "新章含 spec");
  ok(r1.chapter.status === "spec", "新章 status=spec");
  ok(r1.review && typeof r1.review.finalScore === "number", "review 已生成");
  ok(task.log.length >= 2, "任务日志至少 2 条（start + step）");
}

// ============ L. UI 渲染：6 tab 切换 ============
section("L. UI 渲染：6 模块 tab");
["overview", "outline", "spec", "writing", "review", "advance"].forEach(function (tab) {
  const sb = mkSandbox();
  withSeed(sb);
  vm.runInContext("NV_TAB='" + tab + "';document.getElementById('app-content').innerHTML='';Novel.render()", sb);
  var html = sb.document.getElementById("app-content").innerHTML;
  ok(html.length > 200, tab + " HTML > 200");
  ok(html.indexOf("ERR:") < 0, tab + " 无错误");
});

// ============ M. UI 渲染：章详情（含 spec + 5 维 + 红线） ============
section("M. 章详情渲染（spec + 5 维 + 红线）");
{
  const sb = mkSandbox();
  withSeed(sb);
  vm.runInContext("NV_VIEW='chapter:ch1_01';document.getElementById('app-content').innerHTML='';Novel.render()", sb);
  var html = sb.document.getElementById("app-content").innerHTML;
  ok(html.indexOf("nv-spec-card") >= 0, "含 spec 卡");
  ok(html.indexOf("nv-rv-grid") >= 0, "含 5 维评审网格");
  ok(html.indexOf("nv-redline-card") >= 0, "含红线扫描卡（ch1_01 含 P0）");
  ok(html.indexOf("Spec") >= 0, "含 Spec 标题");
}

// ============ N. UI 渲染：推进视图 ============
section("N. 推进视图（任务列表 + 新建）");
{
  const sb = mkSandbox();
  withSeed(sb);
  vm.runInContext("NV_TAB='advance';document.getElementById('app-content').innerHTML='';Novel.render()", sb);
  var html = sb.document.getElementById("app-content").innerHTML;
  ok(html.indexOf("自动化推进") >= 0, "含推进工作流介绍");
  ok(html.indexOf("nv-adv-total") >= 0, "含新建表单");
  ok(html.indexOf("暂无推进任务") >= 0 || html.indexOf("推进任务历史") >= 0, "含任务列表区");
}

// ============ O. Seed 完整性 + 新字段 ============
section("O. Seed 数据完整性");
{
  ok(SEED.books.length === 2, "seed books = 2");
  ok(SEED.chapters.length === 12, "seed chapters = 12");
  ok(SEED.foreshadows.length === 16, "seed foreshadows = 16");
  var c1 = SEED.chapters.find(function(x){return x.id==="ch1_01"});
  ok(c1.spec && c1.spec.before && c1.spec.after && c1.spec.must_happen && c1.spec.tension && c1.spec.key_scenes && c1.spec.new_hooks, "ch1_01 spec 6 块齐全");
  ok(c1.reviewFlags && c1.reviewFlags.indexOf("P0:insight_ending") >= 0, "ch1_01 reviewFlags 含 P0:insight_ending");
  var rev = SEED.reviews.find(function(x){return x.chapterId==="ch1_02"});
  ok(rev && rev.scores && rev.scores.reader && rev.scores.editor && rev.scores.storyteller && rev.scores.literary && rev.scores.troll, "ch1_02 review 5 维齐全");
  ok(rev.finalScore === 87, "ch1_02 finalScore = 87");
}

console.log("\n=== 通过 " + pass + " / 失败 " + fail + " ===");
process.exit(fail === 0 ? 0 : 1);