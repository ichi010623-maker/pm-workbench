// ============================================================================
// 🧭 TrueNorth 产品方向校准（需求洞察 · 第4子页签）
// 方法论：模拟用户调研 + 全网搜索 → 校准产品方向（参考「市场调研--truenorth」skill）
// 流程：配置(产品/阶段/用户/困惑/已有信息/期望) → AI 联网生成
//       （画像拆解 + 待验证假设 + 全网真实声音 + 模拟10位用户调研 + 汇总分析 + 方向偏差 + 机会点/行动）
// 落库：DB.data.truenorthReports（cap 30），并接入「我的产出」hub（source: truenorth）
// 说明：模拟调研 + 公开信息聚合，定位「方向校准」而非「市场判决」，含免责声明
// ============================================================================

var TN_STAGES = ["只有想法", "已有原型", "已有MVP", "已上线"];

function tnGet() {
  if (!DB.data.truenorthReports) DB.data.truenorthReports = [];
  return DB.data.truenorthReports;
}
function tnSaveReport(rec) {
  var arr = tnGet();
  arr.unshift(rec);
  if (arr.length > 30) arr.length = 30;
  try { DB.save(); } catch (e) {}
}

function tnProviderOptions() {
  var keys = Object.keys(typeof INTEL_PROVIDERS !== "undefined" ? INTEL_PROVIDERS : {}).filter(function (k) {
    var p = INTEL_PROVIDERS[k];
    return p && typeof p.buildBodyForPrompt === "function";
  });
  var cfg = (typeof loadAiConfig === "function") ? loadAiConfig() : {};
  var def = cfg.provider || "gemini";
  if (keys.indexOf(def) < 0 && keys.length) def = keys[0];
  return keys.map(function (k) {
    var label = INTEL_PROVIDERS[k].label || k;
    return '<option value="' + k + '"' + (k === def ? " selected" : "") + '>' + escapeHtml(label) + '</option>';
  }).join("");
}
function tnToggleWs(el) {
  var cfg = (typeof loadAiConfig === "function") ? loadAiConfig() : {};
  cfg.webSearch = (cfg.webSearch === false) ? true : false;
  if (typeof saveAiConfig === "function") saveAiConfig(cfg);
  if (el) el.textContent = cfg.webSearch !== false ? "🌐 联网检索 ON" : "🚫 联网 OFF";
  if (typeof showToast === "function") showToast(cfg.webSearch !== false ? "已开启联网检索（真实来源）" : "已关闭联网检索", "success");
}

// ---------- 页面 ----------
function renderTrueNorth() {
  var c = document.getElementById("app-content");
  if (!c) return;
  var list = tnGet();
  var cfg = (typeof loadAiConfig === "function") ? loadAiConfig() : {};
  var html = '<div class="tn-wrap">';

  html += '<div class="tn-card tn-config">' +
    '<div class="tn-title">🧭 TrueNorth 产品方向校准</div>' +
    '<div class="tn-sub">在投入大量开发成本前，模拟用户调研 + 全网搜索，帮你找到真实用户、真实需求和更清晰的方向。</div>' +
    '<div class="form-group"><div class="form-label">产品是什么（一句话描述，解决什么问题）</div>' +
      '<input class="form-input" id="tn-product" placeholder="例如：面向新手妈妈的家用辅食机"></div>' +
    '<div class="form-row">' +
      '<div class="form-group"><div class="form-label">当前阶段</div><select class="form-select" id="tn-stage">' + TN_STAGES.map(function (s) { return "<option>" + s + "</option>"; }).join("") + "</select></div>" +
      '<div class="form-group"><div class="form-label">目标用户假设</div><input class="form-input" id="tn-user" placeholder="你认为谁会买 / 用"></div>' +
    '</div>' +
    '<div class="form-group"><div class="form-label">核心困惑（最纠结什么）</div>' +
      '<input class="form-input" id="tn-confuse" placeholder="例如：先做哪些功能？定价怎么定？"></div>' +
    '<div class="form-group"><div class="form-label">已有信息（可留空：做过什么调研 / 看过哪些竞品）</div>' +
      '<textarea class="form-textarea" id="tn-known" rows="2" placeholder="例如：访谈过 5 个朋友，看过 XX 竞品…"></textarea></div>' +
    '<div class="form-group"><div class="form-label">最想搞清楚的问题（可留空）</div>' +
      '<input class="form-input" id="tn-expect" placeholder="例如：目标用户是谁？愿不愿意付费？"></div>' +
    '<div class="flex-between" style="gap:8px;align-items:center">' +
      '<select class="form-select" id="tn-provider" style="flex:1;min-width:140px">' + tnProviderOptions() + '</select>' +
      '<button class="btn btn-secondary" onclick="tnToggleWs(this)">' + (cfg.webSearch !== false ? "🌐 联网检索 ON" : "🚫 联网 OFF") + '</button>' +
      '<button class="btn btn-primary" onclick="tnRunResearch()">🚀 生成校准报告</button></div>' +
    '<div class="tn-status" id="tn-status"></div>' +
    '</div>';

  if (list.length) {
    html += tnReportCard(list[0], list);
  } else {
    html += '<div class="tn-empty">还没有校准报告。<br>填好上方产品信息，点「🚀 生成校准报告」；历史报告也会汇总到「🤖 我的产出」。</div>';
  }
  if (list.length > 1) {
    html += '<div class="tn-title-sm">📚 历史报告</div>' +
      list.slice(1).map(function (r) { return tnListItem(r); }).join("");
  }
  html += '</div>';
  c.innerHTML = html;
}

