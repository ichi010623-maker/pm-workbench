#!/usr/bin/env node
// 云端「新闻摘要」生成器 —— 独立 RSS 抓取真实全球新闻 + LLM 中文摘要
// 数据源（独立，不依赖行业情报 news.json）：
//   BBC World / Business / Technology, Al Jazeera (all), NPR News (1001)
// 流程：并发抓取 RSS（解析真实 标题/描述/链接）→ 聚合去重 → 智谱 GLM-4-Flash 基于真实素材做中文分组摘要
//      （RSS 全部失败或素材不足时降级为 LLM 联网检索，保证每日有产出）
// 输出: data/news_summary.json
//   { updatedAt, days: { "YYYY-MM-DD": { date, brief, groups, sources, mode } } }
// 幂等：若当日已生成则跳过。

const fs = require("fs");
const path = require("path");
const { chatJSON } = require("./lib_llm");

function bjTodayStr() { return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10); }

// —— RSS 源（全球多视角：西方 + 全球南方 + 美国）——
const FEEDS = [
  { name: "BBC",        url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { name: "BBC商业",     url: "https://feeds.bbci.co.uk/news/business/rss.xml" },
  { name: "BBC科技",     url: "https://feeds.bbci.co.uk/news/technology/rss.xml" },
  { name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { name: "NPR",        url: "https://feeds.npr.org/1001/rss.xml" },
  { name: "Guardian世界", url: "https://www.theguardian.com/world/rss" },
  { name: "Guardian科技", url: "https://www.theguardian.com/technology/rss" },
  { name: "Guardian商业", url: "https://www.theguardian.com/business/rss" }
];

// Reuters 官方公开 RSS 已停止维护，这里用更稳的多源组合替代。

function decodeEntities(s) {
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"").replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function stripTags(s) { return decodeEntities(String(s).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim(); }

function field(block, tag) {
  const m = block.match(new RegExp("<" + tag + "[^>]*>([\\s\\S]*?)<\\/" + tag + ">", "i"));
  return m ? stripTags(m[1]) : "";
}

function linkOf(block) {
  const inline = field(block, "link");
  if (inline) return inline;
  const atom = block.match(/<link[^>]*href="([^"]+)"/i);
  return atom ? atom[1] : "";
}

async function fetchRss(feed) {
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 12000);
    const res = await fetch(feed.url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; PMWorkbench/1.0)" }
    });
    clearTimeout(to);
    if (!res.ok) return [];
    const xml = await res.text();
    const items = [];
    const re = /<(item|entry)>([\s\S]*?)<\/\1>/g;
    let m;
    while ((m = re.exec(xml)) && items.length < 15) {
      const block = m[2];
      const title = field(block, "title");
      if (!title) continue;
      const descRaw = field(block, "description") || field(block, "summary");
      items.push({
        title: title.slice(0, 160),
        desc: (descRaw || "").slice(0, 260),
        url: linkOf(block).slice(0, 400),
        source: feed.name
      });
    }
    return items;
  } catch (e) {
    console.log(`[rss] ${feed.name} 抓取失败: ${e.name || e.message}`);
    return [];
  }
}

async function fetchAllRss() {
  const lists = await Promise.all(FEEDS.map(fetchRss));
  const merged = [];
  const seen = new Set();
  const counts = {};
  FEEDS.forEach((f, i) => { counts[f.name] = lists[i].length; });
  lists.flat().forEach((it) => {
    const key = it.title.toLowerCase().replace(/\s+/g, "");
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(it);
  });
  return { raw: merged, counts };
}

const RSS_PROMPT_TAIL = `
请基于【上述素材】（不得编造素材以外的任何新闻），生成一份「每日新闻摘要」：
- 按 4~5 个主题分组（如：🌍 国际、💼 商业财经、💻 科技、🇨🇳 中国相关、🌏 其他），每组 3~5 条。
- 每条新闻包含：
  - title：中文标题（可将原标题译/改写为简体中文，≤25 字）
  - summary：基于素材描述写一句话客观摘要（≤40 字）
  - source：素材来源媒体名（直接取 [来源] 标注，如 BBC / Al Jazeera / NPR）
  - url：原文链接（必须原样取素材里的「原文」URL，不得改写或编造；素材没有链接则留空字符串 ""）
- 额外给出 brief：3~5 条「今日最值得关注」的一句话速览（≤30 字/条）。
- 全部用简体中文。
返回严格 JSON：
{"brief":["...","..."],"groups":[{"cat":"国际","icon":"🌍","items":[{"title":"...","summary":"...","source":"BBC","url":"https://..."}]}]}`;

const WEBSEARCH_USER = `请基于今天(${bjTodayStr()})的真实全球要闻，生成一份「新闻摘要」。
要求：
- 必须使用联网检索获取当天真实新闻（国际、商业财经、科技、中国相关、其他 等），禁止编造。
- 按 4~5 个主题分组（如：🌍 国际、💼 商业财经、💻 科技、🇨🇳 中国、🌏 其他），每组 3~5 条。
- 每条新闻包含：
  - title：标题（≤25 字）
  - summary：一句话客观摘要（≤40 字）
  - source：来源媒体（如 BBC / Reuters / 路透 / 新华社 / 财新 等）
  - url：原文链接（尽量给真实可访问 URL；没有则留空字符串 ""）
- 额外给出 brief：3~5 条「今日最值得关注」的一句话速览（≤30 字/条）。
- 全部用简体中文。
返回严格 JSON：
{"brief":["...","..."],"groups":[{"cat":"国际","icon":"🌍","items":[{"title":"...","summary":"...","source":"BBC","url":"https://..."}]}]}`;

