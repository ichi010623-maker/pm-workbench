// ============================================================
// 行业情报增强模块 · 纯逻辑 + 免费大模型接入层
// 功能：① 每日资讯留存（历史回顾）② 收藏 ③ 按需求自定义情报收集（免费大模型）
// 设计原则：纯函数不依赖 DOM，便于 Node vm 自动化测试（tests/intel.test.js）
// 大模型仅浏览器侧 fetch；测试中用 stub fetch 覆盖，不触网。
// ============================================================

// ---------- ① 每日资讯留存（历史回顾） ----------

// 把某一天抓取的资讯快照写入 history（按 generatedAt 的日期分桶）；同一天重复抓取幂等不覆盖
function snapshotNewsForDate(news, history) {
  if (!news || !news.items || !news.items.length || !news.generatedAt) return history || {};
  var date = String(news.generatedAt).slice(0, 10);
  history = history || {};
  if (history[date] && history[date].generatedAt === news.generatedAt) return history; // 当天已留存，幂等
  var items = news.items.map(function (n) {
    return {
      id: n.id, category: n.category, priority: n.priority,
      title: n.title, summary: n.summary, source: n.source,
      url: n.url, pubTime: n.pubTime, tags: Array.isArray(n.tags) ? n.tags : []
    };
  });
  var copy = {};
  for (var k in history) if (history.hasOwnProperty(k)) copy[k] = history[k];
  copy[date] = { generatedAt: news.generatedAt, categories: news.categories || [], items: items };
  return copy;
}

// 用服务端每日归档（news-archive.json）补齐本地缺失日期（幂等：已有日期不覆盖）
function reconcileIntelHistory(archive, history) {
  history = history || {};
  if (!archive || typeof archive !== "object") return history;
  var dates = Object.keys(archive).sort();
  var changed = false;
  for (var i = 0; i < dates.length; i++) {
    var date = dates[i];
    var day = archive[date];
    if (!day || !day.items || !day.items.length) continue;
    if (history[date] && history[date].items && history[date].items.length) continue; // 已有，保留
    history[date] = {
      generatedAt: day.generatedAt || date + "T00:00:00+08:00",
      categories: Array.isArray(day.categories) ? day.categories : [],
      items: (day.items || []).map(function (n) {
        return {
          id: n.id, category: n.category, priority: n.priority,
          title: n.title, summary: n.summary, source: n.source,
          url: n.url, pubTime: n.pubTime, tags: Array.isArray(n.tags) ? n.tags : []
        };
      })
    };
    changed = true;
  }
  return changed ? history : history;
}

// 返回历史日期列表（倒序，最新在前）
function intelHistoryDates(history) {
  if (!history) return [];
  return Object.keys(history).sort().reverse();
}

// 取某一天留存的资讯条目
function intelHistoryByDate(history, date) {
  if (!history || !history[date]) return [];
  return history[date].items || [];
}

// 历史回顾关键词搜索：匹配 标题/摘要/来源/标签（不区分大小写）
function intelSearchItems(items, keyword) {
  items = items || [];
  keyword = String(keyword || "").trim().toLowerCase();
  if (!keyword) return items.slice();
  return items.filter(function (n) {
    var hay = [n.title, n.summary, n.source, (n.tags || []).join(" ")].join(" ").toLowerCase();
    return hay.indexOf(keyword) >= 0;
  });
}

// 历史回顾按分类筛选（day.categories 的 key）
function intelFilterItemsByCategory(items, catKey) {
  items = items || [];
  if (!catKey || catKey === "all") return items.slice();
  return items.filter(function (n) { return (n.category || "") === catKey; });
}

// ---------- ② 收藏 ----------

// 稳定的收藏 key：日期 + 条目 id（或标题）。live 资讯 id 如 n1 会跨天重复，故必须带日期
function intelFavKey(item, dateStr) {
  var base = (item && (item.id || item.title)) ? String(item.id || item.title) : "x";
  var d = dateStr || (item && item.date) || "nodate";
  return String(d) + "|" + base;
}

// 构建一条收藏记录（含可选分类 catId）
function intelMakeFavRec(item, dateStr, catId) {
  return {
    key: intelFavKey(item, dateStr),
    date: dateStr || (item && item.date) || (typeof today === "function" ? today() : "nodate"),
    favAt: new Date().toISOString(),
    title: item ? (item.title || "") : "",
    summary: item ? (item.summary || "") : "",
    source: item ? (item.source || "") : "",
    url: item ? (item.url || "") : "",
    category: item ? (item.category || "") : "",
    tags: item && Array.isArray(item.tags) ? item.tags : [],
    origin: item && item.origin ? item.origin : "news",
    catId: catId || null
  };
}

// 加入收藏（假定尚未收藏），返回新数组
function intelAddFav(favArr, item, dateStr, catId) {
  favArr = favArr || [];
  return favArr.concat([intelMakeFavRec(item, dateStr, catId)]);
}

// 切换收藏：已收藏则移除，未收藏则加入。返回 { fav, added, key }
function intelToggleFav(favArr, item, dateStr, catId) {
  favArr = favArr || [];
  var key = intelFavKey(item, dateStr);
  var existing = null;
  for (var i = 0; i < favArr.length; i++) { if (favArr[i].key === key) { existing = favArr[i]; break; } }
  if (existing) {
    return { fav: favArr.filter(function (f) { return f.key !== key; }), added: false, key: key };
  }
  return { fav: intelAddFav(favArr, item, dateStr, catId), added: true, key: key };
}