function tnListItem(r) {
  return '<div class="tn-list-item">' +
    '<div class="tn-li-main" onclick="aiOutputView(\'truenorth\',\'' + r.id + '\')">' +
      '<div class="tn-li-t">🧭 ' + escapeHtml(r.product || "产品方向校准") + '</div>' +
      '<div class="tn-li-m">' + escapeHtml((r.date || "") + (r.stage ? " · " + r.stage : "")) + '</div></div>' +
    '<div class="tn-li-acts">' +
      '<button class="intel-act' + (r.fav ? " on" : "") + '" onclick="aiToggleFav(\'truenorth\',\'' + r.id + '\')">' + (r.fav ? "★" : "☆") + '</button>' +
      '<button class="intel-act" onclick="aiOutputView(\'truenorth\',\'' + r.id + '\')">👁</button>' +
      '<button class="intel-act" onclick="aiDeleteOutput(\'truenorth\',\'' + r.id + '\')">🗑</button>' +
    '</div></div>';
}

function tnReportCard(rec, list) {
  return '<div class="tn-card tn-report">' +
    '<div class="tn-report-head">' +
      '<div class="tn-title">🧭 TrueNorth 校准报告 · ' + escapeHtml(rec.product || "") + '</div>' +
      '<div class="tn-meta">' + escapeHtml(rec.date || "") + " · " + escapeHtml(rec.stage || "") + " · " + escapeHtml(rec.provider || "AI") + '</div>' +
    '</div>' +
    tnRenderReportBody(rec) +
    '<div class="flex-between" style="gap:8px;margin-top:12px">' +
      '<button class="btn btn-secondary" onclick="tnDownloadMd(\'' + rec.id + '\')">📥 下载 Markdown</button>' +
      '<button class="btn btn-secondary" onclick="tnViewRaw(\'' + rec.id + '\')">📄 原始 JSON</button>' +
      '<button class="btn btn-secondary" onclick="tnRunResearch(true)">🔄 重新生成</button>' +
      '<button class="btn btn-primary" onclick="aiOutputView(\'truenorth\',\'' + rec.id + '\')">👁 查看详情</button>' +
    '</div>' +
    '<div class="tn-status" id="tn-status"></div>' +
    '</div>';
}

function tnViewRaw(id) {
  var rec = tnGet().filter(function (r) { return r.id === id; })[0];
  if (!rec) return;
  if (typeof showModal === "function") {
    showModal('<div class="modal-title">📄 原始 JSON（兜底）</div>' +
      '<pre style="white-space:pre-wrap;font-size:12px;background:var(--bg-card,#f7f7f5);padding:12px;border-radius:8px;max-height:70vh;overflow:auto">' + escapeHtml(JSON.stringify(rec, null, 1)) + '</pre>' +
      '<div class="btn-row"><button class="btn btn-primary" onclick="closeModal()">关闭</button></div>');
  }
}

