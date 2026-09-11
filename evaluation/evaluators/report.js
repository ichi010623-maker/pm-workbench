// Consumer Insight Evaluation · Report Generator
// 输入：50 条 evaluation results；输出 JSON + Markdown 报告。
"use strict";

var path = require("path");
var fs = require("fs");
var taxonomy = require("./error-taxonomy");
var fieldScorer = require("./field-scorer");
var hallucination = require("./hallucination");

function nowIso() { return new Date().toISOString(); }
function timestamp() {
  var d = new Date();
  var pad = function (n) { return String(n).padStart(2, "0"); };
  return d.getFullYear()
    + pad(d.getMonth() + 1)
    + pad(d.getDate())
    + "-" + pad(d.getHours())
    + pad(d.getMinutes())
    + pad(d.getSeconds());
}

// ---------- 聚合 ----------
function aggregate(results) {
  var total = results.length;
  var passed = 0;
  var totalScore = 0;
  var weightTotal = 0;

  var perField = {}; // field -> { correct, total, accuracy }
  Object.keys(fieldScorer.FIELD_WEIGHTS).forEach(function (f) {
    perField[f] = { correct: 0, total: 0, accuracy: 0, weighted_correct: 0, weighted_total: fieldScorer.FIELD_WEIGHTS[f] };
  });

  var errorCounts = {}; // E01-E17 -> count
  Object.keys(taxonomy.TAXONOMY).forEach(function (k) { errorCounts[k] = 0; });

  var hallucinationCount = 0;
  var unknownDisciplineOk = 0;
  var unknownDisciplineTotal = 0;

  results.forEach(function (r) {
    if (r.overall_score >= 0.9) passed++;
    totalScore += r.overall_score;
    weightTotal += 1;

    if (r.field_scores) {
      Object.keys(r.field_scores).forEach(function (f) {
        var fs = r.field_scores[f];
        perField[f].total++;
        perField[f].weighted_total += 0;
        if (fs.score >= 1) perField[f].weighted_correct += fieldScorer.FIELD_WEIGHTS[f];
        if (fs.score >= 0.99) perField[f].correct++;
        // 未知守恒
        if (fs.kind === "unknown_correct" || fs.kind === "exact" || fs.kind === "acceptable") {
          // pass
        }
      });
    }

    // 错误类型
    if (r.errors) {
      r.errors.forEach(function (e) {
        if (errorCounts[e.id] != null) errorCounts[e.id]++;
      });
    }

    // 幻觉
    if (r.hallucination && r.hallucination.flagged) hallucinationCount++;

    // 未知守恒：GT=unknown 时 predicted 也应是 unknown
    var gold = r.expected || {};
    var pred = r.predicted || {};
    Object.keys(fieldScorer.FIELD_WEIGHTS).forEach(function (f) {
      var ge = String(gold[f] || "").toLowerCase();
      var pe = String(pred[f] || "").toLowerCase();
      if (ge === "unknown") {
        unknownDisciplineTotal++;
        if (pe === "unknown" || pe === "") unknownDisciplineOk++;
      }
    });

    // perField 加权计算
  });

  Object.keys(perField).forEach(function (f) {
    perField[f].accuracy = perField[f].total > 0 ? perField[f].correct / perField[f].total : 0;
    perField[f].weighted_accuracy = perField[f].weighted_total > 0
      ? perField[f].weighted_correct / perField[f].weighted_total : 0;
  });

  return {
    overall: {
      total: total,
      passed: passed,
      pass_rate: total > 0 ? passed / total : 0,
      average_score: total > 0 ? totalScore / total : 0
    },
    field_accuracy: perField,
    safety: {
      hallucination_count: hallucinationCount,
      hallucination_rate: total > 0 ? hallucinationCount / total : 0,
      unknown_discipline_correct: unknownDisciplineOk,
      unknown_discipline_total: unknownDisciplineTotal,
      unknown_discipline_rate: unknownDisciplineTotal > 0 ? unknownDisciplineOk / unknownDisciplineTotal : 0
    },
    error_counts: errorCounts
  };
}