function intelIsFav(favArr, key) {
  if (!favArr || !key) return false;
  for (var i = 0; i < favArr.length; i++) { if (favArr[i].key === key) return true; }
  return false;
}

function intelRemoveFav(favArr, key) {
  if (!favArr) return [];
  return favArr.filter(function (f) { return f.key !== key; });
}

// 收藏分类内搜索：匹配 标题/摘要/来源/标签 + 该收藏下所有评论文本（不区分大小写）
function intelSearchFav(favArr, keyword, comments) {
  favArr = favArr || [];
  keyword = String(keyword || "").trim().toLowerCase();
  if (!keyword) return favArr.slice();
  comments = comments || {};
  return favArr.filter(function (f) {
    var hay = [f.title, f.summary, f.source, (f.tags || []).join(" ")].join(" ").toLowerCase();
    if (hay.indexOf(keyword) >= 0) return true;
    var arr = (f.key && comments[f.key]) || [];
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].text && arr[i].text.toLowerCase().indexOf(keyword) >= 0) return true;
    }
    return false;
  });
}

// ---------- 数据初始化（与 ensureRecipes 同构） ----------
// 收藏分类默认集（用户可自定义名称 / 新增 / 重命名 / 删除）
var INTEL_FAV_CATS_DEFAULT = [
  { id: "market", name: "市场" },
  { id: "competitor", name: "竞品" },
  { id: "tech", name: "技术" },
  { id: "supply", name: "供应链" },
  { id: "policy", name: "政策" }
];

function ensureIndustry() {
  if (typeof DB === "undefined" || !DB.data) return;
  if (!DB.data.industryHistory) DB.data.industryHistory = {};
  if (!DB.data.industryFav) DB.data.industryFav = [];
  if (!DB.data.industryCustom) DB.data.industryCustom = [];
  if (!DB.data.industryComments) DB.data.industryComments = {};
  if (!DB.data.industryFavCats) DB.data.industryFavCats = INTEL_FAV_CATS_DEFAULT.map(function (c) { return { id: c.id, name: c.name }; });
  if (!Array.isArray(DB.data.marketOpp)) DB.data.marketOpp = [];
}

// ---------- 收藏分类管理（自定义名称） ----------
// 返回分类名称；未匹配时回退「未分类」
function intelFavCatName(cats, catId) {
  if (!cats || !catId) return "未分类";
  for (var i = 0; i < cats.length; i++) { if (cats[i].id === catId) return cats[i].name; }
  return "未分类";
}
// 新增分类（名称自定义），返回 { cats, id }
function intelAddFavCat(cats, name) {
  cats = cats || [];
  name = String(name || "").trim();
  if (!name) throw new Error("分类名称不能为空");
  var id = "cat_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6);
  return { cats: cats.concat([{ id: id, name: name }]), id: id };
}
// 重命名分类，返回新 cats
function intelRenameFavCat(cats, id, name) {
  cats = cats || [];
  name = String(name || "").trim();
  if (!name) throw new Error("分类名称不能为空");
  return cats.map(function (c) { if (c.id === id) return { id: c.id, name: name }; return c; });
}
// 删除分类（分类永不空：删空则回退默认集），返回 { cats, reassignTo }
function intelRemoveFavCat(cats, id) {
  cats = cats || [];
  var remaining = cats.filter(function (c) { return c.id !== id; });
  if (!remaining.length) remaining = INTEL_FAV_CATS_DEFAULT.map(function (c) { return { id: c.id, name: c.name }; });
  return { cats: remaining, reassignTo: remaining[0].id };
}

// ---------- 评论 ----------
// 新增评论，返回 { comments, comment }
function intelAddComment(comments, key, text) {
  comments = comments || {};
  text = String(text || "").trim();
  if (!text) throw new Error("评论不能为空");
  if (!key) throw new Error("缺少条目标识");
  var arr = comments[key] ? comments[key].slice() : [];
  var cmt = { id: (typeof uid === "function" ? uid() : "c" + Math.random().toString(36).slice(2, 9)), text: text, createdAt: new Date().toISOString() };
  arr.push(cmt);
  var copy = {}; for (var k in comments) if (comments.hasOwnProperty(k)) copy[k] = comments[k];
  copy[key] = arr;
  return { comments: copy, comment: cmt };
}
function intelListComments(comments, key) {
  if (!comments || !key) return [];
  return (comments[key] || []).slice();
}
function intelRemoveComment(comments, key, cmtId) {
  comments = comments || {};
  if (!comments[key]) return comments;
  var copy = {}; for (var k in comments) if (comments.hasOwnProperty(k)) copy[k] = comments[k];
  copy[key] = (comments[key] || []).filter(function (c) { return c.id !== cmtId; });
  if (!copy[key].length) delete copy[key];
  return copy;
}
// 编辑评论，返回 { comments, comment }；保留原 createdAt，新增 updatedAt
function intelUpdateComment(comments, key, cmtId, text) {
  comments = comments || {};
  text = String(text || "").trim();
  if (!text) throw new Error("评论不能为空");
  if (!key || !cmtId) throw new Error("缺少条目标识");
  if (!comments[key]) return { comments: comments, comment: null };
  var copy = {}; for (var k in comments) if (comments.hasOwnProperty(k)) copy[k] = comments[k];
  var updated = null;
  copy[key] = (comments[key] || []).map(function (c) {
    if (c.id === cmtId) { updated = { id: c.id, text: text, createdAt: c.createdAt, updatedAt: new Date().toISOString() }; return updated; }
    return c;
  });
  return { comments: copy, comment: updated };
}

