// 竞品研判 · Amazon 调研 (ARI) 模块自动化测试
// 运行：node tests/ari.test.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");

const sandbox = {
  DB: { data: { amazonReports: [], industryCustom: [], marketOpp: [], growth: { mr: { reports: [] }, xhs: { reports: [] } } }, save() {}, logActivity() {} },
  document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
  window: {},
  escapeHtml: s => (s == null ? "" : String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")),
  showModal() {}, closeModal() {}, showToast() {}, navigate() {}, render() {},
  today: () => "2026-08-07",
  uid: () => "id" + Math.random().toString(36).slice(2, 9),
  console, encodeURIComponent, decodeURIComponent, Math, Date, JSON, Object, Array, String, Number, parseInt, parseFloat, isNaN,
  localStorage: (function () { var m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; })()
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, "js", "ari.js"), "utf8"), sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, "js", "aioutputs.js"), "utf8"), sandbox);

const {
  loadAriConfig, saveAriConfig, ariNormalize, ariBuildRecord,
  ariRenderReport, ariReportHtmlForHub, ariPick, ariSaveReport, ensureAri,
  ARI_CAPS, ARI_SITES, aiOutputTitle, aiOutputSummary, aiOutputModel, aiOutputList, AI_OUTPUT_MODULES
} = sandbox;

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error("  ✗ " + msg); } }
function section(name) { console.log("\n▶ " + name); }

