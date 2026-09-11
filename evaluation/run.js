#!/usr/bin/env node
// Consumer Insight Extraction Evaluation Runner
// 用法：
//   node evaluation/run.js --mock
//   node evaluation/run.js --provider=zhipu
//   node evaluation/run.js --provider=openai --model=gpt-4o-mini
//   node evaluation/run.js --mock --input=evaluation/fixtures/consumer-insight-ground-truth.json --output=evaluation/reports/
//   node evaluation/run.js --mock --sample=T05  // 仅跑单条
//   node evaluation/run.js --mock --limit=10   // 仅跑前 10 条
"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");

// ---------- 参数解析 ----------
function parseArgs(argv) {
  var opts = {
    mock: false,
    provider: null,
    model: null,
    input: path.join(__dirname, "fixtures", "consumer-insight-ground-truth.json"),
    output: path.join(__dirname, "reports"),
    sample: null,
    limit: null,
    promptVersion: "v1"
  };
  for (var i = 0; i < argv.length; i++) {
    var a = argv[i];
    if (a === "--mock") opts.mock = true;
    else if (a === "--help" || a === "-h") opts.help = true;
    else if (a.indexOf("--provider=") === 0) opts.provider = a.slice("--provider=".length);
    else if (a.indexOf("--model=") === 0) opts.model = a.slice("--model=".length);
    else if (a.indexOf("--input=") === 0) opts.input = a.slice("--input=".length);
    else if (a.indexOf("--output=") === 0) opts.output = a.slice("--output=".length);
    else if (a.indexOf("--sample=") === 0) opts.sample = a.slice("--sample=".length);
    else if (a.indexOf("--limit=") === 0) opts.limit = parseInt(a.slice("--limit=".length), 10);
    else if (a.indexOf("--prompt-version=") === 0) opts.promptVersion = a.slice("--prompt-version=".length);
  }
  return opts;
}

function usage() {
  return [
    "Consumer Insight Evaluation Runner",
    "",
    "用法：",
    "  node evaluation/run.js --mock",
    "  node evaluation/run.js --provider=zhipu",
    "  node evaluation/run.js --provider=openai --model=gpt-4o-mini",
    "  node evaluation/run.js --mock --sample=T05",
    "  node evaluation/run.js --mock --limit=10",
    "  node evaluation/run.js --mock --input=path/to/fixtures.json --output=path/to/reports",
    "",
    "参数：",
    "  --mock                     强制使用 MockProvider（确定性，无网络）",
    "  --provider=ID              显式 provider（mock/zhipu/openai）",
    "  --model=NAME               覆盖模型名",
    "  --input=PATH               Ground Truth fixture 路径",
    "  --output=DIR               报告输出目录",
    "  --sample=ID                仅评估单条（如 T05）",
    "  --limit=N                  仅评估前 N 条",
    "  --prompt-version=VER       Prompt 版本号（写入报告）",
    ""
  ].join("\n");
}

// ---------- 加载沙箱（消费者提取模块） ----------
function loadConsumerSandbox() {
  var ROOT = path.resolve(__dirname, "..");
  var SRC = {
    schema: fs.readFileSync(path.join(ROOT, "js/consumer/schema.js"), "utf8"),
    prompt: fs.readFileSync(path.join(ROOT, "js/consumer/prompt.js"), "utf8")
  };
  var sb = { console: console, JSON: JSON, Object: Object, Array: Array, String: String, Number: Number };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(SRC.schema, sb);
  vm.runInContext(SRC.prompt, sb);
  return sb;
}

