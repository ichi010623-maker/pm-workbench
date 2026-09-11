/* ===========================================================
 * Consumer Intelligence · 提取管线（单条内容 → 结构化事实）
 *
 * 关键约束：
 *  - 只处理「单条」内容，绝不产出任何计数
 *  - 提取结果必须通过 Schema 校验；校验失败 → 降级为全 unknown
 *  - 关闭联网检索（事实只能来自原文，不得由外部知识补充）
 *  - temperature = 0，保证同一输入结果稳定可复核
 * =========================================================== */

(function (root) {
  "use strict";

  var DEFAULT_PROVIDER = "gemini";

  /** 读取 AI 配置（复用行业情报的配置：hw_pm_ai_config）*/
  function ciAiConfig() {
    var cfg = {};
    try {
      if (typeof root.loadAiConfig === "function") cfg = root.loadAiConfig() || {};
      else cfg = JSON.parse(localStorage.getItem("hw_pm_ai_config") || "{}");
    } catch (e) { cfg = {}; }
    if (!cfg.provider) cfg.provider = DEFAULT_PROVIDER;
    return cfg;
  }

  /**
   * 构造提取请求体。
   * 与行业情报的 buildBodyForPrompt 不同：这里用「我们的」system prompt，
   * 且**不挂联网工具**（提取只能依据原文）。
   */
  function buildExtractionBody(provider, sys, user) {
    var pid = provider && provider.id;
    if (pid === "gemini") {
      return {
        contents: [{ role: "user", parts: [{ text: user }] }],
        systemInstruction: { parts: [{ text: sys }] },
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json"
        }
        // 注意：故意不加 tools.google_search —— 提取阶段禁止联网
      };
    }
    // OpenAI 兼容（openai / perplexity / 国内兼容端点）
    var body = {
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user }
      ],
      temperature: 0
    };
    if (provider && provider.models && provider.models.length) body.model = provider.models[0];
    else if (pid === "openai") body.model = "gpt-4o-mini";
    else if (pid === "perplexity") body.model = "sonar";
    return body;
  }

  /**
   * 提取单条内容。
   * @param {string} rawText  用户原始文本（唯一判断依据）
   * @param {object} meta     { platform, published_at } 仅用于标记，不作为判断依据
   * @returns {Promise<{ok:boolean, extraction:object, errors:string[], provider:string, raw:string}>}
   */
  async function ciExtractOne(rawText, meta) {
    var text = String(rawText == null ? "" : rawText).trim();
    if (!text) {
      return { ok: false, extraction: root.ciSafeFallback(), errors: ["原始内容为空"], provider: "", raw: "" };
    }

    var cfg = ciAiConfig();
    var pid = cfg.provider || DEFAULT_PROVIDER;
    var key = String(cfg.key || "").trim();
    var providers = root.INTEL_PROVIDERS || {};
    var p = providers[pid];

    if (!p) {
      return { ok: false, extraction: root.ciSafeFallback(), errors: ["不支持的模型：" + pid], provider: pid, raw: "" };
    }
    if (!key) {
      return { ok: false, extraction: root.ciSafeFallback(), errors: ["缺少 API Key（请在行业情报页配置一次，全局共用）"], provider: pid, raw: "" };
    }
    if (typeof root.intelPost !== "function") {
      return { ok: false, extraction: root.ciSafeFallback(), errors: ["LLM 客户端未加载"], provider: pid, raw: "" };
    }

    var msgs = root.ciBuildExtractionMessages(text, meta);
    var body = buildExtractionBody(p, msgs.system, msgs.user);
    var headers = p.buildHeaders(key);

    var res, raw = "";
    try {
      res = await root.intelPost(p, key, headers, body);
      var d = await res.json();
      var parsed = p.parse(d);
      raw = (parsed && parsed.text) || "";
    } catch (e) {
      return {
        ok: false,
        extraction: root.ciSafeFallback(),
        errors: ["调用失败：" + (e && e.message ? e.message : String(e))],
        provider: pid,
        raw: ""
      };
    }

    // 解析 + 校验
    var obj = root.ciParseJSON(raw);
    if (!obj) {
      return { ok: false, extraction: root.ciSafeFallback(), errors: ["返回内容不是合法 JSON"], provider: pid, raw: raw };
    }
    var v = root.ciValidateExtraction(obj);
    if (!v.ok) {
      return { ok: false, extraction: root.ciSafeFallback(), errors: v.errors, provider: pid, raw: raw };
    }
    return { ok: true, extraction: v.value, errors: [], provider: pid, raw: raw };
  }

  /**
   * 构造一条 evidence 记录（v2 结构）。
   * 元数据（平台/时间/用户）由管线提供，不属于 AI 判断结果。
   */
  function ciMakeRecord(rawText, meta, result) {
    meta = meta || {};
    var r = result || { ok: false, extraction: root.ciSafeFallback(), errors: [], provider: "" };
    return {
      id: meta.id || ("ev_" + Date.now() + "_" + Math.floor(Math.random() * 1000)),
      schema_version: 2,
      // —— 管线元数据（非 AI 判断）——
      source: meta.source || "other",
      publishDate: meta.publishDate || (typeof root.today === "function" ? root.today() : ""),
      user: meta.user || "匿名",
      // —— 原文（唯一判断依据）——
      rawText: String(rawText == null ? "" : rawText),
      // —— AI 提取结果 ——
      extracted: r.extraction,
      // —— 提取过程元信息（可复核）——
      extraction: {
        ok: !!r.ok,
        provider: r.provider || "",
        errors: r.errors || [],
        extractedAt: new Date().toISOString()
      }
    };
  }

  root.ciAiConfig = ciAiConfig;
  root.ciBuildExtractionBody = buildExtractionBody;
  root.ciExtractOne = ciExtractOne;
  root.ciMakeRecord = ciMakeRecord;

})(typeof globalThis !== "undefined" ? globalThis : this);
