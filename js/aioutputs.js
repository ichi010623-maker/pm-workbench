// ============================================================
// 「我的产出」统一聚合中心
// 聚合所有使用模型（或数据检索）的产出结果，支持：
//   · 留存记录（持久化在各模块自身的 store 中，本中心只做统一展示与管理）
//   · ⭐ 收藏（fav 标记，存于源记录）
//   · 👁 查看（复用各模块渲染器还原完整报告）
//   · 🗑 删除（级联删除源 store 中的记录）
// 源模块：intel(自定义情报) / opportunity(市场机会) / mr(市场调研) / xhs(小红书爆款) / amazon(Amazon竞品)
// ============================================================

var AI_OUTPUT_MODULES = [
  { source: "intel", label: "自定义情报", store: function () { return DB.data.industryCustom || []; } },
  { source: "opportunity", label: "市场机会", store: function () { return DB.data.marketOpp || []; } },
  { source: "mr", label: "市场调研", store: function () { return (DB.data.growth && DB.data.growth.mr && DB.data.growth.mr.reports) || []; } },
  { source: "xhs", label: "小红书爆款", store: function () { return (DB.data.growth && DB.data.growth.xhs && DB.data.growth.xhs.reports) || []; } },
  { source: "amazon", label: "Amazon竞品", store: function () { return DB.data.amazonReports || []; } },
  { source: "demand", label: "需求挖掘", store: function () { return DB.data.demandReports || []; } },
  { source: "investnews", label: "财经新闻", store: function () { return (DB.data.growth && DB.data.growth.invest && DB.data.growth.invest.dailyNews) || []; } },
  { source: "truenorth", label: "TrueNorth", store: function () { return DB.data.truenorthReports || []; } }
];

var AI_OUTPUT_FILTER = "all"; // all | fav | intel | opportunity | mr | xhs | amazon

function aiOutputClip(s, n) {
  s = (s == null ? "" : String(s)).trim();
  if (s.length <= n) return s;
  return s.slice(0, n) + "…";
}

// ---------- 各源记录的标题 / 摘要 / 模型 归一化 ----------
function aiOutputTitle(source, rec) {
  if (source === "intel") return rec.title || "自定义情报";
  if (source === "opportunity") return (rec.market || "市场") + " 市场机会";
  if (source === "mr") return ((rec.meta && rec.meta.market) || "市场调研") + " 市场调研";
  if (source === "xhs") return (rec.kw || "全站热门") + " 小红书检索";
  if (source === "amazon") return rec.title || ((rec.asin || "未知") + " Amazon 调研");
  if (source === "demand") return rec.target || "需求挖掘报告";
  if (source === "investnews") return (rec.date || "每日") + " 财经新闻摘要";
  if (source === "truenorth") return "🧭 TrueNorth：" + (rec.product || "产品方向校准");
  return "产出记录";
}
function aiOutputSummary(source, rec) {
  if (source === "intel") return aiOutputClip(rec.summary, 80);
  if (source === "opportunity") return aiOutputClip(rec.summary, 80);
  if (source === "mr") return aiOutputClip((rec.parsed && rec.parsed.summary) || "", 80);
  if (source === "xhs") {
    var n = (rec.payload && rec.payload.articles) ? rec.payload.articles.length : 0;
    return "共 " + n + " 条笔记 · " + (rec.rangeLabel || "");
  }
  if (source === "amazon") return aiOutputClip(rec.summary, 80);
  if (source === "demand") return aiOutputClip(rec.summary, 80);
  if (source === "investnews") return aiOutputClip(rec.summary, 80);
  if (source === "truenorth") return aiOutputClip(rec.summary, 80);
  return "";
}
function aiOutputModel(source, rec) {
  if (source === "intel") return rec.provider || "大模型";
  if (source === "opportunity") return rec.provider || "大模型";
  if (source === "mr") return (rec.meta && rec.meta.provider) || "大模型";
  if (source === "xhs") return rec.model || "数据检索";
  if (source === "amazon") return "Amazon ARI";
  if (source === "demand") return (rec.mode === "import" ? "数据导入" : (rec.provider || "AI联网"));
  if (source === "investnews") return rec.provider || "AI联网";
  if (source === "truenorth") return rec.provider || "AI联网";
  return "";
}

