// 小说创作模块测试 · v5.9.134（skill 化版本）
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

// ============ L. UI 渲染：V1 六大主 tab ============
section("L. UI 渲染：V1 六大主 tab（首页/写作/故事/AI/灵感/素材）");
["home", "write", "story", "ai", "idea", "material"].forEach(function (tab) {
  const sb = mkSandbox();
  withSeed(sb);
  vm.runInContext("NV_TAB='" + tab + "';document.getElementById('app-content').innerHTML='';Novel.render()", sb);
  var html = sb.document.getElementById("app-content").innerHTML;
  ok(html.length > 200, tab + " HTML > 200");
  ok(html.indexOf("ERR:") < 0, tab + " 无错误");
});
// 故事 8 个子 tab + AI 5 个子 tab 全部可渲染
{
  const sb = mkSandbox();
  withSeed(sb);
  ["outline", "volumes", "chars", "relations", "timeline", "world", "foreshadows", "emotions"].forEach(function (sub) {
    vm.runInContext("NV_TAB='story';NV_STORY_SUB='" + sub + "';document.getElementById('app-content').innerHTML='';Novel.render()", sb);
    var html = sb.document.getElementById("app-content").innerHTML;
    ok(html.length > 200 && html.indexOf("ERR:") < 0, "story/" + sub + " 渲染正常");
  });
  ["assist", "doctor", "context", "review", "advance"].forEach(function (sub) {
    vm.runInContext("NV_TAB='ai';NV_AI_SUB='" + sub + "';document.getElementById('app-content').innerHTML='';Novel.render()", sb);
    var html = sb.document.getElementById("app-content").innerHTML;
    ok(html.length > 200 && html.indexOf("ERR:") < 0, "ai/" + sub + " 渲染正常");
  });
}

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

