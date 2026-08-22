const fs = require("fs");
const vm = require("vm");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "js", "mr.js"), "utf8");

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const sandbox = {
  console,
  escapeHtml,
  window: {},
  document: { getElementById: () => null },
  localStorage: { getItem: () => null, setItem: () => {} },
  DB: { data: { growth: { mr: { history: [], reports: [] } } }, save() {} },
  today: () => "2026-08-07",
  uid: () => "u" + Math.random().toString(36).slice(2, 8),
  loadAiConfig: () => ({ apiKey: "x", provider: "gemini" }),
  saveAiConfig: () => {},
  callLLMForPrompt: async () => ({ text: "{}", sources: [] }),
  parseIntelLLM: (t) => JSON.parse(t),
  showToast: () => {},
  showModal: () => {},
  render: () => {},
};
sandbox.DB.logActivity = () => {};
vm.createContext(sandbox);
vm.runInContext(src, sandbox);

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name); } }

// 1. prompt 含九大维度
const prompt = sandbox.mrBuildPrompt("便携美容仪", "立项论证", "中国", "管理层");
["summary", "rating", "pest", "overview", "chain", "supplyDemand", "competition", "users", "channel", "priceProfit", "trends", "sources", "便携美容仪", "立项论证"].forEach((k) =>
  ok("prompt contains " + k, prompt.indexOf(k) >= 0)
);

// 2. 工具函数
ok("mrArr filters empty", JSON.stringify(sandbox.mrArr(["a", "", null, "b"])) === JSON.stringify(["a", "b"]));
ok("mrStr fallback", sandbox.mrStr(null, "x") === "x");
ok("rating green", sandbox.mrRatingClass("高") === "mr-badge mr-badge-green");
ok("rating orange", sandbox.mrRatingClass("中") === "mr-badge mr-badge-orange");
ok("rating red", sandbox.mrRatingClass("低") === "mr-badge mr-badge-red");
ok("priority high", sandbox.mrPriorityFromRating("高") === "high");
ok("priority low", sandbox.mrPriorityFromRating("低") === "low");
ok("priority default", sandbox.mrPriorityFromRating("?") === "medium");

// 3. 报告渲染
const parsed = {
  summary: "测试摘要", rating: "高", ratingReason: "理由",
  pest: { policy: ["p1"], economy: ["e1"], society: ["s1"], technology: ["t1"] },
  overview: { definition: "定义", lifecycle: "成长", scale: "100亿", cagr: "15%", forecast: "200亿", drivers: ["d1"], constraints: ["c1"], pains: ["pain1"] },
  chain: { upstream: ["u1"], midstream: ["m1"], downstream: ["d1"], value: "价值" },
  supplyDemand: { supply: ["sup1"], demand: ["dem1"], match: "紧平衡" },
  competition: { concentration: "CR3 60%", players: [{ name: "A", position: "头部", price: "高", channel: "线上", strength: "品牌", weakness: "贵" }], forces: "壁垒高" },
  users: { profile: ["18-35"], needs: ["n1"], behavior: ["b1"], pains: ["up1"] },
  channel: { types: ["线上"], structure: "分销", trend: "直播" },
  priceProfit: { priceBands: ["高端"], cost: "BOM", grossMargin: "40%", model: "直销", ceiling: "高" },
  trends: { future: ["f1"], opportunities: [{ desc: "机会1", target: "摄影人群", value: "便携", feasibility: "高", score: 85 }], risks: ["r1"], suggestions: ["建议1"] },
  sources: [{ title: "来源1", url: "https://x.com" }]
};
const meta = { market: "便携美容仪", date: "2026-08-07", provider: "gemini" };
const html = sandbox.mrReportBodyHtml({ parsed, meta, sources: parsed.sources });
[
  "宏观环境", "行业整体规模", "产业链", "市场供需", "竞争格局", "用户画像", "渠道结构", "价格体系", "发展趋势",
  "便携美容仪", "高 机会", "理由", "A", "机会1", "https://x.com", "紧平衡", "CR3 60%", "品牌", "贵"
].forEach((k) => ok("report contains " + k, html.indexOf(k) >= 0));
ok("report is non-empty string", typeof html === "string" && html.length > 500);

// 4. 原始文本兜底
const raw = sandbox.mrReportBodyHtml({ parsed: { _raw: "模型乱码" }, meta: {}, sources: [] });
ok("raw fallback shows text", raw.indexOf("模型乱码") >= 0 && raw.indexOf("mr-raw") >= 0);

console.log("\n=== mr.js smoke test: " + pass + " passed, " + fail + " failed ===");
process.exit(fail ? 1 : 0);
