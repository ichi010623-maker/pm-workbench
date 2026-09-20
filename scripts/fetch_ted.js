#!/usr/bin/env node
/**
 * fetch_ted.js —— 抓取 TED 演讲（英文原文 + 简体中文字幕）作为精读素材
 *
 * 来源：ted.com 页面内嵌的 Next.js __NEXT_DATA__
 *   - 列表页 https://www.ted.com/talks?sort=newest&page=N  → props.pageProps.talks（24/页）
 *   - 详情页 https://www.ted.com/talks/<slug>/transcript?language=en|zh-cn
 *       → props.pageProps.transcriptData.translation.paragraphs[].cues[].text
 *   注意：transcript 路由会 308 跳转，必须跟随重定向（Node fetch 默认跟随）。
 *
 * 产出（索引 + 分组懒加载，和「外刊」同一套约定）：
 *   data/lang_read_ted.json               索引：分组 + 演讲元信息（无正文）
 *   data/lang_read_ted_<group>.json       正文：{ group, updatedAt, bodies: { id: {en:[],zh:[]} } }
 *
 * 用法：
 *   node scripts/fetch_ted.js                 # 增量：补最新若干条
 *   node scripts/fetch_ted.js --limit=48      # 库容量上限（默认 48）
 *   node scripts/fetch_ted.js --pages=2       # 抓取列表页数（默认 2 → 48 条）
 *   node scripts/fetch_ted.js --force         # 重抓（覆盖已有条目）
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "data");
const TED = "https://www.ted.com";

/* 元话题（TED 的内部标签，不宜作为「分类」展示） */
const META_TOPICS = {
  tedx: 1, "ted-ed": 1, "ted fellows": 1, "ted residency": 1, "ted prize": 1,
  "ted books": 1, "ted global": 1, "ted radio hour": 1, "ted salon": 1,
  "ted countdown": 1, "ted institute": 1, "tedmed": 1, "ted culture": 1
};

/* 话题中文名 + 分组顺序（未收录的落到「其他」，顺序按 order 排） */
const TOPIC_CN = {
  technology: ["科技", 1], science: ["科学", 2], business: ["商业", 3],
  design: ["设计", 4], psychology: ["心理", 5], society: ["社会", 6],
  health: ["健康", 7], education: ["教育", 8], culture: ["文化", 9],
  innovation: ["创新", 10], ai: ["人工智能", 11], entrepreneur: ["创业", 12],
  leadership: ["领导力", 13], communication: ["沟通", 14], collaboration: ["协作", 15],
  "personal growth": ["个人成长", 16], happiness: ["幸福", 17], creativity: ["创造力", 18],
  work: ["工作", 19], "global issues": ["全球议题", 20], sustainability: ["可持续", 21],
  climate: ["气候", 22], data: ["数据", 23], future: ["未来", 24], media: ["媒体", 25],
  art: ["艺术", 26], music: ["音乐", 27], photography: ["摄影", 28], film: ["影视", 29],
  books: ["阅读", 30], sports: ["体育", 31], food: ["饮食", 32], travel: ["旅行", 33],
  space: ["太空", 34], biology: ["生物", 35], medicine: ["医学", 36], engineering: ["工程", 37],
  computers: ["计算机", 38], internet: ["互联网", 39], economics: ["经济", 40],
  marketing: ["营销", 41], productivity: ["效率", 42], mindfulness: ["正念", 43],
  language: ["语言", 44], writing: ["写作", 45]
};

function readJSON(p, dflt) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (_) { return dflt; } }
function writeJSON(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n");
}
function bjNowISO() { return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 19) + "+08:00"; }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function getHTML(url, tries) {
  tries = tries || 3;
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; pm-workbench-ted/1.0)" } });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.text();
    } catch (e) {
      lastErr = e;
      await sleep(1200 * (i + 1));
    }
  }
  throw lastErr;
}

function nextData(html) {
  const m = String(html).match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch (_) { return null; }
}

/** 列表页 → 演讲元信息数组 */
function parseListPage(html) {
  const j = nextData(html);
  if (!j) return [];
  const talks = (j.props && j.props.pageProps && j.props.pageProps.talks) || [];
  const arr = Array.isArray(talks) ? talks : Object.keys(talks).map(function (k) { return talks[k]; });
  return arr.filter(function (t) { return t && t.slug && t.title; }).map(function (t) {
    const topics = ((t.topics && t.topics.nodes) || []).map(function (x) { return x.name; });
    const speakers = ((t.speakers && t.speakers.nodes) || []).map(function (s) {
      return [s.firstname, s.lastname].filter(Boolean).join(" ");
    });
    return {
      id: String(t.id || t.slug),
      slug: t.slug,
      title: String(t.title || "").trim(),
      speakers: speakers,
      topics: topics,
      duration: Number(t.duration || 0),
      publishedAt: (t.publishedAt || "").slice(0, 10),
      recordedOn: t.recordedOn || ""
    };
  });
}

/** 由 topics 选一个非元话题作为分组键 */
function groupOf(topics) {
  for (let i = 0; i < (topics || []).length; i++) {
    const t = String(topics[i] || "").trim().toLowerCase();
    if (!t || META_TOPICS[t]) continue;
    return t;
  }
  return "other";
}
function groupCN(key) {
  if (key === "other") return "其他";
  return (TOPIC_CN[key] && TOPIC_CN[key][0]) || key;
}
function groupOrder(key) {
  if (key === "other") return 999;
  return (TOPIC_CN[key] && TOPIC_CN[key][1]) || 500;
}

