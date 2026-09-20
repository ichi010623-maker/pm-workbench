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
 *   node scripts/fetch_ted.js --limit=60      # 库容量上限（默认 48）
 *   node scripts/fetch_ted.js --force         # 重抓（覆盖已有条目）
 */
const fs = require("fs");
const path = require("path");
const SENSITIVE = require("./lib_filter");

const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "data");
const TED = "https://www.ted.com";

/* 元话题（TED 的内部标签，不宜作为「分类」展示） */
const META_TOPICS = {
  tedx: 1, "ted-ed": 1, "ted fellows": 1, "ted residency": 1, "ted prize": 1,
  "ted books": 1, "ted global": 1, "ted radio hour": 1, "ted salon": 1,
  "ted countdown": 1, "ted institute": 1, "tedmed": 1, "ted culture": 1
};

/**
 * 话题 → 粗粒度分类（8 类）。
 * TED 的原始话题非常细碎（democracy / astronomy / library / bullying…），
 * 直接当分类会得到十几个各 1 条的分组，所以统一收敛到 8 个大类。
 * 匹配规则：取该演讲 topics 里第一个能命中的别名（先大类顺序遍历，保证确定性）。
 */
const CATS = [
  ["tech", "科技与AI", 1, ["technology", "ai", "artificial intelligence", "computers", "internet", "data",
    "innovation", "future", "engineering", "robots", "machine learning", "algorithm", "blockchain",
    "cryptocurrency", "virtual reality", "augmented reality", "software", "hardware", "electronics",
    "space", "astronomy", "physics", "quantum", "mobility", "transportation", "drone", "3d printing",
    "cybersecurity", "security", "privacy", "biotech", "invention", "digital"]],
  ["business", "商业与职场", 2, ["business", "economics", "economy", "money", "finance", "investment",
    "work", "marketing", "advertising", "entrepreneur", "entrepreneurship", "leadership", "productivity",
    "management", "career", "strategy", "supply chain", "trade", "banking", "tax", "poverty",
    "global development", "social business", "philanthropy", "business strategy", "venture capital"]],
  ["science", "科学与自然", 3, ["science", "biology", "medicine", "medical research", "health",
    "public health", "climate", "climate change", "sustainability", "environment", "nature", "ocean",
    "oceans", "water", "energy", "agriculture", "genetics", "neuroscience", "bioethics", "conservation",
    "wildlife", "plants", "ecology", "weather", "animals", "microbiology", "chemistry", "disease"]],
  ["mind", "心理与成长", 4, ["psychology", "personal growth", "happiness", "mindfulness", "emotions",
    "mental health", "self", "success", "time", "identity", "memory", "motivation", "habit",
    "confidence", "stress", "anxiety", "depression", "wellness", "life", "aging", "death",
    "meditation", "empathy", "vulnerability", "failure", "resilience", "creativity", "potential"]],
  ["society", "社会与教育", 5, ["education", "community", "library", "libraries", "public space",
    "teaching", "learning", "school", "university", "literacy", "mentorship", "urban planning", "cities",
    "history", "anthropology", "archaeology", "geography", "population", "charity", "nonprofit",
    "volunteering", "social media", "journalism", "news", "media", "documentary", "information"]],
  ["culture", "文化与艺术", 6, ["culture", "art", "music", "design", "photography", "film", "books",
    "literature", "writing", "language", "dance", "theater", "poetry", "architecture", "fashion",
    "craft", "animation", "comics", "painting", "sculpture", "museums", "storytelling", "typography",
    "visual art", "performance", "humor", "gaming", "entertainment", "creativity and design"]],
  ["people", "沟通与人际", 7, ["communication", "collaboration", "relationships", "love",
    "conversation", "interview", "negotiation", "trust", "teamwork", "friendship", "family",
    "parenting", "networking", "public speaking", "listening", "conflict", "feedback", "presentation"]],
  ["life", "生活与健康", 8, ["food", "cooking", "travel", "sports", "fitness", "sleep", "nutrition",
    "exercise", "gardening", "lifestyle", "beauty", "shopping", "home", "diy", "adventure", "outdoor",
    "running", "football", "basketball", "olympics", "coffee", "wine", "farming"]]
];

