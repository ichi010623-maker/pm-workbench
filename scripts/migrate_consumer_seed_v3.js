// Consumer Intelligence Seed 数据迁移脚本 · v2 → v3
// 任务：批量回填 scene.duration + pain.intensity + persona.need_strength
// 原则：基于 rawText + 现有 extracted 字段推断；不能确认则 unknown

const fs = require('fs');
const path = require('path');

const SEED_PATH = path.join(__dirname, '..', 'data', 'consumer_intel.json');

// 复用 schema.js 的 CUES（保证逻辑一致）
const RULES_PATH = path.join(__dirname, '..', 'js', 'consumer', 'rules.js');
const vm = require('vm');
const sb = { console, JSON, Object, Array, String, Number, RegExp };
sb.window = sb;
vm.createContext(sb);
vm.runInContext(fs.readFileSync(RULES_PATH, 'utf8'), sb);
const CUES = sb.CI_CUES;

// 推断 duration
function inferDuration(t) {
  if (!t) return 'unknown';
  // ongoing 优先（更具体）
  for (var i = 0; i < CUES.duration_ongoing.length; i++) {
    if (t.indexOf(CUES.duration_ongoing[i]) >= 0) return 'ongoing';
  }
  for (var i = 0; i < CUES.duration_short.length; i++) {
    if (t.indexOf(CUES.duration_short[i]) >= 0) return 'short';
  }
  for (var i = 0; i < CUES.duration_brief.length; i++) {
    if (t.indexOf(CUES.duration_brief[i]) >= 0) return 'brief';
  }
  return 'unknown';
}

// 推断 pain.intensity（独立于 emotion.intensity）
function inferPainIntensity(t, x) {
  if (!t) return 'unknown';
  // 强痛感：impacted 状态 + 有具体后果（扛不住/中断/放弃/关机）
  for (var i = 0; i < CUES.pain_high.length; i++) {
    if (t.indexOf(CUES.pain_high[i]) >= 0) return 'high';
  }
  // 中等痛感：很烦/影响/困扰
  for (var i = 0; i < CUES.pain_medium.length; i++) {
    if (t.indexOf(CUES.pain_medium[i]) >= 0) return 'medium';
  }
  // 低痛感：轻微措辞
  for (var i = 0; i < CUES.pain_low.length; i++) {
    if (t.indexOf(CUES.pain_low[i]) >= 0) return 'low';
  }
  return 'unknown';
}

// 推断 persona.need_strength（基于 pain.status + impact）
function inferNeedStrength(x) {
  var st = x.pain && x.pain.status;
  if (st === 'impacted' || st === 'recurring') return 'high';
  if (st === 'experienced' || st === 'seeking_solution' || st === 'solution_adopted' || st === 'dissatisfied') return 'medium';
  if (st === 'solved') return 'low';
  return 'unknown';
}

// 主流程
const data = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
let updated = 0;
let unchanged = 0;

data.researches.forEach(function (r) {
  r.evidence.forEach(function (ev) {
    var t = ev.rawText || '';
    var x = ev.extracted || {};
    var changed = false;

    // 1. duration
    var dur = inferDuration(t);
    if (!x.scene) x.scene = {};
    if (x.scene.duration === undefined) {
      x.scene.duration = dur;
      changed = true;
    }

    // 2. pain.intensity
    if (!x.pain) x.pain = {};
    if (x.pain.intensity === undefined) {
      x.pain.intensity = inferPainIntensity(t, x);
      changed = true;
    }

    // 3. persona.need_strength
    if (!x.persona) x.persona = {};
    if (x.persona.need_strength === undefined) {
      x.persona.need_strength = inferNeedStrength(x);
      changed = true;
    }

    if (changed) {
      ev.extracted = x;
      updated++;
    } else {
      unchanged++;
    }
  });
});

// 升级版本
data.version = '3.0';
data.schemaVersion = 3;
data.updatedAt = '2026-09-12';

fs.writeFileSync(SEED_PATH, JSON.stringify(data, null, 2), 'utf8');
console.log('Migration done: updated=' + updated + ', unchanged=' + unchanged);
console.log('New version: 3.0');
