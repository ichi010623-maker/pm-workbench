// ============================================================
// 竞品研判 · Amazon 竞品调研（基于 ARI 开放 API）
// ------------------------------------------------------------
// 重要架构说明：
//   ARI 接口 (https://ari.funewa.com) 未开放浏览器跨域(CORS)，
//   纯静态 PWA 无法从浏览器直连调用。因此本模块采用「双通道」：
//   1) 尽力直连（仅免费 GET 类，CORS 放行时才可用）；
//   2) 主通道：生成精确的本地 `ari.py` 命令 + 「粘贴结果」导入框，
//      用户在本机(已装 Python + ARI Key)跑完，把 JSON 回传，
//      模块负责渲染并落库到「我的产出」。
//   计费纪律（遵循 Amazon产品研究员 skill）：
//   · 付费项（采集/AI 分析 VOC·洞察·竞品对比）一律先出报价，
//     确认后才追加 --confirm；绝不替用户默认确认。
//   · Key 仅存本机 localStorage，不写入报告，也不出现在命令示例里。
// ============================================================

var ARI_BASE = "https://ari.funewa.com";
var ARI_CFG_KEY = "hw_pm_ari_config";

var ARI_SITES = [
  { id: "amz_us", name: "美国 US" },
  { id: "amz_uk", name: "英国 UK" },
  { id: "amz_de", name: "德国 DE" },
  { id: "amz_jp", name: "日本 JP" },
  { id: "amz_ca", name: "加拿大 CA" },
  { id: "amz_fr", name: "法国 FR" },
  { id: "amz_es", name: "西班牙 ES" },
  { id: "amz_it", name: "意大利 IT" }
];

// 能力类型 → 标签 + 是否付费(SSE 直连不可用) + 本地命令模板
var ARI_CAPS = {
  check:    { label: "账户/积点", paid: false, cli: function (a, s, e) { return "python ari.py check"; } },
  products: { label: "产品状态", paid: false, cli: function (a, s, e) { return "python ari.py products"; } },
  reviews:  { label: "评论样本", paid: false, cli: function (a, s, e) { return "python ari.py reviews --asin " + a + " --site " + s + " --pages 3 --sort recent"; } },
  charts:   { label: "星级/趋势图", paid: false, cli: function (a, s, e) { return "python ari.py charts --asin " + a + " --site " + s; } },
  deepdive: { label: "深度洞察", paid: false, cli: function (a, s, e) { return "python ari.py deepdive --asin " + a + " --site " + s; } },
  voc:      { label: "VOC 报告", paid: true, cli: function (a, s, e) { return "python ari.py analyze --type voc --asin " + a + " --site " + s; } },
  insight:  { label: "消费者洞察", paid: true, cli: function (a, s, e) { return "python ari.py analyze --type insight --asin " + a + " --site " + s; } },
  compare:  { label: "竞品对比", paid: true, cli: function (a, s, e) { return "python ari.py analyze --type compare --asin " + a + " --competitor " + (e && e.competitor ? e.competitor : "<竞品ASIN>") + " --site " + s; } }
};

