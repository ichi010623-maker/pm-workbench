// 需求挖掘（国内公域新媒体需求洞察）自动化测试
// 运行：node tests/demandmine.test.js
// 验证：分类/情绪/可操作性/优先级 · 归一化 · 报告渲染 · 持久化 · 导入数据管线 · 我的产出聚合
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const src = fs.readFileSync(path.join(ROOT, "js", "demandmine.js"), "utf8");
const aioSrc = fs.readFileSync(path.join(ROOT, "js", "aioutputs.js"), "utf8");

const store = {};
const localStorageStub = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};

function fakeEl(value) {
  return { value: value || "", innerHTML: "", classList: { add() {}, remove() {}, contains() { return false; } } };
}
const elMap = {
  "dm-raw": fakeEl("这个支架高度不够，站起来拍不了\n希望能加个补光灯\n太贵了，性价比低\n抖音上好多人在吐槽发热严重\n功能缺失：没有定时关闭\n体验问题：操作太繁琐\n垃圾，后悔买\n一般般，凑合\n建议增加语音控制\n内容少，没意思"),
  "dm-raw-target": fakeEl("桌面美拍站")
};

const sandbox = {
  DB: { _saved: 0, data: { demandReports: [] }, save() { this._saved++; } },
  document: { getElementById: id => elMap[id] || fakeEl(""), createElement: () => fakeEl(""), querySelector: () => null, querySelectorAll: () => [] },
  window: {},
  localStorage: localStorageStub,
  console,
  encodeURIComponent, decodeURIComponent, Math, Date, JSON, Object, Array, String, Number, parseInt, parseFloat, isNaN, Boolean, RegExp,
  escapeHtml: s => (s == null ? "" : String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")),
  uid: () => "id" + Math.random().toString(36).slice(2, 9),
  showToast: () => {},
  showModal: () => {},
  closeModal: () => {},
  renderDemandMine: () => {},
  confirm: () => true,
  INTEL_PROVIDERS: {
    gemini: { label: "Gemini", buildBodyForPrompt: () => ({}) },
    zhipu: { label: "智谱", buildBodyForPrompt: () => ({}) }
  },
  loadAiConfig: () => ({ provider: "gemini", apiKey: "x", webSearch: true }),
  saveAiConfig: () => {}
};
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
vm.runInContext(aioSrc, sandbox);

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error("  ✗ " + msg); } }
function section(name) { console.log("\n▶ " + name); }