// ---------- ③ 免费大模型接入（按需求收集不同情报） ----------
// 免费选型（2026-08-06 联网调研确认）：
//   首选 Gemini 2.5 Flash + Google Search grounding —— 免费层、无需信用卡、浏览器 CORS 友好、真实联网检索 + 引用来源
//   备选 Perplexity Sonar —— 强引用/联网检索，但需预付约 $5 额度（近乎免费，非完全免费）
//   知识型 Groq / DeepSeek / OpenRouter(:free) —— 免费额度，基于模型训练知识（非实时检索）
// API Key 仅存本机 localStorage，绝不写入同步云 DB。

function intelSystemPrompt(need, dateStr) {
  return "你是一名资深硬件产品情报分析师，服务于消费电子/便携硬件产品经理。" +
    "请针对以下需求，整理一份结构化的行业情报简报。\n\n" +
    "用户需求：" + (need || "") + "\n" +
    "今天是：" + (dateStr || "") + "\n\n" +
    "要求：\n" +
    "1. 用中文输出，聚焦与硬件产品（折叠屏/便携充电/磁吸配件/美拍镜/补光灯/散热/AI硬件等）相关的市场、竞品、技术、供应链、政策情报。\n" +
    "2. 只输出一个 JSON 对象，不要额外解释，格式严格如下：\n" +
    "{\n" +
    '  "title": "情报简报一句话标题",\n' +
    '  "summary": "3-5 句总体判断",\n' +
    '  "items": [\n' +
    '    { "title": "情报点标题", "point": "关键内容与启示（2-3句）", "source": "来源名（如：某媒体/某厂商/某报告）", "url": "来源链接或空字符串", "tags": ["标签1","标签2"] }\n' +
    "  ],\n" +
    '  "sources": [ { "title": "参考来源标题", "url": "https://..." } ]\n' +
    "}\n" +
    "3. items 至少 3 条、至多 10 条；url 如不确定可留空字符串；tags 用中文短词。\n" +
    "4. sources 必须是你通过联网检索找到的真实网页，给出 title 与可点击的 url（https://...）；若确实无可靠来源可留空数组，但严禁编造不存在的链接。";
}

// OpenAI 兼容 provider 构造器（Groq / DeepSeek / OpenRouter）
function openAiIntelProvider(endpoint, model, name) {
  return {
    id: model, name: name, search: false, endpoint: endpoint,
    buildUrl: function () { return endpoint; },
    buildHeaders: function (k) { return { "Content-Type": "application/json", "Authorization": "Bearer " + k }; },
    buildBody: function (need, dateStr) {
      return {
        model: model,
        messages: [
          { role: "system", content: "你是硬件产品情报分析师，基于你的知识作答，输出严谨简体中文。" },
          { role: "user", content: intelSystemPrompt(need, dateStr) }
        ]
      };
    },
    buildBodyForPrompt: function (prompt, dateStr) {
      return {
        model: model,
        messages: [
          { role: "system", content: "你是资深硬件产品市场机会分析师，服务于消费电子/便携硬件（折叠屏/便携充电/磁吸配件/美拍镜/补光灯/散热/AI硬件等）产品经理，输出严谨简体中文。" },
          { role: "user", content: prompt }
        ]
      };
    },
    parse: function (d) {
      var text = d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
      return { text: text, sources: [] };
    }
  };
}

// 下拉框 🌐 标记：该 provider 是否内置联网检索，帮助用户一眼识别「可联网的模型」
function intelProvBadge(k) {
  var p = INTEL_PROVIDERS[k];
  return (p && p.search) ? " 🌐" : "";
}

