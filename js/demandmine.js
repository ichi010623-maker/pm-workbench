// ============================================================
// 📣 需求挖掘（国内公域新媒体需求洞察）
// 方法论：从中国主流社交平台（小红书/抖音/微博/淘宝/京东/视频号）挖掘真实用户声音，
// 发现产品需求与市场机会。两大路径：
//   ① AI 联网生成：调用大模型（默认 Gemini 联网检索）研究公开舆论，产出结构化报告。
//   ② 导入数据：把已抓取的原始评论/笔记粘贴进来，前端做关键词分类 + 情绪 + 频次 + 优先级。
// 报告结构遵循「执行摘要 / 关键数字 / Top5 痛点 / 机会矩阵 / 详细分析 / 行动建议 / 数据来源」。
// ============================================================

// ---------- 存储 ----------
function dmGet() {
  if (!DB.data.demandReports) DB.data.demandReports = [];
  return DB.data.demandReports;
}
function dmSaveReport(rec) {
  var a = dmGet();
  a.unshift(rec);
  if (a.length > 50) a.length = 50;
  try { DB.save(); } catch (e) {}
}
function dmDeleteReport(id) {
  if (typeof confirm === "function" && !confirm("确定删除这条需求挖掘报告？删除后不可恢复。")) return;
  var a = dmGet();
  for (var i = 0; i < a.length; i++) {
    if (a[i].id === id) { a.splice(i, 1); break; }
  }
  try { DB.save(); } catch (e) {}
  renderDemandMine();
  if (typeof showToast === "function") showToast("已删除", "success");
}
function dmToggleFav(id) {
  var a = dmGet();
  for (var i = 0; i < a.length; i++) {
    if (a[i].id === id) {
      a[i].fav = !a[i].fav;
      try { DB.save(); } catch (e) {}
      break;
    }
  }
  renderDemandMine();
  if (typeof showToast === "function") showToast(a.find(function (x) { return x.id === id; }) && a.find(function (x) { return x.id === id; }).fav ? "已收藏 ⭐" : "已取消收藏", "success");
}

// ---------- 平台选择（按需求类型） ----------
var DM_PLATFORMS = {
  physical: ["小红书", "抖音", "淘宝", "京东"],
  virtual: ["小红书", "抖音", "微博", "视频号"]
};
function dmDefaultPlatforms(type) {
  return (DM_PLATFORMS[type] || DM_PLATFORMS.physical).slice();
}

// ---------- 分类关键词库（导入数据路径用） ----------
var DM_CAT_KEYWORDS = {
  "功能缺失": ["没有", "缺少", "希望能", "要是能", "希望加", "希望有", "期待", "增加", "支持", "能不能", "想要", "无法", "不能", "缺", "建议增加", "求"],
  "体验问题": ["难用", "麻烦", "繁琐", "复杂", "不好用", "不直观", "反人类", "劝退", "崩溃", "闪退", "bug", "报错", "卡顿", "流程", "别扭", "迷惑"],
  "性能问题": ["慢", "加载", "内存", "发热", "掉电", "耗电", "延迟", "响应慢", "占内存", "卡死", "卡住", "转圈"],
  "定价问题": ["贵", "价格", "太贵", "性价比", "不值", "收费", "付费", "涨价", "坑钱", "溢价", "划算", "降价", "免费"],
  "内容问题": ["内容少", "质量差", "没意思", "烂尾", "更新慢", "水", "凑数", "同质化", "抄袭", "敷衍"],
  "竞品对比": ["不如", "比", "好用", "换到", "弃用", "替代品", "平替", "竞品", "从", "换"]
};
var DM_EMO_STRONG = ["垃圾", "坑", "坑死", "崩溃", "气死", "烂", "废物", "骗", "套路", "恶心", "智商税", "后悔", "离谱", "差评", "骗钱", "割韭菜"];
var DM_EMO_MID = ["难用", "失望", "烦", "劝退", "鸡肋", "凑合", "一般", "问题", "不行", "遗憾", "无奈"];
var DM_EMO_LIGHT = ["希望", "建议", "期待", "要是", "可以", "最好", "如果能", "推荐", "想要"];