/**
 * 无文件系统生成入口（供 Cloudflare Worker 使用）：
 * 传入 news_summary 数据对象，原地更新并返回。opts.llm 注入 LLM；opts.webSearch 标识 LLM 是否支持联网检索。
 */
async function generate(ns, DATE, opts = {}) {
  const llm = opts.llm || null;
  const force = opts.force;
  const webSearch = opts.webSearch !== false; // Worker（Workers AI）无联网 → 传 false
  if (!/^\d{4}-\d{2}-\d{2}$/.test(DATE)) throw new Error("日期格式错误: " + DATE);
  if (!ns.days) ns.days = {};
  if (!force && ns.days[DATE] && ns.days[DATE].groups && ns.days[DATE].groups.length) {
    console.log(`[newssum] ${DATE} 已存在，跳过（幂等）`);
    return { skipped: true, date: DATE, data: ns };
  }

  // 1) 独立抓取真实 RSS
  console.log(`[newssum] ${DATE} 抓取 RSS 源...`);
  const { raw, counts } = await fetchAllRss();
  console.log(`[newssum] RSS 抓取合计 ${raw.length} 条:`, JSON.stringify(counts));

  let mode, user, sysOpts;
  if (raw.length >= 6) {
    // 素材模式：基于真实抓取做摘要，关闭 LLM 联网检索（避免编造）
    mode = "rss";
    const material = raw.slice(0, 40).map((it, i) =>
      `${i + 1}. [${it.source}] ${it.title}\n   摘要素材: ${it.desc}\n   原文: ${it.url}`
    ).join("\n");
    sysOpts = { webSearch: false, temperature: 0.3, maxTokens: 6000 };
    user = `以下是今天通过 RSS 独立抓取的全球真实新闻素材（已标注来源与原文链接，共 ${raw.length} 条）：\n${material}\n` + RSS_PROMPT_TAIL;
  } else if (webSearch) {
    // 降级：RSS 不可用，退回 LLM 联网检索（不中断每日产出）
    mode = "websearch-fallback";
    console.log(`[newssum] RSS 素材不足(${raw.length})，降级为 LLM 联网检索`);
    sysOpts = { webSearch: true, temperature: 0.5, maxTokens: 6000 };
    user = WEBSEARCH_USER;
  } else {
    // Worker 无联网且 RSS 不足：跳过当日，避免编造
    console.log(`[newssum] RSS 素材不足(${raw.length})且 LLM 无联网，跳过（防编造）`);
    return { date: DATE, skippedNoSource: true, data: ns };
  }

  const system = "你是资深国际新闻编辑，擅长把真实新闻整理成简洁、客观、有信息量的每日摘要。输出严格 JSON，不得编造新闻。";
  const chat = llm || chatJSON;
  const data = await chat(system, user, sysOpts);
  let groups = Array.isArray(data.groups) ? data.groups : [];
  let brief = Array.isArray(data.brief) ? data.brief : [];
  if (groups.length === 0) throw new Error("LLM 返回新闻摘要为空");

  const out = {
    date: DATE,
    mode: mode,
    sources: counts,
    rssCount: raw.length,
    brief: brief.slice(0, 6).map((b) => String(b || "").slice(0, 40)),
    groups: groups.slice(0, 6).map(function (g) {
      return {
        cat: String(g.cat || "其他").slice(0, 12),
        icon: String(g.icon || "📌").slice(0, 4),
        items: (Array.isArray(g.items) ? g.items : []).slice(0, 6).map(function (it) {
          let url = String(it.url || "").slice(0, 300).trim();
          if (url && !/^https?:\/\//i.test(url)) url = ""; // 仅保留合法 http(s) 链接
          return {
            title: String(it.title || "").slice(0, 60),
            summary: String(it.summary || "").slice(0, 80),
            source: String(it.source || (mode === "rss" ? "RSS" : "")).slice(0, 40),
            url: url
          };
        }).filter(function (it) { return it.title; })
      };
    }).filter(function (g) { return g.items.length; })
  };

  ns.days[DATE] = out;
  ns.updatedAt = DATE + "T" + new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(11, 16) + ":00+08:00";

  const itemCnt = out.groups.reduce(function (a, g) { return a + g.items.length; }, 0);
  console.log(`[newssum] ${DATE} 生成 ${out.groups.length} 组 / ${itemCnt} 条 (mode=${mode})`);
  return { date: DATE, groups: out.groups.length, items: itemCnt, mode: mode, sources: counts, data: ns };
}

async function main(dateArg, dirArg, opts) {
  const DATE = dateArg || process.argv[2] || bjTodayStr();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(DATE)) throw new Error("日期格式错误: " + DATE);
  const DIR = dirArg || (process.argv[3] || path.join(__dirname, ".."));
  const force = opts && opts.force;
  const rfile = path.join(DIR, "data", "news_summary.json");

  let ns = {};
  try { ns = JSON.parse(fs.readFileSync(rfile, "utf8")); } catch { ns = { days: {} }; }

  const r = await generate(ns, DATE, { force, webSearch: true });
  if (r.data && r.data !== ns) fs.writeFileSync(rfile, JSON.stringify(r.data, null, 2));
  else if (r.days === undefined && !r.skipped && !r.skippedNoSource && r.groups !== undefined) fs.writeFileSync(rfile, JSON.stringify(ns, null, 2));
  return r;
}

if (require.main === module) {
  main().then(function (r) { console.log(JSON.stringify(r)); }).catch(function (e) {
    console.error("ERR", e.message); process.exit(1);
  });
}
module.exports = { main, generate };