function tnDownloadMd(id) {
  var rec = tnGet().filter(function (r) { return r.id === id; })[0];
  if (!rec) return;
  var md = tnBuildMarkdown(rec);
  try {
    var blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "TrueNorth-" + (rec.date || "report") + "-" + (rec.product || "方向校准") + ".md";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { try { URL.revokeObjectURL(a.href); } catch (e) {} }, 3000);
  } catch (e) {
    if (typeof showToast === "function") showToast("下载失败：" + (e && e.message ? e.message : e), "error");
  }
}

// ---------- AI 生成 ----------
async function tnRunResearch() {
  var product = (document.getElementById("tn-product") ? document.getElementById("tn-product").value : "").trim();
  if (!product) { if (typeof showToast === "function") showToast("请先填写「产品是什么」"); return; }
  var stage = document.getElementById("tn-stage") ? document.getElementById("tn-stage").value : "只有想法";
  var user = (document.getElementById("tn-user") ? document.getElementById("tn-user").value : "").trim();
  var confuse = (document.getElementById("tn-confuse") ? document.getElementById("tn-confuse").value : "").trim();
  var known = (document.getElementById("tn-known") ? document.getElementById("tn-known").value : "").trim();
  var expect = (document.getElementById("tn-expect") ? document.getElementById("tn-expect").value : "").trim();
  var provider = document.getElementById("tn-provider") ? document.getElementById("tn-provider").value : "gemini";

  var cfg = (typeof loadAiConfig === "function") ? loadAiConfig() : {};
  var apiKey = cfg.apiKey || "";
  if (!apiKey) {
    if (typeof showModal === "function") {
      showModal('<div class="modal-title">⚠️ 还没填大模型 Key</div><div class="form-group">TrueNorth 的「AI 生成校准报告」需要大模型 Key（默认 Gemini，联网接地免费，不找你要密码）。<br>请到 <b>设置 → 模型配置</b> 里填：</div><div class="text-xs text-secondary">• Gemini：开 VPN 后 AI Studio 免费 Key 可直连<br>• 智谱 GLM-4-Flash / 硅基流动：国内可直连免费<br>填好回来再点「🚀 生成校准报告」。</div><div class="btn-row"><button class="btn btn-primary" onclick="closeModal();navigate(\'settings\')">去设置填 Key</button></div>');
    }
    return;
  }
  var statusEl = document.getElementById("tn-status");
  if (statusEl) { statusEl.className = "tn-status"; statusEl.innerHTML = "⏳ 正在全网搜索 + 模拟 10 位用户调研 + 汇总分析，约 1-2 分钟…"; }
  if (typeof showToast === "function") showToast("开始生成 TrueNorth 校准报告，请稍候", "success");

  var prompt = tnBuildPrompt({ product: product, stage: stage, user: user, confuse: confuse, known: known, expect: expect });
  try {
    if (typeof callLLMForPrompt !== "function") throw new Error("大模型调用层未就绪");
    var r = await callLLMForPrompt(provider, apiKey, prompt);
    var parsed = (typeof parseIntelLLM === "function") ? parseIntelLLM(r.text) : JSON.parse(r.text);
    var rec = tnNormalize(parsed, {
      product: product, stage: stage, user: user, confuse: confuse, known: known, expect: expect,
      provider: provider, text: r.text, sources: r.sources || []
    });
    tnSaveReport(rec);
    if (statusEl) { statusEl.className = "tn-status ok"; statusEl.innerHTML = "✅ 校准报告已生成，可到「我的产出」查看"; }
    if (typeof showToast === "function") showToast("校准报告已生成", "success");
    renderTrueNorth();
    var ac = document.getElementById("app-content");
    if (ac) ac.scrollTop = 0;
  } catch (e) {
    if (statusEl) { statusEl.className = "tn-status err"; statusEl.innerHTML = "❌ 生成失败：" + escapeHtml(e && e.message ? e.message : String(e)); }
    if (typeof showToast === "function") showToast("生成失败：" + (e && e.message ? e.message : e), "error");
  }
}

