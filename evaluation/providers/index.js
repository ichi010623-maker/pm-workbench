// Consumer Insight Evaluation · Provider 注册表
"use strict";

var MockProvider = require("./mock");
var ZhipuProvider = require("./zhipu");
var OpenAIProvider = require("./openai");

var REGISTRY = {
  mock: {
    name: "Mock Provider (deterministic, no network)",
    factory: function (opts) { return new MockProvider(opts); },
    requiresNetwork: false
  },
  zhipu: {
    name: "智谱 GLM-4-Flash（国内·永久免费）",
    factory: function (opts) { return new ZhipuProvider(opts); },
    requiresNetwork: true
  },
  openai: {
    name: "OpenAI 兼容端点",
    factory: function (opts) { return new OpenAIProvider(opts); },
    requiresNetwork: true
  }
};

function listProviders() {
  return Object.keys(REGISTRY).map(function (k) {
    return { id: k, name: REGISTRY[k].name, requiresNetwork: REGISTRY[k].requiresNetwork };
  });
}

function getProvider(id, opts) {
  var entry = REGISTRY[id];
  if (!entry) {
    var available = Object.keys(REGISTRY).join(", ");
    throw new Error("未知 provider: " + id + "。可用: " + available);
  }
  return entry.factory(opts || {});
}

module.exports = { listProviders: listProviders, getProvider: getProvider };