// ---------- 本地转义（避免依赖顺序问题） ----------
function ariEsc(s) {
  if (typeof escapeHtml === "function") return escapeHtml(s);
  return (s == null ? "" : String(s)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ---------- 配置（仅本机） ----------
function loadAriConfig() { try { return JSON.parse(localStorage.getItem(ARI_CFG_KEY) || "{}"); } catch (e) { return {}; } }
function saveAriConfig(o) { try { localStorage.setItem(ARI_CFG_KEY, JSON.stringify(o)); } catch (e) {} }
function ariKey() { return (loadAriConfig().key || "").trim(); }

function ariSaveKey() {
  var el = document.getElementById("ari-key");
  if (!el) return;
  var k = el.value.trim();
  var cfg = loadAriConfig();
  cfg.key = k;
  saveAriConfig(cfg);
  var st = document.getElementById("ari-keystat");
  if (st) st.innerHTML = k ? "✅ 已保存（本机）" : "未设置";
  if (typeof showToast === "function") showToast(k ? "ARI Key 已保存到本机" : "已清除 Key", "success");
}

// ---------- 直连请求（尽力而为，CORS 会拦截） ----------
async function ariRequest(method, path, opts) {
  opts = opts || {};
  var key = opts.key || ariKey();
  if (!key) { var ne = new Error("缺少 ARI API Key（请先在上方保存）"); ne.code = "NO_KEY"; throw ne; }
  var url = ARI_BASE + "/api/v1" + path;
  if (opts.params) {
    var qs = Object.keys(opts.params).filter(function (k) { return opts.params[k] != null && opts.params[k] !== ""; })
      .map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(opts.params[k]); }).join("&");
    if (qs) url += "?" + qs;
  }
  var headers = { "Authorization": "Bearer " + key, "Accept": "application/json", "Content-Type": "application/json" };
  var body = opts.body ? JSON.stringify(opts.body) : undefined;
  var res;
  try {
    res = await fetch(url, { method: method, headers: headers, body: body });
  } catch (e) {
    var ce = new Error("网络/CORS 拦截：" + (e && e.message ? e.message : e));
    ce.cors = true; throw ce;
  }
  var json;
  try { json = await res.json(); } catch (e) { json = { success: false, code: "BAD_JSON", message: "响应非 JSON (HTTP " + res.status + ")" }; }
  if (!res.ok) {
    var msg = (json && json.message) || ("HTTP " + res.status);
    var ee = new Error(msg); ee.code = (json && json.code) || ("HTTP_" + res.status); ee.http = res.status; throw ee;
  }
  return json; // 信封 {success,code,message,data,...}
}

// ---------- 选择能力 ----------
function ariSetCap(el) {
  var chips = document.querySelectorAll("#ari-caps .chip");
  for (var i = 0; i < chips.length; i++) chips[i].classList.remove("active");
  el.classList.add("active");
  window.__ariCap = el.getAttribute("data-cap");
  var comp = document.getElementById("ari-compwrap");
  if (comp) comp.style.display = (window.__ariCap === "compare") ? "block" : "none";
}

// ---------- 控制台渲染 ----------
function renderAriConsole(c) {
  if (!window.__ariCap) window.__ariCap = "deepdive";
  var cfg = loadAriConfig();
  var keySet = !!cfg.key;
  var note = "⚠️ ARI 接口未开放浏览器跨域(CORS)，本工作台为纯静态站点、无后端代理，" +
    "因此「运行调研」会先尝试直连；若被拦截（属正常），请改用下方生成的本地命令，" +
    "在已装 Python + ARI Key 的终端执行，再把 JSON 粘贴到「回传结果」即可渲染并落库。";

  var html = "";
  html += '<div class="ari-intro"><div class="ari-intro-title">🛒 Amazon 竞品调研（ARI）</div>' +
    '<div class="ari-intro-text">' + note + '</div>' +
    '<div class="ari-links">申请 Key：<a href="https://ari.funewa.com/zh/account?ui=d47626f#api-keys" target="_blank" rel="noopener">ari.funewa.com</a> · ' +
    '报告中心：<a href="https://ari.funewa.com/zh/reports" target="_blank" rel="noopener">reports</a> · ' +
    '产品管理：<a href="https://ari.funewa.com/zh/products" target="_blank" rel="noopener">products</a></div></div>';

  html += '<div class="ari-keyrow">' +
    '<input id="ari-key" class="form-input" type="password" placeholder="粘贴 ARI API Key（ari_live_...）" value="' + ariEsc(cfg.key || "") + '">' +
    '<button class="btn btn-primary" onclick="ariSaveKey()">保存 Key</button>' +
    '<span id="ari-keystat" class="ari-keystat">' + (keySet ? "✅ 已保存（本机）" : "未设置") + "</span></div>";

  html += '<div class="ari-inputs">' +
    '<div class="form-group"><div class="form-label">ASIN</div><input id="ari-asin" class="form-input" placeholder="如 B0C1234567"></div>' +
    '<div class="form-group"><div class="form-label">站点</div><select id="ari-site" class="form-select">' +
    ARI_SITES.map(function (s) { return '<option value="' + s.id + '">' + s.name + "</option>"; }).join("") + "</select></div>" +
    "</div>";

  html += '<div class="filter-bar" id="ari-caps">' +
    Object.keys(ARI_CAPS).map(function (k) {
      return '<div class="chip' + (window.__ariCap === k ? " active" : "") + '" data-cap="' + k + '" onclick="ariSetCap(this)">' +
        (ARI_CAPS[k].paid ? "💰 " : "") + ARI_CAPS[k].label + "</div>";
    }).join("") + "</div>";

  html += '<div class="form-group" id="ari-compwrap" style="display:none"><div class="form-label">竞品 ASIN（对比用）</div>' +
    '<input id="ari-comp" class="form-input" placeholder="竞品 ASIN"></div>';

  html += '<div class="btn-row">' +
    '<button class="btn btn-primary" onclick="ariGo()">🚀 运行调研</button>' +
    '<button class="btn btn-secondary" onclick="ariShowCmdOnly()">📋 仅生成命令</button></div>';

  html += '<div id="ari-fallback" style="display:none"></div>';

  html += '<div class="ari-import"><div class="form-label">📥 回传结果（本地运行命令后粘贴 JSON）</div>' +
    '<textarea id="ari-import" class="form-textarea" placeholder="在此粘贴 ari.py 输出的 JSON（--compact 单行或格式化均可）；支持 reviews / charts / deepdive / analyze 各类回传"></textarea>' +
    '<button class="btn btn-secondary" onclick="ariImport()">导入并渲染</button></div>';

  html += '<div id="ari-result"></div>';
  c.innerHTML = html;
}