function tnBuildPrompt(cfg) {
  return "你是 TrueNorth 产品方向校准顾问，擅长通过「模拟用户调研 + 全网搜索」帮早期产品团队校准产品方向。\n" +
    "产品：" + cfg.product + "\n" +
    "当前阶段：" + cfg.stage + "\n" +
    "目标用户假设：" + (cfg.user || "未填写") + "\n" +
    "核心困惑：" + (cfg.confuse || "未填写") + "\n" +
    "已有信息：" + (cfg.known || "无") + "\n" +
    "最想搞清楚的问题：" + (cfg.expect || "目标用户是谁、是否愿意付费") + "\n\n" +
    "任务（结合联网检索到的真实市场信息 + 专业的模拟用户调研）输出一份完整的产品方向校准报告：\n" +
    "1. 产品理解与用户画像：拆解 3-5 个目标用户画像（画像名/人口特征/核心场景/核心痛点/现有替代方案/痛点强度/判断依据）。\n" +
    "2. 待验证假设 3-6 条：每条含 优先级（最高=不成立需调整方向/高=需换目标用户/中=需改功能/低=需改表达）、验证方法、如果不成立意味着什么。\n" +
    "3. 全网搜索（务必联网检索真实公开信息）：用户真实声音（来源平台+原话摘要+信号解读+支持/反驳哪条假设）、竞品情报 3-5 个（名称/形态/用户评价关键词/用户痛点/对你的启示）、市场趋势 2-3 条。\n" +
    "4. 模拟 10 位用户调研：7 位强匹配 + 2 位边缘 + 1 位非目标（对照组）。每人有独立姓名、人口特征、性格、表达方式、痛点强度(1-5)、付费意愿；回答要带具体场景与数字、有真实情绪、偶尔前后矛盾；每人给 4-5 条问答与「最有价值的一句话」。\n" +
    "5. 汇总分析：假设验证结果（每条 支持/部分支持/不支持 + 结论）、痛点频率统计、付费意愿分析（愿付人数/平均金额/不愿付原因）、关键发现 5-8 条（附证据）。\n" +
    "6. 产品方向偏差：原始假设 vs 真实反馈。\n" +
    "7. 机会点与建议 2-3 个（含证据与验证方式）、下一步行动计划 3-5 步（谁/做什么/产出/时间）。\n\n" +
    "输出风格：建设性优先，不简单说「值不值得做」；证据不足就说证据不足。\n\n" +
    "请严格输出如下 JSON（不要任何额外文字，不要 markdown 代码块包裹）：\n" +
    "{\n" +
    '  "summary": "执行摘要（含 样本数/关键发现数/验证假设数/推荐方向）",\n' +
    '  "research": "研究背景：产品理解 2-3 句",\n' +
    '  "personas": [ { "name":"画像名", "demo":"人口特征", "scene":"核心场景", "pain":"核心痛点", "alt":"现有替代方案", "intensity":"强/中/弱", "why":"判断依据" } ],\n' +
    '  "hypotheses": [ { "no":"H1", "content":"假设内容", "persona":"对应画像", "priority":"最高/高/中/低", "method":"验证方法", "ifFalse":"不成立意味着什么" } ],\n' +
    '  "voices": [ { "source":"平台·帖子", "quote":"用户原话摘要", "signal":"信号解读", "hypothesis":"支持/反驳 H1" } ],\n' +
    '  "competitors": [ { "name":"竞品名", "form":"形态", "review":"用户评价关键词", "pain":"用户痛点", "lesson":"对你的启示" } ],\n' +
    '  "trends": ["市场趋势1", "市场趋势2"],\n' +
    '  "users": [ { "no":1, "name":"姓名", "match":"画像名·强匹配/边缘/非目标", "profile":"年龄职业生活状态", "personality":"性格标签", "painScore":4, "payWilling":"愿付区间", "answers":[ {"q":"问题","a":"第一人称回答，带场景和数字"} ], "quote":"最有价值的一句话" } ],\n' +
    '  "hypothesisResults": [ { "no":"H1", "result":"支持/部分支持/不支持", "note":"结论" } ],\n' +
    '  "findings": [ { "finding":"关键发现", "evidence":"证据" } ],\n' +
    '  "payAnalysis": "付费意愿分析（愿付人数/平均金额/不愿付原因/敏感点）",\n' +
    '  "deviation": "产品方向偏差：原始假设 vs 真实反馈",\n' +
    '  "opportunities": [ { "direction":"机会方向", "evidence":"证据", "verify":"验证方式" } ],\n' +
    '  "nextSteps": ["步骤1（谁/做什么/产出/时间）"],\n' +
    '  "sources": [ { "title":"来源标题", "url":"https://..." } ]\n' +
    "}";
}

