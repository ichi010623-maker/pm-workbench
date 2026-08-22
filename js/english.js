/* =============================================================
 * 英语学习模块 v5.8.18 —— 独立文件（迁移自 app.js 旧英语块）
 * 功能：每日打卡面板 / 学习进度统计 / 单词(每日5新词+艾宾浩斯) /
 *       自测(英译中·中译英·拼写) / 每日阅读 / 人力知识库
 * 依赖全局：DB, render, navigate, showToast, showModal, escapeHtml,
 *           today, addDays, formatDate, LiveData
 * ============================================================= */

/* ---------- 常量数据 ---------- */
var EB_INTERVALS = [1, 2, 4, 7, 15, 30];

var ENG_QUOTES = [
  { en: "The secret of getting ahead is getting started.", cn: "领先的秘诀，在于先迈出第一步。" },
  { en: "Well done is better than well said.", cn: "做得好，胜过说得好。" },
  { en: "Practice makes perfect.", cn: "熟能生巧。" },
  { en: "A journey of a thousand miles begins with a single step.", cn: "千里之行，始于足下。" },
  { en: "Stay hungry, stay foolish.", cn: "求知若饥，虚心若愚。" },
  { en: "Success is the sum of small efforts repeated day in and day out.", cn: "成功是日复一日微小努力的累积。" },
  { en: "Don't watch the clock; do what it does. Keep going.", cn: "别盯着时钟，像它一样不停前行。" },
  { en: "The expert in anything was once a beginner.", cn: "任何领域的专家，都曾是个初学者。" },
  { en: "Better late than never.", cn: "迟做总比不做好。" },
  { en: "Where there is a will, there is a way.", cn: "有志者，事竟成。" },
  { en: "Learning never exhausts the mind.", cn: "学习永远不会使心灵枯竭。" },
  { en: "Little by little, one travels far.", cn: "一点一滴，方能行远。" },
  { en: "Mistakes are proof that you are trying.", cn: "会犯错，证明你正在努力。" },
  { en: "Knowledge is power.", cn: "知识就是力量。" },
  { en: "Hard work beats talent when talent doesn't work hard.", cn: "天赋不努力，终会被努力打败。" },
  { en: "Every day is a new beginning.", cn: "每一天，都是新的开始。" }
];

// 人力管理知识库（内置内容，不依赖存储）
var ENG_HR_KB = [
  { tag: "招聘", title: "面试的 STAR 法则", summary: "用情境-任务-行动-结果结构，问出真实能力而非背稿。",
    body: "STAR = Situation（情境）+ Task（任务）+ Action（行动）+ Result（结果）。面试时让候选人用具体项目作答：当时面临什么情境、需要完成什么任务、他本人采取了哪些行动、最终量化结果如何。避免「你觉得」「你认为」类假设题，多问「你做过」。复盘时关注行动是否由候选人主导，以及结果是否可验证。" },
  { tag: "目标管理", title: "用 OKR 替代 KPI 做目标管理", summary: "目标对齐 + 关键结果量化，季度复盘而非考核。",
    body: "OKR（Objectives & Key Results）由「鼓舞人心的目标」+「3-5 个可量化关键结果」组成。与 KPI 最大区别：OKR 不直接挂钩薪酬，鼓励挑战性（完成 60-70% 即优秀），强调上下对齐与横向协同。落地要点：公司→团队→个人三级对齐；季度设定、双周检视、季末复盘；公开透明便于相互看见。" },
  { tag: "绩效", title: "绩效反馈的 SBI 模型", summary: "情境-行为-影响，让反馈客观可接收。",
    body: "SBI = Situation（情境）+ Behavior（行为）+ Impact（影响）。例：「上周五的需求评审会（S）上，你打断了三次同事发言（B），让大家不敢继续补充，评审质量下降（I）」。先讲事实再讲感受，避免贴标签（「你太强势」）。即时、具体、对事不对人，是高质量反馈的底线。" },
  { tag: "薪酬", title: "薪酬设计的 3P 模型", summary: "Position（岗位）+ Person（能力）+ Performance（绩效）。",
    body: "3P 模型：以岗位价值定薪级（Position），以个人能力定薪档（Person），以绩效结果定浮动（Performance）。实操上先建职级体系与薪酬带宽，再用能力认证确定档位，最后用绩效奖金拉开差距。宽带薪酬能减少晋升独木桥，让专业线也有涨薪空间。" },
  { tag: "培训", title: "新员工 90 天融入计划", summary: "首月赋能、次月实战、三月定责。",
    body: "30-60-90 融入：第 1 月完成文化/系统/团队 onboarding 与导师配对；第 2 月给低风险任务练手并收集反馈；第 3 月独立负责小模块并做融入复盘。关键节点设 Check-in（第 1/2/3 月末），及时纠偏比年终评价有用得多。" },
  { tag: "员工关系", title: "离职面谈该问的 5 个问题", summary: "问原因、问留任、问改进、问推荐、问祝福。",
    body: "①真正离开的原因是什么？②如果有一件事能让你留下，会是什么？③公司最该改进的地方？④是否愿意推荐朋友加入？⑤未来打算？注意由中立第三方或 HR 谈，营造安全感，聚焦组织层面可改项，而非挽留谈判。离职数据长期沉淀是组织健康度的前兆指标。" },
  { tag: "劳动法", title: "劳动合同法中的试用期规定", summary: "期限、次数、工资下限与解除边界。",
    body: "合同期 <3 月不得约定试用期；3月-1年试用期≤1月；1-3年≤2月；≥3年及无固定期≤6月。同一单位与同一劳动者只能约定一次试用期。试用期工资≥约定工资 80% 且≥当地最低工资。试用期解除须证明不符录用条件，否则属违法解除需赔偿。" },
  { tag: "组织文化", title: "如何识别与保留高潜人才", summary: "看潜力九宫格，给挑战性任务与曝光。",
    body: "高潜（HiPo）看三要素：认知能力、人际敏捷、动机驱动。用绩效×潜力九宫格定位，对高潜给予跨越式任务、高管导师、跨部门轮岗与战略会议曝光。保留关键在「成长感」与「被看见」，而非只加薪。建立继任梯队，降低关键岗流失风险。" },
  { tag: "员工关系", title: "一对一沟通（1:1）的正确打开方式", summary: "员工主导议程，经理倾听赋能。",
    body: "1:1 不是汇报会，而是员工的主场。经理提前把议程交给员工，自己以倾听和提问为主（「最近什么卡住你？」「我能帮你清除什么障碍？」）。固定节奏（每两周 30 分钟），不谈日常进度谈人、聊成长、解情绪。信任来自稳定可预期的陪伴。" },
  { tag: "薪酬", title: "薪酬带宽与职级体系搭建", summary: "定中位值、带宽、级差，控内部公平。",
    body: "先按市场分位定各职级中位值，再设带宽（如 ±25%）容纳同岗差异。级差（相邻职级中位值差）通常 20-40%。用薪酬渗透率（个人薪资在带宽中的位置）识别偏低/偏高。定期做内部公平性审计与 market 对标，避免同岗悬殊与核心岗偏离市场。" },
  { tag: "组织文化", title: "远程团队的信任管理", summary: "目标透明 + 异步沟通 + 结果导向。",
    body: "远程不等于失控。用公开目标与周报替代「看得到人在」；约定异步响应 SLA 与深度工作时段；会议重决策轻汇报。信任建立在「承诺-交付」闭环上：少 micromanagement，多看产出与复盘。定期线下聚会修复弱连接。" },
  { tag: "绩效", title: "绩效校准会（Calibration）怎么开", summary: "跨团队拉齐标准，消除宽严不一。",
    body: "校准会在评分后、结果定稿前，由管理者带着证据（不只数字）横向比对同级别员工，消除部门宽严差。规则：用统一行为锚定；由校准委员会挑战极端评分；记录决策依据。目标是「同贡献同评价」，提升公平感与薪酬 external 竞争力。" }
];