// ---------- 单条评估 ----------
async function evaluateOne(sample, provider, sb) {
  var id = sample.id;
  var rawText = sample.raw_text;
  var gold = sample.gold;
  var trap = sample._trap || null;

  // 1. 构建 prompt
  var messages = sb.ciBuildExtractionMessages(rawText, "ground-truth-fixture", "2026-09-11");
  var sysMsg = messages.system || messages[0] && messages[0].content || "";
  var userMsg = messages.user || messages[1] && messages[1].content || "";

  // 2. 调用 provider
  var r = await provider.complete(sysMsg, userMsg, { sampleId: id });

  // 3. 解析 + 校验
  var predicted = null;
  var parseError = null;
  if (r.ok && r.text) {
    try {
      predicted = sb.ciParseJSON(r.text);
    } catch (e) {
      parseError = (e && e.message) || String(e);
      predicted = sb.ciSafeFallback();
    }
  } else {
    predicted = sb.ciSafeFallback();
    parseError = r.error || "provider 未返回有效内容";
  }

  // 补齐缺失字段：LLM 可能返回不完整 JSON，用 safeFallback 兜底每个字段
  var safe = sb.ciSafeFallback();
  predicted = {
    persona: (predicted && predicted.persona) || safe.persona,
    scene: (predicted && predicted.scene) || safe.scene,
    problem: (predicted && predicted.problem) || safe.problem,
    pain: (predicted && predicted.pain) || safe.pain,
    impact: (predicted && predicted.impact) || safe.impact,
    solution: (predicted && predicted.solution) || safe.solution,
    emotion: (predicted && predicted.emotion) || safe.emotion,
    evidence: (predicted && predicted.evidence) || safe.evidence,
    unknowns: (predicted && predicted.unknowns) || safe.unknowns,
    quotes: (predicted && predicted.quotes) || safe.quotes
  };

  var validation = sb.ciValidateExtraction(predicted);

  // 4. 字段评分（与 Gold 对照，映射提取字段 → GT 字段）
  // 我们把 extraction 拍平到 GT 字段：
  //   problem        ← extracted.problem.core
  //   scenario       ← extracted.scene.activity（截断 "未知"）
  //   pain_status    ← extracted.pain.status
  //   frequency      ← extracted.scene.frequency
  //   solution_adopted ← extracted.solution.solution_adopted (true/false/unknown)
  //   solved_status  ← extracted.solution.solved_status
  //   evidence_level ← extracted.evidence.level
  //   relevant       ← (extracted.evidence.level !== "E1" || extracted.problem.core !== "unknown")
  var flatPred = {
    // relevant 推断：problem 有具体内容 OR pain 状态 ≥ experienced OR solution 有具体内容
    // 关键：用户实际表达出痛点/方案/场景 → relevant；纯转述或无信号 → irrelevant
    relevant: (function () {
      var problemCore = (predicted.problem && (predicted.problem.core || "")).toLowerCase();
      var painStatus = (predicted.pain && (predicted.pain.status || "")).toLowerCase();
      var solutionDesc = (predicted.solution && (predicted.solution.solution_desc || "")).toLowerCase();
      var sceneAct = (predicted.scene && (predicted.scene.activity || "")).toLowerCase();
      var hasProblem = problemCore && problemCore !== "unknown";
      var hasPain = painStatus && painStatus !== "unknown" && painStatus !== "mentioned";
      var hasSolution = solutionDesc && solutionDesc !== "unknown";
      var hasScene = sceneAct && sceneAct !== "unknown";
      return hasProblem || hasPain || hasSolution || hasScene;
    })(),
    problem: predicted.problem && predicted.problem.core,
    scenario: predicted.scene && predicted.scene.activity,
    pain_status: predicted.pain && predicted.pain.status,
    frequency: predicted.scene && predicted.scene.frequency,
    solution_adopted: predicted.solution && predicted.solution.solution_adopted,
    solved_status: predicted.solution && predicted.solution.solved_status,
    evidence_level: predicted.evidence && predicted.evidence.level
  };

  var fs = require("./evaluators/field-scorer");
  var fieldScores = fs.scoreAll(gold, flatPred);

  // 5. 错误分类
  var tax = require("./evaluators/error-taxonomy");
  var errors = tax.classify(gold, flatPred).concat(tax.classifyTraps(rawText, gold, flatPred));

  // 6. 幻觉检测
  var hal = require("./evaluators/hallucination");
  var halluc = hal.detect(gold, {
    problem: flatPred.problem,
    scenario: flatPred.scenario,
    pain_status: flatPred.pain_status,
    frequency: flatPred.frequency,
    solved_status: flatPred.solved_status,
    evidence_level: flatPred.evidence_level,
    solution_desc: predicted.solution && predicted.solution.solution_desc,
    pain: predicted.pain
  }, rawText);

  return {
    id: id,
    input: { raw_text: rawText },
    expected: gold,
    predicted: flatPred,
    raw_extraction: predicted,
    parse_error: parseError,
    validation_ok: validation.ok,
    validation_errors: validation.errors || [],
    field_scores: fieldScores.fields,
    overall_score: fieldScores.accuracy,
    errors: errors,
    hallucination: halluc,
    model: r.model,
    provider: r.provider,
    latency_ms: r.latency_ms,
    evaluated_at: new Date().toISOString()
  };
}