(async function () {
  section("分类 / 情绪 / 可操作性");
  ok(sandbox.dmClassify("这个产品没有定时关闭功能") === "功能缺失", "功能缺失识别");
  ok(sandbox.dmClassify("操作太繁琐，反人类") === "体验问题", "体验问题识别");
  ok(sandbox.dmClassify("太贵了，性价比低") === "定价问题", "定价问题识别");
  ok(sandbox.dmClassify("内容少，没意思，烂尾") === "内容问题", "内容问题识别");
  ok(sandbox.dmClassify("不如竞品好用，弃用换到别家") === "竞品对比", "竞品对比识别");
  ok(sandbox.dmSentiment("垃圾，后悔买，坑死") === "强烈", "强烈情绪");
  ok(sandbox.dmSentiment("有点失望，麻烦") === "中等", "中等情绪");
  ok(sandbox.dmSentiment("建议增加语音控制") === "轻微", "轻微情绪");
  ok(sandbox.dmActionability("希望能加个补光灯") === "高", "可操作性强");
  ok(sandbox.dmPriority("高", "强烈", "高") === "P0", "P0 组合");
  ok(sandbox.dmPriority("低", "轻微", "低") === "P3", "P3 组合");
  ok(sandbox.dmFreqLevel(60) === "高" && sandbox.dmFreqLevel(25) === "中" && sandbox.dmFreqLevel(5) === "低", "频次分档");

  section("dmNormalize（AI 模式样本）");
  const parsed = {
    summary: "用户普遍反馈高度不足与发热。",
    estimatedVolume: 1500, highFreqCount: 3, opportunityCount: 4, strongNegPct: 40,
    painPoints: [{ rank: 1, pain: "高度不够", category: "体验问题", freq: "高", emotion: "强烈", voice: "站不起来拍" }],
    matrix: [{ opp: "加高结构", need: "站立拍摄", gap: "无法加长", direction: "多段伸缩", priority: "P0" }],
    details: [{ category: "体验问题", items: [{ name: "高度", freq: "高", emotion: "强烈", action: "高", voice: "站不起来", analysis: "需加高", suggestions: ["短期a", "长期b"], priority: "P0" }] }],
    actions: { quick: ["q1"], mid: ["m1"], research: ["r1"] },
    sources: [{ platform: "小红书", keywords: "美拍站", count: 300, links: ["https://x.com/1"] }]
  };
  const rec = sandbox.dmNormalize(parsed, { mode: "ai", target: "桌面美拍站", type: "physical", typeLabel: "实物需求", timeRange: "近1个月", platforms: ["小红书", "抖音"], provider: "gemini", sources: [{ title: "网页", url: "https://y.com" }] });
  ok(rec.mode === "ai", "mode=ai");
  ok(rec.metrics.total === 1500, "estimatedVolume 写入 total");
  ok(rec.metrics.strongNegPct === 40, "strongNegPct");
  ok(rec.painPoints.length === 1 && rec.painPoints[0].rank === 1, "painPoints 保留");
  ok(rec.matrix.length === 1 && rec.matrix[0].priority === "P0", "matrix 保留");
  ok(rec.sources.length === 2, "sources 含模型联网链接 + 原 sources");

  section("dmRenderReport 渲染关键章节");
  const html = sandbox.dmRenderReport(rec);
  ok(html.indexOf("执行摘要") < 0 && html.indexOf("需求挖掘报告") >= 0 || html.length > 200, "渲染产出内容");
  ok(html.indexOf("Top") >= 0, "含 Top 痛点表");
  ok(html.indexOf("产品机会矩阵") >= 0, "含机会矩阵");
  ok(html.indexOf("详细分析") >= 0, "含详细分析");
  ok(html.indexOf("行动建议") >= 0, "含行动建议");
  ok(html.indexOf("数据来源明细") >= 0, "含数据来源");
  ok(html.indexOf("AI 联网检索") >= 0, "AI 模式透明提示");

  section("持久化：保存 / 收藏 / 删除");
  sandbox.dmSaveReport(rec);
  ok(sandbox.DB.data.demandReports.length === 1, "报告已保存");
  sandbox.dmToggleFav(rec.id);
  ok(sandbox.DB.data.demandReports[0].fav === true, "收藏生效");
  sandbox.dmDeleteReport(rec.id);
  ok(sandbox.DB.data.demandReports.length === 0, "删除生效");

  section("导入数据管线（dmRunImport）");
  sandbox.window.__dmType = "physical";
  sandbox.dmRunImport();
  const rep = sandbox.DB.data.demandReports[0];
  ok(rep && rep.mode === "import", "导入生成 import 模式报告");
  ok(rep.metrics.total === 10, "样本数=10 行");
  ok(rep.painPoints.length > 0 && rep.painPoints.length <= 5, "Top 痛点 1-5 条");
  ok(rep.summary.indexOf("10") >= 0, "摘要含样本量");
  ok(sandbox.dmRenderReport(rep).indexOf("真实导入数据") >= 0, "导入模式提示");

  section("我的产出聚合（AI_OUTPUT_MODULES）");
  ok(sandbox.AI_OUTPUT_MODULES.some(m => m.source === "demand"), "AI_OUTPUT_MODULES 含 demand");
  const hubHtml = sandbox.demandReportHtmlForHub(rep);
  ok(typeof hubHtml === "string" && hubHtml.length > 100, "demandReportHtmlForHub 返回报告");

  console.log("\n=== 需求挖掘测试 SUMMARY: pass=" + pass + " fail=" + fail + " ===");
  process.exit(fail ? 1 : 0);
})();
