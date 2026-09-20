#!/usr/bin/env node
/**
 * fetch_magazines.js —— 抓取「外刊精读」素材（GitHub: hehonghui/awesome-english-ebooks）
 *
 * 产出（索引 + 分册懒加载，避免一次性把几百 KB 塞进首屏）：
 *   data/lang_read_mag.json                 索引：刊物 → 期号 → 文章元信息（无正文）
 *   data/lang_read_mag_<key>.json           正文：{ key, updatedAt, bodies: { articleId: content } }
 *
 * 幂等：同一「刊物 + 期号」已入库则跳过（除非 --force）。
 *   ⇒ 每周跑一次只会新增当周新一期，不会重复下载历史 epub。
 *
 * 用法：
 *   node scripts/fetch_magazines.js                 # 增量抓最新一期
 *   node scripts/fetch_magazines.js --force         # 重抓（覆盖同期）
 *   node scripts/fetch_magazines.js --only=economist
 *   node scripts/fetch_magazines.js --issues=2      # 每刊保留最近 N 期
 */
const fs = require("fs");
const path = require("path");
const E = require("./lib_epub");
const M = require("./lib_magfetch");
const SENSITIVE = require("./lib_filter");

const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "data");
const CACHE = path.join(ROOT, ".cache", "magazines");
const REPO = "hehonghui/awesome-english-ebooks";

/**
 * 刊物配置。
 * 正文抽取靠 epub 里的语义 class（各刊由不同工具生成，class 名不通用）：
 *   经济学人 te_article_title / te_section_title / te_article_rubric
 *   纽约客   ny_article_h1_title / ny_article_category / ny_article_rubric / ny_article_author
 *   其他     未识别时退回「<h1|h2> + 段落长度」启发式
 *
 * want         每期收录篇数（分类轮转挑选）
 * bandWords    优先长度区间 —— 精读要的是 300~1800 词的中短文，
 *              而不是 New Yorker 那种 1 万词的 Profiles 长报道
 */
const MAGS = [
  { key: "economist", name: "经济学人", en: "The Economist", emoji: "📗", dir: "01_economist",
    epubRe: /\.epub$/i, want: 14, bandWords: [220, 1800], maxWords: 2000,
    map: { title: "te_article_title", section: "te_section_title", rubric: "te_article_rubric", author: "te_article_author" } },
  { key: "newyorker", name: "纽约客", en: "The New Yorker", emoji: "🗽", dir: "02_new_yorker",
    epubRe: /\.epub$/i, want: 10, bandWords: [250, 2400], maxWords: 2600,
    map: { title: "ny_article_h1_title", section: "ny_article_category", rubric: "ny_article_rubric", author: "ny_article_author" } },
  { key: "atlantic", name: "大西洋月刊", en: "The Atlantic", emoji: "🌊", dir: "04_atlantic",
    epubRe: /\.epub$/i, want: 10, bandWords: [400, 12000], maxWords: 2400, map: {} },
  { key: "wired", name: "连线", en: "Wired", emoji: "🔌", dir: "05_wired",
    epubRe: /\.epub$/i, want: 10, bandWords: [400, 12000], maxWords: 2400, map: {},
    // Wired 的 feed 只有一个「Magazine Articles」，栏目要从文章页里的
    // https://www.wired.com/category/<slug>/ 链接取
    sectionFromUrl: /wired\.com\/category\/([a-z0-9\-]+)/i }
];

/** 栏目 slug → 中文名（未收录的转成 Title Case 直接用） */
const SECTION_CN = {
  "big-story": "长篇特写", business: "商业", science: "科学", security: "安全",
  gear: "装备", ideas: "观点", culture: "文化", backchannel: "科技深度",
  "artificial-intelligence": "人工智能", "wired-guide": "消费指南",
  transportation: "出行", design: "设计", "the-big-issue": "专题"
};
function sectionLabel(slug) {
  if (!slug) return "";
  const k = String(slug).toLowerCase();
  if (SECTION_CN[k]) return SECTION_CN[k];
  return k.split("-").map(function (w) { return w ? w[0].toUpperCase() + w.slice(1) : w; }).join(" ");
}

