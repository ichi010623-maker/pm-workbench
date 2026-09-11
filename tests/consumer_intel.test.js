// Consumer Intelligence 提取层测试 · v5.9.117
// 覆盖：Schema 严格性、10 条规则红线、审计层、聚合层边界、UI 渲染
const fs = require("fs");
const vm = require("vm");

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log("  ✗ " + msg); } }
function section(t) { console.log("\n▶ " + t); }

const ROOT = "/Users/ichi/WorkBuddy/2026-07-30-21-36-02/pm-workbench-auto";
const SRC = {
  schema: fs.readFileSync(ROOT + "/js/consumer/schema.js", "utf8"),
  rules: fs.readFileSync(ROOT + "/js/consumer/rules.js", "utf8"),
  prompt: fs.readFileSync(ROOT + "/js/consumer/prompt.js", "utf8"),
  extract: fs.readFileSync(ROOT + "/js/consumer/extract.js", "utf8"),
  aggregate: fs.readFileSync(ROOT + "/js/consumer/aggregate.js", "utf8"),
  ui: fs.readFileSync(ROOT + "/js/consumer.js", "utf8")
};
const SEED = JSON.parse(fs.readFileSync(ROOT + "/data/consumer_intel.json", "utf8"));

function mkSandbox() {
  const fakeEl = { innerHTML: "", querySelector: () => null, querySelectorAll: () => [], style: {}, value: "", classList: { add() {}, remove() {}, contains: () => false } };
  const containers = { "app-content": fakeEl };
  const sb = {
    console, Math, Date, JSON, Object, Array, String, Number, parseInt, parseFloat, isNaN,
    encodeURIComponent, decodeURIComponent, setInterval, clearInterval, setTimeout, clearTimeout,
    addEventListener() {}, removeEventListener() {},
    document: {
      getElementById: id => containers[id] || fakeEl, querySelector: () => null, querySelectorAll: () => [],
      addEventListener() {}, hidden: false, readyState: "complete"
    },
    window: { addEventListener() {} },
    localStorage: (function () { const s = { "ci_seed_loaded": "1" }; return { getItem: k => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); }, removeItem: k => { delete s[k]; } }; })(),
    escapeHtml: s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"),
    showToast() {}, render() {}, today: () => "2026-09-11",
    DB: { data: { consumerIntel: { researches: [] } }, save() {} },
    fetch: () => Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve("") })
  };
  sb.window = sb;
  vm.createContext(sb);
  // 按依赖顺序加载（schema → rules → prompt → extract → aggregate → ui）
  ["schema", "rules", "prompt", "extract", "aggregate"].forEach(k => vm.runInContext(SRC[k], sb));
  return sb;
}
function loadUI(sb) { vm.runInContext(SRC.ui, sb); }
function withSeed(sb) { Object.assign(sb, { __seed: SEED }); vm.runInContext("DB.data.consumerIntel.researches = __seed.researches", sb); }

// ============ A. Schema 枚举严格性 ============
section("A. Schema 枚举与结构");
{
  const sb = mkSandbox();
  const ps = sb.CI_PAIN_STATUS;
  ok(ps.length === 9, "pain.status 恰好 9 个值（实际 " + ps.length + "）");
  ["mentioned", "experienced", "recurring", "impacted", "seeking_solution",
   "solution_adopted", "dissatisfied", "solved", "unknown"].forEach(v => {
    ok(ps.indexOf(v) >= 0, "含枚举值 " + v);
  });
  const lv = sb.CI_EVIDENCE_LEVELS;
  ok(lv.length === 6 && lv[0] === "E1" && lv[5] === "E6", "证据等级 E1-E6 齐全");
  // 优先级顺序：越高阶段越靠前
  const pr = sb.CI_PAIN_PRIORITY;
  ok(pr[0] === "solved", "最高阶段为 solved");
  ok(pr.indexOf("dissatisfied") < pr.indexOf("solution_adopted"), "dissatisfied 优先于 solution_adopted");
  ok(pr.indexOf("solution_adopted") < pr.indexOf("seeking_solution"), "solution_adopted 优先于 seeking_solution");
  ok(pr.indexOf("impacted") < pr.indexOf("recurring"), "impacted 优先于 recurring");
  ok(pr.indexOf("recurring") < pr.indexOf("experienced"), "recurring 优先于 experienced");
  // 三值布尔与独立字段
  const S = sb.CI_SCHEMA;
  ok(S.properties.solution.required.indexOf("purchase_signal") >= 0, "solution 含 purchase_signal");
  ok(S.properties.solution.required.indexOf("solved_status") >= 0, "solution 含 solved_status");
  ok(S.properties.solution.required.indexOf("solution_adopted") >= 0, "solution 含 solution_adopted");
  ok(S.additionalProperties === false, "顶层 additionalProperties=false");
  ok(S.properties.solution.additionalProperties === false, "solution additionalProperties=false");
}

