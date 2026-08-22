// ============================================================
// 市场调研报告生成器 · 接入「需求洞察」板块
// 复用 intel.js 免费大模型层：callLLMForPrompt / INTEL_PROVIDERS.gemini
// （google_search grounding，真实联网检索 + 引用），共享 AI Key
// （loadAiConfig / saveAiConfig，localStorage: hw_pm_ai_config）。
// 九大维度框架来自「市场调研报告生成器」skill。
// 设计原则：纯函数不依赖 DOM（便于 Node vm 测试），UI 渲染走全局函数。
// ============================================================

// ---------- 容器与配置 ----------
function ensureMr() {
  if (!DB || !DB.data || !DB.data.growth) return;
  if (!DB.data.growth.mr) DB.data.growth.mr = { history: [], reports: [] };
  if (!DB.data.growth.mr.history) DB.data.growth.mr.history = [];
  if (!DB.data.growth.mr.reports) DB.data.growth.mr.reports = [];
}

function mrLoadConfig() { try { return JSON.parse(localStorage.getItem("hw_pm_mr_config") || "{}"); } catch (e) { return {}; } }
function mrSaveConfig(c) { try { localStorage.setItem("hw_pm_mr_config", JSON.stringify(c || {})); } catch (e) {} }

// 模型下拉选项（复用共享 AI 配置 provider 列表）
function mrProvOpts() {
  var cfg = (typeof loadAiConfig === "function") ? loadAiConfig() : {};
  var defProv = cfg.provider || "gemini";
  return Object.keys(INTEL_PROVIDERS).map(function (k) {
    var p = INTEL_PROVIDERS[k];
    var sel = (defProv === k) ? " selected" : "";
    return '<option value="' + k + '"' + sel + '>' + p.name + intelProvBadge(k) + '</option>';
  }).join("");
}

// ---------- 工具 ----------
function mrArr(x) { return Array.isArray(x) ? x.filter(function (v) { return v != null && String(v).trim() !== ""; }) : []; }
function mrStr(x, d) { return x == null ? (d || "") : String(x); }
function mrRatingClass(r) {
  r = (r || "").trim();
  if (r === "高") return "mr-badge mr-badge-green";
  if (r === "中") return "mr-badge mr-badge-orange";
  if (r === "低") return "mr-badge mr-badge-red";
  return "mr-badge mr-badge-gray";
}
function mrPriorityFromRating(r) {
  r = (r || "").trim();
  if (r === "高") return "high";
  if (r === "低") return "low";
  return "medium";
}