/**
 * 明确不采集的话题。
 * 这是给「英语精读」用的素材库，主题应当落在语言学习本身；
 * 政治、宗教、性别、族群、战争、选举等争议性话题一律不收，
 * 既避免学习内容跑偏，也避免把有争议的材料带进产品。
 */
const SKIP_TOPICS = {
  politics: 1, "politics and government": 1, government: 1, democracy: 1, election: 1, elections: 1,
  voting: 1, "us politics": 1, war: 1, military: 1, terrorism: 1, dictatorship: 1, "human rights": 1,
  activism: 1, "social change": 1, protest: 1, religion: 1, faith: 1, gender: 1, "gender equality": 1,
  race: 1, racism: 1, immigration: 1, refugees: 1, abortion: 1, law: 1, "criminal justice": 1,
  police: 1, prison: 1, "death penalty": 1, sovereignty: 1, nationalism: 1, communism: 1,
  capitalism: 1, corruption: 1, surveillance: 1, censorship: 1, "civil rights": 1, "gun control": 1,
  "economic inequality": 1, "wealth gap": 1, "social justice": 1, "international relations": 1
};

function groupOf(topics) {
  const lower = (topics || []).map(function (t) { return String(t || "").trim().toLowerCase(); });
  for (let c = 0; c < CATS.length; c++) {
    for (let i = 0; i < lower.length; i++) {
      if (CATS[c][3].indexOf(lower[i]) !== -1) return CATS[c][0];
    }
  }
  return "other";
}
function groupCN(key) {
  for (let c = 0; c < CATS.length; c++) if (CATS[c][0] === key) return CATS[c][1];
  return "其他";
}
function groupOrder(key) {
  for (let c = 0; c < CATS.length; c++) if (CATS[c][0] === key) return CATS[c][2];
  return 999;
}
/** 是否属于跳过的争议话题 */
function isSkipped(topics) {
  for (let i = 0; i < (topics || []).length; i++) {
    if (SKIP_TOPICS[String(topics[i] || "").trim().toLowerCase()]) return true;
  }
  return false;
}

/**
 * 采集源：TED 话题页。
 * 为什么不用「全部演讲列表」翻页：/talks?sort=xxx&page=N 在服务端被忽略，
 * page=1/2/3 返回完全相同的 24 条（2026-09 实测）。话题页 /topics/<slug>
 * 反而给出该话题的精选演讲（16 条/页，talk 对象结构与列表页一致），
 * 用它采集既能拿到足量素材，又天然完成「按类分组」。
 */
