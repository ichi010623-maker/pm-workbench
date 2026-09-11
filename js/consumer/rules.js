/* ===========================================================
 * Consumer Intelligence · 规则审计层（可质疑）
 *
 * 作用：对 AI 提取结果做**确定性复核**。
 * 不修改结论，只标注「该判断在原文里找不到对应措辞」，
 * 让人可以据此质疑、回看原文、决定是否采信。
 *
 * 这是「不得把推测当成事实」的工程化兜底。
 * =========================================================== */

(function (root) {
  "use strict";

  // 各判断对应需要的原文措辞线索（任一命中即视为「原文有支撑」）
  var CUES = {
    recurring: ["每次", "一直", "经常", "总是", "天天", "每天", "老是", "动不动", "常年", "从来都", "无一例外", "反复"],
    solved: ["解决了", "已解决", "不再", "没这个问题", "没有这个问题", "好了", "搞定", "不烫了", "不卡了", "没问题了", "不会太"],
    adopted: ["买了", "买的", "我买的", "入手", "用了", "用着", "换成", "改成", "装了", "搞了个", "买了个", "下单", "自制的", "贴了", "上了", "买了散热器", "拆了", "卸了", "只在", "改在", "改成", "分次", "一段一段", "买散热器了", "买了一个", "我买的那"],
    purchase: ["买", "下单", "入手", "购", "剁手"],
    dissatisfied: ["不好用", "太吵", "太重", "退了", "退货", "失望", "鸡肋", "没用", "不行", "拉胯", "难用", "翻车", "后悔",
                   "服了", "无语", "受不了", "忍不了", "气死", "崩溃", "绝望", "尴尬", "挡住", "遮挡", "挡住我", "卡位", "太明显"],
    seeking: ["求推荐", "求介绍", "有没有", "推荐一下", "怎么解决", "哪个好", "求问", "求助", "选哪", "不知道买", "求安利", "求",
              // 购买意向同样属于「方案寻求」阶段（想买但还没定）
              "想买", "肯定买", "打算买", "准备买", "会买", "买哪款", "买哪个", "在考虑", "买哪一款", "买哪一"],
    impacted: ["不能", "中断", "放弃", "拍不了", "卡死", "关机", "没法", "影响", "扛不住", "顶不住", "直接停", "被迫",
               "只能", "关后台", "卡到", "不想再", "扛不住", "顶不住"],
    mentionOnly: ["听说", "据说", "看到有人说", "是不是", "好像", "才知道"]
  };

  function hasAny(text, list) {
    for (var i = 0; i < list.length; i++) {
      if (text.indexOf(list[i]) >= 0) return list[i];
    }
    return "";
  }

  /**
   * 审计单条记录。
   * @param {object} record  v2 记录（含 rawText 与 extracted）
   * @returns {{ok:boolean, warnings:Array<{rule:string, message:string, field:string}>}}
   */
  function ciAudit(record) {
    var warnings = [];
    var t = String((record && record.rawText) || "");
    var x = (record && record.extracted) || {};
    var pain = x.pain || {};
    var sol = x.solution || {};
    var imp = x.impact || {};

    if (!t) {
      warnings.push({ rule: "-", field: "rawText", message: "原文为空，无法复核" });
      return { ok: false, warnings: warnings };
    }

    // 规则 5：不得把一次性抱怨判断为 recurring
    if (pain.status === "recurring" || (x.scene && x.scene.frequency === "recurring")) {
      var hit = hasAny(t, CUES.recurring);
      if (!hit) {
        warnings.push({
          rule: "规则5", field: "pain.status",
          message: "judged recurring，但原文未出现「每次/一直/经常/总是」等反复措辞"
        });
      }
    }

    // 规则 6：购买不等于已解决
    if (sol.solved_status === "solved") {
      var hitS = hasAny(t, CUES.solved);
      if (!hitS) {
        warnings.push({
          rule: "规则6", field: "solution.solved_status",
          message: "judged solved，但原文没有明确表达问题已解决的措辞"
        });
      }
      if (sol.solution_adopted === "true" && !hitS) {
        warnings.push({
          rule: "规则6", field: "solution.solved_status",
          message: "已采用方案 + solved：需原文明确「问题已解决」，购买行为本身不足以支撑"
        });
      }
    }

    // solution_adopted 需有「已采用」措辞（购买措辞亦可佐证）
    if (sol.solution_adopted === "true" && !hasAny(t, CUES.adopted) && !hasAny(t, CUES.purchase)) {
      warnings.push({
        rule: "字段一致性", field: "solution.solution_adopted",
        message: "judged 已采用方案，但原文未见采用行为措辞"
      });
    }

    // 仅有购买意向（「我肯定买」「想买」）不得判定为已采用
    if (sol.solution_adopted === "true" && /肯定买|想买|打算买|准备买|要是.*就买|会买/.test(t) && !hasAny(t, CUES.adopted)) {
      warnings.push({
        rule: "规则4", field: "solution.solution_adopted",
        message: "原文仅为购买意向（非已发生行为），不足以支撑「已采用方案」"
      });
    }

    // purchase_signal 需有购买措辞
    if (sol.purchase_signal === "true" && !hasAny(t, CUES.purchase)) {
      warnings.push({
        rule: "字段一致性", field: "solution.purchase_signal",
        message: "judged 有购买信号，但原文未见购买措辞"
      });
    }

    // 已购买 → 应采用方案（单向蕴含）
    if (sol.purchase_signal === "true" && sol.solution_adopted === "false") {
      warnings.push({
        rule: "字段一致性", field: "solution.solution_adopted",
        message: "purchase_signal=true 但 solution_adopted=false，二者矛盾"
      });
    }

    // dissatisfied 需有负面评价措辞
    if (pain.status === "dissatisfied" && !hasAny(t, CUES.dissatisfied)) {
      warnings.push({
        rule: "字段一致性", field: "pain.status",
        message: "judged dissatisfied，但原文未见明确的负面评价措辞"
      });
    }

    // seeking_solution 需有求助措辞
    if (pain.status === "seeking_solution" && !hasAny(t, CUES.seeking)) {
      warnings.push({
        rule: "字段一致性", field: "pain.status",
        message: "judged seeking_solution，但原文未见求推荐/求助类措辞"
      });
    }

    // impacted 需有后果措辞
    if (pain.status === "impacted") {
      var hitI = hasAny(t, CUES.impacted);
      var anyImpactFlag = imp.task_blocked === "true" || imp.abandoned_activity === "true" || imp.behavior_change === "true";
      if (!hitI && !anyImpactFlag) {
        warnings.push({
          rule: "规则4", field: "pain.status",
          message: "judged impacted，但原文未见实际后果措辞，impact 三项也都非 true"
        });
      }
    }

    // 规则7：提到产品 ≠ 正在使用
    if (sol.solution_adopted === "true" && hasAny(t, CUES.mentionOnly) && !hasAny(t, CUES.adopted)) {
      warnings.push({
        rule: "规则7", field: "solution.solution_adopted",
        message: "原文为「听说/据说」类转述，不足以判断用户本人已采用该产品"
      });
    }

    // 规则9：情绪强度不得推断痛点强度（结构性检查）
    var emo = x.emotion || {};
    if (emo.intensity === "high" && pain.status === "impacted") {
      // 这是允许的，但必须同时有后果支撑
      if (!hasAny(t, CUES.impacted)) {
        warnings.push({
          rule: "规则9", field: "pain.status",
          message: "情绪强度高 + judged impacted，但缺少后果措辞：可能由情绪强度误推痛点强度"
        });
      }
    }

    // 规则3：unknown 是否被显式记录
    if (pain.status === "unknown" && (!x.unknowns || !x.unknowns.length)) {
      warnings.push({
        rule: "规则3", field: "unknowns",
        message: "pain.status=unknown，但 unknowns 未记录该字段路径"
      });
    }

    // 规则8：禁止计数（冗余防护，Schema 校验已拦截）
    if (typeof root.ciFindForbidden === "function") {
      var f = root.ciFindForbidden(x);
      if (f.length) {
        warnings.push({ rule: "规则8", field: f.join(","), message: "提取结果中出现计数字段，违反「不得输出用户数量」" });
      }
    }

    return { ok: warnings.length === 0, warnings: warnings };
  }

  /** 批量审计，返回 {clean, flagged, total} */
  function ciAuditAll(records) {
    var clean = 0, flagged = 0, details = [];
    (records || []).forEach(function (r) {
      var a = ciAudit(r);
      if (a.ok) clean++;
      else { flagged++; details.push({ id: r.id, warnings: a.warnings }); }
    });
    return { clean: clean, flagged: flagged, total: (records || []).length, details: details };
  }

  root.CI_CUES = CUES;
  root.ciAudit = ciAudit;
  root.ciAuditAll = ciAuditAll;

})(typeof globalThis !== "undefined" ? globalThis : this);