// ---------- 提示词（九大维度）----------
function mrBuildPrompt(market, purpose, scope, audience) {
  purpose = mrStr(purpose, "产品立项与差异化定位论证");
  scope = mrStr(scope, "全球主要市场");
  audience = mrStr(audience, "公司管理层 / 产品经理 / 投资评审");
  return "你是资深市场调研与战略分析专家，服务于一家消费电子/硬件产品公司。请基于联网检索（使用最新真实数据，并尽量给出信息来源链接）对「" + market + "」做一次完整的专业市场调研。\n" +
    "调研目的：" + purpose + "\n" +
    "调研范围：" + scope + "\n" +
    "目标读者：" + audience + "\n\n" +
    "请严格只返回如下结构的 JSON（不要任何额外解释、不要使用 markdown 代码块包裹，直接输出 JSON 对象）：\n" +
    "{\n" +
    '  "summary": "一页纸核心结论：用3-5句话概括市场规模、增长、竞争格局与是否值得入局的总体判断",\n' +
    '  "rating": "机会评级，取值：高 / 中 / 低",\n' +
    '  "ratingReason": "评级理由（1-2句）",\n' +
    '  "pest": {\n' +
    '    "policy": ["政策/监管/扶持/准入/国标相关要点，3-5条"],\n' +
    '    "economy": ["经济/消费/投融资相关要点，3-5条"],\n' +
    '    "society": ["人口/生活方式/消费观念相关要点，3-5条"],\n' +
    '    "technology": ["技术迭代/专利/供应链成熟度相关要点，3-5条"]\n' +
    "  },\n" +
    '  "overview": {\n' +
    '    "definition": "行业定义与业务边界",\n' +
    '    "lifecycle": "生命周期阶段（导入/成长/成熟/衰退）",\n' +
    '    "scale": "当前市场规模（含金额与单位，如人民币/美元、亿/万亿）",\n' +
    '    "cagr": "增速或 CAGR",\n' +
    '    "forecast": "未来3-5年规模预测",\n' +
    '    "drivers": ["行业驱动因素"],\n' +
    '    "constraints": ["制约因素"],\n' +
    '    "pains": ["行业现存痛点/未被满足的需求"]\n' +
    "  },\n" +
    '  "chain": {\n' +
    '    "upstream": ["上游：原材料/核心部件/供应商格局"],\n' +
    '    "midstream": ["中游：生产/平台/商业模式"],\n' +
    '    "downstream": ["下游：应用场景/终端客户/渠道"],\n' +
    '    "value": "产业链价值分布与利润集中在哪一环、卡脖子环节"\n' +
    "  },\n" +
    '  "supplyDemand": {\n' +
    '    "supply": ["供给端：产能/玩家/同质化等"],\n' +
    '    "demand": ["需求端：需求量/刚需可选/季节性/区域差异"],\n' +
    '    "match": "供需匹配度判断（过剩/短缺/紧平衡）"\n' +
    "  },\n" +
    '  "competition": {\n' +
    '    "concentration": "市场集中度（CR3/CR5）与格局类型",\n' +
    '    "players": [{"name":"代表企业","position":"梯队/定位","price":"定价策略","channel":"渠道布局","strength":"优势","weakness":"短板"}],\n' +
    '    "forces": "波特五力要点（进入壁垒/替代品/上下游议价）"\n' +
    "  },\n" +
    '  "users": {\n' +
    '    "profile": ["用户画像：年龄/性别/收入/职业/城市层级"],\n' +
    '    "needs": ["核心需求/次要需求/隐性需求"],\n' +
    '    "behavior": ["购买决策路径/渠道/价格敏感度/复购"],\n' +
    '    "pains": ["用户痛点/吐槽点"]\n' +
    "  },\n" +
    '  "channel": {\n' +
    '    "types": ["线上/线下渠道类型"],\n' +
    '    "structure": "渠道层级、分销模式、利润分配",\n' +
    '    "trend": "渠道趋势（新兴渠道/萎缩渠道）"\n' +
    "  },\n" +
    '  "priceProfit": {\n' +
    '    "priceBands": ["高中低端价格带"],\n' +
    '    "cost": "成本结构",\n' +
    '    "grossMargin": "毛利率水平",\n' +
    '    "model": "商业模式（直销/经销/订阅/平台抽成）",\n' +
    '    "ceiling": "盈利天花板与可持续性"\n' +
    "  },\n" +
    '  "trends": {\n' +
    '    "future": ["未来3-5年技术/消费/行业趋势"],\n' +
    '    "opportunities": [{"desc":"蓝海/空白赛道/切入机会点","target":"目标人群/场景","value":"价值点","feasibility":"可行性 高/中/低","score":数值(0-100)}],\n' +
    '    "risks": ["政策/内卷/替代/渠道/原材料波动风险"],\n' +
    '    "suggestions": ["战略建议：入局/观望/细分切入/差异化/渠道布局"]\n' +
    "  },\n" +
    '  "sources": [{"title":"来源标题(联网检索到的真实网页)","url":"来源链接"}]\n' +
    "}\n";
}