// ============ B. 校验器：拒绝越界与计数字段（规则 8） ============
section("B. 校验器红线");
{
  const sb = mkSandbox();
  const base = sb.ciSafeFallback();
  ok(sb.ciValidateExtraction(base).ok, "safeFallback 可通过校验");

  // 规则 8：禁止计数
  ["user_count", "mention_count", "unique_users", "count", "人数"].forEach(f => {
    const bad = JSON.parse(JSON.stringify(base));
    bad[f] = 5;
    const r = sb.ciValidateExtraction(bad);
    ok(!r.ok && r.errors.join(" ").indexOf("禁止字段") >= 0, "拒绝计数字段 " + f);
  });

  // 非法枚举
  const bad2 = JSON.parse(JSON.stringify(base));
  bad2.pain.status = "strong_pain";
  ok(!sb.ciValidateExtraction(bad2).ok, "拒绝非法 pain.status");

  const bad3 = JSON.parse(JSON.stringify(base));
  bad3.evidence.level = "E7";
  ok(!sb.ciValidateExtraction(bad3).ok, "拒绝非法 evidence.level");

  const bad4 = JSON.parse(JSON.stringify(base));
  bad4.solution.solved_status = "yes";
  ok(!sb.ciValidateExtraction(bad4).ok, "拒绝非法 solved_status");

  // 未知顶层字段
  const bad5 = JSON.parse(JSON.stringify(base));
  bad5.extra_field = "x";
  ok(!sb.ciValidateExtraction(bad5).ok, "拒绝未知顶层字段");

  // 缺必填
  const bad6 = JSON.parse(JSON.stringify(base));
  delete bad6.pain;
  ok(!sb.ciValidateExtraction(bad6).ok, "拒绝缺失必填字段");

  // 深度嵌套的计数字段也要抓到
  const bad7 = JSON.parse(JSON.stringify(base));
  bad7.persona.user_count = 9;
  const r7 = sb.ciValidateExtraction(bad7);
  ok(!r7.ok && r7.errors.join(" ").indexOf("persona.user_count") >= 0, "深度扫描命中嵌套计数字段");
}

// ============ C. Prompt：10 条规则必须逐条出现 ============
section("C. 提取 Prompt 编码 10 条规则");
{
  const sb = mkSandbox();
  const P = sb.CI_EXTRACT_SYSTEM_PROMPT;
  ok(P.indexOf("只能根据用户原始文本判断") >= 0, "规则1 只依据原文");
  ok(P.indexOf("不得使用常识补充") >= 0, "规则2 不得补充");
  ok(P.indexOf('"unknown"') >= 0, "规则3 不确定返回 unknown");
  ok(P.indexOf("不得把推测当成事实") >= 0, "规则4 禁止推测当事实");
  ok(P.indexOf("不得把一次性抱怨自动判断为持续痛点") >= 0, "规则5 一次性≠持续");
  ok(P.indexOf("购买解决方案，不代表问题已经解决") >= 0, "规则6 购买≠解决");
  ok(P.indexOf("提到产品，不代表用户正在使用") >= 0, "规则7 提及≠使用");
  ok(P.indexOf("评论数量不能代表用户数量") >= 0, "规则8 条数≠人数");
  ok(P.indexOf("不得根据情绪强度直接推断痛点强度") >= 0, "规则9 情绪≠痛点强度");
  ok(P.indexOf("不要进行过度概括") >= 0, "规则10 不过度概括");
  // 关键约束
  ok(P.indexOf("不要输出任何用户数量") >= 0, "明示禁止输出计数");
  ok(P.indexOf("每次") >= 0 && P.indexOf("一直") >= 0, "给出 recurring 判定关键词");
  ok(P.indexOf("E6") >= 0 && P.indexOf("E1") >= 0, "给出 E1-E6 定义");
  ok(P.indexOf("只分析单条") >= 0 || P.indexOf("单条用户内容") >= 0, "明示单条分析");

  // 用户消息构造
  const m = sb.ciBuildExtractionMessages("夏天拍照手机很烫", { platform: "xhs" });
  ok(m.system === P, "system = 规则 prompt");
  ok(m.user.indexOf("夏天拍照手机很烫") >= 0, "user 含原文");
  ok(m.user.indexOf("JSON Schema") >= 0, "user 附 Schema");
}