// 仅生成命令（不触发请求）
function ariShowCmdOnly() {
  var asin = (document.getElementById("ari-asin").value || "").trim();
  var site = document.getElementById("ari-site").value;
  var comp = (document.getElementById("ari-comp") || {}).value || "";
  var cap = window.__ariCap || "deepdive";
  if (cap !== "check" && cap !== "products" && !asin) { if (typeof showToast === "function") showToast("请输入 ASIN", "error"); return; }
  if (cap === "compare" && !comp) { if (typeof showToast === "function") showToast("竞品对比需填写竞品 ASIN", "error"); return; }
  var cmd = ARI_CAPS[cap].cli(asin, site, { competitor: comp });
  var fb = document.getElementById("ari-fallback");
  fb.style.display = "block";
  fb.innerHTML = ariCmdBox(cmd, cap);
}

function ariCmdBox(cmd, cap) {
  var paid = ARI_CAPS[cap] && ARI_CAPS[cap].paid;
  var note = paid
    ? "⚠️ 该项为付费 AI 分析（SSE 流式，浏览器无法直连）。请先本地运行上方命令出报价，确认积点充足后再追加 <code>--confirm</code> 执行；勿让本工具代你确认扣点。"
    : "该项为免费查询，本地直接运行即可（无需 --confirm）。运行后把 JSON 粘贴到「回传结果」。";
  return '<div class="ari-cmdbox"><div class="ari-cmd-title">📋 本地运行命令（在已装 Python + ARI Key 的终端执行）</div>' +
    '<pre class="ari-pre">' + ariEsc(cmd) + "</pre>" +
    '<div class="ari-cmd-note">' + note + "</div></div>";
}