// ---------- 主流程 ----------
async function mrGenerate() {
  ensureMr();
  var market = document.getElementById("mr-market") ? document.getElementById("mr-market").value.trim() : "";
  if (!market) { mrErr("请输入要调研的市场/行业"); return; }
  var purpose = document.getElementById("mr-purpose") ? document.getElementById("mr-purpose").value.trim() : "";
  var scope = document.getElementById("mr-scope") ? document.getElementById("mr-scope").value.trim() : "";
  var audience = document.getElementById("mr-audience") ? document.getElementById("mr-audience").value.trim() : "";

  mrSaveConfig({ purpose: purpose, scope: scope, audience: audience });

  var provEl = document.getElementById("mr-prov");
  var keyEl = document.getElementById("mr-key");
  var cfg = (typeof loadAiConfig === "function") ? loadAiConfig() : {};
  var provider = provEl ? provEl.value : (cfg.provider || "gemini");
  var apiKey = keyEl ? (keyEl.value || "").trim() : (cfg.key ? cfg.key : "");
  if (provider) cfg.provider = provider;
  if (apiKey) cfg.key = apiKey;
  if (typeof saveAiConfig === "function") saveAiConfig(cfg);
  if (!apiKey) { mrShowNoKey(); return; }

  mrLoading(true);
  mrErr("");
  try {
    var prompt = mrBuildPrompt(market, purpose, scope, audience);
    if (typeof callLLMForPrompt !== "function") throw new Error("大模型调用层未就绪");
    var r = await callLLMForPrompt(provider, apiKey, prompt);
    var parsed;
    try {
      parsed = (typeof parseIntelLLM === "function") ? parseIntelLLM(r.text) : JSON.parse(r.text);
    } catch (e) {
      // JSON 解析失败：把原始文本交给渲染器兜底展示
      parsed = { _raw: r.text, summary: "", rating: "", ratingReason: "" };
    }
    var sources = mrArr(parsed.sources).map(function (s) { return { title: mrStr(s.title), url: mrStr(s.url) }; });
    (r.sources || []).forEach(function (s) {
      if (s && s.url && !sources.some(function (x) { return x.url === s.url; })) sources.push({ title: mrStr(s.title), url: mrStr(s.url) });
    });
    if (typeof intelExtractTextLinks === "function") {
      intelExtractTextLinks(r.text).forEach(function (s) {
        if (s && s.url && !sources.some(function (x) { return x.url === s.url; })) sources.push({ title: mrStr(s.title), url: mrStr(s.url) });
      });
    }
    var meta = { market: market, purpose: purpose, scope: scope, audience: audience, date: (typeof today === "function" ? today() : "nodate"), provider: provider };
    window.__mrLast = { parsed: parsed, meta: meta, sources: sources };

    // 历史（轻量）
    var hist = DB.data.growth.mr.history.filter(function (h) { return h.market !== market; });
    hist.unshift({ market: market, purpose: purpose, scope: scope, date: meta.date });
    DB.data.growth.mr.history = hist.slice(0, 12);
    // 报告存档（完整）
    var rid = (typeof uid === "function" ? uid() : "mr" + Math.random().toString(36).slice(2, 9));
    DB.data.growth.mr.reports.unshift({ id: rid, market: market, parsed: parsed, meta: meta, sources: sources, createdAt: new Date().toISOString(), fav: false });
    DB.data.growth.mr.reports = DB.data.growth.mr.reports.slice(0, 20);
    if (typeof DB.save === "function") DB.save();

    mrRenderReport();
    if (typeof showToast === "function") showToast("报告已生成（" + provider + " 联网检索）", "success");
  } catch (e) {
    mrLoading(false);
    mrErr("生成失败：" + (e && e.message ? e.message : e) + (apiKey ? "" : "（需先配置免费 Gemini Key）"));
  }
  mrLoading(false);
}

function mrErr(msg) {
  var b = document.getElementById("mr-err");
  if (!b) return;
  if (!msg) { b.className = "mr-err hidden"; b.innerHTML = ""; return; }
  b.className = "mr-err";
  b.innerHTML = "⚠️ " + escapeHtml(msg);
}
function mrLoading(on) {
  var b = document.getElementById("mr-loading");
  if (!b) return;
  b.className = "mr-loading" + (on ? "" : " hidden");
}

