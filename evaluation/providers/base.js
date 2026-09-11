// Consumer Insight Evaluation · Provider 基类
// 统一接口：{ complete(systemPrompt, userPrompt, opts) -> Promise<{text, model, provider, latency_ms, raw?}> }
// 不做任何硬编码 URL；子类各自实现网络层。
"use strict";

function errResult(provider, message, extra) {
  return {
    ok: false,
    provider: provider,
    text: "",
    model: "",
    latency_ms: 0,
    error: message,
    raw: extra && extra.raw || null
  };
}

function okResult(provider, text, model, latency_ms, raw) {
  return {
    ok: true,
    provider: provider,
    text: text || "",
    model: model || "",
    latency_ms: latency_ms || 0,
    raw: raw || null
  };
}

async function timed(fn) {
  var t0 = Date.now();
  var out;
  try {
    out = await fn();
    return Object.assign({}, out, { latency_ms: Date.now() - t0 });
  } catch (e) {
    return Object.assign(errResult("unknown", "网络/解析异常: " + (e && e.message || e)), { latency_ms: Date.now() - t0 });
  }
}

module.exports = { errResult, okResult, timed };