var INTEL_PROVIDERS = {
  zhipu: openAiIntelProvider("https://open.bigmodel.cn/api/paas/v4/chat/completions", "glm-4-flash", "智谱 GLM-4-Flash（国内·永久免费）"),
  siliconflow: openAiIntelProvider("https://api.siliconflow.cn/v1/chat/completions", "Qwen/Qwen2.5-7B-Instruct", "硅基流动 SiliconFlow（国内·免费模型）"),
  gemini: {
    id: "gemini",
    name: "Google Gemini (免费·联网搜索)",
    search: true,
    // 模型名用占位符 + 候选列表：Google 会轮换/下线 GA 别名（如 gemini-2.5-flash），
    // 任一返回 404「模型不存在」时自动尝试下一个，避免用户必现失败。
    endpoint: "https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent",
    // 2026-08 真实可用模型（已核对 Google 官方文档）：GA = gemini-2.5-flash / gemini-2.5-pro / gemini-3.5-flash / gemini-3.6-flash；Preview = gemini-3-flash-preview。
    // 注：gemini-2.5-flash-latest / gemini-2.5-pro-latest 并非真实端点串（文档无此精确名），已从候选移除，避免无谓 404。
    // 「2.5 / 3.x」交错排列，让新老 Key 最多重试 1 次即可命中可用模型。
    models: ["gemini-2.5-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-2.5-pro", "gemini-3-flash-preview", "gemini-2.5-flash-lite"],
    buildUrl: function (k, mi) { return this.endpoint.replace("{MODEL}", this.models[(mi || 0)] || this.models[0]) + "?key=" + encodeURIComponent(k); },
    buildHeaders: function () { return { "Content-Type": "application/json" }; },
    buildBody: function (need, dateStr) {
      // 启用 google_search 接地工具即获得实时检索与引用；该模式下不使用 responseMimeType（避免与 grounding 冲突），改由文本内 JSON 解析
      return {
        contents: [{ parts: [{ text: intelSystemPrompt(need, dateStr) }] }],
        tools: [{ google_search: {} }]
      };
    },
    buildBodyForPrompt: function (prompt, dateStr) {
      // 市场机会分析：同样启用 google_search 接地（真实联网检索 + 引用来源）
      return {
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }]
      };
    },
    parse: function (d) {
      var cand = d && d.candidates && d.candidates[0];
      if (!cand) return { text: "", sources: [] };
      // google_search 接地模式下 parts 可能包含 functionCall，文本常在其它 part，需聚合所有文本片段
      var text = "";
      try {
        var parts = (cand.content && cand.content.parts) || [];
        parts.forEach(function (pt) { if (pt && pt.text) text += pt.text; });
      } catch (e) {}
      if (!text && cand.text) text = cand.text;
      var sources = [];
      try {
        var gm = cand.groundingMetadata;
        if (gm && gm.groundingChunks) {
          gm.groundingChunks.forEach(function (c) { if (c.web && c.web.uri) sources.push({ title: c.web.title || "", url: c.web.uri || "" }); });
        }
      } catch (e) {}
      return { text: text, sources: sources };
    }
  },
  perplexity: {
    id: "perplexity",
    name: "Perplexity Sonar (近免费·强引用)",
    search: true,
    endpoint: "https://api.perplexity.ai/chat/completions",
    buildUrl: function () { return this.endpoint; },
    buildHeaders: function (k) { return { "Content-Type": "application/json", "Authorization": "Bearer " + k }; },
    buildBody: function (need, dateStr) {
      return {
        model: "sonar",
        messages: [
          { role: "system", content: "你是硬件产品情报分析师，使用联网检索给出带引用的简报。" },
          { role: "user", content: intelSystemPrompt(need, dateStr) }
        ]
      };
    },
    buildBodyForPrompt: function (prompt, dateStr) {
      return {
        model: "sonar",
        messages: [
          { role: "system", content: "你是资深硬件产品市场机会分析师，使用联网检索给出带引用的分析。" },
          { role: "user", content: prompt }
        ]
      };
    },
    parse: function (d) {
      var text = d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
      var cites = (d && d.citations) || [];
      var sources = cites.map(function (u) { return { title: "", url: u }; });
      return { text: text, sources: sources };
    }
  },
  openai: {
    id: "openai",
    name: "OpenAI ChatGPT (联网搜索)",
    search: true,
    endpoint: "https://api.openai.com/v1/chat/completions",
    buildUrl: function () { return this.endpoint; },
    buildHeaders: function (k) { return { "Content-Type": "application/json", "Authorization": "Bearer " + k }; },
    // Chat Completions 专用搜索模型：始终先联网检索再回答，无需 tools 字段
    buildBody: function (need, dateStr) {
      return {
        model: "gpt-5-search-api",
        messages: [
          { role: "system", content: "你是硬件产品情报分析师，使用联网检索给出带引用的严谨简体中文简报。" },
          { role: "user", content: intelSystemPrompt(need, dateStr) }
        ]
      };
    },
    buildBodyForPrompt: function (prompt, dateStr) {
      return {
        model: "gpt-5-search-api",
        messages: [
          { role: "system", content: "你是资深硬件产品市场机会分析师，服务于消费电子/便携硬件（折叠屏/便携充电/磁吸配件/美拍镜/补光灯/散热/AI硬件等）产品经理，使用联网检索给出带引用的严谨简体中文分析。" },
          { role: "user", content: prompt }
        ]
      };
    },
    parse: function (d) {
      var msg = d && d.choices && d.choices[0] && d.choices[0].message;
      var text = msg && msg.content;
      if (msg && Array.isArray(msg.content)) {
        text = msg.content.map(function (c) { return (c && c.text) ? c.text : ""; }).join("");
      }
      var sources = [];
      // Chat Completions 搜索模型通过 url_citation 注解返回来源（兼容嵌套 / 扁平 / footnote 三种形态）
      try {
        var anns = msg && msg.annotations;
        if (Array.isArray(anns)) {
          anns.forEach(function (a) {
            var url = "", title = "";
            if (a) {
              if (a.url_citation && a.url_citation.url) { url = a.url_citation.url; title = a.url_citation.title || ""; }
              else if (a.footnote && a.footnote.url_citation && a.footnote.url_citation.url) { url = a.footnote.url_citation.url; title = a.footnote.url_citation.title || ""; }
              else if (a.type === "url_citation" && a.url) { url = a.url; title = a.title || ""; }
            }
            if (url && !sources.some(function (s) { return s.url === url; })) sources.push({ title: title, url: url });
          });
        }
      } catch (e) {}
      return { text: text, sources: sources };
    }
  },
  groq: openAiIntelProvider("https://api.groq.com/openai/v1/chat/completions", "llama-3.3-70b-versatile", "Groq (免费)"),
  deepseek: openAiIntelProvider("https://api.deepseek.com/chat/completions", "deepseek-chat", "DeepSeek (免费额度)"),
  openrouter: openAiIntelProvider("https://openrouter.ai/api/v1/chat/completions", "meta-llama/llama-3.3-70b-instruct:free", "OpenRouter (免费)")
};
// 修正 groq/deepseek/openrouter 的 id 为可读键，便于 UI 与测试定位
INTEL_PROVIDERS.groq.id = "groq";
INTEL_PROVIDERS.deepseek.id = "deepseek";
INTEL_PROVIDERS.openrouter.id = "openrouter";
  // 新增国内可直连的免费大模型（无需信用卡、浏览器 PWA 可调用）：智谱 GLM-4-Flash 永久免费、硅基流动多模型免费
  INTEL_PROVIDERS.zhipu.id = "zhipu";
  INTEL_PROVIDERS.siliconflow.id = "siliconflow";

  // ---------- 智谱联网检索（Web Search in Chat）----------
  // 让智谱在对话内联网搜索，从而能产出真实、可溯源的来源链接。
  // 注意：智谱对话联网模式不直接返回结构化 sources 数组（仅正文内 [来源：ref] 引用），
  // 因此来源由模型在 JSON 的 sources 字段 / 正文 markdown 链接给出，这里负责启用检索 + 解析来源。
  function intelWebSearchEnabled() {
    try { var c = (typeof loadAiConfig === "function") ? loadAiConfig() : {}; return c.webSearch !== false; }
    catch (e) { return true; }
  }
  function zhipuBodyWithSearch(messages) {
    var body = { model: "glm-4-flash", messages: messages };
    if (intelWebSearchEnabled()) {
      body.tools = [{ type: "web_search", web_search: { enable: "True", search_engine: "search_std", search_result: "True", count: "5" } }];
      body.tool_choice = "auto";
    }
    return body;
  }
  // 从模型正文抽取 markdown 链接作为来源兜底（[标题](url)）
  function intelExtractTextLinks(text) {
    var out = [];
    if (!text) return out;
    var re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, m;
    while ((m = re.exec(text))) {
      var url = m[2], title = m[1] || url;
      if (url && !out.some(function (x) { return x.url === url; })) out.push({ title: title, url: url });
    }
    return out;
  }
  // 覆盖智谱 provider：启用联网检索 + 来源解析
  INTEL_PROVIDERS.zhipu.buildBody = function (need, dateStr) {
    return zhipuBodyWithSearch([
      { role: "system", content: "你是硬件产品情报分析师，使用联网检索作答，输出严谨简体中文；关键数据尽量给出可点击的来源网页链接。" },
      { role: "user", content: intelSystemPrompt(need, dateStr) }
    ]);
  };
  INTEL_PROVIDERS.zhipu.buildBodyForPrompt = function (prompt, dateStr) {
    return zhipuBodyWithSearch([
      { role: "system", content: "你是资深硬件产品市场机会分析师，服务于消费电子/便携硬件产品经理，使用联网检索作答，输出严谨简体中文；关键数据尽量给出可点击的来源网页链接。" },
      { role: "user", content: prompt }
    ]);
  };
  INTEL_PROVIDERS.zhipu.parse = function (d) {
    var m = d && d.choices && d.choices[0] && d.choices[0].message;
    var text = m && m.content;
    // 智谱对话联网模式不直接返回结构化 sources 数组，来源由模型在 JSON sources 字段 / 正文链接给出
    return { text: text, sources: [] };
  };
  INTEL_PROVIDERS.zhipu.search = true; // 智谱已启用联网检索，下拉框标 🌐