// 单词词性表（补全旧词库缺的 pos 字段）
var ENG_WORD_POS = {
  abandon: "v.", abstract: "adj./n.", accommodate: "v.", accumulate: "v.", adequate: "adj.",
  allocate: "v.", alternative: "n./adj.", analyze: "v.", anticipate: "v.", assess: "v.",
  beneficial: "adj.", commodity: "n.", compensate: "v.", component: "n.", consequence: "n.",
  constraint: "n.", consumption: "n.", coordinate: "v.", criterion: "n.", derive: "v.",
  diminish: "v.", distinction: "n.", diverse: "adj.", evaluate: "v.", fluctuate: "v.",
  implement: "v.", incentive: "n.", integrate: "v.", negotiate: "v.", specification: "n.",
  prototype: "n.", tooling: "n.", "injection molding": "n.", "tensile strength": "n.",
  "thermal conductivity": "n.", dissipation: "n.", torque: "n.", calibration: "n.",
  "form factor": "n.", chassis: "n.", tolerance: "n.", connector: "n.", BOM: "n.",
  OEM: "n.", supplier: "n.", sourcing: "n.", logistics: "n.", fulfillment: "n.",
  warehousing: "n.", tariff: "n.", compliance: "n.", certification: "n.", "lead time": "n.",
  MOQ: "n.", SKU: "n.", PCB: "n.", firmware: "n.", "lithium battery": "n.",
  iteration: "n.", benchmark: "n./v."
};

/* ---------- 模块级状态 ---------- */
var _reviewQueue = null, _reviewIdx = 0, _reviewTotal = 0, _reviewKnown = 0;
var _test = null;            // 自测状态
var _kbOpen = {};            // 知识库展开态
var engTimerInterval = null;
var _currentUtterance = null;

/* ---------- 工具 ---------- */
function engGet() { return DB.data.growth.english; }

function engEnsure() {
  var e = engGet();
  if (!e) { e = DB.data.growth.english = {}; }
  if (!e.currentTab) e.currentTab = "words";
  if (!e.dailyWords) e.dailyWords = {};
  if (!e.dailyReading) e.dailyReading = {};
  if (!e.studyLog) e.studyLog = {};
  if (!e.markedVocab) e.markedVocab = {};
  if (!e.newWords) e.newWords = [];
  if (!e.masteredWords) e.masteredWords = [];
  if (!e.deck) e.deck = [];
  if (e.streak == null) e.streak = 0;
  if (!e.wrongList) e.wrongList = {};
  if (e.statReviewed == null) e.statReviewed = 0;
  if (e.statLearned == null) e.statLearned = 0;
  if (e.reviewDoneToday == null) e.reviewDoneToday = 0;
  if (e.reviewDate !== today()) { e.reviewDoneToday = 0; e.reviewDate = today(); }
  if (e.checkinQuoteIndex == null) e.checkinQuoteIndex = Math.floor(Math.random() * ENG_QUOTES.length);
  // 保证每日励志句当天稳定
  if (e.quoteDay !== today()) { e.quoteDay = today(); e.checkinQuoteIndex = Math.floor(Math.random() * ENG_QUOTES.length); }
  return e;
}