const TED_TOPICS = [
  { cat: "tech", slug: "technology" },
  { cat: "tech", slug: "innovation" },
  { cat: "tech", slug: "computers" },
  { cat: "tech", slug: "future" },
  { cat: "tech", slug: "ai" },
  { cat: "tech", slug: "space" },
  { cat: "business", slug: "business" },
  { cat: "business", slug: "economics" },
  { cat: "business", slug: "work" },
  { cat: "business", slug: "entrepreneur" },
  { cat: "business", slug: "leadership" },
  { cat: "business", slug: "marketing" },
  { cat: "science", slug: "science" },
  { cat: "science", slug: "biology" },
  { cat: "science", slug: "health" },
  { cat: "science", slug: "medicine" },
  { cat: "science", slug: "sustainability" },
  { cat: "science", slug: "nature" },
  { cat: "mind", slug: "psychology" },
  { cat: "mind", slug: "happiness" },
  { cat: "mind", slug: "mindfulness" },
  { cat: "mind", slug: "motivation" },
  { cat: "mind", slug: "memory" },
  { cat: "mind", slug: "success" },
  { cat: "society", slug: "education" },
  { cat: "society", slug: "community" },
  { cat: "society", slug: "history" },
  { cat: "society", slug: "cities" },
  { cat: "society", slug: "journalism" },
  { cat: "society", slug: "media" },
  { cat: "culture", slug: "culture" },
  { cat: "culture", slug: "art" },
  { cat: "culture", slug: "design" },
  { cat: "culture", slug: "music" },
  { cat: "culture", slug: "photography" },
  { cat: "culture", slug: "film" },
  { cat: "culture", slug: "writing" },
  { cat: "culture", slug: "language" },
  { cat: "culture", slug: "creativity" },
  { cat: "people", slug: "communication" },
  { cat: "people", slug: "relationships" },
  { cat: "people", slug: "collaboration" },
  { cat: "people", slug: "love" },
  { cat: "people", slug: "storytelling" },
  { cat: "people", slug: "family" },
  { cat: "people", slug: "parenting" },
  { cat: "life", slug: "food" },
  { cat: "life", slug: "travel" },
  { cat: "life", slug: "sports" },
  { cat: "life", slug: "fitness" },
  { cat: "life", slug: "sleep" },
  { cat: "life", slug: "gardening" }
];
/** 每个话题取前 N 条（话题页每页 16 条） */
const PER_TOPIC = 8;

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

  const idxPath = path.join(DATA, "lang_read_ted.json");
  const idx = readJSON(idxPath, { updatedAt: null, talks: [] });
  idx.talks = idx.talks || [];
  const known = {};
  idx.talks.forEach(function (t) { known[t.id] = 1; });

  // 1) 采集：话题页（带分类）+ 最新列表（保证新鲜度）
  const found = [];
  for (const src of TED_TOPICS) {
    try {
      const arr = parseListPage(await getHTML(TED + "/topics/" + src.slug)).slice(0, PER_TOPIC);
      arr.forEach(function (t) { t.catHint = src.cat; found.push(t); });
      await sleep(250);
    } catch (e) {
      console.log("  ! 话题页失败 " + src.slug + ": " + e.message);
    }
  }
  try {
    const latest = parseListPage(await getHTML(TED + "/talks?sort=newest"));
    latest.forEach(function (t) { t.catHint = ""; found.push(t); });
  } catch (_) {}

  const uniq = [];
  const seen = {};
  found.forEach(function (t) {
    if (seen[t.id]) { if (!seen[t.id].catHint && t.catHint) seen[t.id].catHint = t.catHint; return; }
    seen[t.id] = t;
    uniq.push(t);
  });

  // 2) 过滤 + 按分类轮转编排（避免前几个话题把名额吃光，导致 8 个分类只剩 2 个）
  const filtered = uniq.filter(function (t) {
    const cat = t.catHint || groupOf(t.topics);
    return cat !== "other" || !isSkipped(t.topics);
  }).filter(function (t) {
    return !isSkipped(t.topics) && !SENSITIVE.isSensitive(t.title);
  });
  const skipCnt = uniq.length - filtered.length;

  const byCat = {};
  filtered.forEach(function (t) {
    const k = t.catHint || groupOf(t.topics);
    (byCat[k] = byCat[k] || []).push(t);
  });
  const catKeys = Object.keys(byCat);
  const balanced = [];
  let guard = 0;
  while (balanced.length < filtered.length && guard++ < 3000) {
    let added = false;
    for (let i = 0; i < catKeys.length; i++) {
      const arr = byCat[catKeys[i]];
      if (arr.length) { balanced.push(arr.shift()); added = true; }
    }
    if (!added) break;
  }

  let todo = balanced.filter(function (t) { return force || !known[t.id]; });
  const room = Math.max(0, limit - idx.talks.length);
  if (todo.length > room) todo = todo.slice(0, room);
  console.log("[ted] 候选 " + uniq.length + " 条（过滤 " + skipCnt + " 条），分类候选 " +
    catKeys.map(function (k) { return groupCN(k) + ":" + byCat[k].length; }).join(" ") +
    "；待抓 " + todo.length + " 条（库内 " + idx.talks.length + "，上限 " + limit + "）");

  const bodies = {};
  let ok = 0;
  for (const t of todo) {
    try {
      const body = await fetchTalk(t.slug);
      if (!body) { console.log("  - 跳过（无字幕）: " + t.slug); continue; }
      const g = t.catHint || groupOf(t.topics);
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
module.exports = { main, parseListPage, parseTranscript, groupOf, groupCN, isSkipped };