// ============ D. 请求体：提取阶段禁止联网、temperature=0 ============
section("D. 提取请求体约束");
{
  const sb = mkSandbox();
  const p = sb.INTEL_PROVIDERS ? sb.INTEL_PROVIDERS.gemini : { id: "gemini", models: ["m1"] };
  const body = sb.ciBuildExtractionBody(p, "SYS", "USER");
  ok(body.systemInstruction && body.systemInstruction.parts[0].text === "SYS", "gemini 使用我们的 system prompt");
  ok(!body.tools, "gemini 提取体不含联网工具（禁止外部知识补充）");
  ok(body.generationConfig && body.generationConfig.temperature === 0, "temperature=0 保证可复核");
  ok(body.generationConfig.responseMimeType === "application/json", "强制 JSON 输出");

  const po = { id: "openai" };
  const bo = sb.ciBuildExtractionBody(po, "SYS", "USER");
  ok(bo.messages[0].role === "system" && bo.messages[0].content === "SYS", "openai 兼容：system 为首条");
  ok(bo.messages[1].role === "user" && bo.messages[1].content === "USER", "openai 兼容：user 为次条");
  ok(bo.temperature === 0, "openai 兼容 temperature=0");
}

// ============ E. 审计层：规则红线可被程序检出 ============
section("E. 规则审计层（可质疑）");
{
  const sb = mkSandbox();
  const mk = (text, over) => {
    const e = JSON.parse(JSON.stringify(sb.ciSafeFallback()));
    Object.assign(e.pain, over.pain || {});
    Object.assign(e.solution, over.solution || {});
    Object.assign(e.impact, over.impact || {});
    return { id: "t", rawText: text, extracted: e };
  };

  // 规则5：无反复措辞不得判 recurring
  let a = sb.ciAudit(mk("手机有点烫。", { pain: { status: "recurring" } }));
  ok(!a.ok && a.warnings.some(w => w.rule === "规则5"), "规则5：无「每次/一直」判 recurring → 报警");
  a = sb.ciAudit(mk("每次出去拍手机都烫得不行。", { pain: { status: "recurring" } }));
  ok(a.warnings.filter(w => w.rule === "规则5").length === 0, "规则5：有「每次」→ 不报警");

  // 规则6：购买 ≠ 已解决
  a = sb.ciAudit(mk("买了一个散热器。", {
    pain: { status: "solution_adopted" },
    solution: { solution_adopted: "true", purchase_signal: "true", solved_status: "solved" }
  }));
  ok(!a.ok && a.warnings.some(w => w.rule === "规则6"), "规则6：购买后判 solved → 报警");
  a = sb.ciAudit(mk("之前一直很烫，换了散热器之后就没这个问题了。", {
    pain: { status: "solved" },
    solution: { solution_adopted: "true", purchase_signal: "true", solved_status: "solved" }
  }));
  ok(a.warnings.filter(w => w.rule === "规则6").length === 0, "规则6：明确「没这个问题了」→ 不报警");

  // 规则7：提及 ≠ 已使用
  a = sb.ciAudit(mk("听说散热器这东西挺有用。", { solution: { solution_adopted: "true" } }));
  ok(!a.ok && a.warnings.some(w => w.rule === "规则7"), "规则7：转述「听说」判已采用 → 报警");

  // 规则9：情绪强度不得推断痛点强度
  a = sb.ciAudit(mk("真的很烦！", { pain: { status: "impacted" } }));
  ok(!a.ok && a.warnings.some(w => w.rule === "规则9" || w.rule === "规则4"), "规则9：情绪强+impacted 无后果措辞 → 报警");

  // 字段一致性：purchase=true 但 adopted=false
  a = sb.ciAudit(mk("我买了一个散热器。", { solution: { purchase_signal: "true", solution_adopted: "false" } }));
  ok(!a.ok, "一致性：purchase=true 而 adopted=false → 报警");

  // 规则3：unknown 需在 unknowns 记录
  const rec3 = mk("随便说点什么吧。", { pain: { status: "unknown" } });
  rec3.extracted.unknowns = [];                      // 显式清空，模拟「判 unknown 却未记录」
  a = sb.ciAudit(rec3);
  ok(!a.ok && a.warnings.some(w => w.rule === "规则3"), "规则3：pain=unknown 未记 unknowns → 报警");
  const rec3b = mk("随便说点什么吧。", { pain: { status: "unknown" } });
  ok(sb.ciAudit(rec3b).warnings.filter(w => w.rule === "规则3").length === 0,
    "规则3：unknowns 已记录时不报警");

  // 正常记录不报警
  a = sb.ciAudit(mk("夏天户外拍视频，每次半小时手机就烫得掉帧，只能停下来。", {
    pain: { status: "impacted" }, impact: { task_blocked: "true" }
  }));
  ok(a.ok, "合规记录审计通过");
}

