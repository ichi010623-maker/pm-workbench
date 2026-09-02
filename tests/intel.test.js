// 行业情报增强模块自动化测试（Node vm 按顺序加载 js/intel/*.js 子模块，stub DOM/DB/fetch）
// Sprint 1 重构：原单文件 js/intel.js（809 行）拆分为 8 个子模块
// 运行：node tests/intel.test.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
// 按依赖顺序加载子模块（core → history/fav/comments → llm/prompts → providers → parser → client）
const SUBMODULES = [
  "js/intel/core.js",
  "js/intel/history.js",
  "js/intel/fav.js",
  "js/intel/comments.js",
  "js/intel/llm/prompts.js",
  "js/intel/llm/providers.js",
  "js/intel/llm/parser.js",
  "js/intel/llm/client.js"
];

// ---- 沙箱（模拟浏览器环境，仅满足函数可调用） ----
const fakeEl = { innerHTML: "", querySelector: () => null, querySelectorAll: () => [], classList: { add() {}, remove() {}, contains: () => false } };
const sandbox = {
  DB: { data: { industryHistory: {}, industryFav: [], industryCustom: [] }, save() {}, logActivity() {} },
  document: { getElementById: () => fakeEl, querySelector: () => null, querySelectorAll: () => [] },
  window: {},
  escapeHtml: s => (s == null ? "" : String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")),
  showModal() {}, closeModal() {}, showToast() {}, navigate() {}, render() {},
  today: () => "2026-08-06",
  uid: () => "id" + Math.random().toString(36).slice(2, 9),
  console, encodeURIComponent, decodeURIComponent, Math, Date, JSON, Object, Array, String, Number, parseInt, parseFloat, isNaN,
  localStorage: (function () { var m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; })()
};
vm.createContext(sandbox);
SUBMODULES.forEach(function (f) {
  const src = fs.readFileSync(path.join(ROOT, f), "utf8");
  vm.runInContext(src, sandbox, { filename: f });
});

const {
  snapshotNewsForDate, intelHistoryDates, intelHistoryByDate,
  intelFavKey, intelToggleFav, intelIsFav, intelRemoveFav,
  intelMakeFavRec, intelAddFav, INTEL_FAV_CATS_DEFAULT,
  intelFavCatName, intelAddFavCat, intelRenameFavCat, intelRemoveFavCat,
  intelAddComment, intelListComments, intelRemoveComment, intelUpdateComment,
  ensureIndustry, INTEL_PROVIDERS, intelSystemPrompt, parseIntelLLM, buildIntelResult, callIntelLLM,
  loadAiConfig, saveAiConfig, describeIntelHttpError,
  intelSearchItems, intelFilterItemsByCategory, intelSearchFav, customIntelToMyIntel,
  marketOpportunityPrompt, parseMarketOpportunity, buildMarketOpportunityResult, callLLMForPrompt
} = sandbox;

// ---- 断言框架 ----
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error("  ✗ " + msg); } }
function section(name) { console.log("\n▶ " + name); }

const NEWS = {
  generatedAt: "2026-08-06T07:00:00+08:00",
  categories: [{ key: "official", label: "官媒" }, { key: "hardware", label: "消费电子" }],
  items: [
    { id: "n1", category: "official", priority: 5, title: "工业机器人产量超53万套", summary: "智能制造产能扩张", source: "新华网", url: "https://x.com/1", pubTime: "", tags: ["机器人"] },
    { id: "n2", category: "hardware", priority: 4, title: "折叠屏铰链升级", summary: "成本下探", source: "媒体", url: "https://x.com/2", pubTime: "", tags: ["折叠屏"] }
  ]
};

