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

  const body = {
    model: "glm-4-flash",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    temperature,
    max_tokens: maxTokens,
    // 联网检索：保证资讯/知识卡基于真实信息（格式对齐 app.js 中 intel.js 的智谱联网调用）
    tools: [{ type: "web_search", web_search: { enable: "True", search_engine: "search_std", search_result: "True", count: "5" } }],
    tool_choice: "auto",
    response_format: { type: "json_object" }
  };

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
      const content = j.choices?.[0]?.message?.content || "";
      // 容错：模型可能包裹 ```json
      const cleaned = content.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
      return JSON.parse(cleaned);
    } catch (e) {
      if (attempt === retries) throw e;
      await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
    }
  }
}

module.exports = { chatJSON, getKey };
