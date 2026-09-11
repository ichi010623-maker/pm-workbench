// Consumer Insight Evaluation Harness 自测
// 验证：
//   1. Mock provider 完全确定性（不联网、可重复）
//   2. Field scorer 评分正确（含 unknown 守恒、语义等价、partial）
//   3. Error Taxonomy 正确分类 17 种错误
//   4. Hallucination detector 捕获 GT=unknown 时的杜撰
//   5. Report 聚合正确（overall / field accuracy / top errors）
//   6. Runner CLI 参数解析正常
//   7. Ground Truth 50 条样本全部 required 字段齐全
"use strict";

var fs = require("fs");
var path = require("path");

var pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + msg); } }
function section(t) { console.log("\n▶ " + t); }

var EVAL_DIR = path.resolve(__dirname, "..", "evaluation");

// ---------- A. Mock Provider 确定性 + 不联网 ----------
section("A. Mock Provider 确定性");
var MockP = require(path.join(EVAL_DIR, "providers", "mock.js"));
var mock = new MockP();
ok(!mock.health().requiresNetwork, "Mock 不需要联网");
ok(mock.health().ok === true, "Mock health OK");
mock.complete("sys", "user", { sampleId: "T01" }).then(function (r1) {
  mock.complete("sys", "user", { sampleId: "T01" }).then(function (r2) {
    ok(r1.text === r2.text, "Mock 同 sampleId 输出稳定（同输入两次完全一致）");
    ok(JSON.parse(r1.text).evidence.level === "E2", "T01 evidence.level=E2");

    // 未注册的 ID 应回退
    return mock.complete("sys", "user", { sampleId: "T999" });
  }).then(function (r) {
    var ext = JSON.parse(r.text);
    ok(ext.evidence.level === "E1", "未知 sampleId 回退到 E1 fallback");
  });
});

// ---------- B. Provider Registry ----------
section("B. Provider Registry");
var registry = require(path.join(EVAL_DIR, "providers", "index.js"));
var list = registry.listProviders();
ok(list.length === 3, "注册了 3 个 provider");
ok(list.filter(function (p) { return p.id === "mock"; }).length === 1, "含 mock");
ok(list.filter(function (p) { return p.id === "zhipu"; }).length === 1, "含 zhipu");
ok(list.filter(function (p) { return p.id === "openai"; }).length === 1, "含 openai");
ok(list.filter(function (p) { return !p.requiresNetwork; }).length === 1, "仅 mock 不联网");

// ---------- C. Field Scorer ----------
section("C. Field Scorer");
var fs2 = require(path.join(EVAL_DIR, "evaluators/field-scorer.js"));
ok(fs2.scoreField("pain_status", "recurring", "recurring").score === 1, "exact=1");
ok(fs2.scoreField("pain_status", "recurring", "impacted").score === 0, "wrong=0");
ok(fs2.scoreField("frequency", "unknown", "unknown").score === 1, "unknown_correct=1");
ok(fs2.scoreField("frequency", "unknown", "recurring").score === 0, "unsupported=0");
ok(fs2.scoreField("frequency", "unknown", "recurring").kind === "unsupported", "unsupported 类型标记");
ok(fs2.scoreField("problem", "手机发热", "手机发烫").score === 1, "语义等价");
ok(fs2.scoreField("problem", "手机发热", "手机发烫").kind === "acceptable", "语义等价 kind");
ok(fs2.scoreField("problem", "手机过热导致掉帧", "手机过热").score === 0.5, "partial=0.5");
ok(fs2.scoreField("relevant", false, true).score === 0, "relevant true/false 互转 = 0");
ok(fs2.scoreField("evidence_level", "E3", "E3").score === 1, "E3 exact=1");
ok(fs2.scoreField("evidence_level", "E9", "E3").score === 0, "非法枚举值=0");

// ---------- D. Error Taxonomy 17 类齐全 + 关键 trap 命中 ----------
section("D. Error Taxonomy");
var tax = require(path.join(EVAL_DIR, "evaluators/error-taxonomy.js"));
ok(tax.all().length === 17, "E01-E17 共 17 类");
ok(tax.get("E06").name === "INVENTED_FREQUENCY", "E06 命名");
ok(tax.get("E11").name === "INVENTED_SOLVED_STATUS", "E11 命名");
ok(tax.get("E12").name === "EMOTION_AS_PAIN", "E12 命名");
ok(tax.get("E15").name === "MISSED_COUNTER_EVIDENCE", "E15 命名");