(async function () {
  section("A. 每日资讯留存 snapshotNewsForDate");
  ok(Object.keys(snapshotNewsForDate(null, null)).length === 0, "无效输入返回空历史");
  var h1 = snapshotNewsForDate(NEWS, {});
  ok(h1["2026-08-06"] && h1["2026-08-06"].items.length === 2, "按 generatedAt 日期分桶存储");
  ok(h1["2026-08-06"].items[0].id === "n1", "快照保留条目字段");
  var h2 = snapshotNewsForDate(NEWS, h1);
  ok(h2 === h1, "同一天重复抓取幂等（不覆盖）");
  var NEWS2 = JSON.parse(JSON.stringify(NEWS)); NEWS2.generatedAt = "2026-08-05T07:00:00+08:00";
  var h3 = snapshotNewsForDate(NEWS2, h1);
  ok(h3["2026-08-05"] && h3["2026-08-06"] && Object.keys(h3).length === 2, "不同日期分开存储");

  section("B. 历史日期与读取");
  var dates = intelHistoryDates(h3);
  ok(dates[0] === "2026-08-06" && dates[1] === "2026-08-05", "日期倒序排列");
  ok(intelHistoryDates({}).length === 0, "空历史返回空数组");
  ok(intelHistoryByDate(h3, "2026-08-06").length === 2, "按日期读取当日条目");
  ok(intelHistoryByDate(h3, "2099-01-01").length === 0, "未知日期返回空");

  section("C. 收藏 key 稳定性");
  ok(intelFavKey({ id: "n1", title: "x" }, "2026-08-06") === "2026-08-06|n1", "key = 日期|id");
  ok(intelFavKey({ title: "无id条目" }, "2026-08-06") === "2026-08-06|无id条目", "无 id 用标题兜底");
  ok(intelFavKey({ id: "n1" }, "2026-08-06") === intelFavKey({ id: "n1" }, "2026-08-06"), "同输入 key 稳定");
  ok(intelFavKey({ id: "n1" }, "2026-08-05") !== intelFavKey({ id: "n1" }, "2026-08-06"), "不同日期 key 不同（避免跨天 id 冲突）");

  section("D. 收藏增删 intelToggleFav / intelIsFav / intelRemoveFav");
  var item = { id: "n1", title: "t", summary: "s", source: "x", url: "", tags: ["a"], date: "2026-08-06" };
  var r1 = intelToggleFav([], item, "2026-08-06");
  ok(r1.added === true && r1.fav.length === 1, "收藏新增");
  ok(intelIsFav(r1.fav, intelFavKey(item, "2026-08-06")) === true, "isFav 命中");
  ok(r1.fav[0].key && r1.fav[0].favAt, "收藏记录含 key 与 favAt 时间戳");
  var r2 = intelToggleFav(r1.fav, item, "2026-08-06");
  ok(r2.added === false && r2.fav.length === 0, "再次点击取消收藏");
  var r3 = intelToggleFav(r2.fav, item, "2026-08-06");
  ok(r3.fav.length === 1, "toggle 可重新加入");
  ok(intelRemoveFav(r1.fav, intelFavKey(item, "2026-08-06")).length === 0, "removeFav 移除");

  section("E. ensureIndustry 初始化");
  sandbox.DB.data.industryFav = ["existing"];
  ensureIndustry();
  ok(sandbox.DB.data.industryHistory && Array.isArray(sandbox.DB.data.industryFav) && Array.isArray(sandbox.DB.data.industryCustom), "初始化 history/fav/custom 容器");
  ok(sandbox.DB.data.industryFav.length === 1, "已有数据不被覆盖");
  ok(Array.isArray(sandbox.DB.data.marketOpp), "初始化 marketOpp 容器");

  section("F. 免费大模型 INTEL_PROVIDERS 结构");
  ok(INTEL_PROVIDERS.gemini && INTEL_PROVIDERS.perplexity && INTEL_PROVIDERS.groq && INTEL_PROVIDERS.deepseek && INTEL_PROVIDERS.openrouter, "5 个 provider 齐全");
  var gu = INTEL_PROVIDERS.gemini.buildUrl("KEY123");
  ok(gu.indexOf("key=KEY123") > 0 && gu.indexOf("gemini-2.5-flash") > 0, "gemini URL 带 key 查询参数与模型");
  var gb = INTEL_PROVIDERS.gemini.buildBody("折叠屏趋势", "2026-08-06");
  ok(gb.tools && gb.tools[0].google_search !== undefined, "gemini 启用 google_search 接地（联网检索）");
  ok(INTEL_PROVIDERS.gemini.search === true, "gemini 标记可联网搜索");
  var ph = INTEL_PROVIDERS.perplexity.buildHeaders("pplx");
  ok(ph.Authorization === "Bearer pplx", "perplexity Authorization Bearer");
  ok(INTEL_PROVIDERS.perplexity.search === true, "perplexity 标记可联网搜索");
  var gh = INTEL_PROVIDERS.groq.buildHeaders("gk");
  ok(gh.Authorization === "Bearer gk" && gh["Content-Type"] === "application/json", "groq OpenAI 兼容请求头");
  ok(INTEL_PROVIDERS.groq.search === false && INTEL_PROVIDERS.deepseek.search === false && INTEL_PROVIDERS.openrouter.search === false, "知识型 provider 非实时搜索");
  ok(typeof intelSystemPrompt("测试需求", "2026-08-06") === "string" && intelSystemPrompt("测试需求", "2026-08-06").indexOf("JSON") > 0, "intelSystemPrompt 产出 JSON 指令");

  section("G. parseIntelLLM 稳健解析");
  ok(parseIntelLLM("```json\n{\"title\":\"x\",\"items\":[]}\n```").title === "x", "去除 ```json 代码块");
  ok(parseIntelLLM("前缀噪声 {\"title\":\"y\",\"items\":[{\"title\":\"a\"}]} 后缀").title === "y", "从前后噪声中提取 JSON");
  var threw = false; try { parseIntelLLM("no json here"); } catch (e) { threw = true; }
  ok(threw, "无 JSON 对象时抛错");

  section("H. buildIntelResult 规范化");
  var pr = buildIntelResult(
    { title: "T", summary: "S", items: [{ title: "a", point: "p", source: "s", url: "u", tags: ["t"] }, { title: "" }], sources: [{ title: "o", url: "https://o" }] },
    { need: "需求", provider: "gemini", date: "2026-08-06", sources: [{ title: "", url: "https://o" }] }
  );
  ok(pr.items.length === 1, "过滤无 title 的无效条目");
  ok(pr.sources.length === 1, "sources 按 url 去重");
  ok(pr.title === "T" && pr.date === "2026-08-06" && pr.provider === "gemini", "透传 title/date/provider");
  var pr2 = buildIntelResult({}, { need: "我的需求" });
  ok(pr2.title.indexOf("我的需求") > 0, "无 title 时用需求兜底");

  section("I. AI 配置存取（仅本机）");
  saveAiConfig({ provider: "gemini", key: "abc" });
  var cfg = loadAiConfig();
  ok(cfg.key === "abc" && cfg.provider === "gemini", "AI Key 存取到 localStorage");

  section("J. callIntelLLM（stub fetch 端到端，不触网）");
  sandbox.fetch = async function (url, opts) {
    ok(url.indexOf("generativelanguage.googleapis.com") > 0, "[fetch] 请求发往 gemini endpoint");
    var body = JSON.parse(opts.body);
    ok(body.tools && body.tools[0].google_search !== undefined, "[fetch] 请求体携带 google_search 工具");
    return {
      ok: true,
      json: async function () {
        return {
          candidates: [{
            content: { parts: [{ text: "```json\n" + JSON.stringify({
              title: "折叠屏情报", summary: "s", items: [{ title: "铰链", point: "p", source: "媒体", url: "", tags: ["折叠"] }], sources: []
            }) + "\n```" }] },
            groundingMetadata: { groundingChunks: [{ web: { title: "来源A", uri: "https://a.com" } }] }
          }]
        };
      }
    };
  };
  var res = await callIntelLLM("gemini", "KEY", "折叠屏趋势");
  ok(res.items.length === 1, "解析出 1 条情报");
  ok(res.items[0].title === "铰链", "情报点标题正确");
  ok(res.sources.length === 1 && res.sources[0].url === "https://a.com", "gemini grounding 引用来源被提取");
  ok(res.provider === "gemini" && res.date === "2026-08-06", "结果记录 provider 与日期");

  sandbox.fetch = async function () { return { ok: false, status: 401 }; };
  var err = false; try { await callIntelLLM("gemini", "k", "x"); } catch (e) { err = true; }
  ok(err, "HTTP 非 200 时抛错（由交互层捕获提示）");

  section("K. 评论 intelAddComment / intelListComments / intelRemoveComment");
  var cmts = {};
  var c0 = intelAddComment(cmts, "2026-08-06|n1", "铰链成本在降");
  cmts = c0.comments;
  ok(cmts["2026-08-06|n1"] && cmts["2026-08-06|n1"].length === 1, "新增评论写入对应 key");
  ok(c0.comment.text === "铰链成本在降" && c0.comment.id && c0.comment.createdAt, "评论记录含 text/id/createdAt");
  var c1 = intelAddComment(cmts, "2026-08-06|n1", "第二代更轻");
  cmts = c1.comments;
  ok(intelListComments(cmts, "2026-08-06|n1").length === 2, "同 key 可追加评论");
  ok(intelListComments(cmts, "未知key").length === 0, "未知 key 返回空数组");
  var threwC = false; try { intelAddComment({}, "k", "   "); } catch (e) { threwC = true; }
  ok(threwC, "空白评论抛错（UI 已拦截，函数层兜底）");
  var c2 = intelRemoveComment(cmts, "2026-08-06|n1", cmts["2026-08-06|n1"][0].id);
  cmts = c2;
  ok(intelListComments(cmts, "2026-08-06|n1").length === 1, "按 id 删除一条评论");
  var c3 = intelRemoveComment(cmts, "2026-08-06|n1", cmts["2026-08-06|n1"][0].id);
  ok(!c3["2026-08-06|n1"], "删空后 key 被移除");

  section("K2. 评论编辑 intelUpdateComment");
  cmts = {};
  var e0 = intelAddComment(cmts, "2026-08-06|n9", "原评论内容");
  cmts = e0.comments;
  ok(intelListComments(cmts, "2026-08-06|n9").length === 1, "先建一条评论用于编辑");
  var origCmt = intelListComments(cmts, "2026-08-06|n9")[0];
  var e1 = intelUpdateComment(cmts, "2026-08-06|n9", origCmt.id, "编辑后的内容");
  cmts = e1.comments;
  ok(e1.comment && e1.comment.text === "编辑后的内容", "返回更新后的评论");
  ok(intelListComments(cmts, "2026-08-06|n9")[0].text === "编辑后的内容", "原评论文本被更新");
  ok(intelListComments(cmts, "2026-08-06|n9")[0].createdAt === origCmt.createdAt, "createdAt 保留不变");
  ok(!!intelListComments(cmts, "2026-08-06|n9")[0].updatedAt, "写入 updatedAt 时间戳");
  var threwE = false; try { intelUpdateComment(cmts, "2026-08-06|n9", origCmt.id, "  "); } catch (e) { threwE = true; }
  ok(threwE, "空白编辑内容抛错");
  var e2 = intelUpdateComment(cmts, "2026-08-06|n9", "不存在的id", "x");
  ok(e2.comment === null && intelListComments(e2.comments, "2026-08-06|n9")[0].text === "编辑后的内容", "未知 id 不改动原评论");

  section("Q. HTTP 错误解读 describeIntelHttpError");
  ok(describeIntelHttpError(400).indexOf("API Key") >= 0, "400 提示多为 API Key 无效/格式错误");
  ok(describeIntelHttpError(401).indexOf("API Key") >= 0, "401 提示 Key 无效");
  ok(describeIntelHttpError(429).indexOf("额度") >= 0, "429 提示免费额度用尽");
  ok(describeIntelHttpError(599).indexOf("未知") >= 0, "未收录状态码回退未知错误");

  section("L. 收藏分类（自定义名称）");
  ok(INTEL_FAV_CATS_DEFAULT.length === 5 && INTEL_FAV_CATS_DEFAULT[0].name === "市场", "默认 5 个分类含「市场」");
  var ac = intelAddFavCat(INTEL_FAV_CATS_DEFAULT, "车载支架");
  ok(ac.cats.length === 6 && ac.id && intelFavCatName(ac.cats, ac.id) === "车载支架", "新增自定义分类并命名");
  var threwCat = false; try { intelAddFavCat([], "  "); } catch (e) { threwCat = true; }
  ok(threwCat, "空白分类名抛错");
  var rn = intelRenameFavCat(INTEL_FAV_CATS_DEFAULT, "market", "市场趋势");
  ok(intelFavCatName(rn, "market") === "市场趋势", "重命名分类生效");
  var rm = intelRemoveFavCat(INTEL_FAV_CATS_DEFAULT, "market");
  ok(rm.cats.length === 4 && rm.reassignTo && rm.reassignTo !== "market", "删除后返回剩余分类与重分配目标");
  var rmEmpty = intelRemoveFavCat([], "x");
  ok(rmEmpty.cats.length === INTEL_FAV_CATS_DEFAULT.length, "删空时回退默认集（分类永不空）");
  ok(intelFavCatName(INTEL_FAV_CATS_DEFAULT, "market") === "市场", "已知 id 返回名称");
  ok(intelFavCatName(INTEL_FAV_CATS_DEFAULT, "不存在") === "未分类", "未知 id 回退「未分类」");
  ok(intelFavCatName([], "") === "未分类", "空分类集回退「未分类」");
  var rec = intelMakeFavRec({ id: "n1", title: "t" }, "2026-08-06", "tech");
  ok(rec.catId === "tech" && rec.key === "2026-08-06|n1", "收藏记录含 catId 与稳定 key");
  var tAdd = intelToggleFav([], { id: "n1", title: "t" }, "2026-08-06", "policy");
  ok(tAdd.added === true && tAdd.fav[0].catId === "policy", "toggle 收藏时写入分类");
  var tUpd = intelToggleFav(tAdd.fav, { id: "n1", title: "t" }, "2026-08-06");
  ok(tUpd.added === false && tUpd.fav.length === 0, "再次 toggle 取消收藏");

  section("M. 历史回顾搜索 intelSearchItems");
  var hItems = [
    { id: "h1", category: "official", title: "工业机器人产量超53万套", summary: "智能制造产能扩张", source: "新华网", tags: ["机器人"] },
    { id: "h2", category: "hardware", title: "折叠屏铰链升级", summary: "成本下探", source: "媒体", tags: ["折叠屏"] },
    { id: "h3", category: "hardware", title: "无线充电标准更新", summary: "Qi2 普及", source: "官网", tags: ["无线充电"] }
  ];
  ok(intelSearchItems(hItems, "").length === 3, "空关键词返回全部副本");
  ok(intelSearchItems(null, "x").length === 0, "null 输入安全返回空");
  ok(intelSearchItems(hItems, "折叠屏").length === 1 && intelSearchItems(hItems, "折叠屏")[0].id === "h2", "按标题关键词命中");
  ok(intelSearchItems(hItems, "机器人").length === 1 && intelSearchItems(hItems, "机器人")[0].id === "h1", "按标签关键词命中（tags 参与检索）");
  ok(intelSearchItems(hItems, "新华网").length === 1 && intelSearchItems(hItems, "新华网")[0].id === "h1", "按来源关键词命中");
  ok(intelSearchItems(hItems, "QIXIN").length === 0, "大小写不敏感（英文）");

  section("N. 历史回顾分类筛选 intelFilterItemsByCategory");
  ok(intelFilterItemsByCategory(hItems, "all").length === 3, "all 返回全部副本");
  ok(intelFilterItemsByCategory(hItems, null).length === 3, "null 分类返回全部");
  ok(intelFilterItemsByCategory(hItems, "hardware").length === 2, "按 category key 筛选");
  ok(intelFilterItemsByCategory(hItems, "hardware").every(function (x) { return x.category === "hardware"; }), "筛选结果均为目标分类");
  ok(intelFilterItemsByCategory(hItems, "不存在").length === 0, "未知分类返回空");

  section("O. 收藏分类内搜索 intelSearchFav");
  var favItems = [
    { key: "k1", title: "折叠屏铰链", summary: "成本下探", source: "媒体", tags: ["折叠屏"], catId: "tech" },
    { key: "k2", title: "工业机器人", summary: "产能扩张", source: "新华网", tags: ["机器人"], catId: "market" },
    { key: "k3", title: "无线充电", summary: "Qi2", source: "官网", tags: ["无线"], catId: "tech" }
  ];
  var noComments = {};
  ok(intelSearchFav(favItems, "", noComments).length === 3, "空关键词返回全部副本");
  ok(intelSearchFav(null, "x", noComments).length === 0, "null 输入安全返回空");
  ok(intelSearchFav(favItems, "铰链", noComments).length === 1 && intelSearchFav(favItems, "铰链", noComments)[0].key === "k1", "按标题命中");
  ok(intelSearchFav(favItems, "机器人", noComments).length === 1 && intelSearchFav(favItems, "机器人", noComments)[0].key === "k2", "按标签命中");
  // 评论文本参与检索
  var withComments = { k3: [{ text: "实测比 Qi 快 30%" }, { text: "兼容性一般" }] };
  ok(intelSearchFav(favItems, "兼容性", withComments).length === 1 && intelSearchFav(favItems, "兼容性", withComments)[0].key === "k3", "按评论文本命中（标题/标签无关键词）");
  ok(intelSearchFav(favItems, "不存在词", withComments).length === 0, "无匹配返回空");

  section("P. 自定义情报转存我的情报 customIntelToMyIntel");
  var rNoItems = { id: "c0", title: "整条简报", summary: "无子条目", date: "2026-08-06" };
  var e1 = customIntelToMyIntel(rNoItems);
  ok(e1.length === 1 && e1[0].title === "整条简报" && e1[0].origin === "custom:intel" && e1[0].id, "无子条目时整条作为一条我的情报");
  var rItems = {
    id: "c1", title: "折叠屏趋势", summary: "S", date: "2026-08-06",
    items: [
      { title: "铰链", point: "成本降", source: "媒体", url: "https://x", tags: ["折叠屏"] },
      { title: "UTG", point: "良率升", source: "官网", url: "", tags: ["盖板"] }
    ]
  };
  var e2 = customIntelToMyIntel(rItems);
  ok(e2.length === 2, "每个子条目转为一条我的情报");
  ok(e2[0].title === "铰链" && e2[0].summary === "成本降" && e2[0].source === "媒体" && e2[0].url === "https://x", "子条目字段映射正确");
  ok(e2[0].tags.length === 1 && e2[0].tags[0] === "折叠屏", "标签数组映射");
  ok(e2[0].date === "2026-08-06" && e2[0].origin === "custom:intel" && e2[0].id !== e2[1].id, "日期/来源/唯一 id 正确");
  ok(customIntelToMyIntel(null).length === 1, "null 输入安全返回单条兜底");

  section("R. 市场机会提示词 marketOpportunityPrompt（六维）");
  var mp = marketOpportunityPrompt("折叠屏手机支架", "2026-08-07");
  ok(typeof mp === "string" && mp.indexOf("折叠屏手机支架") > 0, "提示词包含研究市场");
  ["scale", "penetration", "increment", "unmet", "blueocean", "substitution"].forEach(function (d) {
    ok(mp.indexOf('"' + d + '"') > 0, "提示词含维度字段：" + d);
  });
  ok(mp.indexOf("rating") > 0 && mp.indexOf("findings") > 0 && mp.indexOf("suggestions") > 0, "提示词含 rating/findings/suggestions");

  section("S. parseMarketOpportunity 稳健提取");
  var mo = parseMarketOpportunity("前缀 {\"summary\":\"x\",\"rating\":\"高\"} 后缀");
  ok(mo.summary === "x" && mo.rating === "高", "从噪声中提取 JSON");
  var threwMo = false; try { parseMarketOpportunity("无 json"); } catch (e) { threwMo = true; }
  ok(threwMo, "无 JSON 时抛错");

  section("T. buildMarketOpportunityResult 规范化六维");
  var mpj = {
    summary: "S", rating: "中", ratingReason: "R",
    scale: { tam: "100亿", cagr: "15%", segments: [{ name: "支架", size: "60亿", share: "60%", growth: "20%", stage: "成长" }, { name: "" }], drivers: [{ factor: "折叠屏普及", impact: "高" }] },
    penetration: { rate: "30%", ceiling: "80%", space: "50%", stage: "成长期", segments: [{ group: "一线", rate: "45%", gap: "+15%", potential: "中" }] },
    increment: { stock: "", incremental: "40亿", sources: [], scenarios: [{ name: "乐观", assumption: "a", space: "60亿", prob: "40%" }] },
    unmet: { needs: [{ need: "稳固", satisfaction: "中", gap: "中", priority: "高" }], pains: [], trends: [] },
    blueocean: { redsea: { competition: "中等", priceWar: "中", profit: "中", diff: "低" }, canvas: [], opportunities: [{ desc: "摄影族", target: "摄影师", value: "快装", feasibility: "高", score: 4 }] },
    substitution: { direct: [], adjacent: [], opportunities: [] },
    findings: ["F1", "F2", ""], suggestions: ["建议1"], sources: [{ title: "来源A", url: "https://a.com" }]
  };
  var mr = buildMarketOpportunityResult(mpj, { market: "折叠屏手机支架", provider: "gemini", date: "2026-08-07" });
  ok(mr.market === "折叠屏手机支架" && mr.provider === "gemini", "透传 market/provider");
  ok(mr.rating === "中" && mr.ratingReason === "R", "透传 rating/ratingReason");
  ok(mr.dims.scale.segments.length === 1, "过滤无 name 的细分（空字段剔除）");
  ok(mr.dims.scale.tam === "100亿" && mr.dims.scale.segments[0].name === "支架", "市场规模字段映射");
  ok(mr.dims.penetration.rate === "30%" && mr.dims.penetration.segments[0].group === "一线", "渗透率字段映射");
  ok(mr.dims.blueocean.opportunities[0].score === 4, "蓝海评分转数字");
  ok(mr.dims.blueocean.redsea.competition === "中等", "红海竞争强度映射");
  ok(mr.findings.length === 2 && mr.suggestions.length === 1, "findings/suggestions 过滤空串并映射");
  ok(mr.sources.length === 1 && mr.sources[0].url === "https://a.com", "sources 映射");
  ok(typeof mr.id === "string" && mr.id && mr.createdAt, "生成 id 与 createdAt");

  section("U. ensureIndustry 初始化 marketOpp（异常值重置）");
  sandbox.DB.data.marketOpp = "corrupt";
  ensureIndustry();
  ok(Array.isArray(sandbox.DB.data.marketOpp), "marketOpp 容器为数组（异常值被重置）");

  section("V. callLLMForPrompt（stub fetch，不触网）");
  var mockResp = {
    candidates: [{
      content: { parts: [{ text: "```json\n" + JSON.stringify({ summary: "S", rating: "高", scale: { tam: "100亿" }, findings: ["F1"], suggestions: ["A1"], sources: [] }) + "\n```" }] },
      groundingMetadata: { groundingChunks: [{ web: { title: "来源A", uri: "https://a.com" } }] }
    }]
  };
  sandbox.fetch = async function (url, opts) {
    ok(url.indexOf("generativelanguage.googleapis.com") > 0, "[fetch] 请求发往 gemini endpoint");
    var body = JSON.parse(opts.body);
    ok(body.tools && body.tools[0].google_search !== undefined, "[fetch] 自定义提示词请求体携带 google_search 接地");
    return { ok: true, json: async function () { return mockResp; } };
  };
  var mres = await callLLMForPrompt("gemini", "KEY", marketOpportunityPrompt("折叠屏手机支架", "2026-08-07"));
  ok(typeof mres.text === "string" && mres.text.indexOf("summary") > 0, "返回模型文本");
  ok(mres.sources.length === 1 && mres.sources[0].url === "https://a.com", "gemini grounding 来源被提取");
  var mobj = parseMarketOpportunity(mres.text);
  ok(mobj.rating === "高", "自定义提示词路径可端到端解析");
  sandbox.fetch = async function () { return { ok: false, status: 403 }; };
  var merr = false; try { await callLLMForPrompt("gemini", "k", "x"); } catch (e) { merr = true; }
  ok(merr, "HTTP 非 200 时抛错");
  ok(typeof INTEL_PROVIDERS.groq.buildBodyForPrompt === "function" && typeof INTEL_PROVIDERS.openrouter.buildBodyForPrompt === "function", "知识型 provider 也支持 buildBodyForPrompt");

  // ---- 汇总 ----
  console.log("\n========================================");
  console.log("行业情报增强测试：通过 " + pass + " / 失败 " + fail);
  console.log("========================================");
  process.exit(fail ? 1 : 0);
})();