// ---------- 归一化 ----------
function tnNormalize(parsed, opts) {
  parsed = parsed || {}; opts = opts || {};
  var arr = function (x) { return Array.isArray(x) ? x : []; };
  var str = function (x, d) { return x == null ? (d || "") : String(x); };
  var sources = arr(parsed.sources).filter(function (s) { return s && s.url; }).map(function (s) { return { title: str(s.title), url: str(s.url) }; });
  (opts.sources || []).forEach(function (s) {
    if (s && s.url && !sources.some(function (x) { return x.url === s.url; })) sources.push({ title: str(s.title), url: str(s.url) });
  });
  if (typeof intelExtractTextLinks === "function") {
    intelExtractTextLinks(opts.text).forEach(function (s) {
      if (s && s.url && !sources.some(function (x) { return x.url === s.url; })) sources.push({ title: str(s.title), url: str(s.url) });
    });
  }
  return {
    id: (typeof uid === "function" ? uid() : "tn" + Math.random().toString(36).slice(2, 9)),
    product: str(opts.product),
    stage: str(opts.stage),
    user: str(opts.user),
    confuse: str(opts.confuse),
    known: str(opts.known),
    expect: str(opts.expect),
    date: (typeof today === "function" ? today() : ""),
    createdAt: new Date().toISOString(),
    provider: opts.provider || "AI联网",
    summary: str(parsed.summary),
    research: str(parsed.research),
    personas: arr(parsed.personas).filter(function (p) { return p && p.name; }),
    hypotheses: arr(parsed.hypotheses).filter(function (h) { return h && h.content; }),
    voices: arr(parsed.voices).filter(function (v) { return v && v.quote; }),
    competitors: arr(parsed.competitors).filter(function (c) { return c && c.name; }),
    trends: arr(parsed.trends).map(function (t) { return str(t); }).filter(Boolean),
    users: arr(parsed.users).filter(function (u) { return u && u.name; }),
    hypothesisResults: arr(parsed.hypothesisResults).filter(function (h) { return h && h.no; }),
    findings: arr(parsed.findings).filter(function (f) { return f && (f.finding || f.evidence); }),
    payAnalysis: str(parsed.payAnalysis),
    deviation: str(parsed.deviation),
    opportunities: arr(parsed.opportunities).filter(function (o) { return o && o.direction; }),
    nextSteps: arr(parsed.nextSteps).map(function (s) { return str(s); }).filter(Boolean),
    sources: sources,
    text: opts.text || "",
    fav: false
  };
}

