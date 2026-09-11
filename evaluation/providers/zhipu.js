// Consumer Insight Evaluation · Zhipu Provider (国内·永久免费)
// Endpoint: https://open.bigmodel.cn/api/paas/v4/chat/completions
// Model: glm-4-flash
// 严禁传 tools（不允许联网搜索），temperature=0 用于确定性。
"use strict";

var base = require("./base");

var ENDPOINT = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
var DEFAULT_MODEL = "glm-4-flash";

function ZhipuProvider(opts) {
  this.id = "zhipu";
  this.name = "智谱 GLM-4-Flash（国内·永久免费）";
  this.opts = opts || {};
  this.model = (opts && opts.model) || DEFAULT_MODEL;
  this.apiKey = (opts && opts.apiKey) || process.env.ZHIPU_API_KEY || "";
  this.maxRetries = (opts && opts.maxRetries) || 2;
  this.retryDelayMs = (opts && opts.retryDelayMs) || 500;
}

ZhipuProvider.prototype.health = function () {
  return {
    ok: !!this.apiKey,
    provider: this.id,
    model: this.model,
    requiresNetwork: true,
    error: this.apiKey ? null : "缺少 ZHIPU_API_KEY（请在 cloud/local.env 配置）"
  };
};

ZhipuProvider.prototype.complete = async function (systemPrompt, userPrompt, opts) {
  if (!this.apiKey) return base.errResult(this.id, "缺少 ZHIPU_API_KEY");

  var body = {
    model: this.model,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ]
  };

  // 故意不传 tools（不允许联网搜索，与 extract.js 保持一致）

  for (var attempt = 0; attempt <= this.maxRetries; attempt++) {
    var r = await base.timed(async function () {
      var resp = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + this.apiKey
        },
        body: JSON.stringify(body)
      });
      if (!resp.ok) {
        var errText = await resp.text();
        return base.errResult("zhipu", "HTTP " + resp.status + ": " + errText.slice(0, 200));
      }
      var data = await resp.json();
      var text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      return base.okResult("zhipu", text || "", this.model, 0, data);
    }.bind(this));

    if (r.ok) return r;
    if (attempt < this.maxRetries) await new Promise(function (resolve) { setTimeout(resolve, this.retryDelayMs); }.bind(this));
    else return r;
  }
};

module.exports = ZhipuProvider;