function mrShowNoKey() {
  var b = document.getElementById("mr-result");
  if (!b) return;
  b.innerHTML =
    '<div class="mr-nokey">' +
    '<div class="mr-nokey-t">🔑 需要配置免费大模型 Key</div>' +
    '<div class="mr-nokey-d">市场调研报告依赖大模型（首选 <b>智谱 GLM-4-Flash（国内·永久免费）</b>或 <b>硅基流动（国内·免费模型）</b>，国内直连、无需信用卡）。配置一次即可在「自定义情报 / 市场机会 / 小红书爆款 / 市场调研」多模块复用。</div>' +
    '<div class="mr-nokey-actions">' +
    '<button class="btn btn-primary" onclick="openFreeApiGuide()">🔑 如何获取国内免费 Key（智谱/硅基流动）</button>' +
    '</div>' +
    '<div class="mr-nokey-tip">配置路径：行业情报 → 自定义情报 → 在模型下拉选「智谱 GLM-4-Flash」、粘贴 Key（仅存本机、不上云）。勾选「🌐 联网检索」后，智谱会联网搜索并产出真实可点击的来源链接（单次检索约¥0.01）。</div>' +
    '</div>';
}

// ---------- 渲染：报告主体（供视图与下载共用）----------
function mrReportBodyHtml(data) {
  data = data || window.__mrLast;
  if (!data) return "<p style='color:#999'>尚未生成报告</p>";
  var p = data.parsed || {};
  var meta = data.meta || {};
  var sources = data.sources || [];

  if (p._raw) {
    return '<div class="mr-raw"><div class="mr-raw-note">⚠️ 模型未返回标准 JSON，已按原始文本展示：</div><pre>' + escapeHtml(p._raw) + "</pre></div>";
  }

  var html = "";
  // 摘要 + 评级
  html += '<div class="mr-summary">' +
    '<div class="mr-summary-head"><span class="' + mrRatingClass(p.rating) + '">' + escapeHtml(mrStr(p.rating, "评级未知")) + " 机会</span>" +
    '<span class="mr-summary-market">' + escapeHtml(meta.market || "") + " 市场调研</span></div>" +
    '<div class="mr-summary-body">' + escapeHtml(mrStr(p.summary)) + "</div>" +
    (mrStr(p.ratingReason) ? '<div class="mr-summary-reason">📌 ' + escapeHtml(p.ratingReason) + "</div>" : "") +
    "</div>";

  // 1. 宏观 PEST
  var pest = p.pest || {};
  html += mrSec("🌐", "宏观环境（PEST）",
    mrSub("政策 Policy", mrList(pest.policy)) +
    mrSub("经济 Economy", mrList(pest.economy)) +
    mrSub("社会 Society", mrList(pest.society)) +
    mrSub("技术 Technology", mrList(pest.technology))
  );

  // 2. 行业概况
  var ov = p.overview || {};
  html += mrSec("🏭", "行业整体规模与生命周期",
    mrKv([
      ["行业定义", ov.definition], ["生命周期", ov.lifecycle], ["当前规模", ov.scale],
      ["增速/CAGR", ov.cagr], ["未来预测", ov.forecast]
    ]) +
    mrSub("驱动因素", mrList(ov.drivers)) +
    mrSub("制约因素", mrList(ov.constraints)) +
    mrSub("痛点与未被满足需求", mrList(ov.pains))
  );

  // 3. 产业链
  var ch = p.chain || {};
  html += mrSec("🔗", "产业链上下游拆解",
    mrSub("上游", mrList(ch.upstream)) +
    mrSub("中游", mrList(ch.midstream)) +
    mrSub("下游", mrList(ch.downstream)) +
    mrSub("价值分布", mrStr(ch.value) ? "<p class='mr-p'>" + escapeHtml(ch.value) + "</p>" : "")
  );

  // 4. 供需
  var sd = p.supplyDemand || {};
  html += mrSec("⚖️", "市场供需格局",
    mrSub("供给端", mrList(sd.supply)) +
    mrSub("需求端", mrList(sd.demand)) +
    mrSub("供需匹配", mrStr(sd.match) ? "<p class='mr-p'>" + escapeHtml(sd.match) + "</p>" : "")
  );

  // 5. 竞争
  var cp = p.competition || {};
  var players = mrArr(cp.players).map(function (x) {
    return [mrStr(x.name), mrStr(x.position), mrStr(x.price), mrStr(x.channel), mrStr(x.strength), mrStr(x.weakness)];
  });
  html += mrSec("🥊", "竞争格局与竞品对标",
    (mrStr(cp.concentration) ? mrSub("市场集中度", "<p class='mr-p'>" + escapeHtml(cp.concentration) + "</p>") : "") +
    (players.length ? mrTbl(["企业", "定位", "定价", "渠道", "优势", "短板"], players) : "") +
    (mrStr(cp.forces) ? mrSub("波特五力", "<p class='mr-p'>" + escapeHtml(cp.forces) + "</p>") : "")
  );

  // 6. 用户洞察
  var us = p.users || {};
  html += mrSec("👥", "用户画像与需求洞察",
    mrSub("用户画像", mrList(us.profile)) +
    mrSub("需求层次", mrList(us.needs)) +
    mrSub("消费行为", mrList(us.behavior)) +
    mrSub("痛点与偏好", mrList(us.pains))
  );

  // 7. 渠道
  var ca = p.channel || {};
  html += mrSec("🛒", "渠道结构与盈利模式（渠道侧）",
    mrSub("渠道类型", mrList(ca.types)) +
    (mrStr(ca.structure) ? mrSub("渠道结构", "<p class='mr-p'>" + escapeHtml(ca.structure) + "</p>") : "") +
    (mrStr(ca.trend) ? mrSub("渠道趋势", "<p class='mr-p'>" + escapeHtml(ca.trend) + "</p>") : "")
  );

  // 8. 价格盈利
  var pp = p.priceProfit || {};
  html += mrSec("💰", "价格体系与盈利模式",
    mrSub("价格带", mrList(pp.priceBands)) +
    mrKv([["成本结构", pp.cost], ["毛利率", pp.grossMargin], ["商业模式", pp.model], ["盈利天花板", pp.ceiling]])
  );

  // 9. 趋势与建议
  var tr = p.trends || {};
  var opps = mrArr(tr.opportunities).map(function (x) {
    return [mrStr(x.desc), mrStr(x.target), mrStr(x.value), mrStr(x.feasibility), mrStr(x.score)];
  });
  html += mrSec("🚀", "发展趋势、机会风险与建议",
    mrSub("未来趋势", mrList(tr.future)) +
    (opps.length ? mrTbl(["机会点", "目标人群/场景", "价值点", "可行性", "评分"], opps) : "") +
    mrSub("风险", mrList(tr.risks)) +
    mrSub("战略建议", mrList(tr.suggestions))
  );

  // 来源
  if (sources.length) {
    html += '<div class="mr-sources"><div class="mr-sec-t">🔗 数据来源</div><ul class="mr-list">' +
      sources.map(function (s) {
        var t = escapeHtml(mrStr(s.title) || mrStr(s.url));
        return "<li>" + (s.url ? "<a href='" + escapeHtml(s.url) + "' target='_blank' rel='noopener'>" + t + "</a>" : t) + "</li>";
      }).join("") + "</ul></div>";
  }

  return html;
}

