// 云端 LLM 客户端：智谱 GLM-4-Flash（永久免费，带联网检索）
// 仅依赖全局 fetch（Node 18+），无第三方包。
const ZHIPU_EP = "https://open.bigmodel.cn/api/paas/v4/chat/completions";

function getKey() {
  const k = process.env.ZHIPU_API_KEY || process.env.GLM_API_KEY;
  if (!k) throw new Error("缺少环境变量 ZHIPU_API_KEY（智谱 GLM-4-Flash 免费 Key）");
  return k;
}

/**
 * 调用 GLM-4-Flash，开启联网检索，要求返回严格 JSON。
 * @param {string} system 系统提示
 * @param {string} user 用户提示
 * @param {object} opts {temperature, maxTokens, retry}
 * @returns {any} 解析后的 JSON 对象/数组
 */
async function chatJSON(system, user, opts = {}) {
  const key = getKey();
  const temperature = opts.temperature ?? 0.7;
  const maxTokens = opts.maxTokens ?? 4096;
  const retries = opts.retry ?? 2;
  const webSearch = opts.webSearch ?? false; // 仅资讯需要实时检索；知识卡为常青事实，关闭以免响应过大

  const body = {
    model: "glm-4-flash",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    temperature,
    max_tokens: maxTokens
  };

  // 联网检索：仅资讯类需要（保证真实新闻）；格式对齐 app.js intel.js 的智谱联网调用
  if (webSearch) {
    body.tools = [{ type: "web_search", web_search: { enable: "True", search_engine: "search_std", search_result: "True", count: "5" } }];
    body.tool_choice = "auto";
  }
  body.response_format = { type: "json_object" };

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await fetch(ZHIPU_EP, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + key
        },
        body: JSON.stringify(body)
      });
      if (!r.ok) {
        const txt = await r.text();
        throw new Error("HTTP " + r.status + " " + txt.slice(0, 200));
      }
      const j = await r.json();
      const msg = j.choices?.[0]?.message || {};
      let content = msg.content || "";
      // GLM 可能把 JSON 放在 tool_calls arguments 里
      if ((!content || !content.trim()) && msg.tool_calls && msg.tool_calls[0]?.function?.arguments) {
        content = msg.tool_calls[0].function.arguments;
      }
      let raw = content;
      // 容错1：模型常把结果包在 {answer:"...json..."} 里
      try {
        const wrap = JSON.parse(raw);
        if (wrap && typeof wrap.answer === "string") raw = wrap.answer;
        else if (wrap && typeof wrap.answer === "object") raw = JSON.stringify(wrap.answer);
      } catch (_) {}
      // 容错2：剥离 ```json 围栏
      raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      // 容错3：截取首尾花括号（忽略前后多余文本）
      const s = raw.indexOf("{");
      const e = raw.lastIndexOf("}");
      if (s >= 0 && e > s) raw = raw.slice(s, e + 1);
      return JSON.parse(raw);
    } catch (e) {
      if (attempt === retries) throw e;
      await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
    }
  }
}

module.exports = { chatJSON, getKey };
