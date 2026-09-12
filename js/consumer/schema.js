/* ===========================================================
 * Consumer Intelligence · 提取层 Schema（单条内容 → 结构化事实）
 *
 * 设计原则（与规范一一对应）：
 *  1. 只描述「单条用户内容」可被原文支持的事实，不含任何计数
 *  2. 所有不确定字段必须为 "unknown"，不得用推测填充
 *  3. solution_adopted / purchase_signal / solved_status 三者独立，不得互相推导
 *  4. 禁止出现用户数量类字段（校验器会主动拒绝）
 * =========================================================== */

(function (root) {
  "use strict";

  // ---- 枚举定义（规范给定，不得扩展）----

  // pain.status：用户当前所处的痛点阶段（9 值，单选）
  var PAIN_STATUS = [
    "mentioned",          // 只提到问题存在，未说明自己是否经历
    "experienced",        // 明确描述自己经历过（至少一次），未说明是否反复
    "recurring",          // 明确"每次/一直/经常/总是"等反复语义
    "impacted",           // 已造成实际后果：任务中断 / 放弃 / 被迫改变行为
    "seeking_solution",   // 正在主动寻找解决方案 / 求推荐
    "solution_adopted",   // 已采用某方案（购买 / 自制 / 替代），未说明结果
    "dissatisfied",       // 已采用方案，且明确表达不满
    "solved",             // 明确表达问题已经解决
    "unknown"             // 原文不足以判断
  ];

  // 判定优先级：从高到低，命中即停（更高阶段优先）
  var PAIN_PRIORITY = [
    "solved",
    "dissatisfied",
    "solution_adopted",
    "seeking_solution",
    "impacted",
    "recurring",
    "experienced",
    "mentioned",
    "unknown"
  ];

  // evidence_level：证据价值等级
  var EVIDENCE_LEVELS = ["E1", "E2", "E3", "E4", "E5", "E6"];

  var EVIDENCE_DEF = {
    E1: "只有情绪表达，无问题描述",
    E2: "明确描述问题",
    E3: "明确场景 + 问题",
    E4: "问题 + 实际后果",
    E5: "问题 + 主动采取解决行动",
    E6: "问题 + 解决方案 + 明确满意/不满意结果"
  };

  // 其余枚举
  var SOLVED_STATUS = ["solved", "not_solved", "partial", "unknown"];
  var SATISFACTION = ["satisfied", "dissatisfied", "mixed", "unknown"];
  var FREQUENCY = ["once", "recurring", "unknown"];
  var INTENSITY = ["low", "medium", "high", "unknown"];
  var PAIN_INTENSITY = ["low", "medium", "high", "unknown"];
  var DURATION = ["brief", "short", "ongoing", "unknown"];
  var EXPERIENCE = ["none", "owned", "used", "unknown"];
  var TRI = ["true", "false", "unknown"]; // 三值布尔（无法判断时为 unknown）

  // ---- 禁止出现的字段（规范第 8 条：不得输出用户数量）----
  var FORBIDDEN_FIELDS = [
    "user_count", "users", "unique_users", "unique_user_count",
    "mention_count", "mentions", "count", "total", "sample_size",
    "population", "penetration", "popularity", "votes", "likes_count",
    "support_count", "how_many_users", "用户数量", "人数", "提及次数"
  ];

  // ---- JSON Schema（draft-07 子集，供 LLM 与校验器共用）----
  var EXTRACTION_SCHEMA = {
    $schema: "http://json-schema.org/draft-07/schema#",
    title: "ConsumerInsightExtraction",
    description: "从单条用户原始内容中提取的可被原文证据支持的结构化事实。不含任何用户数量。",
    type: "object",
    additionalProperties: false,
    required: ["persona", "scene", "problem", "pain", "impact", "solution", "emotion", "evidence", "unknowns", "quotes"],
    properties: {
      persona: {
        type: "object",
        additionalProperties: false,
        required: ["segment_hints", "experience_with_product", "role_hint", "need_strength"],
        description: "用户是谁。仅记录原文中明确出现的身份线索。",
        properties: {
          segment_hints: { type: "array", items: { type: "string" }, description: "原文中明确出现的身份/人群线索（如「宝妈」「上班族」）。无则为空数组。" },
          experience_with_product: { type: "string", enum: EXPERIENCE, description: "原文体现的对该产品的经验：none=从未使用 / owned=拥有 / used=使用过 / unknown=未说明。" },
          role_hint: { type: "string", description: "原文自述的职业或角色；未提及则 unknown。" },
          need_strength: { type: "string", enum: PAIN_INTENSITY, description: "需求强度：用户表达对此问题的需要有多强（从描述中推断）。" }
        }
      },
      scene: {
        type: "object",
        additionalProperties: false,
        required: ["time", "place", "activity", "trigger", "frequency", "duration"],
        description: "用户在什么场景。未提及一律 unknown。",
        properties: {
          time: { type: "string", description: "时间线索（如「夏天」「每天下午」）；未提及 unknown。" },
          place: { type: "string", description: "地点线索（如「户外」「咖啡店」）；未提及 unknown。" },
          activity: { type: "string", description: "正在做的事（如「拍 vlog」）；未提及 unknown。" },
          trigger: { type: "string", description: "触发条件（如「高温+长时间拍摄」）；未提及 unknown。" },
          frequency: { type: "string", enum: FREQUENCY, description: "场景发生频率。仅当原文出现「每次/一直/经常/总是」等反复语义才可为 recurring。" },
          duration: { type: "string", enum: DURATION, description: "单次场景持续时间。brief=几分钟 / short=半小时内 / ongoing=半小时以上。仅当原文给出时间长度才可判定，否则 unknown。" }
        }
      },
      problem: {
        type: "object",
        additionalProperties: false,
        required: ["core", "symptoms"],
        description: "用户遇到了什么。不做因果外推。",
        properties: {
          core: { type: "string", description: "原文表述的核心问题；未描述问题则 unknown。" },
          symptoms: { type: "array", items: { type: "string" }, description: "原文明确列出的具体表现（如「掉帧」「烫手」）。无则为空数组。" }
        }
      },
      pain: {
        type: "object",
        additionalProperties: false,
        required: ["status", "intensity", "basis_quote"],
        description: "痛点状态。必须由 basis_quote 支撑，判断不了就 unknown。intensity 与 emotion.intensity 独立（痛感 ≠ 情绪强度）。",
        properties: {
          status: { type: "string", enum: PAIN_STATUS },
          intensity: { type: "string", enum: PAIN_INTENSITY, description: "痛感强度（对生活的实际影响）。与 emotion.intensity（情绪宣泄强度）独立：用户可能情绪激动但痛感低，也可能情绪平静但痛感高。" },
          basis_quote: { type: "string", description: "支撑该 status 的原文片段；status=unknown 时填 unknown。" }
        }
      },
      impact: {
        type: "object",
        additionalProperties: false,
        required: ["task_blocked", "abandoned_activity", "behavior_change", "basis_quote"],
        description: "问题造成的实际后果。仅当原文明确说明才可为 true。",
        properties: {
          task_blocked: { type: "string", enum: TRI, description: "是否导致任务中断/无法完成。" },
          abandoned_activity: { type: "string", enum: TRI, description: "是否导致放弃原活动。" },
          behavior_change: { type: "string", enum: TRI, description: "是否被迫改变原有行为方式。" },
          basis_quote: { type: "string", description: "支撑上述判断的原文片段；无则 unknown。" }
        }
      },
      solution: {
        type: "object",
        additionalProperties: false,
        required: ["solution_adopted", "solution_desc", "purchase_signal", "solved_status", "satisfaction"],
        description: "解决方案。三个判断互相独立：采用方案不代表已购买，购买不代表问题已解决。",
        properties: {
          solution_adopted: { type: "string", enum: TRI, description: "是否已采用某解决方案（购买/自制/替代/规避）。" },
          solution_desc: { type: "string", description: "所采用方案的原文描述；未提及 unknown。" },
          purchase_signal: { type: "string", enum: TRI, description: "是否有购买行为或明确购买意向。与 solution_adopted 独立。" },
          solved_status: { type: "string", enum: SOLVED_STATUS, description: "问题是否已被解决。只有原文明确表达问题已解决才可为 solved；购买产品不得推导为 solved。" },
          satisfaction: { type: "string", enum: SATISFACTION, description: "对所采用方案的满意度。未评价则 unknown。" }
        }
      },
      emotion: {
        type: "object",
        additionalProperties: false,
        required: ["labels", "intensity"],
        description: "情绪。情绪强度不等于痛点强度。",
        properties: {
          labels: { type: "array", items: { type: "string" }, description: "原文体现的情绪标签（如「烦躁」「无奈」）。无则为空数组。" },
          intensity: { type: "string", enum: INTENSITY, description: "情绪强度。禁止据此推断 pain.status。" }
        }
      },
      evidence: {
        type: "object",
        additionalProperties: false,
        required: ["level", "reason"],
        description: "证据等级 E1-E6。",
        properties: {
          level: { type: "string", enum: EVIDENCE_LEVELS },
          reason: { type: "string", description: "判定该等级的依据（命中了哪一条定义）。" }
        }
      },
      unknowns: { type: "array", items: { type: "string" }, description: "本次未能从原文确定的字段路径清单（如 persona.role_hint）。" },
      quotes: { type: "array", items: { type: "string" }, description: "所有判断所依据的原文片段，必须逐字来自原文。" }
    }
  };

  // ---- 校验器（轻量实现，无外部依赖）----
  function typeOf(v) {
    if (Array.isArray(v)) return "array";
    if (v === null) return "null";
    return typeof v;
  }

  function isPlainObject(v) {
    return v !== null && typeof v === "object" && !Array.isArray(v);
  }

  // 深度扫描禁止字段
  function findForbidden(obj, path, hits) {
    path = path || "";
    hits = hits || [];
    if (Array.isArray(obj)) {
      obj.forEach(function (v, i) { findForbidden(v, path + "[" + i + "]", hits); });
      return hits;
    }
    if (isPlainObject(obj)) {
      Object.keys(obj).forEach(function (k) {
        var p = path ? path + "." + k : k;
        if (FORBIDDEN_FIELDS.indexOf(String(k).toLowerCase()) >= 0) hits.push(p);
        findForbidden(obj[k], p, hits);
      });
    }
    return hits;
  }

  /**
   * 校验 LLM 输出是否符合 Schema。
   * @returns {{ok:boolean, errors:string[], value:object|null}}
   */
  function validate(raw) {
    var errors = [];

    // 1. 必须是对象
    if (!isPlainObject(raw)) {
      return { ok: false, errors: ["根节点必须是 JSON 对象"], value: null };
    }

    // 2. 禁止字段（规范第 8 条）
    var forbidden = findForbidden(raw);
    if (forbidden.length) {
      errors.push("出现禁止字段（不得输出用户数量）: " + forbidden.join(", "));
    }

    var S = EXTRACTION_SCHEMA;

    // 3. additionalProperties: false
    Object.keys(raw).forEach(function (k) {
      if (!S.properties[k]) errors.push("未知顶层字段: " + k);
    });

    // 4. required
    S.required.forEach(function (k) {
      if (!(k in raw)) errors.push("缺少必填字段: " + k);
    });

    // 5. 逐字段校验
    Object.keys(S.properties).forEach(function (k) {
      var def = S.properties[k];
      var val = raw[k];
      if (val === undefined) return;

      if (def.type === "object") {
        if (!isPlainObject(val)) { errors.push(k + " 应为对象"); return; }
        (def.required || []).forEach(function (rk) {
          if (!(rk in val)) errors.push(k + " 缺少必填字段: " + rk);
        });
        // additionalProperties: false
        Object.keys(val).forEach(function (ck) {
          if (!def.properties[ck]) errors.push(k + " 含未知字段: " + ck);
        });
        Object.keys(def.properties).forEach(function (ck) {
          var cd = def.properties[ck];
          var cv = val[ck];
          if (cv === undefined) return;
          if (cd.type === "array") {
            if (!Array.isArray(cv)) { errors.push(k + "." + ck + " 应为数组"); return; }
            cv.forEach(function (item, i) {
              if (typeof item !== "string") errors.push(k + "." + ck + "[" + i + "] 应为字符串");
            });
          } else if (cd.type === "string") {
            if (typeof cv !== "string") { errors.push(k + "." + ck + " 应为字符串"); return; }
            if (cd.enum && cd.enum.indexOf(cv) < 0) {
              errors.push(k + "." + ck + " 取值非法: " + JSON.stringify(cv) + "（允许: " + cd.enum.join("/") + "）");
            }
          }
        });
      } else if (def.type === "array") {
        if (!Array.isArray(val)) { errors.push(k + " 应为数组"); return; }
        val.forEach(function (item, i) {
          if (typeof item !== "string") errors.push(k + "[" + i + "] 应为字符串");
        });
      }
    });

    return { ok: errors.length === 0, errors: errors, value: errors.length === 0 ? raw : null };
  }

  /**
   * 规范化：把校验失败的输出降级为「全部 unknown」的安全结构。
   * 宁可返回 unknown，也不允许把推测当成事实写入库。
   */
  function safeFallback() {
    return {
      persona: { segment_hints: [], experience_with_product: "unknown", role_hint: "unknown", need_strength: "unknown" },
      scene: { time: "unknown", place: "unknown", activity: "unknown", trigger: "unknown", frequency: "unknown", duration: "unknown" },
      problem: { core: "unknown", symptoms: [] },
      pain: { status: "unknown", intensity: "unknown", basis_quote: "unknown" },
      impact: { task_blocked: "unknown", abandoned_activity: "unknown", behavior_change: "unknown", basis_quote: "unknown" },
      solution: { solution_adopted: "unknown", solution_desc: "unknown", purchase_signal: "unknown", solved_status: "unknown", satisfaction: "unknown" },
      emotion: { labels: [], intensity: "unknown" },
      evidence: { level: "E1", reason: "提取失败，降级为最低等级" },
      unknowns: ["*（整体提取失败，全部字段置 unknown）"],
      quotes: []
    };
  }

  /** 从原始文本中尽力解析 JSON（容忍 ```json 围栏与前后杂字符）*/
  function parseJSON(text) {
    if (typeof text !== "string") return null;
    var s = text.trim();
    // 去掉 markdown 围栏
    var fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) s = fence[1].trim();
    try { return JSON.parse(s); } catch (e) {}
    // 兜底：截取第一个 { 到最后一个 }
    var i = s.indexOf("{"), j = s.lastIndexOf("}");
    if (i >= 0 && j > i) {
      try { return JSON.parse(s.slice(i, j + 1)); } catch (e2) {}
    }
    return null;
  }

  root.CI_SCHEMA = EXTRACTION_SCHEMA;
  root.CI_PAIN_STATUS = PAIN_STATUS;
  root.CI_PAIN_PRIORITY = PAIN_PRIORITY;
  root.CI_PAIN_INTENSITY = PAIN_INTENSITY;
  root.CI_EVIDENCE_LEVELS = EVIDENCE_LEVELS;
  root.CI_EVIDENCE_DEF = EVIDENCE_DEF;
  root.CI_SOLVED_STATUS = SOLVED_STATUS;
  root.CI_SATISFACTION = SATISFACTION;
  root.CI_DURATION = DURATION;
  root.CI_FREQUENCY = FREQUENCY;
  root.CI_INTENSITY = INTENSITY;
  root.CI_FORBIDDEN_FIELDS = FORBIDDEN_FIELDS;
  root.ciValidateExtraction = validate;
  root.ciSafeFallback = safeFallback;
  root.ciParseJSON = parseJSON;
  root.ciFindForbidden = findForbidden;

})(typeof globalThis !== "undefined" ? globalThis : this);