// 从模型原始文本稳健提取 JSON（兼容 ```json 代码块与前后噪声）
function parseIntelLLM(text) {
  if (text == null) throw new Error("模型返回为空");
  var s = String(text).trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  var a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b < 0 || b < a) throw new Error("未找到 JSON 对象");
  return JSON.parse(s.slice(a, b + 1));
}

// 把模型解析结果规范化为统一结构
function buildIntelResult(parsed, opts) {
  parsed = parsed || {};
  opts = opts || {};
  var items = Array.isArray(parsed.items)
    ? parsed.items.filter(function (it) { return it && it.title; }).map(function (it) {
        return {
          title: String(it.title || ""),
          point: String(it.point || it.summary || ""),
          source: String(it.source || ""),
          url: String(it.url || ""),
          tags: Array.isArray(it.tags) ? it.tags.map(String) : []
        };
      })
    : [];
  var sources = Array.isArray(parsed.sources)
    ? parsed.sources.filter(function (s) { return s && s.url; }).map(function (s) { return { title: String(s.title || ""), url: String(s.url || "") }; })
    : [];
  (opts.sources || []).forEach(function (s) {
    if (s && s.url && !sources.some(function (x) { return x.url === s.url; })) sources.push({ title: s.title || "", url: s.url });
  });
  if (typeof intelExtractTextLinks === "function") {
    intelExtractTextLinks(opts.text).forEach(function (s) {
      if (s && s.url && !sources.some(function (x) { return x.url === s.url; })) sources.push({ title: s.title || "", url: s.url });
    });
  }
  return {
    id: (typeof uid === "function" ? uid() : "id" + Math.random().toString(36).slice(2, 9)),
    date: opts.date || (typeof today === "function" ? today() : "nodate"),
    need: opts.need || "",
    provider: opts.provider || "",
    title: String(parsed.title || ("情报：" + (opts.need || ""))),
    summary: String(parsed.summary || ""),
    items: items,
    sources: sources
  };
}