// ---------- 列表 ----------
function aiOutputList() {
  var out = [];
  AI_OUTPUT_MODULES.forEach(function (m) {
    (m.store() || []).forEach(function (rec) {
      if (!rec || !rec.id) return;
      out.push({
        source: m.source,
        label: m.label,
        id: rec.id,
        title: aiOutputTitle(m.source, rec),
        summary: aiOutputSummary(m.source, rec),
        model: aiOutputModel(m.source, rec),
        createdAt: rec.createdAt || rec.date || "",
        fav: !!rec.fav
      });
    });
  });
  out.sort(function (a, b) { return String(b.createdAt || "").localeCompare(String(a.createdAt || "")); });
  return out;
}

function aiOutputStore(source) {
  for (var i = 0; i < AI_OUTPUT_MODULES.length; i++) {
    if (AI_OUTPUT_MODULES[i].source === source) return AI_OUTPUT_MODULES[i].store();
  }
  return null;
}

function aiOutputFind(source, id) {
  var store = aiOutputStore(source);
  if (!store) return null;
  for (var i = 0; i < store.length; i++) { if (store[i].id === id) return store[i]; }
  return null;
}

function setAioFilter(f) { AI_OUTPUT_FILTER = f; renderAiOutputs(); }

// ---------- 收藏 / 删除 ----------
function aiToggleFav(source, id) {
  var rec = aiOutputFind(source, id);
  if (!rec) return;
  rec.fav = !rec.fav;
  try { DB.save(); } catch (e) {}
  renderAiOutputs();
  if (typeof showToast === "function") showToast(rec.fav ? "已收藏 ⭐" : "已取消收藏", "success");
}

function aiDeleteOutput(source, id) {
  if (typeof confirm === "function" && !confirm("确定删除这条产出记录？删除后不可恢复。")) return;
  var store = aiOutputStore(source);
  if (store) {
    for (var i = 0; i < store.length; i++) {
      if (store[i].id === id) { store.splice(i, 1); break; }
    }
  }
  try { DB.save(); } catch (e) {}
  renderAiOutputs();
  if (typeof showToast === "function") showToast("已删除", "success");
}

// ---------- 查看（复用各模块渲染器）----------
function aiOutputViewHtml(source, rec) {
  try {
    if (source === "intel") {
      var html = "";
      if (rec.summary) html += '<div class="aio-view-summary">' + escapeHtml(rec.summary) + "</div>";
      if (rec.items && rec.items.length) {
        html += rec.items.map(function (it) {
          return '<div class="aio-view-item">' +
            '<div class="aio-view-it">' + escapeHtml(it.title || "") + "</div>" +
            (it.point ? '<div class="aio-view-ip">' + escapeHtml(it.point) + "</div>" : "") +
            (it.source ? '<div class="aio-view-is">来源：' + escapeHtml(it.source) + "</div>" : "") +
            (it.url ? '<div class="aio-view-link"><a href="' + escapeHtml(it.url) + '" target="_blank" rel="noopener">🔗 链接 ↗</a></div>' : "") +
            (it.tags && it.tags.length ? '<div class="aio-view-tags">' + it.tags.map(escapeHtml).join(" · ") + "</div>" : "") +
            "</div>";
        }).join("");
      }
      if (rec.sources && rec.sources.length) {
        html += '<div class="aio-view-src">参考来源：' + rec.sources.map(function (s) {
          return s.url ? '<a href="' + escapeHtml(s.url) + '" target="_blank" rel="noopener">' + escapeHtml(s.title || s.url) + " ↗</a>" : escapeHtml(s.title || "");
        }).join(" · ") + "</div>";
      }
      return html;
    }
    if (source === "opportunity") {
      return (typeof mktReportCard === "function") ? mktReportCard(rec) : "<p>无法渲染报告</p>";
    }
    if (source === "mr") {
      var last = { parsed: rec.parsed, meta: rec.meta, sources: rec.sources };
      return (typeof mrReportBodyHtml === "function") ? mrReportBodyHtml(last) : "<p>无法渲染报告</p>";
    }
    if (source === "xhs") {
      return (typeof xhsReportHtmlForHub === "function") ? xhsReportHtmlForHub(rec) : "<p>无法渲染报告</p>";
    }
    if (source === "amazon") {
      return (typeof ariReportHtmlForHub === "function") ? ariReportHtmlForHub(rec) : "<p>无法渲染报告</p>";
    }
    if (source === "demand") {
      return (typeof demandReportHtmlForHub === "function") ? demandReportHtmlForHub(rec) : "<p>无法渲染报告</p>";
    }
    if (source === "investnews") {
      return (typeof invNewsReportHtmlForHub === "function") ? invNewsReportHtmlForHub(rec) : "<p>无法渲染报告</p>";
    }
    if (source === "truenorth") {
      return (typeof truenorthReportHtmlForHub === "function") ? truenorthReportHtmlForHub(rec) : "<p>无法渲染报告</p>";
    }
  } catch (e) {
    return "<p style='color:#c0392b'>渲染失败：" + escapeHtml(e && e.message ? e.message : String(e)) + "</p>";
  }
  return "<p>未知类型</p>";
}