// ---------- 主函数 ----------
async function main() {
  var opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(usage());
    process.exit(0);
  }

  // 读取 fixture
  if (!fs.existsSync(opts.input)) {
    console.error("Fixture 不存在: " + opts.input);
    process.exit(2);
  }
  var fixture = JSON.parse(fs.readFileSync(opts.input, "utf8"));
  var samples = fixture.samples || [];
  console.log("[eval] Fixture: " + path.basename(opts.input) + " · samples=" + samples.length);

  // 过滤
  if (opts.sample) samples = samples.filter(function (s) { return s.id === opts.sample; });
  if (opts.limit) samples = samples.slice(0, opts.limit);
  console.log("[eval] 待评估: " + samples.length + " 条");

  // 选定 provider
  var providerIdx = require("./providers");
  var providerId;
  if (opts.mock) providerId = "mock";
  else if (opts.provider) providerId = opts.provider;
  else providerId = "mock"; // 默认 mock（避免意外扣费）

  var provider = providerIdx.getProvider(providerId, { model: opts.model });
  var health = provider.health && provider.health();
  console.log("[eval] Provider: " + providerId + " · " + (health && health.requiresNetwork ? "🌐联网" : "🔒离线"));
  if (health && !health.ok) {
    console.error("[eval] Provider 健康检查失败: " + health.error);
    process.exit(3);
  }

  // 加载提取沙箱
  var sb = loadConsumerSandbox();
  console.log("[eval] Schema: CI_PAIN_STATUS=" + sb.CI_PAIN_STATUS.length + " / E_LEVELS=" + sb.CI_EVIDENCE_LEVELS.length);

  // 逐条评估
  var results = [];
  var t0 = Date.now();
  for (var i = 0; i < samples.length; i++) {
    var s = samples[i];
    process.stdout.write("\r[eval] " + (i + 1) + "/" + samples.length + " · " + s.id + "   ");
    try {
      var r = await evaluateOne(s, provider, sb);
      results.push(r);
    } catch (e) {
      results.push({
        id: s.id,
        input: { raw_text: s.raw_text },
        expected: s.gold,
        predicted: null,
        overall_score: 0,
        errors: [{ id: "E17", name: "UNSUPPORTED_INFERENCE", desc: "评估异常: " + (e && e.message || e) }],
        evaluated_at: new Date().toISOString(),
        provider: providerId,
        model: (provider && provider.model) || ""
      });
    }
  }
  process.stdout.write("\n");
  var elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log("[eval] 完成 · " + elapsed + "s");

  // 输出报告
  var report = require("./evaluators/report");
  var meta = {
    generated_at: new Date().toISOString(),
    provider: providerId,
    model: (provider && provider.model) || "",
    sample_count: results.length,
    prompt_version: opts.promptVersion,
    fixture: opts.input
  };
  var out = report.writeReports(meta, results, opts.output);
  console.log("[eval] JSON 报告: " + out.jsonPath);
  console.log("[eval] MD   报告: " + out.mdPath);
  console.log("");

  // 控制台简报
  var json = out.jsonReport;
  var sm = json.summary;
  console.log("================== 简报 ==================");
  console.log("Overall: 通过 " + sm.overall.passed + "/" + sm.overall.total + " (" + (sm.overall.pass_rate * 100).toFixed(1) + "%) · 平均分 " + (sm.overall.average_score * 100).toFixed(1) + "%");
  console.log("Hallucination Rate: " + (sm.safety.hallucination_rate * 100).toFixed(1) + "%");
  console.log("Unknown Discipline: " + (sm.safety.unknown_discipline_rate * 100).toFixed(1) + "%");
  console.log("");
  console.log("Top Errors:");
  json.top_error_types.slice(0, 5).forEach(function (e, i) {
    console.log("  " + (i + 1) + ". " + e.id + " " + e.name + " · " + e.count);
  });
  console.log("==========================================");

  process.exit(0);
}

main().catch(function (e) {
  console.error("[eval] 致命错误: " + (e && e.stack || e));
  process.exit(99);
});