// ============ F. 聚合层：计数只在聚合层，且漏斗递减 ============
section("F. 聚合层计数");
{
  const sb = mkSandbox();
  withSeed(sb);
  const recs = vm.runInContext("DB.data.consumerIntel.researches[0].evidence", sb);
  const agg = sb.ciAggregate(recs);
  ok(agg.mention_count === 36, "mention_count = 36 条");
  ok(agg.unique_users < agg.mention_count, "去重用户 < 提及条数（Mention ≠ 人数）");
  ok(agg.relevant_users <= agg.unique_users, "相关用户 ≤ 去重用户");
  ok(agg.pain_confirmed_users < agg.relevant_users, "明确痛苦 < 相关用户（Mention ≠ Pain）");
  const fn = agg.funnel;
  ok(fn[0] > fn[1] && fn[1] >= fn[2] && fn[2] > fn[3], "漏斗严格递减 " + fn.join(" > "));
  ok(agg.audit && agg.audit.flagged === 0, "种子数据审计 0 标记（实际 " + (agg.audit && agg.audit.flagged) + "）");
  ok(agg.audit.clean === 36, "种子数据 36 条全部 clean");

  // 分布
  const pd = sb.ciPainDist(recs);
  ok(pd.length === 9, "痛点分布覆盖 9 个状态位");
  ok(pd.reduce((a, x) => a + x.mentions, 0) === 36, "痛点分布条数合计 = 36");
  const ld = sb.ciLevelDist(recs);
  ok(ld.length === 6, "证据等级分布 6 档");
  ok(ld.every(x => x.mentions >= 0), "等级分布非负");

  // 场景 / 来源
  const sc = sb.ciSceneAgg(recs, 5);
  ok(sc.time.length > 0, "场景聚合：时间有值");
  const sd = sb.ciSourceDist(recs);
  ok(sd.length >= 4, "来源分布 ≥ 4 个平台");
}

// ============ G. 种子数据全部符合 Schema（规则落地校验） ============
section("G. 种子数据合规性");
{
  const sb = mkSandbox();
  withSeed(sb);
  const recs = vm.runInContext("DB.data.consumerIntel.researches[0].evidence", sb);
  let bad = 0, missingUnknowns = 0;
  recs.forEach(r => {
    if (!sb.ciValidateExtraction(r.extracted).ok) bad++;
    if (!r.extracted.unknowns) missingUnknowns++;
  });
  ok(bad === 0, "36/36 条 extracted 通过 Schema 校验");
  ok(missingUnknowns === 0, "每条记录都带 unknowns 字段");

  // 每条都必须有原文支撑
  const noQuote = recs.filter(r => !r.rawText || !r.extracted.pain.basis_quote);
  ok(noQuote.length === 0, "每条 pain 判断都带 basis_quote");

  // 记录中不得出现计数字段（规则 8）
  const withCount = recs.filter(r => sb.ciFindForbidden(r.extracted).length > 0);
  ok(withCount.length === 0, "提取结果中不存在任何计数字段");

  // 关键：所有 solved 记录必须有明确「已解决」措辞
  const solvedRecs = recs.filter(r => r.extracted.solution.solved_status === "solved");
  const allHaveCue = solvedRecs.every(r => /不再|不会太|没这个问题|解决了|好了|不烫了/.test(r.rawText));
  ok(allHaveCue, "所有 solved_status=solved 的记录都有明确「已解决」措辞");
}