// 把一条自定义情报结果转存为「我的情报」：逐条 item 拆成独立 industry 条目（便于分类/搜索/收藏）
function customIntelToMyIntel(r) {
  r = r || {};
  var date = r.date || (typeof today === "function" ? today() : "nodate");
  var out = [];
  var items = Array.isArray(r.items) ? r.items : [];
  if (!items.length) {
    // 无子条目时，把整条简报作为一条我的情报
    out.push({
      id: (typeof uid === "function" ? uid() : "id" + Math.random().toString(36).slice(2, 9)),
      title: String(r.title || "自定义情报"), summary: String(r.summary || ""),
      source: "", url: "", tags: [], date: date, important: false, origin: "custom:intel"
    });
    return out;
  }
  items.forEach(function (it) {
    out.push({
      id: (typeof uid === "function" ? uid() : "id" + Math.random().toString(36).slice(2, 9)),
      title: String(it.title || ""),
      summary: String(it.point || it.summary || ""),
      source: String(it.source || ""),
      url: String(it.url || ""),
      tags: Array.isArray(it.tags) ? it.tags.map(String) : [],
      date: date,
      important: false,
      origin: "custom:intel"
    });
  });
  return out;
}

// HTTP 状态码 → 用户可读的中文原因（400/401/403/429 常见于 API Key 与额度问题）
function describeIntelHttpError(status) {
  var map = {
    400: "请求无效（多为 API Key 无效/格式错误，或请求内容不合法）",
    401: "未授权：API Key 无效",
    403: "无权限：API Key 无效或该模型不可用",
    404: "接口或模型不存在（可能模型名已变更，请联系作者）",
    405: "请求方式不允许",
    413: "请求内容过大",
    429: "请求过于频繁或免费额度用尽，请稍后再试",
    500: "模型服务端错误，请稍后再试",
    502: "网关错误，请稍后再试",
    503: "服务暂不可用，请稍后再试"
  };
  return map[status] || "未知错误";
}

