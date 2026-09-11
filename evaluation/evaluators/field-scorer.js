// Consumer Insight Evaluation · 字段评分器
// 第一版采用简单评分：exact=1 / acceptable=1 / partial=0.5 / wrong=0 / unknown-correct=1 / unsupported=0
// 对 problem/scenario/solution_type 维护小规模人工语义等价表。
"use strict";

// ---------- 语义等价簇（手工白名单，禁止无限扩展） ----------
var SEMANTIC_GROUPS = [
  // 手机发热
  [["手机发热", "手机发烫", "手机烫", "手机温度过高", "机器发烫", "设备发热", "手机特别热", "手机烫手", "手机发烫", "手机过热"], "phone_hot"],
  // 手机卡顿
  [["手机卡顿", "手机卡", "手机变卡", "手机开始卡", "手机卡死了", "手机卡到", "画面卡顿"], "phone_lag"],
  // 视频拍摄
  [["视频拍摄", "拍视频", "录视频", "录像", "拍 vlog", "拍 vlog"], "video_shoot"],
  // 直播
  [["直播", "开直播"], "live_stream"],
  // 散热方案
  [["散热器", "散热背夹", "散热背板", "散热风扇", "散热贴", "散热方案", "磁吸散热器"], "cooler"],
  // 边充电边拍摄
  [["边充边拍", "边充电边拍", "边充电边拍摄"], "charge_shoot"]
];

// 预编译等价表
var EQUIV = {};
SEMANTIC_GROUPS.forEach(function (g) {
  g[0].forEach(function (term) { EQUIV[term] = g[1]; });
});

function normalize(s) {
  if (s == null) return "";
  return String(s).trim();
}

function canonicalize(term) {
  var t = normalize(term);
  return EQUIV[t] || t;
}

// ---------- 字段评分 ----------
// 返回 { score, kind, reason }
// kind: "exact" | "acceptable" | "partial" | "wrong" | "unknown_correct" | "unsupported"
function scoreStringField(expected, predicted) {
  var e = normalize(expected);
  var p = normalize(predicted);
  // unknown 判定
  if (e.toLowerCase() === "unknown") {
    if (!p || p.toLowerCase() === "unknown" || p === "") {
      return { score: 1, kind: "unknown_correct", reason: "GT=unknown, predicted=unknown → 正确保守" };
    }
    return { score: 0, kind: "unsupported", reason: "GT=unknown, predicted=" + p + " → 无依据推断" };
  }
  // GT 非 unknown
  if (!p || p.toLowerCase() === "unknown") {
    return { score: 0, kind: "wrong", reason: "GT=" + e + ", predicted=unknown → 应当识别但未识别" };
  }
  // 完全相等
  if (e === p) return { score: 1, kind: "exact", reason: "完全匹配" };
  // 语义等价
  if (canonicalize(e) === canonicalize(p)) {
    return { score: 1, kind: "acceptable", reason: "语义等价（" + canonicalize(e) + "）" };
  }
  // 部分匹配：包含关系
  if (p.indexOf(e) >= 0 || e.indexOf(p) >= 0) {
    return { score: 0.5, kind: "partial", reason: "包含但未完全对齐" };
  }
  return { score: 0, kind: "wrong", reason: "GT=" + e + ", predicted=" + p };
}

// boolean 字段：true/false/unknown
function scoreBoolField(expected, predicted) {
  // 规范化字符串 true/false/unknown
  var e = String(expected).toLowerCase();
  var p = String(predicted).toLowerCase();
  if (e === "unknown") {
    if (p === "unknown" || p === "" || p === "null") return { score: 1, kind: "unknown_correct", reason: "GT=unknown, predicted=unknown" };
    return { score: 0, kind: "unsupported", reason: "GT=unknown, predicted=" + p + " → 杜撰" };
  }
  if (e === p) return { score: 1, kind: "exact", reason: "完全匹配" };
  // 不一致：true/false 互转 = wrong
  if ((e === "true" && p === "false") || (e === "false" && p === "true")) {
    return { score: 0, kind: "wrong", reason: "true/false 互转" };
  }
  if (p === "unknown") return { score: 0, kind: "wrong", reason: "GT=" + e + ", predicted=unknown" };
  return { score: 0, kind: "wrong", reason: "GT=" + e + ", predicted=" + p };
}

// 枚举字段
function scoreEnumField(expected, predicted, allowedValues) {
  var e = normalize(expected);
  var p = normalize(predicted);
  if (e.toLowerCase() === "unknown") {
    if (!p || p.toLowerCase() === "unknown" || p === "") {
      return { score: 1, kind: "unknown_correct", reason: "GT=unknown, predicted=unknown" };
    }
    return { score: 0, kind: "unsupported", reason: "GT=unknown, predicted=" + p + " → 无依据推断" };
  }
  if (!p || p.toLowerCase() === "unknown") {
    return { score: 0, kind: "wrong", reason: "GT=" + e + ", predicted=unknown" };
  }
  if (e === p) return { score: 1, kind: "exact", reason: "完全匹配" };
  if (allowedValues && allowedValues.indexOf(p) < 0) {
    return { score: 0, kind: "wrong", reason: "predicted=" + p + " 不在允许值集" };
  }
  return { score: 0, kind: "wrong", reason: "GT=" + e + ", predicted=" + p };
}

// relevant 是 boolean
function scoreRelevant(expected, predicted) {
  return scoreBoolField(expected, predicted);
}

var ALLOWED = {
  pain_status: ["mentioned", "experienced", "recurring", "impacted", "seeking_solution", "solution_adopted", "dissatisfied", "solved"],
  frequency: ["once", "low", "recurring", "unknown"],
  solved_status: ["solved", "not_solved", "partial", "unknown"],
  evidence_level: ["E1", "E2", "E3", "E4", "E5", "E6"]
};

var FIELD_WEIGHTS = {
  relevant: 1.0,
  problem: 1.2,
  scenario: 0.8,
  pain_status: 1.5,
  frequency: 1.2,
  solution_adopted: 1.0,
  solved_status: 1.3,
  evidence_level: 1.0
};

function scoreField(field, expected, predicted) {
  switch (field) {
    case "relevant":
    case "solution_adopted":
      return scoreBoolField(expected, predicted);
    case "problem":
    case "scenario":
      return scoreStringField(expected, predicted);
    case "pain_status":
    case "frequency":
    case "solved_status":
    case "evidence_level":
      return scoreEnumField(expected, predicted, ALLOWED[field]);
    default:
      return { score: 0, kind: "wrong", reason: "未知字段: " + field };
  }
}

function scoreAll(gold, predicted) {
  var out = { fields: {}, total: 0, weightTotal: 0 };
  Object.keys(FIELD_WEIGHTS).forEach(function (f) {
    var w = FIELD_WEIGHTS[f];
    var e = gold[f];
    var p = predicted && predicted[f] != null ? predicted[f] : "unknown";
    var s = scoreField(f, e, p);
    out.fields[f] = Object.assign({ expected: e, predicted: p }, s, { weight: w });
    out.total += s.score * w;
    out.weightTotal += w;
  });
  out.accuracy = out.weightTotal > 0 ? out.total / out.weightTotal : 0;
  return out;
}

module.exports = {
  scoreField: scoreField,
  scoreAll: scoreAll,
  normalize: normalize,
  canonicalize: canonicalize,
  EQUIV: EQUIV,
  FIELD_WEIGHTS: FIELD_WEIGHTS,
  ALLOWED: ALLOWED
};
