/* ============================================
 * 小说创作模块 v5.9.133 —— Skill 化重构
 * 设计参照 skill: open-novel-writing
 *   6 模块：设定 / 大纲 / 规格 / 正文 / 评审 / 推进
 *   5 维评审：阅读者 25 / 编审 25 / 故事家 25 / 文学顾问 15 / 毒舌读者 10
 *   红线分级：P0 绝对禁止 / P1 建议避免 / P2 可选优化
 *   自动化推进：批量连续写作 N 章（规划→生成→评审→修订）
 * 数据：data/novel.json（首次 seed 自动载入）
 * ============================================ */
(function (root) {
  "use strict";
  if (root.Novel) return;

  // ============================================================
  // 1. 数据层
  // ============================================================
  function nvDB() {
    if (typeof DB === "undefined" || !DB.data) return { books: [], chars: [], events: [], foreshadows: [], chapters: [], reviews: [], milestones: [], advances: [] };
    if (!DB.data.novel) DB.data.novel = { books: [], chars: [], events: [], foreshadows: [], chapters: [], reviews: [], milestones: [], advances: [] };
    return DB.data.novel;
  }
  function nvSave() { if (typeof DB !== "undefined" && DB.save) { try { DB.save(); } catch (e) {} } }
  function nvGet(id) { var d = nvDB(); for (var i = 0; i < d.books.length; i++) if (d.books[i].id === id) return d.books[i]; return null; }
  function nvChar(id) { var d = nvDB(); for (var i = 0; i < d.chars.length; i++) if (d.chars[i].id === id) return d.chars[i]; return null; }
  function nvChapter(id) { var d = nvDB(); for (var i = 0; i < d.chapters.length; i++) if (d.chapters[i].id === id) return d.chapters[i]; return null; }
  function nvForeshadow(id) { var d = nvDB(); for (var i = 0; i < d.foreshadows.length; i++) if (d.foreshadows[i].id === id) return d.foreshadows[i]; return null; }
  function nvReviewByCh(chId) { var d = nvDB(); for (var i = 0; i < d.reviews.length; i++) if (d.reviews[i].chapterId === chId) return d.reviews[i]; return null; }
  function nvUid(p) { return (p || "id") + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  // ============================================================
  // 2. Seed 加载
  // ============================================================
  var seedTried = false;
  function nvLoadSeed() {
    if (seedTried) return;
    seedTried = true;
    if (typeof localStorage === "undefined") return;
    if (localStorage.getItem("nv_seed_loaded")) return;
    var db = nvDB();
    if (db.books && db.books.length) { localStorage.setItem("nv_seed_loaded", "1"); return; }
    var ver = (typeof APP_VERSION !== "undefined") ? APP_VERSION : "0";
    fetch("data/novel.json?v=" + ver)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.books) return;
        ["books","chars","events","foreshadows","chapters","reviews","milestones","advances"].forEach(function (k) {
          if (Array.isArray(j[k])) db[k] = j[k].slice();
        });
        nvSave();
        localStorage.setItem("nv_seed_loaded", "1");
        try { if (typeof render === "function") render(); } catch (e) {}
      }).catch(function () {});
  }

  // ============================================================
  // 3. 工具：中文字数 / 进度 / 状态
  // ============================================================
  function nvCnWordCount(s) { s = String(s || ""); var m = s.match(/[\u4e00-\u9fff]/g); return m ? m.length : 0; }
  function nvBookWordCount(bookId) { var d = nvDB(); var sum = 0; d.chapters.forEach(function (c) { if (c.bookId === bookId) sum += nvCnWordCount(c.draft); }); return sum; }

  var CHAPTER_STATUS_META = {
    draft:    { label: "草稿", color: "#94a3b8" },
    revised:  { label: "已润色", color: "#f59e0b" },
    final:    { label: "定稿", color: "#10b981" },
    spec:     { label: "仅规格", color: "#0ea5e9" }
  };

  // 伏笔状态机
  var FORESHADOW_STATUS = ["setup", "pending", "paid", "lost"];
  var FORESHADOW_LABEL = { setup: "已埋", pending: "待兑", paid: "已兑", lost: "遗失" };
  var FORESHADOW_COLOR = { setup: "#0ea5e9", pending: "#f59e0b", paid: "#10b981", lost: "#94a3b8" };
  function nvFsTransition(fs, next) {
    if (!fs) return { ok: false, msg: "伏笔不存在" };
    if (FORESHADOW_STATUS.indexOf(next) < 0) return { ok: false, msg: "非法状态：" + next };
    var allowed = { setup:["pending","lost"], pending:["paid","lost","setup"], paid:["pending"], lost:["pending"] };
    if (fs.status === next) return { ok: true, noop: true };
    if ((allowed[fs.status] || []).indexOf(next) < 0) return { ok: false, msg: "伏笔不可由 " + FORESHADOW_LABEL[fs.status] + " → " + FORESHADOW_LABEL[next] };
    fs.status = next;
    if (next === "paid" && fs.payoffChapter == null) {
      var max = 0;
      nvDB().chapters.forEach(function (c) { if (c.bookId === fs.bookId && c.num > max) max = c.num; });
      fs.payoffChapter = max + 1;
    }
    return { ok: true };
  }

  function nvBookForeshadows(bookId) {
    var d = nvDB();
    var g = { setup: [], pending: [], paid: [], lost: [] };
    d.foreshadows.forEach(function (f) { if (f.bookId === bookId) g[f.status].push(f); });
    return g;
  }
  function nvBookPendingFs(bookId) {
    var d = nvDB();
    var arr = [];
    d.foreshadows.forEach(function (f) { if (f.bookId === bookId && (f.status === "setup" || f.status === "pending")) arr.push(f); });
    return arr;
  }

  // ============================================================
  // 4. 红线规则库（skill 红线 + 自动扫描）
  // ============================================================
  var RED_LINES = {
    P0: [
      { id: "ai_phrase", label: "明显 AI 词汇", pattern: /(众所周知|不言而喻|毋庸置疑|显而易见|总的来说)/, fix: "用具体场景替代" },
      { id: "insight_ending", label: "感悟式结尾", pattern: /(他明白了|她终于明白|他开始懂|她终于懂|他开始明白|她开始明白)/, fix: "删除或改为悬念式结尾" },
      { id: "exclaim_ending", label: "感叹式结尾", pattern: /(真是太.*[！!。]|多么.*[！!。])/, fix: "改为动作或环境描写" },
      { id: "god_view", label: "上帝视角", pattern: /(所有人没想到|全书第[0-9]+章|没人知道的是)/, fix: "用角色视角替换" }
    ],
    P1: [
      { id: "trope_savior", label: "套路化救主", pattern: /(千钧一发之际|仿佛天神降临|奇迹般地)/, fix: "破除套路，让代价更真实" },
      { id: "abstract_psych", label: "抽象心理", pattern: /(他感到.{0,5}(悲伤|孤独|绝望)|她觉得.{0,5}(害怕|无助))/, fix: "外化为动作或环境" },
      { id: "parallel", label: "连续排比", pattern: /(.{1,8}，.{1,8}，.{1,8}，.{1,8}[。！])/, fix: "拆短或换句式" }
    ],
    P2: [
      { id: "verb_weak", label: "动词弱化", pattern: /(走过去|看了一眼|说了一句)/, fix: "用更具体的动作" },
      { id: "abstract_sense", label: "感官抽象", pattern: /(美丽|漂亮|好看)/, fix: "用具体五感描写" }
    ]
  };

  function nvScanRedLines(text) {
    var hits = [];
    if (!text) return hits;
    ["P0","P1","P2"].forEach(function (level) {
      RED_LINES[level].forEach(function (r) {
        if (r.pattern.test(text)) {
          hits.push({ level: level, id: r.id, label: r.label, fix: r.fix, sample: (text.match(r.pattern) || [""])[0].slice(0, 40) });
        }
      });
    });
    return hits;
  }

  // ============================================================
  // 4.5 my-novel-writer skill：生成规范 v2.0 + 违禁词 + Prompt 组装器
  // ============================================================
  var SKILL_RULES = {
    WORD_RANGE: { min: 2200, max: 2500 },
    BANNED: [
      { word: "杀", subs: ["陨落", "寂灭", "诛杀"] },
      { word: "死", subs: ["魂飞魄散", "灰飞烟灭"] },
      { word: "血", subs: ["猩红", "染血", "殷红"] }
    ],
    BANG_POINTS: /(打脸|震惊|突破|升级|领悟|宝物|神兵|灵药|晋升|逆袭|奇遇)/,
    AUTHOR_NOTE: /作者说/
  };

  function nvBannedScan(text) {
    var out = [];
    if (!text) return out;
    SKILL_RULES.BANNED.forEach(function (b) {
      var m = String(text).split(b.word).length - 1;
      if (m > 0) out.push({ word: b.word, count: m, subs: b.subs });
    });
    return out;
  }

  // 生成规范 v2.0 逐项检查（7 项：字数/爽点/钩子/作者说/视角/违禁词/逻辑闭环）
  function nvSkillChecklist(chId) {
    var ch = nvChapter(chId);
    if (!ch) return null;
    var book = nvGet(ch.bookId);
    var wc = nvCnWordCount(ch.draft);
    var tail = String(ch.draft || "").slice(-80);
    var items = [];
    var wcOk = wc >= SKILL_RULES.WORD_RANGE.min && wc <= SKILL_RULES.WORD_RANGE.max;
    items.push({ k: "word_count", label: "字数 2200-2500", ok: wcOk,
      detail: "当前 " + wc + " 字" + (wcOk ? "" : (wc < SKILL_RULES.WORD_RANGE.min ? " · 偏短：补心理独白/环境渲染/动作细节/配角反应" : " · 偏长：删注水段落")),
      level: wcOk ? "ok" : "P1" });
    var bang = SKILL_RULES.BANG_POINTS.test(ch.draft);
    items.push({ k: "bang", label: "爽点 ≥ 1（打脸/突破/宝物/情感）", ok: bang,
      detail: bang ? "已命中爽点要素" : "缺爽点：加打脸反转、实力突破、获得宝物或情感互动",
      level: bang ? "ok" : "P1" });
    var hook = /[？?…]|却|谁知|下一|突然|身影|究竟/.test(tail);
    items.push({ k: "hook", label: "结尾钩子", ok: hook,
      detail: hook ? "结尾留有悬念要素" : "结尾平淡：补悬念 / 新危机 / 新目标",
      level: hook ? "ok" : "P2" });
    var author = SKILL_RULES.AUTHOR_NOTE.test(ch.draft);
    items.push({ k: "author", label: "作者说（读者互动）", ok: author,
      detail: author ? "已含作者说" : "章末缺「作者说」段落（求收藏/推荐票引导）",
      level: author ? "ok" : "P2" });
    var pov = (book && book.pov) || "third";
    var povOk = pov !== "first" || /我/.test(ch.draft);
    items.push({ k: "pov", label: "视角一致（" + (pov === "first" ? "第一人称" : "第三人称") + "）", ok: povOk,
      detail: povOk ? "视角符合本书设定" : "本书设定第一人称，但正文未出现「我」视角",
      level: povOk ? "ok" : "P1" });
    var banned = nvBannedScan(ch.draft);
    items.push({ k: "banned", label: "违禁词（审核规避）", ok: banned.length === 0,
      detail: banned.length ? banned.map(function (b) { return "「" + b.word + "」×" + b.count + " → 替换：" + b.subs.join("/"); }).join("；") : "未命中",
      level: banned.length ? "P2" : "ok" });
    items.push({ k: "logic", label: "逻辑闭环（人工核对）", ok: true,
      detail: "受伤恢复 / 物品去向 / 情绪连贯 / 战力合理 —— 写后人工过一遍", level: "hint" });
    var pass = items.filter(function (i) { return i.ok; }).length;
    return { items: items, pass: pass, total: items.length };
  }

  // Prompt 组装器：书设定 + 人物卡 + 世界观 + 上一章摘要 + spec + 规范 v2.0 → 可复制全文
  function nvBuildPrompt(bookId, chNum) {
    var book = nvGet(bookId);
    if (!book) return null;
    var d = nvDB();
    var ch = d.chapters.filter(function (c) { return c.bookId === bookId && c.num === chNum; })[0];
    var chars = d.chars.filter(function (c) { return c.bookId === bookId; });
    var lastCh = d.chapters.filter(function (c) { return c.bookId === bookId && c.num === chNum - 1; })[0];
    var style = book.style || "网文";
    var L = [];
    L.push("你是一位专业的网络小说作家，擅长创作" + style + "风格的长篇小说。");
    L.push("你的作品特点：情节紧凑、人物鲜活、世界观完整、爽点密集。");
    L.push("");
    L.push("请根据以下设定和大纲，创作小说《" + book.title + "》的第 " + chNum + " 章" + (ch ? "「" + ch.title + "」" : "") + "。");
    L.push("");
    L.push("【核心设定】");
    if (chars.length) {
      chars.forEach(function (c) {
        L.push("- " + c.name + "：" + (c.arc || "") + (c.traits && c.traits.length ? "（性格：" + c.traits.join("、") + "）" : ""));
      });
    } else L.push("（暂无人物设定）");
    L.push("");
    L.push("【世界观】");
    L.push(book.world ? JSON.stringify(book.world) : (book.desc || "（暂无世界观设定）"));
    L.push("");
    L.push("【风格】");
    L.push(style + (book.pov === "first" ? " · 第一人称「我」视角，不可切换" : ""));
    L.push("");
    L.push("【剧情上下文】");
    if (lastCh) {
      L.push("上一章「" + lastCh.title + "」：" + String(lastCh.draft || "").slice(0, 200) + (String(lastCh.draft || "").length > 200 ? "…" : ""));
    } else L.push("（这是第一章，无需前文摘要）");
    L.push("");
    L.push("【本章大纲 / Spec】");
    if (ch && ch.spec) {
      if (ch.spec.must_happen && ch.spec.must_happen.length) L.push("必须发生：" + ch.spec.must_happen.join("；"));
      if (ch.spec.key_scenes && ch.spec.key_scenes.length) L.push("关键场景：" + ch.spec.key_scenes.join("；"));
      if (ch.spec.new_hooks && ch.spec.new_hooks.length) L.push("新钩子：" + ch.spec.new_hooks.join("；"));
      if (ch.spec.tension && ch.spec.tension.length) L.push("张力曲线：" + ch.spec.tension.map(function (t) { return "p" + t.position + "=" + t.value; }).join(" → "));
      if (ch.goal) L.push("本章目标：" + ch.goal);
    } else if (ch && ch.goal) {
      L.push(ch.goal);
    } else L.push("（暂无大纲）");
    L.push("");
    L.push("【严格写作要求】");
    L.push("1. 字数控制：正文必须严格控制在 2200-2500 字（中文）。禁止短章或注水。");
    L.push("2. 情节结构：开篇快速切入冲突（黄金三章法则）；中段铺垫博弈升级危机；结尾留下钩子（悬念、新危机、新目标）。");
    L.push("3. 爽点设计：每章至少 1 个（打脸反转 / 实力突破 / 获得宝物 / 情感互动）。");
    L.push("4. 细节描写：心理独白、环境渲染（光影声音气味温度）、动作慢镜头、配角反应。");
    L.push("5. 逻辑闭环：伏笔回收；受伤/物品/等级不可突变；以弱胜强需金手指或计谋；时间线清晰。");
    if (book.pov === "first") L.push("6. 视角要求：严格使用第一人称「我」的视角，不可切换。");
    L.push("7. 输出格式：纯文本小说内容，无需 Markdown。");
    L.push("");
    L.push("【违禁词替换】（避免审核问题）");
    SKILL_RULES.BANNED.forEach(function (b) { L.push("- 「" + b.word + "」→ " + b.subs.join("、")); });
    L.push("");
    L.push("请开始创作高质量的章节内容。");
    return L.join("\n");
  }

  // ============================================================
  // 5. 5 维评审（skill：阅读者 25 / 编审 25 / 故事家 25 / 文学 15 / 毒舌 10）
  // ============================================================
  var REVIEW_ROLES = [
    { k: "reader", label: "📖 阅读者", weight: 25, focus: "开篇吸引力 · 节奏 · 画面感" },
    { k: "editor", label: "🔤 编审", weight: 25, focus: "错别字 · 病句 · 一致性" },
    { k: "storyteller", label: "📐 故事家", weight: 25, focus: "剧情逻辑 · 伏笔 · 钩子" },
    { k: "literary", label: "🎭 文学顾问", weight: 15, focus: "语言艺术 · 人物刻画" },
    { k: "troll", label: "💣 毒舌读者", weight: 10, focus: "套路化 · 水文 · 毒点" }
  ];

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  function nvAutoReview(chapterId) {
    var ch = nvChapter(chapterId);
    if (!ch) return null;
    var wc = nvCnWordCount(ch.draft);
    var redHits = nvScanRedLines(ch.draft);
    var p0 = redHits.filter(function(h){return h.level==="P0";}).length;
    var p1 = redHits.filter(function(h){return h.level==="P1";}).length;
    var p2 = redHits.filter(function(h){return h.level==="P2";}).length;
    var tens = (ch.draft.match(/[！!？?……]/g) || []).length;
    var reader = wc < 800 ? 65 : (wc > 4500 ? 70 : 85);
    if (tens > 15) reader = Math.min(95, reader + 5);
    var editor = 90;
    if (p0 > 0) editor -= 20;
    if (p1 > 0) editor -= 5 * p1;
    if (p2 > 0) editor -= 1 * p2;
    editor = Math.max(40, editor);
    var storyteller = 85;
    var d = nvDB();
    var bookFs = d.foreshadows.filter(function(f){ return f.bookId === ch.bookId && f.setupChapter === ch.num; });
    if (bookFs.length > 0 && !ch.spec) storyteller -= 10;
    if (redHits.some(function(h){return h.id==="god_view";})) storyteller -= 15;
    var literary = 80 + Math.min(15, Math.floor(wc / 400));
    if (redHits.some(function(h){return h.id==="abstract_psych";})) literary -= 8;
    var troll = 80;
    if (redHits.some(function(h){return h.id==="trope_savior";})) troll -= 12;
    if (wc > 5000) troll -= 8;
    if (wc < 1200) troll -= 5;
    var banned = nvBannedScan(ch.draft);
    if (banned.length) troll -= Math.min(6, 2 * banned.length);
    var scores = {
      reader: { score: clamp(reader, 40, 100), weight: 25, note: "字数 " + wc + " · 张力密度 " + tens },
      editor: { score: clamp(editor, 40, 100), weight: 25, note: "P0×" + p0 + " · P1×" + p1 + " · P2×" + p2 },
      storyteller: { score: clamp(storyteller, 40, 100), weight: 25, note: "伏笔铺设 ×" + bookFs.length + (ch.spec ? " · 有 spec" : " · 无 spec") },
      literary: { score: clamp(literary, 40, 100), weight: 15, note: "字数规模 " + wc },
      troll: { score: clamp(troll, 40, 100), weight: 10, note: "红线命中 " + redHits.length + " 项" + (banned.length ? " · 违禁词 " + banned.length + " 组" : "") }
    };
    var totalW = 0, weighted = 0;
    REVIEW_ROLES.forEach(function(r){
      weighted += scores[r.k].score * r.weight;
      totalW += r.weight;
    });
    var final = Math.round(weighted / totalW);
    var flags = redHits.map(function(h){return h.level+":"+h.id;});
    banned.forEach(function (b) { flags.push("P2:banned_" + b.word); });
    return { scores: scores, finalScore: final, flags: flags };
  }

  function nvSaveReview(chapterId, scoresObj, flags, notes) {
    var ch = nvChapter(chapterId);
    if (!ch) return { ok: false, msg: "章不存在" };
    var d = nvDB();
    var existing = nvReviewByCh(chapterId);
    var totalW = 0, weighted = 0;
    REVIEW_ROLES.forEach(function(r){
      var s = (scoresObj && scoresObj[r.k]) ? scoresObj[r.k].score : (existing && existing.scores && existing.scores[r.k] ? existing.scores[r.k].score : 85);
      weighted += s * r.weight; totalW += r.weight;
    });
    var final = Math.round(weighted / totalW);
    var obj = {
      id: existing ? existing.id : nvUid("rev"),
      chapterId: chapterId,
      scores: scoresObj || (existing ? existing.scores : {}),
      flags: flags || (existing ? existing.flags : []),
      notes: notes || "",
      finalScore: final,
      ts: new Date().toISOString()
    };
    if (existing) {
      var idx = d.reviews.indexOf(existing);
      d.reviews[idx] = obj;
    } else {
      d.reviews.push(obj);
    }
    nvSave();
    return { ok: true, final: final };
  }

  // ============================================================
  // 6. 脚手架：润色 / 续写
  // ============================================================
  function nvScaffoldPolish(chapterId, payload) {
    var ch = nvChapter(chapterId);
    if (!ch) return { ok: false, msg: "章节不存在" };
    if (!ch.notes) ch.notes = [];
    ch.notes.push({
      kind: "polish",
      location: String(payload.location || "").slice(0, 200),
      issueType: String(payload.issueType || "其他"),
      expect: String(payload.expect || "").slice(0, 500),
      keep: String(payload.keep || "").slice(0, 200),
      ts: new Date().toISOString()
    });
    nvSave();
    return { ok: true };
  }

  function nvScaffoldContinue(bookId, payload) {
    var d = nvDB();
    var pending = nvBookPendingFs(bookId);
    var book = nvGet(bookId);
    if (!book) return { ok: false, msg: "书不存在" };
    var maxN = 0;
    d.chapters.forEach(function (c) { if (c.bookId === bookId && c.num > maxN) maxN = c.num; });
    var nextNum = maxN + 1;
    var mustPay = [];
    if (Array.isArray(payload.foreshadowIds)) {
      payload.foreshadowIds.forEach(function (fid) {
        var f = nvForeshadow(fid);
        if (f && f.bookId === bookId && f.status !== "paid") mustPay.push(f);
      });
    }
    var suggestFs = pending.filter(function (f) { return f.status === "pending"; }).slice(0, 3);
    var outline = "【续写提纲 #" + nextNum + "】\n" +
      "承接：" + (payload.tailFromPrev || "（未填）") + "\n" +
      "本章目标：" + (payload.goal || "（未填）") + "\n" +
      "必出角色：" + (payload.mustChars || "（未填）") + "\n" +
      "必兑现伏笔：" + (mustPay.map(function (f) { return f.title + "(#ch" + (f.setupChapter || "?") + ")"; }).join("、") || "（无）") + "\n" +
      "建议兑现伏笔：" + (suggestFs.map(function (f) { return f.title; }).join("、") || "（无）") + "\n" +
      "状态：提纲级（请作者自行扩展为正文）";
    var lastCh = d.chapters.filter(function (c) { return c.bookId === bookId; }).sort(function (a, b) { return b.num - a.num; })[0];
    if (lastCh) {
      if (!lastCh.notes) lastCh.notes = [];
      lastCh.notes.push({ kind: "continue", nextNum: nextNum, outline: outline, ts: new Date().toISOString() });
    }
    nvSave();
    return { ok: true, outline: outline, mustPay: mustPay, suggestFs: suggestFs, nextNum: nextNum };
  }

  // ============================================================
  // 7. 自动化推进队列（skill：批量写作 N 章）
  // ============================================================
  function nvEnqueueAdvance(bookId, total, opts) {
    opts = opts || {};
    var d = nvDB();
    var maxN = 0;
    d.chapters.forEach(function (c) { if (c.bookId === bookId && c.num > maxN) maxN = c.num; });
    var task = {
      id: nvUid("adv"),
      bookId: bookId,
      total: total,
      currentNum: maxN + 1,
      status: "pending",
      threshold: opts.threshold || 85,
      maxRevisions: opts.maxRevisions || 2,
      log: [{ ts: new Date().toISOString(), kind: "start", text: "开始批量写作 " + total + " 章 · 起始第 " + (maxN + 1) + " 章 · 阈值 " + (opts.threshold || 85) + " 分" }],
      createdAt: new Date().toISOString()
    };
    if (!d.advances) d.advances = [];
    d.advances.push(task);
    nvSave();
    return task;
  }

  function nvAdvanceStep(taskId) {
    var d = nvDB();
    var task = d.advances.find(function (t) { return t.id === taskId; });
    if (!task) return { ok: false, msg: "任务不存在" };
    if (task.status === "done") return { ok: false, msg: "任务已完成" };
    if (task.currentNum > task.total) { task.status = "done"; nvSave(); return { ok: true, done: true }; }
    var chNum = task.currentNum;
    var book = nvGet(task.bookId);
    if (!book) return { ok: false, msg: "书不存在" };
    var pendingFs = nvBookPendingFs(task.bookId).slice(0, 2);
    var bookChars = d.chars.filter(function (c) { return c.bookId === task.bookId; }).slice(0, 2);
    var lastCh = d.chapters.filter(function (c) { return c.bookId === task.bookId && c.num === chNum - 1; })[0];

    var spec = {
      before: {
        characters: bookChars.map(function (c) { return { name: c.name, state: c.arc || "—", location: "—", hooks: [] }; }),
        hooks: pendingFs.map(function (f) { return f.title; })
      },
      after: {
        characters: bookChars.map(function (c) { return { name: c.name, state: "推进中", location: "—", advances: [] }; }),
        advances: pendingFs.map(function (f) { return f.title + " → 待兑"; })
      },
      must_happen: ["承接上一章末尾", "推进主线", "埋下/回收 1 个伏笔"],
      tension: [
        { position: 0, value: 3, note: "承接" },
        { position: 50, value: 7, note: "核心事件" },
        { position: 100, value: 5, note: "钩子收尾" }
      ],
      key_scenes: ["场景 1：承接场景", "场景 2：推进场景", "场景 3：钩子场景"],
      new_hooks: ["新悬念 " + (chNum + 1)]
    };

    var newCh = {
      id: nvUid("ch"),
      bookId: task.bookId,
      num: chNum,
      volume: book.volumes && book.volumes[0] ? book.volumes[0].num : 1,
      title: "第 " + chNum + " 章（待写）",
      goal: "推进主线 · 回收伏笔：「" + (pendingFs[0] ? pendingFs[0].title : "—") + "」",
      draft: "【占位正文】\n请根据 spec 撰写 3000-5000 字正文。\n承接：" + (lastCh ? "第 " + (chNum - 1) + " 章「" + lastCh.title + "」末尾" : "全书开场") + "\n\n（本占位文本用于推进任务流。手动编辑时点击「✏️ 编辑正文」。）",
      wordCount: 0,
      status: "spec",
      spec: spec,
      reviewFlags: [],
      notes: [],
      createdAt: new Date().toISOString()
    };
    d.chapters.push(newCh);

    var rev = nvAutoReview(newCh.id);
    if (rev) {
      var reviewObj = {
        id: nvUid("rev"),
        chapterId: newCh.id,
        scores: rev.scores,
        flags: rev.flags,
        notes: "（自动跑分 · 占位草稿）",
        finalScore: rev.finalScore,
        ts: new Date().toISOString()
      };
      d.reviews.push(reviewObj);
    }

    task.log.push({ ts: new Date().toISOString(), kind: "step", text: "第 " + chNum + " 章 spec 已生成 · 5 维自动评审 " + (rev ? rev.finalScore : "?") + " 分（占位文本，需写正文后提升）" });
    task.currentNum++;
    task.status = task.currentNum > task.total ? "done" : "running";
    nvSave();
    return { ok: true, task: task, chapter: newCh, review: rev };
 }

  // ============================================================
  // 8. UI 工具
  // ============================================================
  function esc(s) {
    if (typeof escapeHtml === "function") return escapeHtml(String(s == null ? "" : s));
    return String(s == null ? "" : "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function badge(text, color) {
    return '<span class="nv-b" style="background:' + color + '22;color:' + color + '">' + esc(text) + '</span>';
  }
  function today() { return (typeof root.today === "function") ? root.today() : new Date().toISOString().slice(0, 10); }

  // ============================================================
  // 9. 路由
  // ============================================================
  var TABS = [
    { k: "overview", t: "📋 设定" },
    { k: "outline",  t: "🗺️ 大纲" },
    { k: "spec",     t: "📝 规格" },
    { k: "writing",  t: "✍️ 正文" },
    { k: "review",   t: "🔍 评审" },
    { k: "advance",  t: "🚀 推进" }
  ];
  function getTab() { return (typeof root.NV_TAB !== "undefined") ? root.NV_TAB : "overview"; }
  function getView() { return (typeof root.NV_VIEW !== "undefined") ? root.NV_VIEW : "list"; }

  function renderNovel() {
    var c = document.getElementById("app-content");
    if (!c) return;
    nvLoadSeed();
    var v = getView();
    if (v && v !== "list") {
      var p = v.split(":");
      if (p[0] === "chapter") return renderNovelChapterDetail(c, p[1]);
      if (p[0] === "char") return renderNovelCharDetail(c, p[1]);
      if (p[0] === "foreshadow") return renderNovelFsDetail(c, p[1]);
      if (p[0] === "advance") return renderNovelAdvanceDetail(c, p[1]);
    }
    var t = getTab();
    if (t === "outline")  return renderNovelOutline(c);
    if (t === "spec")     return renderNovelSpec(c);
    if (t === "writing")  return renderNovelWriting(c);
    if (t === "review")   return renderNovelReview(c);
    if (t === "advance")  return renderNovelAdvance(c);
    return renderNovelOverview(c);
  }

  function tabBarHtml() {
    var t = getTab();
    return '<div class="nv-tabs">' + TABS.map(function (x) {
      return '<span class="nv-tab' + (t === x.k ? " active" : "") + '" onclick="NV_TAB=\'' + x.k + '\';NV_VIEW=\'list\';render()">' + x.t + '</span>';
    }).join("") + '</div>';
  }

  // ============================================================
  // 10. 📋 设定视图
  // ============================================================
  function renderNovelOverview(c) {
    var d = nvDB();
    var books = d.books || [];
    var totalPending = 0, totalLost = 0;
    d.foreshadows.forEach(function (f) {
      if (f.status === "pending" || f.status === "setup") totalPending++;
      if (f.status === "lost") totalLost++;
    });
    var totalWords = 0;
    books.forEach(function (b) { totalWords += nvBookWordCount(b.id); });

    var html = '<div class="section-title"><span class="emoji">📚</span> 小说创作</div>';
    html += '<div class="card nv-intro"><div class="card-body">' +
      '<div class="nv-intro-line"><strong>模块化写作闭环</strong>：设定 → 大纲 → 规格 → 正文 → 评审 → 推进。5 维评审 · P0/P1/P2 红线 · 批量推进。</div>' +
      '<div class="nv-rule-chips">' +
      '<span class="nv-chip">📚 ' + books.length + ' 本书</span>' +
      '<span class="nv-chip">✍️ ' + totalWords.toLocaleString() + ' 字</span>' +
      '<span class="nv-chip">⏳ ' + totalPending + ' 待兑伏笔</span>' +
      '<span class="nv-chip">' + (totalLost > 0 ? '⚠ ' : '✓ ') + totalLost + ' 遗失</span>' +
      '</div>' +
      '<div class="nv-intro-actions">' +
      '<button class="btn btn-primary sm" onclick="nvExportJson()">📤 导出 JSON</button>' +
      '<button class="btn btn-ghost sm" onclick="nvImportJsonPrompt()">📥 导入</button>' +
      '</div>' +
      '</div></div>';

    html += tabBarHtml();

    var sub = (typeof root.NV_OVERVIEW_SUB !== "undefined") ? root.NV_OVERVIEW_SUB : "chars";
    var subs = [{k:"chars",t:"👤 角色 ("+d.chars.length+")"},{k:"events",t:"⚡ 事件 ("+d.events.length+")"},{k:"foreshadows",t:"🌱 伏笔 ("+d.foreshadows.length+")"},{k:"world",t:"🌍 世界观"}];
    html += '<div class="nv-subtabs">' + subs.map(function(x){
      return '<span class="nv-subtab' + (sub === x.k ? " active" : "") + '" onclick="NV_OVERVIEW_SUB=\'' + x.k + '\';render()">' + x.t + '</span>';
    }).join("") + '</div>';

    if (sub === "events") return renderOverviewEvents(c, html);
    if (sub === "foreshadows") return renderOverviewForeshadows(c, html);
    if (sub === "world") return renderOverviewWorld(c, html);
    return renderOverviewChars(c, html);
  }

  // 世界观表（my-novel-writer skill 模板：基础设定/核心规则/历史传说/重要地点/伏笔悬念）
  function renderOverviewWorld(c, head) {
    var d = nvDB();
    var editBook = (typeof root.NV_WORLD_EDIT !== "undefined") ? root.NV_WORLD_EDIT : null;
    d.books.forEach(function (b) {
      head += '<div class="card nv-world-card"><div class="card-body">' +
        '<div class="nv-detail-h">🌍 ' + esc(b.title) +
        (b.style ? ' <span class="nv-b" style="background:#8b5cf622;color:#8b5cf6">' + esc(b.style) + '</span>' : '') +
        ' <span class="nv-b" style="background:#0ea5e922;color:#0ea5e9">' + (b.pov === "first" ? "第一人称" : "第三人称") + '</span></div>';
      if (b.world) {
        var w = b.world;
        if (w.basic) head += '<div class="nv-w-row"><b>🌐 基础设定</b>：' + esc(w.basic) + '</div>';
        if (w.rules) head += '<div class="nv-w-row"><b>🔮 核心规则</b>：' + esc(w.rules) + '</div>';
        if (w.history) head += '<div class="nv-w-row"><b>📜 历史传说</b>：' + esc(w.history) + '</div>';
        if (w.places && w.places.length) head += '<div class="nv-w-row"><b>🏙️ 重要地点</b>：' + w.places.map(function (p) { return badge(typeof p === "string" ? p : (p.name || "—"), "#0ea5e9"); }).join(" ") + '</div>';
        if (w.customs) head += '<div class="nv-w-row"><b>📚 文化习俗</b>：' + esc(w.customs) + '</div>';
        if (w.mystery) head += '<div class="nv-w-row"><b>⚠️ 伏笔悬念</b>：' + esc(w.mystery) + '</div>';
      } else {
        head += '<div class="nv-dim" style="margin-top:6px">暂无世界观设定 · 点「✏️ 编辑」按模板填写（基础设定/核心规则/历史传说/重要地点/文化习俗/伏笔悬念）</div>';
      }
      head += '<div style="margin-top:8px"><button class="btn btn-ghost sm" onclick="nvWorldEdit(\'' + b.id + '\')">✏️ 编辑世界观</button></div>';
      if (editBook === b.id) {
        head += '<div class="nv-dim" style="margin-top:6px;font-size:11px">上次编辑保存于 JSON 弹窗 · 字段：basic / rules / history / places / customs / mystery</div>';
      }
      head += '</div></div>';
    });
    c.innerHTML = head;
  }
  root.nvWorldEdit = function (bookId) {
    var b = nvGet(bookId);
    if (!b) return;
    var def = b.world || { basic: "", rules: "", history: "", places: [], customs: "", mystery: "" };
    var s = prompt("编辑世界观（JSON）：", JSON.stringify(def, null, 2));
    if (s === null) return;
    try { b.world = JSON.parse(s); nvSave(); root.NV_WORLD_EDIT = bookId; if (typeof render === "function") render(); }
    catch (e) { if (typeof showToast === "function") showToast("JSON 解析失败：" + e.message, "error"); }
  };

  function renderOverviewChars(c, head) {
    var d = nvDB();
    head += '<div class="nv-list">';
    d.chars.forEach(function (ch) {
      var book = nvGet(ch.bookId);
      head += '<div class="nv-list-item" onclick="NV_VIEW=\'char:' + ch.id + '\';render()">' +
        '<div class="nv-li-h"><b>' + esc(ch.name) + '</b> <span class="nv-dim">' + esc(book ? book.title : "") + '</span></div>' +
        '<div class="nv-li-sub">' + badge(ch.role, "#8b5cf6") + ' ' +
        badge(ch.status || "alive", ch.status === "dead" ? "#64748b" : "#10b981") + '</div>' +
        '<div class="nv-li-text nv-dim">人物弧：' + esc(ch.arc || "") + '</div>' +
        '</div>';
    });
    head += '</div>';
    c.innerHTML = head;
  }

  function renderOverviewEvents(c, head) {
    var d = nvDB();
    head += '<div class="nv-list">';
    d.events.slice().sort(function(a,b){return a.chapter-b.chapter || (a.bookId||"").localeCompare(b.bookId||"");}).forEach(function (ev) {
      var book = nvGet(ev.bookId);
      head += '<div class="nv-list-item">' +
        '<div class="nv-li-h"><b>第 ' + ev.chapter + ' 章 · ' + esc(ev.title) + '</b> <span class="nv-dim">' + esc(book ? book.title : "") + '</span></div>' +
        '<div class="nv-li-sub">' + badge(ev.type === "conflict" ? "冲突" : ev.type === "timeline" ? "时间跨度" : "剧情", "#0ea5e9") + '</div>' +
        '<div class="nv-li-text">' + esc(ev.summary) + '</div>' +
        '</div>';
    });
    head += '</div>';
    c.innerHTML = head;
  }

  function renderOverviewForeshadows(c, head) {
    var d = nvDB();
    d.books.forEach(function (book) {
      var g = nvBookForeshadows(book.id);
      head += '<div class="nv-fs-book"><div class="nv-fs-book-h">' + esc(book.title) + ' · ' +
        badge("已埋 " + g.setup.length, FORESHADOW_COLOR.setup) + ' ' +
        badge("待兑 " + g.pending.length, FORESHADOW_COLOR.pending) + ' ' +
        badge("已兑 " + g.paid.length, FORESHADOW_COLOR.paid) + ' ' +
        badge("遗失 " + g.lost.length, FORESHADOW_COLOR.lost) + '</div>';
      [].concat(g.setup, g.pending, g.paid, g.lost).forEach(function (f) {
        head += '<div class="nv-fs-item" onclick="NV_VIEW=\'foreshadow:' + f.id + '\';render()">' +
          '<div class="nv-li-h"><b>' + esc(f.title) + '</b> ' + badge(FORESHADOW_LABEL[f.status], FORESHADOW_COLOR[f.status]) +
          ' <span class="nv-dim">· 埋于第 ' + f.setupChapter + ' 章' + (f.payoffChapter ? ' · 兑于第 ' + f.payoffChapter + ' 章' : '') + '</span></div>' +
          '<div class="nv-li-text">「' + esc(f.setupSnippet) + '」</div>' +
          (f.note ? '<div class="nv-li-text nv-dim">📌 ' + esc(f.note) + '</div>' : '') +
          '</div>';
      });
      head += '</div>';
    });
    c.innerHTML = head;
  }

  function renderNovelCharDetail(c, charId) {
    var ch = nvChar(charId);
    if (!ch) { c.innerHTML = '<div class="empty-state"><div class="empty-text">角色不存在</div></div>'; return; }
    var html = '<div style="display:flex;gap:8px;margin-bottom:10px"><button class="btn btn-ghost sm" onclick="NV_VIEW=\'list\';render()">← 返回</button></div>';
    html += '<div class="card"><div class="card-body">' +
      '<div class="nv-detail-h">' + esc(ch.name) + ' <span class="nv-dim">' + esc(nvGet(ch.bookId) ? nvGet(ch.bookId).title : "") + '</span></div>' +
      '<div class="nv-detail-row">' + badge(ch.role, "#8b5cf6") + ' ' + badge(ch.status || "alive", ch.status === "dead" ? "#64748b" : "#10b981") + ' · 首次出场：第 ' + ch.firstAppearChapter + ' 章</div>' +
      '<div class="nv-detail-row"><b>人物弧</b>：' + esc(ch.arc || "") + '</div>' +
      '<div class="nv-detail-row"><b>性格</b>：' + (ch.traits || []).map(function (t) { return badge(t, "#0a84ff"); }).join(" ") + '</div>' +
      '<div class="nv-detail-row"><b>秘密</b>：' + (ch.secrets || []).map(function (t) { return '<div class="nv-dim">· ' + esc(t) + '</div>'; }).join("") + '</div>' +
      '<div class="nv-detail-row"><b>关系</b>：';
    (ch.relationships || []).forEach(function (r) {
      var o = nvChar(r.with);
      html += '<div class="nv-rel-line">' + badge(o ? o.name : r.with, "#475569") + ' · ' + esc(r.type) + '</div>';
    });
    html += '</div></div></div>';
    // 人物卡（my-novel-writer skill 模板：外貌/心理/秘密/成长弧光）
    if (ch.card) {
      var cd = ch.card;
      html += '<div class="card"><div class="card-body">' +
        '<div class="nv-detail-h">📇 人物卡</div>';
      if (cd.appearance) html += '<div class="nv-detail-row"><b>外貌特征</b>：' + esc(cd.appearance) + '</div>';
      if (cd.fear) html += '<div class="nv-detail-row"><b>恐惧/执念</b>：' + esc(cd.fear) + '</div>';
      if (cd.catchphrase) html += '<div class="nv-detail-row"><b>口头禅/习惯</b>：' + esc(cd.catchphrase) + '</div>';
      if (cd.secret) html += '<div class="nv-detail-row"><b>秘密</b>：' + esc(cd.secret) + '</div>';
      if (cd.arcStart || cd.arcConflict || cd.arcTurn || cd.arcEnd) {
        html += '<div class="nv-detail-row"><b>📈 成长弧光</b>：' +
          '<div class="nv-arc-line">起点：' + esc(cd.arcStart || "—") + '</div>' +
          '<div class="nv-arc-line">冲突：' + esc(cd.arcConflict || "—") + '</div>' +
          '<div class="nv-arc-line">转折：' + esc(cd.arcTurn || "—") + '</div>' +
          '<div class="nv-arc-line">终点：' + esc(cd.arcEnd || "—") + '</div></div>';
      }
      html += '<div style="margin-top:8px"><button class="btn btn-ghost sm" onclick="nvCardEdit(\'' + ch.id + '\')">✏️ 编辑人物卡</button></div>' +
        '</div></div>';
    } else {
      html += '<div class="card"><div class="card-body">' +
        '<div class="nv-detail-h">📇 人物卡</div>' +
        '<div class="nv-dim" style="margin-top:4px">暂无人物卡 · 模板字段：外貌 / 恐惧执念 / 口头禅 / 秘密 / 成长弧光（起点·冲突·转折·终点）</div>' +
        '<div style="margin-top:8px"><button class="btn btn-ghost sm" onclick="nvCardEdit(\'' + ch.id + '\')">✏️ 创建人物卡</button></div>' +
        '</div></div>';
    }
    c.innerHTML = html;
  }
  root.nvCardEdit = function (charId) {
    var ch = nvChar(charId);
    if (!ch) return;
    var def = ch.card || { appearance: "", fear: "", catchphrase: "", secret: "", arcStart: "", arcConflict: "", arcTurn: "", arcEnd: "" };
    var s = prompt("编辑人物卡（JSON）：", JSON.stringify(def, null, 2));
    if (s === null) return;
    try { ch.card = JSON.parse(s); nvSave(); if (typeof render === "function") render(); }
    catch (e) { if (typeof showToast === "function") showToast("JSON 解析失败：" + e.message, "error"); }
  };

  function renderNovelFsDetail(c, fsId) {
    var f = nvForeshadow(fsId);
    if (!f) { c.innerHTML = '<div class="empty-state"><div class="empty-text">伏笔不存在</div></div>'; return; }
    var book = nvGet(f.bookId);
    var html = '<div style="display:flex;gap:8px;margin-bottom:10px"><button class="btn btn-ghost sm" onclick="NV_VIEW=\'list\';NV_TAB=\'overview\';NV_OVERVIEW_SUB=\'foreshadows\';render()">← 返回</button></div>';
    html += '<div class="card"><div class="card-body">' +
      '<div class="nv-detail-h">' + esc(f.title) + ' <span class="nv-dim">' + esc(book ? book.title : "") + '</span></div>' +
      '<div class="nv-detail-row">' + badge(FORESHADOW_LABEL[f.status], FORESHADOW_COLOR[f.status]) + ' · 铺设于第 ' + f.setupChapter + ' 章' + (f.payoffChapter ? ' · 兑现于第 ' + f.payoffChapter + ' 章' : '') + '</div>' +
      '<div class="nv-detail-row"><b>原文出处</b>：<div class="nv-quote">「' + esc(f.setupSnippet) + '」</div></div>' +
      (f.note ? '<div class="nv-detail-row"><b>笔记</b>：' + esc(f.note) + '</div>' : '') +
      '<div class="nv-detail-row"><b>状态迁移（状态机）</b>：<div class="nv-fs-trans">';
    FORESHADOW_STATUS.forEach(function (st) {
      if (st === f.status) return;
      var r = nvFsTransition(f, st);
      html += '<button class="btn btn-ghost sm" ' + (r.ok ? '' : 'disabled title="' + esc(r.msg) + '"') + ' onclick="nvFsTrans(\'' + f.id + '\',\'' + st + '\')">→ ' + FORESHADOW_LABEL[st] + '</button>';
    });
    html += '</div></div></div></div>';
    c.innerHTML = html;
  }

  root.nvFsTrans = function (fsId, next) {
    var f = nvForeshadow(fsId);
    var r = nvFsTransition(f, next);
    if (r.ok) { nvSave(); if (typeof render === "function") render(); }
    else if (typeof showToast === "function") showToast(r.msg, "error");
  };

  // ============================================================
  // 11. 🗺️ 大纲视图（含红线规则展示 + 续写脚手架）
  // ============================================================
  function renderNovelOutline(c) {
    var d = nvDB();
    var html = '<div class="section-title"><span class="emoji">🗺️</span> 大纲</div>';
    html += tabBarHtml();
    html += '<div class="card nv-rules-card"><div class="card-body">' +
      '<div class="nv-detail-h">🚦 红线规则（写作参考）</div>' +
      '<div class="nv-rules">' +
      '<div class="nv-rule-block"><b class="nv-rule-p0">P0 绝对禁止</b><ul>' +
      RED_LINES.P0.map(function(r){ return '<li><b>' + esc(r.label) + '</b> · 修法：' + esc(r.fix) + '</li>'; }).join("") +
      '</ul></div>' +
      '<div class="nv-rule-block"><b class="nv-rule-p1">P1 建议避免</b><ul>' +
      RED_LINES.P1.map(function(r){ return '<li><b>' + esc(r.label) + '</b> · 修法：' + esc(r.fix) + '</li>'; }).join("") +
      '</ul></div>' +
      '<div class="nv-rule-block"><b class="nv-rule-p2">P2 可选优化</b><ul>' +
      RED_LINES.P2.map(function(r){ return '<li><b>' + esc(r.label) + '</b> · 修法：' + esc(r.fix) + '</li>'; }).join("") +
      '</ul></div>' +
      '</div></div></div>';

    d.books.forEach(function (book) {
      html += '<div class="nv-outline-book">' +
        '<div class="nv-outline-h">' + esc(book.title) + ' <span class="nv-dim">· ' + esc(book.world || "") + '</span></div>';
      (book.volumes || []).forEach(function (vol) {
        html += '<div class="nv-outline-vol">📘 ' + esc(vol.title) + '</div><div class="nv-outline-chs">';
        (vol.chapters || []).forEach(function (ch) {
          html += '<div class="nv-outline-ch"><b>第 ' + ch.num + ' 章 ' + esc(ch.title) + '</b>' +
            (ch.goal ? '<div class="nv-dim">' + esc(ch.goal) + '</div>' : '') + '</div>';
        });
        html += '</div>';
      });
      html += '</div>';
    });

    html += '<div class="card nv-scaffold-card"><div class="card-body">' +
      '<div class="nv-detail-h">🛠 续写脚手架（不调 LLM）</div>' +
      '<div class="nv-form"><label>目标书</label><select id="nv-cont-book">' + d.books.map(function (b) { return '<option value="' + b.id + '">' + esc(b.title) + '</option>'; }).join("") + '</select>' +
      '<label>承接上一章</label><textarea id="nv-cont-tail" rows="2"></textarea>' +
      '<label>本章目标</label><textarea id="nv-cont-goal" rows="2"></textarea>' +
      '<label>必出角色</label><input id="nv-cont-chars" placeholder="例：林渊 姜禾">' +
      '<label>必兑现伏笔（setup+pending）</label><div id="nv-cont-fs" class="nv-fs-checks"></div>' +
      '<button class="btn btn-primary" onclick="nvDoContinue()">生成续写提纲</button>' +
      '<div id="nv-cont-out"></div></div></div></div>';
    c.innerHTML = html;
    setTimeout(function () {
      var box = document.getElementById("nv-cont-fs");
      if (!box) return;
      var pending = [];
      d.foreshadows.forEach(function (f) { if (f.status === "setup" || f.status === "pending") pending.push(f); });
      if (!pending.length) { box.innerHTML = '<span class="nv-dim">暂无待兑现伏笔</span>'; return; }
      box.innerHTML = pending.map(function (f) {
        var b = nvGet(f.bookId);
        return '<label class="nv-fs-check"><input type="checkbox" value="' + f.id + '" data-book="' + f.bookId + '" onclick="nvContFilterFs(this)">' +
          esc(f.title) + ' <span class="nv-dim">（' + esc(b ? b.title : "") + '）</span></label>';
      }).join("");
    }, 0);
  }

  root.nvContFilterFs = function (cb) {
    var sel = document.getElementById("nv-cont-book");
    if (!sel) return;
    var bid = sel.value;
    document.querySelectorAll("#nv-cont-fs label").forEach(function (lb) {
      var inp = lb.querySelector("input");
      if (inp.getAttribute("data-book") === bid) lb.style.display = "";
      else lb.style.display = "none";
    });
  };
  root.nvDoContinue = function () {
    var bid = document.getElementById("nv-cont-book").value;
    var r = nvScaffoldContinue(bid, {
      tailFromPrev: document.getElementById("nv-cont-tail").value,
      goal: document.getElementById("nv-cont-goal").value,
      mustChars: document.getElementById("nv-cont-chars").value,
      foreshadowIds: Array.prototype.slice.call(document.querySelectorAll("#nv-cont-fs input:checked")).map(function (x) { return x.value; })
    });
    var out = document.getElementById("nv-cont-out");
    if (r.ok) {
      out.innerHTML = '<div class="nv-result"><pre>' + esc(r.outline) + '</pre>' +
        (r.suggestFs.length ? '<div class="nv-dim">📌 建议同时兑现：' + r.suggestFs.map(function (f) { return esc(f.title); }).join("、") + '</div>' : '') + '</div>';
    } else {
      out.innerHTML = '<div class="nv-result nv-result-err">' + esc(r.msg) + '</div>';
    }
  };

  // ============================================================
  // 12. 📝 规格视图
  // ============================================================
  function renderNovelSpec(c) {
    var d = nvDB();
    var bookId = (typeof root.NV_SPEC_BOOK !== "undefined") ? root.NV_SPEC_BOOK : (d.books[0] ? d.books[0].id : null);
    var html = '<div class="section-title"><span class="emoji">📝</span> 规格（章节 spec）</div>';
    html += tabBarHtml();
    html += '<div class="card nv-spec-help"><div class="card-body">' +
      '<div class="nv-detail-h">📋 规格字段说明</div>' +
      '<div class="nv-dim">每章 spec 含 6 块：<b>before state</b>（开篇人物/位置/未回收伏笔）· <b>after state</b>（结尾人物/伏笔推进）· <b>must_happen</b>（必发生事件）· <b>tension_curve</b>（4 点张力曲线）· <b>key_scenes</b>（关键场景）· <b>new_hooks</b>（新悬念）。</div>' +
      '</div></div>';

    html += '<div class="card"><div class="card-body">' +
      '<label>目标书</label><select onchange="NV_SPEC_BOOK=this.value;render()">' + d.books.map(function (b) {
        return '<option value="' + b.id + '"' + (b.id === bookId ? " selected" : "") + '>' + esc(b.title) + '</option>';
      }).join("") + '</select></div></div>';

    if (!bookId) { html += '<div class="empty-state"><div class="empty-text">请先创建一本书</div></div>'; c.innerHTML = html; return; }

    var chs = d.chapters.filter(function (x) { return x.bookId === bookId; }).sort(function (a, b) { return a.num - b.num; });
    html += '<div class="nv-list">';
    chs.forEach(function (ch) {
      var hasSpec = !!ch.spec;
      var specScore = hasSpec ? "✓" : "✗";
      var flagCount = (ch.reviewFlags || []).length;
      html += '<div class="nv-list-item" onclick="NV_VIEW=\'chapter:' + ch.id + '\';render()">' +
        '<div class="nv-li-h"><b>第 ' + ch.num + ' 章 · ' + esc(ch.title) + '</b> ' +
        badge("spec " + specScore, hasSpec ? "#10b981" : "#94a3b8") +
        (flagCount ? badge("红线 " + flagCount, "#ef4444") : "") + '</div>' +
        (hasSpec ? '<div class="nv-li-text">' +
          '<b>before:</b> ' + (ch.spec.before.characters || []).map(function(x){return esc(x.name);}).join("、") + ' · ' +
          '<b>after:</b> ' + (ch.spec.after.characters || []).map(function(x){return esc(x.name);}).join("、") + '</div>' +
          '<div class="nv-li-text nv-dim">' +
          'must_happen × ' + (ch.spec.must_happen || []).length + ' · ' +
          'tension ' + (ch.spec.tension || []).length + ' 点 · ' +
          'key_scenes × ' + (ch.spec.key_scenes || []).length + '</div>'
          : '<div class="nv-li-text nv-dim">⚠ 暂无 spec · 点章详情生成</div>') +
        '</div>';
    });
    html += '</div>';
    c.innerHTML = html;
  }

  // ============================================================
  // 13. ✍️ 正文视图（章列表 + 编辑 + 润色）
  // ============================================================
  function renderNovelWriting(c) {
    var d = nvDB();
    var html = '<div class="section-title"><span class="emoji">✍️</span> 正文</div>';
    html += tabBarHtml();
    var bookId = (typeof root.NV_WRITE_BOOK !== "undefined") ? root.NV_WRITE_BOOK : (d.books[0] ? d.books[0].id : null);
    if (!bookId) { html += '<div class="empty-state"><div class="empty-text">暂无书</div></div>'; c.innerHTML = html; return; }

    html += '<div class="card"><div class="card-body">' +
      '<label>目标书</label><select onchange="NV_WRITE_BOOK=this.value;render()">' + d.books.map(function (b) {
        return '<option value="' + b.id + '"' + (b.id === bookId ? " selected" : "") + '>' + esc(b.title) + '</option>';
      }).join("") + '</select></div></div>';

    var chs = d.chapters.filter(function (x) { return x.bookId === bookId; }).sort(function (a, b) { return a.num - b.num; });
    html += '<div class="nv-write-book">' +
      '<div class="nv-write-book-h">' + esc(nvGet(bookId).title) + ' · ' + chs.length + ' 章 · ' + nvBookWordCount(bookId).toLocaleString() + ' 字</div>';
    chs.forEach(function (ch) {
      var sm = CHAPTER_STATUS_META[ch.status] || CHAPTER_STATUS_META.draft;
      html += '<div class="nv-write-ch" onclick="NV_VIEW=\'chapter:' + ch.id + '\';render()">' +
        '<div class="nv-write-ch-l"><b>第 ' + ch.num + ' 章 · ' + esc(ch.title) + '</b></div>' +
        '<div class="nv-write-ch-r">' + badge(sm.label, sm.color) + ' <span class="nv-dim">' + nvCnWordCount(ch.draft) + ' 字</span></div>' +
        '</div>';
    });
    html += '</div>';

    html += '<div class="card nv-scaffold-card"><div class="card-body">' +
      '<div class="nv-detail-h">✨ 润色脚手架</div>' +
      '<div class="nv-form"><label>目标章节</label><select id="nv-pol-ch">' + chs.map(function (ch) {
        var b = nvGet(ch.bookId);
        return '<option value="' + ch.id + '">' + esc(b ? b.title : "?") + ' · 第 ' + ch.num + ' 章 ' + esc(ch.title) + '</option>';
      }).join("") + '</select>' +
      '<label>原文位置</label><textarea id="nv-pol-loc" rows="2" placeholder="例：开篇第 2 段"></textarea>' +
      '<label>问题类型</label><select id="nv-pol-type"><option>啰嗦</option><option>节奏过快</option><option>节奏过慢</option><option>语气不一致</option><option>视角漂移</option><option>其他</option></select>' +
      '<label>期望改法</label><textarea id="nv-pol-expect" rows="2"></textarea>' +
      '<label>必保留关键词</label><input id="nv-pol-keep">' +
      '<button class="btn btn-primary" onclick="nvDoPolish()">写入润色清单</button>' +
      '<div id="nv-pol-out"></div></div></div></div>';
    c.innerHTML = html;
  }
  root.nvDoPolish = function () {
    var cid = document.getElementById("nv-pol-ch").value;
    var r = nvScaffoldPolish(cid, {
      location: document.getElementById("nv-pol-loc").value,
      issueType: document.getElementById("nv-pol-type").value,
      expect: document.getElementById("nv-pol-expect").value,
      keep: document.getElementById("nv-pol-keep").value
    });
    var out = document.getElementById("nv-pol-out");
    if (r.ok) out.innerHTML = '<div class="nv-result">✅ 已写入该章 notes，进入章节详情查看</div>';
    else out.innerHTML = '<div class="nv-result nv-result-err">' + esc(r.msg) + '</div>';
  };

  // ============================================================
  // 14. 章节详情（含 spec / 正文 / 5 维评审 / 红线）
  // ============================================================
  function renderNovelChapterDetail(c, chId) {
    var ch = nvChapter(chId);
    if (!ch) { c.innerHTML = '<div class="empty-state"><div class="empty-text">章节不存在</div></div>'; return; }
    var book = nvGet(ch.bookId);
    var sm = CHAPTER_STATUS_META[ch.status] || CHAPTER_STATUS_META.draft;
    var rev = nvReviewByCh(chId);
    var redHits = nvScanRedLines(ch.draft);
    var notes = ch.notes || [];

    var html = '<div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap">' +
      '<button class="btn btn-ghost sm" onclick="NV_VIEW=\'list\';render()">← 返回</button>' +
      '<button class="btn btn-ghost sm" onclick="nvChStatus(\'' + ch.id + '\',\'draft\')">草稿</button>' +
      '<button class="btn btn-ghost sm" onclick="nvChStatus(\'' + ch.id + '\',\'revised\')">已润色</button>' +
      '<button class="btn btn-ghost sm" onclick="nvChStatus(\'' + ch.id + '\',\'final\')">定稿</button>' +
      '<button class="btn btn-primary sm" onclick="nvChEdit(\'' + ch.id + '\')">✏️ 编辑正文</button>' +
      '<button class="btn btn-primary sm" onclick="nvChEditSpec(\'' + ch.id + '\')">📝 编辑 spec</button>' +
      '<button class="btn btn-ghost sm" onclick="nvChReReview(\'' + ch.id + '\')">🔄 重跑 5 维</button>' +
      '<button class="btn btn-ghost sm" onclick="nvSkillCheck(\'' + ch.id + '\')">✅ 规范检查</button>' +
      '<button class="btn btn-ghost sm" onclick="nvSkillPrompt(\'' + ch.bookId + '\',' + ch.num + ')">🤖 生成 Prompt</button>' +
      '</div>';

    html += '<div class="card"><div class="card-body">' +
      '<div class="nv-detail-h">第 ' + ch.num + ' 章 · ' + esc(ch.title) + ' <span class="nv-dim">' + esc(book ? book.title : "") + '</span></div>' +
      '<div class="nv-detail-row">' + badge(sm.label, sm.color) + ' · ' + nvCnWordCount(ch.draft) + ' 字' +
      (ch.goal ? ' · <span class="nv-dim">目标：' + esc(ch.goal) + '</span>' : '') +
      '</div>';
    if (ch.spec) {
      html += '<div class="nv-spec-card">' +
        '<div class="nv-spec-h">📝 Spec</div>' +
        '<div class="nv-spec-grid">' +
        '<div><b>before:</b><br>' + (ch.spec.before.characters || []).map(function(x){
          return esc(x.name) + '（' + esc(x.state) + '）<br>';
        }).join("") + (ch.spec.before.hooks && ch.spec.before.hooks.length ? '<span class="nv-dim">未回收钩子：' + esc(ch.spec.before.hooks.join("、")) + '</span>' : '') + '</div>' +
        '<div><b>after:</b><br>' + (ch.spec.after.characters || []).map(function(x){
          return esc(x.name) + '（' + esc(x.state) + '）<br>';
        }).join("") + (ch.spec.after.advances && ch.spec.after.advances.length ? '<span class="nv-dim">推进：' + esc(ch.spec.after.advances.join("、")) + '</span>' : '') + '</div>' +
        '</div>' +
        '<div class="nv-spec-row"><b>must_happen：</b>' + (ch.spec.must_happen || []).map(function(x){return badge(x, "#0a84ff");}).join(" ") + '</div>' +
        '<div class="nv-spec-row"><b>tension_curve：</b>' + (ch.spec.tension || []).map(function(x){
          return badge("p"+x.position+"="+x.value, x.value >= 7 ? "#ef4444" : (x.value >= 4 ? "#f59e0b" : "#10b981")) + (x.note ? " "+esc(x.note) : "");
        }).join(" ") + '</div>' +
        '<div class="nv-spec-row"><b>key_scenes：</b>' + (ch.spec.key_scenes || []).map(function(x){return badge(x, "#8b5cf6");}).join(" ") + '</div>' +
        '<div class="nv-spec-row"><b>new_hooks：</b>' + (ch.spec.new_hooks || []).map(function(x){return badge(x, "#0ea5e9");}).join(" ") + '</div>' +
        '</div>';
    } else {
      html += '<div class="nv-dim" style="margin-top:6px">⚠ 暂无 spec · 点「📝 编辑 spec」生成</div>';
    }
    html += '</div></div>';

    html += '<div class="card"><div class="card-body">' +
      '<div class="nv-detail-h">✍️ 正文</div>' +
      '<div class="nv-chapter-text">' + esc(ch.draft).replace(/\n/g, "<br>") + '</div>' +
      '</div></div>';

    if (redHits.length) {
      html += '<div class="card nv-redline-card"><div class="card-body">' +
        '<div class="nv-detail-h">🚦 自动红线扫描（' + redHits.length + ' 项命中）</div>';
      redHits.forEach(function(h){
        html += '<div class="nv-redline-row"><span class="nv-redline-tag nv-tag-' + h.level + '">' + h.level + '</span> ' +
          '<b>' + esc(h.label) + '</b> · 「' + esc(h.sample) + '」 · 修法：' + esc(h.fix) + '</div>';
      });
      html += '</div></div>';
    }

    if ((typeof root.NV_SKILL_CHK !== "undefined") && root.NV_SKILL_CHK === ch.id) {
      var chk = nvSkillChecklist(ch.id);
      if (chk) {
        var chkCol = chk.pass === chk.total ? "#10b981" : (chk.pass >= 4 ? "#f59e0b" : "#ef4444");
        html += '<div class="card nv-skill-card"><div class="card-body">' +
          '<div class="nv-detail-h">✅ 生成规范 v2.0 检查 · <b style="color:' + chkCol + '">' + chk.pass + '/' + chk.total + '</b> 通过</div>';
        chk.items.forEach(function (it) {
          var ic = it.level === "ok" ? "✅" : (it.level === "hint" ? "💡" : (it.level === "P1" ? "🟠" : "🟡"));
          html += '<div class="nv-skill-item">' + ic + ' <b>' + esc(it.label) + '</b>' +
            '<div class="nv-dim" style="font-size:11px;margin-left:22px">' + esc(it.detail) + '</div></div>';
        });
        html += '</div></div>';
      }
    }

    if (rev && rev.scores) {
      var fs = rev.scores;
      html += '<div class="card nv-review-card"><div class="card-body">' +
        '<div class="nv-detail-h">🔍 5 维评审 · 总分 <b style="color:' + (rev.finalScore >= 85 ? '#10b981' : (rev.finalScore >= 75 ? '#f59e0b' : '#ef4444')) + '">' + rev.finalScore + '</b> / 100</div>' +
        '<div class="nv-rv-grid">';
      REVIEW_ROLES.forEach(function(r){
        var s = fs[r.k] || { score: 0, note: "—", weight: r.weight };
        var col = s.score >= 85 ? "#10b981" : (s.score >= 75 ? "#f59e0b" : "#ef4444");
        html += '<div class="nv-rv-cell">' +
          '<div class="nv-rv-label">' + r.label + ' <span class="nv-dim">(' + r.weight + '%)</span></div>' +
          '<div class="nv-rv-val" style="color:' + col + '">' + s.score + '</div>' +
          '<div class="nv-dim" style="font-size:10px;margin-top:3px">' + esc(s.note || "") + '</div>' +
          '</div>';
      });
      html += '</div>';
      if (rev.flags && rev.flags.length) {
        html += '<div class="nv-redline-tags">' + rev.flags.map(function(f){
          return '<span class="nv-redline-tag nv-tag-' + f.split(":")[0] + '">' + esc(f) + '</span>';
        }).join(" ") + '</div>';
      }
      html += '</div></div>';
    }

    if (notes.length) {
      html += '<div class="card"><div class="card-body">' +
        '<div class="nv-detail-h">📋 脚手架笔记（' + notes.length + '）</div>';
      notes.forEach(function (n) {
        var icon = n.kind === "polish" ? "✨" : "📝";
        var tsStr = (n.ts || "").slice(0, 16).replace("T", " ");
        html += '<div class="nv-note-row">' +
          '<div class="nv-note-h">' + icon + ' ' + (n.kind === "polish" ? "润色" : "续写") + ' · ' + esc(tsStr) + '</div>';
        if (n.kind === "polish") {
          html += '<div><b>位置：</b>' + esc(n.location) + '</div>' +
            '<div><b>类型：</b>' + esc(n.issueType) + '</div>' +
            '<div><b>期望：</b>' + esc(n.expect) + '</div>' +
            '<div><b>保留：</b>' + esc(n.keep) + '</div>';
        } else {
          html += '<div><b>新章号：</b>' + esc(n.nextNum) + '</div>' +
            '<pre class="nv-pre">' + esc(n.outline) + '</pre>';
        }
        html += '</div>';
      });
      html += '</div></div>';
    }

    c.innerHTML = html;
  }

  root.nvChStatus = function (chId, st) {
    var ch = nvChapter(chId);
    if (!ch || !CHAPTER_STATUS_META[st]) return;
    ch.status = st;
    if (st === "final" || st === "revised") ch.revisedAt = new Date().toISOString();
    nvSave();
    if (typeof render === "function") render();
  };
  root.nvChEdit = function (chId) {
    var ch = nvChapter(chId);
    if (!ch) return;
    var d = prompt("编辑第 " + ch.num + " 章正文（" + nvCnWordCount(ch.draft) + " 字）：", ch.draft || "");
    if (d === null) return;
    ch.draft = d;
    ch.wordCount = nvCnWordCount(d);
    if (ch.status === "final") ch.status = "revised";
    nvSave();
    if (typeof render === "function") render();
  };
  root.nvChEditSpec = function (chId) {
    var ch = nvChapter(chId);
    if (!ch) return;
    var def = ch.spec || { before:{characters:[],hooks:[]}, after:{characters:[],advances:[]}, must_happen:[], tension:[], key_scenes:[], new_hooks:[] };
    var s = prompt("编辑 spec（JSON）：", JSON.stringify(def, null, 2));
    if (s === null) return;
    try { ch.spec = JSON.parse(s); nvSave(); if (typeof render === "function") render(); }
    catch (e) { if (typeof showToast === "function") showToast("JSON 解析失败：" + e.message, "error"); }
  };
  root.nvChReReview = function (chId) {
    var r = nvAutoReview(chId);
    if (!r) { if (typeof showToast === "function") showToast("章不存在", "error"); return; }
    nvSaveReview(chId, r.scores, r.flags, "（自动跑分）");
    if (typeof showToast === "function") showToast("✅ 重跑完成 · 总分 " + r.finalScore, "success");
    if (typeof render === "function") render();
  };
  root.nvSkillCheck = function (chId) {
    var chk = nvSkillChecklist(chId);
    if (!chk) { if (typeof showToast === "function") showToast("章不存在", "error"); return; }
    root.NV_SKILL_CHK = chId;
    if (typeof showToast === "function") showToast(chk.pass === chk.total ? "✅ 规范全过 " + chk.pass + "/" + chk.total : "⚠ 规范检查 " + chk.pass + "/" + chk.total + " · 详见下方", chk.pass === chk.total ? "success" : "warn");
    if (typeof render === "function") render();
  };
  root.nvSkillPrompt = function (bookId, chNum) {
    var p = nvBuildPrompt(bookId, chNum);
    if (!p) { if (typeof showToast === "function") showToast("书不存在", "error"); return; }
    var done = function () { if (typeof showToast === "function") showToast("📋 生成 Prompt 已复制 · 粘贴到任意 LLM 即可", "success"); };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(p).then(done, function () { prompt("复制生成 Prompt（Cmd+C）：", p); });
      } else {
        prompt("复制生成 Prompt（Cmd+C）：", p);
      }
    } catch (e) { prompt("复制生成 Prompt（Cmd+C）：", p); }
  };

  // ============================================================
  // 15. 🔍 评审视图（5 维 + 红线全章统计）
  // ============================================================
  function renderNovelReview(c) {
    var d = nvDB();
    var html = '<div class="section-title"><span class="emoji">🔍</span> 评审</div>';
    html += tabBarHtml();
    html += '<div class="card"><div class="card-body">' +
      '<div class="nv-detail-h">5 维评审口径</div>' +
      '<div class="nv-rule-chips">' + REVIEW_ROLES.map(function(r){
        return '<span class="nv-chip">' + r.label + ' · ' + r.weight + '% · ' + esc(r.focus) + '</span>';
      }).join("") + '</div>' +
      '<div class="nv-dim" style="margin-top:6px">通过阈值 85 分 · 总分 = 加权平均 · 红线扫描基于正则，命中 P0 直接 -20 分（编审）。</div>' +
      '</div></div>';

    d.books.forEach(function (book) {
      var bookChs = d.chapters.filter(function (x) { return x.bookId === book.id; }).sort(function (a, b) { return a.num - b.num; });
      html += '<div class="nv-fs-book"><div class="nv-fs-book-h">' + esc(book.title) + '</div>';
      bookChs.forEach(function (ch) {
        var rev = nvReviewByCh(ch.id);
        var redHits = nvScanRedLines(ch.draft);
        var fs = rev && rev.scores;
        var total = rev ? rev.finalScore : null;
        var repColor = !fs ? "#94a3b8" : (total >= 85 ? "#10b981" : (total >= 75 ? "#f59e0b" : "#ef4444"));
        html += '<div class="nv-rev-row" onclick="NV_VIEW=\'chapter:' + ch.id + '\';render()">' +
          '<div class="nv-rev-h">第 ' + ch.num + ' 章 · ' + esc(ch.title) + '</div>';
        if (fs) {
          html += '<div class="nv-rv-grid">' + REVIEW_ROLES.map(function(r){
            var s = fs[r.k] || { score: 0 };
            var col = s.score >= 85 ? "#10b981" : (s.score >= 75 ? "#f59e0b" : "#ef4444");
            return '<div class="nv-rv-cell-mini"><div class="nv-rv-label-mini">' + r.label.split(" ")[1] + '</div><div class="nv-rv-val-mini" style="color:' + col + '">' + s.score + '</div></div>';
          }).join("") + '</div>' +
          '<div class="nv-rev-total" style="border-left:3px solid ' + repColor + '">总分 <b>' + total + '</b> · 字数 ' + nvCnWordCount(ch.draft) + '</div>';
        } else {
          html += '<div class="nv-dim">⚠ 暂无评审 · 点章详情重跑</div>';
        }
        if (redHits.length) {
          html += '<div class="nv-redline-tags">' + redHits.slice(0, 6).map(function(h){
            return '<span class="nv-redline-tag nv-tag-' + h.level + '">' + h.level + ':' + esc(h.label) + '</span>';
          }).join("") + '</div>';
        }
        html += '</div>';
      });
      html += '</div>';
    });

    c.innerHTML = html;
  }

  // ============================================================
  // 16. 🚀 推进视图（批量写作）
  // ============================================================
  function renderNovelAdvance(c) {
    var d = nvDB();
    var html = '<div class="section-title"><span class="emoji">🚀</span> 推进（批量写作）</div>';
    html += tabBarHtml();
    html += '<div class="card nv-advance-intro"><div class="card-body">' +
      '<div class="nv-detail-h">📚 自动化推进工作流</div>' +
      '<div class="nv-dim">每章循环：<b>① 生成 spec</b>（含 before/after state + tension curve + must_happen）· <b>② 创建章记录</b>（含 spec 占位正文）· <b>③ 自动跑 5 维评审</b>· <b>④ 标记通过 / 待修订</b>。可通过阈值 85 · 最大修订 2 次。AI 仅做工作流脚手架，<b>不写正文</b>，需你或外部 AI 填。</div>' +
      '</div></div>';

    html += '<div class="card nv-scaffold-card"><div class="card-body">' +
      '<div class="nv-detail-h">➕ 新建推进任务</div>' +
      '<div class="nv-form">' +
      '<label>目标书</label><select id="nv-adv-book">' + d.books.map(function (b) { return '<option value="' + b.id + '">' + esc(b.title) + '</option>'; }).join("") + '</select>' +
      '<label>推进 N 章</label><input id="nv-adv-total" type="number" value="5" min="1" max="50">' +
      '<label>通过阈值（默认 85）</label><input id="nv-adv-threshold" type="number" value="85" min="60" max="100">' +
      '<button class="btn btn-primary" onclick="nvAdvCreate()">🚀 创建并开始</button>' +
      '</div></div></div>';

    var tasks = (d.advances || []).slice().sort(function(a,b){return (b.createdAt||"").localeCompare(a.createdAt||"");});
    if (tasks.length) {
      html += '<div class="section-title"><span class="emoji">📋</span> 推进任务历史（' + tasks.length + '）</div><div class="nv-list">';
      tasks.forEach(function(t){
          var book = nvGet(t.bookId);
          var statusCol = t.status === "done" ? "#10b981" : (t.status === "running" ? "#f59e0b" : "#94a3b8");
          html += '<div class="nv-list-item" onclick="NV_VIEW=\'advance:' + t.id + '\';render()">' +
            '<div class="nv-li-h"><b>' + esc(book ? book.title : "?") + '</b> · ' + badge(t.status === "done" ? "已完成" : (t.status === "running" ? "运行中" : "待启动"), statusCol) + ' · 阈值 ' + t.threshold + ' · ' + t.currentNum + ' / ' + t.total + '</div>' +
            '<div class="nv-li-text nv-dim">创建于 ' + (t.createdAt || "").slice(0, 16).replace("T", " ") + ' · 日志 ' + t.log.length + ' 条</div>' +
            '</div>';
        });
      html += '</div>';
    } else {
      html += '<div class="empty-state"><div class="empty-text">暂无推进任务</div></div>';
    }
    c.innerHTML = html;
  }

  root.nvAdvCreate = function () {
    var bid = document.getElementById("nv-adv-book").value;
    var total = parseInt(document.getElementById("nv-adv-total").value, 10) || 5;
    var threshold = parseInt(document.getElementById("nv-adv-threshold").value, 10) || 85;
    var task = nvEnqueueAdvance(bid, total, { threshold: threshold });
    if (typeof showToast === "function") showToast("✅ 任务已创建", "success");
    NV_VIEW = "advance:" + task.id;
    if (typeof render === "function") render();
  };

  function renderNovelAdvanceDetail(c, taskId) {
    var d = nvDB();
    var task = d.advances.find(function (t) { return t.id === taskId; });
    if (!task) { c.innerHTML = '<div class="empty-state"><div class="empty-text">任务不存在</div></div>'; return; }
    var book = nvGet(task.bookId);
    var html = '<div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap">' +
      '<button class="btn btn-ghost sm" onclick="NV_VIEW=\'list\';NV_TAB=\'advance\';render()">← 返回</button>' +
      '<button class="btn btn-primary sm" onclick="nvAdvStep(\'' + task.id + '\')" ' + (task.status === "done" ? "disabled" : "") + '>▶️ 推进 1 章</button>' +
      '<button class="btn btn-ghost sm" onclick="nvAdvReset(\'' + task.id + '\')">🔄 重置</button>' +
      '<button class="btn btn-ghost sm" onclick="nvAdvDel(\'' + task.id + '\')">🗑 删除</button>' +
      '</div>';
    html += '<div class="card"><div class="card-body">' +
      '<div class="nv-detail-h">' + esc(book ? book.title : "?") + ' · ' + badge(task.status === "done" ? "已完成" : (task.status === "running" ? "运行中" : "待启动"), task.status === "done" ? "#10b981" : "#f59e0b") + '</div>' +
      '<div class="nv-detail-row">进度：<b>' + task.currentNum + '</b> / ' + task.total + ' 章 · 阈值 ' + task.threshold + ' · 最大修订 ' + task.maxRevisions + '</div>' +
      '<div class="nv-detail-row nv-dim">起始章节：第 ' + (task.currentNum) + ' 章 · 创建于 ' + (task.createdAt || "").slice(0, 16).replace("T", " ") + '</div></div></div>';

    html += '<div class="card"><div class="card-body">' +
      '<div class="nv-detail-h">📜 日志（' + task.log.length + ' 条）</div>';
    task.log.slice().reverse().forEach(function(l){
      html += '<div class="nv-log-row"><span class="nv-log-ts">' + esc((l.ts || "").slice(11, 19)) + '</span> ' +
        badge(l.kind === "step" ? "step" : (l.kind === "start" ? "start" : "—"), "#8b5cf6") + ' ' + esc(l.text) + '</div>';
    });
    html += '</div></div>';
    c.innerHTML = html;
  }
  root.nvAdvStep = function (taskId) {
    var r = nvAdvanceStep(taskId);
    if (r.ok && !r.done) {
      if (typeof showToast === "function") showToast("✅ 第 " + r.chapter.num + " 章 spec + 占位已生成", "success");
    } else if (r.ok && r.done) {
      if (typeof showToast === "function") showToast("🎉 任务全部完成", "success");
    } else {
      if (typeof showToast === "function") showToast(r.msg, "error");
    }
    if (typeof render === "function") render();
  };
  root.nvAdvReset = function (taskId) {
    var d = nvDB();
    var task = d.advances.find(function (t) { return t.id === taskId; });
    if (!task) return;
    if (!confirm("重置任务进度？已生成的章节不会被删除。")) return;
    var maxN = 0;
    d.chapters.forEach(function (c) { if (c.bookId === task.bookId && c.num > maxN) maxN = c.num; });
    task.currentNum = maxN + 1;
    task.status = "pending";
    task.log.push({ ts: new Date().toISOString(), kind: "reset", text: "任务进度已重置" });
    nvSave();
    if (typeof render === "function") render();
  };
  root.nvAdvDel = function (taskId) {
    if (!confirm("删除任务？已生成的章节不会被删除。")) return;
    var d = nvDB();
    d.advances = (d.advances || []).filter(function (t) { return t.id !== taskId; });
    nvSave();
    NV_VIEW = "list"; NV_TAB = "advance";
    if (typeof render === "function") render();
  };

  // ============================================================
  // 17. 导出 / 导入
  // ============================================================
  root.nvExportJson = function () {
    var d = nvDB();
    var blob = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "novel_" + today() + ".json";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (typeof showToast === "function") showToast("已导出 novel.json", "success");
  };
  root.nvImportJsonPrompt = function () {
    var inp = document.createElement("input");
    inp.type = "file"; inp.accept = "application/json";
    inp.onchange = function (e) {
      var f = e.target.files[0]; if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        try {
          var j = JSON.parse(r.result);
          var cur = nvDB();
          ["books","chars","events","foreshadows","chapters","reviews","milestones","advances"].forEach(function (k) {
            if (Array.isArray(j[k])) cur[k] = j[k].slice();
          });
          nvSave();
          if (typeof render === "function") render();
          if (typeof showToast === "function") showToast("导入成功", "success");
        } catch (err) {
          if (typeof showToast === "function") showToast("JSON 解析失败：" + err.message, "error");
        }
      };
      r.readAsText(f);
    };
    inp.click();
  };

  // ============================================================
  // 暴露
  // ============================================================
  root.NV_TAB = "overview";
  root.NV_VIEW = "list";
  root.NV_OVERVIEW_SUB = "chars";
  root.NV_SPEC_BOOK = null;
  root.NV_WRITE_BOOK = null;
  root.Novel = {
    render: renderNovel,
    uid: nvUid,
    db: nvDB,
    save: nvSave,
    get: nvGet,
    char: nvChar,
    chapter: nvChapter,
    foreshadow: nvForeshadow,
    reviewByCh: nvReviewByCh,
    cnWordCount: nvCnWordCount,
    bookWordCount: nvBookWordCount,
    bookFs: nvBookForeshadows,
    pendingFs: nvBookPendingFs,
    fsTrans: nvFsTransition,
    scanRedLines: nvScanRedLines,
    autoReview: nvAutoReview,
    saveReview: nvSaveReview,
    Skill: {
      rules: SKILL_RULES,
      bannedScan: nvBannedScan,
      checklist: nvSkillChecklist,
      buildPrompt: nvBuildPrompt
    },
    polish: nvScaffoldPolish,
    continue: nvScaffoldContinue,
    enqueueAdvance: nvEnqueueAdvance,
    advanceStep: nvAdvanceStep,
    CHAPTER_STATUS_META: CHAPTER_STATUS_META,
    FORESHADOW_STATUS: FORESHADOW_STATUS,
    FORESHADOW_LABEL: FORESHADOW_LABEL,
    FORESHADOW_COLOR: FORESHADOW_COLOR,
    RED_LINES: RED_LINES,
    REVIEW_ROLES: REVIEW_ROLES
  };
})(typeof window !== "undefined" ? window : this);