// E04 overstated_pain
var e4 = tax.classify(
  { relevant: true, pain_status: "experienced" },
  { relevant: true, pain_status: "recurring" }
);
ok(e4.some(function (e) { return e.id === "E04"; }), "E04 命中：experienced → recurring");

// E05 understated_pain
var e5 = tax.classify(
  { relevant: true, pain_status: "impacted" },
  { relevant: true, pain_status: "experienced" }
);
ok(e5.some(function (e) { return e.id === "E05"; }), "E05 命中：impacted → experienced");

// E06 invented_frequency
var e6 = tax.classify(
  { relevant: true, frequency: "unknown" },
  { relevant: true, frequency: "recurring" }
);
ok(e6.some(function (e) { return e.id === "E06"; }), "E06 命中：GT=unknown → recurring");

// E11 invented_solved
var e11 = tax.classify(
  { relevant: true, solution_adopted: true, solved_status: "unknown" },
  { relevant: true, solution_adopted: true, solved_status: "solved" }
);
ok(e11.some(function (e) { return e.id === "E11"; }), "E11 命中：购买=解决（错误）");

// Trap: emotion-as-pain
var trap12 = tax.classifyTraps(
  "烫得要命！不过我一年也就拍一次长视频。",
  { relevant: true, pain_status: "experienced" },
  { relevant: true, pain_status: "impacted" }
);
ok(trap12.some(function (e) { return e.id === "E12"; }), "E12 命中：「烫得要命」+ impacted");

// Trap: mention-as-pain（听说）
var trap13 = tax.classifyTraps(
  "听说这个散热器挺好用的，但我没用过。",
  { relevant: true, solution_adopted: false },
  { relevant: true, solution_adopted: true }
);
ok(trap13.some(function (e) { return e.id === "E13"; }), "E13 命中：「听说」+ adopted=true");

// Trap: missed_counter_evidence
var trap15 = tax.classifyTraps(
  "今天拍 vlog 一切正常，没什么想吐槽的。",
  { relevant: true, pain_status: "mentioned" },
  { relevant: true, pain_status: "experienced" }
);
ok(trap15.some(function (e) { return e.id === "E15"; }), "E15 命中：「一切正常」+ experienced");

// ---------- E. Hallucination Detector ----------
section("E. Hallucination Detector");
var hal = require(path.join(EVAL_DIR, "evaluators/hallucination.js"));
var h1 = hal.detect(
  { problem: "unknown", scenario: "unknown" },
  { problem: "手机过热", scenario: "户外" },
  "今天拍视频手机有点烫。"
);
ok(h1.flagged === true, "Field 杜撰命中");
ok(h1.hits.length === 2, "杜撰计数=2");

var h2 = hal.detect(
  { problem: "手机发热", solved_status: "unknown" },
  { problem: "手机发热", solved_status: "unknown" },
  "拍视频手机热"
);
ok(h2.flagged === false, "完全合法 → 不命中");

var h3 = hal.detect(
  { duration: "unknown" },
  { duration: "半年" },
  "手机很烫"
);
ok(h3.flagged === true, "时长杜撰命中");

// ---------- F. Ground Truth 完整性 ----------
section("F. Ground Truth 完整性");
var fixture = JSON.parse(fs.readFileSync(path.join(EVAL_DIR, "fixtures", "consumer-insight-ground-truth.json"), "utf8"));
ok(fixture.samples.length === 50, "50 条样本");
ok(fixture._meta.version === "v1", "_meta.version=v1");
ok(fixture._meta.field_definitions.pain_status !== undefined, "字段定义完整");

var REQUIRED_FIELDS = ["relevant", "problem", "scenario", "pain_status", "frequency", "solution_adopted", "solved_status", "evidence_level"];
var allComplete = fixture.samples.every(function (s) {
  return REQUIRED_FIELDS.every(function (f) { return s.gold[f] !== undefined; });
});
ok(allComplete, "50 条全部 8 字段齐全");

// pain_status 必须在允许值集
var PAIN_OK = ["mentioned", "experienced", "recurring", "impacted", "seeking_solution", "solution_adopted", "dissatisfied", "solved"];
var painOk = fixture.samples.every(function (s) {
  return PAIN_OK.indexOf(s.gold.pain_status) >= 0 || s.gold.pain_status === "unknown";
});
ok(painOk, "pain_status 全部合法值");