// ---------- Top 错误排行 ----------
function topErrors(agg, limit) {
  return Object.keys(agg.error_counts)
    .map(function (id) { return { id: id, name: taxonomy.get(id).name, count: agg.error_counts[id] }; })
    .filter(function (x) { return x.count > 0; })
    .sort(function (a, b) { return b.count - a.count; })
    .slice(0, limit || 10);
}

// ---------- Top Failure Cases ----------
function topFailureCases(results, limit) {
  return results
    .map(function (r) {
      return {
        id: r.id,
        raw_text: r.input && r.input.raw_text,
        expected: r.expected,
        predicted: r.predicted,
        overall_score: r.overall_score,
        errors: r.errors,
        error_summary: (r.errors || []).map(function (e) { return e.id + " " + e.name; }).join(", ")
      };
    })
    .filter(function (r) { return r.overall_score < 0.9; })
    .sort(function (a, b) { return a.overall_score - b.overall_score; })
    .slice(0, limit || 10);
}

// ---------- Prompt Improvement Recommendations ----------
function recommendImprovements(agg, results) {
  var recs = [];
  // 1) E06 INVENTED_FREQUENCY 出现 > 0：要求反复措辞显式
  if (agg.error_counts.E06 > 0) {
    recs.push("Strengthen rule: Recurring requires explicit recurring evidence (e.g., 每次/总是/经常/动不动就/一开就/每次直播). One-time complaints must not be promoted to recurring.");
  }
  // 2) E12 EMOTION_AS_PAIN 出现 > 0
  if (agg.error_counts.E12 > 0) {
    recs.push("Strengthen rule: Emotional intensity does not equal pain intensity. 烫得要命/崩溃 do not justify impacted/recurring unless corroborated by frequency or consequence.");
  }
  // 3) E11 INVENTED_SOLVED_STATUS 出现 > 0
  if (agg.error_counts.E11 > 0) {
    recs.push("Strengthen rule: Solved status must remain unknown unless the user explicitly reports a positive outcome (终于可以/没什么问题/搞定了). Purchase ≠ solved.");
  }
  // 4) E14/E15：转述/反向证据
  if (agg.error_counts.E14 > 0 || agg.error_counts.E15 > 0) {
    recs.push("Strengthen counter-evidence detection: third-party reports (同事/朋友) must not be treated as the user's own experience. Positive counter-evidence (没遇到发热/一切正常) must not be ignored.");
  }
  // 5) E13 MENTION_AS_PAIN
  if (agg.error_counts.E13 > 0) {
    recs.push("Strengthen rule: Mentioning a product (听说/看到推荐) is not equivalent to using it. solution_adopted must require explicit purchase or active use.");
  }
  // 6) E17 通用：unknown 守恒
  if (agg.safety.hallucination_rate > 0.1) {
    recs.push("Strengthen unknown discipline: when the user does not provide a value, the extraction must return 'unknown'. Never fill in numbers/durations/brands that are not in the source text.");
  }
  // 7) 字段短板
  Object.keys(agg.field_accuracy).forEach(function (f) {
    if (agg.field_accuracy[f].accuracy < 0.7) {
      recs.push("Improve '" + f + "' field (current accuracy " + (agg.field_accuracy[f].accuracy * 100).toFixed(1) + "%): add explicit decision rules and examples to the prompt.");
    }
  });
  // 兜底
  if (recs.length === 0) {
    recs.push("All metrics ≥ 90%. Maintain current prompt strength. Continue expanding the ground truth to cover more edge cases.");
  }
  return recs;
}

// ---------- JSON 报告 ----------
function buildJsonReport(meta, results) {
  var agg = aggregate(results);
  return {
    metadata: meta,
    summary: agg,
    top_error_types: topErrors(agg, 17),
    top_failure_cases: topFailureCases(results, 10),
    prompt_recommendations: recommendImprovements(agg, results),
    results: results
  };
}

