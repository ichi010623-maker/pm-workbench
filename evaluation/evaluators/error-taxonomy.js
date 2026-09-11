// Consumer Insight Evaluation · Error Taxonomy (E01-E17)
// 错误优先级（pain.status）：
//   solved < dissatisfied < solution_adopted < seeking_solution
//   < impacted < recurring < experienced < mentioned
// 短词到更强的状态 = overstated_pain（E04）
// 短词到更弱的状态 = understated_pain（E05）
"use strict";

var PAIN_PRIORITY = {
  "solved": 1,
  "dissatisfied": 2,
  "solution_adopted": 3,
  "seeking_solution": 4,
  "impacted": 5,
  "recurring": 6,
  "experienced": 7,
  "mentioned": 8
};

function rank(status) {
  return PAIN_PRIORITY[String(status || "unknown").toLowerCase()] || 99;
}

var TAXONOMY = {
  E01: { id: "E01", name: "WRONG_RELEVANCE",      desc: "relevance 判定错误" },
  E02: { id: "E02", name: "WRONG_PROBLEM",        desc: "problem 字段与原文不一致" },
  E03: { id: "E03", name: "WRONG_SCENARIO",       desc: "scenario 字段与原文不一致" },
  E04: { id: "E04", name: "OVERSTATED_PAIN",      desc: "pain.status 判定过强（弱事实被判为强状态）" },
  E05: { id: "E05", name: "UNDERSTATED_PAIN",     desc: "pain.status 判定过弱（强事实被判为弱状态）" },
  E06: { id: "E06", name: "INVENTED_FREQUENCY",   desc: "frequency 杜撰（无反复措辞被判 recurring）" },
  E07: { id: "E07", name: "INVENTED_DURATION",    desc: "duration 杜撰（GT=unknown 时给出具体时长）" },
  E08: { id: "E08", name: "INVENTED_SOLUTION",    desc: "solution 杜撰（仅提及被当成已采用）" },
  E09: { id: "E09", name: "INVENTED_PURCHASE",    desc: "看到/想被当成已购买" },
  E10: { id: "E10", name: "INVENTED_SWITCH",      desc: "声称切换但未实操" },
  E11: { id: "E11", name: "INVENTED_SOLVED_STATUS", desc: "solved_status 杜撰（购买≠解决）" },
  E12: { id: "E12", name: "EMOTION_AS_PAIN",      desc: "把强烈情绪误解释成高频/强痛点" },
  E13: { id: "E13", name: "MENTION_AS_PAIN",      desc: "提及产品当本人正在使用" },
  E14: { id: "E14", name: "COMMENT_AS_USER",      desc: "把他人/转述当成本人体验" },
  E15: { id: "E15", name: "MISSED_COUNTER_EVIDENCE", desc: "忽略与既有负面相反的证据" },
  E16: { id: "E16", name: "MULTI_PROBLEM_COLLAPSE", desc: "多问题坍缩为单问题" },
  E17: { id: "E17", name: "UNSUPPORTED_INFERENCE", desc: "无原文支撑的推断（其他类）" }
};

function get(id) { return TAXONOMY[id]; }
function all() { return Object.keys(TAXONOMY).map(function (k) { return TAXONOMY[k]; }); }

// 关键分类函数：从 (gold, predicted) 对照中识别错误类型
function classify(gold, predicted) {
  var errs = [];
  if (!gold || !predicted) return errs;

  // E01: relevance
  if (Boolean(gold.relevant) !== Boolean(predicted.relevant)) {
    errs.push(Object.assign({ severity: "high" }, TAXONOMY.E01));
  }

  // E02: problem 错误（仅在 relevant=true 时评估）
  if (gold.relevant && predicted.relevant) {
    if (String(gold.problem || "") !== String(predicted.problem || "")
        && !(gold.problem === "unknown" && (predicted.problem || "unknown") === "unknown")) {
      // 这里只是事实差异，由 field-scorer 给出分数；taxonomy 不再单独标 E02
      // 真正的 E02 是「文本语义严重错位」，留待人工审核
    }
  }

  // E04/E05: pain.status 过强/过弱
  if (gold.relevant && predicted.relevant) {
    var gp = rank(gold.pain_status), pp = rank(predicted.pain_status);
    if (pp < gp && pp < 99) errs.push(Object.assign({ severity: "medium" }, TAXONOMY.E04));
    if (pp > gp && pp < 99) errs.push(Object.assign({ severity: "medium" }, TAXONOMY.E05));
  }

  // E06: INVENTED_FREQUENCY（GT=unknown 时 predicted 给具体值）
  if (String(gold.frequency || "").toLowerCase() === "unknown"
      && predicted.frequency
      && String(predicted.frequency).toLowerCase() !== "unknown") {
    errs.push(Object.assign({ severity: "high" }, TAXONOMY.E06));
  }

  // E11: INVENTED_SOLVED_STATUS（购买≠解决）
  // GT≠solved 时 predicted 断言 solved → E11（购买≠解决的核心场景）
  if (predicted.solution_adopted === true || predicted.solution_adopted === "true") {
    var ss = String(predicted.solved_status || "").toLowerCase();
    var gs = String(gold.solved_status || "").toLowerCase();
    if (ss === "solved" && gs !== "solved") {
      errs.push(Object.assign({ severity: "high" }, TAXONOMY.E11));
    }
  }

  // E08/E09: solution/purchase 杜撰
  if (gold.relevant && predicted.relevant) {
    var ga = String(gold.solution_adopted || "").toLowerCase();
    var pa = String(predicted.solution_adopted || "").toLowerCase();
    if (ga === "false" && (pa === "true")) {
      errs.push(Object.assign({ severity: "high" }, TAXONOMY.E08));
    }
  }

  // E17: UNSUPPORTED_INFERENCE 兜底（任何 predicted 非空但 GT=unknown 且上文未分类）
  var field_pairs = [
    ["problem", gold.problem, predicted.problem],
    ["scenario", gold.scenario, predicted.scenario]
  ];
  field_pairs.forEach(function (fp) {
    var f = fp[0], ge = String(fp[1] || "").toLowerCase(), pe = String(fp[2] || "").toLowerCase();
    if (ge === "unknown" && pe && pe !== "unknown") {
      errs.push(Object.assign({ severity: "high" }, TAXONOMY.E17, { context: { field: f, predicted: fp[2] } }));
    }
  });

  return errs;
}

