#!/usr/bin/env node
// bump_version.js —— 一致性版本号升级（取代 sed -i）
// 用法：node cloud/bump_version.js <新版本号，如 5.9.139>
// 规则：
//   · index.html: <title> + 所有 ?v=5.9.x
//   · js/app.js:  APP_VERSION = "5.9.x"
//   · sw.js:      CACHE_VERSION = "v5.9.x"
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const newVer = process.argv[2];
if (!newVer || !/^\d+\.\d+\.\d+$/.test(newVer)) {
  console.error("用法: node cloud/bump_version.js <版本号，如 5.9.139>");
  process.exit(1);
}
const oldVer = (function () {
  try {
    const t = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    const m = t.match(/<title>[^<]*v(\d+\.\d+\.\d+)<\/title>/);
    return m ? m[1] : null;
  } catch (e) { return null; }
})();
if (!oldVer) { console.error("未能从 index.html 提取当前版本号"); process.exit(1); }
if (oldVer === newVer) { console.log("已是最新 " + newVer + "，跳过"); process.exit(0); }
console.log("升级版本: " + oldVer + " → " + newVer);

const edits = [];

// index.html: 标题 + 所有 ?v= 引用
{
  const p = path.join(ROOT, "index.html");
  let t = fs.readFileSync(p, "utf8");
  const before = t;
  t = t.split("<title>硬件PM工作台 v" + oldVer + "</title>").join("<title>硬件PM工作台 v" + newVer + "</title>");
  const re = new RegExp("(\\?v=)" + oldVer.replace(/\./g, "\\."), "g");
  const m = t.match(re);
  t = t.replace(re, "$1" + newVer);
  if (t !== before) { fs.writeFileSync(p, t); edits.push("index.html: " + (m ? m.length : 0) + " 处 ?v= + 标题"); }
}

// js/app.js
{
  const p = path.join(ROOT, "js/app.js");
  let t = fs.readFileSync(p, "utf8");
  const before = t;
  t = t.replace(/(APP_VERSION\s*=\s*")\d+\.\d+\.\d+(")/, "$1" + newVer + "$2");
  if (t !== before) { fs.writeFileSync(p, t); edits.push("js/app.js: APP_VERSION"); }
}

// sw.js
{
  const p = path.join(ROOT, "sw.js");
  let t = fs.readFileSync(p, "utf8");
  const before = t;
  t = t.replace(/(CACHE_VERSION\s*=\s*"v)\d+\.\d+\.\d+(")/, "$1" + newVer + "$2");
  if (t !== before) { fs.writeFileSync(p, t); edits.push("sw.js: CACHE_VERSION"); }
}

console.log(edits.join("\n"));
console.log("✅ 升级完成 v" + newVer);