// ---------- Markdown 报告 ----------
function buildMarkdownReport(jsonReport) {
  var meta = jsonReport.metadata;
  var agg = jsonReport.summary;
  var topErr = jsonReport.top_error_types;
  var topFail = jsonReport.top_failure_cases;
  var recs = jsonReport.prompt_recommendations;

  var lines = [];
  lines.push("# Consumer Insight Extraction Evaluation Report");
  lines.push("");
  lines.push("**Generated**: " + meta.generated_at);
  lines.push("**Provider**: " + meta.provider + (meta.model ? " (" + meta.model + ")" : ""));
  lines.push("**Prompt Version**: " + meta.prompt_version);
  lines.push("**Sample Count**: " + meta.sample_count);
  lines.push("");

  lines.push("## 1. Overall");
  lines.push("");
  lines.push("- **Total Samples**: " + agg.overall.total);
  lines.push("- **Passed (≥ 0.9)**: " + agg.overall.passed + " (" + (agg.overall.pass_rate * 100).toFixed(1) + "%)");
  lines.push("- **Average Score**: " + (agg.overall.average_score * 100).toFixed(1) + "%");
  lines.push("");

  lines.push("## 2. Field Accuracy");
  lines.push("");
  lines.push("| Field | Correct | Total | Accuracy |");
  lines.push("|---|---|---|---|");
  Object.keys(agg.field_accuracy).forEach(function (f) {
    var fa = agg.field_accuracy[f];
    lines.push("| " + f + " | " + fa.correct + " | " + fa.total + " | " + (fa.accuracy * 100).toFixed(1) + "% |");
  });
  lines.push("");

  lines.push("## 3. Safety / Hallucination");
  lines.push("");
  lines.push("- **Hallucination Rate**: " + (agg.safety.hallucination_rate * 100).toFixed(1) + "% (" + agg.safety.hallucination_count + "/" + agg.overall.total + ")");
  lines.push("- **Unknown Discipline**: " + (agg.safety.unknown_discipline_rate * 100).toFixed(1) + "% (" + agg.safety.unknown_discipline_correct + "/" + agg.safety.unknown_discipline_total + " 未知字段被正确保守)");
  lines.push("");

  lines.push("## 4. Top Error Types");
  lines.push("");
  if (topErr.length === 0) {
    lines.push("_No errors detected._");
  } else {
    lines.push("| Rank | Code | Name | Count |");
    lines.push("|---|---|---|---|");
    topErr.forEach(function (e, i) {
      lines.push("| " + (i + 1) + " | " + e.id + " | " + e.name + " | " + e.count + " |");
    });
  }
  lines.push("");

  lines.push("## 5. Top 10 Failure Cases");
  lines.push("");
  if (topFail.length === 0) {
    lines.push("_No failures._");
  } else {
    topFail.forEach(function (f) {
      lines.push("### " + f.id);
      lines.push("");
      lines.push("**Input**: \"" + (f.raw_text || "") + "\"");
      lines.push("");
      lines.push("**Expected**:");
      lines.push("```json");
      lines.push(JSON.stringify(f.expected, null, 2));
      lines.push("```");
      lines.push("");
      lines.push("**Predicted**:");
      lines.push("```json");
      lines.push(JSON.stringify(f.predicted, null, 2));
      lines.push("```");
      lines.push("");
      lines.push("**Errors**: " + (f.error_summary || "_none_"));
      lines.push("");
      lines.push("**Score**: " + (f.overall_score * 100).toFixed(1) + "%");
      lines.push("");
      lines.push("---");
      lines.push("");
    });
  }

  lines.push("## 6. Prompt Improvement Recommendations");
  lines.push("");
  recs.forEach(function (r, i) {
    lines.push((i + 1) + ". " + r);
  });
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("_End of report._");

  return lines.join("\n");
}

function writeReports(meta, results, outputDir) {
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  var jsonReport = buildJsonReport(meta, results);
  var mdReport = buildMarkdownReport(jsonReport);
  var ts = timestamp();
  var jsonPath = path.join(outputDir, "consumer-insight-eval-" + ts + ".json");
  var mdPath = path.join(outputDir, "consumer-insight-eval-" + ts + ".md");
  fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2), "utf8");
  fs.writeFileSync(mdPath, mdReport, "utf8");
  return { jsonPath: jsonPath, mdPath: mdPath, jsonReport: jsonReport };
}

module.exports = {
  aggregate: aggregate,
  topErrors: topErrors,
  topFailureCases: topFailureCases,
  recommendImprovements: recommendImprovements,
  buildJsonReport: buildJsonReport,
  buildMarkdownReport: buildMarkdownReport,
  writeReports: writeReports,
  timestamp: timestamp,
  nowIso: nowIso
};
