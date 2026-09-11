// Consumer Insight Evaluation · OpenAI Provider
// OpenAI 兼容端点（可指向 OpenRouter、自建代理等）。
// temperature=0，不联网。
"use strict";

var base = require("./base");

function OpenAIProvider(opts) {
  this.id = "openai";
  this.name = "OpenAI 兼容端点";
  this.opts = opts || {};
  this.endpoint = (opts && opts.endpoint) || "https://api.openai.com/v1/chat/completions";
  this.model = (opts && opts.model) || "gpt-4o-mini";
  this.apiKey = (opts && opts.apiKey) || process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY || "";
}

OpenAIProvider.prototype.health = function () {
  return {
    ok: !!this.apiKey,
    provider: this.id,
    model: this.model,
    endpoint: this.endpoint,
    requiresNetwork: true,
    error: this.apiKey ? null : "缺少 OPENAI_API_KEY / OPENROUTER_API_KEY"
  };
};

OpenAIProvider.prototype.complete = async function (systemPrompt, userPrompt, opts) {
  if (!this.apiKey) return base.errResult(this.id, "缺少 API Key");

  var body = {
    model: this.model,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ]
  };

  return base.timed(async function () {
    var resp = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + this.apiKey
      },
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      var errText = await resp.text();
      return base.errResult(this.id, "HTTP " + resp.status + ": " + errText.slice(0, 200));
    }
    var data = await resp.json();
    var text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    return base.okResult(this.id, text || "", this.model, 0, data);
  }.bind(this));
};

module.exports = OpenAIProvider;
