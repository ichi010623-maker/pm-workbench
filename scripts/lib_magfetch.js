#!/usr/bin/env node
/**
 * lib_magfetch.js —— 外刊抓取公用的网络层
 *
 * 关键约定（踩坑记录）：
 * 1. Node 的 fetch 默认不走系统代理，可直连 raw.githubusercontent.com / api.github.com，
 *    在 ClashX 抖动时反而更稳（见项目记忆「网络」一节）。
 * 2. 下载必须「整文件校验后再落盘」：先写 .part，校验 zip 魔数 + 字节数，
 *    全部通过才 rename。**禁止使用断点续传**——9/20 因为把 GitHub 的 HTML
 *    错误页当成半成品续传，产出的 epub 前半段是 HTML，zip 本地头全部错位。
 * 3. 仓库默认分支是 `master`（不是 main），写错会拿到 404 的 HTML。
 */
const fs = require("fs");
const path = require("path");
const { looksLikeZip } = require("./lib_epub");

const RAW = "https://raw.githubusercontent.com/";
const API = "https://api.github.com/repos/";

async function ghJSON(url, tries) {
  tries = tries || 3;
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": "pm-workbench-magfetch", Accept: "application/vnd.github+json" }
      });
      if (r.status === 403 || r.status === 429) throw new Error("GitHub 限流 " + r.status);
      if (!r.ok) throw new Error("HTTP " + r.status + " " + url);
      return await r.json();
    } catch (e) {
      lastErr = e;
      await new Promise(function (s) { setTimeout(s, 1500 * (i + 1)); });
    }
  }
  throw lastErr;
}

/** 列出仓库目录（type=dir 的子目录 / 文件名 + size） */
async function ghList(repo, dir, ref) {
  const url = API + repo + "/contents/" + dir.replace(/^\/+/, "") + "?ref=" + (ref || "master");
  const j = await ghJSON(url);
  if (!Array.isArray(j)) throw new Error("目录不存在或非目录: " + dir);
  return j.map(function (x) { return { name: x.name, type: x.type, size: x.size, path: x.path }; });
}

/** 目录不存在时返回 []，用于探测新一期 */
async function ghListSafe(repo, dir, ref) {
  try { return await ghList(repo, dir, ref); } catch (_) { return []; }
}

const CHUNK = 1048576; // 1MB —— 单连接拉几十 MB 会被沙箱掐掉（SIGKILL 137），必须分块

/** 分块拉取到 Buffer。每块校验长度，失败重试单块。 */
async function fetchChunked(url, total, chunkSize) {
  const ck = chunkSize || CHUNK;
  const parts = [];
  let got = 0;
  while (got < total) {
    const end = Math.min(got + ck - 1, total - 1);
    let lastErr;
    let piece = null;
    for (let t = 0; t < 5; t++) {
      try {
        const r = await fetch(url, {
          headers: { "User-Agent": "pm-workbench-magfetch", Range: "bytes=" + got + "-" + end }
        });
        if (r.status !== 206 && r.status !== 200) throw new Error("HTTP " + r.status);
        const b = Buffer.from(await r.arrayBuffer());
        if (b.length !== end - got + 1) throw new Error("分块长度不符 " + b.length + " != " + (end - got + 1));
        piece = b; break;
      } catch (e) {
        lastErr = e;
        await new Promise(function (s) { setTimeout(s, 800 * (t + 1)); });
      }
    }
    if (!piece) throw lastErr || new Error("分块下载失败 @" + got);
    parts.push(piece);
    got = end + 1;
  }
  return Buffer.concat(parts, total);
}

/**
 * 下载并校验落盘。opts: {expectSize, expectZip, chunkSize}
 * 分块策略下 expectSize 变成必需项（否则不知道要拉多少），缺失时退回整文件拉取。
 */
async function downloadVerify(url, dest, opts) {
  opts = opts || {};
  const part = dest + ".part";
  try { fs.unlinkSync(part); } catch (_) {}

  let buf;
  if (opts.expectSize) {
    buf = await fetchChunked(url, opts.expectSize, opts.chunkSize);
  } else {
    const r = await fetch(url, { headers: { "User-Agent": "pm-workbench-magfetch" } });
    if (!r.ok) throw new Error("下载失败 HTTP " + r.status);
    buf = Buffer.from(await r.arrayBuffer());
  }

  if (opts.expectSize && buf.length !== opts.expectSize) {
    throw new Error("字节数不符 got=" + buf.length + " want=" + opts.expectSize);
  }
  if (opts.expectZip !== false && !looksLikeZip(buf)) {
    throw new Error("不是有效 zip/epub（下到的可能是 HTML 错误页）");
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(part, buf);
  fs.renameSync(part, dest);
  return { ok: true, size: buf.length, path: dest };
}

/** 逐次重试的下载 */
async function downloadRetry(url, dest, opts, tries) {
  tries = tries || 4;
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try { return await downloadVerify(url, dest, opts); }
    catch (e) {
      lastErr = e;
      await new Promise(function (s) { setTimeout(s, 2000 * (i + 1)); });
    }
  }
  throw lastErr;
}

function rawUrl(repo, filePath, ref) {
  return RAW + repo + "/" + (ref || "master") + "/" + filePath.split("/").map(encodeURIComponent).join("/");
}

module.exports = { ghJSON, ghList, ghListSafe, downloadVerify, downloadRetry, fetchChunked, rawUrl, RAW, API };