// evidence_level 必须在 E1-E6
var EL_OK = ["E1", "E2", "E3", "E4", "E5", "E6"];
var elOk = fixture.samples.every(function (s) { return EL_OK.indexOf(s.gold.evidence_level) >= 0; });
ok(elOk, "evidence_level 全部合法值");

// ID 唯一
var ids = fixture.samples.map(function (s) { return s.id; });
var uniqueIds = ids.filter(function (v, i, a) { return a.indexOf(v) === i; });
ok(uniqueIds.length === 50, "ID 唯一");

// ---------- G. Report 聚合 ----------
section("G. Report 聚合");
var report = require(path.join(EVAL_DIR, "evaluators/report.js"));
var fakeResults = [
  { id: "T01",
    expected: { relevant: true, problem: "手机发热", scenario: "拍视频", pain_status: "experienced", frequency: "once", solution_adopted: false, solved_status: "unknown", evidence_level: "E2" },
    predicted: { relevant: true, problem: "手机发热", scenario: "拍视频", pain_status: "experienced", frequency: "once", solution_adopted: false, solved_status: "unknown", evidence_level: "E2" },
    overall_score: 1.0, errors: [], hallucination: { flagged: false },
    field_scores: {
      relevant: { score: 1, kind: "exact", weight: 1 },
      problem: { score: 1, kind: "exact", weight: 1.2 },
      scenario: { score: 1, kind: "exact", weight: 0.8 },
      pain_status: { score: 1, kind: "exact", weight: 1.5 },
      frequency: { score: 1, kind: "exact", weight: 1.2 },
      solution_adopted: { score: 1, kind: "exact", weight: 1 },
      solved_status: { score: 1, kind: "exact", weight: 1.3 },
      evidence_level: { score: 1, kind: "exact", weight: 1 }
    }
  },
  { id: "T02",
    expected: { relevant: true, problem: "手机发热", scenario: "拍视频", pain_status: "recurring", frequency: "recurring", solution_adopted: false, solved_status: "unknown", evidence_level: "E3" },
    predicted: { relevant: true, problem: "手机发热", scenario: "拍视频", pain_status: "impacted", frequency: "recurring", solution_adopted: false, solved_status: "unknown", evidence_level: "E3" },
    overall_score: 0.7, errors: [{ id: "E04" }], hallucination: { flagged: false },
    field_scores: {
      relevant: { score: 1, kind: "exact", weight: 1 },
      problem: { score: 1, kind: "exact", weight: 1.2 },
      scenario: { score: 1, kind: "exact", weight: 0.8 },
      pain_status: { score: 0, kind: "wrong", weight: 1.5 },
      frequency: { score: 1, kind: "exact", weight: 1.2 },
      solution_adopted: { score: 1, kind: "exact", weight: 1 },
      solved_status: { score: 1, kind: "exact", weight: 1.3 },
      evidence_level: { score: 1, kind: "exact", weight: 1 }
    }
  }
];
var agg = report.aggregate(fakeResults);
ok(agg.overall.total === 2, "total=2");
ok(agg.overall.passed === 1, "passed=1 (T01 only)");
ok(agg.overall.average_score === 0.85, "average_score=0.85");
ok(agg.field_accuracy.pain_status.correct === 1, "pain_status correct=1");
ok(agg.safety.hallucination_count === 0, "hallucination_count=0");
ok(agg.error_counts.E04 === 1, "E04 count=1");

var topErr = report.topErrors(agg, 5);
ok(topErr.length === 1 && topErr[0].id === "E04", "Top Errors 排序");

var topFail = report.topFailureCases(fakeResults, 5);
ok(topFail.length === 1 && topFail[0].id === "T02", "Top Failure = T02");

var recs = report.recommendImprovements(agg, fakeResults);
ok(recs.length >= 1, "至少 1 条建议");

// ---------- H. Runner CLI ----------
section("H. Runner CLI 解析");
// 通过临时 fork 进程（避免真实执行 eval）
var cp = require("child_process");
var r = cp.spawnSync(process.execPath, [path.join(EVAL_DIR, "run.js"), "--help"], { encoding: "utf8" });
ok(r.stdout.indexOf("Consumer Insight Evaluation Runner") >= 0, "--help 输出使用说明");
ok(r.status === 0, "--help exit 0");

