// ===== 小红书收藏知识库（个人收藏 · 分类汇总 · 关键词检索）=====
// 数据存在本机 localStorage（hw_pm_xhs_fav），纯前端、可离线、随工作台同步。
// AI 自动归类复用 INTEL_PROVIDERS.gemini（读 hw_pm_ai_config 的 key），无 key 时退化为关键词标签。

var XF_LS = "hw_pm_xhs_fav";
var XF_DEFAULT_CATS = ["穿搭", "美妆护肤", "家居收纳", "数码科技", "好物分享", "美食", "旅行", "母婴亲子", "职场成长", "灵感创意", "健身运动", "其他"];

// 视图与检索状态
var xfView = "list";     // list | group
var xfQ = "";
var xfCat = "all";
var xfCollapsed = {};    // 分类汇总视图下的折叠状态
var xfAddTab = "single"; // single | batch | import
var xfBatchPreview = []; // 批量粘贴解析预览
var xfDetailId = null;

function xfLoad() {
  try {
    var d = JSON.parse(localStorage.getItem(XF_LS) || "{}");
    if (!Array.isArray(d.items)) d.items = [];
    if (!Array.isArray(d.categories) || !d.categories.length) d.categories = XF_DEFAULT_CATS.slice();
    if (!d.settings) d.settings = {};
    return d;
  } catch (e) {
    return { items: [], categories: XF_DEFAULT_CATS.slice(), settings: {} };
  }
}
function xfSave(d) { localStorage.setItem(XF_LS, JSON.stringify(d)); }
function xfUid() { return "xf" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function xfCount() { return xfLoad().items.length; }
window.xfCount = xfCount;

// 高亮命中关键词
function xfHighlight(text, q) {
  text = escapeHtml(text || "");
  q = (q || "").trim();
  if (!q) return text;
  try {
    var re = new RegExp("(" + q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi");
    return text.replace(re, "<mark>$1</mark>");
  } catch (e) { return text; }
}

// ---- 小红书分享文本解析（一次贴一堆）----
function xfParseBatch(text) {
  if (!text || !text.trim()) return [];
  var blocks = text.split(/\n\s*\n/).map(function (b) { return b.trim(); }).filter(Boolean);
  if (blocks.length <= 1) {
    var parts = text.split(/(?=https?:\/\/(?:xhslink\.com|xiaohongshu\.com)[^\s]*)/i);
    blocks = parts.map(function (b) { return b.trim(); }).filter(Boolean);
  }
  if (!blocks.length) blocks = [text.trim()];
  return blocks.map(function (b) {
    var urlMatch = b.match(/https?:\/\/[^\s]+/);
    var url = urlMatch ? urlMatch[0] : "";
    var body = b.replace(/https?:\/\/[^\s]+/g, "").trim();
    var lines = body.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    var title = lines.length ? lines[0] : "未命名收藏";
    title = title.replace(/\s*[-–]\s*小红书(App)?.*$/i, "").trim() || "未命名收藏";
    var content = lines.slice(1).join("\n").trim();
    content = content.replace(/点击链接打开小红书App.*$/i, "").replace(/编辑于.*$/i, "").replace(/展开\s*$/i, "").trim();
    return {
      id: xfUid(), title: title, content: content, url: url,
      category: "其他", tags: [], summary: "", aiCategory: "",
      source: "xhs", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
  });
}

// ---- 关键词标签退化方案（无 AI key 时用）----
var XF_LEXICON = {
  "穿搭": ["穿搭", "OOTD", "搭配", "衣服", "显瘦", "风格", "衣柜"],
  "美妆护肤": ["化妆", "口红", "护肤", "面膜", "精华", "底妆", "美妆", "香水"],
  "家居收纳": ["收纳", "家居", "家具", "租房", "布置", "改造", "整理"],
  "数码科技": ["数码", "手机", "电脑", "耳机", "平板", "键盘", "充电", "相机"],
  "好物分享": ["好物", "神器", "平价", "种草", "宝藏", "刚需", "清单"],
  "美食": ["美食", "食谱", "做饭", "减脂餐", "甜品", "探店", "早餐"],
  "旅行": ["旅行", "旅游", "攻略", "机票", "酒店", "出境", "citywalk"],
  "母婴亲子": ["母婴", "宝宝", "育儿", "辅食", "孕", "亲子"],
  "职场成长": ["职场", "副业", "简历", "面试", "效率", "复盘", "成长"],
  "灵感创意": ["灵感", "创意", "设计", "文案", "选题", "策划", "审美"],
  "健身运动": ["健身", "减脂", "运动", "训练", "跑步", "瑜伽", "体态"]
};
function xfHeuristic(it) {
  var hay = ((it.title || "") + " " + (it.content || "")).toLowerCase();
  var best = "其他", bestN = 0;
  Object.keys(XF_LEXICON).forEach(function (cat) {
    var n = 0;
    XF_LEXICON[cat].forEach(function (k) { if (hay.indexOf(k.toLowerCase()) >= 0) n++; });
    if (n > bestN) { bestN = n; best = cat; }
  });
  var tags = [];
  var words = (it.title || "").split(/[\s,，、]+/).filter(function (w) { return w.length >= 2 && w.length <= 6; });
  for (var i = 0; i < Math.min(words.length, 3); i++) tags.push(words[i]);
  it.category = best;
  it.tags = tags;
  it.summary = (it.content || it.title || "").slice(0, 30);
  it.aiCategory = "";
  it.updatedAt = new Date().toISOString();
}

// ---- AI 自动归类（复用 INTEL_PROVIDERS.gemini）----
async function xfAiCall(prompt) {
  var cfg = null;
  try { cfg = JSON.parse(localStorage.getItem("hw_pm_ai_config") || "{}"); } catch (e) {}
  var key = (cfg && cfg.key) || "";
  if (!key) throw new Error("NO_KEY");
  if (typeof INTEL_PROVIDERS === "undefined" || !INTEL_PROVIDERS.gemini) throw new Error("NO_PROVIDER");
  var p = INTEL_PROVIDERS.gemini;
  var models = p.models || [p.models && p.models[0]];
  var lastErr = null;
  for (var mi = 0; mi < models.length; mi++) {
    try {
      var url = p.buildUrl(key, mi);
      var body = { contents: [{ parts: [{ text: prompt }] }] };
      var res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { lastErr = new Error("HTTP " + res.status); continue; }
      var j = await res.json();
      var txt = (p.parse(j) || {}).text || "";
      return txt;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("AI_CALL_FAILED");
}

function xfBuildPrompt(cats, slice) {
  var catLine = (cats && cats.length ? cats : XF_DEFAULT_CATS).join(",");
  var notes = slice.map(function (it, i) {
    return (i + 1) + ". 标题：" + (it.title || "") + "\n正文：" + ((it.content || "").slice(0, 200)) + "\n";
  }).join("\n");
  return "你是一个小红书收藏整理助手。下面是一批用户收藏的笔记（每条有编号、标题、正文）。请为每条：\n" +
    "1) 判断最合适的分类（优先从给定分类候选中选；若都不合适，可新建一个简洁中文分类，不超过6个字）；\n" +
    "2) 写一句中文摘要（≤30字，概括核心价值）；\n" +
    "3) 提取2-4个中文关键词。\n" +
    "只返回 JSON 数组，不要任何解释文字，格式：\n" +
    '[{"id":1,"category":"...","summary":"...","tags":["...","..."]}]\n\n' +
    "分类候选：" + catLine + "\n\n笔记：\n" + notes;
}
function xfExtractJsonArray(txt) {
  if (!txt) return null;
  txt = txt.trim();
  var m = txt.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (m) txt = m[1];
  var s = txt.indexOf("[");
  var e = txt.lastIndexOf("]");
  if (s < 0 || e < 0) return null;
  try { return JSON.parse(txt.slice(s, e + 1)); } catch (err) { return null; }
}
function xfApplyAi(d, slice, arr) {
  if (!Array.isArray(arr)) return;
  arr.forEach(function (r) {
    if (!r || typeof r.id !== "number") return;
    var it = slice[r.id - 1];
    if (!it) return;
    if (r.category) {
      if (d.categories.indexOf(r.category) < 0) d.categories.push(r.category);
      it.category = r.category;
      it.aiCategory = r.category;
    }
    if (r.summary) it.summary = r.summary;
    if (Array.isArray(r.tags) && r.tags.length) it.tags = r.tags.slice(0, 6);
    it.updatedAt = new Date().toISOString();
  });
}
function xfAiOrganize() {
  var d = xfLoad();
  var pending = d.items.filter(function (it) { return !it.aiCategory && (!it.category || it.category === "其他"); });
  if (!pending.length) pending = d.items.slice();
  if (!pending.length) { showToast("没有需要整理的收藏"); return; }
  var hasKey = false;
  try { var cfg = JSON.parse(localStorage.getItem("hw_pm_ai_config") || "{}"); hasKey = !!cfg.key; } catch (e) {}
  if (!hasKey) {
    pending.forEach(function (it) { xfHeuristic(it); });
    xfSave(d);
    showToast("未配置 AI Key，已用关键词自动标签", "warn");
    renderXhsFav();
    return;
  }
  showToast("AI 整理中…");
  // 分批（每批 8 条），逐批同步调用避免并发
  var BATCH = 8;
  (function run(i) {
    if (i >= pending.length) {
      xfSave(d);
      showToast("AI 整理完成 ✅");
      renderXhsFav();
      return;
    }
    var slice = pending.slice(i, i + BATCH);
    var prompt = xfBuildPrompt(d.categories, slice);
    xfAiCall(prompt).then(function (txt) {
      var arr = xfExtractJsonArray(txt);
      if (arr) xfApplyAi(d, slice, arr);
      run(i + BATCH);
    }).catch(function () {
      // 单批失败退化为关键词标签，继续下一批
      slice.forEach(function (it) { xfHeuristic(it); });
      run(i + BATCH);
    });
  })(0);
}

// ---- 主渲染 ----
function renderXhsFav() {
  var d = xfLoad();
  var c = document.getElementById("app-content");
  if (!c) return;

  var items = d.items;
  var filtered = items.filter(function (it) {
    if (xfCat !== "all" && it.category !== xfCat) return false;
    if (xfQ) {
      var hay = (it.title + " " + (it.content || "") + " " + (it.tags || []).join(" ") + " " + (it.category || "") + " " + (it.summary || "")).toLowerCase();
      if (hay.indexOf(xfQ.toLowerCase()) < 0) return false;
    }
    return true;
  });

  // 分类统计
  var catCount = {};
  items.forEach(function (it) { catCount[it.category] = (catCount[it.category] || 0) + 1; });
  var catsSorted = d.categories.slice().sort(function (a, b) { return (catCount[b] || 0) - (catCount[a] || 0); });

  var catChips = '<span class="chip' + (xfCat === "all" ? " active" : "") + '" onclick="xfSetCat(\'all\')">全部 ' + items.length + '</span>' +
    catsSorted.map(function (cat) {
      return '<span class="chip' + (xfCat === cat ? " active" : "") + '" onclick="xfSetCat(\'' + escapeHtml(cat) + '\')">' + escapeHtml(cat) + " " + (catCount[cat] || 0) + "</span>";
    }).join("");

  var bodyHtml;
  if (!filtered.length) {
    bodyHtml = '<div class="empty-state"><div class="empty-icon">📌</div><div class="empty-text">' +
      (items.length ? "没有匹配的收藏，换个关键词或分类试试" : "还没有收藏<br>点右上角「+ 添加」粘贴你的小红书收藏") + "</div></div>";
  } else if (xfView === "group") {
    bodyHtml = catsSorted.filter(function (cat) { return filtered.some(function (it) { return it.category === cat; }); }).map(function (cat) {
      var list = filtered.filter(function (it) { return it.category === cat; });
      var collapsed = xfCollapsed[cat] ? " hidden" : "";
      return '<div class="xhsfav-group">' +
        '<div class="xhsfav-group-h" onclick="xfToggleGroup(\'' + escapeHtml(cat) + '\')">📂 ' + escapeHtml(cat) + ' <span class="xhsfav-group-n">' + list.length + '</span><span class="xhsfav-arrow" id="xfa-' + escapeHtml(cat) + '">' + (xfCollapsed[cat] ? "▸" : "▾") + "</span></div>" +
        '<div class="xhsfav-group-items' + collapsed + '" id="xfg-' + escapeHtml(cat) + '">' + list.map(xfItemHtml).join("") + "</div></div>";
    }).join("");
  } else {
    bodyHtml = filtered.map(xfItemHtml).join("");
  }

  c.innerHTML =
    '<div class="filter-bar" style="margin:2px 0 10px;flex-wrap:wrap;gap:8px">' +
      '<input class="xhsfav-search" placeholder="🔍 搜索标题 / 正文 / 标签 / 分类…" value="' + escapeHtml(xfQ) + '" oninput="xfSearch(this.value)" />' +
      '<span class="chip' + (xfView === "list" ? " active" : "") + '" onclick="xfSetView(\'list\')">列表</span>' +
      '<span class="chip' + (xfView === "group" ? " active" : "") + '" onclick="xfSetView(\'group\')">分类汇总</span>' +
      '<button class="enm-ghost-btn" onclick="xfAiOrganize()">✨ AI 整理</button>' +
      '<button class="enm-ghost-btn" onclick="xfExport()">⬇ 导出</button>' +
      '<button class="btn btn-primary" style="margin-left:auto" onclick="xfOpenAdd()">+ 添加</button>' +
    "</div>" +
    '<div class="xhsfav-chips">' + catChips + "</div>" +
    '<div style="height:8px"></div>' +
    bodyHtml;
}

function xfItemHtml(it) {
  var tags = (it.tags || []).map(function (t) { return '<span class="xhsfav-tag">#' + escapeHtml(t) + "</span>"; }).join("");
  var summary = it.summary || (it.content ? it.content.slice(0, 60) : "（无正文）");
  return '<div class="card xhsfav-item" onclick="xfOpenDetail(\'' + it.id + '\')">' +
    '<div class="flex-between"><div class="xhsfav-title">' + xfHighlight(it.title, xfQ) + '</div>' +
    '<span class="xhsfav-cat">' + escapeHtml(it.category || "其他") + "</span></div>" +
    '<div class="xhsfav-summary">' + xfHighlight(summary, xfQ) + "</div>" +
    (tags ? '<div class="xhsfav-tags">' + tags + "</div>" : "") +
    '<div class="xhsfav-meta">' + formatDateShort(it.createdAt) +
      (it.url ? ' · <a href="' + escapeHtml(it.url) + '" target="_blank" onclick="event.stopPropagation()">原文↗</a>' : "") + "</div>" +
    "</div>";
}

function xfSearch(q) { xfQ = q; renderXhsFav(); }
function xfSetCat(cat) { xfCat = cat; renderXhsFav(); }
function xfSetView(v) { xfView = v; renderXhsFav(); }
function xfToggleGroup(cat) {
  xfCollapsed[cat] = !xfCollapsed[cat];
  var items = document.getElementById("xfg-" + cat);
  var arrow = document.getElementById("xfa-" + cat);
  if (items) items.classList.toggle("hidden", !!xfCollapsed[cat]);
  if (arrow) arrow.textContent = xfCollapsed[cat] ? "▸" : "▾";
}

// ---- 添加弹窗（单条 / 批量 / 导入）----
function xfOpenAdd() {
  xfAddTab = "single";
  xfBatchPreview = [];
  xfRenderAdd();
}
function xfRenderAdd() {
  var d = xfLoad();
  var catOpts = d.categories.map(function (c) { return '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + "</option>"; }).join("");
  var body;
  if (xfAddTab === "single") {
    body =
      '<div class="form-row"><label>标题</label><input id="xf-title" placeholder="收藏的笔记标题" /></div>' +
      '<div class="form-row"><label>正文 / 要点</label><textarea id="xf-content" rows="4" placeholder="粘贴笔记正文或你的备注"></textarea></div>' +
      '<div class="form-row"><label>原文链接</label><input id="xf-url" placeholder="https://www.xiaohongshu.com/explore/..." /></div>' +
      '<div class="form-row"><label>分类</label><select id="xf-cat">' + catOpts + '<option value="__new__">+ 新建分类…</option></select></div>' +
      '<div class="form-row"><label>标签（逗号分隔）</label><input id="xf-tags" placeholder="如：显瘦,通勤,平价" /></div>';
  } else if (xfAddTab === "batch") {
    body =
      '<div class="xhsfav-tip">💡 从小红书长按笔记 → 分享 → 复制链接/文字，一次粘贴多条（用空行分隔），AI 会自动拆条 + 归类。</div>' +
      '<textarea id="xf-batch" rows="8" placeholder="把多条收藏粘贴到这里，每条之间空一行…"></textarea>' +
      '<div id="xf-batch-preview" class="xhsfav-preview"></div>';
  } else {
    body =
      '<div class="xhsfav-tip">支持 JSON（[{title,content,url,category,tags}] 或 {items:[...]}）、CSV（标题,正文,链接,分类,标签）、Markdown（# 标题 + 正文）。</div>' +
      '<input type="file" id="xf-file" accept=".json,.csv,.md,.txt" onchange="xfImportFile(this)" style="margin:8px 0" />' +
      '<div id="xf-import-result" class="xhsfav-preview"></div>';
  }
  var html =
    '<div class="modal-title">📌 添加收藏</div>' +
    '<div class="xhsfav-tabs">' +
      '<span class="xhsfav-tab' + (xfAddTab === "single" ? " active" : "") + '" onclick="xfSetAddTab(\'single\')">单条添加</span>' +
      '<span class="xhsfav-tab' + (xfAddTab === "batch" ? " active" : "") + '" onclick="xfSetAddTab(\'batch\')">批量粘贴</span>' +
      '<span class="xhsfav-tab' + (xfAddTab === "import" ? " active" : "") + '" onclick="xfSetAddTab(\'import\')">导入文件</span>' +
    "</div>" +
    body +
    '<div class="btn-row">' +
      '<button class="btn" onclick="closeModal()">取消</button>' +
      (xfAddTab === "batch"
        ? '<button class="btn btn-primary" onclick="xfPreviewBatch()">解析预览</button><button class="btn btn-primary" id="xf-batch-add" style="display:none" onclick="xfConfirmBatch()">确认添加</button>'
        : xfAddTab === "import"
          ? '<button class="btn btn-primary" id="xf-import-add" style="display:none" onclick="xfConfirmImport()">确认导入</button>'
          : '<button class="btn btn-primary" onclick="xfAddSingle()">保存</button>') +
    "</div>";
  showModal(html);
}
function xfSetAddTab(t) { xfAddTab = t; xfRenderAdd(); }

function xfAddSingle() {
  var d = xfLoad();
  var title = (document.getElementById("xf-title").value || "").trim();
  var content = (document.getElementById("xf-content").value || "").trim();
  var url = (document.getElementById("xf-url").value || "").trim();
  var catSel = document.getElementById("xf-cat").value;
  var cat = catSel;
  if (cat === "__new__") {
    var nv = (window.prompt("输入新分类名称：", "") || "").trim();
    cat = nv || "其他";
    if (d.categories.indexOf(cat) < 0) d.categories.push(cat);
  }
  var tags = (document.getElementById("xf-tags").value || "").split(/[,，、]/).map(function (t) { return t.trim(); }).filter(Boolean);
  if (!title && !content) { showToast("标题或正文至少填一项", "error"); return; }
  d.items.unshift({
    id: xfUid(), title: title || "未命名收藏", content: content, url: url,
    category: cat, tags: tags, summary: content.slice(0, 30), aiCategory: "",
    source: "manual", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  });
  xfSave(d);
  closeModal();
  renderXhsFav();
  showToast("已添加 1 条收藏 ✅");
}
function xfPreviewBatch() {
  var txt = document.getElementById("xf-batch").value || "";
  xfBatchPreview = xfParseBatch(txt);
  var box = document.getElementById("xf-batch-preview");
  var addBtn = document.getElementById("xf-batch-add");
  if (!xfBatchPreview.length) { box.innerHTML = '<div class="xhsfav-tip">没解析到内容，请检查格式。</div>'; if (addBtn) addBtn.style.display = "none"; return; }
  box.innerHTML = "解析到 <b>" + xfBatchPreview.length + "</b> 条：<br>" + xfBatchPreview.slice(0, 5).map(function (it) {
    return "· " + escapeHtml(it.title) + (it.url ? " 🔗" : "");
  }).join("<br>") + (xfBatchPreview.length > 5 ? "<br>…" : "");
  if (addBtn) addBtn.style.display = "";
}
function xfConfirmBatch() {
  var d = xfLoad();
  xfBatchPreview.forEach(function (it) { d.items.unshift(it); });
  xfSave(d);
  var n = xfBatchPreview.length;
  xfBatchPreview = [];
  closeModal();
  renderXhsFav();
  showToast("已添加 " + n + " 条收藏，点「✨ AI 整理」自动归类 ➜", "success");
}
var xfImportBuffer = [];
function xfImportFile(input) {
  var f = input.files && input.files[0];
  if (!f) return;
  var reader = new FileReader();
  reader.onload = function () {
    var txt = String(reader.result || "");
    var items = [];
    try {
      if (/\.json$/i.test(f.name)) {
        var j = JSON.parse(txt);
        var arr = Array.isArray(j) ? j : (j.items && Array.isArray(j.items) ? j.items : []);
        items = arr.map(function (o) {
          return { id: xfUid(), title: o.title || o.标题 || "未命名收藏", content: o.content || o.正文 || o.摘要 || "", url: o.url || o.链接 || "", category: o.category || o.分类 || "其他", tags: Array.isArray(o.tags || o.标签) ? o.tags || o.标签 : [], summary: "", aiCategory: "", source: "import", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        });
      } else if (/\.csv$/i.test(f.name)) {
        var lines = txt.split(/\r?\n/).filter(function (l) { return l.trim(); });
        items = lines.map(function (l) {
          var p = l.split(",");
          return { id: xfUid(), title: (p[0] || "未命名收藏").trim(), content: (p[1] || "").trim(), url: (p[2] || "").trim(), category: (p[3] || "其他").trim(), tags: (p[4] || "").split("/").map(function (t) { return t.trim(); }).filter(Boolean), summary: "", aiCategory: "", source: "import", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        });
      } else {
        // Markdown：以 # 开头的行作为标题，其后到下一个 # 之前为正文
        var blocks = txt.split(/^#\s+/m).slice(1);
        items = blocks.map(function (b) {
          var nl = b.indexOf("\n");
          var title = nl < 0 ? b.trim() : b.slice(0, nl).trim();
          var content = nl < 0 ? "" : b.slice(nl + 1).trim();
          return { id: xfUid(), title: title || "未命名收藏", content: content, url: "", category: "其他", tags: [], summary: "", aiCategory: "", source: "import", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        });
      }
    } catch (e) { document.getElementById("xf-import-result").innerHTML = '<div class="xhsfav-tip">解析失败：' + escapeHtml(e.message) + "</div>"; return; }
    xfImportBuffer = items;
    var box = document.getElementById("xf-import-result");
    var addBtn = document.getElementById("xf-import-add");
    box.innerHTML = "解析到 <b>" + items.length + "</b> 条，确认导入？";
    if (addBtn) addBtn.style.display = "";
  };
  reader.readAsText(f);
}
function xfConfirmImport() {
  var d = xfLoad();
  xfImportBuffer.forEach(function (it) {
    if (d.categories.indexOf(it.category) < 0) d.categories.push(it.category);
    d.items.unshift(it);
  });
  xfSave(d);
  var n = xfImportBuffer.length;
  xfImportBuffer = [];
  closeModal();
  renderXhsFav();
  showToast("已导入 " + n + " 条收藏 ✅");
}

// ---- 详情 / 编辑 / 删除 ----
function xfOpenDetail(id) {
  xfDetailId = id;
  var d = xfLoad();
  var it = d.items.filter(function (x) { return x.id === id; })[0];
  if (!it) return;
  var catOpts = d.categories.map(function (c) { return '<option value="' + escapeHtml(c) + '"' + (c === it.category ? " selected" : "") + ">" + escapeHtml(c) + "</option>"; }).join("");
  var html =
    '<div class="modal-title">📌 ' + escapeHtml(it.title) + "</div>" +
    '<div class="form-row"><label>分类</label><input id="xf-d-cat" list="xf-d-cats" value="' + escapeHtml(it.category || "") + '" /><datalist id="xf-d-cats">' + catOpts + "</datalist></div>" +
    '<div class="form-row"><label>标签（逗号分隔）</label><input id="xf-d-tags" value="' + escapeHtml((it.tags || []).join(",")) + '" /></div>' +
    '<div class="form-row"><label>摘要</label><input id="xf-d-sum" value="' + escapeHtml(it.summary || "") + '" /></div>' +
    '<div class="form-row"><label>正文</label><textarea id="xf-d-content" rows="6">' + escapeHtml(it.content || "") + "</textarea></div>" +
    '<div class="form-row"><label>原文链接</label><input id="xf-d-url" value="' + escapeHtml(it.url || "") + '" /></div>' +
    (it.url ? '<div class="xhsfav-tip"><a href="' + escapeHtml(it.url) + '" target="_blank">打开小红书原文 ↗</a></div>' : "") +
    '<div class="btn-row">' +
      '<button class="btn" style="color:var(--accent-red)" onclick="xfDelete(\'' + id + '\')">删除</button>' +
      '<button class="btn" onclick="closeModal()">取消</button>' +
      '<button class="btn btn-primary" onclick="xfSaveDetail()">保存</button>' +
    "</div>";
  showModal(html);
}
function xfSaveDetail() {
  var d = xfLoad();
  var it = d.items.filter(function (x) { return x.id === xfDetailId; })[0];
  if (!it) { closeModal(); return; }
  var cat = (document.getElementById("xf-d-cat").value || "其他").trim();
  if (d.categories.indexOf(cat) < 0) d.categories.push(cat);
  it.category = cat;
  it.tags = (document.getElementById("xf-d-tags").value || "").split(/[,，、]/).map(function (t) { return t.trim(); }).filter(Boolean);
  it.summary = (document.getElementById("xf-d-sum").value || "").trim();
  it.content = (document.getElementById("xf-d-content").value || "").trim();
  it.url = (document.getElementById("xf-d-url").value || "").trim();
  it.updatedAt = new Date().toISOString();
  xfSave(d);
  closeModal();
  renderXhsFav();
  showToast("已保存 ✅");
}
function xfDelete(id) {
  var d = xfLoad();
  d.items = d.items.filter(function (x) { return x.id !== id; });
  xfSave(d);
  closeModal();
  renderXhsFav();
  showToast("已删除");
}

// ---- 导出 JSON ----
function xfExport() {
  var d = xfLoad();
  var blob = new Blob([JSON.stringify({ items: d.items, categories: d.categories }, null, 2)], { type: "application/json" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "xhs-fav-" + today() + ".json";
  a.click();
  showToast("已导出 " + d.items.length + " 条收藏");
}
