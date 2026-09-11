/* ===========================================================
 * 🧠 Consumer Intelligence · 消费者洞察引擎（UI / 渲染层）
 *
 * 架构（严格分层）：
 *   js/consumer/schema.js    枚举 + JSON Schema + 校验器
 *   js/consumer/prompt.js    提取 System Prompt（10 条最高优先级规则）
 *   js/consumer/rules.js     规则审计层（可质疑：确定性复核 AI 判断）
 *   js/consumer/extract.js   提取管线（单条 → LLM → 校验 → 落库）
 *   js/consumer/aggregate.js 聚合层（★ 只有这一层可以产出计数）
 *   js/consumer.js           本文件：视图渲染
 *
 * 唯一任务：从用户原始内容中提取「可被原文证据支持的结构化事实」。
 * 不是总结用户，不是提产品建议。
 * =========================================================== */

(function () {
  "use strict";

  var CI_VIEW = "list";
  var CI_FILTER = { source: "all", pain: "all", level: "all" };

  var PLATFORMS = {
    xhs: { name: "小红书", icon: "📕", color: "#ff2d55" },
    douyin: { name: "抖音", icon: "🎵", color: "#111" },
    bilibili: { name: "B站", icon: "📺", color: "#00aeec" },
    zhihu: { name: "知乎", icon: "🟦", color: "#0084ff" },
    taobao: { name: "淘宝评论", icon: "🛒", color: "#ff5000" },
    other: { name: "其他", icon: "❓", color: "#94a3b8" }
  };

  // ---------- 数据 ----------
  function ciDB() {
    if (typeof DB === "undefined" || !DB.data) return { researches: [] };
    if (!DB.data.consumerIntel) DB.data.consumerIntel = { researches: [] };
    return DB.data.consumerIntel;
  }
  function ciSave() { if (typeof DB !== "undefined" && DB.save) { try { DB.save(); } catch (e) {} } }
  function ciGet(id) {
    var list = ciDB().researches || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function ciRecords(r) { return (r && r.evidence) || []; }

  var seedTried = false;
  function ciLoadSeed() {
    if (seedTried) return;
    seedTried = true;
    if (localStorage.getItem("ci_seed_loaded")) return;
    var db = ciDB();
    if (db.researches && db.researches.length) { localStorage.setItem("ci_seed_loaded", "1"); return; }
    var ver = (typeof APP_VERSION !== "undefined") ? APP_VERSION : "0";
    fetch("data/consumer_intel.json?v=" + ver)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.researches) return;
        db.researches = j.researches.slice();
        ciSave();
        localStorage.setItem("ci_seed_loaded", "1");
        try { render(); } catch (e) {}
      }).catch(function () {});
  }

  function filt() {
    return (typeof window !== "undefined" && window.CI_FILTER) ? window.CI_FILTER : CI_FILTER;
  }

  function sourceMeta(s) { return PLATFORMS[s] || PLATFORMS.other; }
  function painMeta(s) {
    var L = (typeof CI_PAIN_STATUS !== "undefined") ? CI_PAIN_STATUS : [];
    for (var i = 0; i < L.length; i++) if (L[i] === s) return { code: s, name: PAIN_LABEL[s] || s };
    return { code: s, name: s };
  }
  var PAIN_LABEL = {
    mentioned: "仅提及", experienced: "亲历过", recurring: "反复发生", impacted: "已造成后果",
    seeking_solution: "寻求方案", solution_adopted: "已采用方案", dissatisfied: "对方案不满",
    solved: "已解决", unknown: "未知"
  };
  var PAIN_COLOR = {
    mentioned: "#94a3b8", experienced: "#a3e635", recurring: "#fb923c", impacted: "#ef4444",
    seeking_solution: "#f59e0b", solution_adopted: "#8b5cf6", dissatisfied: "#e11d48",
    solved: "#10b981", unknown: "#cbd5e1"
  };
  var LEVEL_COLOR = { E1: "#cbd5e1", E2: "#a3e635", E3: "#84cc16", E4: "#22c55e", E5: "#10b981", E6: "#0ea5e9" };

  function esc(s) { return (typeof escapeHtml === "function") ? escapeHtml(String(s == null ? "" : s)) : String(s == null ? "" : s); }
  function badge(text, color) { return '<span class="ci-b" style="background:' + color + '22;color:' + color + '">' + esc(text) + '</span>'; }

  // ============ 入口 ============
  function renderConsumer() {
    var c = document.getElementById("app-content");
    if (!c) return;
    ciLoadSeed();
    var v = (typeof window !== "undefined" && window.CI_VIEW !== undefined) ? window.CI_VIEW : CI_VIEW;
    if (v === "new") return ciViewNew(c);
    if (v === "extract") return ciViewExtract(c);
    if (v.indexOf("research:") === 0) return ciViewResearch(c, v.slice(9));
    if (v.indexOf("record:") === 0) { var p = v.slice(7).split(":"); return ciViewRecord(c, p[0], p[1]); }
    return ciViewList(c);
  }

  // ============ 列表 ============
  function ciViewList(c) {
    var list = (ciDB().researches || []);
    var html =
      '<div class="section-title"><span class="emoji">🧠</span> Consumer Intelligence</div>' +
      '<div class="card ci-intro"><div class="card-body">' +
        '<div class="ci-intro-line">唯一任务：从用户原始内容中提取<strong>可被原文证据支持的结构化事实</strong>。</div>' +
        '<div class="ci-intro-line ci-dim">不是总结用户，不是提出产品建议。不确定即 unknown，推测不得当作事实。</div>' +
        '<div class="ci-rule-chips">' +
          '<span class="ci-chip">只依据原文</span><span class="ci-chip">不确定=unknown</span>' +
          '<span class="ci-chip">购买≠已解决</span><span class="ci-chip">提及≠在使用</span>' +
          '<span class="ci-chip">条数≠人数</span><span class="ci-chip">情绪≠痛点强度</span>' +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">' +
          '<button class="btn btn-primary" onclick="CI_VIEW=\'extract\';renderConsumer()">📥 提取单条内容</button>' +
          '<button class="btn btn-ghost" onclick="CI_VIEW=\'new\';renderConsumer()">+ 新建研究</button>' +
        '</div>' +
      '</div></div>';

    if (!list.length) {
      html += '<div class="empty-state"><div class="empty-text">暂无研究</div></div>';
    } else {
      list.forEach(function (r) {
        var recs = ciRecords(r);
        var agg = ciAggregate(recs);
        var plats = (r.platforms || []).map(function (p) { return sourceMeta(p).icon; }).join(" ");
        html += '<div class="card ci-research-card" onclick="CI_VIEW=\'research:' + r.id + '\';renderConsumer()">' +
          '<div class="ci-research-h"><span class="ci-research-t">' + esc(r.title || r.subject) + '</span>' +
            '<span class="ci-research-date">' + esc(r.createdAt || "") + '</span></div>' +
          '<div class="ci-research-meta">研究对象 <b>' + esc(r.subject || "") + '</b> · 目标用户 <b>' + esc(r.targetUsers || "") + '</b></div>' +
          '<div class="ci-research-meta">' + plats + ' · ' + esc((r.timeWindow && r.timeWindow.label) || "") + '</div>' +
          '<div class="ci-ladder">' +
            ciLadderCell("提及", agg.mention_count, "#64748b") +
            ciLadderCell("去重用户", agg.unique_users, "#0a84ff") +
            ciLadderCell("相关用户", agg.relevant_users, "#0891b2") +
            ciLadderCell("明确痛苦", agg.pain_confirmed_users, "#e11d48") +
          '</div>' +
          '<div class="ci-research-cta">查看结构化事实（' + recs.length + ' 条记录）→</div>' +
        '</div>';
      });
    }
    c.innerHTML = html;
  }

  function ciLadderCell(label, n, color) {
    return '<div class="ci-ladder-cell"><div class="ci-ladder-n" style="color:' + color + '">' + n + '</div><div class="ci-ladder-l">' + label + '</div></div>';
  }

  // ============ 新建研究 ============
  function ciViewNew(c) {
    var opts = Object.keys(PLATFORMS).map(function (k) {
      return '<label class="ci-plat-label"><input type="checkbox" class="ci-plat" value="' + k + '"' + (k === "other" ? "" : " checked") + '/> ' + PLATFORMS[k].icon + ' ' + PLATFORMS[k].name + '</label>';
    }).join("");
    c.innerHTML =
      '<div class="section-title"><span class="emoji">🧠</span> 新建消费者研究</div>' +
      '<div class="card"><div class="card-body">' +
        '<div class="ci-form">' +
          '<label>研究对象<input id="ci-subject" class="ci-input" placeholder="例：MagSafe 手机散热器"/></label>' +
          '<label>研究标题<input id="ci-title" class="ci-input" placeholder="留空自动生成"/></label>' +
          '<label>目标用户<input id="ci-users" class="ci-input" placeholder="例：女性 / 手机拍摄 / 小白用户"/></label>' +
          '<label>平台<div class="ci-plat-row">' + opts + '</div></label>' +
          '<label>时间窗口<input id="ci-time" class="ci-input" value="过去 12 个月"/></label>' +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-top:12px">' +
          '<button class="btn btn-primary" onclick="ciCreate()">创建</button>' +
          '<button class="btn btn-ghost" onclick="CI_VIEW=\'list\';renderConsumer()">取消</button>' +
        '</div>' +
      '</div></div>';
  }

  function ciCreate() {
    var g = function (id) { var e = document.getElementById(id); return e ? e.value : ""; };
    var subject = g("ci-subject").trim();
    if (!subject) { if (typeof showToast === "function") showToast("请填写研究对象", "error"); return; }
    var title = g("ci-title").trim() || subject;
    var users = g("ci-users").trim();
    var time = g("ci-time").trim();
    var plats = [];
    try { plats = Array.prototype.slice.call(document.querySelectorAll(".ci-plat:checked")).map(function (x) { return x.value; }); } catch (e) {}
    var id = "r_" + Date.now();
    ciDB().researches.push({
      id: id, title: title, subject: subject, targetUsers: users,
      platforms: plats.length ? plats : ["xhs", "douyin"],
      timeWindow: { label: time },
      createdAt: new Date().toISOString().slice(0, 10), status: "active",
      evidence: []
    });
    ciSave();
    window.CI_VIEW = "research:" + id;
    renderConsumer();
  }

  // ============ 粘贴提取（单条） ============
  function ciViewExtract(c) {
    var list = ciDB().researches || [];
    if (!list.length) { c.innerHTML = '<div class="empty-state"><div class="empty-text">请先创建研究</div></div>'; return; }
    var target = (typeof window !== "undefined" && window.CI_EXTRACT_TARGET) || list[0].id;
    var opts = list.map(function (r) {
      return '<option value="' + r.id + '"' + (r.id === target ? " selected" : "") + '>' + esc(r.title || r.subject) + '</option>';
    }).join("");
    var pending = (typeof window !== "undefined") ? window.CI_PENDING : null;

    var html = '<div class="section-title"><span class="emoji">📥</span> 提取单条内容</div>' +
      '<div class="card"><div class="card-body">' +
        '<div class="ci-dim" style="margin-bottom:8px">一次只处理<strong>一条</strong>用户内容。提取结果不包含任何用户数量——计数在聚合阶段完成。</div>' +
        '<label>归属研究<select id="ci-ex-research" class="ci-input">' + opts + '</select></label>' +
        '<label style="display:block;margin-top:10px">平台<select id="ci-ex-source" class="ci-input">' +
          Object.keys(PLATFORMS).map(function (k) { return '<option value="' + k + '">' + PLATFORMS[k].icon + ' ' + PLATFORMS[k].name + '</option>'; }).join("") +
        '</select></label>' +
        '<label style="display:block;margin-top:10px">用户标识（可选）<input id="ci-ex-user" class="ci-input" placeholder="用于后续去重，留空则记「匿名」"/></label>' +
        '<label style="display:block;margin-top:10px">用户原始内容<textarea id="ci-ex-text" class="ci-input ci-textarea" rows="5" placeholder="粘贴一条完整的用户发言/评论原文"></textarea></label>' +
        '<div id="ci-ex-err" class="ci-err" style="display:none"></div>' +
        '<div style="display:flex;gap:8px;margin-top:12px">' +
          '<button id="ci-ex-btn" class="btn btn-primary" onclick="ciDoExtract()">🤖 提取结构化事实</button>' +
          '<button class="btn btn-ghost" onclick="CI_VIEW=\'list\';renderConsumer()">返回</button>' +
        '</div>' +
      '</div></div>';

    if (pending) html += ciRenderExtraction(pending, false);
    c.innerHTML = html;
  }

  function ciRenderExtraction(rec, saved) {
    var x = rec.extracted || {};
    var st = (x.pain && x.pain.status) || "unknown";
    var lv = (x.evidence && x.evidence.level) || "E1";
    var audit = (typeof ciAudit === "function") ? ciAudit(rec) : { ok: true, warnings: [] };

    function kv(k, v) {
      var isU = (v === "unknown" || v === "" || (Array.isArray(v) && !v.length));
      return '<div class="ci-kv"><span class="ci-k">' + esc(k) + '</span><span class="ci-v' + (isU ? " ci-unknown" : "") + '">' +
        esc(Array.isArray(v) ? (v.length ? v.join(" / ") : "unknown") : (v || "unknown")) + '</span></div>';
    }

    var html = '<div class="card ci-ext-result">' +
      '<div class="ci-ext-h">' +
        '<span class="ci-ext-t">' + (saved ? "已保存" : "提取结果（预览）") + '</span>' +
        badge(st + " · " + (PAIN_LABEL[st] || st), PAIN_COLOR[st] || "#94a3b8") +
        badge(lv + " " + ((typeof CI_EVIDENCE_DEF !== "undefined" && CI_EVIDENCE_DEF[lv]) || ""), LEVEL_COLOR[lv] || "#94a3b8") +
      '</div>' +

      (audit.ok ? '<div class="ci-audit-ok">✅ 规则审计通过：未发现无原文支撑的判断</div>'
                : '<div class="ci-audit-warn">⚠️ 规则审计发现 ' + audit.warnings.length + ' 处疑点（可据原文质疑）<ul>' +
                  audit.warnings.map(function (w) { return '<li><b>' + esc(w.rule) + '</b> ' + esc(w.message) + '</li>'; }).join("") + '</ul></div>') +

      '<div class="ci-ext-quote">' + esc(rec.rawText) + '</div>' +

      '<div class="ci-kv-group"><div class="ci-kv-h">👤 用户是谁 persona</div>' +
        kv("身份线索", x.persona && x.persona.segment_hints) +
        kv("产品经验", x.persona && x.persona.experience_with_product) +
        kv("角色", x.persona && x.persona.role_hint) + '</div>' +

      '<div class="ci-kv-group"><div class="ci-kv-h">📍 场景 scene</div>' +
        kv("时间", x.scene && x.scene.time) + kv("地点", x.scene && x.scene.place) +
        kv("活动", x.scene && x.scene.activity) + kv("触发条件", x.scene && x.scene.trigger) +
        kv("频率", x.scene && x.scene.frequency) + '</div>' +

      '<div class="ci-kv-group"><div class="ci-kv-h">❗ 问题 problem</div>' +
        kv("核心", x.problem && x.problem.core) + kv("表现", x.problem && x.problem.symptoms) + '</div>' +

      '<div class="ci-kv-group"><div class="ci-kv-h">💢 痛点 pain</div>' +
        kv("状态", (x.pain && x.pain.status) || "unknown") +
        '<div class="ci-kv"><span class="ci-k">原文支撑</span><span class="ci-v ci-quote">' + esc((x.pain && x.pain.basis_quote) || "unknown") + '</span></div></div>' +

      '<div class="ci-kv-group"><div class="ci-kv-h">📉 实际后果 impact</div>' +
        kv("任务中断", x.impact && x.impact.task_blocked) +
        kv("放弃活动", x.impact && x.impact.abandoned_activity) +
        kv("被迫改变行为", x.impact && x.impact.behavior_change) + '</div>' +

      '<div class="ci-kv-group"><div class="ci-kv-h">🔧 解决方案 solution（三项独立）</div>' +
        kv("已采用方案", x.solution && x.solution.solution_adopted) +
        kv("方案描述", x.solution && x.solution.solution_desc) +
        kv("购买信号", x.solution && x.solution.purchase_signal) +
        kv("是否已解决", x.solution && x.solution.solved_status) +
        kv("满意度", x.solution && x.solution.satisfaction) +
        '<div class="ci-note">购买 ≠ 已解决；已采用方案 ≠ 满意</div></div>' +

      '<div class="ci-kv-group"><div class="ci-kv-h">😐 情绪 emotion</div>' +
        kv("标签", x.emotion && x.emotion.labels) + kv("强度", x.emotion && x.emotion.intensity) +
        '<div class="ci-note">情绪强度不参与痛点强度判断</div></div>' +

      '<div class="ci-kv-group"><div class="ci-kv-h">❓ unknowns（未能确定的字段）</div>' +
        ((x.unknowns && x.unknowns.length)
          ? '<div class="ci-unknown-list">' + x.unknowns.map(function (u) { return '<code>' + esc(u) + '</code>'; }).join("") + '</div>'
          : '<div class="ci-note">无</div>') + '</div>' +
      '</div>';
    return html;
  }

  async function ciDoExtract() {
    var g = function (id) { var e = document.getElementById(id); return e ? e.value : ""; };
    var text = g("ci-ex-text").trim();
    var rid = g("ci-ex-research");
    var src = g("ci-ex-source") || "other";
    var user = g("ci-ex-user").trim() || "匿名";
    var errBox = document.getElementById("ci-ex-err");
    var btn = document.getElementById("ci-ex-btn");

    if (!text) { if (errBox) { errBox.textContent = "请粘贴用户原始内容"; errBox.style.display = "block"; } return; }
    var r = ciGet(rid);
    if (!r) return;

    if (btn) { btn.disabled = true; btn.textContent = "提取中…"; }
    if (errBox) errBox.style.display = "none";

    var result;
    try {
      result = await ciExtractOne(text, { platform: src });
    } catch (e) {
      result = { ok: false, extraction: ciSafeFallback(), errors: [String(e && e.message || e)], provider: "" };
    }

    var rec = ciMakeRecord(text, { source: src, user: user, publishDate: (typeof today === "function" ? today() : new Date().toISOString().slice(0, 10)) }, result);

    if (!result.ok) {
      // 提取失败：不落库，避免污染；只展示降级结果与原因
      window.CI_PENDING = rec;
      renderConsumer();
      var eb = document.getElementById("ci-ex-err");
      if (eb) { eb.innerHTML = "❌ 提取未通过校验，未入库（避免把不可靠数据写进证据库）：<br>" + result.errors.map(esc).join("<br>"); eb.style.display = "block"; }
      return;
    }

    r.evidence = r.evidence || [];
    r.evidence.push(rec);
    ciSave();
    window.CI_PENDING = null;
    renderConsumer();
    if (typeof showToast === "function") showToast("已保存 1 条结构化事实", "success");
  }

  // ============ 研究详情 ============
  function ciViewResearch(c, rid) {
    var r = ciGet(rid);
    if (!r) { c.innerHTML = '<div class="empty-state"><div class="empty-text">研究不存在</div></div>'; return; }
    var recs = ciRecords(r);
    var agg = ciAggregate(recs);
    var pdist = ciPainDist(recs);
    var ldist = ciLevelDist(recs);
    var scen = ciSceneAgg(recs, 5);
    var sdist = ciSourceDist(recs);
    var f = filt();

    var list = recs.slice();
    if (f.source !== "all") list = list.filter(function (x) { return x.source === f.source; });
    if (f.pain !== "all") list = list.filter(function (x) { return x.extracted.pain.status === f.pain; });
    if (f.level !== "all") list = list.filter(function (x) { return x.extracted.evidence.level === f.level; });

    var html = '';

    // 头部
    html += '<div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap">' +
      '<button class="btn btn-ghost sm" onclick="CI_VIEW=\'list\';renderConsumer()">← 返回</button>' +
      '<button class="btn btn-primary sm" onclick="window.CI_EXTRACT_TARGET=\'' + r.id + '\';CI_VIEW=\'extract\';renderConsumer()">📥 提取单条内容</button>' +
      '</div>';

    html += '<div class="card ci-rh">' +
      '<div class="ci-rh-t">' + esc(r.title || r.subject) + '</div>' +
      '<div class="ci-rh-meta">研究对象 <b>' + esc(r.subject) + '</b> · 目标用户 <b>' + esc(r.targetUsers || "") + '</b></div>' +
      '<div class="ci-rh-meta">' + esc((r.timeWindow && r.timeWindow.label) || "") + ' · 共 ' + recs.length + ' 条原始内容</div>' +
      '</div>';

    // ★ 聚合层（唯一允许出现计数的地方）
    html += '<div class="ci-sec"><div class="ci-sec-h"><span class="ci-sec-n">A</span><span>聚合计数</span>' +
      '<span class="ci-sec-tag">仅本层产出计数 · 单条分析不含计数</span></div>';

    html += '<div class="ci-ladder">' +
      ciLadderCell("提及条数", agg.mention_count, "#64748b") +
      ciLadderCell("去重用户", agg.unique_users, "#0a84ff") +
      ciLadderCell("相关用户", agg.relevant_users, "#0891b2") +
      ciLadderCell("明确痛苦", agg.pain_confirmed_users, "#e11d48") +
      ciLadderCell("寻求方案", agg.solution_seeking_users, "#f59e0b") +
      ciLadderCell("已购/退货", agg.purchase_users, "#8b5cf6") +
      '</div>';
    html += '<div class="ci-funnel-note">漏斗严格递减：条数 ≠ 人数，<strong>Mention ≠ Pain</strong>。所有数字由记录实时聚合，不由 AI 生成。</div>';

    // 痛点状态分布
    html += '<div class="ci-sub-h">痛点状态分布（pain.status）</div><div class="ci-bars">';
    pdist.forEach(function (d) {
      if (!d.mentions) return;
      var col = PAIN_COLOR[d.status] || "#94a3b8";
      var pct = agg.mention_count ? Math.round(d.mentions / agg.mention_count * 100) : 0;
      html += '<div class="ci-bar-row"><span class="ci-bar-l" style="color:' + col + '">' + esc(PAIN_LABEL[d.status] || d.status) + '</span>' +
        '<span class="ci-bar-track"><span class="ci-bar-fill" style="width:' + pct + '%;background:' + col + '"></span></span>' +
        '<span class="ci-bar-v">' + d.mentions + ' 条 / ' + d.users + ' 人</span></div>';
    });
    html += '</div>';

    // 证据等级分布
    html += '<div class="ci-sub-h">证据等级分布（evidence.level）</div><div class="ci-bars">';
    ldist.forEach(function (d) {
      if (!d.mentions) return;
      var col = LEVEL_COLOR[d.level];
      var pct = agg.mention_count ? Math.round(d.mentions / agg.mention_count * 100) : 0;
      html += '<div class="ci-bar-row"><span class="ci-bar-l" style="color:' + col + '">' + d.level + '</span>' +
        '<span class="ci-bar-track"><span class="ci-bar-fill" style="width:' + pct + '%;background:' + col + '"></span></span>' +
        '<span class="ci-bar-v">' + d.mentions + ' 条</span></div>';
    });
    html += '</div>';

    // 场景聚合
    html += '<div class="ci-sub-h">场景聚合（仅统计 extracted.scene 中非 unknown 的值）</div>';
    ["time", "place", "activity", "trigger"].forEach(function (k) {
      var arr = scen[k] || [];
      var label = { time: "时间", place: "地点", activity: "活动", trigger: "触发条件" }[k];
      html += '<div class="ci-scene-line"><span class="ci-scene-k">' + label + '</span><span class="ci-scene-v">' +
        (arr.length ? arr.map(function (x) { return esc(x.name) + " <b>" + x.count + "</b>"; }).join(" · ") : '<span class="ci-unknown">全部 unknown</span>') +
        '</span></div>';
    });

    // 来源分布
    html += '<div class="ci-sub-h">来源分布</div><div class="ci-src-row">' +
      sdist.map(function (s) { var m = sourceMeta(s.source); return '<span class="ci-src">' + m.icon + ' ' + m.name + ' <b>' + s.count + '</b></span>'; }).join("") +
      '</div>';

    // 规则审计
    var au = agg.audit;
    if (au) {
      html += '<div class="ci-sub-h">规则审计（可质疑）</div>';
      html += au.flagged === 0
        ? '<div class="ci-audit-ok">✅ ' + au.clean + '/' + au.total + ' 条记录未发现「无原文支撑」的判断</div>'
        : '<div class="ci-audit-warn">⚠️ ' + au.flagged + '/' + au.total + ' 条存在疑点，请逐条回看原文</div>';
    }
    html += '</div>';

    // 记录列表
    html += '<div class="ci-sec"><div class="ci-sec-h"><span class="ci-sec-n">B</span><span>原始记录（' + list.length + ' / ' + recs.length + '）</span></div>';
    html += '<div class="ci-filters">' +
      '<select onchange="window.CI_FILTER.source=this.value;renderConsumer()">' +
        '<option value="all">全部平台</option>' +
        (r.platforms || []).map(function (p) { return '<option value="' + p + '"' + (f.source === p ? " selected" : "") + '>' + sourceMeta(p).name + '</option>'; }).join("") +
      '</select>' +
      '<select onchange="window.CI_FILTER.pain=this.value;renderConsumer()">' +
        '<option value="all">全部痛点状态</option>' +
        Object.keys(PAIN_LABEL).map(function (k) { return '<option value="' + k + '"' + (f.pain === k ? " selected" : "") + '>' + PAIN_LABEL[k] + '</option>'; }).join("") +
      '</select>' +
      '<select onchange="window.CI_FILTER.level=this.value;renderConsumer()">' +
        '<option value="all">全部证据等级</option>' +
        ["E1", "E2", "E3", "E4", "E5", "E6"].map(function (k) { return '<option value="' + k + '"' + (f.level === k ? " selected" : "") + '>' + k + '</option>'; }).join("") +
      '</select></div>';

    html += '<div class="ci-rec-list">';
    if (!list.length) html += '<div class="empty-text">无匹配记录</div>';
    list.forEach(function (rec) {
      var x = rec.extracted || {};
      var st = (x.pain && x.pain.status) || "unknown";
      var lv = (x.evidence && x.evidence.level) || "E1";
      var sm = sourceMeta(rec.source);
      var a = (typeof ciAudit === "function") ? ciAudit(rec) : { ok: true, warnings: [] };
      html += '<div class="ci-rec" onclick="CI_VIEW=\'record:' + r.id + ':' + rec.id + '\';renderConsumer()">' +
        '<div class="ci-rec-h">' +
          badge(sm.icon + " " + sm.name, sm.color) +
          badge(st + " " + (PAIN_LABEL[st] || st), PAIN_COLOR[st] || "#94a3b8") +
          badge(lv, LEVEL_COLOR[lv] || "#94a3b8") +
          (a.ok ? "" : '<span class="ci-flag">⚠ ' + a.warnings.length + '</span>') +
          '<span class="ci-rec-date">' + esc(rec.publishDate || "") + '</span>' +
        '</div>' +
        '<div class="ci-rec-q">' + esc(rec.rawText) + '</div>' +
        '<div class="ci-rec-f">' + esc((x.problem && x.problem.core) || "unknown") + '</div>' +
      '</div>';
    });
    html += '</div></div>';

    c.innerHTML = html;
  }

  // ============ 单条记录详情 ============
  function ciViewRecord(c, rid, recId) {
    var r = ciGet(rid);
    if (!r) return;
    var rec = null;
    ciRecords(r).forEach(function (x) { if (x.id === recId) rec = x; });
    if (!rec) { c.innerHTML = '<div class="empty-state"><div class="empty-text">记录不存在</div></div>'; return; }
    c.innerHTML = '<div style="margin-bottom:10px"><button class="btn btn-ghost sm" onclick="CI_VIEW=\'research:' + r.id + '\';renderConsumer()">← 返回研究</button></div>' +
      ciRenderExtraction(rec, true);
  }

  // ============ 导出 ============
  window.CI_VIEW = CI_VIEW;
  window.CI_FILTER = CI_FILTER;
  window.CI_PLATFORMS = PLATFORMS;
  window.CI_PAIN_LABEL = PAIN_LABEL;
  window.renderConsumer = renderConsumer;
  window.ciCreate = ciCreate;
  window.ciDoExtract = ciDoExtract;

})();