// ---------- 渲染 ----------
function tnRenderReportBody(rec) {
  if (!rec) return "";
  var h = "";
  // 执行摘要
  if (rec.summary) {
    h += '<div class="tn-exec">' +
      '<div class="tn-exec-label">📌 执行摘要</div>' +
      '<div class="tn-exec-text">' + escapeHtml(rec.summary) + '</div></div>';
  }
  // 研究背景
  if (rec.research) h += tnSection("🔬 研究背景", '<div class="tn-text">' + escapeHtml(rec.research) + '</div>');
  // 用户画像
  if (rec.personas && rec.personas.length) {
    h += tnSection("👥 目标用户画像（" + rec.personas.length + "）",
      '<div class="tn-persona-grid">' + rec.personas.map(function (p) {
        return '<div class="tn-persona"><div class="tn-p-name">' + escapeHtml(p.name) + ' <span class="tn-p-int ' + tnIntCls(p.intensity) + '">痛点' + escapeHtml(p.intensity || "中") + '</span></div>' +
          (p.demo ? '<div class="tn-p-line"><b>人群</b> ' + escapeHtml(p.demo) + '</div>' : "") +
          (p.scene ? '<div class="tn-p-line"><b>场景</b> ' + escapeHtml(p.scene) + '</div>' : "") +
          (p.pain ? '<div class="tn-p-line"><b>痛点</b> ' + escapeHtml(p.pain) + '</div>' : "") +
          (p.alt ? '<div class="tn-p-line"><b>现有方案</b> ' + escapeHtml(p.alt) + '</div>' : "") +
          (p.why ? '<div class="tn-p-line tn-p-why"><b>判断依据</b> ' + escapeHtml(p.why) + '</div>' : "") +
        '</div>';
      }).join("") + '</div>');
  }
  // 待验证假设
  if (rec.hypotheses && rec.hypotheses.length) {
    h += tnSection("🧪 待验证假设（" + rec.hypotheses.length + "）",
      '<div class="tn-table-wrap"><table class="tn-table"><thead><tr><th>#</th><th>假设</th><th>画像</th><th>优先级</th><th>验证方法</th><th>不成立则…</th></tr></thead><tbody>' +
      rec.hypotheses.map(function (hp) {
        return '<tr><td><b>' + escapeHtml(hp.no || "") + '</b></td><td>' + escapeHtml(hp.content || "") + '</td><td>' + escapeHtml(hp.persona || "") + '</td><td><span class="tn-pri ' + tnPriCls(hp.priority) + '">' + escapeHtml(hp.priority || "") + '</span></td><td>' + escapeHtml(hp.method || "") + '</td><td>' + escapeHtml(hp.ifFalse || "") + '</td></tr>';
      }).join("") + '</tbody></table></div>');
  }
  // 市场搜索
  if (rec.voices && rec.voices.length) {
    h += tnSection("🌐 市场搜索 · 用户真实声音",
      rec.voices.map(function (v) {
        return '<div class="tn-voice"><div class="tn-voice-q">"' + escapeHtml(v.quote || "") + '"</div>' +
          '<div class="tn-voice-m">' + escapeHtml(v.source || "") +
          (v.hypothesis ? ' · <span class="tn-hyp-tag">' + escapeHtml(v.hypothesis) + '</span>' : "") + '</div>' +
          (v.signal ? '<div class="tn-voice-s">信号解读：' + escapeHtml(v.signal) + '</div>' : "") + '</div>';
      }).join(""));
  }
  if (rec.competitors && rec.competitors.length) {
    h += tnSection("🆚 竞品情报",
      '<div class="tn-table-wrap"><table class="tn-table"><thead><tr><th>竞品</th><th>形态</th><th>用户评价</th><th>用户痛点</th><th>对你的启示</th></tr></thead><tbody>' +
      rec.competitors.map(function (c) {
        return '<tr><td><b>' + escapeHtml(c.name || "") + '</b></td><td>' + escapeHtml(c.form || "") + '</td><td>' + escapeHtml(c.review || "") + '</td><td>' + escapeHtml(c.pain || "") + '</td><td>' + escapeHtml(c.lesson || "") + '</td></tr>';
      }).join("") + '</tbody></table></div>');
  }
  if (rec.trends && rec.trends.length) {
    h += tnSection("📈 市场趋势", rec.trends.map(function (t) { return '<div class="tn-trend">▸ ' + escapeHtml(t) + '</div>'; }).join(""));
  }
  // 模拟调研
  if (rec.users && rec.users.length) {
    h += tnSection("🗣️ 模拟用户调研（" + rec.users.length + " 人）",
      '<div class="tn-users">' + rec.users.map(function (u) {
        return '<div class="tn-user">' +
          '<div class="tn-u-head"><span class="tn-u-name">👤 ' + escapeHtml(u.name || "") + '</span>' +
            '<span class="tn-u-match">' + escapeHtml(u.match || "") + '</span>' +
            '<span class="tn-u-pain">痛点 ' + (u.painScore || "-") + '/5</span></div>' +
          (u.profile ? '<div class="tn-u-line">' + escapeHtml(u.profile) + (u.personality ? " · " + escapeHtml(u.personality) : "") + '</div>' : "") +
          (u.answers && u.answers.length ? u.answers.map(function (a) {
            return '<div class="tn-qa"><span class="tn-q">' + escapeHtml(a.q || "") + '</span><span class="tn-a">' + escapeHtml(a.a || "") + '</span></div>';
          }).join("") : "") +
          (u.payWilling ? '<div class="tn-u-pay">💰 付费意愿：' + escapeHtml(u.payWilling) + '</div>' : "") +
          (u.quote ? '<div class="tn-u-quote">“' + escapeHtml(u.quote) + '”</div>' : "") +
        '</div>';
      }).join("") + '</div>');
  }
  // 汇总分析
  if (rec.hypothesisResults && rec.hypothesisResults.length) {
    h += tnSection("📊 假设验证结果",
      '<div class="tn-table-wrap"><table class="tn-table"><thead><tr><th>假设</th><th>结果</th><th>结论</th></tr></thead><tbody>' +
      rec.hypothesisResults.map(function (hr) {
        return '<tr><td><b>' + escapeHtml(hr.no || "") + '</b></td><td><span class="tn-res ' + tnResCls(hr.result) + '">' + escapeHtml(hr.result || "") + '</span></td><td>' + escapeHtml(hr.note || "") + '</td></tr>';
      }).join("") + '</tbody></table></div>');
  }
  if (rec.findings && rec.findings.length) {
    h += tnSection("🔎 关键发现", rec.findings.map(function (f, i) {
      return '<div class="tn-finding"><span class="tn-find-no">' + (i + 1) + '</span>' +
        '<div><div class="tn-find-t">' + escapeHtml(f.finding || "") + '</div>' +
        (f.evidence ? '<div class="tn-find-e">证据：' + escapeHtml(f.evidence) + '</div>' : "") + '</div></div>';
    }).join(""));
  }
  if (rec.payAnalysis) h += tnSection("💸 付费意愿分析", '<div class="tn-text">' + escapeHtml(rec.payAnalysis) + '</div>');
  if (rec.deviation) h += tnSection("🧭 产品方向偏差", '<div class="tn-text tn-deviation">' + escapeHtml(rec.deviation) + '</div>');
  if (rec.opportunities && rec.opportunities.length) {
    h += tnSection("🚀 机会点与建议", rec.opportunities.map(function (o, i) {
      return '<div class="tn-opp"><div class="tn-opp-t">' + (i + 1) + '. ' + escapeHtml(o.direction || "") + '</div>' +
        (o.evidence ? '<div class="tn-opp-e">证据：' + escapeHtml(o.evidence) + '</div>' : "") +
        (o.verify ? '<div class="tn-opp-v">验证方式：' + escapeHtml(o.verify) + '</div>' : "") + '</div>';
    }).join(""));
  }
  if (rec.nextSteps && rec.nextSteps.length) {
    h += tnSection("✅ 下一步行动计划", rec.nextSteps.map(function (s, i) {
      return '<div class="tn-step"><span class="tn-step-no">' + (i + 1) + '</span>' + escapeHtml(s) + '</div>';
    }).join(""));
  }
  var srcs = (rec.sources || []).filter(function (s) { return s && s.url; });
  if (srcs.length) {
    h += tnSection("🔗 参考来源", srcs.map(function (s) {
      return '<a class="tn-src" href="' + escapeHtml(s.url) + '" target="_blank" rel="noopener">' + escapeHtml(s.title || s.url) + ' ↗</a>';
    }).join(""));
  }
  h += '<div class="tn-disclaimer">⚠️ 免责声明：本报告基于「模拟用户调研 + 公开信息聚合」生成，定位为产品方向校准参考，不代表真实市场结论，不构成投资/经营建议；涉及医疗、金融、教育等敏感领域建议补充真实合规调研。</div>';
  return h;
}

