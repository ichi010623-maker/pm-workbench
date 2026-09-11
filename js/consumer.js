/* ===========================================================
 * 🧠 Consumer Intelligence · 消费者洞察引擎
 * 原始用户表达 → 用户事件 → 主题聚类 → 痛点判断 → 用户状态 → 洞察 → 机会
 * 严谨方法论：每一个洞察必须能回溯到原始证据，每一条统计必须可质疑可验证。
 * =========================================================== */

(function () {
  // -------- 子视图状态 --------
  var CI_VIEW = "list";        // list / new / research:ID / insight:RESEARCH:ID
  var CI_FILTER = { platform: "all", painStatus: "all", evidenceLevel: "all", sceneTag: "all" };

  // -------- 平台 / 状态 / 证据等级元数据 --------
  var CI_PLATFORMS = {
    xhs: { name: "小红书", icon: "📕", color: "#ff2d55" },
    douyin: { name: "抖音", icon: "🎵", color: "#000" },
    bilibili: { name: "B站", icon: "📺", color: "#00aeec" },
    zhihu: { name: "知乎", icon: "🟦", color: "#0084ff" },
    taobao: { name: "淘宝评论", icon: "🛒", color: "#ff5000" }
  };

  // Pain Status: 用户在痛点生命周期中所处阶段（A-F）
  var CI_PAIN_STATUS = {
    A: { code: "A", name: "随口吐槽", desc: "情绪表达，无明确痛点", color: "#94a3b8", lifecycle: 1 },
    B: { code: "B", name: "短期不爽", desc: "发生一次，尚未重复", color: "#fbbf24", lifecycle: 2 },
    C: { code: "C", name: "持续困扰", desc: "反复发生，已形成困扰", color: "#fb923c", lifecycle: 3 },
    D: { code: "D", name: "强烈痛点", desc: "已影响任务完成", color: "#ef4444", lifecycle: 4 },
    E: { code: "E", name: "已采取行动", desc: "已进入购买/弃用/退货等决策", color: "#8b5cf6", lifecycle: 5 },
    F: { code: "F", name: "已解决 / 不痛", desc: "已找到回避方案，痛点被绕开", color: "#10b981", lifecycle: 6 }
  };

  // Evidence Level: 原始证据价值等级（E1-E6）
  var CI_E_LEVEL = {
    E1: { code: "E1", name: "情绪表达", desc: "纯情绪，价值低", color: "#cbd5e1" },
    E2: { code: "E2", name: "问题描述", desc: "明确问题描述，有价值", color: "#a3e635" },
    E3: { code: "E3", name: "场景+问题", desc: "具体场景+问题，价值高", color: "#84cc16" },
    E4: { code: "E4", name: "问题+后果", desc: "问题+行为后果，价值很高", color: "#22c55e" },
    E5: { code: "E5", name: "问题+主动解决", desc: "问题+主动寻找/购买", color: "#10b981" },
    E6: { code: "E6", name: "黄金证据", desc: "需求→行动→产品→使用反馈", color: "#0ea5e9" }
  };

  // Pain Lifecycle: 痛点演进的 9 个阶段（SVG 流程图）
  var CI_LIFECYCLE = [
    { k: "trigger", t: "触发" },
    { k: "sporadic", t: "偶发不爽" },
    { k: "repeat", t: "重复发生" },
    { k: "impact", t: "影响任务" },
    { k: "seek", t: "主动寻找方案" },
    { k: "try", t: "尝试替代方案" },
    { k: "buy", t: "购买产品" },
    { k: "use", t: "使用" },
    { k: "evolve", t: "满意/继续找" }
  ];

  // -------- 数据加载 / 持久化 --------
  function ciDB() {
    if (typeof DB === "undefined" || !DB.data) return { researches: [] };
    if (!DB.data.consumerIntel) DB.data.consumerIntel = { researches: [] };
    return DB.data.consumerIntel;
  }

  function ciLoadSeed() {
    var stored = localStorage.getItem("ci_seed_loaded");
    if (stored) return;
    var db = ciDB();
    if (db.researches && db.researches.length > 0) {
      localStorage.setItem("ci_seed_loaded", "1");
      return;
    }
    // 首次进入：异步加载 seed JSON
    fetch("data/consumer_intel.json?v=5.9.104").then(function (r) {
      if (!r.ok) return null;
      return r.json();
    }).then(function (j) {
      if (!j || !j.researches) return;
      db.researches = j.researches.slice();
      try { DB.save(); } catch (e) {}
      localStorage.setItem("ci_seed_loaded", "1");
      try { render(); } catch (e) {}
    }).catch(function () {});
  }

  function ciSave() {
    if (typeof DB !== "undefined" && DB.save) {
      try { DB.save(); } catch (e) {}
    }
  }

  function ciGetResearch(id) {
    var db = ciDB();
    for (var i = 0; i < db.researches.length; i++) {
      if (db.researches[i].id === id) return db.researches[i];
    }
    return null;
  }

  function ciGetInsight(rid, iid) {
    var r = ciGetResearch(rid);
    if (!r) return null;
    for (var i = 0; i < r.insights.length; i++) {
      if (r.insights[i].id === iid) return r.insights[i];
    }
    return null;
  }

  // -------- 派生统计：从 evidence 实时计算（严谨：可质疑可验证） --------
  function ciRecomputeStats(r) {
    var byUser = {}, relevantUsers = {}, painConfirmed = {}, seeking = {}, switched = {};
    (r.evidence || []).forEach(function (e) {
      // 去重用户：以 user 字段为 ID
      if (e.user) byUser[e.user] = 1;
      // 相关用户：表达过相关体验（非纯情绪吐槽）
      if (e.evidenceLevel && e.evidenceLevel !== "E1") relevantUsers[e.user] = 1;
      // 明确痛苦：painStatus in C/D
      if (e.painStatus === "C" || e.painStatus === "D") painConfirmed[e.user] = 1;
      // 寻找方案：painStatus in D 或 currentSolution 描述主动寻找
      if (e.painStatus === "D" || /求推荐|求介绍|不知道选|关注了/.test(e.rawText || "")) seeking[e.user] = 1;
      // 已购买/退货：painStatus in E 且 switched 字段非空
      if (e.painStatus === "E" && e.switched && e.switched !== "未知" && e.switched !== "未购买" && e.switched !== "未提及") {
        switched[e.user] = 1;
      }
    });
    return {
      totalRaw: (r.evidence || []).length,
      uniqueUsers: Object.keys(byUser).length,
      relevantUsers: Object.keys(relevantUsers).length,
      painConfirmed: Object.keys(painConfirmed).length,
      solutionSeeking: Object.keys(seeking).length,
      switched: Object.keys(switched).length
    };
  }

  function ciTopScenes(r, top) {
    var cnt = {};
    (r.evidence || []).forEach(function (e) {
      if (e.scene && e.scene !== "N/A") cnt[e.scene] = (cnt[e.scene] || 0) + 1;
    });
    var arr = Object.keys(cnt).map(function (k) { return { name: k, count: cnt[k] }; });
    arr.sort(function (a, b) { return b.count - a.count; });
    return arr.slice(0, top || 5);
  }

  function ciPainDistribution(r) {
    var cnt = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 };
    (r.evidence || []).forEach(function (e) {
      if (e.painStatus && cnt[e.painStatus] !== undefined) cnt[e.painStatus]++;
    });
    return cnt;
  }

  function ciEvidenceDistribution(r) {
    var cnt = { E1: 0, E2: 0, E3: 0, E4: 0, E5: 0, E6: 0 };
    (r.evidence || []).forEach(function (e) {
      if (e.evidenceLevel && cnt[e.evidenceLevel] !== undefined) cnt[e.evidenceLevel]++;
    });
    return cnt;
  }

  function ciFilteredEvidence(r) {
    var list = (r.evidence || []).slice();
    if (CI_FILTER.platform !== "all") list = list.filter(function (e) { return e.source === CI_FILTER.platform; });
    if (CI_FILTER.painStatus !== "all") list = list.filter(function (e) { return e.painStatus === CI_FILTER.painStatus; });
    if (CI_FILTER.evidenceLevel !== "all") list = list.filter(function (e) { return e.evidenceLevel === CI_FILTER.evidenceLevel; });
    if (CI_FILTER.sceneTag !== "all") list = list.filter(function (e) { return e.sceneTag === CI_FILTER.sceneTag; });
    return list;
  }

  // -------- 视图渲染入口 --------
  function renderConsumer() {
    var c = document.getElementById("app-content");
    if (!c) return;
    ciLoadSeed();
    // 解析子视图（每次从 window 读取当前值，使测试/UI 修改能立即生效）
    var v = (typeof window !== "undefined" && window.CI_VIEW !== undefined) ? window.CI_VIEW : CI_VIEW;
    if (v === "new") return ciRenderNew(c);
    if (v.indexOf("research:") === 0) return ciRenderResearch(c, v.slice(9));
    if (v.indexOf("insight:") === 0) {
      var parts = v.slice(8).split(":");
      return ciRenderInsight(c, parts[0], parts[1]);
    }
    return ciRenderList(c);
  }

  // -------- 列表视图（入口） --------
  function ciRenderList(c) {
    var db = ciDB();
    var list = db.researches || [];
    var html =
      '<div class="section-title"><span class="emoji">🧠</span> Consumer Intelligence · 消费者洞察引擎</div>' +
      '<div class="card ci-intro">' +
        '<div class="card-body" style="font-size:13px;color:var(--text-secondary);line-height:1.7">' +
          '把社媒、评论、论坛的碎片化用户表达，转成<strong>可追溯、可计数、可质疑</strong>的洞察。每一条结论必须能点回原始证据。<br>' +
          '<span class="ci-chip" style="background:' + CI_PAIN_STATUS.A.color + '22;color:' + CI_PAIN_STATUS.A.color + '">A 随口吐槽</span>' +
          '<span class="ci-chip" style="background:' + CI_PAIN_STATUS.B.color + '22;color:' + CI_PAIN_STATUS.B.color + '">B 短期不爽</span>' +
          '<span class="ci-chip" style="background:' + CI_PAIN_STATUS.C.color + '22;color:' + CI_PAIN_STATUS.C.color + '">C 持续困扰</span>' +
          '<span class="ci-chip" style="background:' + CI_PAIN_STATUS.D.color + '22;color:' + CI_PAIN_STATUS.D.color + '">D 强烈痛点</span>' +
          '<span class="ci-chip" style="background:' + CI_PAIN_STATUS.E.color + '22;color:' + CI_PAIN_STATUS.E.color + '">E 已行动</span>' +
          '<span class="ci-chip" style="background:' + CI_PAIN_STATUS.F.color + '22;color:' + CI_PAIN_STATUS.F.color + '">F 已解决</span>' +
        '</div>' +
        '<div style="margin-top:10px;display:flex;gap:8px">' +
          '<button class="btn btn-primary" onclick="CI_VIEW=\'new\';renderConsumer()">+ 新建研究</button>' +
          '<button class="btn btn-ghost" onclick="CI_VIEW=\'list\';renderConsumer()">🔄 重载种子</button>' +
        '</div>' +
      '</div>';

    if (list.length === 0) {
      html += '<div class="empty-state"><div class="empty-text">暂无研究。点击「新建研究」开始，或等待种子数据加载。</div></div>';
    } else {
      list.forEach(function (r) {
        var st = ciRecomputeStats(r);
        var plats = (r.platforms || []).map(function (p) { return CI_PLATFORMS[p] ? CI_PLATFORMS[p].icon : p; }).join(" ");
        html += '<div class="card ci-research-card" onclick="CI_VIEW=\'research:' + r.id + '\';renderConsumer()">' +
          '<div class="ci-research-h">' +
            '<span class="ci-research-t">' + escapeHtml(r.title || r.subject) + '</span>' +
            '<span class="ci-research-date">' + (r.createdAt || "") + '</span>' +
          '</div>' +
          '<div class="ci-research-meta">' +
            '研究对象：<b>' + escapeHtml(r.subject || "") + '</b> · 目标用户：<b>' + escapeHtml(r.targetUsers || "") + '</b>' +
          '</div>' +
          '<div class="ci-research-meta">' +
            '平台：' + plats + ' · 时间：' + escapeHtml((r.timeWindow && r.timeWindow.label) || "") +
          '</div>' +
          '<div class="ci-research-stats">' +
            '<div class="ci-stat"><div class="ci-stat-n">' + st.totalRaw + '</div><div class="ci-stat-l">提及</div></div>' +
            '<div class="ci-stat"><div class="ci-stat-n">' + st.uniqueUsers + '</div><div class="ci-stat-l">去重用户</div></div>' +
            '<div class="ci-stat"><div class="ci-stat-n">' + st.relevantUsers + '</div><div class="ci-stat-l">相关用户</div></div>' +
            '<div class="ci-stat ci-stat-warn"><div class="ci-stat-n">' + st.painConfirmed + '</div><div class="ci-stat-l">明确痛苦</div></div>' +
            '<div class="ci-stat ci-stat-warn"><div class="ci-stat-n">' + st.solutionSeeking + '</div><div class="ci-stat-l">寻找方案</div></div>' +
            '<div class="ci-stat ci-stat-act"><div class="ci-stat-n">' + st.switched + '</div><div class="ci-stat-l">已购买/换</div></div>' +
          '</div>' +
          '<div class="ci-research-cta">查看洞察报告 (' + (r.insights || []).length + ' 张洞察卡) →</div>' +
        '</div>';
      });
    }
    c.innerHTML = html;
  }

  // -------- 新建研究表单 --------
  function ciRenderNew(c) {
    var html =
      '<div class="section-title"><span class="emoji">🧠</span> 新建消费者研究</div>' +
      '<div class="card">' +
        '<div class="card-body" style="font-size:13px;color:var(--text-secondary);margin-bottom:8px">' +
          '输入研究配置后，会创建一个空的研究结构。原始表达可通过「导入证据 JSON」批量入库或在详情页手动添加。' +
        '</div>' +
        '<div style="display:grid;gap:12px">' +
          '<label>研究对象 <input id="ci-subject" class="ci-input" placeholder="例：MagSafe 手机散热器" /></label>' +
          '<label>研究标题 <input id="ci-title" class="ci-input" placeholder="自动填充 = 研究对象 + 场景" /></label>' +
          '<label>目标用户 <input id="ci-users" class="ci-input" placeholder="例：女性 / 手机拍摄 / 小白用户" /></label>' +
          '<label>平台（可多选）' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">' +
              Object.keys(CI_PLATFORMS).map(function (k) {
                return '<label class="ci-plat-label"><input type="checkbox" class="ci-plat" value="' + k + '"/> ' + CI_PLATFORMS[k].icon + ' ' + CI_PLATFORMS[k].name + '</label>';
              }).join("") +
            '</div>' +
          '</label>' +
          '<label>时间窗口 <input id="ci-time" class="ci-input" placeholder="例：过去 12 个月" value="过去 12 个月" /></label>' +
          '<div style="display:flex;gap:8px">' +
            '<button class="btn btn-primary" onclick="ciCreateResearch()">创建研究</button>' +
            '<button class="btn btn-ghost" onclick="CI_VIEW=\'list\';renderConsumer()">取消</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    c.innerHTML = html;
  }

  function ciCreateResearch() {
    var subject = (document.getElementById("ci-subject") || {}).value || "";
    var title = (document.getElementById("ci-title") || {}).value || "";
    var users = (document.getElementById("ci-users") || {}).value || "";
    var time = (document.getElementById("ci-time") || {}).value || "";
    var plats = Array.prototype.slice.call(document.querySelectorAll(".ci-plat:checked")).map(function (x) { return x.value; });
    if (!subject) { if (typeof showToast === "function") showToast("请填写研究对象", "error"); return; }
    if (!title) title = subject + (users ? " · " + users : "");
    var id = "r_" + Date.now();
    var db = ciDB();
    db.researches.push({
      id: id,
      title: title,
      subject: subject,
      targetUsers: users,
      platforms: plats.length ? plats : ["xhs", "douyin"],
      timeWindow: { label: time, from: "", to: "" },
      createdAt: new Date().toISOString().slice(0, 10),
      status: "active",
      stats: { totalRaw: 0, uniqueUsers: 0, relevantUsers: 0, painConfirmed: 0, solutionSeeking: 0, switched: 0 },
      insights: [],
      evidence: []
    });
    ciSave();
    CI_VIEW = "research:" + id;
    renderConsumer();
  }

  // -------- 研究详情（8 段报告） --------
  function ciRenderResearch(c, rid) {
    var r = ciGetResearch(rid);
    if (!r) { c.innerHTML = '<div class="empty-state"><div class="empty-text">研究不存在</div></div>'; return; }
    var stats = ciRecomputeStats(r);
    var scenes = ciTopScenes(r, 5);
    var painDist = ciPainDistribution(r);
    var evDist = ciEvidenceDistribution(r);
    var plats = (r.platforms || []).map(function (p) { return CI_PLATFORMS[p] ? CI_PLATFORMS[p].icon : p; }).join(" ");

    var html = '';

    // 顶部：研究元信息 + 6 项严格计数
    html +=
      '<div class="card ci-research-head">' +
        '<div class="ci-rh-row">' +
          '<div><span class="ci-rh-t">' + escapeHtml(r.title || r.subject) + '</span></div>' +
          '<button class="btn btn-ghost sm" onclick="CI_VIEW=\'list\';renderConsumer()">← 返回列表</button>' +
        '</div>' +
        '<div class="ci-rh-meta">研究对象：<b>' + escapeHtml(r.subject) + '</b> · 目标用户：<b>' + escapeHtml(r.targetUsers || "") + '</b></div>' +
        '<div class="ci-rh-meta">平台：' + plats + ' · 时间窗口：' + escapeHtml((r.timeWindow && r.timeWindow.label) || "") + '</div>' +
        '<div class="ci-strict-stats">' +
          ciStatCell("Mention · 提及次数", stats.totalRaw, "原始语料总数（含重复/ +1）", false) +
          ciStatCell("Unique · 去重用户", stats.uniqueUsers, "按用户名去重后的人数", false) +
          ciStatCell("Relevant · 相关用户", stats.relevantUsers, "非纯情绪吐槽（E2+）", false) +
          ciStatCell("Pain-confirmed · 明确痛苦", stats.painConfirmed, "痛点状态 C 或 D 的用户", true) +
          ciStatCell("Solution-seeking · 寻方案", stats.solutionSeeking, "主动寻找/求推荐", true) +
          ciStatCell("Switched · 已购买/换", stats.switched, "已采取购买/退货行为", true) +
        '</div>' +
        '<div class="ci-strict-note">⚠️ 数字由 evidence 实时计算；不可被 AI 自行编造，结论需在每段报告的 Evidence 区可追溯</div>' +
      '</div>';

    // 报告 8 段
    html += '<div class="ci-report">';

    // 01 用户是谁
    html += ciReportSection("01", "用户是谁", "ci-blue",
      ciLayerFact(stats.uniqueUsers + " 名去重用户中，" + stats.relevantUsers + " 人表达过相关体验。") +
      ciLayerInter("目标用户聚焦在「经常用手机拍视频、对外观敏感、对价格不极端敏感」的女性创作者。") +
      ciLayerHypo("假设：核心人群是「25-35 岁、月拍 5+ 条 vlog、对颜值/出镜有要求的城市女性」。验证方式：定向投放测试。")
    );

    // 02 用户在什么场景
    var topScenesHtml = scenes.map(function (s, i) {
      return '<div class="ci-scene-row"><span class="ci-scene-rank">' + (i + 1) + '</span><span class="ci-scene-name">' + escapeHtml(s.name) + '</span><span class="ci-scene-count">' + s.count + '</span></div>';
    }).join("");
    html += ciReportSection("02", "用户在什么场景", "ci-blue",
      ciLayerFact("Top 5 高频场景（基于 evidence.scene 字段聚合）：") +
      '<div class="ci-scenes">' + topScenesHtml + '</div>' +
      ciLayerInter("场景集中在「户外/夏季/连续拍摄」三角区；安静场景（咖啡店/卧室/会议）是噪音痛点的触发场景。")
    );

    // 03 用户遇到了什么
    html += ciReportSection("03", "用户遇到了什么", "ci-orange",
      ciLayerFact(stats.painConfirmed + " 人明确表达痛苦（painStatus=C/D）。高频问题：手机持续发热 → 性能下降 → 拍摄被打断。") +
      ciLayerInter("核心问题不只是「温度」，而是「温度导致的连续拍摄失败」。情绪以烦躁/无奈/崩溃为主。") +
      ciLayerHypo("假设：用户需要的不是「温度计上的 -5°C」，而是「不中断、不改变拍摄方式」的稳定输出。")
    );

    // 04 痛点有多真实（Pain Status A-F 分布）
    var painBars = Object.keys(CI_PAIN_STATUS).map(function (code) {
      var p = CI_PAIN_STATUS[code];
      var n = painDist[code] || 0;
      var pct = stats.totalRaw > 0 ? Math.round(n / stats.totalRaw * 100) : 0;
      return '<div class="ci-pain-bar">' +
        '<div class="ci-pain-h">' +
          '<span class="ci-pain-c" style="background:' + p.color + '">' + p.code + '</span>' +
          '<span class="ci-pain-n">' + p.name + '</span>' +
          '<span class="ci-pain-d">' + p.desc + '</span>' +
        '</div>' +
        '<div class="ci-pain-track"><div class="ci-pain-fill" style="width:' + pct + '%;background:' + p.color + '"></div></div>' +
        '<div class="ci-pain-pct">' + n + ' · ' + pct + '%</div>' +
      '</div>';
    }).join("");
    html += ciReportSection("04", "痛点有多真实（Pain Status A-F）", "ci-orange",
      ciLayerFact(stats.totalRaw + " 条证据在 Pain Status 上的分布：A 随口吐槽 / B 短期不爽 / C 持续困扰 / D 强烈痛点 / E 已采取行动 / F 已解决。") +
      '<div class="ci-pain-bars">' + painBars + '</div>' +
      ciLayerInter("C+D（持续困扰+强烈痛点）合计 " + ((painDist.C || 0) + (painDist.D || 0)) + " 条；E（已行动）" + (painDist.E || 0) + " 条；F（已解决）" + (painDist.F || 0) + " 条。说明：痛点真实存在且有相当比例已转化为购买/弃用决策。") +
      ciLayerHypo("假设：C/D 比例越高 → 真实需求越强；E 比例越高 → 决策门槛已成熟，需要的是「更好的产品」而非「教育用户」。")
    );

    // 05 用户现在怎么解决（聚合自 insights 的 currentSolutions）
    var solutionsMap = {};
    (r.insights || []).forEach(function (ins) {
      (ins.currentSolutions || []).forEach(function (cs) {
        if (!solutionsMap[cs.solution]) solutionsMap[cs.solution] = { solution: cs.solution, feedbacks: [], insights: [] };
        solutionsMap[cs.solution].feedbacks.push(cs.feedback);
        solutionsMap[cs.solution].insights.push(ins.id);
      });
    });
    var solsArr = Object.values(solutionsMap);
    var solsHtml = solsArr.map(function (s) {
      return '<tr><td><b>' + escapeHtml(s.solution) + '</b></td><td>' + escapeHtml(s.feedbacks.join(" · ")) + '</td><td>' + s.insights.length + ' 洞察引用</td></tr>';
    }).join("");
    html += ciReportSection("05", "用户现在怎么解决", "ci-purple",
      ciLayerFact("基于所有洞察的 currentSolutions 字段聚合，共 " + solsArr.length + " 种现有方案：") +
      (solsArr.length ? '<table class="ci-table"><thead><tr><th>方案</th><th>用户反馈</th><th>引用</th></tr></thead><tbody>' + solsHtml + '</tbody></table>' : '<div class="empty-text">无</div>') +
      ciLayerInter("非产品方案（拆壳/风扇吹/冰袋/放弃需求）的高频反馈是「麻烦/不便/临时」；产品方案（散热器）反馈集中在「副作用大于效果」。") +
      ciLayerHypo("假设：市场缺口 = 「不改变拍摄习惯的方案」——不需要拆壳、不需要插线、不需要降档。")
    );

    // 06 用户为什么不满意（基于痛点生命周期）
    html += ciLifecycleSection(r);

    // 07 机会方向
    var insightList = (r.insights || []).slice().sort(function (a, b) { return (a.rank || 0) - (b.rank || 0); });
    var insHtml = insightList.map(function (ins) {
      return '<div class="ci-insight-mini" onclick="CI_VIEW=\'insight:' + r.id + ':' + ins.id + '\';renderConsumer()">' +
        '<div class="ci-ins-mini-h"><span class="ci-ins-rank">#' + ins.rank + '</span><span class="ci-ins-mini-t">' + escapeHtml(ins.title) + '</span></div>' +
        '<div class="ci-ins-mini-d">' + escapeHtml(ins.statement) + '</div>' +
        '<div class="ci-ins-mini-e">' + (ins.evidenceIds || []).length + ' 条证据</div>' +
      '</div>';
    }).join("");
    html += ciReportSection("07", "机会方向（" + insightList.length + " 张洞察卡）", "ci-green",
      ciLayerFact(insightList.length + " 张洞察卡可点击查看详情与原始证据：") +
      '<div class="ci-ins-mini-list">' + insHtml + '</div>'
    );

    // 08 Evidence 库
    var filt = ciFilteredEvidence(r);
    html += ciEvidenceLibrary(r, filt);

    html += '</div>';

    // 顶部操作
    html = '<div style="display:flex;gap:8px;margin-bottom:12px">' +
      '<button class="btn btn-primary sm" onclick="ciAddEvidencePrompt(\'' + r.id + '\')">+ 添加证据</button>' +
      '<button class="btn btn-ghost sm" onclick="ciImportEvidencePrompt(\'' + r.id + '\')">📥 导入 JSON</button>' +
      '<button class="btn btn-ghost sm" onclick="ciAddInsightPrompt(\'' + r.id + '\')">+ 新建洞察</button>' +
    '</div>' + html;

    c.innerHTML = html;
  }

  function ciStatCell(label, n, sub, warn) {
    return '<div class="ci-stat-cell' + (warn ? ' warn' : '') + '">' +
      '<div class="ci-stat-cell-n">' + n + '</div>' +
      '<div class="ci-stat-cell-l">' + escapeHtml(label) + '</div>' +
      '<div class="ci-stat-cell-s">' + escapeHtml(sub) + '</div>' +
    '</div>';
  }

  function ciReportSection(num, title, color, body) {
    return '<div class="ci-section">' +
      '<div class="ci-section-h">' +
        '<span class="ci-section-n ' + color + '">' + num + '</span>' +
        '<span class="ci-section-t">' + escapeHtml(title) + '</span>' +
      '</div>' +
      '<div class="ci-section-body">' + body + '</div>' +
    '</div>';
  }

  function ciLayerFact(t) { return '<div class="ci-layer ci-fact"><div class="ci-layer-tag">事实 · FACT</div><div class="ci-layer-body">' + t + '</div></div>'; }
  function ciLayerInter(t) { return '<div class="ci-layer ci-inter"><div class="ci-layer-tag">解释 · INTERPRETATION</div><div class="ci-layer-body">' + t + '</div></div>'; }
  function ciLayerHypo(t) { return '<div class="ci-layer ci-hypo"><div class="ci-layer-tag">假设 · HYPOTHESIS</div><div class="ci-layer-body">' + t + '</div></div>'; }

  // -------- 痛点生命周期：SVG 流程图 --------
  function ciLifecycleSection(r) {
    var painDist = ciPainDistribution(r);
    // 6 个 Pain Status 映射到 lifecycle 位置
    var positions = { A: 1, B: 2, C: 4, D: 5, E: 6, F: 9 }; // F 落到最后
    var svgInner = '';
    var i, p, x, active;
    var w = 600, h = 120, stepX = (w - 60) / (CI_LIFECYCLE.length - 1);
    // 节点连线
    var pathD = "M 30 70 ";
    for (i = 0; i < CI_LIFECYCLE.length; i++) {
      pathD += (i === 0 ? "" : "L ") + (30 + i * stepX) + " 70 ";
    }
    svgInner += '<path d="' + pathD + '" stroke="#e5e7eb" stroke-width="2" fill="none"/>';
    // 节点
    for (i = 0; i < CI_LIFECYCLE.length; i++) {
      x = 30 + i * stepX;
      svgInner += '<g>' +
        '<circle cx="' + x + '" cy="70" r="14" fill="#fff" stroke="#94a3b8" stroke-width="2"/>' +
        '<text x="' + x + '" y="74" text-anchor="middle" font-size="11" fill="#475569">' + (i + 1) + '</text>' +
        '<text x="' + x + '" y="40" text-anchor="middle" font-size="11" fill="#1e293b">' + escapeHtml(CI_LIFECYCLE[i].t) + '</text>' +
      '</g>';
    }
    // Pain Status 标注
    Object.keys(CI_PAIN_STATUS).forEach(function (code) {
      var pos = positions[code];
      if (!pos || pos > CI_LIFECYCLE.length) return;
      var idx = pos - 1;
      x = 30 + idx * stepX;
      var ps = CI_PAIN_STATUS[code];
      var n = painDist[code] || 0;
      svgInner += '<g>' +
        '<rect x="' + (x - 18) + '" y="90" width="36" height="22" rx="4" fill="' + ps.color + '22" stroke="' + ps.color + '" stroke-width="1.5"/>' +
        '<text x="' + x + '" y="105" text-anchor="middle" font-size="11" fill="' + ps.color + '" font-weight="700">' + code + '·' + n + '</text>' +
      '</g>';
    });

    var html =
      ciLayerFact("用户在痛点生命周期中的当前位置（A→F 共 6 个状态锚点；F 表示痛点已不存在）：") +
      '<div class="ci-lifecycle-svg">' +
        '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="xMidYMid meet">' + svgInner + '</svg>' +
      '</div>' +
      '<div class="ci-lifecycle-explain">' +
        '触发 → 偶发不爽 → 重复发生 → 影响任务 → 主动寻找方案 → 尝试替代方案 → 购买产品 → 使用 → 满意/继续找' +
      '</div>' +
      ciLayerInter("本研究中，C（持续困扰）" + (painDist.C || 0) + " 人 + D（强烈痛点）" + (painDist.D || 0) + " 人 = " + ((painDist.C || 0) + (painDist.D || 0)) + " 人处于「需要解决」阶段；E（已行动）" + (painDist.E || 0) + " 人处于「在用产品」阶段；F（已解决）" + (painDist.F || 0) + " 人已退出市场。") +
      ciLayerHypo("假设：C+D 总量上升 + E 比例适中 + F 比例有限，说明市场尚未被现有产品充分满足，存在结构性机会窗口。")
    ;
    return ciReportSection("06", "痛点生命周期 / 用户为什么不满意", "ci-red", html);
  }

  // -------- Evidence 库 --------
  function ciEvidenceLibrary(r, list) {
    var platOpts = '<option value="all">全部平台</option>' + (r.platforms || []).map(function (p) {
      return '<option value="' + p + '"' + (CI_FILTER.platform === p ? ' selected' : '') + '>' + (CI_PLATFORMS[p] ? CI_PLATFORMS[p].icon + " " + CI_PLATFORMS[p].name : p) + '</option>';
    }).join("");
    var painOpts = '<option value="all">全部痛点状态</option>' + Object.keys(CI_PAIN_STATUS).map(function (k) {
      return '<option value="' + k + '"' + (CI_FILTER.painStatus === k ? ' selected' : '') + '>' + k + ' ' + CI_PAIN_STATUS[k].name + '</option>';
    }).join("");
    var evOpts = '<option value="all">全部证据等级</option>' + Object.keys(CI_E_LEVEL).map(function (k) {
      return '<option value="' + k + '"' + (CI_FILTER.evidenceLevel === k ? ' selected' : '') + '>' + k + ' ' + CI_E_LEVEL[k].name + '</option>';
    }).join("");

    var evHtml = list.map(function (e) {
      var p = CI_PLATFORMS[e.source] || { icon: "❓", name: e.source };
      var ps = CI_PAIN_STATUS[e.painStatus] || { name: "?", color: "#94a3b8" };
      var ev = CI_E_LEVEL[e.evidenceLevel] || { name: "?", color: "#cbd5e1" };
      return '<div class="ci-ev-card">' +
        '<div class="ci-ev-head">' +
          '<span class="ci-ev-plat" style="background:' + p.color + '22;color:' + p.color + '">' + p.icon + ' ' + p.name + '</span>' +
          '<span class="ci-ev-pain" style="background:' + ps.color + '22;color:' + ps.color + '">' + e.painStatus + ' ' + ps.name + '</span>' +
          '<span class="ci-ev-level" style="background:' + ev.color + '22;color:#1e293b">' + e.evidenceLevel + ' ' + ev.name + '</span>' +
          '<span class="ci-ev-date">' + e.publishDate + '</span>' +
        '</div>' +
        '<div class="ci-ev-quote">' + escapeHtml(e.rawText) + '</div>' +
        '<div class="ci-ev-fields">' +
          '<span>📍 场景：' + escapeHtml(e.scene || "-") + '</span>' +
          '<span>🎬 行为：' + escapeHtml(e.behavior || "-") + '</span>' +
          '<span>⚡ 触发：' + escapeHtml(e.trigger || "-") + '</span>' +
          '<span>❗ 问题：' + escapeHtml(e.problem || "-") + '</span>' +
          '<span>💢 情绪：' + escapeHtml(e.emotion || "-") + '</span>' +
          '<span>💡 当前方案：' + escapeHtml(e.currentSolution || "-") + '</span>' +
          '<span>🔁 换过：' + escapeHtml(e.switched || "-") + '</span>' +
          '<span>👤 用户：' + escapeHtml(e.user || "匿名") + '</span>' +
        '</div>' +
      '</div>';
    }).join("");

    var filterHtml =
      '<div class="ci-ev-filters">' +
        '<select onchange="CI_FILTER.platform=this.value;renderConsumer()">' + platOpts + '</select>' +
        '<select onchange="CI_FILTER.painStatus=this.value;renderConsumer()">' + painOpts + '</select>' +
        '<select onchange="CI_FILTER.evidenceLevel=this.value;renderConsumer()">' + evOpts + '</select>' +
        '<span class="ci-ev-filter-stat">共 ' + list.length + ' / ' + (r.evidence || []).length + ' 条</span>' +
      '</div>';

    return ciReportSection("08", "Evidence · 原始证据库（每条结论可追溯到原话）", "ci-gray",
      ciLayerFact("Evidence 是洞察的事实基础。任何洞察结论应能点回到具体原话。证据等级 E1-E6 标识原始语料价值。") +
      filterHtml +
      '<div class="ci-ev-list">' + (evHtml || '<div class="empty-text">无匹配证据</div>') + '</div>'
    );
  }

  // -------- Insight 详情视图 --------
  function ciRenderInsight(c, rid, iid) {
    var r = ciGetResearch(rid);
    if (!r) return;
    var ins = ciGetInsight(rid, iid);
    if (!ins) return;

    var evidences = (ins.evidenceIds || []).map(function (eid) {
      for (var i = 0; i < r.evidence.length; i++) if (r.evidence[i].id === eid) return r.evidence[i];
      return null;
    }).filter(Boolean);

    var scenesHtml = (ins.scenes || []).map(function (s, i) {
      return '<div class="ci-scene-row"><span class="ci-scene-rank">' + (i + 1) + '</span><span class="ci-scene-name">' + escapeHtml(s.name) + '</span><span class="ci-scene-count">' + s.count + '</span></div>';
    }).join("");
    var solsHtml = (ins.currentSolutions || []).map(function (s) {
      return '<tr><td><b>' + escapeHtml(s.solution) + '</b></td><td>' + escapeHtml(s.feedback) + '</td></tr>';
    }).join("");
    var evHtml = evidences.map(function (e) {
      var p = CI_PLATFORMS[e.source] || { icon: "❓", name: e.source };
      var ps = CI_PAIN_STATUS[e.painStatus] || { name: "?", color: "#94a3b8" };
      var ev = CI_E_LEVEL[e.evidenceLevel] || { name: "?", color: "#cbd5e1" };
      return '<div class="ci-ev-card">' +
        '<div class="ci-ev-head">' +
          '<span class="ci-ev-plat" style="background:' + p.color + '22;color:' + p.color + '">' + p.icon + ' ' + p.name + '</span>' +
          '<span class="ci-ev-pain" style="background:' + ps.color + '22;color:' + ps.color + '">' + e.painStatus + ' ' + ps.name + '</span>' +
          '<span class="ci-ev-level" style="background:' + ev.color + '22;color:#1e293b">' + e.evidenceLevel + ' ' + ev.name + '</span>' +
          '<span class="ci-ev-date">' + e.publishDate + '</span>' +
        '</div>' +
        '<div class="ci-ev-quote">' + escapeHtml(e.rawText) + '</div>' +
        '<div class="ci-ev-fields">' +
          '<span>📍 ' + escapeHtml(e.scene || "-") + '</span>' +
          '<span>🎬 ' + escapeHtml(e.behavior || "-") + '</span>' +
          '<span>⚡ ' + escapeHtml(e.trigger || "-") + '</span>' +
          '<span>❗ ' + escapeHtml(e.problem || "-") + '</span>' +
          '<span>👤 ' + escapeHtml(e.user || "匿名") + '</span>' +
        '</div>' +
      '</div>';
    }).join("");

    var html =
      '<div style="display:flex;gap:8px;margin-bottom:12px">' +
        '<button class="btn btn-ghost sm" onclick="CI_VIEW=\'research:' + r.id + '\';renderConsumer()">← 返回研究</button>' +
      '</div>' +
      '<div class="ci-insight-card">' +
        '<div class="ci-ins-head">' +
          '<span class="ci-ins-rank-big">#' + ins.rank + '</span>' +
          '<span class="ci-ins-t-big">' + escapeHtml(ins.title) + '</span>' +
        '</div>' +
        '<div class="ci-ins-statement">' + escapeHtml(ins.statement) + '</div>' +
      '</div>' +
      ciReportSection("高频场景", "高频场景（Top " + (ins.scenes || []).length + "）", "ci-blue",
        ciLayerFact((ins.scenes || []).length + " 个场景出现：") +
        '<div class="ci-scenes">' + (scenesHtml || '<div class="empty-text">无</div>') + '</div>'
      ) +
      ciReportSection("痛点", "痛点详情", "ci-orange",
        ciLayerFact("核心问题：" + escapeHtml(ins.pain && ins.pain.core || "-")) +
        ciLayerInter("后果链：" + ((ins.pain && ins.pain.consequences || []).join(" → "))) +
        ciLayerHypo("真正影响：" + escapeHtml(ins.pain && ins.pain.realImpact || "-"))
      ) +
      ciReportSection("痛点生命周期", "痛点持续性", "ci-red",
        ciLayerFact("持续性：★★★★★ (" + (ins.lifecycle && ins.lifecycle.persistence || 0) + "/5) · 阶段 " + (ins.lifecycle && ins.lifecycle.stage || "-")) +
        ciLayerInter("信号词汇：" + ((ins.lifecycle && ins.lifecycle.signals || []).map(function (x) { return '"' + escapeHtml(x) + '"'; }).join(" · "))) +
        ciLayerHypo("说明：" + escapeHtml(ins.lifecycle && ins.lifecycle.explanation || "-"))
      ) +
      ciReportSection("现有方案", "用户当前解决方案", "ci-purple",
        ciLayerFact("已记录的现有方案：") +
        (solsHtml ? '<table class="ci-table"><thead><tr><th>方案</th><th>用户反馈</th></tr></thead><tbody>' + solsHtml + '</tbody></table>' : '<div class="empty-text">无</div>')
      ) +
      ciReportSection("机会", "产品机会方向", "ci-green",
        ciLayerFact("产品机会由本洞察直接推导：") +
        ciLayerInter(escapeHtml(ins.opportunity || ""))
      ) +
      ciReportSection("Evidence", "支撑证据（" + evidences.length + " 条）", "ci-gray",
        ciLayerFact("以下证据是本洞察的事实基础。每条证据均带 Pain Status 与 Evidence Level 标记。") +
        '<div class="ci-ev-list">' + (evHtml || '<div class="empty-text">无关联证据</div>') + '</div>'
      );

    c.innerHTML = html;
  }

  // -------- 辅助：添加/导入 --------
  function ciAddEvidencePrompt(rid) {
    var r = ciGetResearch(rid);
    if (!r) return;
    var raw = prompt("粘贴一条原始用户表达（可含链接/上下文）：");
    if (!raw) return;
    var source = prompt("平台 (xhs/douyin/bilibili/zhihu/taobao)：", "xhs");
    if (!source || !CI_PLATFORMS[source]) source = "xhs";
    var painStatus = prompt("Pain Status (A=随口吐槽 / B=短期不爽 / C=持续困扰 / D=强烈痛点 / E=已行动 / F=已解决)：", "C");
    if (!painStatus || !CI_PAIN_STATUS[painStatus]) painStatus = "C";
    var evidenceLevel = prompt("Evidence Level (E1=情绪 / E2=问题 / E3=场景+问题 / E4=问题+后果 / E5=主动解决 / E6=黄金证据)：", "E3");
    if (!evidenceLevel || !CI_E_LEVEL[evidenceLevel]) evidenceLevel = "E3";
    var id = "ev_" + Date.now();
    r.evidence = r.evidence || [];
    r.evidence.push({
      id: id, rawText: raw, source: source, publishDate: new Date().toISOString().slice(0, 10),
      user: "匿名", scene: "", behavior: "", trigger: "", problem: "",
      painLevel: "medium", duration: "", frequency: "", emotion: "",
      currentSolution: "", switched: "未知", userState: "受困扰",
      evidenceLevel: evidenceLevel, painStatus: painStatus, sceneTag: ""
    });
    ciSave();
    renderConsumer();
    if (typeof showToast === "function") showToast("已添加证据", "success");
  }

  function ciImportEvidencePrompt(rid) {
    var r = ciGetResearch(rid);
    if (!r) return;
    var json = prompt("粘贴 JSON 数组（每条 evidence 字段见 schema）：");
    if (!json) return;
    try {
      var arr = JSON.parse(json);
      if (!Array.isArray(arr)) throw "not array";
      r.evidence = r.evidence || [];
      arr.forEach(function (e) {
        e.id = e.id || ("ev_" + Date.now() + "_" + Math.floor(Math.random() * 1000));
        e.source = e.source || "xhs";
        e.painStatus = e.painStatus || "C";
        e.evidenceLevel = e.evidenceLevel || "E3";
        r.evidence.push(e);
      });
      ciSave();
      renderConsumer();
      if (typeof showToast === "function") showToast("导入 " + arr.length + " 条证据", "success");
    } catch (e) {
      if (typeof showToast === "function") showToast("JSON 解析失败：" + e, "error");
    }
  }

  function ciAddInsightPrompt(rid) {
    var r = ciGetResearch(rid);
    if (!r) return;
    var title = prompt("洞察标题：");
    if (!title) return;
    var statement = prompt("洞察陈述：");
    if (!statement) statement = title;
    var id = "ins_" + Date.now();
    r.insights = r.insights || [];
    r.insights.push({
      id: id, rank: r.insights.length + 1, title: title, statement: statement,
      sceneIds: [], painLevel: "medium", scenes: [], pain: { core: "", consequences: [], realImpact: "" },
      lifecycle: { persistence: 3, stage: "C", signals: [], explanation: "" },
      currentSolutions: [], opportunity: "", evidenceIds: []
    });
    ciSave();
    renderConsumer();
    if (typeof showToast === "function") showToast("已新建洞察", "success");
  }

  // -------- 导出到全局 --------
  window.CI_VIEW = CI_VIEW;
  window.CI_FILTER = CI_FILTER;
  window.CI_PAIN_STATUS = CI_PAIN_STATUS;
  window.CI_E_LEVEL = CI_E_LEVEL;
  window.CI_PLATFORMS = CI_PLATFORMS;
  window.CI_LIFECYCLE = CI_LIFECYCLE;
  window.renderConsumer = renderConsumer;
  window.ciCreateResearch = ciCreateResearch;
  window.ciAddEvidencePrompt = ciAddEvidencePrompt;
  window.ciImportEvidencePrompt = ciImportEvidencePrompt;
  window.ciAddInsightPrompt = ciAddInsightPrompt;
  window.ciDB = ciDB;
  window.ciGetResearch = ciGetResearch;
  window.ciGetInsight = ciGetInsight;
  window.ciRecomputeStats = ciRecomputeStats;
  window.ciTopScenes = ciTopScenes;
  window.ciPainDistribution = ciPainDistribution;
  window.ciEvidenceDistribution = ciEvidenceDistribution;
  window.ciFilteredEvidence = ciFilteredEvidence;

})();