// ============ N. UI 渲染：推进视图（AI 子 tab） ============
section("N. 推进视图（任务列表 + 新建）");
{
  const sb = mkSandbox();
  withSeed(sb);
  vm.runInContext("NV_TAB='ai';NV_AI_SUB='advance';document.getElementById('app-content').innerHTML='';Novel.render()", sb);
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

// ============ P. my-novel-writer skill：规范 v2.0 + 违禁词 + Prompt 组装器 ============
section("P. Skill 规范 v2.0（checklist / banned / buildPrompt / world / card）");
{
  // P1 违禁词扫描
  {
    const sb = mkSandbox({ seedLoaded: true });
    withSeed(sb);
    const hits = sb.Novel.Skill.bannedScan("他杀了敌，血溅三尺，宁死不降。");
    eq(hits.length, 3, "违禁词扫描：杀/血/死 全命中");
    ok(hits[0].subs.length === 3 && hits[0].subs.indexOf("陨落") >= 0, "杀 → 替换建议含陨落");
    eq(sb.Novel.Skill.bannedScan("风平浪静").length, 0, "无违禁词 → 空数组");
    eq(sb.Novel.Skill.bannedScan("").length, 0, "空文本 → 空数组");
  }
  // P2 规范检查清单（7 项）
  {
    const sb = mkSandbox({ seedLoaded: true });
    withSeed(sb);
    const chk = sb.Novel.Skill.checklist("ch1_01");
    ok(chk && chk.items.length === 7, "checklist 7 项");
    const ks = chk.items.map(i => i.k).join(",");
    ok(ks === "word_count,bang,hook,author,pov,banned,logic", "checklist 项顺序与键名");
    const wcItem = chk.items.find(i => i.k === "word_count");
    ok(wcItem.ok === false && /偏短/.test(wcItem.detail), "ch1_01 示例章字数偏短 → P1 提示含补全建议");
    // 违禁词命中章：老丹断臂文本无违禁词，造一个含「死」的章验证 P2 标记
    const c3 = sb.DB.data.novel.chapters.find(x => x.id === "ch1_03");
    const draftBackup = c3.draft;
    c3.draft = (draftBackup || "") + "\n\n他死了。";
    const chk2 = sb.Novel.Skill.checklist("ch1_03");
    const bannedItem = chk2.items.find(i => i.k === "banned");
    ok(bannedItem.ok === false && /「死」/.test(bannedItem.detail), "含死文本 → 违禁词项 fail + 替换建议");
    c3.draft = draftBackup;
  }
  // P3 Prompt 组装器
  {
    const sb = mkSandbox({ seedLoaded: true });
    withSeed(sb);
    const p = sb.Novel.Skill.buildPrompt("book_xuanshenji", 2);
    ok(p && p.indexOf("《荒神祭》") >= 0 && p.indexOf("第 2 章") >= 0, "prompt 含书名与章号");
    ok(p.indexOf("2200-2500") >= 0, "prompt 含字数硬性指标");
    ok(p.indexOf("林渊") >= 0 && p.indexOf("姜禾") >= 0, "prompt 含人物卡");
    ok(p.indexOf("半文半白") >= 0, "prompt 含书籍风格");
    ok(p.indexOf("违禁词替换") >= 0 && p.indexOf("陨落") >= 0, "prompt 含违禁词替换表");
    const pSpec = sb.Novel.Skill.buildPrompt("book_xuanshenji", 1);
    ok(pSpec.indexOf("必须发生") >= 0 && pSpec.indexOf("张力曲线") >= 0, "第 1 章（有 spec）prompt 含 must_happen + 张力曲线");
    ok(pSpec.indexOf("火攻宗门") >= 0, "spec must_happen 内容注入");
    ok(p.indexOf("上一章") >= 0 || p.indexOf("这是第一章") >= 0, "prompt 含上一章摘要或首章提示");
    const pFirst = sb.Novel.Skill.buildPrompt("book_fuguang", 1);
    ok(pFirst.indexOf("第一人称") >= 0, "浮光（first 视角）prompt 含第一人称要求");
    eq(sb.Novel.Skill.buildPrompt("no_book", 1), null, "书不存在 → null");
  }
  // P4 seed：world / style / pov / 人物卡
  {
    ok(SEED.books[0].world && SEED.books[0].world.basic && SEED.books[0].world.rules && SEED.books[0].world.mystery, "荒神祭 world 三块齐全");
    ok(SEED.books[0].pov === "third" && SEED.books[0].style, "荒神祭 pov=third + style");
    ok(SEED.books[1].pov === "first", "浮光 pov=first");
    const lin = SEED.chars.find(c => c.id === "c1_lin_yun");
    ok(lin.card && lin.card.appearance && lin.card.fear && lin.card.arcStart && lin.card.arcEnd, "林渊人物卡（外貌/恐惧/弧光起点终点）");
  }
  // P5 autoReview 融合违禁词
  {
    const sb = mkSandbox({ seedLoaded: true });
    withSeed(sb);
    const c3 = sb.DB.data.novel.chapters.find(x => x.id === "ch1_03");
    const draftBackup = c3.draft;
    c3.draft = (draftBackup || "") + "\n\n他死了，血溅当场。";
    const r = sb.Novel.autoReview("ch1_03");
    ok(r.flags.indexOf("P2:banned_死") >= 0 && r.flags.indexOf("P2:banned_血") >= 0, "autoReview flags 含 banned 死/血");
    const trollNote = r.scores.troll.note;
    ok(/违禁词/.test(trollNote), "troll note 含违禁词统计");
    c3.draft = draftBackup;
  }
}

// ============ Q. V1 数据迁移（老数据自动补全） ============
section("Q. V1 数据迁移 / 补全");
{
  const sb = mkSandbox();
  // 只灌入"老形态"数据：chars 无 bookId、chapter 无 card、无 relations/inspirations/materials/emotions
  const legacy = {
    books: [{ id: "b1", title: "测试书" }],
    chars: [{ id: "c1_a", name: "甲", traits: ["冷静"], relationships: [{ with: "c1_b", type: "师徒" }] },
            { id: "c1_b", name: "乙" }],
    events: [{ id: "e1", title: "旧事件", chapter: 2, summary: "摘要", affectedChars: ["甲"] }],
    foreshadows: [], chapters: [{ id: "ch1_a", bookId: "b1", num: 1, title: "第一章", draft: "正文", goal: "目标" }],
    reviews: [], milestones: [], advances: []
  };
  sb.__legacy = legacy;
  vm.runInContext("Novel.db();Object.keys(__legacy).forEach(function(k){DB.data.novel[k]=__legacy[k]});Novel.migrate()", sb);
  const d = sb.Novel.db();
  eq(d.relations.length, 1, "关系从人物 relationships 派生");
  ok(d.relations[0].a && d.relations[0].b && d.relations[0].type === "师徒", "关系字段正确");
  eq(d.chars[0].bookId, "b1", "chars 补 bookId（按 id 前缀 c1_）");
  ok(Array.isArray(d.chars[0].personality) && d.chars[0].personality[0] === "冷静", "traits → personality");
  ok(d.chapters[0].card && d.chapters[0].card.task === "目标", "chapter.card 派生（含 task）");
  ok(Array.isArray(d.chapters[0].card.mustAppear), "card.mustAppear 为数组");
  ok(d.events[0].happened === "摘要" && d.events[0].chars[0] === "甲", "event 兼容字段归一");
  ok(d.inspirations.length >= 1 && d.materials.length >= 1, "灵感/素材种子");
  ok(Array.isArray(d.books[0].volumes) && Array.isArray(d.books[0].themes), "book 补 volumes/themes");
  // 幂等：二次迁移不重复
  const before = d.relations.length;
  sb.Novel.migrate();
  eq(sb.Novel.db().relations.length, before, "迁移幂等");
}

// ============ R. 编辑 API（全实体可增删改） ============
section("R. 编辑 API（书籍/卷/世界观/章节/人物/关系/时间线/伏笔/灵感/素材/情绪线）");
{
  const sb = mkSandbox();
  withSeed(sb);
  const E = sb.Novel.edit;
  const b = E.book(null, { title: "新书", genre: "都市", oneLiner: "一句话", themes: ["爱"], style: "白描", pov: "first", targetWords: 100000, status: "writing" });
  ok(b.id && sb.Novel.db().books.length === 3, "新建书籍");
  ok((b.themes || [])[0] === "爱" && b.pov === "first", "书籍字段写入");
  E.book(b.id, { title: "改名后", targetWords: 200000 });
  eq(sb.Novel.get(b.id).title, "改名后", "编辑书籍");
  eq(sb.Novel.get(b.id).targetWords, 200000, "二次编辑保留其它字段");

  const v = E.volume(b.id, null, { title: "第一卷", range: "01—10" });
  ok(v && sb.Novel.get(b.id).volumes.length === 1, "新建卷");
  E.volume(b.id, v.num, { title: "改卷名" });
  eq(sb.Novel.get(b.id).volumes[0].title, "改卷名", "编辑卷");
  ok(E.delVolume(b.id, v.num) && sb.Novel.get(b.id).volumes.length === 0, "删除卷");

  E.world(b.id, { basic: "世界", places: ["A", "B"] });
  eq(sb.Novel.get(b.id).world.places.length, 2, "世界观写入");

  const ch = E.chapter(null, {
    bookId: b.id, num: 1, volume: 1, title: "第一章", status: "draft", draft: "你好世界",
    card_time: "现在", card_place: "上海", card_chars: ["甲", "乙"], card_task: "任务",
    plot_start: "开始", plot_conflict: "冲突", plot_climax: "高潮", plot_end: "结尾",
    emo_a: "甲", emo_aFrom: "防备", emo_aTo: "动摇",
    card_mustAppear: ["生日"], card_mustNot: ["复合"], card_fsRef: "礼物"
  });
  ok(ch.card && ch.card.plot.climax === "高潮", "章节幕后卡片四段剧情");
  ok(ch.card.emotion.aFrom === "防备" && ch.card.emotion.aTo === "动摇", "章节情绪推进");
  eq(ch.wordCount, 4, "章节字数自动统计");
  E.chapter(ch.id, { title: "改标题", draft: "改了" });
  eq(sb.Novel.chapter(ch.id).title, "改标题", "编辑章节");
  ok(sb.Novel.chapter(ch.id).card.plot.climax === "高潮", "编辑章节保留 card");

  const c = E.char(null, {
    bookId: b.id, name: "甲", role: "主角", age: "30", job: "设计师", city: "上海",
    personality: ["清醒", "克制"], desire: "被爱", fear: "被留下", flaw: "不表达",
    loveView: "陪伴", habits: ["冰美式"], card_appearance: "偏瘦", card_arcStart: "怕失去", card_arcEnd: "愿意一起生活",
    secrets: ["秘密"]
  });
  ok(c.personality.length === 2 && c.traits.length === 2, "人物性格 + traits 同步");
  eq(c.card.arcEnd, "愿意一起生活", "人物弧光终点");
  E.char(c.id, { loveView: "改后" });
  ok(sb.Novel.char(c.id).habits.length === 1, "编辑人物保留习惯数组");

  const r = E.relation(null, { bookId: b.id, a: "甲", b: "乙", type: "前任", past: "相爱", now: "重逢", conflict: "要现在", state: "重新靠近" });
  E.relationChange(r.id, { ch: 24, note: "道歉" });
  eq(sb.Novel.relations(b.id)[0].changes.length, 1, "关系变化记录");

  const ev = E.event(null, { bookId: b.id, title: "生日", time: "23岁·5月", chars: ["甲"], happened: "迟到", feeling: "失望", impact: "分手", chapters: [3, 24] });
  eq(sb.Novel.events(b.id)[0].chapters.length, 2, "时间线事件关联章节");
  eq(sb.Novel.events(b.id)[0].affectedChars[0], "甲", "affectedChars 兼容字段同步");

  const fs1 = E.foreshadow(null, { bookId: b.id, title: "礼物", setupChapter: 5, payoffChapter: 20, status: "setup" });
  eq(sb.Novel.foreshadows(b.id).filter(function (x) { return x.id === fs1.id; }).length, 1, "新建伏笔");

  const it = E.inspiration(null, { bookId: b.id, text: "灵感内容", type: "人物细节", chars: ["甲"], targetChapter: 8 });
  eq(sb.Novel.inspirations(b.id)[0].text, "灵感内容", "新建灵感");

  const m = E.material(null, { bookId: b.id, kind: "台词", title: "台词", content: "内容", tags: ["情感"] });
  eq(sb.Novel.materials(b.id)[0].tags[0], "情感", "新建素材");

  const em = E.emotion(null, { bookId: b.id, a: "甲", b: "乙" });
  E.emotionPoint(em.id, { ch: 10, stage: "动摇", value: 60 });
  E.emotionPoint(em.id, { ch: 5, stage: "防备", value: 30 });
  eq(sb.Novel.emotions(b.id)[0].points.length, 2, "情绪线两点");
  eq(sb.Novel.emotions(b.id)[0].points[0].ch, 5, "情绪线按章排序");

  ok(sb.Novel.edit.remove("inspirations", it.id) && sb.Novel.inspirations(b.id).length === 0, "删除灵感");
  ok(sb.Novel.edit.remove("books", b.id) && sb.Novel.db().books.length === 2, "删除书籍");
  eq(sb.Novel.db().chapters.filter(function (x) { return x.bookId === b.id; }).length, 0, "删书级联删章节");
  eq(sb.Novel.relations(b.id).length, 0, "删书级联删关系");
}

// ============ S. 导出引擎接入（Word / Excel） ============
section("S. 导出接入（Novel.export → NvExport 字节流）");
{
  const sb = mkSandbox();
  withSeed(sb);
  if (typeof sb.NvExport === "undefined") {
    // 沙箱内未加载导出模块时跳过（由 novel-export.test.js 独立覆盖）
    ok(true, "NvExport 未注入沙箱，跳过（见 novel-export.test.js）");
  } else {
    const d = sb.Novel.export.docx("book_xuanshenji");
    const x = sb.Novel.export.xlsx("book_xuanshenji");
    ok(d && d.length > 10000 && d[0] === 0x50 && d[1] === 0x4b, "docx 为 ZIP 流（PK 头）");
    ok(x && x.length > 5000 && x[0] === 0x50 && x[1] === 0x4b, "xlsx 为 ZIP 流（PK 头）");
  }
  ok(typeof sb.Novel.export === "object" && typeof sb.Novel.export.docx === "function", "Novel.export.docx 暴露");
  ok(typeof sb.Novel.export.xlsx === "function" && typeof sb.Novel.export.do === "function", "Novel.export.xlsx / do 暴露");
}

// ============ T. 首页待办 / 故事医生 / 全局上下文 ============
section("T. 待办 · 故事医生 · 全局上下文");
{
  const sb = mkSandbox();
  withSeed(sb);
  const todos = sb.Novel.todos("book_xuanshenji");
  ok(Array.isArray(todos) && todos.length > 0, "todos 返回待处理项");
  ok(todos.every(function (t) { return t.t && t.act; }), "每条待办含标题与跳转动作");
  const doc = sb.Novel.doctor("book_xuanshenji");
  ok(Array.isArray(doc) && doc.length > 0, "故事医生返回体检结论");
  ok(doc.every(function (x) { return x.tag && x.title && x.detail && x.level; }), "体检项含 分类/标题/说明/级别");
  ok(doc.some(function (x) { return x.tag === "结构"; }), "含结构类检查");
  ok(doc.some(function (x) { return x.tag === "时间线" || x.tag === "伏笔" || x.tag === "情感"; }), "含时间线/伏笔/情感类检查");
  const ctx = sb.Novel.buildContext("book_xuanshenji");
  ok(ctx.text.indexOf("【当前小说】") >= 0 && ctx.text.indexOf("【相关人物】") >= 0, "上下文含小说与人物");
  ok(ctx.text.indexOf("【待回收伏笔】") >= 0, "上下文含待回收伏笔");
  ok(sb.Novel.TABS.length === 6, "6 个主 tab 定义");
  ok(sb.Novel.IDEA_TYPES.length >= 5 && sb.Novel.MAT_KINDS.length >= 5, "灵感类型 / 素材类型已定义");
}

console.log("\n=== 通过 " + pass + " / 失败 " + fail + " ===");
process.exit(fail === 0 ? 0 : 1);