// ---------- 运行（直连尽力 + 命令兜底） ----------
async function ariGo() {
  var asin = (document.getElementById("ari-asin").value || "").trim();
  var site = document.getElementById("ari-site").value;
  var comp = (document.getElementById("ari-comp") || {}).value || "";
  var cap = window.__ariCap || "deepdive";
  if (cap !== "check" && cap !== "products" && !asin) { if (typeof showToast === "function") showToast("请输入 ASIN", "error"); return; }
  if (cap === "compare" && !comp) { if (typeof showToast === "function") showToast("竞品对比需填写竞品 ASIN", "error"); return; }

  var fb = document.getElementById("ari-fallback");
  fb.style.display = "block";
  var cmd = ARI_CAPS[cap].cli(asin, site, { competitor: comp });
  fb.innerHTML = ariCmdBox(cmd, cap);

  // 免费 GET 类尝试直连
  var freeMap = { check: 1, products: 1, reviews: 1, charts: 1, deepdive: 1 };
  if (freeMap[cap]) {
    try {
      var data;
      if (cap === "check") data = (await ariRequest("GET", "/user/me")).data;
      else if (cap === "products") data = (await ariRequest("GET", "/asins")).data;
      else if (cap === "reviews") data = (await ariRequest("GET", "/reviews", { params: { asin: asin, site: site, pages: 3 } })).data;
      else if (cap === "charts") data = await ariCollectCharts(asin, site);
      else if (cap === "deepdive") data = await ariCollectDeepdive(asin, site);
      // 直连成功：封装成信封样式再渲染
      var env = { success: true, code: "OK", data: data, __type: cap, __asin: asin, __site: site };
      var rec = ariBuildRecord(env, { type: cap, asin: asin, site: site });
      ariSaveReport(rec);
      var box = document.getElementById("ari-result");
      if (box) box.innerHTML = '<div class="ari-ok">✅ 浏览器直连成功（CORS 未拦截），已渲染并落库。</div>' + ariReportHtmlForHub(rec);
      if (typeof showToast === "function") showToast("直连成功", "success");
      return;
    } catch (e) {
      var msg = (e && e.message) ? e.message : String(e);
      fb.innerHTML += '<div class="ari-corsnote">⚠️ 浏览器直连失败（' + ariEsc(msg.slice(0, 180)) +
        '）。请改用上方本地命令 + 下方「回传结果」。(若提示 CORS / 网络拦截属正常——ARI 未开放跨域)</div>';
    }
  } else {
    fb.innerHTML += '<div class="ari-corsnote">⚠️ 该项为付费 AI 分析（SSE 流式），浏览器无法直连。请本地运行上方命令出报价，确认后加 <code>--confirm</code>，再把 JSON 粘贴到「回传结果」。</div>';
  }
}

async function ariCollectCharts(asin, site) {
  var out = { charts: {} };
  var names = ["stars", "trend", "keywords", "flow"];
  for (var i = 0; i < names.length; i++) {
    try {
      var r = await ariRequest("GET", "/charts/" + names[i], { params: { asin: asin, site: site } });
      out.charts[names[i]] = r.data;
    } catch (e) { out.charts[names[i]] = { error: (e && e.message) || String(e) }; }
  }
  return out;
}

async function ariCollectDeepdive(asin, site) {
  var out = { product: null, charts: {}, reviews: null, reports: null };
  try { var p = await ariRequest("GET", "/asins"); out.product = (p.data && p.data.asins && p.data.asins[0]) || null; } catch (e) {}
  try { var rv = await ariRequest("GET", "/reviews", { params: { asin: asin, site: site, pages: 3 } }); out.reviews = rv.data; } catch (e) {}
  var names = ["stars", "trend", "keywords", "flow"];
  for (var i = 0; i < names.length; i++) {
    try { var r = await ariRequest("GET", "/charts/" + names[i], { params: { asin: asin, site: site } }); out.charts[names[i]] = r.data; } catch (e) {}
  }
  try { var rp = await ariRequest("GET", "/reports", { params: { asin: asin, limit: 5 } }); out.reports = rp.data; } catch (e) {}
  return out;
}

