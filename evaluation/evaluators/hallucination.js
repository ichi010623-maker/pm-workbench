// Consumer Insight Evaluation · Hallucination Detector
// 核心：GT=unknown 时，predicted 给出具体值 → unsupported_inference = true
// 同时检查 predicted 中所有相对原文的"凭空出现"的具体值（数字、时长、价格、地点等）。
"use strict";

var PATTERNS = {
  duration: /(半年|一年|两年|三个月|一周|几天|几个月|\d+个?月|\d+个?年|\d+周|\d+天|\d+小时)/,
  price: /(预算\s*\d+|价格\s*\d+|\d+\s*元|\d+\s*块|\$\d+)/,
  brand: /(iPhone|iPad|小米|华为|三星|OPPO|vivo|苹果|索尼|黑鲨|红魔|Pro\s*Max|iPhone\s*\d+)/i,
  place: /(北京|上海|广州|深圳|杭州|成都|武汉|国外|海外|日本|美国|韩国|欧洲)/
};

function isUnknownish(v) {
  if (v == null) return true;
  var s = String(v).trim().toLowerCase();
  return s === "" || s === "unknown" || s === "n/a" || s === "none";
}

// 字段级 unsupported_inference 检测
function detectFieldHallucinations(gold, predicted) {
  var hits = [];
  if (!gold || !predicted) return hits;
  var FIELDS = ["problem", "scenario", "pain_status", "frequency", "solved_status", "evidence_level", "duration"];
  FIELDS.forEach(function (f) {
    if (isUnknownish(gold[f]) && !isUnknownish(predicted[f])) {
      hits.push({
        field: f,
        gold: gold[f],
        predicted: predicted[f],
        reason: "GT=" + f + "=unknown, predicted=" + String(predicted[f]) + " → 无依据推断"
      });
    }
  });
  return hits;
}

// 文本级"凭空出现"的具体值
function detectUnsupportedTokens(rawText, predicted) {
  if (!rawText || !predicted) return [];
  var hits = [];

  // 从 predicted 中提取可能的具体值（problem, scenario, solution_desc, basis_quote）
  var haystack = [
    predicted.problem, predicted.scenario,
    predicted.solution && predicted.solution.solution_desc,
    predicted.pain && predicted.pain.basis_quote,
    predicted.impact && predicted.impact.basis_quote
  ].filter(function (x) { return x && !isUnknownish(x); }).join("|");

  if (!haystack) return hits;

  Object.keys(PATTERNS).forEach(function (cat) {
    var m = haystack.match(PATTERNS[cat]);
    if (m && rawText.indexOf(m[0]) < 0) {
      hits.push({ category: cat, token: m[0], note: "原文中未出现的具体值" });
    }
  });

  return hits;
}

// 主函数
function detect(gold, predicted, rawText) {
  var hits = [];
  hits = hits.concat(detectFieldHallucinations(gold, predicted || {}));
  hits = hits.concat(detectUnsupportedTokens(rawText, predicted || {}));
  return {
    count: hits.length,
    hits: hits,
    flagged: hits.length > 0
  };
}

module.exports = { detect: detect, detectFieldHallucinations: detectFieldHallucinations, detectUnsupportedTokens: detectUnsupportedTokens };