// 浏览器内退避等待（429 限速重试用）
function intelSleep(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

// 通用 POST：对带候选模型列表的 provider（目前仅 Gemini）在 404「模型不存在」时自动尝试下一个模型；
// 遇到 429「请求过于频繁」时，对同一模型做至多 2 次退避重试（2s / 4s），应对免费层瞬时突发限速。
async function intelPost(p, apiKey, headers, body) {
  var models = p.models || null;
  var tries = models ? models.length : 1;
  var lastDetail = "";
  var lastStatus = 0;
  for (var i = 0; i < tries; i++) {
    var url = models ? p.buildUrl(apiKey, i) : p.buildUrl(apiKey);
    // 429 速率限制：对同一个模型做至多 2 次退避重试（2s / 4s），应对免费层瞬时突发
    var res = null;
    var retries = 0;
    while (true) {
      res = await fetch(url, { method: "POST", headers: headers, body: JSON.stringify(body) });
      if (res.ok || res.status !== 429 || retries >= 2) break;
      retries++;
      await intelSleep(retries * 2000);
    }
    if (res.ok) return res;
    lastStatus = res.status;
    // 尽量读取 API 返回的错误详情（如 Gemini 的 "API key not valid" / "模型不存在"），让用户能自查
    var detail = "";
    try {
      var t = await res.text();
      if (t) {
        try { var j = JSON.parse(t); detail = (j.error && (j.error.message || j.error.code)) || t; }
        catch (e) { detail = t; }
      }
    } catch (e) {}
    lastDetail = String(detail).replace(/[\r\n]+/g, " ").slice(0, 200);
    // 404 且仍有候选 → 尝试下一个；否则结束循环去抛最终错误（含已尝试模型列表）
    if (res.status === 404 && models && i < tries - 1) continue;
    break;
  }
  if (lastStatus === 404) {
    throw new Error("HTTP 404（Gemini 模型不存在）：已尝试 " + (models ? models.join(" / ") : "默认模型") +
      "。多为当前 Gemini Key 的免费层/区域未开放这些模型——请在该模块「模型」下拉改选「智谱 GLM（国内直连·免费）」或「硅基流动」即可联网生成（无需 VPN）；" +
      (lastDetail ? " 详情：" + lastDetail : ""));
  }
  if (lastStatus === 429) {
    throw new Error("HTTP 429（请求过于频繁 / 免费额度用尽）：当前模型接口已被限速。建议二选一——① 稍候 20~60 秒再点「生成」（免费 Gemini 限速很严，连点多会 429）；② 在「模型」下拉切换到另一个联网模型（Gemini↔OpenAI↔智谱 是各自独立的限速池，换一个即绕开）。" +
      (lastDetail ? " 详情：" + lastDetail : ""));
  }
  throw new Error("HTTP " + lastStatus + "（" + describeIntelHttpError(lastStatus) + "）" +
    (lastDetail ? "：<" + lastDetail + ">" : ""));
}

// 浏览器侧调用（测试用 stub fetch 注入，不触网）
async function callIntelLLM(providerId, apiKey, need) {
  var p = INTEL_PROVIDERS[providerId];
  if (!p) throw new Error("不支持的模型：" + providerId);
  apiKey = String(apiKey || "").trim();
  if (!apiKey) throw new Error("缺少 API Key");
  var headers = p.buildHeaders(apiKey);
  var body = p.buildBody(need, typeof today === "function" ? today() : "nodate");
  var res = await intelPost(p, apiKey, headers, body);
  var d = await res.json();
  var parsed = p.parse(d);
  var raw = parseIntelLLM(parsed.text);
  return buildIntelResult(raw, { need: need, provider: providerId, sources: parsed.sources, text: parsed.text, date: (typeof today === "function" ? today() : "nodate") });
}

// ---------- ④ 市场机会分析（六维框架 + 免费大模型）----------
// 提示词：要求模型按「市场规模 / 渗透率 / 增量空间 / 未被满足需求 / 蓝海机会 / 替代市场」六维输出结构化 JSON
function marketOpportunityPrompt(market, dateStr) {
  return "你是一名资深硬件产品市场机会分析师，服务于消费电子/便携硬件（折叠屏/便携充电/磁吸配件/美拍镜/补光灯/散热/AI硬件等）产品经理。\n" +
    "请针对以下市场，用六维框架做一份结构化的市场机会研究，全部用简体中文输出。\n\n" +
    "研究市场：" + (market || "") + "\n" +
    "今天是：" + (dateStr || "") + "\n\n" +
    "要求：\n" +
    "1. 只输出一个 JSON 对象，不要额外解释，结构严格如下：\n" +
    "{\n" +
    '  "summary": "执行摘要 3-5 句，概括市场吸引力与核心机会",\n' +
    '  "rating": "高 | 中 | 低（整体机会评级）",\n' +
    '  "ratingReason": "一句话评级理由",\n' +
    '  "scale": { "tam": "当前市场规模（含货币单位与地域口径）", "cagr": "历史与预测年复合增速", "segments": [ {"name":"细分市场","size":"规模","share":"占比","growth":"增速","stage":"导入/成长/成熟/衰退"} ], "drivers": [ {"factor":"驱动因素","impact":"高/中/低"} ] },\n' +
    '  "penetration": { "rate":"当前渗透率%","ceiling":"理论上限%","space":"剩余空间%","stage":"生命周期阶段","segments":[ {"group":"群体/区域/场景","rate":"渗透率%","gap":"与总体差距","potential":"高/中/低"} ] },\n' +
    '  "increment": { "stock":"存量规模","incremental":"增量规模","sources":[ {"source":"增量来源","size":"规模","share":"占比","growth":"增速"} ], "scenarios":[ {"name":"乐观/中性/保守","assumption":"关键假设","space":"增量空间","prob":"实现概率%"} ] },\n' +
    '  "unmet": { "needs":[ {"need":"需求点","satisfaction":"满足度 高/中/低","gap":"缺口 大/中/小","priority":"高/中/低"} ], "pains":[ {"pain":"用户痛点","impact":"高/中/低","universality":"高/中/低","solutionDifficulty":"高/中/低","opportunityValue":"高/中/低"} ], "trends":[ {"trend":"需求趋势","speed":"快/中/慢","potential":"高/中/低"} ] },\n' +
    '  "blueocean": { "redsea": {"competition":"激烈/中等/温和","priceWar":"高/中/低","profit":"高/中/低","diff":"差异化 高/中/低"}, "canvas":[ {"factor":"竞争要素","industry":"高/中/低","ours":"高/中/低","action":"提升/降低/消除/创造"} ], "opportunities":[ {"desc":"蓝海机会描述","target":"目标用户","value":"价值主张","feasibility":"高/中/低","score":5} ] },\n' +
    '  "substitution": { "direct":[ {"item":"替代品","degree":"高/中/低","threat":"高/中/低","trend":"上升/稳定/下降"} ], "adjacent":[ {"market":"相邻市场","relevance":"高/中/低","difficulty":"高/中/低","opportunity":"大/中/小"} ], "opportunities":[ {"desc":"替代市场机会","logic":"替代逻辑","advantage":"相对优势","size":"潜在规模"} ] },\n' +
    '  "findings": ["核心发现1（共 5-7 条，具体可落地）"],\n' +
    '  "suggestions": ["可落地建议1（共 3-5 条）"],\n' +
    '  "sources": [ {"title":"参考来源标题(联网检索到的真实网页)","url":"https://..."} ]\n' +
    "}\n" +
    "2. 数据尽量给出具体数值与口径；无确切数据可写估算/区间并标注（估）。\n" +
    "3. findings 与 suggestions 必须具体、可落地，避免空泛。\n" +
    "4. 聚焦与用户硬件产品组合（便携/折叠/磁吸/美拍/补光/散热）相关的机会与差异化切入点。\n" +
    "5. sources 必须是你通过联网检索找到的真实网页，给出 title 与可点击的 url；严禁编造链接；无可靠来源可留空数组。";
}

// 通用大模型调用：复用 provider 的 URL/Headers/Parse，但使用自定义提示词（用于市场机会六维分析）
// 浏览器侧 fetch；测试中用 stub fetch 注入，不触网。
async function callLLMForPrompt(providerId, apiKey, prompt) {
  var p = INTEL_PROVIDERS[providerId];
  if (!p) throw new Error("不支持的模型：" + providerId);
  if (typeof p.buildBodyForPrompt !== "function") throw new Error("该模型不支持自定义提示词");
  apiKey = String(apiKey || "").trim();
  if (!apiKey) throw new Error("缺少 API Key");
  var headers = p.buildHeaders(apiKey);
  var body = p.buildBodyForPrompt(prompt, typeof today === "function" ? today() : "nodate");
  var res = await intelPost(p, apiKey, headers, body);
  var d = await res.json();
  var parsed = p.parse(d);
  return { text: parsed.text, sources: parsed.sources || [] };
}

// 从模型文本稳健提取市场机会 JSON 对象（复用 JSON 提取器）
function parseMarketOpportunity(text) {
  if (text == null) throw new Error("模型返回为空");
  return parseIntelLLM(text);
}

// 把六维市场机会 JSON 规范化为统一结构（过滤空字段、补全默认值）
function buildMarketOpportunityResult(parsed, opts) {
  parsed = parsed || {};
  opts = opts || {};
  var arr = function (x) { return Array.isArray(x) ? x : []; };
  var str = function (x, d) { return x == null ? (d || "") : String(x); };
  var num = function (x) { var n = Number(x); return isNaN(n) ? null : n; };
  function dimSeg(list, keys) {
    return arr(list).filter(function (o) { return o && (o[keys.idx] || o[keys.idx2]); })
      .map(function (o) {
        var row = {}; keys.cols.forEach(function (c) { row[c] = str(o[c]); });
        return row;
      });
  }
  var dims = {
    scale: {
      tam: str(parsed.scale && parsed.scale.tam),
      cagr: str(parsed.scale && parsed.scale.cagr),
      segments: dimSeg(parsed.scale && parsed.scale.segments, { idx: "name", idx2: "name", cols: ["name", "size", "share", "growth", "stage"] }),
      drivers: dimSeg(parsed.scale && parsed.scale.drivers, { idx: "factor", idx2: "factor", cols: ["factor", "impact"] })
    },
    penetration: {
      rate: str(parsed.penetration && parsed.penetration.rate),
      ceiling: str(parsed.penetration && parsed.penetration.ceiling),
      space: str(parsed.penetration && parsed.penetration.space),
      stage: str(parsed.penetration && parsed.penetration.stage),
      segments: dimSeg(parsed.penetration && parsed.penetration.segments, { idx: "group", idx2: "group", cols: ["group", "rate", "gap", "potential"] })
    },
    increment: {
      stock: str(parsed.increment && parsed.increment.stock),
      incremental: str(parsed.increment && parsed.increment.incremental),
      sources: dimSeg(parsed.increment && parsed.increment.sources, { idx: "source", idx2: "source", cols: ["source", "size", "share", "growth"] }),
      scenarios: dimSeg(parsed.increment && parsed.increment.scenarios, { idx: "name", idx2: "name", cols: ["name", "assumption", "space", "prob"] })
    },
    unmet: {
      needs: dimSeg(parsed.unmet && parsed.unmet.needs, { idx: "need", idx2: "need", cols: ["need", "satisfaction", "gap", "priority"] }),
      pains: dimSeg(parsed.unmet && parsed.unmet.pains, { idx: "pain", idx2: "pain", cols: ["pain", "impact", "universality", "solutionDifficulty", "opportunityValue"] }),
      trends: dimSeg(parsed.unmet && parsed.unmet.trends, { idx: "trend", idx2: "trend", cols: ["trend", "speed", "potential"] })
    },
    blueocean: {
      redsea: (parsed.blueocean && parsed.blueocean.redsea) ? {
        competition: str(parsed.blueocean.redsea.competition), priceWar: str(parsed.blueocean.redsea.priceWar),
        profit: str(parsed.blueocean.redsea.profit), diff: str(parsed.blueocean.redsea.diff)
      } : {},
      canvas: dimSeg(parsed.blueocean && parsed.blueocean.canvas, { idx: "factor", idx2: "factor", cols: ["factor", "industry", "ours", "action"] }),
      opportunities: dimSeg(parsed.blueocean && parsed.blueocean.opportunities, { idx: "desc", idx2: "desc", cols: ["desc", "target", "value", "feasibility", "score"] })
        .map(function (o) { o.score = num(o.score); return o; })
    },
    substitution: {
      direct: dimSeg(parsed.substitution && parsed.substitution.direct, { idx: "item", idx2: "item", cols: ["item", "degree", "threat", "trend"] }),
      adjacent: dimSeg(parsed.substitution && parsed.substitution.adjacent, { idx: "market", idx2: "market", cols: ["market", "relevance", "difficulty", "opportunity"] }),
      opportunities: dimSeg(parsed.substitution && parsed.substitution.opportunities, { idx: "desc", idx2: "desc", cols: ["desc", "logic", "advantage", "size"] })
    }
  };
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
    id: (typeof uid === "function" ? uid() : "mo" + Math.random().toString(36).slice(2, 9)),
    market: str(opts.market),
    date: opts.date || (typeof today === "function" ? today() : "nodate"),
    createdAt: new Date().toISOString(),
    provider: opts.provider || "",
    summary: str(parsed.summary),
    rating: str(parsed.rating),
    ratingReason: str(parsed.ratingReason),
    dims: dims,
    findings: arr(parsed.findings).map(function (f) { return str(f); }).filter(function (f) { return f; }),
    suggestions: arr(parsed.suggestions).map(function (s) { return str(s); }).filter(function (s) { return s; }),
    sources: sources
  };
}

// ---------- API Key 配置（复用 recipes 的 localStorage 键，多模块共享） ----------
function loadAiConfig() {
  try { return JSON.parse((typeof localStorage !== "undefined" ? localStorage.getItem("hw_pm_ai_config") : null) || "{}"); }
  catch (e) { return {}; }
}
function saveAiConfig(cfg) {
  try { if (typeof localStorage !== "undefined") localStorage.setItem("hw_pm_ai_config", JSON.stringify(cfg || {})); } catch (e) {}
}
// 注：recipes.js 已定义同名 loadAiConfig/saveAiConfig（共享 localStorage 键 hw_pm_ai_config），
// 二者实现一致；intel.js 在 recipes.js 之后加载，此处定义会覆盖但行为相同，无需额外守卫。
