// sw.js 结构回归测试
// 背景：历史版本误把 v5.9.147「禁用模式」代码块叠加在旧的「离线壳」代码之上，
// 残留了孤立的 `}).then(...)` 片段 + 重复的 install/activate/fetch 监听器，
// 使 sw.js 语法错误 → navigator.serviceWorker.register() 直接失败 →
// 旧 SW 永久接管并持续 serve 老缓存（「页面改了看不到」的根因）。
// 本测试锁死结构契约，防止再次回归。
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const src = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");

let ok = true;
const chk = (cond, label) => { console.log((cond ? "  ✅ " : "  ❌ ") + label); if (!cond) ok = false; };

console.log("【sw.js 语法】");
let parsed = true;
try { new vm.Script(src, { filename: "sw.js" }); } catch (e) { parsed = false; console.log("    " + e.message); }
chk(parsed, "可被 JS 引擎解析（无语法错误）");

console.log("【监听器唯一性】");
["install", "activate", "fetch", "message", "push", "notificationclick"].forEach((ev) => {
  const re = new RegExp('self\\.addEventListener\\(["\']' + ev + '["\']', "g");
  const n = (src.match(re) || []).length;
  chk(n === 1, `self.addEventListener("${ev}") 恰好 1 个（实际 ${n}）`);
});

console.log("【禁用模式残留】");
chk(!/unregister\(\)/.test(src), "不含 self.registration.unregister()（避免与 app.js SWManager 自愈逻辑互斥）");
chk(!/v5\.9\.147 DISABLE/.test(src), "不含 DISABLE 残留注释块");

console.log("【关键行为契约】");
chk(/SW_UPDATED/.test(src), "activate 后会 postMessage(\"SW_UPDATED\")（app.js SWManager 依赖）");
chk(/SKIP_WAITING/.test(src), "支持 SKIP_WAITING 消息（更新条「立即刷新」依赖）");
chk(/networkFirst/.test(src), "首页/静态资源走 network-first（保证拿到最新）");
chk(/reset=1/.test(src), "支持 ?reset=1 强制绕过缓存（手机端自救路径）");
chk(/NETWORK_TIMEOUT_MS/.test(src), "弱网超时回退缓存（避免白屏）");
chk(/caches\.delete/.test(src), "activate 清理旧版本缓存");

console.log("【版本号一致性】");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const appjs = fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8");
const vHtml = (html.match(/<title>[^<]*v(\d+\.\d+\.\d+)<\/title>/) || [])[1];
const vApp = (appjs.match(/APP_VERSION\s*=\s*"(\d+\.\d+\.\d+)"/) || [])[1];
const vSw = (src.match(/CACHE_VERSION\s*=\s*"v(\d+\.\d+\.\d+)"/) || [])[1];
chk(!!vHtml && vHtml === vApp && vHtml === vSw, `index.html / app.js / sw.js 版本一致（${vHtml} / ${vApp} / ${vSw}）`);

console.log(ok ? "\n🎉 全部通过" : "\n⚠️ 存在失败项");
process.exit(ok ? 0 : 1);