var r2 = cp.spawnSync(process.execPath, [path.join(EVAL_DIR, "run.js"), "--mock", "--limit=3"], { encoding: "utf8", cwd: path.resolve(__dirname, "..") });
ok(r2.stdout.indexOf("待评估: 3") >= 0 || r2.stdout.indexOf("samples=3") >= 0, "--limit=3 限制生效");
ok(r2.status === 0, "--mock --limit=3 exit 0");

var r3 = cp.spawnSync(process.execPath, [path.join(EVAL_DIR, "run.js"), "--input=nonexistent.json"], { encoding: "utf8", cwd: path.resolve(__dirname, "..") });
ok(r3.status === 2, "不存在的 fixture → exit 2");

var r4 = cp.spawnSync(process.execPath, [path.join(EVAL_DIR, "run.js"), "--mock", "--sample=T05"], { encoding: "utf8", cwd: path.resolve(__dirname, "..") });
ok(r4.stdout.indexOf("待评估: 1") >= 0, "--sample=T05 单条生效");

// ---------- I. Mock → Report 端到端确定性 ----------
section("I. 端到端确定性");
var tmpDir = fs.mkdtempSync(path.join(require("os").tmpdir(), "ci-eval-"));
var runA = cp.spawnSync(process.execPath, [path.join(EVAL_DIR, "run.js"), "--mock", "--output=" + tmpDir + "-A"], { encoding: "utf8", cwd: path.resolve(__dirname, "..") });
var runB = cp.spawnSync(process.execPath, [path.join(EVAL_DIR, "run.js"), "--mock", "--output=" + tmpDir + "-B"], { encoding: "utf8", cwd: path.resolve(__dirname, "..") });
var filesA = fs.readdirSync(tmpDir + "-A").sort();
var filesB = fs.readdirSync(tmpDir + "-B").sort();
var jsonA = JSON.parse(fs.readFileSync(path.join(tmpDir + "-A", filesA[0]), "utf8"));
var jsonB = JSON.parse(fs.readFileSync(path.join(tmpDir + "-B", filesB[0]), "utf8"));
ok(jsonA.summary.overall.average_score === jsonB.summary.overall.average_score, "两次 run 平均分完全一致");
ok(jsonA.results[0].predicted.pain_status === jsonB.results[0].predicted.pain_status, "T01 pain_status 一致");
ok(jsonA.summary.error_counts.E06 === jsonB.summary.error_counts.E06, "E06 计数一致");

// 清理
require("fs").rmSync(tmpDir + "-A", { recursive: true, force: true });
require("fs").rmSync(tmpDir + "-B", { recursive: true, force: true });

// ---------- J. Runner 包输出 sanity ----------
section("J. 输出报告 sanity");
var runC = cp.spawnSync(process.execPath, [path.join(EVAL_DIR, "run.js"), "--mock", "--output=" + tmpDir], { encoding: "utf8", cwd: path.resolve(__dirname, "..") });
var outFiles = fs.readdirSync(tmpDir);
var jsonFile = outFiles.filter(function (f) { return f.indexOf(".json") >= 0; })[0];
var mdFile = outFiles.filter(function (f) { return f.indexOf(".md") >= 0; })[0];
ok(jsonFile && mdFile, "生成 JSON + Markdown 报告");
ok(jsonFile.indexOf("consumer-insight-eval-") === 0, "JSON 文件名格式正确");
var mdContent = fs.readFileSync(path.join(tmpDir, mdFile), "utf8");
ok(mdContent.indexOf("# Consumer Insight Extraction Evaluation Report") === 0, "MD 报告以标题开头");
ok(mdContent.indexOf("## 1. Overall") >= 0, "MD 报告含 §1 Overall");
ok(mdContent.indexOf("## 2. Field Accuracy") >= 0, "MD 报告含 §2 Field Accuracy");
ok(mdContent.indexOf("## 3. Safety / Hallucination") >= 0, "MD 报告含 §3 Safety");
ok(mdContent.indexOf("## 4. Top Error Types") >= 0, "MD 报告含 §4 Top Errors");
ok(mdContent.indexOf("## 5. Top 10 Failure Cases") >= 0, "MD 报告含 §5 Top Failure");
ok(mdContent.indexOf("## 6. Prompt Improvement Recommendations") >= 0, "MD 报告含 §6 Recommendations");
require("fs").rmSync(tmpDir, { recursive: true, force: true });

console.log("\n=========================================");
console.log("Step 5 Eval Harness 测试：通过 " + pass + " / 失败 " + fail);
console.log("=========================================");
process.exit(fail > 0 ? 1 : 0);
