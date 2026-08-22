// 同步超时护栏测试 (v5.8.80)
// 目标：锁定「Supabase / IndexedDB 请求必须带超时，绝不能无限 hang 导致白屏」这一修复。
// _withTimeout 实现与 js/app.js 中全局函数保持一致（防回归）。
const vm = require("vm");
const fs = require("fs");
const path = require("path");

// 从 app.js 抽取真实实现，避免测试与源码漂移
const src = fs.readFileSync(path.join(__dirname, "..", "js", "app.js"), "utf8");
const m = src.match(/function _withTimeout\([\s\S]*?\n}\n/);
if (!m) { console.error("无法从 app.js 抽取 _withTimeout，请检查命名"); process.exit(1); }
const code = m[0];

const ctx = { Promise: Promise, setTimeout: setTimeout, clearTimeout: clearTimeout, console: console, Error: Error };
vm.createContext(ctx);
vm.runInContext(code, ctx);

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name); } }

(async function () {
  // 1. 快速 resolve 的 promise 在超时前返回原值
  const fast = ctx._withTimeout(Promise.resolve("ok"), 200, "t1");
  const v1 = await fast;
  ok("快速 promise 返回原值", v1 === "ok");

  // 2. 慢 promise 在超时前未 settle → 必须 reject（白屏修复核心保证）
  let rejected = false, reason = "";
  try {
    await ctx._withTimeout(new Promise(function (res) { setTimeout(res, 400); }), 100, "t2");
  } catch (e) { rejected = true; reason = (e && e.message) || String(e); }
  ok("慢 promise 超时后 reject", rejected === true);
  ok("超时错误信息含 timeout 关键字", /timeout/i.test(reason));

  // 3. 已 reject 的 promise 透传错误，不被超时吞掉
  let caught = null;
  try {
    await ctx._withTimeout(Promise.reject(new Error("boom")), 300, "t3");
  } catch (e) { caught = e; }
  ok("reject 透传原错误", caught && caught.message === "boom");

  // 4. 超时后原 promise 后续 settle 不抛未捕获异常（done 守卫）
  let unhandled = false;
  process.on("unhandledRejection", function () { unhandled = true; });
  const slow = new Promise(function (res) { setTimeout(function () { res("late"); }, 300); });
  try { await ctx._withTimeout(slow, 80, "t4"); } catch (e) {}
  await new Promise(function (r) { setTimeout(r, 350); });
  ok("超时后无未捕获拒绝泄漏", unhandled === false);

  console.log("\n=== 同步超时护栏测试 ===");
  console.log("通过 " + pass + " / 失败 " + fail);
  if (fail > 0) process.exit(1);
})();