// ---------- 导入解析 ----------
function ariImport() {
  var ta = document.getElementById("ari-import");
  if (!ta) return;
  var text = (ta.value || "").trim();
  if (!text) { if (typeof showToast === "function") showToast("请先粘贴 JSON", "error"); return; }
  var obj;
  try { obj = JSON.parse(text); } catch (e) { if (typeof showToast === "function") showToast("JSON 解析失败：" + e.message, "error"); return; }

  // 采集/分析失败语义：若 success=false 且 failedParts，只取成功部分并提示
  var warn = "";
  if (obj && obj.success === false) {
    if (obj.failedParts && obj.failedParts.length) {
      warn = "⚠️ 该回传含部分失败（" + obj.failedParts.map(function (f) { return f.part + "/" + f.code; }).join("、") + "），仅展示成功部分。";
    } else if (obj.message) {
      if (typeof showToast === "function") showToast("接口返回失败：" + obj.message, "error");
      var box0 = document.getElementById("ari-result");
      if (box0) box0.innerHTML = '<div class="ari-corsnote">接口返回失败：' + ariEsc(obj.message || "") + "</div>";
      return;
    }
  }

  var rec = ariBuildRecord(obj, { type: (obj && obj.__type) || "import", asin: (obj && obj.__asin) || "", site: (obj && obj.__site) || "" });
  ariSaveReport(rec);
  var box = document.getElementById("ari-result");
  if (box) {
    var w = warn ? '<div class="ari-corsnote">' + warn + "</div>" : "";
    box.innerHTML = '<div class="ari-ok">✅ 已导入并落库到「我的产出」（竞品 · Amazon）</div>' + w + ariReportHtmlForHub(rec);
  }
  if (typeof showToast === "function") showToast("导入成功", "success");
}

// ---------- 归一化（兼容信封 / 聚合 / 扁平多种形态） ----------
function ariPick(obj, key) {
  if (!obj) return undefined;
  if (obj.data && obj.data[key] != null) return obj.data[key];
  if (obj[key] != null) return obj[key];
  return undefined;
}
function ariNormalize(obj) {
  var d = (obj && obj.data) ? obj.data : obj;
  var n = {
    type: obj && obj.__type ? obj.__type : "import",
    asin: (obj && obj.__asin) || "",
    site: (obj && obj.__site) || "",
    product: null, reviews: null, charts: null, content: "", result: null,
    reportId: "", reportUrl: "", creditsUsed: null, balance: null, reports: null, sampleNote: ""
  };
  var prod = ariPick(obj, "product") || (ariPick(obj, "products") && ariPick(obj, "products")[0]) || null;
  n.product = prod;
  var rv = ariPick(obj, "reviews");
  n.reviews = rv ? (rv.reviews || rv) : null;
  var ch = {};
  ["stars", "trend", "keywords", "flow"].forEach(function (k) { var v = ariPick(obj, k); if (v != null) ch[k] = v; });
  if (d && d.charts) { ["stars", "trend", "keywords", "flow"].forEach(function (k) { if (d.charts[k] != null) ch[k] = d.charts[k]; }); }
  if (Object.keys(ch).length) n.charts = ch;
  var c = ariPick(obj, "content"); if (c != null) n.content = (typeof c === "string") ? c : JSON.stringify(c);
  var r = ariPick(obj, "result"); if (r != null) n.result = r;
  n.reportId = ariPick(obj, "reportId") || "";
  n.reportUrl = ariPick(obj, "reportUrl") || "";
  if (ariPick(obj, "creditsUsed") != null) n.creditsUsed = ariPick(obj, "creditsUsed");
  if (ariPick(obj, "balance") != null) n.balance = ariPick(obj, "balance");
  n.reports = ariPick(obj, "reports") || null;
  if (d && d._window) n.sampleNote = (d._window.days ? "统计窗口：" + d._window.days + " 天" : "全部历史") + (d._window.note ? "（" + d._window.note + "）" : "");
  return n;
}

// ---------- 建记录 ----------
function ensureAri() { if (!DB.data.amazonReports) DB.data.amazonReports = []; }
function ariCapLabel(t) { return (ARI_CAPS[t] && ARI_CAPS[t].label) || t || "调研"; }