const ISSUE_RE = /(\d{4})[.\-_](\d{2})[.\-_](\d{2})/;

function readJSON(p, dflt) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (_) { return dflt; }
}
function writeJSON(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n");
}
function bjNowISO() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return d.toISOString().slice(0, 19) + "+08:00";
}

/* ---------------- EPUB → 文章 ---------------- */

/** 逐条读 spine，返回 [{href, html, text, title, words}] */
function readChapters(buf, ents, opf) {
  const byName = {};
  ents.forEach(function (e) { byName[e.name] = e; });
  const out = [];
  opf.chapters.forEach(function (c) {
    const ent = byName[c.href];
    if (!ent) return;
    let html;
    try { html = E.readEntry(buf, ent).toString("utf8"); } catch (_) { return; }
    const text = E.htmlToText(html);
    out.push({ href: c.href, html: html, text: text, title: E.extractTitle(html), words: E.countWords(text) });
  });
  return out;
}

/** 取 第一个含 class 的标签内文本 */
function byClass(html, cls, tag) {
  const re = new RegExp("<" + (tag || "[a-z0-9]+") + "\\b[^>]*class=[\"'][^\"']*\\b" + cls + "\\b[^\"']*[\"'][^>]*>([\\s\\S]*?)</", "i");
  const m = String(html).match(re);
  if (!m) return "";
  return E.cleanText(m[1]);
}

/** 正文：按 <p> 取段落，丢掉图片行 / 日期行 / 过短行 */
function paragraphText(html) {
  const paras = [];
  const re = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = re.exec(html))) {
    const inner = m[1];
    if (/<img\b/i.test(inner) && E.stripTags(inner).trim().length < 4) continue;
    const t = E.cleanText(inner);
    if (t.length < 2) continue;
    if (/^\d{4}|^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(t) && t.length < 40) continue;
    paras.push(t);
  }
  return paras.join("\n\n");
}

/** 不收录的栏目（新闻摘要 / 读者来信 / 讣告 / 活动预告，不是可精读的文章） */
const SKIP_SECTIONS = {
  "the world this week": 1, letters: 1, "goings on": 1, "briefly noted": 1,
  "the economist reads": 1, "economic & financial indicators": 1, "economic and financial indicators": 1,
  obituary: 1, "the week": 1, "contributors": 1, "editor's note": 1
};
/** 按刊物屏蔽整块栏目：这些栏目整体是政治/地缘/冲突选题，逐条过滤不如整块不收 */
const SKIP_SECTIONS_BY_MAG = {
  economist: ["china", "united states", "middle east & africa", "europe", "international", "asia"]
};

/**
 * 按语义 class 抽文章（各刊 class 名见 MAGS[].map）。
 * 无 class 的刊物（calibre 转换的 Atlantic / Wired）走启发式：
 *   h1 = 标题、h2 = 副题、`by X` 段落 = 作者、feed_N/index 里的首行 = 栏目。
 * feedMap: { "feed_0/article_3/index_u16.html": "Features" }，由 calibreFeedSections 生成。
 */
