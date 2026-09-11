/* ===========================================================
 * Consumer Intelligence · 聚合层
 *
 * ⚠️ 边界：**只有本层可以产出计数**。
 *    提取层（extract.js）分析单条内容，任何计数都不得在那一层产生。
 *
 * 计数口径（每条都必须可复核）：
 *   mention_count      原始内容条数（含同一用户多次发言）
 *   unique_users       按 user 去重后的人数
 *   relevant_users     去重用户中，证据等级 ≥ E2（排除纯情绪）
 *   pain_confirmed     去重用户中，痛点状态进入「真实困扰」阶段（recurring 及以后）
 *   solution_seeking   去重用户中，正在寻找方案
 *   purchase_users     去重用户中，有购买信号
 *   solved_users       去重用户中，问题明确已解决
 * =========================================================== */

(function (root) {
  "use strict";

  // 视为「已进入真实困扰」的痛点状态（recurring 及更高阶段）
  var PAIN_CONFIRMED_STATES = ["recurring", "impacted", "seeking_solution", "solution_adopted", "dissatisfied"];
  // 视为「已采取行动」
  var ACTION_STATES = ["solution_adopted", "dissatisfied"];

  function uniqBy(arr, keyFn) {
    var seen = {}, out = [];
    (arr || []).forEach(function (x) {
      var k = keyFn(x);
      if (k == null || k === "") return;
      if (!seen[k]) { seen[k] = 1; out.push(x); }
    });
    return out;
  }

  function statusOf(rec) {
    var x = (rec && rec.extracted) || {};
    return (x.pain && x.pain.status) || "unknown";
  }

  function levelOf(rec) {
    var x = (rec && rec.extracted) || {};
    return (x.evidence && x.evidence.level) || "E1";
  }

  function solutionOf(rec) {
    var x = (rec && rec.extracted) || {};
    return x.solution || {};
  }

  /** 主计数（仅聚合层调用）*/
  function ciAggregate(records) {
    var list = records || [];
    var users = uniqBy(list, function (r) { return r.user; });

    function usersMatching(pred) {
      return uniqBy(list.filter(pred), function (r) { return r.user; }).length;
    }

    var mention = list.length;
    var unique = users.length;

    var relevant = usersMatching(function (r) { return levelOf(r) !== "E1"; });
    var painConfirmed = usersMatching(function (r) {
      return PAIN_CONFIRMED_STATES.indexOf(statusOf(r)) >= 0;
    });
    var seeking = usersMatching(function (r) {
      return statusOf(r) === "seeking_solution";
    });
    var purchased = usersMatching(function (r) {
      return solutionOf(r).purchase_signal === "true";
    });
    var adopted = usersMatching(function (r) {
      return solutionOf(r).solution_adopted === "true";
    });
    var solved = usersMatching(function (r) {
      return solutionOf(r).solved_status === "solved";
    });
    var dissatisfied = usersMatching(function (r) {
      return statusOf(r) === "dissatisfied";
    });
    var impacted = usersMatching(function (r) {
      return statusOf(r) === "impacted";
    });

    return {
      mention_count: mention,
      unique_users: unique,
      relevant_users: relevant,
      pain_confirmed_users: painConfirmed,
      solution_seeking_users: seeking,
      solution_adopted_users: adopted,
      purchase_users: purchased,
      dissatisfied_users: dissatisfied,
      impacted_users: impacted,
      solved_users: solved,
      // 漏斗（严格递减，体现 Mention ≠ Pain）
      funnel: [mention, unique, relevant, painConfirmed],
      // 审计
      audit: (typeof root.ciAuditAll === "function") ? root.ciAuditAll(list) : null
    };
  }

  /** 痛点状态分布（按条数，明确标注是「条」不是「人」）*/
  function ciPainDist(records) {
    var order = (root.CI_PAIN_STATUS || []);
    var byStatus = {}, byStatusUsers = {};
    order.forEach(function (s) { byStatus[s] = 0; byStatusUsers[s] = 0; });
    var seenUser = {};
    (records || []).forEach(function (r) {
      var s = statusOf(r);
      if (byStatus[s] === undefined) return;
      byStatus[s]++;
      var k = s + "|" + (r.user || "");
      if (!seenUser[k]) { seenUser[k] = 1; byStatusUsers[s]++; }
    });
    var out = order.map(function (s) {
      return { status: s, mentions: byStatus[s] || 0, users: byStatusUsers[s] || 0 };
    });
    return out;
  }

  /** 证据等级分布（按条数）*/
  function ciLevelDist(records) {
    var order = (root.CI_EVIDENCE_LEVELS || []);
    var cnt = {};
    order.forEach(function (l) { cnt[l] = 0; });
    (records || []).forEach(function (r) {
      var l = levelOf(r);
      if (cnt[l] !== undefined) cnt[l]++;
    });
    return order.map(function (l) { return { level: l, mentions: cnt[l] || 0 }; });
  }

  /** 场景聚合：从 scene 各字段抽取非 unknown 值 */
  function ciSceneAgg(records, topN) {
    var fields = ["time", "place", "activity", "trigger"];
    var out = {};
    fields.forEach(function (f) {
      var cnt = {};
      (records || []).forEach(function (r) {
        var x = (r.extracted && r.extracted.scene) || {};
        var v = x[f];
        if (!v || v === "unknown" || v === "N/A") return;
        cnt[v] = (cnt[v] || 0) + 1;
      });
      out[f] = Object.keys(cnt).map(function (k) { return { name: k, count: cnt[k] }; })
        .sort(function (a, b) { return b.count - a.count; })
        .slice(0, topN || 5);
    });
    // frequency 枚举分布
    var freq = { once: 0, recurring: 0, unknown: 0 };
    (records || []).forEach(function (r) {
      var x = (r.extracted && r.extracted.scene) || {};
      var v = x.frequency;
      if (freq[v] !== undefined) freq[v]++;
    });
    out.frequency = freq;
    return out;
  }

  /** 来源分布（按平台）*/
  function ciSourceDist(records) {
    var cnt = {};
    (records || []).forEach(function (r) {
      var s = r.source || "other";
      cnt[s] = (cnt[s] || 0) + 1;
    });
    return Object.keys(cnt).map(function (k) { return { source: k, count: cnt[k] }; })
      .sort(function (a, b) { return b.count - a.count; });
  }

  root.ciAggregate = ciAggregate;
  root.ciPainDist = ciPainDist;
  root.ciLevelDist = ciLevelDist;
  root.ciSceneAgg = ciSceneAgg;
  root.ciSourceDist = ciSourceDist;
  root.CI_PAIN_CONFIRMED_STATES = PAIN_CONFIRMED_STATES;

})(typeof globalThis !== "undefined" ? globalThis : this);
