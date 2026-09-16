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
  // 9. 数据迁移 / 补全（幂等，老用户本地数据自动升级到 V1 模型）
  // ============================================================
  var MIGRATED = false;
  function nvEnsureArrays() {
    var d = nvDB();
    ["books", "chars", "events", "foreshadows", "chapters", "reviews", "milestones", "advances",
      "relations", "inspirations", "materials", "emotions"].forEach(function (k) {
      if (!Array.isArray(d[k])) d[k] = [];
    });
    return d;
  }
  function nvBookOf(item, books) {
    if (item.bookId) return item.bookId;
    var m = String(item.id || "").match(/^[a-z]+(\d+)_/i);
    if (m && books[parseInt(m[1], 10) - 1]) return books[parseInt(m[1], 10) - 1].id;
    return books[0] ? books[0].id : "";
  }
  function nvDeriveCard(ch, fores) {
    var sp = ch.spec || {};
    var before = (sp.before && sp.before.characters) || [];
    var names = before.map(function (x) { return x.name; }).filter(Boolean);
    var tens = (sp.tension || []).slice().sort(function (a, b) { return (b.value || 0) - (a.value || 0); });
    var scenes = sp.key_scenes || [];
    return {
      vol: ch.volume || 1,
      time: "",
      place: "",
      chars: names,
      task: ch.goal || (sp.must_happen && sp.must_happen[0]) || "",
      plot: {
        start: scenes[0] || "",
        conflict: scenes[1] || "",
        climax: (tens[0] && tens[0].note) || scenes[2] || "",
        end: (sp.new_hooks && sp.new_hooks[0]) ? ("钩子：" + sp.new_hooks[0]) : ""
      },
      emotion: { a: names[0] || "", b: names[1] || "", aFrom: "", aTo: "", bFrom: "", bTo: "" },
      mustAppear: (sp.must_happen || []).slice(),
      mustNot: [],
      fsRef: fores.filter(function (f) { return f && f.setupChapter === ch.num; })
        .map(function (f) { return f.title; }).join("、")
    };
  }
  function nvMigrate() {
    if (MIGRATED) return;
    MIGRATED = true;
    var d = nvEnsureArrays();
    var books = d.books;
    if (!books.length) return;
    var changed = false;

    books.forEach(function (b) {
      if (b.oneLiner === undefined) { b.oneLiner = b.desc || (b.world && b.world.basic) || ""; changed = true; }
      if (!Array.isArray(b.themes)) { b.themes = []; changed = true; }
      if (!Array.isArray(b.volumes)) { b.volumes = []; changed = true; }
      if (!b.style) { b.style = "网文"; changed = true; }
      if (!b.pov) { b.pov = "third"; changed = true; }
    });

    d.chars.forEach(function (c) {
      var bid = nvBookOf(c, books);
      if (bid && c.bookId !== bid) { c.bookId = bid; changed = true; }
      if (!Array.isArray(c.personality)) { c.personality = (c.traits || []).slice(); changed = true; }
      if (!Array.isArray(c.habits)) { c.habits = []; changed = true; }
      if (!Array.isArray(c.secrets)) { c.secrets = c.secrets ? [c.secrets] : []; changed = true; }
      if (!Array.isArray(c.relationships)) { c.relationships = []; changed = true; }
      if (!c.card) { c.card = {}; changed = true; }
    });

    d.chapters.forEach(function (ch) {
      var bid = nvBookOf(ch, books);
      if (bid && ch.bookId !== bid) { ch.bookId = bid; changed = true; }
      if (!ch.volume) { ch.volume = (ch.spec && ch.spec.vol) || 1; changed = true; }
      if (!ch.card) {
        ch.card = nvDeriveCard(ch, d.foreshadows.filter(function (f) { return f.bookId === ch.bookId; }));
        changed = true;
      }
    });

    d.events.forEach(function (e) {
      var bid = nvBookOf(e, books);
      if (bid && !e.bookId) { e.bookId = bid; changed = true; }
      if (e.happened === undefined) { e.happened = e.summary || ""; changed = true; }
      if (e.chars === undefined) { e.chars = (e.affectedChars || []).slice(); changed = true; }
      if (e.chapters === undefined) { e.chapters = e.chapter ? [e.chapter] : []; changed = true; }
      if (e.time === undefined) { e.time = e.chapter ? ("第 " + e.chapter + " 章") : ""; changed = true; }
      if (e.feeling === undefined) { e.feeling = ""; changed = true; }
      if (e.impact === undefined) { e.impact = ""; changed = true; }
      e.affectedChars = e.chars;
    });

    if (!d.relations.length && d.chars.length) {
      var seen = {};
      d.chars.forEach(function (c) {
        (c.relationships || []).forEach(function (r) {
          if (!r) return;
          var other = null;
          d.chars.forEach(function (x) { if (x.id === r.with || x.name === r.with) other = x; });
          var otherName = other ? other.name : String(r.with || "");
          var key = [c.name, otherName].sort().join("|");
          if (!otherName || seen[key]) return;
          seen[key] = 1;
          d.relations.push({
            id: nvUid("rel"), bookId: c.bookId, a: c.name, b: otherName,
            type: r.type || "关系", past: "", now: r.note || "", conflict: "", state: "推进中", changes: []
          });
        });
      });
      if (d.relations.length) changed = true;
    }

    if (!d.emotions.length && books.length) {
      [["林渊", "姜禾", "book_xuanshenji"], ["陈哲", "苏宁", "book_fuguang"]].forEach(function (p) {
        var bk = d.books.filter(function (b) { return b.id === p[2]; })[0];
        if (!bk) return;
        var names = d.chars.filter(function (c) { return c.bookId === p[2]; }).map(function (c) { return c.name; });
        if (names.indexOf(p[0]) < 0 || names.indexOf(p[1]) < 0) return;
        var chs = d.chapters.filter(function (c) { return c.bookId === p[2]; }).sort(function (x, y) { return x.num - y.num; });
        var stages = ["陌生", "防备", "怀旧", "动摇", "冲突", "重新信任", "选择"];
        d.emotions.push({
          id: nvUid("emo"), bookId: p[2], a: p[0], b: p[1],
          points: chs.map(function (c, i) {
            var k = chs.length > 1 ? Math.round(i / (chs.length - 1) * (stages.length - 1)) : 0;
            return { ch: c.num, stage: stages[Math.min(stages.length - 1, k)], value: 20 + i * 12 };
          })
        });
        changed = true;
      });
    }

    if (!d.inspirations.length) {
      d.inspirations.push({
        id: nvUid("insp"), bookId: "book_xuanshenji",
        text: "林渊其实一直留着师父那半截残玉，从未示人。",
        type: "人物细节", chars: ["林渊", "老丹"], targetChapter: 8, related: "残玉", ts: new Date().toISOString()
      });
      changed = true;
    }
    if (!d.materials.length) {
      [
        { kind: "台词", title: "孤独感", content: "有些人不是不爱，只是不会爱。", tags: ["台词", "情感"] },
        { kind: "地点", title: "荒山禁地", content: "宗门后山，常年积雪，入口有断碑与枯树。", tags: ["场景"] },
        { kind: "参考资料", title: "宗门结构与等级", content: "外门弟子 → 内门弟子 → 真传 → 长老 → 宗主", tags: ["设定"] }
      ].forEach(function (x) {
        d.materials.push({ id: nvUid("mat"), bookId: "book_xuanshenji", kind: x.kind, title: x.title, content: x.content, tags: x.tags, ts: new Date().toISOString() });
      });
      changed = true;
    }

    if (changed) nvSave();
  }

  // ============================================================
  // 10. 查询辅助
  // ============================================================
  function nvBooks() { return nvDB().books || []; }
  function nvCurBook() {
    var books = nvBooks();
    if (!books.length) return null;
    var id = (typeof root.NV_BOOK !== "undefined") ? root.NV_BOOK : null;
    for (var i = 0; i < books.length; i++) if (books[i].id === id) return books[i];
    return books[0];
  }
  function nvBookChapters(bookId) {
    return nvDB().chapters.filter(function (c) { return c.bookId === bookId; })
      .sort(function (a, b) { return (a.num || 0) - (b.num || 0); });
  }
  function nvBookChars(bookId) {
    return nvDB().chars.filter(function (c) { return c.bookId === bookId; });
  }
  function nvBookRelations(bookId) {
    return nvDB().relations.filter(function (r) { return r.bookId === bookId; });
  }
  function nvBookEvents(bookId) {
    return nvDB().events.filter(function (e) { return !e.bookId || e.bookId === bookId; })
      .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  }
  function nvBookInspirations(bookId) {
    return nvDB().inspirations.filter(function (i) { return !i.bookId || i.bookId === bookId; })
      .sort(function (a, b) { return String(b.ts || "").localeCompare(String(a.ts || "")); });
  }
  function nvBookMaterials(bookId) {
    return nvDB().materials.filter(function (m) { return !m.bookId || m.bookId === bookId; })
      .sort(function (a, b) { return String(b.ts || "").localeCompare(String(a.ts || "")); });
  }
  function nvBookEmotions(bookId) {
    return nvDB().emotions.filter(function (e) { return e.bookId === bookId; });
  }
  function nvTodayChapter(bookId) {
    var chs = nvBookChapters(bookId);
    if (!chs.length) return null;
    for (var i = 0; i < chs.length; i++) if (nvCnWordCount(chs[i].draft) < 800) return chs[i];
    return chs[chs.length - 1];
  }
  function nvTodos(bookId) {
    var out = [];
    var d = nvDB();
    var chs = nvBookChapters(bookId);
    var chars = nvBookChars(bookId);
    var maxNum = 0;
    chs.forEach(function (c) { if (c.num > maxNum) maxNum = c.num; });
    chs.forEach(function (c) {
      if (!c.card || !String(c.card.task || "").trim()) {
        out.push({ k: "card", t: "第 " + c.num + " 章缺「幕后卡片」", s: "补充本章任务 / 剧情四段", act: "nvGo('chapter:" + c.id + "')" });
      }
      if (!c.spec) {
        out.push({ k: "spec", t: "第 " + c.num + " 章缺规格", s: "补 spec 后再写正文更稳", act: "nvGo('chapter:" + c.id + "')" });
      }
      if (nvCnWordCount(c.draft) < 800) {
        out.push({ k: "draft", t: "第 " + c.num + " 章待写正文", s: "当前 " + nvCnWordCount(c.draft) + " 字", act: "nvGo('chapter:" + c.id + "')" });
      }
    });
    chars.forEach(function (x) {
      if (!(x.personality || x.traits || []).length) {
        out.push({ k: "char", t: x.name + " 缺人物性格", s: "补齐档案便于 AI 理解人物", act: "nvGo('char:" + x.id + "')" });
      }
    });
    d.foreshadows.forEach(function (f) {
      if (f.bookId !== bookId) return;
      if ((f.status === "setup" || f.status === "pending") && f.payoffChapter && maxNum > f.payoffChapter) {
        out.push({ k: "fs", t: "伏笔逾期未回收：" + f.title, s: "计划第 " + f.payoffChapter + " 章回收，已到第 " + maxNum + " 章", act: "nvGo('foreshadow:" + f.id + "')" });
      }
      if (f.status === "lost") {
        out.push({ k: "fs", t: "伏笔已遗失：" + f.title, s: "确认是否需要补回收", act: "nvGo('foreshadow:" + f.id + "')" });
      }
    });
    return out.slice(0, 12);
  }

  // ============================================================
  // 11. 通用表单引擎（所有实体新建 / 编辑）
  // ============================================================
  var FORMS = {};
  function nvfId(k) { return "nvf_" + k; }
  function nvFieldHtml(f, val) {
    var v = (val == null) ? "" : val;
    var id = nvfId(f.k);
    var common = 'id="' + id + '" data-k="' + f.k + '"';
    var h = '<label class="nv-f-label" for="' + id + '">' + esc(f.label) +
      (f.req ? ' <span class="nv-f-req">*</span>' : "") + "</label>";
    if (f.type === "textarea" || f.type === "lines" || f.type === "tags") {
      h += '<textarea class="nv-f-input nv-f-ta" ' + common + ' rows="' + (f.rows || 3) +
        '" placeholder="' + esc(f.ph || "") + '">' + esc(v) + "</textarea>";
    } else if (f.type === "select") {
      h += '<select class="nv-f-input" ' + common + ">" + (f.options || []).map(function (o) {
        var ov = (typeof o === "object") ? o.v : o;
        var ot = (typeof o === "object") ? o.t : o;
        return '<option value="' + esc(ov) + '"' + (String(v) === String(ov) ? " selected" : "") + ">" + esc(ot) + "</option>";
      }).join("") + "</select>";
    } else if (f.type === "number") {
      h += '<input class="nv-f-input" type="number" ' + common + ' value="' + esc(v) + '" placeholder="' + esc(f.ph || "") + '">';
    } else {
      h += '<input class="nv-f-input" type="text" ' + common + ' value="' + esc(v) + '" placeholder="' + esc(f.ph || "") + '">';
    }
    if (f.hint) h += '<div class="nv-f-hint">' + esc(f.hint) + "</div>";
    return '<div class="nv-f-row">' + h + "</div>";
  }
  function nvOpenForm(title, fields, values, onSave, intro) {
    values = values || {};
    var fid = "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    FORMS[fid] = { fields: fields, onSave: onSave };
    var html = '<div class="nv-form"><div class="nv-form-h">' + esc(title) + "</div>";
    if (intro) html += '<div class="nv-form-intro">' + esc(intro) + "</div>";
    fields.forEach(function (f) {
      var val = values[f.k];
      if (Array.isArray(val)) val = val.join("\n");
      html += nvFieldHtml(f, val);
    });
    html += '<div class="nv-form-actions">' +
      '<button class="btn btn-ghost" onclick="closeModal()">取消</button>' +
      '<button class="btn btn-primary" onclick="nvFormSave(\'' + fid + '\')">保存</button></div></div>';
    if (typeof showModal === "function") showModal(html);
  }
  function nvReadForm(spec) {
    var out = {}, err = null;
    spec.fields.forEach(function (f) {
      var el = (typeof document !== "undefined" && document.getElementById) ? document.getElementById(nvfId(f.k)) : null;
      var raw = el ? el.value : "";
      var v = raw;
      if (f.type === "lines") v = String(raw).split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
      else if (f.type === "tags") v = String(raw).split(/[、,，;\/\s]+/).map(function (s) { return s.trim(); }).filter(Boolean);
      else if (f.type === "number") v = String(raw).trim() === "" ? null : Number(raw);
      else v = String(raw).trim();
      if (f.req && (v === "" || v === null || (Array.isArray(v) && !v.length))) err = err || (f.label + " 不能为空");
      out[f.k] = v;
    });
    return { ok: !err, msg: err, values: out };
  }
  root.nvFormSave = function (fid) {
    var spec = FORMS[fid];
    if (!spec) return;
    var r = nvReadForm(spec);
    if (!r.ok) { if (typeof showToast === "function") showToast(r.msg, "error"); return; }
    try { spec.onSave(r.values); } catch (e) {
      if (typeof showToast === "function") showToast("保存失败：" + e.message, "error");
      return;
    }
    delete FORMS[fid];
    if (typeof closeModal === "function") closeModal();
    if (typeof render === "function") render();
    if (typeof showToast === "function") showToast("✅ 已保存", "success");
  };
  function nvConfirm(msg, fn) {
    var id = "c" + Date.now().toString(36);
    FORMS[id] = { onSave: fn };
    if (typeof showModal === "function") {
      showModal('<div class="nv-form"><div class="nv-form-h">请确认</div>' +
        '<div class="nv-form-intro" style="margin:6px 0 14px">' + esc(msg) + "</div>" +
        '<div class="nv-form-actions"><button class="btn btn-ghost" onclick="closeModal()">取消</button>' +
        '<button class="btn btn-primary nv-danger" onclick="nvConfirmDo(\'' + id + '\')">确认执行</button></div></div>');
    }
  }
  root.nvConfirmDo = function (id) {
    var s = FORMS[id];
    delete FORMS[id];
    if (typeof closeModal === "function") closeModal();
    if (s && s.onSave) {
      s.onSave();
      if (typeof render === "function") render();
      if (typeof showToast === "function") showToast("✅ 已执行", "success");
    }
  };

  // ============================================================
  // 12. 实体写入 API（纯数据，可单测；表单只是外壳）
  // ============================================================
  var EDIT = {};
  function upsert(list, id, prefix, values, extra) {
    var obj = null, i;
    for (i = 0; i < list.length; i++) if (list[i].id === id) obj = list[i];
    if (!obj) { obj = { id: id || nvUid(prefix) }; list.push(obj); }
    Object.keys(values || {}).forEach(function (k) { if (values[k] !== undefined) obj[k] = values[k]; });
    Object.keys(extra || {}).forEach(function (k) { if (obj[k] === undefined) obj[k] = extra[k]; });
    return obj;
  }
  function removeById(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) { list.splice(i, 1); return true; }
    return false;
  }
  EDIT.remove = function (table, id) {
    var d = nvEnsureArrays();
    if (!d[table]) return false;
    var ok = removeById(d[table], id);
    if (ok) {
      if (table === "chapters") d.reviews = d.reviews.filter(function (r) { return r.chapterId !== id; });
      if (table === "books") {
        d.chapters = d.chapters.filter(function (c) { return c.bookId !== id; });
        d.chars = d.chars.filter(function (c) { return c.bookId !== id; });
        d.relations = d.relations.filter(function (r) { return r.bookId !== id; });
        d.foreshadows = d.foreshadows.filter(function (f) { return f.bookId !== id; });
        d.emotions = d.emotions.filter(function (e) { return e.bookId !== id; });
      }
      nvSave();
    }
    return ok;
  };
  EDIT.book = function (id, v) {
    var d = nvEnsureArrays();
    var b = upsert(d.books, id, "book", {
      title: v.title, genre: v.genre, oneLiner: v.oneLiner, style: v.style, pov: v.pov,
      targetWords: v.targetWords, status: v.status, desc: v.oneLiner
    }, { createdAt: new Date().toISOString(), volumes: [], themes: [], world: {} });
    if (v.themes !== undefined) b.themes = v.themes;
    nvSave();
    return b;
  };
  EDIT.volume = function (bookId, volNum, v) {
    var b = nvGet(bookId);
    if (!b) return null;
    if (!Array.isArray(b.volumes)) b.volumes = [];
    var found = null;
    b.volumes.forEach(function (x) { if (Number(x.num) === Number(volNum)) found = x; });
    if (!found) { found = { num: Number(volNum) || (b.volumes.length + 1) }; b.volumes.push(found); }
    ["num", "title", "range", "note"].forEach(function (k) { if (v[k] !== undefined && v[k] !== null) found[k] = v[k]; });
    b.volumes.sort(function (a, c) { return (a.num || 0) - (c.num || 0); });
    nvSave();
    return found;
  };
  EDIT.delVolume = function (bookId, volNum) {
    var b = nvGet(bookId);
    if (!b || !Array.isArray(b.volumes)) return false;
    b.volumes = b.volumes.filter(function (x) { return Number(x.num) !== Number(volNum); });
    nvSave();
    return true;
  };
  EDIT.world = function (bookId, v) {
    var b = nvGet(bookId);
    if (!b) return null;
    b.world = b.world || {};
    ["basic", "rules", "history", "customs", "mystery"].forEach(function (k) { if (v[k] !== undefined) b.world[k] = v[k]; });
    if (v.places !== undefined) b.world.places = v.places;
    nvSave();
    return b.world;
  };
  EDIT.chapter = function (id, v) {
    var d = nvEnsureArrays();
    var ch = upsert(d.chapters, id, "ch", {
      bookId: v.bookId, num: v.num, volume: v.volume, title: v.title, goal: v.goal, status: v.status
    }, { createdAt: new Date().toISOString(), draft: "", notes: [], reviewFlags: [], spec: null });
    if (v.draft !== undefined) { ch.draft = v.draft; ch.wordCount = nvCnWordCount(v.draft); }
    if (!ch.card) ch.card = { plot: {}, emotion: {} };
    if (!ch.card.plot) ch.card.plot = {};
    if (!ch.card.emotion) ch.card.emotion = {};
    ["vol", "time", "place", "chars", "task", "mustAppear", "mustNot", "fsRef"].forEach(function (k) {
      if (v["card_" + k] !== undefined) ch.card[k] = v["card_" + k];
    });
    ["start", "conflict", "climax", "end"].forEach(function (k) {
      if (v["plot_" + k] !== undefined) ch.card.plot[k] = v["plot_" + k];
    });
    ["a", "b", "aFrom", "aTo", "bFrom", "bTo"].forEach(function (k) {
      if (v["emo_" + k] !== undefined) ch.card.emotion[k] = v["emo_" + k];
    });
    ch.updatedAt = new Date().toISOString();
    nvSave();
    return ch;
  };
  EDIT.char = function (id, v) {
    var d = nvEnsureArrays();
    var c = upsert(d.chars, id, "char", {
      bookId: v.bookId, name: v.name, role: v.role, age: v.age, job: v.job, city: v.city,
      desire: v.desire, fear: v.fear, flaw: v.flaw, loveView: v.loveView, status: v.status
    }, { relationships: [], card: {}, secrets: [] });
    ["personality", "habits", "secrets", "traits"].forEach(function (k) { if (v[k] !== undefined) c[k] = v[k]; });
    if (v.personality !== undefined) c.traits = v.personality;
    c.card = c.card || {};
    ["appearance", "catchphrase", "arcStart", "arcConflict", "arcTurn", "arcEnd", "secret"].forEach(function (k) {
      if (v["card_" + k] !== undefined) c.card[k] = v["card_" + k];
    });
    if (v.arc !== undefined) c.arc = v.arc;
    if (v.fear !== undefined) c.card.fear = v.fear;
    nvSave();
    return c;
  };
  EDIT.relation = function (id, v) {
    var d = nvEnsureArrays();
    var r = upsert(d.relations, id, "rel", {
      bookId: v.bookId, a: v.a, b: v.b, type: v.type, past: v.past, now: v.now,
      conflict: v.conflict, state: v.state
    }, { changes: [] });
    nvSave();
    return r;
  };
  EDIT.relationChange = function (relId, v) {
    var r = null;
    nvDB().relations.forEach(function (x) { if (x.id === relId) r = x; });
    if (!r) return null;
    if (!Array.isArray(r.changes)) r.changes = [];
    r.changes.push({ ch: Number(v.ch) || 0, note: v.note || "" });
    r.changes.sort(function (a, b) { return a.ch - b.ch; });
    nvSave();
    return r;
  };
  EDIT.event = function (id, v) {
    var d = nvEnsureArrays();
    var e = upsert(d.events, id, "ev", {
      bookId: v.bookId, time: v.time, title: v.title, happened: v.happened,
      feeling: v.feeling, impact: v.impact, summary: v.happened
    }, { ts: new Date().toISOString(), order: d.events.length });
    ["chars", "chapters"].forEach(function (k) { if (v[k] !== undefined) e[k] = v[k]; });
    if (v.chapters !== undefined) e.chapter = v.chapters[0] || null;
    e.affectedChars = e.chars;
    nvSave();
    return e;
  };
  EDIT.foreshadow = function (id, v) {
    var d = nvEnsureArrays();
    var f = upsert(d.foreshadows, id, "fs", {
      bookId: v.bookId, title: v.title, setupChapter: v.setupChapter,
      payoffChapter: v.payoffChapter == null ? null : v.payoffChapter, status: v.status, note: v.note
    }, {});
    nvSave();
    return f;
  };
  EDIT.inspiration = function (id, v) {
    var d = nvEnsureArrays();
    var it = upsert(d.inspirations, id, "insp", {
      bookId: v.bookId, text: v.text, type: v.type, targetChapter: v.targetChapter, related: v.related
    }, { ts: new Date().toISOString() });
    if (v.chars !== undefined) it.chars = v.chars;
    nvSave();
    return it;
  };
  EDIT.material = function (id, v) {
    var d = nvEnsureArrays();
    var m = upsert(d.materials, id, "mat", {
      bookId: v.bookId, kind: v.kind, title: v.title, content: v.content, url: v.url
    }, { ts: new Date().toISOString() });
    if (v.tags !== undefined) m.tags = v.tags;
    nvSave();
    return m;
  };
  EDIT.emotion = function (id, v) {
    var d = nvEnsureArrays();
    var e = upsert(d.emotions, id, "emo", { bookId: v.bookId, a: v.a, b: v.b }, { points: [] });
    nvSave();
    return e;
  };
  EDIT.emotionPoint = function (emoId, v) {
    var e = null;
    nvDB().emotions.forEach(function (x) { if (x.id === emoId) e = x; });
    if (!e) return null;
    if (!Array.isArray(e.points)) e.points = [];
    var found = null;
    e.points.forEach(function (p) { if (Number(p.ch) === Number(v.ch)) found = p; });
    if (!found) { found = { ch: Number(v.ch) }; e.points.push(found); }
    found.stage = v.stage;
    found.value = v.value;
    e.points.sort(function (a, b) { return a.ch - b.ch; });
    nvSave();
    return e;
  };

  // ============================================================
  // 13. 路由
  // ============================================================
  var TABS = [
    { k: "home", t: "🏠 首页" },
    { k: "write", t: "✍️ 写作" },
    { k: "story", t: "📖 故事" },
    { k: "ai", t: "🤖 AI" },
    { k: "idea", t: "💡 灵感" },
    { k: "material", t: "🗂 素材" }
  ];
  function getTab() {
    var t = (typeof root.NV_TAB !== "undefined") ? root.NV_TAB : "home";
    for (var i = 0; i < TABS.length; i++) if (TABS[i].k === t) return t;
    return "home";
  }
  function getView() { return (typeof root.NV_VIEW !== "undefined") ? root.NV_VIEW : "list"; }
  function nvGo(v) { root.NV_VIEW = v; if (typeof render === "function") render(); }
  function nvSetTab(t) { root.NV_TAB = t; root.NV_VIEW = "list"; if (typeof render === "function") render(); }
  function nvSub(v) { root.NV_STORY_SUB = v; root.NV_VIEW = "list"; if (typeof render === "function") render(); }
  function nvAiSub(v) { root.NV_AI_SUB = v; root.NV_VIEW = "list"; if (typeof render === "function") render(); }
  function nvPickBook(id) { root.NV_BOOK = id; root.NV_VIEW = "list"; if (typeof render === "function") render(); }

  function renderNovel() {
    var c = document.getElementById("app-content");
    if (!c) return;
    try {
      nvLoadSeed();
      nvMigrate();
      var v = getView();
      if (v && v !== "list") {
        var p = v.split(":");
        if (p[0] === "chapter") return renderNovelChapterDetail(c, p[1]);
        if (p[0] === "char") return renderNovelCharDetail(c, p[1]);
        if (p[0] === "foreshadow") return renderNovelFsDetail(c, p[1]);
        if (p[0] === "advance") return renderNovelAdvanceDetail(c, p[1]);
        if (p[0] === "relation") return renderNovelRelationDetail(c, p[1]);
        if (p[0] === "event") return renderNovelEventDetail(c, p[1]);
      }
      var t = getTab();
      if (t === "write") return renderNovelWrite(c);
      if (t === "story") return renderNovelStory(c);
      if (t === "ai") return renderNovelAI(c);
      if (t === "idea") return renderNovelIdea(c);
      if (t === "material") return renderNovelMaterial(c);
      return renderNovelHome(c);
    } catch (e) {
      c.innerHTML = '<div class="empty-state"><div class="empty-text">ERR: ' + esc(e && e.message) + "</div></div>";
    }
  }

  function tabBarHtml(active) {
    var t = active || getTab();
    return '<div class="nv-tabs">' + TABS.map(function (x) {
      return '<span class="nv-tab' + (t === x.k ? " active" : "") + '" onclick="nvSetTab(\'' + x.k + '\')">' + x.t + "</span>";
    }).join("") + "</div>";
  }
  function subTabs(items, activeK, fn) {
    return '<div class="nv-subtabs">' + items.map(function (x) {
      return '<span class="nv-subtab' + (activeK === x.k ? " active" : "") + '" onclick="' + fn + "('" + x.k + "')\">" + x.t + "</span>";
    }).join("") + "</div>";
  }
  function bookSwitcher() {
    var books = nvBooks();
    var cur = nvCurBook();
    if (books.length <= 1) return "";
    return '<select class="nv-booksel" onchange="nvPickBook(this.value)">' + books.map(function (b) {
      return '<option value="' + esc(b.id) + '"' + (cur && cur.id === b.id ? " selected" : "") + ">" + esc(b.title) + "</option>";
    }).join("") + "</select>";
  }
  function headBar(title, right) {
    return '<div class="nv-head"><div class="section-title" style="margin:0"><span class="emoji">📚</span> ' + esc(title) + "</div>" +
      '<div class="nv-head-right">' + (right || "") + "</div></div>";
  }
  function bar(pct, color) {
    var w = Math.max(0, Math.min(100, Math.round(pct || 0)));
    return '<div class="nv-bar"><span style="width:' + w + "%;background:" + (color || "#8b5cf6") + '"></span></div>';
  }
  function dv(v, l) { return '<div class="nv-stat"><b>' + v + "</b><span>" + esc(l) + "</span></div>"; }
  function qk(t, act) { return '<button class="nv-quick-b" onclick="' + act + '">' + t + "</button>"; }
  function kv2(k, v) {
    return '<div class="nv-card-kv"><span class="nv-card-k">' + esc(k) + '</span><span class="nv-card-v">' + esc(v) + "</span></div>";
  }


  // ============================================================
  // 14. 🏠 首页 —— 今天写什么
  // ============================================================
  function renderNovelHome(c) {
    var book = nvCurBook();
    if (!book) {
      c.innerHTML = headBar("小说创作", '<button class="btn btn-primary sm" onclick="nvEditBook(null)">＋ 新建小说</button>') +
        '<div class="empty-state"><div class="empty-text">还没有小说，点右上角新建一本</div></div>';
      return;
    }
    var chs = nvBookChapters(book.id);
    var chars = nvBookChars(book.id);
    var words = nvBookWordCount(book.id);
    var target = Number(book.targetWords) || 0;
    var pending = nvBookPendingFs(book.id);
    var todo = nvTodos(book.id);
    var todayCh = nvTodayChapter(book.id);
    var volNum = todayCh && todayCh.volume ? todayCh.volume : 1;
    var vol = (book.volumes || []).filter(function (v) { return Number(v.num) === Number(volNum); })[0];

    var html = headBar("小说创作", bookSwitcher() +
      '<button class="btn btn-ghost sm" onclick="nvEditBook(null)">＋</button>' +
      '<button class="btn btn-ghost sm" onclick="nvExportOpen()">⬇️ 导出</button>');
    html += tabBarHtml("home");

    html += '<div class="card nv-hero"><div class="card-body">' +
      '<div class="nv-hero-title">《' + esc(book.title || "未命名") + "》</div>" +
      '<div class="nv-hero-sub">' + esc([book.genre, book.style].filter(Boolean).join(" · ") || "未设置类型") +
      (vol ? "　·　第 " + vol.num + " 卷 " + esc(vol.title || "") : "") + "</div>";
    if (book.oneLiner) html += '<div class="nv-hero-line">' + esc(book.oneLiner) + "</div>";
    html += '<div class="nv-hero-prog">第 ' + chs.length + " 章　" + words + " 字" +
      (target ? " / 目标 " + target + " 字" : "") + "</div>" +
      bar(target ? words / target * 100 : Math.min(100, chs.length * 4)) +
      '<div class="nv-hero-actions">' +
      '<button class="btn btn-ghost sm" onclick="nvEditBook(\'' + book.id + '\')">✏️ 编辑设定</button>' +
      '<button class="btn btn-ghost sm" onclick="nvSub(\'outline\')">📖 故事总览</button>' +
      "</div></div></div>";

    if (todayCh) {
      html += '<div class="card"><div class="card-body">' +
        '<div class="nv-sec-h">今日创作</div>' +
        '<div class="nv-today-title">第 ' + todayCh.num + " 章｜" + esc(todayCh.title || "未命名") + "</div>" +
        '<div class="nv-today-label">本章任务</div>' +
        '<div class="nv-today-task">' + esc((todayCh.card && todayCh.card.task) || todayCh.goal || "（未设置本章任务，点「幕后卡片」补充）") + "</div>" +
        '<div class="nv-today-meta">当前正文 ' + nvCnWordCount(todayCh.draft) + " 字　·　" +
        (CHAPTER_STATUS_META[todayCh.status] ? CHAPTER_STATUS_META[todayCh.status].label : "草稿") + "</div>" +
        '<button class="btn btn-primary" style="width:100%;margin-top:10px" onclick="nvGo(\'chapter:' + todayCh.id + '\')">继续写</button>' +
        "</div></div>";
    } else {
      html += '<div class="card"><div class="card-body"><div class="nv-sec-h">今日创作</div>' +
        '<div class="nv-dim">还没有章节，先建第一章</div>' +
        '<button class="btn btn-primary" style="width:100%;margin-top:10px" onclick="nvEditChapter(null)">＋ 新建第一章</button></div></div>';
    }

    var recent = [];
    chs.slice().sort(function (a, b) {
      return String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""));
    }).slice(0, 3).forEach(function (ch) {
      recent.push({ t: "第 " + ch.num + " 章 " + (ch.title || ""), s: nvCnWordCount(ch.draft) + " 字", act: "nvGo('chapter:" + ch.id + "')" });
    });
    nvBookInspirations(book.id).slice(0, 2).forEach(function (i) {
      recent.push({ t: "灵感：" + String(i.text || "").slice(0, 20), s: i.type || "灵感", act: "nvSetTab('idea')" });
    });
    chars.slice(0, 1).forEach(function (x) {
      recent.push({ t: "人物:" + x.name, s: (x.role || "角色"), act: "nvGo('char:" + x.id + "')" });
    });
    if (recent.length) {
      html += '<div class="card"><div class="card-body"><div class="nv-sec-h">最近</div>' +
        recent.map(function (r) {
          return '<div class="nv-recent" onclick="' + r.act + '"><span class="nv-recent-t">' + esc(r.t) + "</span>" +
            '<span class="nv-dim">' + esc(r.s) + "</span></div>";
        }).join("") + "</div></div>";
    }

    html += '<div class="card"><div class="card-body"><div class="nv-sec-h">待处理 <span class="nv-dim">' + todo.length + " 项</span></div>" +
      (todo.length ? todo.map(function (t) {
        return '<div class="nv-todo"><span class="nv-todo-dot ' + t.k + '"></span>' +
          '<div class="nv-todo-main" onclick="' + t.act + '"><b>' + esc(t.t) + "</b><br><span class=\"nv-dim\">" + esc(t.s) + "</span></div></div>";
      }).join("") : '<div class="nv-dim">✓ 暂无待处理事项</div>') + "</div></div>";

    html += '<div class="card"><div class="card-body"><div class="nv-sec-h">本作数据</div><div class="nv-stat-grid">' +
      dv(chs.length, "章节") + dv(words, "字数") + dv(chars.length, "人物") +
      dv(nvBookRelations(book.id).length, "关系") + dv(pending.length, "待回收伏笔") +
      dv(nvBookInspirations(book.id).length, "灵感") + dv(nvBookMaterials(book.id).length, "素材") +
      dv(nvBookEvents(book.id).length, "时间线") + "</div></div></div>";

    html += '<div class="card"><div class="card-body"><div class="nv-sec-h">快捷入口</div><div class="nv-quick">' +
      qk("＋ 新建章节", "nvEditChapter(null)") + qk("＋ 新建人物", "nvEditChar(null)") +
      qk("💡 记灵感", "nvEditInspiration(null)") + qk("🗂 加素材", "nvEditMaterial(null)") +
      qk("🕒 加时间线", "nvEditEvent(null)") + qk("🌱 加伏笔", "nvEditForeshadow(null)") +
      qk("⬇️ 导出 Word", "nvExportDo('docx','book')") + qk("⬇️ 导出 Excel", "nvExportDo('xlsx','book')") +
      "</div></div></div>";

    c.innerHTML = html;
  }

  // ============================================================
  // 15. ✍️ 写作
  // ============================================================
  function renderNovelWrite(c) {
    var book = nvCurBook();
    if (!book) { c.innerHTML = headBar("写作") + '<div class="empty-state"><div class="empty-text">请先新建小说</div></div>'; return; }
    var chs = nvBookChapters(book.id);
    var vols = (book.volumes || []).slice();
    var html = headBar("写作", bookSwitcher() + '<button class="btn btn-primary sm" onclick="nvEditChapter(null)">＋ 章节</button>');
    html += tabBarHtml("write");
    if (!chs.length) {
      html += '<div class="empty-state"><div class="empty-text">还没有章节，点「＋ 章节」开始</div></div>';
      c.innerHTML = html;
      return;
    }
    var groups = {};
    chs.forEach(function (ch) { var vn = ch.volume || 1; (groups[vn] = groups[vn] || []).push(ch); });
    Object.keys(groups).sort(function (a, b) { return a - b; }).forEach(function (vn) {
      var vol = vols.filter(function (v) { return Number(v.num) === Number(vn); })[0];
      var list = groups[vn];
      var volWords = 0;
      list.forEach(function (x) { volWords += nvCnWordCount(x.draft); });
      html += '<div class="card"><div class="card-body">' +
        '<div class="nv-sec-h">第 ' + vn + " 卷 " + esc(vol ? (vol.title || "") : "") +
        ' <span class="nv-dim">' + list.length + " 章 · " + volWords + " 字</span></div>";
      list.forEach(function (ch) {
        var sm = CHAPTER_STATUS_META[ch.status] || CHAPTER_STATUS_META.draft;
        var wc = nvCnWordCount(ch.draft);
        html += '<div class="nv-ch-row" onclick="nvGo(\'chapter:' + ch.id + '\')">' +
          '<div class="nv-ch-num">第 ' + ch.num + " 章</div>" +
          '<div class="nv-ch-main"><div class="nv-ch-title">' + esc(ch.title || "未命名") + "</div>" +
          '<div class="nv-ch-sub">' + badge(sm.label, sm.color) + " " + wc + " 字" +
          (ch.card && ch.card.task ? ' · <span class="nv-dim">' + esc(String(ch.card.task).slice(0, 24)) + "</span>" : "") +
          "</div></div><div class=\"nv-ch-arrow\">›</div></div>";
      });
      html += "</div></div>";
    });
    c.innerHTML = html;
  }

  function renderNovelChapterDetail(c, chId) {
    var ch = nvChapter(chId);
    if (!ch) { c.innerHTML = '<div class="empty-state"><div class="empty-text">章节不存在</div></div>'; return; }
    var book = nvGet(ch.bookId);
    var sm = CHAPTER_STATUS_META[ch.status] || CHAPTER_STATUS_META.draft;
    var rev = nvReviewByCh(chId);
    var redHits = nvScanRedLines(ch.draft);
    var card = ch.card || {};
    var vol = ((book && book.volumes) || []).filter(function (v) { return Number(v.num) === Number(ch.volume); })[0];
    var wc = nvCnWordCount(ch.draft);

    var html = '<div class="nv-crumb"><button class="btn btn-ghost sm" onclick="nvSetTab(\'write\')">← 写作</button>' +
      '<span class="nv-crumb-t">第 ' + ch.num + " 章</span></div>";
    html += '<div class="nv-act-bar">' +
      '<button class="btn btn-primary sm" onclick="nvSaveDraft(\'' + ch.id + '\')">💾 保存正文</button>' +
      '<button class="btn btn-ghost sm" onclick="nvEditChapter(\'' + ch.id + '\')">🗂 幕后卡片</button>' +
      '<button class="btn btn-ghost sm" onclick="nvEditSpec(\'' + ch.id + '\')">📝 规格</button>' +
      '<button class="btn btn-ghost sm" onclick="nvChStatus(\'' + ch.id + '\',\'revised\')">已润色</button>' +
      '<button class="btn btn-ghost sm" onclick="nvChStatus(\'' + ch.id + '\',\'final\')">定稿</button>' +
      '<button class="btn btn-ghost sm" onclick="nvSkillCheck(\'' + ch.id + '\')">✅ 规范检查</button>' +
      '<button class="btn btn-ghost sm" onclick="nvSkillPrompt(\'' + ch.bookId + '\',' + ch.num + ')">🤖 Prompt</button>' +
      '<button class="btn btn-ghost sm" onclick="nvChReReview(\'' + ch.id + '\')">🔄 重跑 5 维</button>' +
      '<button class="btn btn-ghost sm" onclick="nvExportDo(\'docx\',\'chapter\',\'' + ch.id + '\')">⬇️ 本章 Word</button>' +
      '<button class="btn btn-ghost sm nv-danger" onclick="nvDelChapter(\'' + ch.id + '\')">删除</button>' +
      "</div>";

    html += '<div class="card"><div class="card-body">' +
      '<div class="nv-detail-h">第 ' + ch.num + " 章 · " + esc(ch.title || "未命名") +
      ' <span class="nv-dim">' + esc(book ? book.title : "") + "</span></div>" +
      '<div class="nv-detail-row">' + badge(sm.label, sm.color) + " · " + wc + " 字" +
      (vol ? ' · <span class="nv-dim">第 ' + vol.num + " 卷 " + esc(vol.title || "") + "</span>" : "") + "</div></div></div>";

    html += '<div class="card nv-card-block"><div class="card-body">' +
      '<div class="nv-block-h">🗂 幕后卡片' +
      '<button class="btn btn-ghost sm" onclick="nvEditChapter(\'' + ch.id + '\')">编辑</button></div>' +
      '<div class="nv-card-grid">' +
      kv2("所属卷", "第 " + (ch.volume || 1) + " 卷") +
      kv2("时间", card.time || "—") +
      kv2("地点", card.place || "—") +
      kv2("涉及人物", (card.chars || []).length ? card.chars.join("、") : "—") +
      "</div>" +
      '<div class="nv-card-sec"><div class="nv-card-label">本章任务</div><div class="nv-card-val">' +
      esc(card.task || ch.goal || "（待补充）") + "</div></div>" +
      '<div class="nv-card-sec"><div class="nv-card-label">剧情</div>' +
      [["start", "开始"], ["conflict", "冲突"], ["climax", "高潮"], ["end", "结尾"]].map(function (p) {
        return '<div class="nv-plot-row"><span class="nv-plot-tag">' + p[1] + "</span><span>" +
          esc((card.plot && card.plot[p[0]]) || "—") + "</span></div>";
      }).join("") + "</div>" +
      '<div class="nv-card-sec"><div class="nv-card-label">情绪</div>' +
      [["a", "aFrom", "aTo"], ["b", "bFrom", "bTo"]].map(function (t) {
        var who = card.emotion && card.emotion[t[0]];
        if (!who) return "";
        return '<div class="nv-emo-row"><b>' + esc(who) + "</b>：" + esc((card.emotion[t[1]] || "—") + " → " + (card.emotion[t[2]] || "—")) + "</div>";
      }).join("") + "</div>" +
      '<div class="nv-card-sec nv-2col">' +
      '<div><div class="nv-card-label ok">必须出现</div>' +
      ((card.mustAppear || []).length ? card.mustAppear.map(function (x) { return '<div class="nv-check">☑ ' + esc(x) + "</div>"; }).join("") : '<div class="nv-dim">—</div>') + "</div>" +
      '<div><div class="nv-card-label no">不能出现</div>' +
      ((card.mustNot || []).length ? card.mustNot.map(function (x) { return '<div class="nv-check no">☒ ' + esc(x) + "</div>"; }).join("") : '<div class="nv-dim">—</div>') + "</div>" +
      "</div>" +
      (card.fsRef ? '<div class="nv-card-sec"><div class="nv-card-label">关联伏笔</div><div>' + esc(card.fsRef) + "</div></div>" : "") +
      "</div></div>";

    if (ch.spec) {
      html += '<div class="nv-spec-card">' +
        '<div class="nv-spec-h">📝 Spec</div>' +
        '<div class="nv-spec-grid">' +
        "<div><b>before：</b><br>" + ((ch.spec.before && ch.spec.before.characters) || []).map(function (x) {
          return esc(x.name) + "（" + esc(x.state) + "）<br>";
        }).join("") + (ch.spec.before && ch.spec.before.hooks && ch.spec.before.hooks.length ? '<span class="nv-dim">未回收钩子：' + esc(ch.spec.before.hooks.join("、")) + "</span>" : "") + "</div>" +
        "<div><b>after：</b><br>" + ((ch.spec.after && ch.spec.after.characters) || []).map(function (x) {
          return esc(x.name) + "（" + esc(x.state) + "）<br>";
        }).join("") + (ch.spec.after && ch.spec.after.advances && ch.spec.after.advances.length ? '<span class="nv-dim">推进：' + esc(ch.spec.after.advances.join("、")) + "</span>" : "") + "</div>" +
        "</div>" +
        '<div class="nv-spec-row"><b>must_happen：</b>' + (ch.spec.must_happen || []).map(function (x) { return badge(x, "#0a84ff"); }).join(" ") + "</div>" +
        '<div class="nv-spec-row"><b>tension_curve：</b>' + (ch.spec.tension || []).map(function (x) {
          return badge("p" + x.position + "=" + x.value, x.value >= 7 ? "#ef4444" : (x.value >= 4 ? "#f59e0b" : "#10b981")) + (x.note ? " " + esc(x.note) : "");
        }).join(" ") + "</div>" +
        '<div class="nv-spec-row"><b>key_scenes：</b>' + (ch.spec.key_scenes || []).map(function (x) { return badge(x, "#8b5cf6"); }).join(" ") + "</div>" +
        '<div class="nv-spec-row"><b>new_hooks：</b>' + (ch.spec.new_hooks || []).map(function (x) { return badge(x, "#0ea5e9"); }).join(" ") + "</div>" +
        "</div>";
    } else {
      html += '<div class="nv-dim" style="margin:6px 0 10px">⚠ 暂无 spec · 点「📝 规格」补充</div>';
    }

    html += '<div class="card"><div class="card-body">' +
      '<div class="nv-block-h">✍️ 正文<span class="nv-dim" id="nv-wc">' + wc + " 字</span></div>" +
      '<textarea id="nv-editor" class="nv-editor" rows="16" placeholder="在这里写正文…" oninput="nvWcTick()">' +
      esc(ch.draft || "") + "</textarea>" +
      '<div class="nv-edit-actions">' +
      '<button class="btn btn-primary sm" onclick="nvSaveDraft(\'' + ch.id + '\')">💾 保存</button>' +
      '<button class="btn btn-ghost sm" onclick="nvInsertAtCursor()">＋ 插入片段</button>' +
      '<button class="btn btn-ghost sm" onclick="nvAiAct(\'' + ch.id + '\',\'继续写\')">✦ 继续写</button>' +
      '<button class="btn btn-ghost sm" onclick="nvAiAct(\'' + ch.id + '\',\'润色这一段\')">✦ 润色</button>' +
      "</div></div></div>";

    if (root.NV_SKILL_CHK === ch.id) {
      var chk = nvSkillChecklist(ch.id);
      if (chk) {
        html += '<div class="card"><div class="card-body"><div class="nv-block-h">✅ 规范检查 v2.0 ' +
          '<span class="nv-dim">' + chk.pass + "/" + chk.total + "</span></div>" +
          chk.items.map(function (it) {
            var color = it.ok ? "#10b981" : (it.level === "P1" ? "#f59e0b" : (it.level === "hint" ? "#94a3b8" : "#ef4444"));
            return '<div class="nv-chk-row"><span class="nv-chk-dot" style="background:' + color + '"></span>' +
              "<b>" + esc(it.label) + "</b> · <span class=\"nv-dim\">" + esc(it.detail) + "</span></div>";
          }).join("") + "</div></div>";
      }
    }

    html += '<div class="card"><div class="card-body"><div class="nv-block-h">🔍 5 维评审' +
      (rev ? '<span class="nv-dim">总分 ' + rev.finalScore + "</span>" : "") + "</div>";
    if (rev && rev.scores) {
      var grid = { reader: "📖 阅读者", editor: "🔤 编审", storyteller: "📐 故事家", literary: "🎭 文学顾问", troll: "💣 毒舌读者" };
      html += '<div class="nv-rv-grid">' + Object.keys(grid).map(function (k) {
        var s = rev.scores[k] || { score: "-", weight: "", note: "" };
        var col = s.score >= 85 ? "#10b981" : (s.score >= 70 ? "#f59e0b" : "#ef4444");
        return '<div class="nv-rv-cell"><div class="nv-rv-name">' + grid[k] + "</div>" +
          '<div class="nv-rv-score" style="color:' + col + '">' + s.score + "</div>" +
          '<div class="nv-rv-w">权重 ' + (s.weight || "") + "%</div>" +
          (s.note ? '<div class="nv-rv-note">' + esc(s.note) + "</div>" : "") + "</div>";
      }).join("") + "</div>";
      if (rev.flags && rev.flags.length) {
        html += '<div class="nv-spec-row"><b>标记：</b>' + rev.flags.map(function (f) {
          return badge(f, /^P0/.test(f) ? "#ef4444" : (/^P1/.test(f) ? "#f59e0b" : "#94a3b8"));
        }).join(" ") + "</div>";
      }
      if (rev.notes) html += '<div class="nv-dim" style="margin-top:6px">' + esc(rev.notes) + "</div>";
    } else {
      html += '<div class="nv-dim">尚未评审 · 点上方「🔄 重跑 5 维」</div>';
    }
    html += "</div></div>";

    if (redHits.length) {
      html += '<div class="card nv-redline-card"><div class="card-body">' +
        '<div class="nv-block-h">🚦 自动红线扫描（' + redHits.length + " 项命中）</div>";
      redHits.forEach(function (h) {
        html += '<div class="nv-redline-row"><span class="nv-redline-tag nv-tag-' + h.level + '">' + h.level + "</span> " +
          "<b>" + esc(h.label) + "</b> · 「" + esc(h.sample) + "」 · 修法：" + esc(h.fix) + "</div>";
      });
      html += "</div></div>";
    }

    if ((ch.notes || []).length) {
      html += '<div class="card"><div class="card-body"><div class="nv-block-h">📌 修改记录</div>' +
        ch.notes.slice(-6).reverse().map(function (n) {
          return '<div class="nv-note-row">' + esc(n.kind || "") + " · " + esc(n.location || n.outline || "") +
            (n.expect ? " → " + esc(n.expect) : "") + "</div>";
        }).join("") + "</div></div>";
    }
    c.innerHTML = html;
  }
  root.nvWcTick = function () {
    var el = document.getElementById("nv-editor");
    var out = document.getElementById("nv-wc");
    if (el && out) out.textContent = nvCnWordCount(el.value) + " 字";
  };
  root.nvSaveDraft = function (chId) {
    var ch = nvChapter(chId);
    var el = document.getElementById("nv-editor");
    if (!ch || !el) { if (typeof showToast === "function") showToast("编辑器未就绪", "warn"); return; }
    ch.draft = el.value;
    ch.wordCount = nvCnWordCount(ch.draft);
    ch.updatedAt = new Date().toISOString();
    if (ch.status === "final") ch.status = "revised";
    nvSave();
    if (typeof showToast === "function") showToast("💾 已保存 · " + ch.wordCount + " 字", "success");
  };
  root.nvInsertAtCursor = function () {
    var el = document.getElementById("nv-editor");
    if (!el) return;
    var s = el.selectionStart || 0, e2 = el.selectionEnd || 0;
    var snippet = "\n\n【待补场景】\n";
    el.value = el.value.slice(0, s) + snippet + el.value.slice(e2);
    el.selectionStart = el.selectionEnd = s + snippet.length;
    if (el.focus) el.focus();
    root.nvWcTick();
  };


  // ============================================================
  // 16. 📖 故事
  // ============================================================
  function renderNovelStory(c) {
    var book = nvCurBook();
    if (!book) { c.innerHTML = headBar("故事") + '<div class="empty-state"><div class="empty-text">请先新建小说</div></div>'; return; }
    var subs = [
      { k: "outline", t: "📐 总纲" },
      { k: "volumes", t: "📚 卷结构" },
      { k: "chars", t: "👤 人物" },
      { k: "relations", t: "🔗 关系" },
      { k: "timeline", t: "🕒 时间线" },
      { k: "world", t: "🌍 世界观" },
      { k: "foreshadows", t: "🌱 伏笔" },
      { k: "emotions", t: "💗 情绪线" }
    ];
    var sub = root.NV_STORY_SUB || "outline";
    var html = headBar("故事", bookSwitcher());
    html += tabBarHtml("story");
    html += subTabs(subs, sub, "nvSub");
    if (sub === "chars") return storyChars(c, html, book);
    if (sub === "relations") return storyRelations(c, html, book);
    if (sub === "timeline") return storyTimeline(c, html, book);
    if (sub === "world") return storyWorld(c, html, book);
    if (sub === "foreshadows") return storyForeshadows(c, html, book);
    if (sub === "emotions") return storyEmotions(c, html, book);
    if (sub === "volumes") return storyVolumes(c, html, book);
    return storyOutline(c, html, book);
  }

  function storyOutline(c, html, book) {
    var chs = nvBookChapters(book.id);
    html += '<div class="card"><div class="card-body">' +
      '<div class="nv-block-h">一句话故事<button class="btn btn-ghost sm" onclick="nvEditBook(\'' + book.id + '\')">编辑</button></div>' +
      '<div class="nv-quote">' + esc(book.oneLiner || "（未填写）") + "</div>" +
      '<div class="nv-card-grid" style="margin-top:10px">' +
      kv2("主题", (book.themes || []).join("｜") || "—") +
      kv2("类型", book.genre || "—") +
      kv2("风格", book.style || "—") +
      kv2("视角", book.pov === "first" ? "第一人称" : "第三人称") +
      "</div></div></div>";

    html += '<div class="card"><div class="card-body"><div class="nv-block-h">故事结构（卷）' +
      '<button class="btn btn-ghost sm" onclick="nvEditVolume(null)">＋ 卷</button></div>';
    var vols = book.volumes || [];
    if (!vols.length) html += '<div class="nv-dim">还没有卷，点「＋ 卷」划分故事结构</div>';
    vols.forEach(function (v) {
      var cs = chs.filter(function (x) { return Number(x.volume) === Number(v.num); });
      var words = 0;
      cs.forEach(function (x) { words += nvCnWordCount(x.draft); });
      html += '<div class="nv-vol-row" onclick="nvSub(\'volumes\')">' +
        '<span class="nv-vol-num">第 ' + v.num + " 卷</span>" +
        '<span class="nv-vol-title">' + esc(v.title || "未命名") + "</span>" +
        '<span class="nv-dim">' + (v.range || "") + " · " + cs.length + " 章 · " + words + " 字</span></div>";
    });
    html += "</div></div>";

    html += '<div class="card"><div class="card-body"><div class="nv-block-h">当前进度' +
      '<span class="nv-dim">' + chs.length + " 章 · " + nvBookWordCount(book.id) + " 字</span></div>" +
      bar(book.targetWords ? nvBookWordCount(book.id) / book.targetWords * 100 : Math.min(100, chs.length * 4)) +
      "</div></div>";

    html += '<div class="card"><div class="card-body"><div class="nv-block-h">人物一览' +
      '<button class="btn btn-ghost sm" onclick="nvEditChar(null)">＋ 人物</button></div>' +
      '<div class="nv-chip-wrap">' + nvBookChars(book.id).map(function (x) {
        return '<span class="nv-chip" onclick="nvGo(\'char:' + x.id + '\')">' + esc(x.name) + "</span>";
      }).join("") + "</div></div></div>";
    c.innerHTML = html;
  }

  function storyVolumes(c, html, book) {
    var chs = nvBookChapters(book.id);
    html += '<div class="card"><div class="card-body"><div class="nv-block-h">卷结构' +
      '<button class="btn btn-ghost sm" onclick="nvEditVolume(null)">＋ 新建卷</button></div>';
    var vols = book.volumes || [];
    if (!vols.length) html += '<div class="nv-dim">暂无卷</div>';
    vols.forEach(function (v) {
      var cs = chs.filter(function (x) { return Number(x.volume) === Number(v.num); });
      var words = 0;
      cs.forEach(function (x) { words += nvCnWordCount(x.draft); });
      html += '<div class="card nv-inner"><div class="card-body">' +
        '<div class="nv-block-h">第 ' + v.num + " 卷 " + esc(v.title || "未命名") +
        '<span><button class="btn btn-ghost sm" onclick="nvEditVolume(' + v.num + ')">编辑</button>' +
        '<button class="btn btn-ghost sm nv-danger" onclick="nvDelVolume(' + v.num + ')">删除</button></span></div>' +
        '<div class="nv-dim">' + esc(v.range || "未设置章号范围") + " · " + cs.length + " 章 · " + words + " 字</div>" +
        (v.note ? '<div style="margin-top:6px">' + esc(v.note) + "</div>" : "") +
        '<div class="nv-chip-wrap">' + cs.map(function (x) {
          return '<span class="nv-chip" onclick="nvGo(\'chapter:' + x.id + '\')">第' + x.num + "章 " + esc(x.title || "") + "</span>";
        }).join("") + "</div></div></div>";
    });
    html += "</div></div>";
    c.innerHTML = html;
  }

  function storyChars(c, html, book) {
    var chars = nvBookChars(book.id);
    html += '<div class="card"><div class="card-body"><div class="nv-block-h">人物（' + chars.length + '）' +
      '<button class="btn btn-primary sm" onclick="nvEditChar(null)">＋ 新建人物</button></div>' +
      (chars.length ? '<div class="nv-char-grid">' + chars.map(function (x) {
        return '<div class="nv-char-card" onclick="nvGo(\'char:' + x.id + '\')">' +
          '<div class="nv-char-name">' + esc(x.name) + "</div>" +
          '<div class="nv-dim">' + esc(x.role || "") + "</div>" +
          '<div class="nv-char-traits">' + (x.personality || x.traits || []).slice(0, 3).map(function (t) {
            return badge(t, "#8b5cf6");
          }).join("") + "</div></div>";
      }).join("") + "</div>" : '<div class="nv-dim">还没有人物</div>') + "</div></div>";
    c.innerHTML = html;
  }

  function renderNovelCharDetail(c, charId) {
    var x = nvChar(charId);
    if (!x) { c.innerHTML = '<div class="empty-state"><div class="empty-text">人物不存在</div></div>'; return; }
    var card = x.card || {};
    var chs = nvBookChapters(x.bookId).filter(function (ch) {
      return (ch.card && (ch.card.chars || []).indexOf(x.name) >= 0) ||
        JSON.stringify(ch.spec || {}).indexOf(x.name) >= 0;
    });
    var rels = nvBookRelations(x.bookId).filter(function (r) { return r.a === x.name || r.b === x.name; });

    var html = '<div class="nv-crumb"><button class="btn btn-ghost sm" onclick="nvSub(\'chars\')">← 人物</button>' +
      '<span class="nv-crumb-t">' + esc(x.name) + "</span></div>" +
      '<div class="nv-act-bar">' +
      '<button class="btn btn-primary sm" onclick="nvEditChar(\'' + x.id + '\')">✏️ 编辑</button>' +
      '<button class="btn btn-ghost sm" onclick="nvEditRelation(null)">＋ 加关系</button>' +
      '<button class="btn btn-ghost sm nv-danger" onclick="nvDel(\'chars\',\'' + x.id + '\')">删除</button>' +
      "</div>";

    html += '<div class="card"><div class="card-body">' +
      '<div class="nv-detail-h">' + esc(x.name) + ' <span class="nv-dim">' + esc(x.role || "") + "</span></div>" +
      '<div class="nv-card-grid">' +
      kv2("年龄", x.age || "—") + kv2("职业", x.job || "—") +
      kv2("城市", x.city || "—") + kv2("首次出场", x.firstAppearChapter ? "第 " + x.firstAppearChapter + " 章" : "—") +
      "</div>";
    if ((x.personality || x.traits || []).length) {
      html += '<div class="nv-card-sec"><div class="nv-card-label">性格</div><div class="nv-chip-wrap">' +
        (x.personality || x.traits).map(function (t) { return badge(t, "#8b5cf6"); }).join(" ") + "</div></div>";
    }
    [["核心欲望", x.desire], ["核心恐惧", x.fear || card.fear], ["人物缺陷", x.flaw], ["爱情观", x.loveView]].forEach(function (r) {
      if (r[1]) html += '<div class="nv-card-sec"><div class="nv-card-label">' + r[0] + '</div><div class="nv-card-val">' + esc(r[1]) + "</div></div>";
    });
    if ((x.habits || []).length) {
      html += '<div class="nv-card-sec"><div class="nv-card-label">习惯</div><div class="nv-chip-wrap">' +
        x.habits.map(function (t) { return badge(t, "#0ea5e9"); }).join(" ") + "</div></div>";
    }
    if (card.appearance) html += '<div class="nv-card-sec"><div class="nv-card-label">外貌</div><div class="nv-card-val">' + esc(card.appearance) + "</div></div>";
    if ((x.secrets || []).length || card.secret) {
      html += '<div class="nv-card-sec"><div class="nv-card-label">秘密</div><div class="nv-card-val">' + esc((x.secrets || []).join("；") || card.secret) + "</div></div>";
    }
    if (card.catchphrase) html += '<div class="nv-card-sec"><div class="nv-card-label">口头禅</div><div class="nv-card-val">' + esc(card.catchphrase) + "</div></div>";
    html += "</div></div>";

    var arc = [["起点", card.arcStart], ["冲突", card.arcConflict], ["转折", card.arcTurn], ["终点", card.arcEnd]]
      .filter(function (r) { return r[1]; });
    html += '<div class="card"><div class="card-body"><div class="nv-block-h">成长弧光' +
      '<button class="btn btn-ghost sm" onclick="nvEditChar(\'' + x.id + '\')">编辑</button></div>';
    if (arc.length) {
      html += '<div class="nv-arc">' + arc.map(function (r) {
        return '<div class="nv-arc-node"><div class="nv-arc-l">' + r[0] + '</div><div class="nv-arc-v">' + esc(r[1]) + "</div></div>";
      }).join("") + "</div>";
    } else {
      html += '<div class="nv-dim">' + esc(x.arc || "（未填写成长弧光）") + "</div>";
    }
    html += "</div></div>";

    html += '<div class="card"><div class="card-body"><div class="nv-block-h">关系（' + rels.length + '）</div>' +
      (rels.length ? rels.map(function (r) {
        var other = r.a === x.name ? r.b : r.a;
        return '<div class="nv-rel-line" onclick="nvGo(\'relation:' + r.id + '\')">' +
          badge(other, "#475569") + " · " + esc(r.type || "") + ' <span class="nv-dim">' + esc(r.state || "") + "</span></div>";
      }).join("") : '<div class="nv-dim">暂无关系记录</div>') + "</div></div>";

    html += '<div class="card"><div class="card-body"><div class="nv-block-h">出场章节（' + chs.length + '）</div>' +
      (chs.length ? '<div class="nv-chip-wrap">' + chs.map(function (ch) {
        return '<span class="nv-chip" onclick="nvGo(\'chapter:' + ch.id + '\')">第' + ch.num + "章 " + esc(ch.title || "") + "</span>";
      }).join("") + "</div>" : '<div class="nv-dim">未在幕后卡片中出场</div>') + "</div></div>";
    c.innerHTML = html;
  }

  function storyRelations(c, html, book) {
    var rels = nvBookRelations(book.id);
    html += '<div class="card"><div class="card-body"><div class="nv-block-h">人物关系（' + rels.length + '）' +
      '<button class="btn btn-primary sm" onclick="nvEditRelation(null)">＋ 新建关系</button></div>';
    if (!rels.length) html += '<div class="nv-dim">还没有关系，点「＋ 新建关系」</div>';
    rels.forEach(function (r) {
      html += '<div class="nv-rel-card" onclick="nvGo(\'relation:' + r.id + '\')">' +
        '<div class="nv-rel-head">' + esc(r.a) + " ←→ " + esc(r.b) + "</div>" +
        '<div class="nv-dim">' + esc(r.type || "") + " · " + esc(r.state || "") + "</div>" +
        (r.conflict ? '<div class="nv-rel-conflict">核心矛盾：' + esc(r.conflict) + "</div>" : "") +
        "</div>";
    });
    html += "</div></div>";
    c.innerHTML = html;
  }

  function renderNovelRelationDetail(c, relId) {
    var r = null;
    nvDB().relations.forEach(function (x) { if (x.id === relId) r = x; });
    if (!r) { c.innerHTML = '<div class="empty-state"><div class="empty-text">关系不存在</div></div>'; return; }
    var html = '<div class="nv-crumb"><button class="btn btn-ghost sm" onclick="nvSub(\'relations\')">← 关系</button>' +
      '<span class="nv-crumb-t">' + esc(r.a) + " × " + esc(r.b) + "</span></div>" +
      '<div class="nv-act-bar">' +
      '<button class="btn btn-primary sm" onclick="nvEditRelation(\'' + r.id + '\')">✏️ 编辑</button>' +
      '<button class="btn btn-ghost sm" onclick="nvEditRelationChange(\'' + r.id + '\')">＋ 变化记录</button>' +
      '<button class="btn btn-ghost sm nv-danger" onclick="nvDel(\'relations\',\'' + r.id + '\')">删除</button></div>';
    html += '<div class="card"><div class="card-body"><div class="nv-detail-h">' + esc(r.a) + " × " + esc(r.b) + "</div>" +
      '<div class="nv-card-grid">' + kv2("关系", r.type || "—") + kv2("当前状态", r.state || "—") + "</div>" +
      '<div class="nv-card-sec"><div class="nv-card-label">过去</div><div class="nv-card-val">' + esc(r.past || "—") + "</div></div>" +
      '<div class="nv-card-sec"><div class="nv-card-label">现在</div><div class="nv-card-val">' + esc(r.now || "—") + "</div></div>" +
      '<div class="nv-card-sec"><div class="nv-card-label">核心矛盾</div><div class="nv-card-val">' + esc(r.conflict || "—") + "</div></div>" +
      "</div></div>";
    html += '<div class="card"><div class="card-body"><div class="nv-block-h">最近变化</div>' +
      ((r.changes || []).length ? r.changes.slice().sort(function (a, b) { return (a.ch || 0) - (b.ch || 0); }).map(function (x) {
        return '<div class="nv-rel-line">第 ' + x.ch + " 章 · " + esc(x.note || "") + "</div>";
      }).join("") : '<div class="nv-dim">暂无变化记录</div>') + "</div></div>";
    c.innerHTML = html;
  }

  function storyTimeline(c, html, book) {
    var evs = nvBookEvents(book.id);
    html += '<div class="card"><div class="card-body"><div class="nv-block-h">故事时间线（' + evs.length + '）' +
      '<button class="btn btn-primary sm" onclick="nvEditEvent(null)">＋ 新建事件</button></div>';
    if (!evs.length) html += '<div class="nv-dim">还没有时间线事件</div>';
    evs.forEach(function (e) {
      html += '<div class="nv-tl-row" onclick="nvGo(\'event:' + e.id + '\')">' +
        '<div class="nv-tl-time">' + esc(e.time || "—") + '</div><div class="nv-tl-main">' +
        '<div class="nv-tl-title">' + esc(e.title || "未命名事件") + "</div>" +
        (e.happened ? '<div class="nv-dim">' + esc(String(e.happened).slice(0, 60)) + "</div>" : "") +
        ((e.chars || []).length ? '<div class="nv-chip-wrap">' + e.chars.map(function (n) { return badge(n, "#0ea5e9"); }).join(" ") + "</div>" : "") +
        "</div></div>";
    });
    html += "</div></div>";
    c.innerHTML = html;
  }
  function renderNovelEventDetail(c, id) {
    var e = null;
    nvDB().events.forEach(function (x) { if (x.id === id) e = x; });
    if (!e) { c.innerHTML = '<div class="empty-state"><div class="empty-text">事件不存在</div></div>'; return; }
    var html = '<div class="nv-crumb"><button class="btn btn-ghost sm" onclick="nvSub(\'timeline\')">← 时间线</button>' +
      '<span class="nv-crumb-t">' + esc(e.title || "") + "</span></div>" +
      '<div class="nv-act-bar"><button class="btn btn-primary sm" onclick="nvEditEvent(\'' + e.id + '\')">✏️ 编辑</button>' +
      '<button class="btn btn-ghost sm nv-danger" onclick="nvDel(\'events\',\'' + e.id + '\')">删除</button></div>';
    html += '<div class="card"><div class="card-body"><div class="nv-detail-h">' + esc(e.title || "") + "</div>" +
      '<div class="nv-card-grid">' + kv2("时间", e.time || "—") +
      kv2("关联章节", (e.chapters || []).map(function (x) { return "第 " + x + " 章"; }).join("、") || "—") + "</div>" +
      '<div class="nv-card-sec"><div class="nv-card-label">发生</div><div class="nv-card-val">' + esc(e.happened || e.summary || "—") + "</div></div>" +
      '<div class="nv-card-sec"><div class="nv-card-label">人物感受</div><div class="nv-card-val">' + esc(e.feeling || "—") + "</div></div>" +
      '<div class="nv-card-sec"><div class="nv-card-label">影响</div><div class="nv-card-val">' + esc(e.impact || "—") + "</div></div>" +
      ((e.chars || []).length ? '<div class="nv-card-sec"><div class="nv-card-label">涉及人物</div><div class="nv-chip-wrap">' +
        e.chars.map(function (n) { return badge(n, "#0ea5e9"); }).join(" ") + "</div></div>" : "") +
      "</div></div>";
    c.innerHTML = html;
  }

  function storyWorld(c, html, book) {
    var w = book.world || {};
    html += '<div class="card"><div class="card-body"><div class="nv-block-h">世界观' +
      '<button class="btn btn-primary sm" onclick="nvEditWorld(\'' + book.id + '\')">✏️ 编辑</button></div>' +
      '<div class="nv-card-sec"><div class="nv-card-label">基础设定</div><div class="nv-card-val">' + esc(w.basic || "—") + "</div></div>" +
      '<div class="nv-card-sec"><div class="nv-card-label">核心规则</div><div class="nv-card-val">' + esc(w.rules || "—") + "</div></div>" +
      '<div class="nv-card-sec"><div class="nv-card-label">历史传说</div><div class="nv-card-val">' + esc(w.history || "—") + "</div></div>" +
      '<div class="nv-card-sec"><div class="nv-card-label">文化习俗</div><div class="nv-card-val">' + esc(w.customs || "—") + "</div></div>" +
      '<div class="nv-card-sec"><div class="nv-card-label">核心悬念</div><div class="nv-card-val">' + esc(w.mystery || "—") + "</div></div>" +
      '<div class="nv-card-sec"><div class="nv-card-label">重要地点</div><div class="nv-chip-wrap">' +
      ((w.places || []).length ? w.places.map(function (p) { return badge(p, "#10b981"); }).join(" ") : '<span class="nv-dim">—</span>') + "</div></div>" +
      "</div></div>";
    c.innerHTML = html;
  }

  function storyForeshadows(c, html, book) {
    var g = nvBookForeshadows(book.id);
    var all = nvDB().foreshadows.filter(function (f) { return f.bookId === book.id; });
    html += '<div class="card"><div class="card-body"><div class="nv-block-h">伏笔库' +
      '<button class="btn btn-primary sm" onclick="nvEditForeshadow(null)">＋ 新建伏笔</button></div>' +
      '<div class="nv-stat-grid">' + dv(g.setup.length, "已埋") + dv(g.pending.length, "待兑") +
      dv(g.paid.length, "已兑") + dv(g.lost.length, "遗失") + "</div></div></div>";
    ["setup", "pending", "paid", "lost"].forEach(function (st) {
      if (!g[st].length) return;
      html += '<div class="card"><div class="card-body"><div class="nv-block-h">' +
        '<span class="nv-fs-dot" style="background:' + FORESHADOW_COLOR[st] + '"></span>' + FORESHADOW_LABEL[st] +
        "（" + g[st].length + "）</div>" +
        g[st].map(function (f) {
          return '<div class="nv-fs-row" onclick="nvGo(\'foreshadow:' + f.id + '\')">' +
            "<div><b>" + esc(f.title) + "</b><br>" +
            '<span class="nv-dim">首现第 ' + (f.setupChapter || "?") + " 章" +
            (f.payoffChapter != null ? " · 计划回收第 " + f.payoffChapter + " 章" : "") + "</span></div>" +
            '<span class="nv-fs-arrow">›</span></div>';
        }).join("") + "</div></div>";
    });
    if (!all.length) html += '<div class="card"><div class="card-body"><div class="nv-dim">还没有伏笔</div></div></div>';
    c.innerHTML = html;
  }
  function renderNovelFsDetail(c, fsId) {
    var f = nvForeshadow(fsId);
    if (!f) { c.innerHTML = '<div class="empty-state"><div class="empty-text">伏笔不存在</div></div>'; return; }
    var maxNum = 0;
    nvBookChapters(f.bookId).forEach(function (x) { if (x.num > maxNum) maxNum = x.num; });
    var html = '<div class="nv-crumb"><button class="btn btn-ghost sm" onclick="nvSub(\'foreshadows\')">← 伏笔</button>' +
      '<span class="nv-crumb-t">' + esc(f.title) + "</span></div>" +
      '<div class="nv-act-bar">' +
      "<button class=\"btn btn-primary sm\" onclick=\"nvEditForeshadow('" + f.id + "')\">✏️ 编辑</button>" +
      ["setup", "pending", "paid", "lost"].map(function (st) {
        return '<button class="btn btn-ghost sm' + (f.status === st ? " nv-on" : "") + '" onclick="nvFsTrans(\'' + f.id + '\',\'' + st + '\')">' + FORESHADOW_LABEL[st] + "</button>";
      }).join("") +
      '<button class="btn btn-ghost sm nv-danger" onclick="nvDel(\'foreshadows\',\'' + f.id + '\')">删除</button></div>';
    html += '<div class="card"><div class="card-body">' +
      '<div class="nv-detail-h">' + esc(f.title) + " " + badge(FORESHADOW_LABEL[f.status] || "", FORESHADOW_COLOR[f.status] || "#94a3b8") + "</div>" +
      '<div class="nv-card-grid">' + kv2("首次出现", f.setupChapter ? "第 " + f.setupChapter + " 章" : "—") +
      kv2("计划回收", f.payoffChapter != null ? "第 " + f.payoffChapter + " 章" : "—") +
      kv2("当前进度", "第 " + maxNum + " 章") + "</div>" +
      (f.setupSnippet ? '<div class="nv-card-sec"><div class="nv-card-label">出现文本</div><div class="nv-card-val">' + esc(f.setupSnippet) + "</div></div>" : "") +
      (f.note ? '<div class="nv-card-sec"><div class="nv-card-label">备注</div><div class="nv-card-val">' + esc(f.note) + "</div></div>" : "") +
      "</div></div>";
    c.innerHTML = html;
  }

  function storyEmotions(c, html, book) {
    var emos = nvBookEmotions(book.id);
    var maxNum = 0;
    nvBookChapters(book.id).forEach(function (x) { if (x.num > maxNum) maxNum = x.num; });
    html += '<div class="card"><div class="card-body"><div class="nv-block-h">情绪线（' + emos.length + " 条）" +
      '<button class="btn btn-primary sm" onclick="nvEditEmotion(null)">＋ 新建情绪线</button></div>';
    if (!emos.length) html += '<div class="nv-dim">还没有情绪线，可为一对人物建立感情变化曲线</div>';
    emos.forEach(function (e) {
      html += '<div class="card nv-inner"><div class="card-body">' +
        '<div class="nv-block-h">' + esc(e.a) + " × " + esc(e.b) +
        '<span><button class="btn btn-ghost sm" onclick="nvEditEmotionPoint(\'' + e.id + '\')">＋ 标记章节</button>' +
        '<button class="btn btn-ghost sm nv-danger" onclick="nvDel(\'emotions\',\'' + e.id + '\')">删除</button></span></div>';
      var pts = (e.points || []).slice().sort(function (x, y) { return x.ch - y.ch; });
      if (!pts.length) html += '<div class="nv-dim">暂无标记</div>';
      pts.forEach(function (p) {
        html += '<div class="nv-emo-line"><span class="nv-emo-ch">' + p.ch + "</span>" +
          bar(p.value || 0, "#ec4899") +
          '<span class="nv-emo-stage">' + esc(p.stage || "") + "</span></div>";
      });
      if (pts.length && pts[pts.length - 1].ch < maxNum) {
        html += '<div class="nv-dim" style="margin-top:6px">⚠ 最新标记在第 ' + pts[pts.length - 1].ch +
          " 章，落后当前进度（第 " + maxNum + " 章）</div>";
      }
      html += "</div></div>";
    });
    html += "</div></div>";
    c.innerHTML = html;
  }


  // ============================================================
  // 17. 🤖 AI
  // ============================================================
  function renderNovelAI(c) {
    var book = nvCurBook();
    if (!book) { c.innerHTML = headBar("AI") + '<div class="empty-state"><div class="empty-text">请先新建小说</div></div>'; return; }
    var subs = [
      { k: "assist", t: "✦ 助手" },
      { k: "doctor", t: "🩺 故事医生" },
      { k: "context", t: "🧠 全局上下文" },
      { k: "review", t: "🔍 评审" },
      { k: "advance", t: "🚀 推进" }
    ];
    var sub = root.NV_AI_SUB || "assist";
    var html = headBar("AI 写作台", bookSwitcher());
    html += tabBarHtml("ai");
    html += subTabs(subs, sub, "nvAiSub");
    if (sub === "doctor") return aiDoctor(c, html, book);
    if (sub === "context") return aiContext(c, html, book);
    if (sub === "review") return aiReview(c, html, book);
    if (sub === "advance") return aiAdvance(c, html, book);
    return aiAssist(c, html, book);
  }

  function aiAssist(c, html, book) {
    var chs = nvBookChapters(book.id);
    var cur = nvTodayChapter(book.id);
    html += '<div class="card"><div class="card-body"><div class="nv-block-h">AI 写作助手</div>' +
      '<div class="nv-form-intro">选一章 → 选动作 → 生成可复制的 Prompt（粘贴到任意 LLM 即可）</div>' +
      '<label class="nv-f-label">目标章节</label><select class="nv-f-input" id="nv-ai-ch">' +
      (chs.length ? chs.map(function (x) {
        return '<option value="' + x.id + '"' + (cur && cur.id === x.id ? " selected" : "") + ">第 " + x.num + " 章 · " + esc(x.title || "") + "</option>";
      }).join("") : '<option value="">（暂无章节）</option>') + "</select>" +
      '<label class="nv-f-label" style="margin-top:10px">动作</label><div class="nv-quick">' +
      ["继续写", "润色这一段", "增加情绪张力", "补充对白", "换一种写法", "检查人物行为", "问 AI"].map(function (a) {
        return qk(a, "nvAiAct(null,'" + a + "')");
      }).join("") + "</div>" +
      '<label class="nv-f-label" style="margin-top:10px">或直接输入你的要求</label>' +
      '<textarea class="nv-f-input nv-f-ta" id="nv-ai-free" rows="3" placeholder="例：这里我觉得顾川应该先道歉，不要解释。"></textarea>' +
      '<div class="nv-edit-actions"><button class="btn btn-primary sm" onclick="nvAiAct(null,null)">✦ 生成 Prompt</button>' +
      '<button class="btn btn-ghost sm" onclick="nvAiSub(\'context\')">🧠 看全局上下文</button></div>' +
      "</div></div>";
    html += '<div class="card"><div class="card-body"><div class="nv-block-h">可用脚手架</div>' +
      '<div class="nv-dim">· 规范检查：字数 2200-2500 / 爽点 / 钩子 / 作者说 / 视角 / 违禁词 / 逻辑闭环</div>' +
      '<div class="nv-dim">· 违禁词替换表：' + SKILL_RULES.BANNED.map(function (b) { return b.word + "→" + b.subs[0]; }).join("、") + "</div>" +
      '<div class="nv-dim">· 5 维评审：阅读者 25 / 编审 25 / 故事家 25 / 文学顾问 15 / 毒舌读者 10</div>' +
      '<div class="nv-dim">· 红线分级：P0 绝对禁止 / P1 建议避免 / P2 可选优化</div>' +
      "</div></div>";
    c.innerHTML = html;
  }
  function aiReview(c, html, book) {
    var chs = nvBookChapters(book.id);
    var rows = chs.map(function (ch) { return { ch: ch, r: nvReviewByCh(ch.id) }; });
    var scored = rows.filter(function (x) { return x.r; });
    var avg = 0;
    scored.forEach(function (x) { avg += x.r.finalScore || 0; });
    if (scored.length) avg = Math.round(avg / scored.length);
    html += '<div class="card"><div class="card-body"><div class="nv-block-h">5 维评审口径</div>' +
      '<div class="nv-rule-chips">' + REVIEW_ROLES.map(function (r) {
        return badge(r.label + " " + r.weight + "%", "#6366f1");
      }).join(" ") + "</div>" +
      '<div class="nv-stat-grid" style="margin-top:10px">' + dv(scored.length, "已评章节") + dv(avg || "—", "平均分") + "</div></div></div>";
    html += '<div class="card"><div class="card-body"><div class="nv-block-h">逐章评审</div>' +
      (rows.length ? rows.map(function (x) {
        var col = x.r && x.r.finalScore >= 85 ? "#10b981" : (x.r && x.r.finalScore >= 70 ? "#f59e0b" : "#94a3b8");
        return '<div class="nv-rv-row" onclick="nvGo(\'chapter:' + x.ch.id + '\')">' +
          '<span class="nv-rv-ch">第 ' + x.ch.num + " 章</span>" +
          '<span class="nv-rv-t">' + esc(x.ch.title || "") + "</span>" +
          '<span class="nv-rv-s" style="color:' + col + '">' + (x.r ? x.r.finalScore : "—") + "</span>" +
          '<span class="nv-rv-f">' + ((x.r && x.r.flags || []).slice(0, 2).map(function (f) {
            return badge(f, /^P0/.test(f) ? "#ef4444" : "#f59e0b");
          }).join(" ")) + "</span></div>";
      }).join("") : '<div class="nv-dim">暂无章节</div>') + "</div></div>";
    c.innerHTML = html;
  }
  function aiAdvance(c, html, book) {
    var d = nvDB();
    var tasks = d.advances.filter(function (t) { return t.bookId === book.id; });
    html += '<div class="card"><div class="card-body"><div class="nv-block-h">自动化推进</div>' +
      '<div class="nv-form-intro">批量连续写作：生成规格 → 生成正文占位 → 自动 5 维评审 → 低于阈值出修订任务</div>' +
      '<label class="nv-f-label">推进章数</label>' +
      '<input class="nv-f-input nv-adv-total" id="nv-adv-total" type="number" value="3" min="1" max="50">' +
      '<label class="nv-f-label" style="margin-top:8px">评审阈值</label>' +
      '<input class="nv-f-input" id="nv-adv-th" type="number" value="85" min="60" max="100">' +
      '<div class="nv-edit-actions"><button class="btn btn-primary sm" onclick="nvEnqueueAdvanceUI()">🚀 创建推进任务</button></div>' +
      "</div></div>";
    html += '<div class="card"><div class="card-body"><div class="nv-block-h">' +
      (tasks.length ? "推进任务历史" : "暂无推进任务") + "</div>" +
      (tasks.length ? tasks.slice().reverse().map(function (t) {
        return '<div class="nv-adv-row" onclick="nvGo(\'advance:' + t.id + '\')">' +
          "<div><b>" + t.total + " 章</b> · 阈值 " + t.threshold + "<br>" +
          '<span class="nv-dim">状态 ' + esc(t.status) + " · 已推进至第 " + t.currentNum + " 章 · " +
          (t.log || []).length + " 条日志</span></div><span class=\"nv-fs-arrow\">›</span></div>";
      }).join("") : '<div class="nv-dim">创建任务后在这里查看进度</div>') + "</div></div>";
    c.innerHTML = html;
  }
  function renderNovelAdvanceDetail(c, taskId) {
    var d = nvDB();
    var t = d.advances.filter(function (x) { return x.id === taskId; })[0];
    if (!t) { c.innerHTML = '<div class="empty-state"><div class="empty-text">任务不存在</div></div>'; return; }
    var book = nvGet(t.bookId);
    var html = '<div class="nv-crumb"><button class="btn btn-ghost sm" onclick="nvAiSub(\'advance\')">← 推进</button>' +
      '<span class="nv-crumb-t">推进任务</span></div>';
    html += '<div class="card"><div class="card-body">' +
      '<div class="nv-detail-h">《' + esc(book ? book.title : "") + "》 推进 " + t.total + " 章</div>" +
      '<div class="nv-detail-row">状态 ' + badge(t.status, t.status === "done" ? "#10b981" : "#f59e0b") +
      " · 阈值 " + t.threshold + " 分 · 当前至第 " + t.currentNum + " 章</div>" +
      '<div class="nv-edit-actions">' +
      '<button class="btn btn-primary sm" onclick="nvAdvanceStepUI(\'' + t.id + '\')">▶ 推进一步</button>' +
      (t.status === "done" ? "" : '<button class="btn btn-ghost sm" onclick="nvAdvanceAllUI(\'' + t.id + '\')">⏭ 推完剩余</button>') +
      "</div></div></div>";
    html += '<div class="card"><div class="card-body"><div class="nv-block-h">任务日志（' + (t.log || []).length + "）</div>" +
      (t.log || []).slice().reverse().map(function (l) {
        return '<div class="nv-log-row"><span class="nv-dim">' + String(l.ts || "").slice(11, 19) + "</span> " + esc(l.text || "") + "</div>";
      }).join("") + "</div></div>";
    c.innerHTML = html;
  }
  root.nvEnqueueAdvanceUI = function () {
    var book = nvCurBook();
    if (!book) { if (typeof showToast === "function") showToast("请先新建小说", "warn"); return; }
    var e1 = document.getElementById("nv-adv-total"), e2 = document.getElementById("nv-adv-th");
    var total = parseInt(e1 && e1.value, 10) || 3;
    var th = parseInt(e2 && e2.value, 10) || 85;
    var t = nvEnqueueAdvance(book.id, total, { threshold: th });
    if (typeof showToast === "function") showToast("🚀 已创建推进任务 · " + total + " 章", "success");
    root.NV_VIEW = "advance:" + t.id;
    if (typeof render === "function") render();
  };
  root.nvAdvanceStepUI = function (id) {
    var r = nvAdvanceStep(id);
    if (!r.ok) { if (typeof showToast === "function") showToast(r.msg || "推进失败", "warn"); return; }
    if (typeof showToast === "function") showToast(r.done ? "✅ 任务已完成" : "▶ 已推进一章", "success");
    if (typeof render === "function") render();
  };
  root.nvAdvanceAllUI = function (id) {
    var n = 0;
    for (var i = 0; i < 50; i++) {
      var r = nvAdvanceStep(id);
      if (!r.ok || r.done) break;
      n++;
    }
    if (typeof showToast === "function") showToast("⏭ 推进完成 · 新增 " + n + " 章", "success");
    if (typeof render === "function") render();
  };

  function aiDoctor(c, html, book) {
    var issues = nvDoctor(book.id);
    var warn = issues.filter(function (x) { return x.level !== "ok"; });
    html += '<div class="card"><div class="card-body"><div class="nv-block-h">故事体检' +
      '<span class="nv-dim">发现 ' + warn.length + " 个需关注</span></div>" +
      '<div class="nv-form-intro">只告诉你哪里可能有问题、为什么、涉及哪些章节，不替你决定怎么改。</div>';
    if (!issues.length) html += '<div class="nv-dim">暂无数据</div>';
    issues.forEach(function (x) {
      var color = x.level === "ok" ? "#10b981" : (x.level === "warn" ? "#f59e0b" : "#ef4444");
      html += '<div class="nv-doc-row"><span class="nv-doc-tag" style="background:' + color + '22;color:' + color + '">' +
        esc(x.tag) + "</span><div class=\"nv-doc-main\"><b>" + esc(x.title) + "</b><br>" +
        '<span class="nv-dim">' + esc(x.detail) + "</span>" +
        ((x.chapters || []).length ? '<br><span class="nv-dim">涉及：' + x.chapters.map(function (n) { return "第 " + n + " 章"; }).join("、") + "</span>" : "") +
        "</div></div>";
    });
    html += "</div></div>";
    c.innerHTML = html;
  }
  function nvDoctor(bookId) {
    var out = [];
    var d = nvDB();
    var chs = nvBookChapters(bookId);
    var chars = nvBookChars(bookId);
    if (!chs.length) return out;
    var lastSeen = {};
    chs.forEach(function (ch) {
      ((ch.card && ch.card.chars) || []).forEach(function (n) { lastSeen[n] = ch.num; });
    });
    var maxNum = chs[chs.length - 1].num;
    chars.forEach(function (x) {
      var seen = lastSeen[x.name];
      if (seen && maxNum - seen >= 5) {
        out.push({ level: "warn", tag: "人物", title: x.name + " 连续 " + (maxNum - seen) + " 章没有出现", detail: "上次出场在第 " + seen + " 章，当前已到第 " + maxNum + " 章，读者可能淡忘。", chapters: [seen, maxNum] });
      }
      if (!seen && /主/.test(x.role || "")) {
        out.push({ level: "error", tag: "人物", title: "主角 " + x.name + " 从未出现在任何幕后卡片", detail: "所有章节的「涉及人物」都没有他，主线可能脱节。", chapters: [] });
      }
    });
    var noCard = chs.filter(function (x) { return !x.card || !String(x.card.task || "").trim(); });
    if (noCard.length) out.push({ level: "warn", tag: "结构", title: noCard.length + " 章缺「本章任务」", detail: "幕后卡片不完整时，AI 无法判断这一章要完成什么。", chapters: noCard.slice(0, 8).map(function (x) { return x.num; }) });
    var noSpec = chs.filter(function (x) { return !x.spec; });
    if (noSpec.length) out.push({ level: "warn", tag: "结构", title: noSpec.length + " 章缺规格", detail: "缺 spec 会让生成内容偏离大纲。", chapters: noSpec.slice(0, 8).map(function (x) { return x.num; }) });
    var shortRun = [];
    chs.forEach(function (x) {
      if (nvCnWordCount(x.draft) < 800) shortRun.push(x.num);
      else {
        if (shortRun.length >= 3) out.push({ level: "warn", tag: "节奏", title: "第 " + shortRun[0] + "–" + shortRun[shortRun.length - 1] + " 章字数偏少", detail: "连续 " + shortRun.length + " 章正文不足 800 字，信息密度可能失衡。", chapters: shortRun.slice() });
        shortRun = [];
      }
    });
    if (shortRun.length >= 3) out.push({ level: "warn", tag: "节奏", title: "第 " + shortRun[0] + "–" + shortRun[shortRun.length - 1] + " 章字数偏少", detail: "连续 " + shortRun.length + " 章正文不足 800 字。", chapters: shortRun.slice() });
    d.foreshadows.filter(function (f) { return f.bookId === bookId; }).forEach(function (f) {
      if ((f.status === "setup" || f.status === "pending") && f.payoffChapter && maxNum > f.payoffChapter) {
        out.push({ level: "warn", tag: "伏笔", title: f.title + " 计划在第 " + f.payoffChapter + " 章回收，已逾期", detail: "当前推进到第 " + maxNum + " 章，需要安排回收或调整计划。", chapters: [f.setupChapter, maxNum] });
      }
    });
    nvBookEmotions(bookId).forEach(function (e) {
      var pts = (e.points || []).slice().sort(function (a, b) { return a.ch - b.ch; });
      if (!pts.length) {
        out.push({ level: "warn", tag: "情感", title: e.a + " × " + e.b + " 情绪线尚未标记", detail: "没有阶段标记就无法发现感情线停滞。", chapters: [] });
        return;
      }
      var flat = 0, maxFlat = 0;
      for (var i = 1; i < pts.length; i++) {
        if ((pts[i].value || 0) - (pts[i - 1].value || 0) === 0) { flat++; if (flat > maxFlat) maxFlat = flat; }
        else flat = 0;
      }
      if (maxFlat >= 2) out.push({ level: "warn", tag: "情感", title: e.a + " × " + e.b + " 感情线连续 " + (maxFlat + 1) + " 章无变化", detail: "阶段强度持平，可能产生重复感。", chapters: [] });
      var last = pts[pts.length - 1];
      if (last.ch < maxNum) out.push({ level: "warn", tag: "情感", title: e.a + " × " + e.b + " 情绪线落后进度", detail: "最新标记在第 " + last.ch + " 章，剧情已到第 " + maxNum + " 章。", chapters: [last.ch, maxNum] });
    });
    chs.forEach(function (x) {
      var hits = nvScanRedLines(x.draft).filter(function (h) { return h.level === "P0"; });
      if (hits.length >= 2) {
        out.push({ level: "error", tag: "文风", title: "第 " + x.num + " 章命中 " + hits.length + " 项 P0 红线", detail: hits.map(function (h) { return h.label; }).join("、"), chapters: [x.num] });
      }
    });
    var names = chars.map(function (c) { return c.name; });
    nvBookRelations(bookId).forEach(function (r) {
      var miss = [r.a, r.b].filter(function (n) { return names.indexOf(n) < 0; });
      if (miss.length) {
        out.push({ level: "warn", tag: "一致性", title: "关系「" + r.a + " × " + r.b + "」中 " + miss.join("、") + " 不在人物列表", detail: "可能是改名或删除后遗留，建议核对。", chapters: [] });
      }
    });
    if (!nvBookEvents(bookId).length && chs.length >= 3) {
      out.push({ level: "warn", tag: "时间线", title: "尚未建立故事时间线", detail: "已有 " + chs.length + " 章却没有时间线事件，容易出现前后矛盾。", chapters: [] });
    } else if (nvBookEvents(bookId).length >= 3) {
      var noTime = nvBookEvents(bookId).some(function (e) { return !e.time; });
      if (noTime) out.push({ level: "ok", tag: "时间线", title: "部分事件未填写时间", detail: "仅作提示，不影响整体一致性判断。", chapters: [] });
      else out.push({ level: "ok", tag: "时间线", title: "未发现明显冲突", detail: "所有事件均已标注时间。", chapters: [] });
    }
    return out;
  }

  function aiContext(c, html, book) {
    var ctx = nvBuildContext(book.id);
    html += '<div class="card"><div class="card-body"><div class="nv-block-h">AI 全局上下文' +
      '<button class="btn btn-primary sm" onclick="nvAiCopyContext()">复制全部</button></div>' +
      '<div class="nv-form-intro">每次让 AI 写作前，它会先读取这一串上下文，而不是只看你这一句话。</div>' +
      '<div class="nv-ctx-flow">' + ["当前小说", "故事总纲", "当前卷", "当前章节", "相关人物", "人物关系", "时间线", "相关伏笔", "最近正文", "历史事件"]
        .map(function (x) { return '<span class="nv-ctx-node">' + x + "</span>"; }).join('<span class="nv-ctx-arrow">↓</span>') + "</div>" +
      '<textarea class="nv-f-input nv-f-ta" id="nv-ctx-text" rows="14">' + esc(ctx.text) + "</textarea>" +
      "</div></div>";
    c.innerHTML = html;
  }
  root.nvAiCopyContext = function () {
    var el = document.getElementById("nv-ctx-text");
    if (!el) return;
    nvCopy(el.value, "🧠 全局上下文已复制");
  };
  function nvBuildContext(bookId) {
    var book = nvGet(bookId);
    if (!book) return { text: "" };
    var chs = nvBookChapters(bookId);
    var cur = nvTodayChapter(bookId);
    var chars = nvBookChars(bookId);
    var L = [];
    L.push("【当前小说】《" + (book.title || "") + "》 " + (book.genre || "") + "｜" + (book.style || "") +
      "｜" + (book.pov === "first" ? "第一人称" : "第三人称") + "｜共 " + chs.length + " 章 " + nvBookWordCount(bookId) + " 字");
    L.push("【故事总纲】" + (book.oneLiner || "（未填写）"));
    if ((book.themes || []).length) L.push("【主题】" + book.themes.join("｜"));
    var names = [];
    if (cur) {
      var vol = (book.volumes || []).filter(function (v) { return Number(v.num) === Number(cur.volume); })[0];
      L.push("【当前卷】第 " + (cur.volume || 1) + " 卷 " + (vol ? vol.title : ""));
      L.push("【当前章节】第 " + cur.num + " 章 " + (cur.title || "") + "｜任务：" + ((cur.card && cur.card.task) || cur.goal || "—"));
      names = (cur.card && cur.card.chars) || [];
    }
    if (!names.length) names = chars.slice(0, 6).map(function (x) { return x.name; });
    L.push("【相关人物】");
    chars.filter(function (x) { return names.indexOf(x.name) >= 0; }).forEach(function (x) {
      L.push("- " + x.name + "（" + (x.role || "") + "）：欲望「" + (x.desire || "—") + "」恐惧「" +
        (x.fear || (x.card && x.card.fear) || "—") + "」缺陷「" + (x.flaw || "—") + "」");
    });
    var rels = nvBookRelations(bookId).filter(function (r) { return names.indexOf(r.a) >= 0 || names.indexOf(r.b) >= 0; });
    if (rels.length) {
      L.push("【人物关系】");
      rels.forEach(function (r) { L.push("- " + r.a + " × " + r.b + "：" + (r.type || "") + "｜" + (r.conflict || "") + "｜" + (r.state || "")); });
    }
    var evs = nvBookEvents(bookId).slice(-5);
    if (evs.length) {
      L.push("【时间线 / 历史事件】");
      evs.forEach(function (e) { L.push("- " + (e.time || "") + " " + (e.title || "") + "：" + String(e.happened || "").slice(0, 40)); });
    }
    var fss = nvBookPendingFs(bookId);
    if (fss.length) {
      L.push("【待回收伏笔】");
      fss.slice(0, 8).forEach(function (f) {
        L.push("- " + f.title + "（首现第 " + (f.setupChapter || "?") + " 章，计划第 " + (f.payoffChapter || "?") + " 章回收）");
      });
    }
    var insp = nvBookInspirations(bookId).slice(0, 5);
    if (insp.length) {
      L.push("【灵感箱】");
      insp.forEach(function (i) { L.push("- " + String(i.text || "").slice(0, 40)); });
    }
    if (cur && cur.draft) L.push("【当前正文摘录】" + String(cur.draft).slice(0, 300));
    return { text: L.join("\n") };
  }
  function nvCopy(text, okMsg) {
    var done = function () { if (typeof showToast === "function") showToast(okMsg || "📋 已复制", "success"); };
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { prompt("复制（Cmd+C）：", text); });
      } else prompt("复制（Cmd+C）：", text);
    } catch (e) { prompt("复制（Cmd+C）：", text); }
  }
  root.nvAiAct = function (chId, action) {
    var sel = document.getElementById("nv-ai-ch");
    var id = chId || (sel && sel.value);
    var free = document.getElementById("nv-ai-free");
    var extra = (free && free.value) ? free.value : "";
    var ch = id ? nvChapter(id) : null;
    if (!ch) { if (typeof showToast === "function") showToast("请选择章节", "warn"); return; }
    var L = [nvBuildPrompt(ch.bookId, ch.num) || "", "", "【补充上下文】", nvBuildContext(ch.bookId).text, "",
      "【本次任务】" + (action || "按我的要求处理")];
    if (extra) L.push("【作者具体要求】" + extra);
    if (action === "润色这一段") L.push("只输出润色后的文本，保持人称/时态/信息量不变，删除赘余修饰。");
    if (action === "增加情绪张力") L.push("保持剧情不变，加强心理与生理反应描写，结尾留钩子。");
    if (action === "补充对白") L.push("补充 5-10 轮对白，符合各角色说话习惯，避免说明文式对白。");
    if (action === "换一种写法") L.push("给出 2 种不同写法的同一段（各 200 字），标注差异。");
    if (action === "检查人物行为") L.push("逐条指出人物行为与设定冲突之处，给出修改建议，不要重写全文。");
    if (action === "继续写") L.push("承接上文继续写 600-900 字，保持风格与视角一致。");
    nvCopy(L.join("\n"), "📋 AI Prompt 已复制（含全局上下文）");
  };


  // ============================================================
  // 18. 💡 灵感 / 🗂 素材
  // ============================================================
  var IDEA_TYPES = ["人物细节", "剧情转折", "对白", "场景", "设定", "主题", "其他"];
  var MAT_KINDS = ["图片", "音乐", "参考资料", "台词", "片段", "地点", "其他"];
  function renderNovelIdea(c) {
    var book = nvCurBook();
    if (!book) { c.innerHTML = headBar("灵感") + '<div class="empty-state"><div class="empty-text">请先新建小说</div></div>'; return; }
    var list = nvBookInspirations(book.id);
    var html = headBar("灵感箱", bookSwitcher() + '<button class="btn btn-primary sm" onclick="nvEditInspiration(null)">＋ 灵感</button>');
    html += tabBarHtml("idea");
    html += '<div class="card"><div class="card-body">' +
      '<div class="nv-block-h">随手记<span class="nv-dim">' + list.length + " 条</span></div>" +
      '<div class="nv-form-intro">任何时候想到什么，直接写下来；可关联人物与章节。</div>' +
      '<div class="nv-idea-input"><textarea class="nv-f-input nv-f-ta" id="nv-idea-quick" rows="2" placeholder="例：林渊其实一直留着师父那半截残玉，从未示人。"></textarea>' +
      '<button class="btn btn-primary sm" onclick="nvQuickIdea()">保存</button></div>' +
      "</div></div>";
    if (!list.length) {
      html += '<div class="card"><div class="card-body"><div class="nv-dim">还没有灵感记录</div></div></div>';
    }
    IDEA_TYPES.forEach(function (t) {
      var group = list.filter(function (i) { return (i.type || "其他") === t; });
      if (!group.length) return;
      html += '<div class="card"><div class="card-body"><div class="nv-block-h">' + esc(t) + "（" + group.length + "）</div>" +
        group.map(function (i) {
          return '<div class="nv-idea-row"><div class="nv-idea-main" onclick="nvEditInspiration(\'' + i.id + '\')">' +
            '<div class="nv-idea-text">' + esc(i.text) + "</div>" +
            '<div class="nv-dim">' + ((i.chars || []).length ? esc(i.chars.join("、")) + " · " : "") +
            (i.targetChapter ? "适合第 " + i.targetChapter + " 章" : "未定章节") +
            (i.related ? " · " + esc(i.related) : "") + "</div></div>" +
            '<button class="btn btn-ghost sm nv-danger" onclick="nvDel(\'inspirations\',\'' + i.id + '\')">×</button></div>';
        }).join("") + "</div></div>";
    });
    c.innerHTML = html;
  }
  root.nvQuickIdea = function () {
    var el = document.getElementById("nv-idea-quick");
    var v = el ? String(el.value || "").trim() : "";
    if (!v) { if (typeof showToast === "function") showToast("请先写点什么", "warn"); return; }
    var book = nvCurBook();
    EDIT.inspiration(null, { bookId: book ? book.id : "", text: v, type: "其他", chars: [], targetChapter: null, related: "" });
    if (el) el.value = "";
    if (typeof render === "function") render();
    if (typeof showToast === "function") showToast("✦ 已收进灵感箱", "success");
  };

  function renderNovelMaterial(c) {
    var book = nvCurBook();
    if (!book) { c.innerHTML = headBar("素材") + '<div class="empty-state"><div class="empty-text">请先新建小说</div></div>'; return; }
    var list = nvBookMaterials(book.id);
    var html = headBar("素材库", bookSwitcher() + '<button class="btn btn-primary sm" onclick="nvEditMaterial(null)">＋ 素材</button>');
    html += tabBarHtml("material");
    html += '<div class="card"><div class="card-body"><div class="nv-stat-grid">' +
      MAT_KINDS.map(function (k) {
        var n = list.filter(function (x) { return (x.kind || "其他") === k; }).length;
        return dv(n, k);
      }).join("") + "</div></div></div>";
    MAT_KINDS.forEach(function (k) {
      var group = list.filter(function (x) { return (x.kind || "其他") === k; });
      if (!group.length) return;
      html += '<div class="card"><div class="card-body"><div class="nv-block-h">' + esc(k) + "（" + group.length + "）</div>" +
        group.map(function (x) {
          return '<div class="nv-mat-row"><div class="nv-idea-main" onclick="nvEditMaterial(\'' + x.id + '\')">' +
            '<div class="nv-mat-title">' + esc(x.title || "未命名") + "</div>" +
            (x.content ? '<div class="nv-mat-content">' + esc(String(x.content).slice(0, 120)) + "</div>" : "") +
            ((x.tags || []).length ? '<div class="nv-chip-wrap">' + x.tags.map(function (t) { return badge(t, "#0ea5e9"); }).join(" ") + "</div>" : "") +
            "</div>" +
            '<button class="btn btn-ghost sm nv-danger" onclick="nvDel(\'materials\',\'' + x.id + '\')">×</button></div>';
        }).join("") + "</div></div>";
    });
    if (!list.length) html += '<div class="card"><div class="card-body"><div class="nv-dim">还没有素材</div></div></div>';
    c.innerHTML = html;
  }

  // ============================================================
  // 19. 导出（Word / Excel）
  // ============================================================
  root.nvExportOpen = function () {
    var books = nvBooks();
    var cur = nvCurBook();
    var html = '<div class="nv-form"><div class="nv-form-h">导出</div>' +
      '<div class="nv-form-intro">Word 含总纲 / 人物 / 关系 / 时间线 / 伏笔 / 情绪线 / 灵感 / 素材 / 章节幕后卡片 / 正文 / 评审；Excel 含 10 张数据表。</div>' +
      '<div class="nv-f-row"><label class="nv-f-label">小说</label>' +
      '<select class="nv-f-input" id="nv-ex-book">' + books.map(function (b) {
        return '<option value="' + esc(b.id) + '"' + (cur && cur.id === b.id ? " selected" : "") + ">" + esc(b.title) + "</option>";
      }).join("") + "</select></div>" +
      '<div class="nv-f-row"><label class="nv-f-label">格式</label>' +
      '<select class="nv-f-input" id="nv-ex-kind">' +
      '<option value="docx">Word（.docx · 设定集 + 正文）</option>' +
      '<option value="xlsx">Excel（.xlsx · 全量数据表）</option></select></div>' +
      '<div class="nv-f-row"><label class="nv-f-label">范围</label>' +
      '<select class="nv-f-input" id="nv-ex-scope">' +
      '<option value="book">整本（全部章节）</option>' +
      '<option value="chapter">仅当前章（仅 Word 生效）</option></select></div>' +
      '<div class="nv-f-actions nv-form-actions">' +
      '<button class="btn btn-ghost" onclick="closeModal()">取消</button>' +
      '<button class="btn btn-primary" onclick="nvExportFromForm()">⬇️ 下载</button></div></div>';
    if (typeof showModal === "function") showModal(html);
  };
  root.nvExportFromForm = function () {
    var b = document.getElementById("nv-ex-book");
    var k = document.getElementById("nv-ex-kind");
    var s = document.getElementById("nv-ex-scope");
    if (typeof closeModal === "function") closeModal();
    root.nvExportDo(k ? k.value : "docx", s ? s.value : "book", null, b ? b.value : null);
  };
  root.nvExportDo = function (kind, scope, chapterId, bookId) {
    if (typeof root.NvExport === "undefined") {
      if (typeof showToast === "function") showToast("导出模块未加载", "error");
      return;
    }
    var book = bookId ? nvGet(bookId) : nvCurBook();
    if (!book) { if (typeof showToast === "function") showToast("请先选择小说", "warn"); return; }
    if (scope === "chapter" && !chapterId) {
      var t = nvTodayChapter(book.id);
      chapterId = t ? t.id : null;
    }
    var opts = scope === "chapter" && chapterId ? { chapterId: chapterId } : {};
    var ch = chapterId ? nvChapter(chapterId) : null;
    var label = ch ? ("第" + ch.num + "章") : "全书";
    try {
      var bytes, name, mime;
      if (kind === "xlsx") {
        bytes = root.NvExport.xlsxBytes(nvDB(), book.id, opts);
        name = root.NvExport.fileName(book.title, scope === "chapter" ? label + "_数据" : "数据表", "xlsx");
        mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      } else {
        bytes = root.NvExport.docxBytes(nvDB(), book.id, opts);
        name = root.NvExport.fileName(book.title, scope === "chapter" ? label : "全书", "docx");
        mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      }
      if (typeof showToast === "function") showToast("⬇️ 正在生成 " + (kind === "xlsx" ? "Excel" : "Word") + "…", "warn");
      root.NvExport.save(bytes, name, mime);
      if (typeof showToast === "function") showToast("✅ 已导出 " + name, "success");
    } catch (e) {
      if (typeof showToast === "function") showToast("导出失败：" + (e && e.message), "error");
    }
  };

  // ============================================================
  // 20. 表单入口（新建 / 编辑）
  // ============================================================
  var STATUS_OPTS = [
    { v: "planning", t: "构思中" }, { v: "writing", t: "连载中" },
    { v: "done", t: "已完结" }, { v: "paused", t: "暂停" }
  ];
  function chStatusOpts() {
    return Object.keys(CHAPTER_STATUS_META).map(function (k) { return { v: k, t: CHAPTER_STATUS_META[k].label }; });
  }
  root.nvEditBook = function (id) {
    var b = id ? nvGet(id) : null;
    nvOpenForm(id ? "编辑小说设定" : "新建小说", [
      { k: "title", label: "书名", req: true, ph: "例：后来我们都学会了爱" },
      { k: "genre", label: "类型 / 题材", ph: "例：都市 · 破镜重圆" },
      { k: "oneLiner", label: "一句话故事", type: "textarea", rows: 2, ph: "七年后重逢的前任，在过去与现在之间，重新选择彼此。" },
      { k: "themes", label: "主题", type: "tags", ph: "爱、失去、选择、成长（用、分隔）" },
      { k: "style", label: "文风", ph: "例：东方玄幻，半文半白" },
      { k: "pov", label: "叙事视角", type: "select", options: [{ v: "third", t: "第三人称" }, { v: "first", t: "第一人称（我）" }] },
      { k: "targetWords", label: "目标字数", type: "number", ph: "200000" },
      { k: "status", label: "状态", type: "select", options: STATUS_OPTS }
    ], b ? {
      title: b.title, genre: b.genre, oneLiner: b.oneLiner, themes: b.themes, style: b.style,
      pov: b.pov || "third", targetWords: b.targetWords, status: b.status || "writing"
    } : { pov: "third", status: "writing", style: "网文" }, function (v) {
      var obj = EDIT.book(id, v);
      if (!id) root.NV_BOOK = obj.id;
    });
  };
  root.nvEditVolume = function (num) {
    var book = nvCurBook();
    if (!book) return;
    var v = null;
    (book.volumes || []).forEach(function (x) { if (Number(x.num) === Number(num)) v = x; });
    var nextNum = num || ((book.volumes || []).length + 1);
    nvOpenForm(num ? "编辑卷" : "新建卷", [
      { k: "num", label: "卷号", type: "number", req: true },
      { k: "title", label: "卷名", ph: "例：再见，不是重逢" },
      { k: "range", label: "章号范围", ph: "例：01—10" },
      { k: "note", label: "备注", type: "textarea", rows: 2 }
    ], v || { num: nextNum }, function (vals) { EDIT.volume(book.id, num || vals.num, vals); });
  };
  root.nvDelVolume = function (num) {
    var book = nvCurBook();
    if (!book) return;
    nvConfirm("删除第 " + num + " 卷？该卷章节不会被删除（需另行改卷号）。", function () { EDIT.delVolume(book.id, num); });
  };
  root.nvEditWorld = function (bookId) {
    var book = nvGet(bookId) || nvCurBook();
    if (!book) return;
    var w = book.world || {};
    nvOpenForm("世界观设定", [
      { k: "basic", label: "基础设定", type: "textarea", rows: 2 },
      { k: "rules", label: "核心规则", type: "textarea", rows: 2 },
      { k: "history", label: "历史传说", type: "textarea", rows: 2 },
      { k: "places", label: "重要地点", type: "lines", ph: "每行一个" },
      { k: "customs", label: "文化习俗", type: "textarea", rows: 2 },
      { k: "mystery", label: "核心悬念", type: "textarea", rows: 2 }
    ], w, function (v) { EDIT.world(book.id, v); });
  };
  root.nvEditChapter = function (id) {
    var book = nvCurBook();
    var ch = id ? nvChapter(id) : null;
    if (!book && !ch) return;
    var bid = ch ? ch.bookId : book.id;
    var bk = nvGet(bid);
    var maxNum = 0;
    nvBookChapters(bid).forEach(function (x) { if (x.num > maxNum) maxNum = x.num; });
    var card = (ch && ch.card) || { plot: {}, emotion: {} };
    var volOpts = (bk && bk.volumes || []).map(function (v) { return { v: v.num, t: "第 " + v.num + " 卷 " + (v.title || "") }; });
    nvOpenForm(id ? "编辑第 " + ch.num + " 章 · 幕后卡片" : "新建章节", [
      { k: "num", label: "章号", type: "number", req: true },
      { k: "title", label: "标题", req: true },
      { k: "volume", label: "所属卷", type: volOpts.length ? "select" : "number", options: volOpts.length ? volOpts : undefined },
      { k: "status", label: "状态", type: "select", options: chStatusOpts() },
      { k: "card_time", label: "时间", ph: "例：现在 / 23 岁 · 5 月" },
      { k: "card_place", label: "地点", ph: "例：上海" },
      { k: "card_chars", label: "涉及人物", type: "tags", ph: "林晚、顾川（用、分隔）" },
      { k: "card_task", label: "本章任务", type: "textarea", rows: 2, ph: "顾川第一次真正道歉。" },
      { k: "plot_start", label: "剧情 · 开始", type: "textarea", rows: 2 },
      { k: "plot_conflict", label: "剧情 · 冲突", type: "textarea", rows: 2 },
      { k: "plot_climax", label: "剧情 · 高潮", type: "textarea", rows: 2 },
      { k: "plot_end", label: "剧情 · 结尾", type: "textarea", rows: 2 },
      { k: "emo_a", label: "情绪 · 人物 A" }, { k: "emo_aFrom", label: "A 起始情绪" }, { k: "emo_aTo", label: "A 结束情绪" },
      { k: "emo_b", label: "情绪 · 人物 B" }, { k: "emo_bFrom", label: "B 起始情绪" }, { k: "emo_bTo", label: "B 结束情绪" },
      { k: "card_mustAppear", label: "必须出现", type: "lines", ph: "每行一条" },
      { k: "card_mustNot", label: "不能出现", type: "lines", ph: "每行一条" },
      { k: "card_fsRef", label: "伏笔关联" },
      { k: "goal", label: "本章目标（旧字段，兼容）", type: "textarea", rows: 2 },
      { k: "draft", label: "正文", type: "textarea", rows: 8 }
    ], ch ? {
      num: ch.num, title: ch.title, volume: ch.volume || 1, status: ch.status || "draft",
      card_time: card.time, card_place: card.place, card_chars: card.chars,
      card_task: card.task, plot_start: card.plot && card.plot.start, plot_conflict: card.plot && card.plot.conflict,
      plot_climax: card.plot && card.plot.climax, plot_end: card.plot && card.plot.end,
      emo_a: card.emotion && card.emotion.a, emo_aFrom: card.emotion && card.emotion.aFrom, emo_aTo: card.emotion && card.emotion.aTo,
      emo_b: card.emotion && card.emotion.b, emo_bFrom: card.emotion && card.emotion.bFrom, emo_bTo: card.emotion && card.emotion.bTo,
      card_mustAppear: card.mustAppear, card_mustNot: card.mustNot, card_fsRef: card.fsRef,
      goal: ch.goal, draft: ch.draft
    } : { num: maxNum + 1, volume: 1, status: "draft" }, function (v) {
      v.bookId = bid;
      var obj = EDIT.chapter(id, v);
      if (!id) root.NV_VIEW = "chapter:" + obj.id;
    }, "幕后卡片会作为 AI 写这一章的前置约束，建议先填「本章任务 / 剧情四段 / 必须出现」。");
  };
  root.nvDelChapter = function (id) {
    var ch = nvChapter(id);
    if (!ch) return;
    nvConfirm("删除第 " + ch.num + " 章「" + (ch.title || "") + "」？正文与评审将一并删除，不可恢复。", function () {
      EDIT.remove("chapters", id);
      root.NV_VIEW = "list";
    });
  };
  root.nvEditSpec = function (id) {
    var ch = nvChapter(id);
    if (!ch) return;
    var def = ch.spec || {
      before: { characters: [], hooks: [] }, after: { characters: [], advances: [] },
      must_happen: [], tension: [], key_scenes: [], new_hooks: []
    };
    var s = prompt("编辑 spec（JSON）", JSON.stringify(def, null, 2));
    if (s === null) return;
    try {
      ch.spec = JSON.parse(s);
      nvSave();
      if (typeof render === "function") render();
      if (typeof showToast === "function") showToast("✅ spec 已保存", "success");
    } catch (e) {
      if (typeof showToast === "function") showToast("JSON 解析失败：" + e.message, "error");
    }
  };
  root.nvEditChar = function (id) {
    var book = nvCurBook();
    var x = id ? nvChar(id) : null;
    if (!book && !x) return;
    var card = (x && x.card) || {};
    nvOpenForm(id ? "编辑人物 · " + x.name : "新建人物", [
      { k: "name", label: "姓名", req: true },
      { k: "role", label: "角色", ph: "女主 / 男主 / 配角" },
      { k: "age", label: "年龄" },
      { k: "job", label: "职业" },
      { k: "city", label: "城市" },
      { k: "personality", label: "性格关键词", type: "tags", ph: "清醒、独立、敏感、克制" },
      { k: "desire", label: "核心欲望", type: "textarea", rows: 2, ph: "被爱，但不想依赖别人。" },
      { k: "fear", label: "核心恐惧", type: "textarea", rows: 2, ph: "再次被留下。" },
      { k: "flaw", label: "人物缺陷", type: "textarea", rows: 2, ph: "不直接表达自己的需求。" },
      { k: "loveView", label: "爱情观", type: "textarea", rows: 2, ph: "陪伴比承诺重要。" },
      { k: "habits", label: "习惯", type: "lines", ph: "冰美式 / 失眠时整理东西" },
      { k: "card_appearance", label: "外貌", type: "textarea", rows: 2 },
      { k: "card_catchphrase", label: "口头禅" },
      { k: "secrets", label: "秘密", type: "lines", ph: "每行一条" },
      { k: "card_arcStart", label: "成长弧光 · 起点", type: "textarea", rows: 2 },
      { k: "card_arcConflict", label: "成长弧光 · 冲突", type: "textarea", rows: 2 },
      { k: "card_arcTurn", label: "成长弧光 · 转折", type: "textarea", rows: 2 },
      { k: "card_arcEnd", label: "成长弧光 · 终点", type: "textarea", rows: 2 },
      { k: "firstAppearChapter", label: "首次出场章号", type: "number" }
    ], x ? {
      name: x.name, role: x.role, age: x.age, job: x.job, city: x.city,
      personality: x.personality || x.traits, desire: x.desire, fear: x.fear || card.fear,
      flaw: x.flaw, loveView: x.loveView, habits: x.habits, card_appearance: card.appearance,
      card_catchphrase: card.catchphrase, secrets: x.secrets,
      card_arcStart: card.arcStart, card_arcConflict: card.arcConflict, card_arcTurn: card.arcTurn, card_arcEnd: card.arcEnd,
      firstAppearChapter: x.firstAppearChapter
    } : { bookId: book.id }, function (v) {
      v.bookId = (x && x.bookId) || book.id;
      v.secrets = v.secrets || [];
      EDIT.char(id, v);
    });
  };
  root.nvDelChar = function (id) {
    var x = nvChar(id);
    if (!x) return;
    nvConfirm("删除人物「" + x.name + "」？", function () { EDIT.remove("chars", id); root.NV_VIEW = "list"; });
  };
  root.nvEditRelation = function (id, preName) {
    var book = nvCurBook();
    var r = null;
    nvDB().relations.forEach(function (x) { if (x.id === id) r = x; });
    if (!book && !r) return;
    nvOpenForm(id ? "编辑关系" : "新建关系", [
      { k: "a", label: "人物 A", req: true, ph: preName || "林晚" },
      { k: "b", label: "人物 B", req: true, ph: "顾川" },
      { k: "type", label: "关系", ph: "前任 / 重逢 / 合作伙伴" },
      { k: "past", label: "过去", type: "textarea", rows: 2, ph: "相爱" },
      { k: "now", label: "现在", type: "textarea", rows: 2, ph: "重新认识" },
      { k: "conflict", label: "核心矛盾", type: "textarea", rows: 2, ph: "她要的是现在，他习惯给她未来" },
      { k: "state", label: "当前状态", ph: "重新靠近" }
    ], r || { a: preName || "", bookId: book.id }, function (v) {
      v.bookId = (r && r.bookId) || book.id;
      var obj = EDIT.relation(id, v);
      if (!id) root.NV_VIEW = "relation:" + obj.id;
    });
  };
  root.nvEditRelationChange = function (relId) {
    var r = null;
    nvDB().relations.forEach(function (x) { if (x.id === relId) r = x; });
    if (!r) return;
    var maxNum = 0;
    nvBookChapters(r.bookId).forEach(function (x) { if (x.num > maxNum) maxNum = x.num; });
    nvOpenForm("记录关系变化", [
      { k: "ch", label: "章节", type: "number", req: true },
      { k: "note", label: "变化", type: "textarea", rows: 2, ph: "顾川道歉" }
    ], { ch: maxNum }, function (v) { EDIT.relationChange(relId, v); });
  };
  root.nvEditEvent = function (id) {
    var book = nvCurBook();
    var e = null;
    nvDB().events.forEach(function (x) { if (x.id === id) e = x; });
    if (!book && !e) return;
    nvOpenForm(id ? "编辑时间线事件" : "新建时间线事件", [
      { k: "title", label: "事件名称", req: true, ph: "七年前的生日" },
      { k: "time", label: "时间", ph: "23 岁 · 5 月" },
      { k: "chars", label: "涉及人物", type: "tags", ph: "林晚、顾川" },
      { k: "happened", label: "发生", type: "textarea", rows: 3 },
      { k: "feeling", label: "人物感受", ph: "失望 → 绝望" },
      { k: "impact", label: "影响", type: "textarea", rows: 2, ph: "成为分手的重要原因。" },
      { k: "chapters", label: "关联章节", type: "tags", ph: "3、24、67" }
    ], e ? {
      title: e.title, time: e.time, chars: e.chars, happened: e.happened || e.summary,
      feeling: e.feeling, impact: e.impact, chapters: e.chapters
    } : { bookId: book.id, chapters: [] }, function (v) {
      v.bookId = (e && e.bookId) || book.id;
      v.chapters = (v.chapters || []).map(function (x) { return Number(x) || 0; }).filter(Boolean);
      EDIT.event(id, v);
    });
  };
  root.nvEditForeshadow = function (id) {
    var book = nvCurBook();
    var f = nvForeshadow(id);
    if (!book && !f) return;
    var maxNum = 0;
    nvBookChapters(book ? book.id : f.bookId).forEach(function (x) { if (x.num > maxNum) maxNum = x.num; });
    nvOpenForm(id ? "编辑伏笔" : "新建伏笔", [
      { k: "title", label: "伏笔", req: true, ph: "七年前的礼物" },
      { k: "setupChapter", label: "首次出现章号", type: "number", req: true },
      { k: "payoffChapter", label: "计划回收章号", type: "number" },
      { k: "status", label: "状态", type: "select", options: FORESHADOW_STATUS.map(function (s) { return { v: s, t: FORESHADOW_LABEL[s] }; }) },
      { k: "note", label: "备注", type: "textarea", rows: 2 }
    ], f || { setupChapter: maxNum, status: "setup" }, function (v) {
      v.bookId = (f && f.bookId) || book.id;
      EDIT.foreshadow(id, v);
    });
  };
  root.nvEditInspiration = function (id) {
    var book = nvCurBook();
    var it = null;
    nvDB().inspirations.forEach(function (x) { if (x.id === id) it = x; });
    if (!book && !it) return;
    nvOpenForm(id ? "编辑灵感" : "新建灵感", [
      { k: "text", label: "灵感内容", type: "textarea", rows: 3, req: true },
      { k: "type", label: "类型", type: "select", options: IDEA_TYPES },
      { k: "chars", label: "关联人物", type: "tags" },
      { k: "targetChapter", label: "适合章节", type: "number" },
      { k: "related", label: "关联备注", ph: "七年前的礼物" }
    ], it || { type: "其他" }, function (v) {
      v.bookId = (it && it.bookId) || book.id;
      EDIT.inspiration(id, v);
    });
  };
  root.nvEditMaterial = function (id) {
    var book = nvCurBook();
    var m = null;
    nvDB().materials.forEach(function (x) { if (x.id === id) m = x; });
    if (!book && !m) return;
    nvOpenForm(id ? "编辑素材" : "新建素材", [
      { k: "kind", label: "类型", type: "select", options: MAT_KINDS },
      { k: "title", label: "标题", req: true },
      { k: "content", label: "内容", type: "textarea", rows: 4 },
      { k: "url", label: "链接（可选）" },
      { k: "tags", label: "标签", type: "tags" }
    ], m || { kind: "参考资料" }, function (v) {
      v.bookId = (m && m.bookId) || book.id;
      EDIT.material(id, v);
    });
  };
  root.nvEditEmotion = function (id) {
    var book = nvCurBook();
    if (!book) return;
    var e = null;
    nvDB().emotions.forEach(function (x) { if (x.id === id) e = x; });
    nvOpenForm(id ? "编辑情绪线" : "新建情绪线", [
      { k: "a", label: "人物 A", req: true },
      { k: "b", label: "人物 B", req: true }
    ], e || {}, function (v) { v.bookId = (e && e.bookId) || book.id; EDIT.emotion(id, v); });
  };
  root.nvEditEmotionPoint = function (emoId) {
    var e = null;
    nvDB().emotions.forEach(function (x) { if (x.id === emoId) e = x; });
    if (!e) return;
    var maxNum = 0;
    nvBookChapters(e.bookId).forEach(function (x) { if (x.num > maxNum) maxNum = x.num; });
    var stages = ["陌生", "防备", "怀旧", "动摇", "冲突", "重新信任", "选择"];
    nvOpenForm("标记情绪阶段（" + e.a + " × " + e.b + "）", [
      { k: "ch", label: "章节", type: "number", req: true },
      { k: "stage", label: "阶段", type: "select", options: stages },
      { k: "value", label: "强度（0-100）", type: "number" }
    ], { ch: maxNum, stage: "动摇", value: 60 }, function (v) { EDIT.emotionPoint(emoId, v); });
  };
  root.nvDel = function (table, id) {
    var label = { chars: "人物", relations: "关系", events: "时间线事件", foreshadows: "伏笔", inspirations: "灵感", materials: "素材", emotions: "情绪线" }[table] || table;
    nvConfirm("删除该" + label + "？此操作不可恢复。", function () { EDIT.remove(table, id); root.NV_VIEW = "list"; });
  };

  // ============================================================
  // 21. 既有交互（状态 / 检查 / 推进）
  // ============================================================
  root.nvChStatus = function (chId, st) {
    var ch = nvChapter(chId);
    if (!ch || !CHAPTER_STATUS_META[st]) return;
    ch.status = st;
    if (st === "final" || st === "revised") ch.revisedAt = new Date().toISOString();
    nvSave();
    if (typeof render === "function") render();
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
    if (typeof showToast === "function") {
      showToast(chk.pass === chk.total ? "✅ 规范全过 " + chk.pass + "/" + chk.total : "⚠ 规范 " + chk.pass + "/" + chk.total + " · 详见下方",
        chk.pass === chk.total ? "success" : "warn");
    }
    if (typeof render === "function") render();
  };
  root.nvSkillPrompt = function (bookId, chNum) {
    var p = nvBuildPrompt(bookId, chNum);
    if (!p) { if (typeof showToast === "function") showToast("书不存在", "error"); return; }
    nvCopy(p, "📋 生成 Prompt 已复制 · 粘贴到任意 LLM 即可");
  };
  root.nvFsTrans = function (fsId, st) {
    var f = nvForeshadow(fsId);
    if (!f) return;
    var r = nvFsTransition(f, st);
    if (!r.ok) { if (typeof showToast === "function") showToast(r.msg || "状态迁移非法", "error"); return; }
    nvSave();
    if (typeof render === "function") render();
    if (typeof showToast === "function") showToast("🌱 伏笔状态：" + FORESHADOW_LABEL[st], "success");
  };

  // ============================================================
  // 暴露
  // ============================================================
  root.NV_TAB = "home";
  root.NV_VIEW = "list";
  root.NV_STORY_SUB = "outline";
  root.NV_AI_SUB = "assist";
  root.NV_BOOK = null;
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
    REVIEW_ROLES: REVIEW_ROLES,
    // V1 新增
    migrate: nvMigrate,
    books: nvBooks,
    curBook: nvCurBook,
    chapters: nvBookChapters,
    chars: nvBookChars,
    relations: nvBookRelations,
    events: nvBookEvents,
    inspirations: nvBookInspirations,
    materials: nvBookMaterials,
    emotions: nvBookEmotions,
    todayChapter: nvTodayChapter,
    todos: nvTodos,
    doctor: nvDoctor,
    buildContext: nvBuildContext,
    edit: EDIT,
    TABS: TABS,
    IDEA_TYPES: IDEA_TYPES,
    MAT_KINDS: MAT_KINDS,
    export: {
      docx: function (bookId, opts) {
        return (typeof root.NvExport !== "undefined") ? root.NvExport.docxBytes(nvDB(), bookId || (nvCurBook() || {}).id, opts || {}) : null;
      },
      xlsx: function (bookId, opts) {
        return (typeof root.NvExport !== "undefined") ? root.NvExport.xlsxBytes(nvDB(), bookId || (nvCurBook() || {}).id, opts || {}) : null;
      },
      do: root.nvExportDo
    }
  };
})(typeof window !== "undefined" ? window : this);
