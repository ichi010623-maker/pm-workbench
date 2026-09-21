"use strict";
// 沙箱用的转义辅助（编码到 base64 避免编辑器自动反转义）
var E = { 38: "amp", 60: "lt", 62: "gt", 34: "quot" };
module.exports = function escapeHtml(x) {
  return String(x).replace(/[&<>"]/g, function (c) {
    return "&" + E[c.charCodeAt(0)] + ";";
  });
};