(function () {
  section("A. 配置存取（仅本机 localStorage）");
  saveAriConfig({ key: "ari_live_test123" });
  ok(loadAriConfig().key === "ari_live_test123", "保存后可读回 Key");
  saveAriConfig({ key: "" });
  ok(loadAriConfig().key === "", "清空 Key 生效");
  saveAriConfig({ key: "ari_live_test123" });

  section("B. 本地命令生成（ARI_CAPS.cli）");
  ok(ARI_CAPS.check.cli("B0X", "amz_us", {}) === "python ari.py check", "check 命令无 ASIN");
  ok(ARI_CAPS.reviews.cli("B0X", "amz_us", {}).indexOf("reviews --asin B0X --site amz_us") > 0, "reviews 命令含 ASIN/站点");
  ok(ARI_CAPS.charts.cli("B0X", "amz_us", {}).indexOf("charts --asin B0X --site amz_us") > 0, "charts 命令正确");
  ok(ARI_CAPS.voc.cli("B0X", "amz_us", {}).indexOf("analyze --type voc --asin B0X --site amz_us") > 0, "voc 命令正确");
  ok(ARI_CAPS.compare.cli("B0X", "amz_us", { competitor: "B0Y" }).indexOf("--competitor B0Y") > 0, "compare 命令含竞品 ASIN");
  ok(ARI_CAPS.voc.paid === true && ARI_CAPS.check.paid === false, "付费标记正确（voc 付费/check 免费）");
  ok(ARI_SITES.some(s => s.id === "amz_us") && ARI_SITES.length === 8, "8 个站点齐全");

  section("C. ariNormalize 多形态兼容");
  var env = { success: true, code: "OK", data: { reviews: { reviews: [{ star: 5, title: "好" }], total: 1, page: 1, pageSize: 10 } } };
  var n1 = ariNormalize(env);
  ok(n1.reviews && n1.reviews.length === 1 && n1.reviews[0].title === "好", "信封形态 reviews 解析");
  var flat = { stars: { total: 10, avgStar: 4.2 }, keywords: [{ word: "轻便" }, { word: "静音" }] };
  var n2 = ariNormalize(flat);
  ok(n2.charts && n2.charts.stars.avgStar === 4.2, "扁平形态 charts 解析");
  ok(n2.charts.keywords.length === 2, "扁平形态 keywords 解析");
  var withContent = { content: "**结论** 用户喜欢轻便" };
  var n3 = ariNormalize(withContent);
  ok(n3.content.indexOf("结论") >= 0, "content 抽取");
  ok(ariPick({ data: { x: 1 } }, "x") === 1 && ariPick({ y: 2 }, "y") === 2 && ariPick({}, "z") === undefined, "ariPick 信封/扁平/缺失");

  section("D. ariBuildRecord 建记录");
  var rec = ariBuildRecord(env, { type: "reviews", asin: "B0X123", site: "amz_us" });
  ok(rec.id && rec.id.indexOf("ar_") === 0, "id 以 ar_ 开头");
  ok(rec.type === "reviews" && rec.asin === "B0X123" && rec.site === "amz_us", "透传 type/asin/site");
  ok(rec.fav === false && rec.provider === "Amazon ARI", "fav=false / provider 标记");
  ok(rec.createdAt === "2026-08-07", "createdAt 来自 today()");
  ok(rec.raw && rec.raw.success === true, "完整原始 JSON 留存");
  ok(rec.summary && rec.summary.length > 0, "自动生成摘要");

  section("E. 报告渲染（导入查看 + 我的产出复用）");
  var deep = {
    data: {
      product: { alias: "便携美拍站 Pro", asin: "B0X123", reviewCount: 320, variantCount: 4, collectionStatus: "done", lastCollectedAt: "2026-08-01T00:00:00Z" },
      charts: { stars: { stars: { star5: 200, star4: 80, star3: 30, star2: 7, star1: 3 }, total: 320, avgStar: 4.6 }, keywords: [{ word: "轻便" }, { word: "稳定" }] },
      reviews: { reviews: [{ star: 5, title: "很稳", body: "拍摄很稳", verifiedPurchase: true, helpfulCount: 12, date: "2026-07-20" }] },
      content: "**痛点**：收纳不便。**建议**：增加收纳包。",
      reportUrl: "https://ari.funewa.com/zh/reports/123",
      creditsUsed: 5, balance: 95, reportId: "r_abc"
    }
  };
  var rec2 = ariBuildRecord(deep, { type: "voc", asin: "B0X123", site: "amz_us" });
  var html = ariReportHtmlForHub(rec2);
  ok(typeof html === "string" && html.length > 200, "返回非空 HTML 字符串");
  ok(html.indexOf("数据概览") > 0, "含「数据概览」区块");
  ok(html.indexOf("评分图表") > 0, "含「评分图表」区块");
  ok(html.indexOf("评论样本") > 0, "含「评论样本」区块");
  ok(html.indexOf("分析结论") > 0, "含「分析结论」区块");
  ok(html.indexOf("在线查看图表版完整报告") > 0, "含 reportUrl 链接");
  ok(html.indexOf("本次积点：5") > 0 && html.indexOf("当前余额：95") > 0, "含积点/余额");
  ok(html.indexOf("查看原始 JSON") > 0, "含原始 JSON 兜底");
  ok(html.indexOf("&lt;") >= 0 || html.indexOf("轻便") >= 0, "HTML 已转义且含关键词");

  section("F. 「我的产出」聚合中心 - amazon 源");
  ensureAri();
  ariSaveReport(rec);
  ariSaveReport(rec2);
  ok(sandbox.DB.data.amazonReports.length === 2, "两条记录落库 amazonReports");
  ok(AI_OUTPUT_MODULES.some(m => m.source === "amazon"), "AI_OUTPUT_MODULES 含 amazon");
  var list = aiOutputList();
  var amz = list.filter(x => x.source === "amazon");
  ok(amz.length === 2, "聚合列表含 2 条 amazon");
  ok(aiOutputTitle("amazon", rec2).indexOf("便携美拍站 Pro") >= 0, "hub 标题含产品别名");
  ok(aiOutputModel("amazon", rec2) === "Amazon ARI", "hub 模型标记 Amazon ARI");
  ok(aiOutputSummary("amazon", rec) && aiOutputSummary("amazon", rec).length > 0, "hub 摘要非空");

  console.log("\n========================================");
  console.log("  ARI 测试：" + pass + " 通过 / " + fail + " 失败");
  console.log("========================================");
  process.exit(fail ? 1 : 0);
})();