/** 详情页 → {en:[段落], zh:[段落]} */
function parseTranscript(html) {
  const j = nextData(html);
  if (!j) return null;
  const td = j.props && j.props.pageProps && j.props.pageProps.transcriptData;
  const tr = td && td.translation;
  if (!tr || !Array.isArray(tr.paragraphs)) return null;
  const lang = (tr.language && (tr.language.internalLanguageCode || tr.language.englishName)) || "";
  const paras = tr.paragraphs.map(function (p) {
    return (p.cues || []).map(function (c) { return String(c.text || "").replace(/\s*\n\s*/g, " ").trim(); })
      .filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }).filter(Boolean);
  return { lang: lang, paragraphs: paras };
}

async function fetchTalk(slug) {
  const en = parseTranscript(await getHTML(TED + "/talks/" + slug + "/transcript?language=en"));
  await sleep(250);
  let zh = null;
  try { zh = parseTranscript(await getHTML(TED + "/talks/" + slug + "/transcript?language=zh-cn")); }
  catch (_) { zh = null; }
  await sleep(250);
  if (!en || !en.paragraphs.length) return null;
  return { en: en.paragraphs, zh: (zh && zh.paragraphs) || [] };
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.indexOf("--force") !== -1;
  const limit = parseInt((args.filter(function (a) { return a.indexOf("--limit=") === 0; })[0] || "").split("=")[1], 10) || 48;
  const pages = parseInt((args.filter(function (a) { return a.indexOf("--pages=") === 0; })[0] || "").split("=")[1], 10) || 2;

  const idxPath = path.join(DATA, "lang_read_ted.json");
  const idx = readJSON(idxPath, { updatedAt: null, talks: [] });
  idx.talks = idx.talks || [];
  const known = {};
  idx.talks.forEach(function (t) { known[t.id] = 1; });

  // 1) 列表
  const found = [];
  for (let p = 1; p <= pages; p++) {
    const html = await getHTML(TED + "/talks?sort=newest&page=" + p);
    const arr = parseListPage(html);
    found.push.apply(found, arr);
    await sleep(400);
    if (!arr.length) break;
  }
  const uniq = [];
  const seen = {};
  found.forEach(function (t) { if (!seen[t.id]) { seen[t.id] = 1; uniq.push(t); } });

  // 2) 只补没抓过的，且不超过总容量上限
  let todo = uniq.filter(function (t) { return force || !known[t.id]; });
  const room = Math.max(0, limit - idx.talks.length);
  if (todo.length > room) todo = todo.slice(0, room);
  console.log("[ted] 列表 " + uniq.length + " 条，待抓 " + todo.length + " 条（库内 " + idx.talks.length + "，上限 " + limit + "）");

  const bodies = {};
  let ok = 0;
  for (const t of todo) {
    try {
      const body = await fetchTalk(t.slug);
      if (!body) { console.log("  - 跳过（无字幕）: " + t.slug); continue; }
      const g = groupOf(t.topics);
      idx.talks = idx.talks.filter(function (x) { return x.id !== t.id; });
      idx.talks.push({
        id: t.id, slug: t.slug, title: t.title,
        speaker: t.speakers.join(" & "),
        topic: g, topicName: groupCN(g),
        duration: t.duration, publishedAt: t.publishedAt,
        paras: body.en.length, hasZh: body.zh.length > 0,
        src: TED + "/talks/" + t.slug
      });
      bodies[t.id] = body;
      ok++;
      console.log("  + " + groupCN(g) + " | " + t.title.slice(0, 56) + " (" + body.en.length + " 段)");
    } catch (e) {
      console.log("  ! 失败 " + t.slug + ": " + e.message);
    }
  }

  // 3) 裁剪到上限（保留最新）
  idx.talks.sort(function (a, b) { return (a.publishedAt || "") < (b.publishedAt || "") ? 1 : -1; });
  const dropped = idx.talks.slice(limit);
  idx.talks = idx.talks.slice(0, limit);
  if (dropped.length) console.log("[ted] 裁掉 " + dropped.length + " 条旧演讲");

  // 4) 分组落盘：每组一个正文文件
  const groups = {};
  idx.talks.forEach(function (t) { (groups[t.topic] = groups[t.topic] || []).push(t.id); });

  // 清理已无内容的分组文件
  const keepFiles = {};
  Object.keys(groups).forEach(function (g) {
    const file = path.join(DATA, "lang_read_ted_" + g + ".json");
    keepFiles["lang_read_ted_" + g + ".json"] = 1;
    const prev = readJSON(file, { bodies: {} }).bodies || {};
    const b = {};
    groups[g].forEach(function (id) { if (bodies[id]) b[id] = bodies[id]; else if (prev[id]) b[id] = prev[id]; });
    // 组内可能包含本次没抓到正文的条目（理论上不会），落盘时剔除
    writeJSON(file, { group: g, groupName: groupCN(g), updatedAt: bjNowISO(), bodies: b });
  });
  fs.readdirSync(DATA).forEach(function (f) {
    if (/^lang_read_ted_.+\.json$/.test(f) && !keepFiles[f]) {
      fs.unlinkSync(path.join(DATA, f));
      console.log("[ted] 删除空分组文件 " + f);
    }
  });

  idx.groups = Object.keys(groups).map(function (g) {
    return { key: g, name: groupCN(g), count: groups[g].length, order: groupOrder(g) };
  }).sort(function (a, b) { return a.order - b.order; });

  idx.updatedAt = bjNowISO();
  writeJSON(idxPath, idx);
  console.log("[ted] 完成：库内 " + idx.talks.length + " 条 / " + idx.groups.length + " 个分组（本次新增 " + ok + "）");
}

if (require.main === module) {
  main().catch(function (e) { console.error("ERR", e && e.stack || e); process.exit(1); });
}
module.exports = { main, parseListPage, parseTranscript, groupOf, groupCN };