function dmClassify(text) {
  text = String(text || "");
  var best = "体验问题", bestN = 0;
  for (var cat in DM_CAT_KEYWORDS) {
    var n = 0;
    DM_CAT_KEYWORDS[cat].forEach(function (kw) { if (text.indexOf(kw) >= 0) n++; });
    if (n > bestN) { bestN = n; best = cat; }
  }
  return best;
}
function dmSentiment(text) {
  text = String(text || "");
  for (var i = 0; i < DM_EMO_STRONG.length; i++) if (text.indexOf(DM_EMO_STRONG[i]) >= 0) return "强烈";
  for (var j = 0; j < DM_EMO_MID.length; j++) if (text.indexOf(DM_EMO_MID[j]) >= 0) return "中等";
  for (var k = 0; k < DM_EMO_LIGHT.length; k++) if (text.indexOf(DM_EMO_LIGHT[k]) >= 0) return "轻微";
  return "轻微";
}
// 可操作性：有「建议/希望/求/增加」等正向诉求词 → 高；纯吐槽 → 中；模糊 → 低
function dmActionability(text) {
  text = String(text || "");
  if (/希望|建议|求|增加|支持|可以|应该|需要|期待|要是/.test(text)) return "高";
  if (/问题|不好|麻烦|难用|bug|崩溃/.test(text)) return "中";
  return "低";
}
function dmPriority(freqLevel, emotion, action) {
  var f = freqLevel === "高" ? 3 : freqLevel === "中" ? 2 : 1;
  var e = emotion === "强烈" ? 3 : emotion === "中等" ? 2 : 1;
  var a = action === "高" ? 3 : action === "中" ? 2 : 1;
  var score = f * e * a;
  if (score >= 24) return "P0";
  if (score >= 12) return "P1";
  if (score >= 6) return "P2";
  return "P3";
}
function dmFreqLevel(n) {
  if (n >= 50) return "高";
  if (n >= 20) return "中";
  return "低";
}

// ---------- 主视图 ----------
function renderDemandMine() {
  var c = document.getElementById("app-content");
  if (!c) return;
  var a = dmGet();
  var html = "";

  // 配置卡片
  var type = window.__dmType || "physical";
  var timeRange = window.__dmTime || "近1个月";
  html += '<div class="dm-card">' +
    '<div class="dm-card-title">🔍 新建需求挖掘</div>' +
    '<div class="form-group"><div class="form-label">挖掘对象</div>' +
      '<input class="form-input" id="dm-target" placeholder="例如：便携美拍镜 / 磁吸支架 / 某 App 的会员体系" value="' + escapeHtml(window.__dmTarget || "") + '">' +
      '<div class="text-xs text-secondary" style="margin-top:4px">填具体产品、品类或功能领域</div></div>' +
    '<div class="form-row">' +
      '<div class="form-group"><div class="form-label">需求类型</div>' +
        '<select class="form-select" id="dm-type" onchange="window.__dmType=this.value;dmRefreshPlatforms()">' +
          '<option value="physical"' + (type === "physical" ? " selected" : "") + '>实物需求（商品/产品）</option>' +
          '<option value="virtual"' + (type === "virtual" ? " selected" : "") + '>无实物需求（服务/内容/功能）</option>' +
        '</select></div>' +
      '<div class="form-group"><div class="form-label">时间范围</div>' +
        '<select class="form-select" id="dm-time">' +
          ['近1个月', '近3个月', '近6个月', '近1年'].map(function (t) { return '<option value="' + t + '"' + (t === timeRange ? " selected" : "") + '>' + t + '</option>'; }).join("") +
        '</select></div>' +
    '</div>' +
    '<div class="form-group"><div class="form-label">竞品范围（可选）</div>' +
      '<input class="form-input" id="dm-comp" placeholder="填竞品名则用竞品视角分析，留空只分析本品" value="' + escapeHtml(window.__dmComp || "") + '"></div>' +
    '<div class="form-group"><div class="form-label">挖掘平台</div>' +
      '<div class="dm-platforms" id="dm-platforms">' + dmPlatformChips(type) + '</div>' +
      '<div class="text-xs text-secondary" style="margin-top:4px">已按需求类型智能预选，点击可增删</div></div>' +
    '<div class="form-group"><div class="form-label">模型</div>' +
      '<select class="form-select" id="dm-provider">' + dmProviderOptions() + '</select>' +
      '<div class="text-xs text-secondary" style="margin-top:4px">默认 Gemini（联网接地免费）；若没 Key 先在「设置」填（不找你要密码，你自己填）</div></div>' +
    '<div class="form-group"><label class="dm-check"><input type="checkbox" id="dm-ws"' + (dmWebSearchOn() ? " checked" : "") + ' onchange="dmToggleWs(this.checked)"> 🌐 联网检索（默认开，关闭则纯模型知识）</label></div>' +
    '<div class="btn-row">' +
      '<button class="btn btn-primary" onclick="dmRunMine()">🚀 AI 联网生成报告</button>' +
      '<button class="btn btn-secondary" onclick="dmShowImport()">📥 导入原始数据</button>' +
    '</div>' +
    '<div id="dm-run-status" class="dm-status hidden"></div>' +
    '</div>';

  // 报告列表
  html += '<div class="dm-card">' +
    '<div class="dm-card-title">📚 历史报告（' + a.length + '）</div>';
  if (!a.length) {
    html += '<div class="empty-state"><div class="empty-icon">📣</div><div class="empty-text">还没有需求挖掘报告<br>填上方表单，点「AI 联网生成」或「导入原始数据」</div></div>';
  } else {
    html += a.map(function (r) {
      return '<div class="dm-rep-card">' +
        '<div class="dm-rep-top"><span class="dm-rep-badge dm-' + (r.mode === "import" ? "import" : "ai") + '">' + (r.mode === "import" ? "📥 数据导入" : "🤖 AI联网") + '</span>' +
          '<span class="dm-rep-title">' + escapeHtml(r.target) + '</span>' +
          '<span class="dm-rep-date">' + escapeHtml((r.createdAt || "").slice(0, 10)) + '</span></div>' +
        '<div class="dm-rep-sub">' + escapeHtml(r.typeLabel) + ' · ' + escapeHtml(r.timeRange) + (r.platforms && r.platforms.length ? ' · ' + r.platforms.join('/') : '') + '</div>' +
        '<div class="dm-rep-metrics"><span>📊 样本 ' + escapeHtml(String(r.metrics && r.metrics.total != null ? r.metrics.total : "—")) + '</span><span>🔥 高频痛点 ' + escapeHtml(String(r.metrics && r.metrics.highFreq || 0)) + '</span><span>💡 机会 ' + escapeHtml(String(r.metrics && r.metrics.opportunities || 0)) + '</span></div>' +
        '<div class="dm-rep-actions">' +
          '<button class="ia-btn ia-btn-edit" onclick="dmView(\'' + r.id + '\')">👁 查看</button>' +
          '<button class="ia-btn ia-btn-note" onclick="dmToggleFav(\'' + r.id + '\')">' + (r.fav ? "⭐ 已收藏" : "☆ 收藏") + '</button>' +
          '<button class="ia-btn ia-btn-delete" onclick="dmDeleteReport(\'' + r.id + '\')">🗑 删除</button>' +
        '</div>' +
        '</div>';
    }).join("");
  }
  html += '</div>';

  c.innerHTML = html;
}

