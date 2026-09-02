// ============================================================
// 行业情报 · llm/client（AI 请求编排：POST + 404/429 重试 + 端到端调用）
// 依赖：providers（INTEL_PROVIDERS），parser（parseIntelLLM / buildIntelResult）
//       外部 today() / fetch（沙箱注入）
// ============================================================
(function (root) {
  "use strict";

  // HTTP 状态码 → 用户可读的中文原因
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
  // 遇到 429「请求过于频繁」时，对同一模型做至多 2 次退避重试（2s / 4s）。
  async function intelPost(p, apiKey, headers, body) {
    var models = p.models || null;
    var tries = models ? models.length : 1;
    var lastDetail = "";
    var lastStatus = 0;
    for (var i = 0; i < tries; i++) {
      var url = models ? p.buildUrl(apiKey, i) : p.buildUrl(apiKey);
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
      var detail = "";
      try {
        var t = await res.text();
        if (t) {
          try { var j = JSON.parse(t); detail = (j.error && (j.error.message || j.error.code)) || t; }
          catch (e) { detail = t; }
        }
      } catch (e) {}
      lastDetail = String(detail).replace(/[\r\n]+/g, " ").slice(0, 200);
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

  // 端到端：provider + apiKey + need → 解析后的标准结果
  async function callIntelLLM(providerId, apiKey, need) {
    var p = root.INTEL_PROVIDERS[providerId];
    if (!p) throw new Error("不支持的模型：" + providerId);
    apiKey = String(apiKey || "").trim();
    if (!apiKey) throw new Error("缺少 API Key");
    var headers = p.buildHeaders(apiKey);
    var body = p.buildBody(need, typeof today === "function" ? today() : "nodate");
    var res = await intelPost(p, apiKey, headers, body);
    var d = await res.json();
    var parsed = p.parse(d);
    var raw = root.parseIntelLLM(parsed.text);
    return root.buildIntelResult(raw, { need: need, provider: providerId, sources: parsed.sources, text: parsed.text, date: (typeof today === "function" ? today() : "nodate") });
  }

  // 端到端：provider + apiKey + 自定义提示词 → 模型原文 + 来源
  async function callLLMForPrompt(providerId, apiKey, prompt) {
    var p = root.INTEL_PROVIDERS[providerId];
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

  root.describeIntelHttpError = describeIntelHttpError;
  root.intelSleep = intelSleep;
  root.intelPost = intelPost;
  root.callIntelLLM = callIntelLLM;
  root.callLLMForPrompt = callLLMForPrompt;
})(typeof globalThis !== "undefined" ? globalThis : this);