// ============ H. UI：渲染 v2 结构 ============
section("H. UI 渲染");
{
  const sb = mkSandbox();
  withSeed(sb);
  loadUI(sb);

  // 列表
  vm.runInContext("CI_VIEW='list'", sb);
  let html = vm.runInContext("(function(){var c=document.getElementById('app-content');c.innerHTML='';try{renderConsumer()}catch(e){return 'ERR:'+e.message}return c.innerHTML})()", sb);
  ok(html.indexOf("Consumer Intelligence") >= 0, "列表标题");
  ok(html.indexOf("ci-ladder") >= 0, "列表含漏斗计数");
  ok(html.indexOf("ci-rule-chips") >= 0, "列表含规则标签");
  ok(html.indexOf("提取单条内容") >= 0, "列表含提取入口");

  // 研究详情
  vm.runInContext("CI_VIEW='research:r_magsafe_cooler_2026'", sb);
  html = vm.runInContext("(function(){var c=document.getElementById('app-content');c.innerHTML='';try{renderConsumer()}catch(e){return 'ERR:'+e.message}return c.innerHTML})()", sb);
  ok(html.indexOf("ERR:") < 0, "研究详情无渲染错误");
  ok(html.indexOf("聚合计数") >= 0, "含聚合计数区");
  ok(html.indexOf("ci-ladder") >= 0, "聚合区渲染漏斗");
  ok(html.indexOf("痛点状态分布") >= 0, "含痛点状态分布");
  ok(html.indexOf("证据等级分布") >= 0, "含证据等级分布");
  ok(html.indexOf("场景聚合") >= 0, "含场景聚合");
  ok(html.indexOf("规则审计") >= 0, "含规则审计区");
  ok(html.indexOf("原始记录") >= 0, "含记录列表");
  const recCount = (html.match(/class="ci-rec"/g) || []).length;
  ok(recCount === 36, "渲染 36 条记录（实际 " + recCount + "）");

  // 单条记录详情
  vm.runInContext("CI_VIEW='record:r_magsafe_cooler_2026:ev_001'", sb);
  html = vm.runInContext("(function(){var c=document.getElementById('app-content');c.innerHTML='';try{renderConsumer()}catch(e){return 'ERR:'+e.message}return c.innerHTML})()", sb);
  ok(html.indexOf("ERR:") < 0, "记录详情无渲染错误");
  ok(html.indexOf("用户是谁") >= 0, "含 persona 分组");
  ok(html.indexOf("场景 scene") >= 0, "含 scene 分组");
  ok(html.indexOf("问题 problem") >= 0, "含 problem 分组");
  ok(html.indexOf("痛点 pain") >= 0, "含 pain 分组");
  ok(html.indexOf("实际后果 impact") >= 0, "含 impact 分组");
  ok(html.indexOf("解决方案 solution") >= 0, "含 solution 分组");
  ok(html.indexOf("情绪 emotion") >= 0, "含 emotion 分组");
  ok(html.indexOf("unknowns") >= 0, "含 unknowns 分组");
  ok(html.indexOf("购买 ≠ 已解决") >= 0, "UI 明示「购买 ≠ 已解决」");
  ok(html.indexOf("情绪强度不参与痛点强度判断") >= 0, "UI 明示情绪不推断痛点");
  ok(html.indexOf("ci-ext-quote") >= 0, "含原文引用块");
}

// ============ I. 提取视图 + 落库边界 ============
section("I. 提取视图");
{
  const sb = mkSandbox();
  withSeed(sb);
  loadUI(sb);
  vm.runInContext("CI_VIEW='extract'", sb);
  const html = vm.runInContext("(function(){var c=document.getElementById('app-content');c.innerHTML='';try{renderConsumer()}catch(e){return 'ERR:'+e.message}return c.innerHTML})()", sb);
  ok(html.indexOf("提取单条内容") >= 0, "提取视图标题");
  ok(html.indexOf("ci-ex-text") >= 0, "含原文输入框");
  ok(html.indexOf("ci-ex-source") >= 0, "含平台选择");
  ok(html.indexOf("一次只处理") >= 0, "明示一次只处理一条");
  ok(html.indexOf("不包含任何用户数量") >= 0, "明示提取结果不含计数");

  // ciMakeRecord 结构
  const rec = sb.ciMakeRecord("测试原文", { source: "xhs", user: "u1" }, { ok: true, extraction: sb.ciSafeFallback(), provider: "gemini", errors: [] });
  ok(rec.schema_version === 2, "记录 schema_version=2");
  ok(rec.rawText === "测试原文", "记录保留原文");
  ok(!!rec.extracted && !!rec.extraction, "记录含 extracted 与 extraction 元信息");
  ok(sb.ciFindForbidden(rec).length === 0, "记录不含任何计数字段");
}

// ============ J. 分层边界：提取层不得产出计数 ============
section("J. 分层边界");
{
  const sb = mkSandbox();
  // extract.js 源码中不得出现计数产出
  ok(SRC.extract.indexOf("mention_count") < 0 && SRC.extract.indexOf("unique_users") < 0,
    "extract.js 不产出任何计数字段");
  // aggregate.js 是唯一包含计数的模块
  ok(SRC.aggregate.indexOf("mention_count") >= 0, "aggregate.js 负责计数");
  // prompt.js 明示禁止计数
  ok(SRC.prompt.indexOf("不要输出任何用户数量") >= 0, "prompt 明示禁止计数");
}

console.log("\n=========================================");
console.log("v5.9.117 Consumer Intelligence 提取层测试：通过 " + pass + " / 失败 " + fail);
console.log("=========================================");
process.exit(fail > 0 ? 1 : 0);
