// Consumer Insight Evaluation · Mock Provider
// 完全确定性：不联网、无随机、无时间依赖，用于单元测试和 CI。
// 通过 fixture ID 提取预置 extraction，若 ID 未注册则回退到通用 mentioned 模板。
"use strict";

var path = require("path");
var fs = require("fs");
var base = require("./base");

// 加载 mock 预测：fixtures/mock-predictions.json
// 文件格式：{ _meta, predictions: { "T01": {extraction}, ... } }
function loadPredictions() {
  var fp = path.join(__dirname, "..", "fixtures", "mock-predictions.json");
  try {
    var data = JSON.parse(fs.readFileSync(fp, "utf8"));
    return (data && data.predictions) || {};
  } catch (e) {
    return {};
  }
}

var PREDICTIONS = loadPredictions();

// 通用 fallback：所有字段 unknown / mentioned（最保守默认）
function fallbackExtraction() {
  return {
    persona: { segment_hints: [], experience_with_product: "unknown", role_hint: "unknown" },
    scene: { time: "unknown", place: "unknown", activity: "unknown", trigger: "unknown", frequency: "unknown" },
    problem: { core: "unknown", symptoms: [] },
    pain: { status: "mentioned", basis_quote: "unknown" },
    impact: { task_blocked: "unknown", abandoned_activity: "unknown", behavior_change: "unknown", basis_quote: "unknown" },
    solution: { solution_adopted: "unknown", solution_desc: "unknown", purchase_signal: "unknown", solved_status: "unknown", satisfaction: "unknown" },
    emotion: { labels: [], intensity: "unknown" },
    evidence: { level: "E1", reason: "Mock fallback" },
    unknowns: ["problem.*", "scene.*", "persona.*", "impact.*", "solution.*"],
    quotes: []
  };
}

// 深合并：partial + fallback → 完整 extraction
// 但 partial 中的 "unknown" 字符串也覆盖 fallback（语义对齐）
function deepMerge(base, patch) {
  if (patch == null) return base;
  if (typeof base !== "object" || base === null || Array.isArray(base)) return patch;
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) return patch;
  var out = {};
  Object.keys(base).forEach(function (k) { out[k] = base[k]; });
  Object.keys(patch).forEach(function (k) {
    if (patch[k] != null && typeof patch[k] === "object" && !Array.isArray(patch[k])
        && typeof base[k] === "object" && base[k] !== null && !Array.isArray(base[k])) {
      out[k] = deepMerge(base[k], patch[k]);
    } else {
      out[k] = patch[k];
    }
  });
  return out;
}

function MockProvider(opts) {
  this.id = "mock";
  this.name = "Mock Provider (deterministic, no network)";
  this.opts = opts || {};
  this.model = "mock-v1";
}

// complete() 同步返回，模拟 latency=0。
MockProvider.prototype.complete = function (systemPrompt, userPrompt, opts) {
  var o = opts || {};
  // 从 opts.sampleId 取出对应 prediction
  var sid = o.sampleId || "";
  var partial = PREDICTIONS[sid] || {};
  // 移除 _note（仅作内部说明用，不传给 extraction）
  var cleanPartial = {};
  Object.keys(partial).forEach(function (k) { if (k.indexOf("_") !== 0) cleanPartial[k] = partial[k]; });
  var ext = deepMerge(fallbackExtraction(), cleanPartial);
  return Promise.resolve(base.okResult(
    "mock",
    JSON.stringify(ext),
    this.model,
    0,
    { source: "mock-predictions", sampleId: sid }
  ));
};

MockProvider.prototype.health = function () {
  return { ok: true, provider: this.id, model: this.model, requiresNetwork: false };
};

module.exports = MockProvider;
