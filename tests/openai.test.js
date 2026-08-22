// 测试：OpenAI ChatGPT 联网搜索 provider + 🌐 下拉标记 + Gemini 候选模型清单净化
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const code = fs.readFileSync(path.join(__dirname, "..", "js", "intel.js"), "utf8");
const sandbox = { console, setTimeout, fetch: undefined, module: {}, exports: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const INTEL_PROVIDERS = sandbox.INTEL_PROVIDERS;
const intelProvBadge = sandbox.intelProvBadge;

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error("  ✗ " + msg); } }

// A. openai provider 结构
const oa = INTEL_PROVIDERS.openai;
ok(!!oa, "openai provider 应存在");
ok(oa && oa.search === true, "openai.search 应为 true（联网）");
ok(oa && /api\.openai\.com/.test(oa.endpoint), "openai.endpoint 指向 api.openai.com");
const oaBody = oa && oa.buildBodyForPrompt("测试提示词", "2026-08-08");
ok(oaBody && oaBody.model === "gpt-5-search-api", "openai buildBodyForPrompt 应使用 gpt-5-search-api 搜索模型");
ok(oaBody && Array.isArray(oaBody.messages) && oaBody.messages.length === 2, "openai 请求体含 system+user 两条消息");

// B. 🌐 标记
ok(intelProvBadge("openai") === " 🌐", "openai 应带 🌐 标记");
ok(intelProvBadge("gemini") === " 🌐", "gemini 应带 🌐 标记");
ok(intelProvBadge("zhipu") === " 🌐", "zhipu（已启用联网）应带 🌐 标记");
ok(intelProvBadge("perplexity") === " 🌐", "perplexity 应带 🌐 标记");
ok(intelProvBadge("groq") === "", "groq（无联网）不应带 🌐 标记");
ok(intelProvBadge("siliconflow") === "", "siliconflow（无联网）不应带 🌐 标记");

// C. openai.parse 解析 url_citation 来源
const d = {
  choices: [{
    message: {
      content: "根据最新报道 [1]……",
      annotations: [{ type: "url_citation", url: "https://news.example.com/a", title: "Example News A" }]
    }
  }]
};
const pr = oa.parse(d);
ok(pr.text && pr.text.indexOf("最新报道") >= 0, "openai.parse 应返回正文文本");
ok(pr.sources.length === 1, "openai.parse 应解析出 1 条来源");
ok(pr.sources[0].url === "https://news.example.com/a", "来源 url 应正确");
ok(pr.sources[0].title === "Example News A", "来源 title 应正确");

// D. Gemini 候选模型净化（移除无效 -latest，保留真实 GA/Preview）
const gem = INTEL_PROVIDERS.gemini;
const m = gem.models;
ok(Array.isArray(m) && m.length > 0, "gemini.models 应为非空数组");
ok(m.indexOf("gemini-2.5-flash") >= 0, "应保留 gemini-2.5-flash (GA)");
ok(m.indexOf("gemini-3.6-flash") >= 0, "应保留 gemini-3.6-flash (GA)");
ok(m.indexOf("gemini-3.5-flash") >= 0, "应保留 gemini-3.5-flash (GA)");
ok(m.indexOf("gemini-2.5-pro") >= 0, "应保留 gemini-2.5-pro (GA)");
ok(m.indexOf("gemini-3-flash-preview") >= 0, "应保留 gemini-3-flash-preview (Preview)");
ok(m.every(function (x) { return x.indexOf("-latest") < 0; }), "不应含无效的 *-latest 端点串");
ok(m.indexOf("gemini-2.0-flash") < 0, "不应含已退役的 gemini-2.0-flash");
ok(m.indexOf("gemini-1.5-flash") < 0, "不应含已退役的 gemini-1.5-flash");

console.log("openai/badge/gemini 测试：通过 " + pass + " / 失败 " + fail);
process.exit(fail ? 1 : 0);
