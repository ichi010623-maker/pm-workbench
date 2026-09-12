/* ===========================================================
 * Consumer Intelligence · 洞察聚类层（insights）
 *
 * 输入：一批 evidence 记录（已是 13 字段结构化事实）
 * 输出：主题聚类 · Insight Cards · 8 段报告结构 · 机会假设
 *
 * ⚠️ 三层分离原则（与规范一致）：
 *   FACT          = 直接可复核的聚合（计数 / 分布 / 原文）
 *   INTERPRETATION= 基于事实的推断（漏斗解读 / 生命周期阶段）
 *   HYPOTHESIS    = 机会方向（需后续验证，不得当作结论）
 *
 * 本层不产出任何「用户数量」以外的推断；机会一律标注为 HYPOTHESIS。
 * =========================================================== */

(function (root) {
  "use strict";

  // 生命周期阶段（痛点状态的有序映射，用于 06 段）
  var LIFECYCLE = [
    { status: "mentioned", stage: "仅提及", desc: "用户提到了问题，尚未确认是否亲历" },
    { status: "experienced", stage: "亲历", desc: "明确经历过至少一次" },
    { status: "recurring", stage: "反复发生", desc: "每次/一直/经常，已成规律" },
    { status: "impacted", stage: "已造成后果", desc: "任务中断/放弃/被迫改变行为" },
    { status: "seeking_solution", stage: "寻求方案", desc: "主动求推荐/求解决" },
    { status: "solution_adopted", stage: "已采用方案", desc: "已购买/自制/替代" },
    { status: "dissatisfied", stage: "对方案不满", desc: "已采用但明确差评" },
    { status: "solved", stage: "已解决", desc: "明确表达问题已解决" }
  ];

  function recExtracted(r) { return (r && r.extracted) || {}; }
  function statusOf(r) { return (recExtracted(r).pain || {}).status || "unknown"; }
  function coreOf(r) { return (recExtracted(r).problem || {}).core || ""; }
  function sceneOf(r) { return recExtracted(r).scene || {}; }
  function solutionOf(r) { return recExtracted(r).solution || {}; }
  function personaOf(r) { return recExtracted(r).persona || {}; }
  function needOf(r) { return personaOf(r).need_strength || "unknown"; }

  function uniqCount(arr, keyFn) {
    var seen = {}, n = 0;
    (arr || []).forEach(function (x) { var k = keyFn(x); if (k == null || k === "" || k === "unknown") return; if (!seen[k]) { seen[k] = 1; n++; } });
    return n;
  }

  function topValues(records, pickFn, topN) {
    var cnt = {};
    records.forEach(function (r) {
      var v = pickFn(r);
      if (!v || v === "unknown") return;
      cnt[v] = (cnt[v] || 0) + 1;
    });
    return Object.keys(cnt).map(function (k) { return { name: k, count: cnt[k] }; })
      .sort(function (a, b) { return b.count - a.count; }).slice(0, topN || 5);
  }

  // ---------------- 主题聚类 ----------------
  function ciClusterThemes(records, topN) {
    var list = records || [];
    var groups = {};
    list.forEach(function (r) {
      var core = (coreOf(r) || "").trim();
      var key = core || "（未明确核心问题）";
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });
    var themes = Object.keys(groups).map(function (k) {
      var members = groups[k];
      var painDist = {};
      var scenes = [];
      var solutions = [];
      var dissatisfaction = 0, solved = 0, recurring = 0;
      members.forEach(function (r) {
        var st = statusOf(r);
        painDist[st] = (painDist[st] || 0) + 1;
        if (st === "dissatisfied") dissatisfaction++;
        if (st === "solved") solved++;
        if (st === "recurring") recurring++;
        var sc = sceneOf(r);
        if (sc.activity && sc.activity !== "unknown") scenes.push(sc.activity);
        var sd = solutionOf(r).solution_desc;
        if (sd && sd !== "unknown") solutions.push(sd);
      });
      var users = uniqCount(members, function (r) { return r.user; });
      var opp = [];
      if (dissatisfaction > 0) opp.push({ text: "该问题现有方案被差评（" + dissatisfaction + " 条），存在『更好替代方案』的替换机会", basis: "dissatisfaction=" + dissatisfaction });
      if (recurring > 0 && solved === 0) opp.push({ text: "反复发生却无人解决，存在『首款真正解决问题』的刚需机会", basis: "recurring=" + recurring + ",solved=0" });
      if (members.length >= 3) opp.push({ text: "高频提及（" + members.length + " 条），值得做成默认能力而非配件", basis: "mentions=" + members.length });
      return {
        id: "th_" + encodeURIComponent(k).slice(0, 24),
        name: k,
        mentions: members.length,
        users: users,
        painDist: painDist,
        topScenes: topValues(members, function (r) { var sc = sceneOf(r); return sc.activity && sc.activity !== "unknown" ? sc.activity : (sc.trigger && sc.trigger !== "unknown" ? sc.trigger : null); }, 3),
        solutions: Array.from(new Set(solutions)).slice(0, 4),
        dissatisfaction: dissatisfaction,
        solved: solved,
        recurring: recurring,
        opportunities: opp,
        members: members
      };
    });
    themes.sort(function (a, b) { return b.mentions - a.mentions; });
    return topN ? themes.slice(0, topN) : themes;
  }

  // ---------------- Insight Cards（7 张）----------------
  function ciInsightCards(research, records, agg) {
    var recs = records || [];
    var themes = ciClusterThemes(recs, 3);
    var scen = (typeof root.ciSceneAgg === "function") ? root.ciSceneAgg(recs, 3) : {};
    var needHigh = recs.filter(function (r) { return needOf(r) === "high"; }).length;
    var oppCount = (function () {
      var os = ciOpportunities(recs, agg, themes);
      return os.length;
    })();

    var topScene = (scen.activity && scen.activity[0]) ? scen.activity[0].name : "用户未明确说明场景";
    var topTheme = themes[0] ? themes[0].name : "暂无足够证据";
    var lifecycleStage = lifecycleHead(agg, recs);

    return [
      { key: "scale", title: "用户规模", layer: "FACT", metric: (agg.unique_users || 0) + " 人", sub: "去重后 · " + (agg.mention_count || 0) + " 条原始内容", drill: "去重依据是 user 标识，非条数" },
      { key: "scene", title: "高频场景", layer: "FACT", metric: topScene, sub: "出现最多的活动场景", drill: "仅统计原文明确给出的场景" },
      { key: "pain", title: "核心痛点", layer: "FACT", metric: topTheme, sub: (themes[0] ? themes[0].mentions + " 条提及" : "暂无"), drill: "按问题核心聚类" },
      { key: "lifecycle", title: "生命周期", layer: "INTERPRETATION", metric: lifecycleStage.stage, sub: lifecycleStage.desc, drill: "基于痛点状态分布推断" },
      { key: "solution", title: "当前方案", layer: "FACT", metric: (agg.solution_adopted_users || 0) + " 人已采用", sub: (agg.dissatisfied_users || 0) + " 人明确不满", drill: "采用≠满意，购买≠已解决" },
      { key: "opportunity", title: "机会方向", layer: "HYPOTHESIS", metric: oppCount + " 个假设", sub: needHigh > 0 ? (needHigh + " 人高需求强度") : "待验证", drill: "机会均为需验证的假设" },
      { key: "evidence", title: "Evidence", layer: "FACT", metric: (agg.mention_count || 0) + " 条", sub: "每条可点击回看原文", drill: "证据是第一等公民" }
    ];
  }

  function lifecycleHead(agg, recs) {
    var dist = (typeof root.ciPainDist === "function") ? root.ciPainDist(recs) : [];
    var maxStage = LIFECYCLE[0];
    var maxN = -1;
    dist.forEach(function (d) {
      var idx = LIFECYCLE.findIndex(function (x) { return x.status === d.status; });
      if (idx >= 0 && d.mentions > maxN) { maxN = d.mentions; maxStage = LIFECYCLE[idx]; }
    });
    return maxStage;
  }

  // ---------------- 8 段报告 ----------------
  function ciReportSections(research, records, agg, themes) {
    var recs = records || [];
    var secs = [];

    // 01 用户是谁（FACT）
    var segHints = topValues(recs, function (r) {
      var h = (personaOf(r).segment_hints || []);
      return h.length ? h.join("/") : null;
    }, 5);
    var expDist = distEnum(recs, function (r) { return personaOf(r).experience_with_product; });
    var needDist = distEnum(recs, function (r) { return needOf(r); });
    secs.push({
      no: "01", title: "用户是谁", layer: "FACT",
      blocks: [
        { type: "kv", title: "身份线索（原文明确出现）", items: segHints.map(function (x) { return { k: x.name, v: x.count + " 条" }; }) },
        { type: "dist", title: "产品经验分布", items: expDist },
        { type: "dist", title: "需求强度分布", items: needDist }
      ]
    });

    // 02 场景（FACT）
    var scen = (typeof root.ciSceneAgg === "function") ? root.ciSceneAgg(recs, 6) : {};
    var freq = scen.frequency || { once: 0, recurring: 0, unknown: 0 };
    secs.push({
      no: "02", title: "场景", layer: "FACT",
      blocks: [
        { type: "kv", title: "时间", items: (scen.time || []).map(function (x) { return { k: x.name, v: x.count + " 条" }; }) },
        { type: "kv", title: "地点", items: (scen.place || []).map(function (x) { return { k: x.name, v: x.count + " 条" }; }) },
        { type: "kv", title: "活动", items: (scen.activity || []).map(function (x) { return { k: x.name, v: x.count + " 条" }; }) },
        { type: "kv", title: "触发条件", items: (scen.trigger || []).map(function (x) { return { k: x.name, v: x.count + " 条" }; }) },
        { type: "dist", title: "发生频率", items: [{ k: "一次性", v: freq.once }, { k: "反复", v: freq.recurring }, { k: "未知", v: freq.unknown }] }
      ]
    });

    // 03 问题（FACT）
    var cores = topValues(recs, function (r) { return coreOf(r) || null; }, 8);
    var symptoms = topValues(recs, function (r) {
      var s = (recExtracted(r).problem || {}).symptoms || [];
      return s.length ? s.join("/") : null;
    }, 8);
    secs.push({
      no: "03", title: "问题", layer: "FACT",
      blocks: [
        { type: "kv", title: "核心问题（按提及排序）", items: cores.map(function (x) { return { k: x.name, v: x.count + " 条" }; }) },
        { type: "kv", title: "具体表现", items: symptoms.map(function (x) { return { k: x.name, v: x.count + " 条" }; }) }
      ]
    });

    // 04 痛点真实性（INTERPRETATION）
    var confirmed = agg.pain_confirmed_users || 0;
    var relevant = agg.relevant_users || 0;
    var rate = relevant ? Math.round(confirmed / relevant * 100) : 0;
    var au = agg.audit || { clean: 0, flagged: 0, total: 0 };
    secs.push({
      no: "04", title: "痛点真实性", layer: "INTERPRETATION",
      blocks: [
        { type: "funnel", title: "Mention ≠ Pain 漏斗（6 项计数）", items: [
          { k: "提及条数", v: agg.mention_count || 0 },
          { k: "去重用户", v: agg.unique_users || 0 },
          { k: "相关用户(≥E2)", v: relevant },
          { k: "明确痛苦", v: confirmed },
          { k: "寻求方案", v: agg.solution_seeking_users || 0 },
          { k: "已换/购产品", v: agg.purchase_users || 0 }
        ] },
        { type: "note", title: "真实性判读", text: "去重用户中 " + confirmed + " 人（" + rate + "%）进入真实困扰阶段（recurring 及以后）。其余仅为提及或亲历，不构成刚需证据。" },
        { type: "note", title: "规则审计", text: au.flagged === 0 ? ("✅ " + au.clean + "/" + au.total + " 条记录未发现无原文支撑的判断") : ("⚠️ " + au.flagged + "/" + au.total + " 条存在疑点，请回看原文") }
      ]
    });

    // 05 现有方案（FACT）
    var solDesc = topValues(recs, function (r) {
      var d = solutionOf(r).solution_desc;
      return (d && d !== "unknown") ? d : null;
    }, 6);
    var satDist = distEnum(recs, function (r) { return solutionOf(r).satisfaction; });
    secs.push({
      no: "05", title: "现有方案", layer: "FACT",
      blocks: [
        { type: "kv", title: "用户采用的方案", items: solDesc.map(function (x) { return { k: x.name, v: x.count + " 条" }; }) },
        { type: "dist", title: "满意度分布", items: satDist },
        { type: "note", title: "口径提醒", text: "已采用方案 " + (agg.solution_adopted_users || 0) + " 人，其中明确不满 " + (agg.dissatisfied_users || 0) + " 人。购买≠已解决，采用≠满意。" }
      ]
    });

    // 06 生命周期（INTERPRETATION）
    var pdist = (typeof root.ciPainDist === "function") ? root.ciPainDist(recs) : [];
    secs.push({
      no: "06", title: "用户生命周期", layer: "INTERPRETATION",
      blocks: [
        { type: "lifecycle", title: "痛点状态沿生命周期分布", items: LIFECYCLE.map(function (x) {
          var found = pdist.filter(function (d) { return d.status === x.status; })[0];
          return { status: x.status, stage: x.stage, desc: x.desc, mentions: found ? found.mentions : 0, users: found ? found.users : 0 };
        }) }
      ]
    });

    // 07 机会（HYPOTHESIS）
    var opps = ciOpportunities(recs, agg, themes);
    secs.push({
      no: "07", title: "机会方向", layer: "HYPOTHESIS",
      blocks: [
        { type: "opps", title: "由证据推导的待验证机会", items: opps },
        { type: "note", title: "假设声明", text: "以下均为基于当前证据的可验证假设，非结论。需经用户访谈 / 原型测试进一步确认。" }
      ]
    });

    // 08 Evidence（FACT）
    secs.push({
      no: "08", title: "Evidence · 证据溯源", layer: "FACT",
      blocks: [
        { type: "evidence", title: "全部原始记录", count: recs.length }
      ]
    });

    return secs;
  }

  function distEnum(records, pickFn) {
    var cnt = {};
    records.forEach(function (r) { var v = pickFn(r) || "unknown"; cnt[v] = (cnt[v] || 0) + 1; });
    var order = ["none", "owned", "used", "unknown", "low", "medium", "high", "satisfied", "dissatisfied", "mixed"];
    return Object.keys(cnt).sort(function (a, b) {
      var ia = order.indexOf(a), ib = order.indexOf(b);
      if (ia < 0) ia = 99; if (ib < 0) ib = 99;
      return ia - ib;
    }).map(function (k) { return { k: k, v: cnt[k] }; });
  }

  // ---------------- 机会假设（HYPOTHESIS）----------------
  function ciOpportunities(records, agg, themes) {
    var recs = records || [];
    var out = [];
    var add = function (text, basis, weight) { out.push({ text: text, basis: basis, weight: weight || "中" }); };

    if ((agg.dissatisfied_users || 0) > 0)
      add("现有方案被明确差评（" + agg.dissatisfied_users + " 人），存在『更好替代方案』的替换机会", "dissatisfied_users=" + agg.dissatisfied_users, "高");
    if ((agg.pain_confirmed_users || 0) > 0 && (agg.solved_users || 0) === 0)
      add("刚需反复出现却无人真正解决（确认痛苦 " + agg.pain_confirmed_users + " 人，已解决 0 人），存在『首款真正解决问题』的机会", "pain_confirmed=" + agg.pain_confirmed_users + ",solved=0", "高");
    if ((agg.impacted_users || 0) > 0)
      add("已造成实际后果（" + agg.impacted_users + " 人任务中断/被迫改变行为），痛点真实，优先级高", "impacted_users=" + agg.impacted_users, "高");
    var needHigh = recs.filter(function (r) { return needOf(r) === "high"; }).length;
    if (needHigh > 0)
      add("高需求强度人群（" + needHigh + " 人），适合做针对性场景优化而非通用方案", "need_strength=high " + needHigh, "中");
    var freq = (typeof root.ciSceneAgg === "function") ? root.ciSceneAgg(recs, 1).frequency : { recurring: 0 };
    if ((freq.recurring || 0) >= 3)
      add("高频反复场景（" + freq.recurring + " 条 recurring），适合做成默认能力而非外设配件", "frequency.recurring=" + freq.recurring, "中");

    // 来自主题聚类的机会
    (themes || []).forEach(function (t) {
      t.opportunities.forEach(function (o) {
        add("【" + t.name + "】" + o.text, o.basis, "中");
      });
    });

    if (!out.length) add("当前证据不足以推导明确机会，建议补充更多高证据等级（E4+）样本", "sample_insufficient", "低");
    return out;
  }

  // ---------------- 编排 ----------------
  function ciBuildReport(research, records) {
    var recs = records || [];
    var agg = (typeof root.ciAggregate === "function") ? root.ciAggregate(recs) : { mention_count: recs.length, unique_users: recs.length, relevant_users: 0, pain_confirmed_users: 0, solution_adopted_users: 0, dissatisfied_users: 0, impacted_users: 0, solved_users: 0, audit: null };
    var themes = ciClusterThemes(recs);
    return {
      inputs: {
        subject: (research && research.subject) || "",
        targetUsers: (research && research.targetUsers) || "",
        platforms: (research && research.platforms) || [],
        timeWindow: (research && research.timeWindow && research.timeWindow.label) || ""
      },
      pipeline: [
        { stage: "①", label: "原始表达", desc: "用户原话 / 评论原文" },
        { stage: "②", label: "用户事件", desc: "逐条提取 13 字段事实" },
        { stage: "③", label: "主题聚类", desc: "按核心问题归并" },
        { stage: "④", label: "痛点判断", desc: "pain.status 真实性校验" },
        { stage: "⑤", label: "用户状态", desc: "生命周期定位" },
        { stage: "⑥", label: "洞察", desc: "8 段结构化解读" },
        { stage: "⑦", label: "机会", desc: "待验证假设" }
      ],
      cards: ciInsightCards(research, recs, agg),
      sections: ciReportSections(research, recs, agg, themes),
      themes: themes,
      opportunities: ciOpportunities(recs, agg, themes),
      agg: agg
    };
  }

  root.ciClusterThemes = ciClusterThemes;
  root.ciInsightCards = ciInsightCards;
  root.ciReportSections = ciReportSections;
  root.ciOpportunities = ciOpportunities;
  root.ciBuildReport = ciBuildReport;
  root.CI_LIFECYCLE = LIFECYCLE;

})(typeof globalThis !== "undefined" ? globalThis : this);