// 关键词驱动的陷阱分类（基于 raw_text 模式匹配）
function classifyTraps(rawText, gold, predicted) {
  var errs = [];
  if (!rawText || !predicted) return errs;

  // E12 EMOTION_AS_PAIN：raw 包含「要命/烫死/气死」类强情绪，GT pain 不应 overstated
  var emotionPats = /烫得要命|气死|烫死|要疯|受不了|崩溃|疯了/;
  if (emotionPats.test(rawText)) {
    var pp = rank(predicted.pain_status);
    var gp = rank(gold.pain_status || "experienced");
    if (pp < gp && pp < 99) {
      errs.push(Object.assign({ severity: "high" }, TAXONOMY.E12));
    }
  }

  // E13 MENTION_AS_PAIN：包含「听说/听说...」类提及
  if (/听说|听说...|据说/.test(rawText)) {
    var pa = String(predicted.solution_adopted || "").toLowerCase();
    if (pa === "true") errs.push(Object.assign({ severity: "high" }, TAXONOMY.E13));
  }

  // E14 COMMENT_AS_USER：转述
  if (/我同事|我朋友|别人|我家人/.test(rawText)) {
    var pp2 = rank(predicted.pain_status);
    if (pp2 < rank("mentioned")) {
      errs.push(Object.assign({ severity: "high" }, TAXONOMY.E14));
    }
  }

  // E15 MISSED_COUNTER_EVIDENCE：「今天没遇到/一切正常/没什么想吐槽」类反向证据
  // 当 raw 出现反向证据且 predicted pain 不止 mentioned（被过度判为 experienced/recurring 等）
  if (/没遇到|一切正常|没什么想吐槽|没问题|没什么问题|没毛病/.test(rawText)) {
    var pp3 = String(predicted.pain_status || "").toLowerCase();
    if (pp3 !== "mentioned" && pp3 !== "unknown") {
      errs.push(Object.assign({ severity: "high" }, TAXONOMY.E15));
    }
  }

  // E06 INVENTED_FREQUENCY：「今天/今天下午」一次性明确措辞
  if (/^(今天|今早|今天下午|今天晚上)/.test(rawText.trim())) {
    if (String(predicted.frequency || "") === "recurring") {
      errs.push(Object.assign({ severity: "high" }, TAXONOMY.E06));
    }
  }

  // E09 INVENTED_PURCHASE：「看到...想买/想买个」
  if (/看到.*想买|想买个|想买.*推荐|想买.*怎么选/.test(rawText)) {
    var pp4 = String(predicted.solution_adopted || "").toLowerCase();
    if (pp4 === "true") errs.push(Object.assign({ severity: "high" }, TAXONOMY.E09));
  }

  // E10 INVENTED_SWITCH：「再也不想用/再也不/换掉」类声称
  if (/再也不|再也不想|已经不用|弃用/.test(rawText)) {
    var gp5 = String(gold.pain_status || "").toLowerCase();
    if (gp5 !== "solved" && String(predicted.solution_adopted || "").toLowerCase() === "true") {
      errs.push(Object.assign({ severity: "high" }, TAXONOMY.E10));
    }
  }

  // E07 INVENTED_DURATION：「X年了/一年前/X个月」类时长
  if (/年了|一年前|半年|三个月前|两年前/.test(rawText)) {
    if (String(predicted.solved_status || "").toLowerCase() === "solved" && gold.relevant) {
      // 仅在 GT 也允许的情况下做弱报警，避免误报
    }
  }

  return errs;
}

module.exports = {
  TAXONOMY: TAXONOMY,
  all: all,
  get: get,
  classify: classify,
  classifyTraps: classifyTraps,
  rank: rank
};