// 供「我的产出」hub 复用
function truenorthReportHtmlForHub(rec) {
  return tnRenderReportBody(rec);
}

function tnSection(title, body) {
  return '<div class="tn-sec"><div class="tn-sec-t">' + title + '</div>' + body + '</div>';
}
function tnIntCls(v) { return (v || "").indexOf("强") >= 0 ? " hi" : ((v || "").indexOf("弱") >= 0 ? " lo" : ""); }
function tnPriCls(v) { v = v || ""; if (v.indexOf("最高") >= 0) return "p0"; if (v.indexOf("高") >= 0) return "p1"; if (v.indexOf("中") >= 0) return "p2"; return "p3"; }
function tnResCls(v) { v = v || ""; if (v.indexOf("支持") >= 0 && v.indexOf("不") < 0) return "ok"; if (v.indexOf("不") >= 0) return "no"; return "part"; }

// ---------- Markdown 导出 ----------
function tnBuildMarkdown(rec) {
  if (!rec) return "";
  var md = "# 🧭 TrueNorth 产品方向校准报告\n\n";
  md += "**产品**：" + rec.product + "　**阶段**：" + rec.stage + "　**日期**：" + rec.date + "\n\n";
  md += "## 执行摘要\n\n" + rec.summary + "\n\n";
  if (rec.research) md += "## 研究背景\n\n" + rec.research + "\n\n";
  if (rec.personas && rec.personas.length) {
    md += "## 目标用户画像\n\n";
    rec.personas.forEach(function (p) {
      md += "- **" + p.name + "**（痛点" + p.intensity + "）：" + p.demo + "。场景：" + p.scene + "。痛点：" + p.pain + "。现有方案：" + p.alt + "\n";
    });
    md += "\n";
  }
  if (rec.hypotheses && rec.hypotheses.length) {
    md += "## 待验证假设\n\n| 假设 | 内容 | 优先级 | 验证方法 | 不成立则 |\n|---|---|---|---|---|\n";
    rec.hypotheses.forEach(function (hp) { md += "| " + hp.no + " | " + hp.content + " | " + hp.priority + " | " + hp.method + " | " + hp.ifFalse + " |\n"; });
    md += "\n";
  }
  if (rec.users && rec.users.length) {
    md += "## 模拟用户调研（" + rec.users.length + " 人）\n\n";
    rec.users.forEach(function (u) {
      md += "### " + u.no + ". " + u.name + "（" + u.match + "，痛点" + u.painScore + "/5，付费意愿：" + u.payWilling + "）\n\n";
      (u.answers || []).forEach(function (a) { md += "- Q: " + a.q + "\n  A: " + a.a + "\n"; });
      if (u.quote) md += "> 最有价值的一句话：" + u.quote + "\n";
      md += "\n";
    });
  }
  if (rec.hypothesisResults && rec.hypothesisResults.length) {
    md += "## 假设验证结果\n\n";
    rec.hypothesisResults.forEach(function (hr) { md += "- " + hr.no + "：" + hr.result + " — " + hr.note + "\n"; });
    md += "\n";
  }
  if (rec.findings && rec.findings.length) {
    md += "## 关键发现\n\n";
    rec.findings.forEach(function (f) { md += "- **" + f.finding + "**（证据：" + f.evidence + "）\n"; });
    md += "\n";
  }
  if (rec.payAnalysis) md += "## 付费意愿分析\n\n" + rec.payAnalysis + "\n\n";
  if (rec.deviation) md += "## 产品方向偏差\n\n" + rec.deviation + "\n\n";
  if (rec.opportunities && rec.opportunities.length) {
    md += "## 机会点与建议\n\n";
    rec.opportunities.forEach(function (o) { md += "- **" + o.direction + "**（证据：" + o.evidence + "；验证：" + o.verify + "）\n"; });
    md += "\n";
  }
  if (rec.nextSteps && rec.nextSteps.length) {
    md += "## 下一步行动计划\n\n";
    rec.nextSteps.forEach(function (s) { md += "- " + s + "\n"; });
    md += "\n";
  }
  var srcs = (rec.sources || []).filter(function (s) { return s && s.url; });
  if (srcs.length) {
    md += "## 参考来源\n\n";
    srcs.forEach(function (s) { md += "- [" + s.title + "](" + s.url + ")\n"; });
    md += "\n";
  }
  md += "---\n⚠️ 免责声明：本报告基于模拟用户调研与公开信息聚合生成，定位为产品方向校准参考，不代表真实市场结论。\n";
  return md;
}