function dmPlatformChips(type) {
  var ps = dmCurrentPlatforms(type);
  var all = ["小红书", "抖音", "淘宝", "京东", "微博", "视频号"];
  return all.map(function (p) {
    var on = ps.indexOf(p) >= 0;
    return '<span class="dm-pchip' + (on ? " on" : "") + '" onclick="dmTogglePlatform(\'' + p + '\')">' + p + '</span>';
  }).join("");
}
function dmCurrentPlatforms(type) {
  if (!window.__dmPlat) window.__dmPlat = {};
  if (!window.__dmPlat[type]) window.__dmPlat[type] = dmDefaultPlatforms(type);
  return window.__dmPlat[type];
}
function dmTogglePlatform(p) {
  var type = document.getElementById("dm-type") ? document.getElementById("dm-type").value : (window.__dmType || "physical");
  var ps = dmCurrentPlatforms(type);
  var i = ps.indexOf(p);
  if (i >= 0) ps.splice(i, 1); else ps.push(p);
  var el = document.getElementById("dm-platforms");
  if (el) el.innerHTML = dmPlatformChips(type);
}
function dmRefreshPlatforms() {
  var type = document.getElementById("dm-type") ? document.getElementById("dm-type").value : "physical";
  window.__dmType = type;
  var el = document.getElementById("dm-platforms");
  if (el) el.innerHTML = dmPlatformChips(type);
}
function dmProviderOptions() {
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
function dmWebSearchOn() {
  var cfg = (typeof loadAiConfig === "function") ? loadAiConfig() : {};
  return cfg.webSearch !== false;
}
function dmToggleWs(on) {
  var cfg = (typeof loadAiConfig === "function") ? loadAiConfig() : {};
  cfg.webSearch = !!on;
  if (typeof saveAiConfig === "function") saveAiConfig(cfg);
}

// ---------- 导入数据弹窗 ----------
function dmShowImport() {
  var html = '<div class="modal-title">📥 导入原始数据（评论/笔记）</div>' +
    '<div class="form-group"><div class="form-label">每行一条用户原声（支持批量粘贴，越多越准）</div>' +
      '<textarea class="form-textarea" id="dm-raw" rows="10" placeholder="例如：\n这个支架高度不够，站起来拍不了\n希望能加个补光灯\n太贵了，性价比低\n抖音上好多人在吐槽发热严重..."></textarea></div>' +
    '<div class="form-group"><div class="form-label">挖掘对象（用于报告标题）</div>' +
      '<input class="form-input" id="dm-raw-target" placeholder="例如：桌面美拍站"></div>' +
    '<div class="text-xs text-secondary" style="margin-bottom:8px">导入路径会做关键词分类 + 情绪 + 频次 + 优先级统计，适合已有真实抓取数据（2000+ 条更佳）。</div>' +
    '<div class="btn-row"><button class="btn btn-secondary" onclick="closeModal()">取消</button>' +
      '<button class="btn btn-primary" onclick="dmRunImport()">开始分析</button></div>';
  if (typeof showModal === "function") showModal(html);
}

// ---------- AI 生成 ----------
async function dmRunMine() {
  var target = (document.getElementById("dm-target") ? document.getElementById("dm-target").value : (window.__dmTarget || "")).trim();
  if (!target) { if (typeof showToast === "function") showToast("请先填写挖掘对象"); return; }
  window.__dmTarget = target;
  var type = document.getElementById("dm-type") ? document.getElementById("dm-type").value : "physical";
  var timeRange = document.getElementById("dm-time") ? document.getElementById("dm-time").value : "近1个月";
  var comp = (document.getElementById("dm-comp") ? document.getElementById("dm-comp").value : "").trim();
  var platforms = dmCurrentPlatforms(type).slice();
  var provider = document.getElementById("dm-provider") ? document.getElementById("dm-provider").value : "gemini";

  var cfg = (typeof loadAiConfig === "function") ? loadAiConfig() : {};
  var apiKey = cfg.apiKey || "";
  if (!apiKey) {
    if (typeof showModal === "function") {
      showModal('<div class="modal-title">⚠️ 还没填大模型 Key</div><div class="form-group">需求挖掘的「AI 联网生成」需要大模型 Key（默认 Gemini，联网接地免费，不找你要密码）。<br>请到 <b>设置 → 模型配置</b> 里填：</div><div class="text-xs text-secondary">• Gemini：开 VPN 后 AI Studio 免费 Key 可直连<br>• 智谱 GLM-4-Flash / 硅基流动：国内可直连免费<br>填好回来再点「🚀 AI 联网生成报告」。</div><div class="btn-row"><button class="btn btn-primary" onclick="closeModal();navigate(\'settings\')">去设置填 Key</button></div>');
    }
    return;
  }

  var statusEl = document.getElementById("dm-run-status");
  if (statusEl) { statusEl.className = "dm-status"; statusEl.innerHTML = "⏳ 正在联网检索 " + escapeHtml(target) + " 的公开用户讨论，请稍候…"; }
  if (typeof showToast === "function") showToast("开始联网挖掘，请稍候", "success");

  var prompt = dmBuildPrompt(target, type, timeRange, comp, platforms);
  try {
    if (typeof callLLMForPrompt !== "function") throw new Error("大模型调用层未就绪");
    var r = await callLLMForPrompt(provider, apiKey, prompt);
    var parsed = (typeof parseIntelLLM === "function") ? parseIntelLLM(r.text) : JSON.parse(r.text);
    var rec = dmNormalize(parsed, {
      mode: "ai", target: target, type: type,
      typeLabel: type === "physical" ? "实物需求" : "无实物需求",
      timeRange: timeRange, platforms: platforms,
      provider: provider, comp: comp, text: r.text, sources: r.sources || []
    });
    dmSaveReport(rec);
    renderDemandMine();
    dmView(rec.id);
  } catch (e) {
    if (statusEl) { statusEl.className = "dm-status err"; statusEl.innerHTML = "❌ 生成失败：" + escapeHtml(e && e.message ? e.message : String(e)); }
    if (typeof showToast === "function") showToast("生成失败：" + (e && e.message ? e.message : e), "error");
  }
}

function dmBuildPrompt(target, type, timeRange, comp, platforms) {
  var typeLabel = type === "physical" ? "实物需求（具体商品/产品）" : "无实物需求（服务/内容/功能）";
  var compLine = comp ? ("同时以竞品视角分析【" + comp + "】的用户反馈与本品差距。") : "只分析本品用户反馈。";
  return "你是中国公域新媒体（" + platforms.join("、") + "）用户需求挖掘分析师。\n" +
    "任务：针对【" + target + "】（" + typeLabel + "），基于联网检索到的真实公开用户讨论/评价/笔记，挖掘用户真实需求与产品机会。" + compLine + "时间范围：" + timeRange + "。\n\n" +
    "要求：\n" +
    "1. 尽量引用真实可见的用户原声（注明平台与典型表述），并给出可点击的来源网页链接（sources 字段）。\n" +
    "2. 按以下分类体系归类：功能缺失 / 体验问题 / 性能问题 / " + (type === "physical" ? "定价问题" : "内容问题") + " / 竞品对比。\n" +
    "3. 评估维度：频次(高/中/低)、情绪强度(强烈/中等/轻微)、可操作性(高/中/低)。\n" +
    "4. 优先级由 频次×情绪×可操作性 决定：P0(紧急重要)/P1(重要不紧急)/P2(紧急不重要)/P3(不紧急不重要)。\n" +
    "5. 基于检索到的公开讨论，估算一个 approximate public mention volume（estimatedVolume，整数）作为样本体量参考。\n\n" +
    "请严格输出如下 JSON（不要任何额外文字，不要 markdown 代码块包裹）：\n" +
    "{\n" +
    '  "summary": "执行摘要 3-5 句话",\n' +
    '  "estimatedVolume": 1200,\n' +
    '  "highFreqCount": 4,\n' +
    '  "opportunityCount": 5,\n' +
    '  "strongNegPct": 35,\n' +
    '  "painPoints": [ {"rank":1,"pain":"痛点简述","category":"功能缺失","freq":"高","emotion":"强烈","voice":"用户原声"} ],\n' +
    '  "matrix": [ {"opp":"机会点","need":"需求本质","gap":"现有方案不足","direction":"建议方向","priority":"P0"} ],\n' +
    '  "details": [ {"category":"功能缺失","items":[ {"name":"功能需求名","freq":"高","emotion":"强烈","action":"高","voice":"用户原声 — 平台 | 时间","analysis":"需求分析","suggestions":["短期建议","长期建议"]} ]} ],\n' +
    '  "actions": { "quick":["立即可做"], "mid":["中期"], "research":["需进一步调研"] },\n' +
    '  "sources": [ {"platform":"小红书","keywords":"关键词","count":200,"links":["https://..."]} ]\n' +
    "}";
}

// ---------- 导入分析 ----------
function dmRunImport() {
  var raw = document.getElementById("dm-raw") ? document.getElementById("dm-raw").value : "";
  var target = (document.getElementById("dm-raw-target") ? document.getElementById("dm-raw-target").value : "").trim() || (window.__dmTarget || "未命名对象");
  if (!raw || !raw.trim()) { if (typeof showToast === "function") showToast("请先粘贴原始数据"); return; }
  var lines = raw.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(function (s) { return s.length >= 2; });
  if (!lines.length) { if (typeof showToast === "function") showToast("没有有效的数据行"); return; }

  // 分类聚合
  var byCat = {};
  var catStats = {}; // cat -> {count, strong, mid, light, actionHigh}
  lines.forEach(function (ln) {
    var cat = dmClassify(ln);
    var emo = dmSentiment(ln);
    var act = dmActionability(ln);
    if (!byCat[cat]) byCat[cat] = { lines: [], strong: 0, mid: 0, light: 0, actHigh: 0, actMid: 0, actLow: 0 };
    byCat[cat].lines.push(ln);
    if (emo === "强烈") byCat[cat].strong++; else if (emo === "中等") byCat[cat].mid++; else byCat[cat].light++;
    if (act === "高") byCat[cat].actHigh++; else if (act === "中") byCat[cat].actMid++; else byCat[cat].actLow++;
  });

  var total = lines.length;
  var strongCount = lines.filter(function (l) { return dmSentiment(l) === "强烈"; }).length;
  var strongNegPct = Math.round(strongCount / total * 100);

  // 各分类选代表（情绪最强/出现靠前的若干条）
  var details = Object.keys(byCat).map(function (cat) {
    var grp = byCat[cat];
    var sorted = grp.lines.slice().sort(function (a, b) {
      var ra = DM_EMO_STRONG.indexOf(a) >= 0 ? 3 : DM_EMO_MID.indexOf(a) >= 0 ? 2 : 1;
      var rb = DM_EMO_STRONG.indexOf(b) >= 0 ? 3 : DM_EMO_MID.indexOf(b) >= 0 ? 2 : 1;
      return rb - ra;
    });
    var voice = sorted.slice(0, 3).map(function (s) { return "“" + s + "”"; }).join("；");
    var freq = dmFreqLevel(grp.lines.length);
    var emo = grp.strong > grp.mid ? "强烈" : (grp.mid > 0 ? "中等" : "轻微");
    var act = grp.actHigh >= grp.actMid ? "高" : (grp.actMid > 0 ? "中" : "低");
    var priority = dmPriority(freq, emo, act);
    return {
      category: cat,
      items: [{
        name: cat + "（" + grp.lines.length + " 条）",
        freq: freq, emotion: emo, action: act,
        voice: voice,
        analysis: "用户集中反馈：" + voice,
        suggestions: ["短期：针对「" + cat + "」高频反馈快速迭代", "长期：建立该维度的常态化监测"],
        priority: priority
      }]
    };
  });

  // Top5 痛点（按分类数量排序）
  var topCats = Object.keys(byCat).sort(function (a, b) { return byCat[b].lines.length - byCat[a].lines.length; }).slice(0, 5);
  var painPoints = topCats.map(function (cat, i) {
    var grp = byCat[cat];
    var freq = dmFreqLevel(grp.lines.length);
    var emo = grp.strong > grp.mid ? "强烈" : (grp.mid > 0 ? "中等" : "轻微");
    return { rank: i + 1, pain: cat + "：" + grp.lines[0].slice(0, 30), category: cat, freq: freq, emotion: emo, voice: "“" + grp.lines[0] + "”" };
  });

  // 机会矩阵（每个分类给一个机会点）
  var matrix = details.map(function (d) {
    var it = d.items[0];
    return { opp: d.category + "优化机会", need: "用户在「" + d.category + "」上的真实诉求", gap: "现有方案未充分满足", direction: it.suggestions[0] || "针对性迭代", priority: it.priority };
  });

  var platforms = dmCurrentPlatforms(window.__dmType || "physical");
  var rec = {
    id: (typeof uid === "function" ? uid() : "dm" + Math.random().toString(36).slice(2, 9)),
    mode: "import",
    target: target,
    type: window.__dmType || "physical",
    typeLabel: (window.__dmType || "physical") === "physical" ? "实物需求" : "无实物需求",
    timeRange: window.__dmTime || "近1个月",
    platforms: platforms,
    comp: window.__dmComp || "",
    createdAt: new Date().toISOString(),
    provider: "数据导入",
    metrics: { total: total, highFreq: topCats.length, opportunities: matrix.length, strongNegPct: strongNegPct },
    summary: "基于导入的 " + total + " 条真实用户原声，识别 " + details.length + " 类需求主题，强烈不满占比 " + strongNegPct + "%。高频集中在：" + topCats.join("、") + "。",
    painPoints: painPoints,
    matrix: matrix,
    details: details,
    actions: { quick: ["优先处理频次最高的「" + (topCats[0] || "") + "」"], mid: ["建立分类监测看板"], research: ["补充各平台量化占比"] },
    sources: platforms.map(function (p) { return { platform: p, keywords: target, count: Math.round(total / platforms.length), links: [] }; })
  };
  dmSaveReport(rec);
  if (typeof closeModal === "function") closeModal();
  renderDemandMine();
  dmView(rec.id);
  if (typeof showToast === "function") showToast("已分析 " + total + " 条数据", "success");
}

// ---------- 归一化 ----------
function dmNormalize(parsed, opts) {
  parsed = parsed || {};
  opts = opts || {};
  var arr = function (x) { return Array.isArray(x) ? x : []; };
  var str = function (x, d) { return x == null ? (d || "") : String(x); };
  var details = arr(parsed.details).map(function (d) {
    return {
      category: str(d.category),
      items: arr(d.items).map(function (it) {
        return {
          name: str(it.name), freq: str(it.freq), emotion: str(it.emotion), action: str(it.action),
          voice: str(it.voice), analysis: str(it.analysis),
          suggestions: arr(it.suggestions).map(function (s) { return str(s); }).filter(Boolean),
          priority: str(it.priority)
        };
      })
    };
  });
  var sources = arr(parsed.sources).filter(function (s) { return s && (s.platform || s.url); }).map(function (s) {
    return { platform: str(s.platform), keywords: str(s.keywords), count: Number(s.count) || 0, links: arr(s.links).map(String) };
  });
  (opts.sources || []).forEach(function (s) {
    if (s && s.url && !sources.some(function (x) { return x.links && x.links.indexOf(s.url) >= 0; })) {
      sources.push({ platform: str(s.title || "联网检索"), keywords: "", count: 0, links: [s.url] });
    }
  });
  return {
    id: (typeof uid === "function" ? uid() : "dm" + Math.random().toString(36).slice(2, 9)),
    mode: opts.mode || "ai",
    target: str(opts.target),
    type: opts.type || "physical",
    typeLabel: opts.typeLabel || "",
    timeRange: opts.timeRange || "",
    platforms: opts.platforms || [],
    comp: opts.comp || "",
    createdAt: new Date().toISOString(),
    provider: opts.provider || "",
    metrics: {
      total: Number(parsed.estimatedVolume) || (opts.sources && opts.sources.length) || 0,
      highFreq: Number(parsed.highFreqCount) || 0,
      opportunities: Number(parsed.opportunityCount) || 0,
      strongNegPct: Number(parsed.strongNegPct) || 0
    },
    summary: str(parsed.summary),
    painPoints: arr(parsed.painPoints).map(function (p) {
      return { rank: Number(p.rank) || 0, pain: str(p.pain), category: str(p.category), freq: str(p.freq), emotion: str(p.emotion), voice: str(p.voice) };
    }),
    matrix: arr(parsed.matrix).map(function (m) {
      return { opp: str(m.opp), need: str(m.need), gap: str(m.gap), direction: str(m.direction), priority: str(m.priority) };
    }),
    details: details,
    actions: {
      quick: arr(parsed.actions && parsed.actions.quick).map(String),
      mid: arr(parsed.actions && parsed.actions.mid).map(String),
      research: arr(parsed.actions && parsed.actions.research).map(String)
    },
    sources: sources
  };
}

// ---------- 报告渲染 ----------
function dmRenderReport(rec) {
  if (!rec) return "<p>无报告</p>";
  var pBadge = { P0: "badge-red", P1: "badge-orange", P2: "badge-blue", P3: "badge-gray" };
  var html = "";
  html += '<div class="dm-rep-head">' +
    '<span class="dm-rep-badge dm-' + (rec.mode === "import" ? "import" : "ai") + '">' + (rec.mode === "import" ? "📥 数据导入" : "🤖 AI联网聚合") + '</span> ' +
    '<b>' + escapeHtml(rec.target) + '</b> · ' + escapeHtml(rec.typeLabel) + ' · ' + escapeHtml(rec.timeRange) +
    (rec.platforms && rec.platforms.length ? ' · ' + rec.platforms.join('/') : '') + '</div>';

  if (rec.mode === "ai") {
    html += '<div class="dm-note">ℹ️ 本报告由 AI 联网检索公开舆论聚合生成（非 2000+ 条原生评论级抓取）。如需评论级严谨数据，请走「📥 导入原始数据」。</div>';
  } else {
    html += '<div class="dm-note ok">✅ 基于 ' + escapeHtml(String(rec.metrics.total)) + ' 条真实导入数据，前端分类统计生成。</div>';
  }

  html += '<div class="dm-summary">' + escapeHtml(rec.summary) + '</div>';

  // 关键数字
  html += '<div class="dm-metrics">' +
    dmMetric("📊 分析样本", rec.metrics.total != null ? rec.metrics.total : "—") +
    dmMetric("🔥 高频痛点数", rec.metrics.highFreq || 0) +
    dmMetric("💡 产品机会", rec.metrics.opportunities || 0) +
    dmMetric("😠 强烈不满占比", (rec.metrics.strongNegPct || 0) + "%") +
    '</div>';

  // Top5 痛点
  if (rec.painPoints && rec.painPoints.length) {
    html += '<h4 class="dm-h">一、Top ' + rec.painPoints.length + ' 用户痛点</h4>';
    html += '<table class="dm-table"><thead><tr><th>排名</th><th>痛点</th><th>分类</th><th>频次</th><th>情绪</th><th>典型声音</th></tr></thead><tbody>' +
      rec.painPoints.map(function (p) {
        return '<tr><td>' + p.rank + '</td><td>' + escapeHtml(p.pain) + '</td><td>' + escapeHtml(p.category) + '</td><td>' + escapeHtml(p.freq) + '</td><td>' + escapeHtml(p.emotion) + '</td><td class="dm-voice">' + escapeHtml(p.voice) + '</td></tr>';
      }).join("") + '</tbody></table>';
  }

  // 机会矩阵
  if (rec.matrix && rec.matrix.length) {
    html += '<h4 class="dm-h">二、产品机会矩阵</h4>';
    html += '<table class="dm-table"><thead><tr><th>机会点</th><th>需求本质</th><th>现有方案不足</th><th>建议方向</th><th>优先级</th></tr></thead><tbody>' +
      rec.matrix.map(function (m) {
        return '<tr><td>' + escapeHtml(m.opp) + '</td><td>' + escapeHtml(m.need) + '</td><td>' + escapeHtml(m.gap) + '</td><td>' + escapeHtml(m.direction) + '</td><td><span class="badge ' + (pBadge[m.priority] || "badge-gray") + '">' + escapeHtml(m.priority) + '</span></td></tr>';
      }).join("") + '</tbody></table>';
  }

  // 详细分析
  if (rec.details && rec.details.length) {
    html += '<h4 class="dm-h">三、详细分析</h4>';
    html += rec.details.map(function (d) {
      return d.items.map(function (it) {
        return '<div class="dm-detail">' +
          '<div class="dm-detail-title"><b>' + escapeHtml(it.name || d.category) + '</b>' +
          ' <span class="badge badge-gray">' + escapeHtml(d.category) + '</span>' +
          ' <span class="badge badge-blue">频次 ' + escapeHtml(it.freq) + '</span>' +
          ' <span class="badge badge-orange">情绪 ' + escapeHtml(it.emotion) + '</span>' +
          ' <span class="badge ' + (pBadge[it.priority] || "badge-gray") + '">' + escapeHtml(it.priority) + '</span></div>' +
          (it.voice ? '<div class="dm-detail-voice">用户原声：' + escapeHtml(it.voice) + '</div>' : '') +
          (it.analysis ? '<div class="dm-detail-an">需求分析：' + escapeHtml(it.analysis) + '</div>' : '') +
          (it.suggestions && it.suggestions.length ? '<div class="dm-detail-sg">建议：' + it.suggestions.map(function (s) { return '• ' + escapeHtml(s); }).join('<br>') + '</div>' : '') +
          '</div>';
      }).join("");
    }).join("");
  }

  // 行动建议
  if (rec.actions) {
    html += '<h4 class="dm-h">四、行动建议</h4>';
    html += '<div class="dm-actions">' +
      (rec.actions.quick && rec.actions.quick.length ? '<div class="dm-act"><div class="dm-act-h ok">✅ 立即可做（Quick Wins）</div>' + rec.actions.quick.map(function (s) { return '<div>• ' + escapeHtml(s) + '</div>'; }).join("") + '</div>' : '') +
      (rec.actions.mid && rec.actions.mid.length ? '<div class="dm-act"><div class="dm-act-h">🗓 中期规划（1-3 个月）</div>' + rec.actions.mid.map(function (s) { return '<div>• ' + escapeHtml(s) + '</div>'; }).join("") + '</div>' : '') +
      (rec.actions.research && rec.actions.research.length ? '<div class="dm-act"><div class="dm-act-h">🔍 需进一步调研</div>' + rec.actions.research.map(function (s) { return '<div>• ' + escapeHtml(s) + '</div>'; }).join("") + '</div>' : '') +
      '</div>';
  }

  // 数据来源
  if (rec.sources && rec.sources.length) {
    html += '<h4 class="dm-h">五、数据来源明细</h4>';
    html += '<table class="dm-table"><thead><tr><th>平台</th><th>关键词</th><th>有效反馈</th><th>链接</th></tr></thead><tbody>' +
      rec.sources.map(function (s) {
        var links = (s.links && s.links.length) ? s.links.map(function (l) { return '<a href="' + escapeHtml(l) + '" target="_blank" rel="noopener">↗</a>'; }).join(" ") : "—";
        return '<tr><td>' + escapeHtml(s.platform) + '</td><td>' + escapeHtml(s.keywords) + '</td><td>' + (s.count || "—") + '</td><td>' + links + '</td></tr>';
      }).join("") + '</tbody></table>';
  }
  return html;
}
function dmMetric(label, val) {
  return '<div class="dm-metric"><div class="dm-metric-v">' + escapeHtml(String(val)) + '</div><div class="dm-metric-l">' + escapeHtml(label) + '</div></div>';
}

function dmView(id) {
  var a = dmGet();
  var rec = null;
  for (var i = 0; i < a.length; i++) { if (a[i].id === id) { rec = a[i]; break; } }
  if (!rec) { if (typeof showToast === "function") showToast("未找到该报告"); return; }
  var html = '<div class="modal-title">📣 ' + escapeHtml(rec.target) + ' · 需求挖掘报告</div>' +
    '<div class="dm-report-scroll">' + dmRenderReport(rec) + '</div>';
  if (typeof showModal === "function") showModal(html);
}

// ---------- 我的产出 hub 渲染 ----------
function demandReportHtmlForHub(rec) {
  return '<div class="dm-report-scroll">' + (typeof dmRenderReport === "function" ? dmRenderReport(rec) : "<p>无法渲染</p>") + '</div>';
}