function ariBuildRecord(obj, meta) {
  meta = meta || {};
  var norm = ariNormalize(obj);
  var type = meta.type || norm.type || "import";
  var asin = meta.asin || norm.asin || "";
  var site = meta.site || norm.site || "amz_us";
  var alias = (norm.product && (norm.product.alias || norm.product.asin)) || asin || "未知 ASIN";
  var title = alias + " · " + ariCapLabel(type);
  var summary = "";
  if (norm.content) summary = norm.content.replace(/\s+/g, " ").slice(0, 80);
  else if (norm.reviews && norm.reviews.length) summary = "评论样本 " + norm.reviews.length + " 条";
  else if (norm.charts && norm.charts.stars) summary = "均星 " + (norm.charts.avgStar || "-") + " · " + (norm.charts.total || 0) + " 评";
  else if (norm.product) summary = "评论数 " + (norm.product.reviewCount || "-") + " · 变体 " + (norm.product.variantCount || "-");
  return {
    id: "ar_" + uid(),
    type: type, asin: asin, site: site,
    title: title, summary: summary,
    createdAt: (typeof today === "function" ? today() : new Date().toISOString().slice(0, 10)),
    fav: false,
    provider: "Amazon ARI",
    raw: obj
  };
}

function ariSaveReport(rec) {
  ensureAri();
  DB.data.amazonReports.unshift(rec);
  if (DB.data.amazonReports.length > 50) DB.data.amazonReports.length = 50;
  try { DB.save(); } catch (e) {}
}

// ---------- 报告渲染（供导入查看 + 我的产出复用） ----------
function ariMd(s) {
  if (!s) return "";
  return ariEsc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
}

function ariReportHtmlForHub(rec) {
  return ariRenderReport(rec);
}