function aiOutputView(source, id) {
  var rec = aiOutputFind(source, id);
  if (!rec) { if (typeof showToast === "function") showToast("未找到该记录"); return; }
  var html = '<div class="aio-view-scroll">' + aiOutputViewHtml(source, rec) + "</div>";
  if (typeof showModal === "function") {
    showModal('<div class="modal-title">🤖 ' + escapeHtml(aiOutputTitle(source, rec)) + "</div>" + html);
  } else {
    var w = window.open("", "_blank");
    if (w) { w.document.open(); w.document.write("<!DOCTYPE html><html><head><meta charset='utf-8'></head><body>" + html + "</body></html>"); w.document.close(); }
  }
}

// ---------- 渲染中心（写入 #aio-body，保留行业情报 tabBar）----------
function aioChip(id, label) {
  return '<div class="chip' + (AI_OUTPUT_FILTER === id ? " active" : "") + '" onclick="setAioFilter(\'' + id + '\')">' + label + "</div>";
}

function renderAiOutputs() {
  var b = document.getElementById("aio-body");
  if (!b) return;
  var list = aiOutputList();
  var filtered = list.filter(function (it) {
    if (AI_OUTPUT_FILTER === "fav") return it.fav;
    if (AI_OUTPUT_FILTER === "all") return true;
    return it.source === AI_OUTPUT_FILTER;
  });

  var chips = '<div class="filter-bar" style="margin-bottom:10px">' +
    aioChip("all", "全部 " + list.length) +
    aioChip("fav", "⭐ 收藏 " + list.filter(function (x) { return x.fav; }).length) +
    aioChip("intel", "🤖 自定义情报") +
    aioChip("opportunity", "📈 市场机会") +
    aioChip("mr", "📊 市场调研") +
    aioChip("xhs", "📕 小红书") +
    aioChip("amazon", "🛒 Amazon竞品") +
    aioChip("demand", "📣 需求挖掘") +
    aioChip("investnews", "📰 财经新闻") +
    aioChip("truenorth", "🧭 TrueNorth") +
    "</div>";

  var body;
  if (!filtered.length) {
    body = '<div class="empty-state"><div class="empty-icon">🤖</div><div class="empty-text">' +
      (AI_OUTPUT_FILTER === "fav"
        ? "还没有收藏的产出<br>在任意产出上点 ⭐ 即可收藏"
        : "还没有模型产出记录<br>去「🤖 自定义情报 / 📈 市场机会 / 📊 市场调研 / 📕 小红书」生成一份吧") +
      "</div></div>";
  } else {
    body = '<div class="aio-list">' + filtered.map(function (it) {
      return '<div class="aio-card">' +
        '<div class="aio-card-top">' +
          '<span class="aio-badge aio-' + it.source + '">' + it.label + "</span>" +
          (it.model ? '<span class="aio-model">' + escapeHtml(it.model) + "</span>" : "") +
          '<span class="aio-date">' + escapeHtml((it.createdAt || "").slice(0, 10)) + "</span>" +
        "</div>" +
        '<div class="aio-title">' + escapeHtml(it.title) + "</div>" +
        (it.summary ? '<div class="aio-summary">' + escapeHtml(it.summary) + "</div>" : "") +
        '<div class="aio-actions">' +
          '<button class="aio-btn' + (it.fav ? " on" : "") + '" onclick="aiToggleFav(\'' + it.source + "','" + it.id + '\')">' + (it.fav ? "★ 已收藏" : "☆ 收藏") + "</button>" +
          '<button class="aio-btn" onclick="aiOutputView(\'' + it.source + "','" + it.id + '\')">👁 查看</button>' +
          '<button class="aio-btn aio-del" onclick="aiDeleteOutput(\'' + it.source + "','" + it.id + '\')">🗑 删除</button>' +
        "</div>" +
      "</div>";
    }).join("") + "</div>";
  }
  b.innerHTML = chips + body;
}
