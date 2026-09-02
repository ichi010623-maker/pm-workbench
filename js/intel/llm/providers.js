// ============================================================
// 行业情报 · llm/providers（AI Provider 注册表）
// 仅负责：8 个 provider 的 buildUrl/buildHeaders/buildBody/buildBodyForPrompt/parse
// 不修改 Provider 行为。
// 依赖：core（loadAiConfig），prompts（intelSystemPrompt）
//   依赖收敛（Sprint 1.5）：prompts.js 先于本文件加载（index.html 顺序固定），
//   故此处加载期一次性捕获 intelSystemPrompt 为局部 sysPrompt，
//   buildBody 内部不再每次运行时从 root 拉取（grep root.intelSystemPrompt = 0）。
// ============================================================
(function (root) {
  "use strict";

  // 加载期捕获 prompts.intelSystemPrompt（防御：若加载顺序异常则回退 need 原文）
  var sysPrompt = (typeof root.intelSystemPrompt === "function")
    ? root.intelSystemPrompt
    : function (need) { return need; };

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
            { role: "user", content: sysPrompt(need, dateStr) }
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

  // 下拉框 🌐 标记：该 provider 是否内置联网检索
  function intelProvBadge(k) {
    var p = root.INTEL_PROVIDERS[k];
    return (p && p.search) ? " 🌐" : "";
  }

  // ---------- 智谱联网检索 ----------
  function intelWebSearchEnabled() {
    try { var c = (typeof root.loadAiConfig === "function") ? root.loadAiConfig() : {}; return c.webSearch !== false; }
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

  // ---------- Provider 注册表 ----------
  var INTEL_PROVIDERS = {
    zhipu: openAiIntelProvider("https://open.bigmodel.cn/api/paas/v4/chat/completions", "glm-4-flash", "智谱 GLM-4-Flash（国内·永久免费）"),
    siliconflow: openAiIntelProvider("https://api.siliconflow.cn/v1/chat/completions", "Qwen/Qwen2.5-7B-Instruct", "硅基流动 SiliconFlow（国内·免费模型）"),
    gemini: {
      id: "gemini",
      name: "Google Gemini (免费·联网搜索)",
      search: true,
      endpoint: "https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent",
      models: ["gemini-2.5-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-2.5-pro", "gemini-3-flash-preview", "gemini-2.5-flash-lite"],
      buildUrl: function (k, mi) { return this.endpoint.replace("{MODEL}", this.models[(mi || 0)] || this.models[0]) + "?key=" + encodeURIComponent(k); },
      buildHeaders: function () { return { "Content-Type": "application/json" }; },
      buildBody: function (need, dateStr) {
        return {
          contents: [{ parts: [{ text: sysPrompt(need, dateStr) }] }],
          tools: [{ google_search: {} }]
        };
      },
      buildBodyForPrompt: function (prompt, dateStr) {
        return {
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }]
        };
      },
      parse: function (d) {
        var cand = d && d.candidates && d.candidates[0];
        if (!cand) return { text: "", sources: [] };
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
            { role: "user", content: sysPrompt(need, dateStr) }
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
      buildBody: function (need, dateStr) {
        return {
          model: "gpt-5-search-api",
          messages: [
            { role: "system", content: "你是硬件产品情报分析师，使用联网检索给出带引用的严谨简体中文简报。" },
            { role: "user", content: sysPrompt(need, dateStr) }
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
  // 修正 provider.id 为可读键
  INTEL_PROVIDERS.groq.id = "groq";
  INTEL_PROVIDERS.deepseek.id = "deepseek";
  INTEL_PROVIDERS.openrouter.id = "openrouter";
  INTEL_PROVIDERS.zhipu.id = "zhipu";
  INTEL_PROVIDERS.siliconflow.id = "siliconflow";

  // ---------- 覆盖智谱 provider：启用联网检索 + 来源解析 ----------
  INTEL_PROVIDERS.zhipu.buildBody = function (need, dateStr) {
    return zhipuBodyWithSearch([
      { role: "system", content: "你是硬件产品情报分析师，使用联网检索作答，输出严谨简体中文；关键数据尽量给出可点击的来源网页链接。" },
      { role: "user", content: sysPrompt(need, dateStr) }
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
    return { text: text, sources: [] };
  };
  INTEL_PROVIDERS.zhipu.search = true;

  root.INTEL_PROVIDERS = INTEL_PROVIDERS;
  root.openAiIntelProvider = openAiIntelProvider;
  root.intelProvBadge = intelProvBadge;
  root.intelWebSearchEnabled = intelWebSearchEnabled;
  root.zhipuBodyWithSearch = zhipuBodyWithSearch;
  root.intelExtractTextLinks = intelExtractTextLinks;
})(typeof globalThis !== "undefined" ? globalThis : this);