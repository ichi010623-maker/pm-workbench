#!/usr/bin/env node
/**
 * 生成精读素材的 precache URL 列表
 *
 * 用途：保持 sw.js PRECACHE_URLS 与 js/language.js lgPrecacheReading 列表同步，
 *      避免新增外刊/TED 分组时遗漏一处导致 SW 缓存不全。
 *
 * 行为：
 *   - 扫描 data/lang_read_mag.json 的 mags[].key → 4 个外刊分册
 *   - 扫描 data/lang_read_ted.json 的 groups[].key → 8 个 TED 分组
 *   - 输出 JS 数组片段到 stdout，可直接拼到 sw.js / lgPrecacheReading 中
 *
 * 用法：
 *   node scripts/build_reading_precache.js sw
 *     → 输出 sw.js 的 PRECACHE_URLS 数组片段（含 "./" 前缀）
 *   node scripts/build_reading_precache.js lg
 *     → 输出 js/language.js lgPrecacheReading 的 urls 数组片段（"data/" 前缀）
 *   node scripts/build_reading_precache.js both
 *     → 同时输出两份（按 sw / lg 顺序，--dry-run 不写文件）
 *
 * 扩展：
 *   - 新增外刊刊：往 fetch_magazines.js 的 MAGS 数组加 key 即可，data/lang_read_mag.json 自动多一篇 issue
 *   - 新增 TED 分类：往 fetch_ted.js 的 CATS 加 key + 在 TED_TOPICS 加 slug 映射即可
 *   - 重新跑本脚本 + 同步更新 sw.js 与 language.js
 */
"use strict";
const fs = require("fs");
const path = require("path");

const BASE = path.resolve(__dirname, "..");
const MODE = (process.argv[2] || "sw").toLowerCase();

const mag = JSON.parse(fs.readFileSync(path.join(BASE, "data", "lang_read_mag.json"), "utf8"));
const ted = JSON.parse(fs.readFileSync(path.join(BASE, "data", "lang_read_ted.json"), "utf8"));

const magKeys = (mag.mags || []).map((m) => m.key);
const tedGroups = (ted.groups || []).map((g) => g.key);

if (!magKeys.length) { console.error("[precache] data/lang_read_mag.json 无 mags"); process.exit(1); }
if (!tedGroups.length) { console.error("[precache] data/lang_read_ted.json 无 groups"); process.exit(1); }

const swUrls = [
  "./manifest.json",
  "./index.html",
  "./css/style.v5.9.156.css",
  "./js/app.js",
  "./js/language.js",
  "./data/lang_read_mag.json",
  ...magKeys.map((k) => `./data/lang_read_mag_${k}.json`),
  "./data/lang_read_ted.json",
  ...tedGroups.map((g) => `./data/lang_read_ted_${g}.json`)
];

const lgUrls = [
  ["mag:idx", "data/lang_read_mag.json"],
  ...magKeys.map((k) => [`mag:body:${k}`, `data/lang_read_mag_${k}.json`]),
  ["ted:idx", "data/lang_read_ted.json"],
  ...tedGroups.map((g) => [`ted:body:${g}`, `data/lang_read_ted_${g}.json`])
];

function emitSw() {
  return swUrls.map((u) => `  "${u}"`).join(",\n");
}
function emitLg() {
  return lgUrls.map(([k, u]) => `    ["${k}", "${u}"]`).join(",\n");
}

if (MODE === "sw") {
  process.stdout.write(emitSw() + "\n");
} else if (MODE === "lg") {
  process.stdout.write(emitLg() + "\n");
} else if (MODE === "both" || MODE === "all") {
  console.log("=== sw.js PRECACHE_URLS ===");
  console.log(emitSw());
  console.log("=== js/language.js lgPrecacheReading urls ===");
  console.log(emitLg());
} else {
  console.error("用法: node scripts/build_reading_precache.js <sw|lg|both>");
  process.exit(2);
}

// 校验：swUrls 与 lgUrls 数量+路径对齐（防 sw 和 lg 各自漏写一个）
const swDataCount = swUrls.filter((u) => u.startsWith("./data/lang_read_")).length;
const lgDataCount = lgUrls.length;
if (MODE === "both" && swDataCount !== lgDataCount) {
  console.error(`[precache] 数量不一致 sw=${swDataCount} lg=${lgDataCount}`);
  process.exit(3);
}