function ariRenderReport(rec) {
  var norm = ariNormalize(rec.raw || {});
  var html = "";
  html += '<div class="ari-report">';
  html += '<div class="ari-r-head"><span class="aio-badge aio-amazon">🛒 Amazon</span> ' +
    '<span class="ari-r-title">' + ariEsc(rec.title || "Amazon 调研") + "</span></div>";
  html += '<div class="ari-r-meta">ASIN：' + ariEsc(rec.asin || "-") + " · 站点：" + ariEsc(rec.site || "-") +
    " · 类型：" + ariEsc(ariCapLabel(rec.type)) + " · " + ariEsc((rec.createdAt || "").slice(0, 10)) + "</div>";

  // 数据概览（产品）
  if (norm.product) {
    var p = norm.product;
    html += '<div class="ari-sec"><div class="ari-sec-t">📊 数据概览</div><div class="ari-kv">' +
      (p.alias ? kv("别名", p.alias) : "") +
      (p.asin ? kv("ASIN", p.asin) : "") +
      (p.reviewCount != null ? kv("评论数", p.reviewCount) : "") +
      (p.variantCount != null ? kv("变体数", p.variantCount) : "") +
      (p.collectionStatus ? kv("采集状态", p.collectionStatus) : "") +
      (p.lastCollectedAt ? kv("最近采集", String(p.lastCollectedAt).slice(0, 10)) : "") +
      "</div></div>";
  }

  // 图表
  if (norm.charts) {
    var ch = norm.charts;
    html += '<div class="ari-sec"><div class="ari-sec-t">📈 评分图表</div>';
    if (ch.stars && ch.stars.stars) {
      var stars = ch.stars.stars; var total = ch.stars.total || 0;
      html += '<div class="ari-stars">';
      [5, 4, 3, 2, 1].forEach(function (st) {
        var cnt = stars["star" + st] != null ? stars["star" + st] : (stars[st] != null ? stars[st] : 0);
        var pct = total ? Math.round(cnt / total * 100) : 0;
        html += '<div class="ari-star-row"><span class="ari-star-l">' + st + "★</span>" +
          '<span class="ari-bar"><span class="ari-bar-f" style="width:' + pct + '%"></span></span>' +
          '<span class="ari-star-r">' + cnt + " (" + pct + "%)</span></div>";
      });
      html += "</div>";
      if (ch.stars.avgStar != null) html += '<div class="ari-avg">平均星级：<strong>' + ch.stars.avgStar + "</strong> / 5（共 " + total + " 条）</div>";
    }
    if (ch.trend) html += '<div class="ari-sub">趋势：' + ariEsc(typeof ch.trend === "string" ? ch.trend : JSON.stringify(ch.trend).slice(0, 200)) + "</div>";
    if (ch.keywords && ch.keywords.length) {
      html += '<div class="ari-sub">高频词：' + ch.keywords.slice(0, 20).map(function (k) {
        var w = (typeof k === "string") ? k : (k.word || k.keyword || JSON.stringify(k));
        return '<span class="ari-kw">' + ariEsc(w) + "</span>";
      }).join("") + "</div>";
    }
    if (ch.flow) html += '<div class="ari-sub">场景/问题流向：' + ariEsc(typeof ch.flow === "string" ? ch.flow : JSON.stringify(ch.flow).slice(0, 200)) + "</div>";
    html += "</div>";
  }

  // 评论样本
  if (norm.reviews && norm.reviews.length) {
    var list = norm.reviews.slice(0, 12);
    html += '<div class="ari-sec"><div class="ari-sec-t">💬 评论样本（' + norm.reviews.length + " 条，展示前 " + list.length + "）</div>";
    list.forEach(function (r) {
      var star = r.star || r.rating || 0;
      html += '<div class="ari-review"><div class="ari-rv-top"><span class="ari-rv-star">' + "★".repeat(Math.round(star)) + '<span class="ari-rv-dim">' + "★".repeat(5 - Math.round(star)) + "</span></span>" +
        (r.verifiedPurchase ? '<span class="ari-rv-vp">✓ 已验证购买</span>' : "") +
        (r.helpfulCount != null ? '<span class="ari-rv-hp">👍 ' + r.helpfulCount + "</span>" : "") +
        (r.date ? '<span class="ari-rv-date">' + ariEsc(String(r.date).slice(0, 10)) + "</span>" : "") + "</div>" +
        (r.title ? '<div class="ari-rv-title">' + ariEsc(r.title) + "</div>" : "") +
        (r.body || r.content ? '<div class="ari-rv-body">' + ariEsc((r.body || r.content || "").slice(0, 220)) + "</div>" : "") + "</div>";
    });
    html += "</div>";
  }

  // 内容（VOC / 洞察 / 对比 主输出）
  if (norm.content) {
    html += '<div class="ari-sec"><div class="ari-sec-t">📝 分析结论</div><div class="ari-content">' + ariMd(norm.content) + "</div></div>";
  } else if (norm.result && typeof norm.result === "object") {
    html += '<div class="ari-sec"><div class="ari-sec-t">📝 结构化洞察</div><pre class="ari-pre">' + ariEsc(JSON.stringify(norm.result, null, 2)) + "</pre></div>";
  }

  // 报告链接
  if (norm.reportUrl) {
    html += '<div class="ari-sec"><a class="ari-report-link" href="' + ariEsc(norm.reportUrl) + '" target="_blank" rel="noopener">🔗 在线查看图表版完整报告 / 导出 ↗</a></div>';
  }

  // 数据来源与积点
  var srcBits = [];
  if (norm.creditsUsed != null) srcBits.push("本次积点：" + norm.creditsUsed);
  if (norm.balance != null) srcBits.push("当前余额：" + norm.balance);
  if (norm.reportId) srcBits.push("reportId：" + norm.reportId);
  if (norm.sampleNote) srcBits.push(norm.sampleNote);
  if (srcBits.length) html += '<div class="ari-src">📌 ' + srcBits.join(" · ") + "</div>";

  // 原始 JSON（兜底，不丢失任何字段）
  html += '<details class="ari-raw"><summary>查看原始 JSON</summary><pre class="ari-pre">' + ariEsc(JSON.stringify(rec.raw, null, 2)) + "</pre></details>";

  html += "</div>";
  return html;
}

function kv(k, v) { return '<div class="ari-kv-item"><span class="ari-kv-k">' + ariEsc(k) + '</span><span class="ari-kv-v">' + ariEsc(v) + "</span></div>"; }