// 区块渲染辅助
function mrSec(icon, title, inner) {
  if (!inner || !inner.trim()) return "";
  return '<div class="mr-sec"><div class="mr-sec-h">' + icon + " " + escapeHtml(title) + "</div>" + inner + "</div>";
}
function mrSub(t, inner) {
  if (!inner || !inner.trim()) return "";
  return '<div class="mr-sub"><div class="mr-sub-t">' + escapeHtml(t) + "</div>" + inner + "</div>";
}
function mrList(arr) {
  arr = mrArr(arr);
  if (!arr.length) return "";
  return "<ul class='mr-list'>" + arr.map(function (x) { return "<li>" + escapeHtml(mrStr(x)) + "</li>"; }).join("") + "</ul>";
}
function mrKv(rows) {
  var valid = rows.filter(function (r) { return mrStr(r[1]).trim() !== ""; });
  if (!valid.length) return "";
  return "<table class='mr-tbl'><tbody>" + valid.map(function (r) {
    return "<tr><th>" + escapeHtml(r[0]) + "</th><td>" + escapeHtml(mrStr(r[1])) + "</td></tr>";
  }).join("") + "</tbody></table>";
}
function mrTbl(headers, rows) {
  if (!rows || !rows.length) return "";
  return "<table class='mr-tbl mr-tbl-grid'><thead><tr>" + headers.map(function (h) { return "<th>" + escapeHtml(h) + "</th>"; }).join("") +
    "</tr></thead><tbody>" + rows.map(function (row) {
      return "<tr>" + row.map(function (c) { return "<td>" + escapeHtml(mrStr(c)) + "</td>"; }).join("") + "</tr>";
    }).join("") + "</tbody></table>";
}

