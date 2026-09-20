#!/usr/bin/env node
// 测试：sw.js PRECACHE_URLS 与 js/language.js lgPrecacheReading urls 列表必须同步
// + 三个列表源必须齐全（保证新刊/新分类不会被遗忘）。
//
// 校验内容：
//   1. sw.js PRECACHE_URLS 数组含 data/lang_read_mag*.json / data/lang_read_ted*.json
//      数量与 data/ 实际分册数量一致
//   2. lgPrecacheReading urls 数组含 [key, url] 对，key 与 url 同步
//   3. 两个数组的 data/lang_read_* 数量一致（sw 含 url + 索引，lg 含 key + url）
//   4. data/lang_read_mag.json 的 mags[].key 与 data/lang_read_ted.json 的 groups[].key
//      必须全部被两个数组覆盖
//
// 退出码：0 = 通过；非 0 = 失败。

"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
function load(p) { return JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8")); }

const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
const lg = fs.readFileSync(path.join(ROOT, "js", "language.js"), "utf8");

// 1. 提取 sw.js PRECACHE_URLS
const mSw = sw.match(/const\s+PRECACHE_URLS\s*=\s*\[([\s\S]*?)\]\s*;/);
if (!mSw) { console.error("FAIL: sw.js 没有 PRECACHE_URLS 数组"); process.exit(1); }
const swUrls = mSw[1].split(/\n/).map(s => {
  const tm = s.match(/["']([^"']+)["']/);
  return tm ? tm[1] : null;
}).filter(Boolean);

// 2. 提取 lgPrecacheReading urls
const mLg = lg.match(/var\s+LG_READING_PRECACHE_URLS\s*=\s*\[([\s\S]*?)\]\s*;/);
if (!mLg) { console.error("FAIL: js/language.js 没有 LG_READING_PRECACHE_URLS 数组"); process.exit(1); }
const lgPairs = [];
mLg[1].split(/\n/).forEach(line => {
  const tm = line.match(/\[\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']\s*\]/);
  if (tm) lgPairs.push([tm[1], tm[2]]);
});

const swData = swUrls.filter(u => u.includes("lang_read_"));
const lgData = lgPairs.filter(p => p[1].includes("lang_read_"));

let pass = 0, fail = 0;
function assert(name, cond, extra) {
  if (cond) { console.log("  ✅", name); pass++; }
  else { console.log("  ❌", name, extra || ""); fail++; }
}

// 3. data 文件实际存在
const mag = load("data/lang_read_mag.json");
const ted = load("data/lang_read_ted.json");
const magKeys = (mag.mags || []).map(m => m.key);
const tedKeys = (ted.groups || []).map(g => g.key);

assert("mag 索引有 mags 数组", Array.isArray(mag.mags) && mag.mags.length > 0, "keys=" + magKeys.join(","));
assert("ted 索引有 groups 数组", Array.isArray(ted.groups) && ted.groups.length >= 8, "keys=" + tedKeys.join(","));

// 4. sw.js 必须 precache 全部数据文件
magKeys.forEach(k => {
  const u = "./data/lang_read_mag_" + k + ".json";
  assert("sw precache 含 " + u, swUrls.includes(u));
});
assert("sw precache 含 mag 索引", swUrls.includes("./data/lang_read_mag.json"));
tedKeys.forEach(k => {
  const u = "./data/lang_read_ted_" + k + ".json";
  assert("sw precache 含 " + u, swUrls.includes(u));
});
assert("sw precache 含 ted 索引", swUrls.includes("./data/lang_read_ted.json"));

// 5. lgPrecacheReading 必须 prefetch 全部数据文件
magKeys.forEach(k => {
  const want = "data/lang_read_mag_" + k + ".json";
  assert("lg prefetch 含 " + want, lgPairs.some(p => p[1] === want));
});
tedKeys.forEach(k => {
  const want = "data/lang_read_ted_" + k + ".json";
  assert("lg prefetch 含 " + want, lgPairs.some(p => p[1] === want));
});

// 6. sw 与 lg 的 data/ 数量必须一致（防一手漏写）
assert("sw/lg data/ 数量一致", swData.length === lgData.length, "sw=" + swData.length + " lg=" + lgData.length);

// 7. sw 与 lg 的 lang_read_ 文件集必须完全相等（去前缀比）
const swSet = new Set(swData.map(u => u.replace(/^\.\//, "")));
const lgSet = new Set(lgData.map(p => p[1]));
assert("sw 与 lg 文件集相等",
  swSet.size === lgSet.size && [...swSet].every(u => lgSet.has(u)),
  "sw 独有=" + [...swSet].filter(u => !lgSet.has(u)).join(",") +
  " lg 独有=" + [...lgSet].filter(u => !swSet.has(u)).join(","));

// 8. sw.js 不能多于 data/ 实际分册数量（防留旧 key）
assert("sw precache 不多于 data/ 实际分册",
  swData.length === magKeys.length + tedKeys.length + 2,
  "sw=" + swData.length + " expected=" + (magKeys.length + tedKeys.length + 2));

console.log("----");
console.log(fail === 0 ? "✅ 全部通过 —— 断言 " + pass + " 条" : "❌ 失败 " + fail + " / 通过 " + pass);
process.exit(fail === 0 ? 0 : 1);