function engSpeak(word) {
  if (!window.speechSynthesis) { showToast("当前环境不支持语音", "error"); return; }
  window.speechSynthesis.cancel();
  var u = new SpeechSynthesisUtterance(String(word || "").replace(/\//g, " "));
  u.lang = "en-US"; u.rate = 0.85;
  window.speechSynthesis.speak(u);
}

function engShuffle(a) {
  a = a.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

function engBankWords() {
  var e = engGet();
  var banks = (e.vocabBank || []).concat(e.techVocabBank || []);
  return banks.map(function (w) {
    return { en: w.en, cn: w.cn, phonetic: w.phonetic || "", example: w.example || "", pos: ENG_WORD_POS[w.en] || "" };
  });
}

function engFindEntry(en) {
  if (!en) return null;
  var t = String(en).toLowerCase();
  var list = engBankWords();
  for (var i = 0; i < list.length; i++) if (list[i].en && list[i].en.toLowerCase() === t) return list[i];
  return null;
}

function engVocabDue() {
  var e = engGet();
  return (e.deck || []).filter(function (c) { return c.next <= today(); }).length;
}

// 生成今日 5 个新词并自动入复习 deck
function engGenDaily() {
  var e = engGet();
  if (e.dailyWords[today()]) return;
  var all = engBankWords();
  var pool = all.filter(function (w) { return (e.masteredWords || []).indexOf(w.en) === -1; });
  pool = engShuffle(pool);
  var pick = pool.slice(0, 5);
  if (pick.length < 5) {
    var extra = engShuffle(all.filter(function (w) { return pick.indexOf(w) === -1; }));
    pick = pick.concat(extra.slice(0, 5 - pick.length));
  }
  e.dailyWords[today()] = pick;
  pick.forEach(function (w) { engEnroll(w.en); });
  e.statLearned = (e.statLearned || 0) + pick.length;
  DB.save();
}

function engEnroll(en) {
  var e = engGet();
  if (!e.deck) e.deck = [];
  if (!e.newWords) e.newWords = [];
  if (e.newWords.indexOf(en) === -1) e.newWords.push(en);
  var has = false;
  for (var i = 0; i < e.deck.length; i++) if (e.deck[i].en === en) { has = true; break; }
  if (!has) {
    var ent = engFindEntry(en);
    e.deck.push({ en: en, cn: ent ? ent.cn : "", phonetic: ent ? ent.phonetic : "", pos: ent ? ent.pos : "", example: ent ? ent.example : "", box: 0, next: today(), last: null, reps: 0, lapses: 0 });
  }
  DB.save();
}

function engGraduate(en) {
  var e = engGet();
  if (!e.masteredWords) e.masteredWords = [];
  if (e.masteredWords.indexOf(en) === -1) e.masteredWords.push(en);
  if (!e.newWords) e.newWords = [];
  var ni = e.newWords.indexOf(en); if (ni !== -1) e.newWords.splice(ni, 1);
  if (!e.deck) e.deck = [];
  for (var i = e.deck.length - 1; i >= 0; i--) if (e.deck[i].en === en) e.deck.splice(i, 1);
  DB.save();
}

/* =============================================================
 * 主渲染
 * ============================================================= */
function renderEnglish() {
  var c = document.getElementById("app-content");
  if (!c) return;
  var e = engEnsure();
  engGenDaily();

  // 生成每日阅读（7 天轮转）
  if (!e.dailyReading[today()]) {
    var arts = e.readingArticles || [];
    if (arts.length) e.dailyReading[today()] = arts[new Date().getDay() % arts.length];
    DB.save();
  }

  var tabs = [
    { k: "words", t: "📖 单词" },
    { k: "review", t: "🎯 复习" },
    { k: "test", t: "🧪 自测" },
    { k: "reading", t: "📰 阅读" },
    { k: "kb", t: "📚 知识库" }
  ];
  var tabBar = '<div class="enm-tabs">' + tabs.map(function (x) {
    return '<div class="enm-tab' + (e.currentTab === x.k ? ' active' : '') + '" onclick="engSwitchTab(\'' + x.k + '\')">' + x.t + '</div>';
  }).join("") + '</div>';

  c.innerHTML = engHero(e) + engStats(e) + tabBar + engBody(e);
}

/* ---------- 打卡面板 ---------- */
function engHero(e) {
  var done = e.studyLog[today()] && e.studyLog[today()].completed;
  var q = ENG_QUOTES[e.checkinQuoteIndex % ENG_QUOTES.length];
  return '<div class="enm-hero">' +
    '<div class="enm-hero-row">' +
      '<div class="enm-streak"><div class="enm-streak-num">' + e.streak + '</div><div class="enm-streak-label">🔥 连续打卡(天)</div></div>' +
      (done
        ? '<button class="enm-checkin done">✅ 今日已打卡</button>'
        : '<button class="enm-checkin" onclick="engCheckin()">📅 立即打卡</button>') +
    '</div>' +
    '<div class="enm-quote">' +
      '<div class="enm-quote-en">“' + escapeHtml(q.en) + '”</div>' +
      '<div class="enm-quote-cn">' + escapeHtml(q.cn) + '</div>' +
      '<button class="enm-quote-swap" onclick="engChangeQuote()">🔄 换一句</button>' +
    '</div>' +
    '</div>';
}

/* ---------- 学习进度统计 ---------- */
function engStats(e) {
  var newCount = (e.deck ? e.deck.length : 0) + (e.masteredWords ? e.masteredWords.length : 0);
  var due = engVocabDue();
  var completion = due > 0 ? Math.min(100, Math.round((e.reviewDoneToday || 0) / due * 100)) : 100;
  return '<div class="enm-stats">' +
    '<div class="enm-stat"><div class="enm-stat-val">' + newCount + '</div><div class="enm-stat-label">新学词数</div></div>' +
    '<div class="enm-stat"><div class="enm-stat-val">' + (e.statReviewed || 0) + '</div><div class="enm-stat-label">复习次数</div></div>' +
    '<div class="enm-stat"><div class="enm-stat-val">' + completion + '%</div><div class="enm-stat-label">今日完成率</div></div>' +
    '</div>';
}

function engBody(e) {
  switch (e.currentTab) {
    case "review": return engBodyReview(e);
    case "test": return engBodyTest(e);
    case "reading": return engBodyReading(e);
    case "kb": return engBodyKb(e);
    default: return engBodyWords(e);
  }
}

/* ---------- 单词：今日 5 新词 + 生词本 ---------- */
function engBodyWords(e) {
  var words = e.dailyWords[today()] || [];
  var html = '<div class="enm-section-title">📖 今日新词 · ' + words.length + ' 个</div>';
  if (words.length === 0) {
    html += '<div class="empty-state"><div class="empty-icon">📚</div><div class="empty-text">暂无新词</div></div>';
  } else {
    html += '<div class="enm-word-list">' + words.map(function (w, i) {
      var isM = (e.masteredWords || []).indexOf(w.en) !== -1;
      var isNew = (e.newWords || []).indexOf(w.en) !== -1;
      return '<div class="enm-word' + (isM ? ' ew-mastered' : '') + '">' +
        '<div class="enm-word-head">' +
          '<span class="enm-word-num">' + (i + 1) + '</span>' +
          '<span class="enm-word-en" onclick="engSpeak(\'' + escapeJs(w.en) + '\')">' + escapeHtml(w.en) + ' <span class="enm-spk">🔊</span></span>' +
          (w.pos ? '<span class="enm-word-pos">' + escapeHtml(w.pos) + '</span>' : '') +
        '</div>' +
        (w.phonetic ? '<div class="enm-word-phon">' + escapeHtml(w.phonetic) + '</div>' : '') +
        '<div class="enm-word-cn">' + escapeHtml(w.cn) + '</div>' +
        (w.example ? '<div class="enm-word-ex"><span class="enm-ex-text">' + escapeHtml(w.example) + '</span><button class="enm-spk-btn" onclick="engSpeak(\'' + escapeJs(w.example) + '\')">🔊</button></div>' : '') +
        '<div class="enm-word-actions">' +
          '<button class="enm-word-btn' + (isNew ? ' on' : '') + '" onclick="engToggleNew(\'' + escapeJs(w.en) + '\')">' + (isNew ? '✓ 已加入生词本' : '+ 生词本') + '</button>' +
          '<button class="enm-word-btn' + (isM ? ' on master' : '') + '" onclick="engToggleMaster(\'' + escapeJs(w.en) + '\')">' + (isM ? '✓ 已记住' : '标记记住') + '</button>' +
        '</div>' +
      '</div>';
    }).join("") + '</div>';
  }
  // 生词本速览
  var book = e.deck || [];
  html += '<div class="enm-section-title">🗂 我的生词本 · ' + book.length + ' 词</div>';
  if (book.length === 0) {
    html += '<div class="enm-hint">还没有生词，去阅读里点词标注，或上方新词点「+ 生词本」。</div>';
  } else {
    html += '<div class="enm-book">' + book.slice(0, 30).map(function (c) {
      var due = c.next <= today();
      return '<div class="enm-book-item' + (due ? ' due' : '') + '" onclick="engSpeak(\'' + escapeJs(c.en) + '\')">' +
        '<span class="enm-book-en">' + escapeHtml(c.en) + '</span>' +
        '<span class="enm-book-cn">' + escapeHtml(c.cn || "") + '</span>' +
        (due ? '<span class="enm-book-due">待复习</span>' : '') +
        '</div>';
    }).join("") + '</div>';
  }
  html += '<div style="text-align:center;margin-top:14px"><button class="enm-ghost-btn" onclick="engShowHistory()">📅 查看往期单词</button></div>';
  return html;
}

/* ---------- 复习：艾宾浩斯 ---------- */
function engBodyReview(e) {
  if (_reviewQueue && _reviewIdx < _reviewQueue.length) {
    var rc = _reviewQueue[_reviewIdx];
    return '<div class="enm-review-card">' +
      '<div class="enm-review-progress">复习进度 ' + (_reviewIdx + 1) + ' / ' + _reviewQueue.length + '</div>' +
      '<div class="enm-review-en" onclick="engSpeak(\'' + escapeJs(rc.en) + '\')">' + escapeHtml(rc.en) + ' <span class="enm-spk">🔊</span></div>' +
      (rc.phonetic ? '<div class="enm-review-phon">' + escapeHtml(rc.phonetic) + '</div>' : '') +
      '<div class="enm-review-cn" id="enm-review-cn" style="display:none">' +
        (rc.cn ? '<div class="enm-review-cn-text">' + escapeHtml(rc.cn) + '</div>' : '<div class="enm-review-cn-text muted">（暂无释义）</div>') +
        (rc.example ? '<div class="enm-review-ex">' + escapeHtml(rc.example) + '</div>' : '') +
      '</div>' +
      '<div class="enm-review-actions">' +
        '<button class="enm-review-btn reveal" id="enm-review-reveal" onclick="engReviewShow()">👁 显示答案</button>' +
        '<div id="enm-review-judge" style="display:none">' +
          '<button class="enm-review-btn know" onclick="engReviewAnswer(true)">✅ 认识</button>' +
          '<button class="enm-review-btn dont" onclick="engReviewAnswer(false)">❌ 不认识</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }
  var due = (e.deck || []).filter(function (c) { return c.next <= today(); });
  var bookCount = (e.newWords || []).length;
  var allCount = (e.deck || []).length;
  var h = '<div class="enm-review-home">' +
    '<div class="enm-review-summary">生词本 <b>' + bookCount + '</b> 词 · 复习卡 <b>' + allCount + '</b> 张</div>' +
    '<div class="enm-review-due">🔔 今日待复习 <b style="color:var(--accent-red)">' + due.length + '</b> 个</div>';
  if (due.length > 0) h += '<button class="enm-primary-btn" onclick="engStartReview(false)">🎯 开始复习（' + due.length + '）</button>';
  else h += '<div class="enm-review-empty">今天没有待复习单词，去「单词」加点生词吧 📚</div>';
  if (allCount > 0) h += '<button class="enm-ghost-btn" style="margin-top:10px" onclick="engStartReview(true)">📚 复习全部（' + allCount + '）</button>';
  h += '</div>';
  return h;
}

function engStartReview(all) {
  var e = engGet();
  if (!e.deck) e.deck = [];
  var pool = all ? e.deck.slice() : e.deck.filter(function (c) { return c.next <= today(); });
  if (pool.length === 0) { showToast("暂无可复习的单词", "error"); return; }
  _reviewQueue = pool; _reviewIdx = 0; _reviewTotal = pool.length; _reviewKnown = 0;
  render();
}

function engReviewShow() {
  var cn = document.getElementById("enm-review-cn");
  var rv = document.getElementById("enm-review-reveal");
  var jd = document.getElementById("enm-review-judge");
  if (cn) cn.style.display = "";
  if (rv) rv.style.display = "none";
  if (jd) jd.style.display = "";
}

function engReviewAnswer(know) {
  var e = engGet();
  if (!e.deck) e.deck = [];
  var card = _reviewQueue[_reviewIdx];
  e.statReviewed = (e.statReviewed || 0) + 1;
  if (!card) { _reviewIdx++; return engAfterReview(); }
  var di = -1;
  for (var i = 0; i < e.deck.length; i++) if (e.deck[i].en === card.en) { di = i; break; }
  if (di === -1) { e.deck.push(card); di = e.deck.length - 1; }
  var d = e.deck[di];
  d.reps = (d.reps || 0) + 1; d.last = today();
  if (know) {
    _reviewKnown++; e.reviewDoneToday = (e.reviewDoneToday || 0) + 1;
    if (d.box == null) d.box = 0;
    if (d.box < EB_INTERVALS.length - 1) { d.box++; d.next = addDays(today(), EB_INTERVALS[d.box]); }
    else { engGraduate(d.en); _reviewQueue.splice(_reviewIdx, 1); DB.save(); return engAfterReview(); }
  } else {
    d.box = 0; d.lapses = (d.lapses || 0) + 1; d.next = today(); _reviewQueue.push(d);
  }
  DB.save(); _reviewIdx++; engAfterReview();
}

function engAfterReview() {
  if (_reviewIdx >= _reviewQueue.length) {
    var total = _reviewTotal, known = _reviewKnown;
    _reviewQueue = null; _reviewIdx = 0;
    DB.save(); render();
    showToast("🎉 本轮复习完成！共 " + total + " 词，认识 " + known + " 个", "success");
    return;
  }
  render();
}

/* ---------- 自测：英译中 / 中译英 / 拼写 ---------- */
function engBodyTest(e) {
  if (_test) {
    if (_test.idx >= _test.queue.length) return engTestResult();
    return engTestQuestion();
  }
  // 模式选择 + 开始
  var modes = [
    { k: "ec", t: "① 英译中", d: "看英文，选中文释义" },
    { k: "ce", t: "② 中译英", d: "看中文，选英文拼写" },
    { k: "sp", t: "③ 拼写默写", d: "看中文，默写出英文" }
  ];
  var sel = e.testMode || "ec";
  var poolSize = (e.dailyWords[today()] || []).length + engVocabDue();
  var html = '<div class="enm-section-title">🧪 单词自测</div>' +
    '<div class="enm-hint">随机抽取「今日新词 + 待复习词」依次出题，答错自动加入次日复习清单。</div>' +
    '<div class="enm-mode-list">' + modes.map(function (m) {
      return '<div class="enm-mode' + (sel === m.k ? ' active' : '') + '" onclick="engSetTestMode(\'' + m.k + '\')">' +
        '<div class="enm-mode-t">' + m.t + '</div><div class="enm-mode-d">' + m.d + '</div></div>';
    }).join("") + '</div>' +
    '<button class="enm-primary-btn" onclick="engTestStart()">▶ 开始测试' + (poolSize > 0 ? '（共 ' + Math.min(15, Math.max(5, poolSize)) + ' 题）' : '') + '</button>';
  if (poolSize === 0) html += '<div class="enm-hint" style="color:var(--accent-red)">当前没有可测词，先去「单词」学今日新词或「复习」积累。</div>';
  return html;
}

function engSetTestMode(k) { var e = engGet(); e.testMode = k; DB.save(); render(); }

function engTestStart() {
  var e = engGet();
  var pool = [];
  (e.dailyWords[today()] || []).forEach(function (w) { pool.push(w); });
  (e.deck || []).filter(function (c) { return c.next <= today(); }).forEach(function (c) {
    pool.push({ en: c.en, cn: c.cn, phonetic: c.phonetic, pos: c.pos, example: c.example });
  });
  pool = engShuffle(pool);
  var n = Math.min(15, Math.max(5, pool.length));
  _test = { mode: e.testMode || "ec", queue: pool.slice(0, n), idx: 0, correct: 0, wrong: [], answered: false };
  render();
}

function engTestQuestion() {
  var q = _test.queue[_test.idx];
  var total = _test.queue.length;
  var pct = Math.round(_test.idx / total * 100);
  var head = '<div class="enm-test-progress"><div class="enm-test-bar" style="width:' + pct + '%"></div></div>' +
    '<div class="enm-test-step">第 ' + (_test.idx + 1) + ' / ' + total + ' 题</div>';

  if (_test.mode === "sp") {
    // 拼写默写
    return head + '<div class="enm-test-card">' +
      '<div class="enm-test-cn">' + escapeHtml(q.cn) + (q.pos ? ' <span class="enm-word-pos">' + escapeHtml(q.pos) + '</span>' : '') + '</div>' +
      (q.phonetic ? '<div class="enm-test-phon">音标：' + escapeHtml(q.phonetic) + '</div>' : '') +
      (q.example ? '<div class="enm-test-ex">例句：' + escapeHtml(q.example) + '</div>' : '') +
      '<input class="enm-input" id="enm-spell" placeholder="输入英文拼写…" onkeydown="if(event.key===\'Enter\')engTestSubmitSp()">' +
      '<button class="enm-primary-btn" onclick="engTestSubmitSp()">提交</button>' +
      '</div>';
  }

  // 选择题：ec 英译中 / ce 中译英
  var correct, options;
  if (_test.mode === "ec") {
    correct = q.cn;
    options = engShuffle([q.cn].concat(engDistractors(q.en, "cn", 3)));
  } else {
    correct = q.en;
    options = engShuffle([q.en].concat(engDistractors(q.en, "en", 3)));
  }
  _test._correct = correct; _test._options = options;
  var qText = _test.mode === "ec"
    ? '<div class="enm-test-en" onclick="engSpeak(\'' + escapeJs(q.en) + '\')">' + escapeHtml(q.en) + ' <span class="enm-spk">🔊</span></div>' + (q.phonetic ? '<div class="enm-test-phon">' + escapeHtml(q.phonetic) + '</div>' : '')
    : '<div class="enm-test-cn">' + escapeHtml(q.cn) + (q.pos ? ' <span class="enm-word-pos">' + escapeHtml(q.pos) + '</span>' : '') + '</div>';
  return head + '<div class="enm-test-card">' + qText +
    '<div class="enm-test-options">' + options.map(function (o) {
      return '<button class="enm-opt" onclick="engTestAnswer(\'' + escapeJs(o) + '\')">' + escapeHtml(o) + '</button>';
    }).join("") + '</div></div>';
}

function engDistractors(en, field, k) {
  var all = engBankWords().filter(function (w) { return w.en.toLowerCase() !== String(en).toLowerCase(); });
  all = engShuffle(all);
  var out = [];
  for (var i = 0; i < all.length && out.length < k; i++) {
    var v = field === "cn" ? all[i].cn : all[i].en;
    if (v && out.indexOf(v) === -1) out.push(v);
  }
  return out;
}

function engTestAnswer(val) {
  if (_test.answered) return;
  _test.answered = true;
  var q = _test.queue[_test.idx];
  var ok = String(val).trim().toLowerCase() === String(_test._correct).trim().toLowerCase();
  engRecordTest(q, ok);
  // 高亮
  var opts = document.querySelectorAll(".enm-opt");
  opts.forEach(function (b) {
    var bv = b.getAttribute("onclick").replace(/engTestAnswer\('/, "").replace(/'\)/, "");
    if (bv === _test._correct) b.classList.add("correct");
    else if (bv === val) b.classList.add("wrong");
    b.setAttribute("disabled", "disabled");
  });
  setTimeout(function () { _test.answered = false; _test.idx++; render(); }, 650);
}

function engTestSubmitSp() {
  if (_test.answered) return;
  var inp = document.getElementById("enm-spell");
  var val = inp ? inp.value : "";
  _test.answered = true;
  var q = _test.queue[_test.idx];
  var ok = normalize(val) === normalize(q.en);
  engRecordTest(q, ok);
  if (!ok && inp) { inp.value = q.en; inp.classList.add("reveal-correct"); }
  setTimeout(function () { _test.answered = false; _test.idx++; render(); }, 750);
}

function normalize(s) { return String(s || "").toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim(); }

function engRecordTest(q, ok) {
  var e = engGet();
  e.statReviewed = (e.statReviewed || 0) + 1;
  if (ok) _test.correct++;
  else {
    _test.wrong.push(q);
    // 加入次日复习清单
    var tom = addDays(today(), 1);
    if (!e.wrongList) e.wrongList = {};
    if (!e.wrongList[tom]) e.wrongList[tom] = [];
    if (e.wrongList[tom].indexOf(q.en) === -1) e.wrongList[tom].push(q.en);
    engEnroll(q.en);
    // 若已在 deck，把 next 设为次日
    for (var i = 0; i < e.deck.length; i++) if (e.deck[i].en === q.en) { e.deck[i].box = 0; e.deck[i].next = tom; }
    e.reviewDoneToday = (e.reviewDoneToday || 0) + 1;
  }
  DB.save();
}

function engTestResult() {
  var total = _test.queue.length;
  var rate = total > 0 ? Math.round(_test.correct / total * 100) : 0;
  var color = rate >= 80 ? "var(--accent-green)" : rate >= 60 ? "var(--accent-orange)" : "var(--accent-red)";
  var wrongHtml = _test.wrong.length === 0
    ? '<div class="enm-hint">🎉 全部正确，没有错题！</div>'
    : '<div class="enm-section-title">❌ 错题已加入次日复习（' + _test.wrong.length + '）</div>' +
      '<div class="enm-book">' + _test.wrong.map(function (q) {
        return '<div class="enm-book-item due" onclick="engSpeak(\'' + escapeJs(q.en) + '\')">' +
          '<span class="enm-book-en">' + escapeHtml(q.en) + '</span>' +
          '<span class="enm-book-cn">' + escapeHtml(q.cn || "") + '</span></div>';
      }).join("") + '</div>';
  var h = '<div class="enm-test-summary">' +
    '<div class="enm-test-rate" style="color:' + color + '">' + rate + '%</div>' +
    '<div class="enm-test-rate-sub">正确 ' + _test.correct + ' / ' + total + ' 题</div>' +
    '</div>' + wrongHtml +
    '<div style="display:flex;gap:10px;margin-top:14px">' +
      '<button class="enm-primary-btn" style="flex:1" onclick="engTestRestart()">🔁 再来一次</button>' +
      '<button class="enm-ghost-btn" style="flex:1" onclick="engTestExit()">返回</button>' +
    '</div>';
  _test = null;
  return h;
}

function engTestRestart() { _test = null; engTestStart(); }
function engTestExit() { _test = null; render(); }

/* ---------- 每日阅读 ---------- */
function engBodyReading(e) {
  var art = e.dailyReading[today()];
  if (!art) return '<div class="empty-state"><div class="empty-icon">📰</div><div class="empty-text">今日阅读文章暂未生成</div></div>';
  var marked = e.markedVocab[today()] || [];
  var wordsHtml = art.en.split(/(\s+)/).map(function (tk) {
    if (/^\s+$/.test(tk)) return tk;
    if (/^[.,!?;:""''()]+$/.test(tk)) return tk;
    var clean = tk.replace(/[.,!?;:""''()]$/, "");
    var isM = marked.indexOf(clean.toLowerCase()) !== -1;
    return '<span class="enm-art-word' + (isM ? ' marked' : '') + '" onclick="engMarkWord(\'' + escapeJs(clean) + '\')">' + escapeHtml(tk) + '</span>';
  }).join("");
  var h = '<div class="enm-read-card">' +
    '<div class="enm-read-title">' + escapeHtml(art.title) + '</div>' +
    '<div class="enm-read-actions">' +
      '<button class="enm-read-btn" id="enm-play" onclick="engPlayArticle()">▶ 播放</button>' +
      '<button class="enm-read-btn" id="enm-pause" onclick="engPauseArticle()" style="display:none">⏸ 暂停</button>' +
      '<button class="enm-read-btn" id="enm-resume" onclick="engResumeArticle()" style="display:none">▶ 继续</button>' +
      '<button class="enm-read-btn" onclick="engStopArticle()">⏹ 停止</button>' +
    '</div>' +
    '<div class="enm-rate-row"><span class="enm-rate-label">语速</span>' +
      [0.5, 0.75, 1, 1.25, 1.5].map(function (r) {
        return '<button class="enm-rate-btn' + ((e.readRate || 0.9) === r ? ' active' : '') + '" onclick="engSetRate(' + r + ')">' + r + 'x</button>';
      }).join("") +
    '</div>' +
    '<div class="enm-read-label">🇬🇧 English</div>' +
    '<div class="enm-read-text" id="enm-article-text">' + wordsHtml + '</div>' +
    '<div class="enm-read-divider"></div>' +
    '<div class="enm-read-label">🇨🇳 中文翻译</div>' +
    '<div class="enm-read-text cn">' + escapeHtml(art.cn).replace(/\n/g, "<br>") + '</div>';
  if (marked.length > 0) {
    h += '<div class="enm-read-divider"></div><div class="enm-read-label">📌 今日生词</div><div class="enm-marked-list">' +
      marked.map(function (w) {
        var inBook = (e.newWords || []).indexOf(w) !== -1;
        return '<div class="enm-marked-row"><span class="enm-marked-word" onclick="engSpeak(\'' + escapeJs(w) + '\')">🔊 ' + escapeHtml(w) + '</span>' +
          '<button class="enm-marked-add' + (inBook ? ' on' : '') + '" onclick="engAddBook(\'' + escapeJs(w) + '\')">' + (inBook ? '✓ 已入生词本' : '＋生词本') + '</button>' +
          '<button class="enm-marked-rm" onclick="engUnmark(\'' + escapeJs(w) + '\')">✕</button></div>';
      }).join("") + '</div>';
  }
  return h + '</div>';
}

function engMarkWord(word) {
  var e = engGet();
  if (!e.markedVocab[today()]) e.markedVocab[today()] = [];
  var list = e.markedVocab[today()];
  var clean = word.replace(/[.,!?;:""''()]/g, "").toLowerCase();
  var i = list.indexOf(clean);
  if (i !== -1) list.splice(i, 1); else list.push(clean);
  DB.save(); render();
}
function engUnmark(word) {
  var e = engGet();
  if (!e.markedVocab[today()]) return;
  var i = e.markedVocab[today()].indexOf(word);
  if (i !== -1) e.markedVocab[today()].splice(i, 1);
  DB.save(); render();
}
function engAddBook(en) { engEnroll(en); showToast("已加入生词本 📚", "success"); render(); }

function engPlayArticle() {
  if (!window.speechSynthesis) { showToast("当前环境不支持语音", "error"); return; }
  var e = engGet();
  var art = e.dailyReading[today()]; if (!art) return;
  window.speechSynthesis.cancel();
  var rate = e.readRate || 0.9;
  var sents = art.en.split(/(?<=[.!?])\s+/);
  var idx = 0;
  function setBtns(s) {
    var p = document.getElementById("enm-play"), pa = document.getElementById("enm-pause"), re = document.getElementById("enm-resume");
    if (p) p.style.display = s === "playing" ? "none" : "";
    if (pa) pa.style.display = s === "playing" ? "" : "none";
    if (re) re.style.display = s === "paused" ? "" : "none";
  }
  setBtns("playing");
  function next() {
    if (idx >= sents.length) { setBtns("idle"); return; }
    var u = new SpeechSynthesisUtterance(sents[idx]); u.lang = "en-US"; u.rate = rate;
    u.onend = function () { idx++; next(); };
    _currentUtterance = u; window.speechSynthesis.speak(u);
  }
  next();
}
function engPauseArticle() { if (window.speechSynthesis) window.speechSynthesis.pause(); var pa = document.getElementById("enm-pause"), re = document.getElementById("enm-resume"); if (pa) pa.style.display = "none"; if (re) re.style.display = ""; }
function engResumeArticle() { if (window.speechSynthesis) window.speechSynthesis.resume(); var pa = document.getElementById("enm-pause"), re = document.getElementById("enm-resume"); if (pa) pa.style.display = ""; if (re) re.style.display = "none"; }
function engSetRate(r) { var e = engGet(); e.readRate = r; DB.save(); document.querySelectorAll(".enm-rate-btn").forEach(function (b) { b.classList.toggle("active", parseFloat(b.getAttribute("data-rate")) === r); }); }
function engStopArticle() { if (window.speechSynthesis) window.speechSynthesis.cancel(); var p = document.getElementById("enm-play"), pa = document.getElementById("enm-pause"), re = document.getElementById("enm-resume"); if (p) p.style.display = ""; if (pa) pa.style.display = "none"; if (re) re.style.display = "none"; }


/* ---------- 人力管理知识库 ---------- */
function engBodyKb(e) {
  var h = '<div class="enm-section-title">📚 人力管理知识库</div>';
  h += '<div class="enm-hint">点击卡片展开详情，内置 ' + ENG_HR_KB.length + ' 篇常用 HR 主题。</div>';
  h += '<div class="enm-kb-list">' + ENG_HR_KB.map(function (a, i) {
    var open = _kbOpen[i];
    return '<div class="enm-kb-card' + (open ? ' open' : '') + '">' +
      '<div class="enm-kb-head" onclick="engToggleKb(' + i + ')">' +
        '<span class="enm-kb-tag">' + escapeHtml(a.tag) + '</span>' +
        '<span class="enm-kb-title">' + escapeHtml(a.title) + '</span>' +
        '<span class="enm-kb-arrow">' + (open ? '▾' : '▸') + '</span>' +
      '</div>' +
      (open ? '<div class="enm-kb-body"><div class="enm-kb-sum">' + escapeHtml(a.summary) + '</div><div class="enm-kb-content">' + escapeHtml(a.body) + '</div></div>' : '') +
      '</div>';
  }).join("") + '</div>';
  return h;
}
function engToggleKb(i) { _kbOpen[i] = !_kbOpen[i]; render(); }

/* ---------- 打卡 / 励志句 / Tab ---------- */
function engCheckin() {
  var e = engGet();
  if (e.studyLog[today()] && e.studyLog[today()].completed) { showToast("今日已打卡", "error"); return; }
  // 连续天数
  var yest = addDays(today(), -1);
  if (e.lastStudyDate !== today()) {
    if (e.lastStudyDate === yest) e.streak = (e.streak || 0) + 1;
    else e.streak = 1;
    e.lastStudyDate = today();
  }
  var dur = (e.studyLog[today()] && e.studyLog[today()].duration) || 0;
  e.studyLog[today()] = { duration: dur, completed: true };
  if (engTimerInterval) { clearInterval(engTimerInterval); engTimerInterval = null; }
  e.timerRunning = false; e.timerStart = null;
  DB.save(); render();
  showToast("🎉 打卡成功，连续 " + e.streak + " 天！", "success");
}

function engChangeQuote() {
  var e = engGet();
  var idx = (e.checkinQuoteIndex + 1 + Math.floor(Math.random() * (ENG_QUOTES.length - 1))) % ENG_QUOTES.length;
  e.checkinQuoteIndex = idx; e.quoteDay = today();
  DB.save(); render();
}

function engSwitchTab(k) { var e = engGet(); e.currentTab = k; DB.save(); render(); }

/* ---------- 单词操作 ---------- */
function engToggleNew(en) {
  var e = engGet();
  if (!e.newWords) e.newWords = [];
  var i = e.newWords.indexOf(en);
  if (i !== -1) {
    e.newWords.splice(i, 1);
    if ((e.masteredWords || []).indexOf(en) === -1) {
      for (var j = e.deck.length - 1; j >= 0; j--) if (e.deck[j].en === en) e.deck.splice(j, 1);
    }
  } else engEnroll(en);
  DB.save(); render();
}
function engToggleMaster(en) {
  var e = engGet();
  if (!e.masteredWords) e.masteredWords = [];
  var i = e.masteredWords.indexOf(en);
  if (i !== -1) e.masteredWords.splice(i, 1);
  else { e.masteredWords.push(en); var j = e.newWords.indexOf(en); if (j !== -1) e.newWords.splice(j, 1); }
  DB.save(); render();
}

function engShowHistory() {
  var e = engGet();
  var dates = Object.keys(e.dailyWords || {}).sort().reverse().slice(0, 30);
  var html = '<div class="modal-title">📅 往期单词</div>';
  if (dates.length === 0) html += '<div class="empty-state"><div class="empty-text">还没有学习记录</div></div>';
  else {
    html += '<div style="max-height:60vh;overflow-y:auto">';
    dates.forEach(function (ds) {
      var ws = e.dailyWords[ds] || [];
      html += '<div style="padding:8px 0;border-bottom:1px solid var(--border-color)"><div style="font-weight:700;margin-bottom:4px">' + formatDate(ds) + ' (' + ws.length + '词)</div><div style="font-size:11px;color:var(--text-secondary)">' + ws.slice(0, 8).map(function (w) { return escapeHtml(w.en); }).join(" · ") + (ws.length > 8 ? ' ...' : '') + '</div></div>';
    });
    html += '</div>';
  }
  showModal(html);
}

/* ---------- 兼容旧入口（避免其它模块调用时报错） ---------- */
function speakWord(w) { engSpeak(w); }
function escapeJs(str) { return String(str).replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, "&quot;"); }
function engEscapeJs(str) { return escapeJs(str); }