// ---------- 渲染：入口视图 ----------
function renderMrQuery(c) {
  ensureMr();
  var cfg = mrLoadConfig();
  var mcfg = (typeof loadAiConfig === "function") ? loadAiConfig() : {};
  var history = (DB.data.growth.mr.history || []).slice(0, 8);
  var histHtml = history.length
    ? '<div class="mr-history">最近调研：' + history.map(function (h) {
        return '<span class="mr-chip" onclick="mrQuick(\'' + escapeHtml(h.market).replace(/'/g, "\\'") + '\')">' + escapeHtml(h.market) + "</span>";
      }).join("") + "</div>"
    : "";

  c.innerHTML =
    '<div class="mr-wrap">' +
      '<div class="mr-card">' +
        '<div class="mr-input-row">' +
          '<input id="mr-market" class="form-input" placeholder="输入要调研的市场/行业，如：便携美容仪 / 折叠屏手机 / 户外电源" style="flex:1" value="' + escapeHtml(cfg._last || "") + '">' +
          '<button class="btn btn-primary" onclick="mrGenerate()">📊 生成报告</button>' +
        '</div>' +
        '<div class="mr-input-row" style="margin-top:8px">' +
          '<input id="mr-purpose" class="form-input" placeholder="调研目的（立项论证/竞品分析/市场进入/投资参考）" value="' + escapeHtml(cfg.purpose || "") + '">' +
        '</div>' +
        '<div class="mr-input-row" style="margin-top:8px">' +
          '<input id="mr-scope" class="form-input" placeholder="调研范围（地区/人群/时间），如：中国 / 欧美 / 全球" value="' + escapeHtml(cfg.scope || "") + '">' +
          '<input id="mr-audience" class="form-input" placeholder="目标读者" value="' + escapeHtml(cfg.audience || "") + '">' +
        '</div>' +
        '<div class="mr-input-row" style="margin-top:8px">' +
          '<select id="mr-prov" class="form-input" style="width:240px">' + mrProvOpts() + '</select>' +
          '<input id="mr-key" class="form-input" type="password" placeholder="API Key（仅存本机，与自定义情报共享）" value="' + escapeHtml(mcfg.key || "") + '">' +
        '</div>' +
        '<div class="mr-hint">基于免费大模型（默认 Gemini 联网搜索带来源；无 VPN 可切换智谱/硅基流动）生成九大维度报告。配置一次，多模块复用。</div>' +
        '<label class="mr-ws"><input type="checkbox" id="mr-ws"' + ((mcfg.webSearch !== false) ? " checked" : "") + ' onchange="intelToggleWs(this)"> 🌐 联网检索（获取真实来源链接）</label>' +
        histHtml +
      '</div>' +
      '<div id="mr-err" class="mr-err hidden"></div>' +
      '<div id="mr-loading" class="mr-loading hidden">⏳ 正在联网检索并生成九大维度报告（智谱 GLM-4-Flash 中）…</div>' +
      '<div id="mr-result"></div>' +
    '</div>';

  if (window.__mrLast) mrRenderReport();
}

function mrRenderReport() {
  var b = document.getElementById("mr-result");
  if (!b) return;
  if (!window.__mrLast) { b.innerHTML = ""; return; }
  var meta = window.__mrLast.meta || {};
  b.innerHTML =
    '<div class="mr-report">' + mrReportBodyHtml(window.__mrLast) + "</div>" +
    '<div class="mr-actions">' +
      '<button class="btn btn-secondary" onclick="mrSaveToInsights()">💾 存入需求洞察</button>' +
      '<button class="btn btn-secondary" onclick="goAiOutputs()">📂 我的产出</button>' +
      '<button class="btn btn-secondary" onclick="mrDownloadReport(\'html\')">📄 下载 HTML</button>' +
      '<button class="btn btn-secondary" onclick="mrDownloadReport(\'word\')">📝 导出 Word</button>' +
      '<button class="btn btn-secondary" onclick="mrPrintReport()">🖨 打印</button>' +
    '</div>' +
    '<div class="mr-foot">调研对象：' + escapeHtml(meta.market || "") + " ｜ 生成日期：" + escapeHtml(meta.date || "") + " ｜ 模型：" + escapeHtml(meta.provider || "") + "</div>";
}

function mrQuick(market) {
  var el = document.getElementById("mr-market");
  if (el) el.value = market;
  mrGenerate();
}

// ---------- 存入需求洞察 ----------
function mrSaveToInsights() {
  if (!window.__mrLast) { if (typeof showToast === "function") showToast("请先生成报告"); return; }
  var p = window.__mrLast.parsed || {};
  var meta = window.__mrLast.meta || {};
  var pains = mrArr(p.overview && p.overview.pains).concat(mrArr(p.users && p.users.pains));
  var opps = mrArr(p.trends && p.trends.suggestions).concat(
    mrArr(p.trends && p.trends.opportunities).map(function (o) { return mrStr(o.desc) + (o.value ? "（价值：" + mrStr(o.value) + "）" : ""); })
  );
  var id = (typeof uid === "function" ? uid() : "ins" + Math.random().toString(36).slice(2, 9));
  var item = {
    id: id,
    title: (meta.market || "市场") + " · 市场调研",
    targetUser: mrStr(meta.audience) || (mrArr(p.users && p.users.profile)[0] || "目标客户/用户"),
    painPoint: pains.length ? pains.slice(0, 4).join("；") : (mrStr(p.overview && p.overview.pains) || "（详见报告）"),
    description: mrStr(p.summary) + (opps.length ? "\n机会点：" + opps.slice(0, 4).join("；") : ""),
    priority: mrPriorityFromRating(p.rating),
    product: meta.market || "",
    date: (typeof today === "function" ? today() : "nodate"),
    mrId: (window.__mrLast && window.__mrLast.meta) ? (window.__mrLast.meta.date + "|" + meta.market) : id,
    links: (window.__mrLast.sources || []).slice(0, 5).map(function (s) { return { title: mrStr(s.title), url: mrStr(s.url) }; })
  };
  if (!DB.data.insights) DB.data.insights = [];
  DB.data.insights.unshift(item);
  if (typeof DB.save === "function") DB.save();
  if (typeof DB.logActivity === "function") DB.logActivity("insight", "市场调研存入洞察：" + item.title);
  if (typeof showToast === "function") showToast("已存入需求洞察", "success");
  // 跳回我的洞察列表
  window.__insightsView = "list";
  if (typeof render === "function") render();
}

// ---------- 下载 / 打印 ----------
function mrReportDocument(last, format) {
  var body = mrReportBodyHtml(last);
  var m = (last && last.meta) || {};
  var title = escapeHtml((m.market || "市场") + " 市场调研报告");
  var style = "body{font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;padding:28px;color:#222;line-height:1.6}" +
    ".mr-summary{border-left:4px solid #ff8a3d;background:#fff7ef;padding:14px 16px;border-radius:8px;margin-bottom:16px}" +
    ".mr-summary-head{display:flex;align-items:center;gap:10px;margin-bottom:8px}" +
    ".mr-summary-market{font-size:18px;font-weight:700}" +
    ".mr-summary-body{font-size:14px}" + ".mr-summary-reason{font-size:12px;color:#888;margin-top:6px}" +
    ".mr-badge{display:inline-block;padding:3px 10px;border-radius:20px;color:#fff;font-size:13px;font-weight:600}" +
    ".mr-badge-green{background:#30c46a}.mr-badge-orange{background:#ff8a3d}.mr-badge-red{background:#ff4d4f}.mr-badge-gray{background:#999}" +
    ".mr-sec{border:1px solid #eee;border-radius:10px;padding:14px 16px;margin-bottom:14px}" +
    ".mr-sec-h{font-size:15px;font-weight:700;margin-bottom:10px}" +
    ".mr-sub{margin:10px 0}.mr-sub-t{font-size:13px;font-weight:600;color:#555;margin-bottom:4px}" +
    ".mr-list{margin:4px 0;padding-left:20px}.mr-list li{margin:3px 0;font-size:13px}" +
    ".mr-p{font-size:13px;margin:4px 0}" +
    ".mr-tbl{border-collapse:collapse;width:100%;margin:6px 0;font-size:13px}" +
    ".mr-tbl th,.mr-tbl td{border:1px solid #e3e3e3;padding:7px 9px;text-align:left;vertical-align:top}" +
    ".mr-tbl th{background:#f6f7f9;font-weight:600}.mr-tbl-grid th{background:#fff0e6}" +
    ".mr-sources{margin-top:10px}.mr-sec-t{font-size:14px;font-weight:700;margin-bottom:6px}" +
    ".mr-foot{font-size:12px;color:#999;margin-top:14px}";
  if (format === "word") {
    return '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>' + title + '</title><style>' + style + "</style></head><body>" + body + "</body></html>";
  }
  return "<!DOCTYPE html><html lang='zh-CN'><head><meta charset='utf-8'><title>" + title + "</title><style>" + style + "</style></head><body>" + body + "</body></html>";
}

function mrDownloadReport(format) {
  if (!window.__mrLast) { if (typeof showToast === "function") showToast("请先生成报告"); return; }
  var last = window.__mrLast;
  var market = (last.meta && last.meta.market) || "market";
  var fname = market.replace(/[^\w一-龥]/g, "_") + (format === "word" ? "_市场调研.doc" : "_市场调研.html");
  var html = mrReportDocument(last, format);
  try {
    var mime = format === "word" ? "application/msword;charset=utf-8" : "text/html;charset=utf-8";
    var blob = new Blob(["﻿", html], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = fname; document.body.appendChild(a); a.click();
    document.body.removeChild(a); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    if (typeof showToast === "function") showToast("已下载：" + fname);
  } catch (e) {
    if (typeof showToast === "function") showToast("下载失败：" + (e && e.message ? e.message : e));
  }
}

function mrPrintReport() {
  if (!window.__mrLast) { if (typeof showToast === "function") showToast("请先生成报告"); return; }
  var html = mrReportDocument(window.__mrLast, "html");
  try {
    var w = window.open("", "_blank");
    if (!w) { if (typeof showToast === "function") showToast("浏览器拦截了弹窗，请允许后重试"); return; }
    w.document.open(); w.document.write(html); w.document.close();
    setTimeout(function () { w.focus(); w.print(); }, 400);
  } catch (e) {
    if (typeof showToast === "function") showToast("打印失败：" + (e && e.message ? e.message : e));
  }
}