function extractArticles(chs, mag, feedMap) {
  const map = mag.map || {};
  const useClass = !!map.title;
  const need = mag.bandWords ? mag.bandWords[0] : 200;
  const arts = [];
  chs.forEach(function (c) {
    // 栏目索引页不是文章（如 Wired 的「Magazine Articles」页）：
    // 只匹配 feed_N/index*.html 这一层，不能写成 /index.*\.html$ ——
    // 文章页恰恰是 feed_N/article_M/index_uXX.html，会被一起误杀。
    if (/feed_\d+\/index[^\/]*\.html$/i.test(c.href)) return;
    if (c.words < need) return;                      // 封面 / 栏目索引 / 广告页
    let title, section = "", rubric = "", author = "";
    if (useClass) {
      title = byClass(c.html, map.title) || c.title;
      section = (map.section && byClass(c.html, map.section)) || "";
      rubric = (map.rubric && byClass(c.html, map.rubric)) || "";
      author = (map.author && byClass(c.html, map.author)) || "";
    } else {
      const hs = E.extractHeadings(c.html);
      title = hs[0] || c.title;
      rubric = hs[1] || "";
      const am = c.html.match(/<p[^>]*>\s*by\s+([A-Z][^<]{1,60}?)<\/p>/i);
      if (am) author = am[1].trim();
      section = (feedMap && feedMap[c.href]) || "";
      if (mag.sectionFromUrl) {
        const um = c.html.match(mag.sectionFromUrl);
        if (um && um[1]) section = sectionLabel(um[1]);
      }
    }
    if (!title) return;
    if (/^(cover|contents|masthead|colophon|advert|table of|titlepage)/i.test(title)) return;
    if (SENSITIVE.isSensitive(title, rubric)) return;    // 精读素材只收中性选题
    const secKey = String(section || "").trim().toLowerCase();
    if (SKIP_SECTIONS[secKey]) return;
    const magSkip = SKIP_SECTIONS_BY_MAG[mag.key];
    if (magSkip && magSkip.indexOf(secKey) !== -1) return;
    if (!section) {
      // 兜底：正文首行若是短行（栏目名），用它当分类
      const first = (c.text.split("\n")[0] || "").trim();
      if (first && first.length <= 40 && first !== title && /^[\w\s&'’\-.]{2,40}$/.test(first)) section = first;
    }
    let body = paragraphText(c.html) || c.text;
    body = body.replace(/^\s*by\s+[^\n]{2,60}\n+/, "");     // 去掉开头的署名行
    if (E.countWords(body) < need) return;
    arts.push({ section: section, rubric: rubric, author: author, title: title, content: body, words: E.countWords(body) });
  });
  return arts;
}

/**
 * calibre 类 epub（Atlantic / Wired）：栏目名藏在 feed_N/index_*.html 的首行。
 * 返回 { 文章href: 栏目名 } —— 按 href 前缀 feed_N/ 归属。
 */
function calibreFeedSections(buf, ents) {
  const secOfFeed = {};
  const NAV = /^(Next section|Previous section|Main menu|Section menu|Next|Previous)$/i;
  ents.forEach(function (e) {
    const m = e.name.match(/^(feed_\d+)\/index[^\/]*\.html$/i);
    if (!m) return;
    let parts = [];
    try {
      // 导航条是「| Next section | Main menu |」这种竖线拼成的单行，
      // 必须按 | 一起切，否则整条导航会被当成栏目名（首跑真实事故）。
      parts = E.htmlToText(E.readEntry(buf, e).toString("utf8"))
        .split(/[\n|]/)
        .map(function (s) { return s.replace(/\s+/g, " ").trim(); })
        .filter(function (s) { return s && !NAV.test(s); });
    } catch (_) { return; }
    if (parts.length) secOfFeed[m[1]] = parts[0];
  });
  const map = {};
  ents.forEach(function (e) {
    const m = e.name.match(/^(feed_\d+)\//i);
    if (m && secOfFeed[m[1]]) map[e.name] = secOfFeed[m[1]];
  });
  return map;
}

/**
 * 选篇：先按长度band过滤（精读要中短文），再**按栏目轮转**挑选，
 * 保证分类栏目多样（否则 Economics 的 Briefing 长文会挤掉所有短栏目）。
 */
function pickArticles(arts, mag) {
  const band = mag.bandWords || [200, 2000];
  let pool = arts.filter(function (a) { return a.words >= band[0] && a.words <= band[1]; });
  if (pool.length < mag.want) {
    pool = arts.filter(function (a) { return a.words >= band[0]; })
      .sort(function (a, b) { return a.words - b.words; });
  }
  const bySec = {};
  pool.forEach(function (a) {
    const k = a.section || "其他";
    (bySec[k] = bySec[k] || []).push(a);
  });
  const keys = Object.keys(bySec);
  const out = [];
  let guard = 0;
  while (out.length < mag.want && keys.length && guard++ < 400) {
    let added = false;
    for (let i = 0; i < keys.length; i++) {
      const arr = bySec[keys[i]];
      if (arr.length) {
        out.push(arr.shift());
        added = true;
        if (out.length >= mag.want) break;
      }
    }
    if (!added) break;
  }
  return out;
}

/** 超长文截断到段落边界，避免单篇 1 万词把 JSON 撑爆（手机端没必要） */
function capContent(text, maxWords) {
  const w = E.countWords(text);
  if (w <= maxWords) return { text: text, truncated: false };
  const paras = text.split("\n\n");
  const out = [];
  let n = 0;
  for (let i = 0; i < paras.length; i++) {
    const pw = E.countWords(paras[i]);
    if (n + pw > maxWords && out.length) break;
    out.push(paras[i]);
    n += pw;
  }
  return { text: out.join("\n\n"), truncated: true };
}

/* ---------------- 主流程 ---------------- */

async function issueDirs(mag) {
  const list = await M.ghListSafe(REPO, mag.dir);
  return list
    .filter(function (x) { return x.type === "dir" && ISSUE_RE.test(x.name); })
    .map(function (x) {
      const m = x.name.match(ISSUE_RE);
      return { name: x.name, issue: m[1] + "." + m[2] + "." + m[3], date: m[1] + "-" + m[2] + "-" + m[3] };
    })
    .sort(function (a, b) { return a.issue < b.issue ? 1 : -1; });   // 新→旧
}

async function fetchIssue(mag, issueDir) {
  const rel = mag.dir + "/" + issueDir.name;
  const files = await M.ghList(REPO, rel);
  const epub = files.filter(function (f) { return f.type === "file" && mag.epubRe.test(f.name); })[0];
  if (!epub) return { skipped: true, reason: "该期没有 epub" };

  const cacheFile = path.join(CACHE, mag.key + "-" + issueDir.name + ".epub");
  let buf;
  if (fs.existsSync(cacheFile)) {
    buf = fs.readFileSync(cacheFile);
    if (!E.looksLikeZip(buf)) { buf = null; fs.unlinkSync(cacheFile); }
  }
  if (!buf) {
    const url = M.rawUrl(REPO, epub.path);
    await M.downloadRetry(url, cacheFile, { expectSize: epub.size, expectZip: true });
    buf = fs.readFileSync(cacheFile);
  }

  const ents = E.listEntries(buf);
  const opf = E.parseOpf(buf, ents);
  const chs = readChapters(buf, ents, opf);
  const feedMap = Object.keys(mag.map || {}).length ? null : calibreFeedSections(buf, ents);
  let arts = extractArticles(chs, mag, feedMap);

  // 去重（同标题）
  const seen = {};
  arts = arts.filter(function (a) {
    const k = a.title.toLowerCase();
    if (seen[k]) return false;
    seen[k] = 1;
    return true;
  });

  const picked = pickArticles(arts, mag);
  picked.sort(function (a, b) {
    if (a.section === b.section) return 0;
    return a.section < b.section ? -1 : 1;
  });

  return {
    issue: issueDir.issue,
    date: issueDir.date,
    src: "https://github.com/" + REPO + "/tree/master/" + rel,
    epub: epub.name,
    articles: picked.map(function (a, i) {
      const cap = capContent(a.content, mag.maxWords || 2600);
      return {
        id: mag.key + "-" + issueDir.issue + "-" + (i + 1),
        section: a.section,
        rubric: a.rubric,
        author: a.author,
        title: a.title,
        words: E.countWords(cap.text),
        truncated: cap.truncated,
        content: cap.text
      };
    })
  };
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.indexOf("--force") !== -1;
  const onlyArg = (args.filter(function (a) { return a.indexOf("--only=") === 0; })[0] || "").split("=")[1];
  const issuesArg = parseInt((args.filter(function (a) { return a.indexOf("--issues=") === 0; })[0] || "").split("=")[1], 10);
  const keepIssues = isFinite(issuesArg) && issuesArg > 0 ? issuesArg : 2;

  const idxPath = path.join(DATA, "lang_read_mag.json");
  const idx = readJSON(idxPath, { updatedAt: null, mags: [] });
  idx.mags = idx.mags || [];

  const targets = MAGS.filter(function (m) { return !onlyArg || m.key === onlyArg; });
  const report = [];

  for (const mag of targets) {
    let dirs;
    try { dirs = await issueDirs(mag); }
    catch (e) { report.push(mag.key + ": 列目录失败 " + e.message); continue; }
    if (!dirs.length) { report.push(mag.key + ": 无期号目录"); continue; }

    let node = idx.mags.filter(function (x) { return x.key === mag.key; })[0];
    if (!node) {
      node = { key: mag.key, name: mag.name, en: mag.en, emoji: mag.emoji, repo: REPO, dir: mag.dir, issues: [] };
      idx.mags.push(node);
    }
    node.issues = node.issues || [];
    const have = {};
    node.issues.forEach(function (x) { have[x.issue] = 1; });

    // 只抓「还没入库的最新的那几期」，避免首跑把整仓拉下来
    const todo = dirs.slice(0, keepIssues).filter(function (d) { return force || !have[d.issue]; });
    node.issues = node.issues.filter(function (x) { return dirs.slice(0, 6).some(function (d) { return d.issue === x.issue; }); });

    let added = 0;
    for (const d of todo) {
      try {
        const r = await fetchIssue(mag, d);
        if (r.skipped) { report.push(mag.key + " " + d.issue + ": 跳过（" + r.reason + "）"); continue; }
        if (!r.articles.length) { report.push(mag.key + " " + d.issue + ": 未抽到文章"); continue; }
        node.issues = node.issues.filter(function (x) { return x.issue !== r.issue; });
        node.issues.push(r);
        added += r.articles.length;
        report.push(mag.key + " " + r.issue + ": " + r.articles.length + " 篇");
      } catch (e) {
        report.push(mag.key + " " + d.issue + ": 失败 " + e.message);
      }
    }
    node.issues.sort(function (a, b) { return a.issue < b.issue ? 1 : -1; });

    // 正文分册落盘
    const bodies = {};
    node.issues.forEach(function (iss) {
      (iss.articles || []).forEach(function (a) { bodies[a.id] = a.content; });
    });
    writeJSON(path.join(DATA, "lang_read_mag_" + mag.key + ".json"), {
      key: mag.key, name: mag.name, updatedAt: bjNowISO(), bodies: bodies
    });
    // 索引里去掉正文
    node.issues.forEach(function (iss) {
      (iss.articles || []).forEach(function (a) { delete a.content; });
    });
    report.push(mag.key + ": 累计 " + node.issues.length + " 期 / " +
      node.issues.reduce(function (s, x) { return s + (x.articles || []).length; }, 0) + " 篇（本次新增 " + added + "）");
  }

  idx.updatedAt = bjNowISO();
  writeJSON(idxPath, idx);
  console.log("[magazines] 完成\n  " + report.join("\n  "));
}

if (require.main === module) {
  main().catch(function (e) { console.error("ERR", e && e.stack || e); process.exit(1); });
}
module.exports = { main, MAGS, extractArticles, pickArticles, capContent, readChapters };
