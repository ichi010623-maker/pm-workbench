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

const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "data");
const CACHE = path.join(ROOT, ".cache", "magazines");
const REPO = "hehonghui/awesome-english-ebooks";

/**
 * 刊物配置。
 * style 决定正文抽取策略：
 *   - economist：该 epub 带语义 class（te_article_title / te_section_title / te_article_rubric），按 class 精确抽
 *   - generic  ：无统一 class，按 <h1|h2> 标题 + 段落长度启发式抽
 */
const MAGS = [
  { key: "economist", name: "经济学人", en: "The Economist", emoji: "📗", dir: "01_economist",
    epubRe: /\.epub$/i, style: "economist", maxArticles: 14 },
  { key: "newyorker", name: "纽约客", en: "The New Yorker", emoji: "🗽", dir: "02_new_yorker",
    epubRe: /\.epub$/i, style: "generic", maxArticles: 10 },
  { key: "atlantic", name: "大西洋月刊", en: "The Atlantic", emoji: "🌊", dir: "04_atlantic",
    epubRe: /\.epub$/i, style: "generic", maxArticles: 10 },
  { key: "wired", name: "连线", en: "Wired", emoji: "🔌", dir: "05_wired",
    epubRe: /\.epub$/i, style: "generic", maxArticles: 10 }
];

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
  return E.decodeEntities(m[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

/** 正文：按 <p> 取段落，丢掉图片行 / 日期行 / 过短行 */
function paragraphText(html) {
  const paras = [];
  const re = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = re.exec(html))) {
    const inner = m[1];
    if (/<img\b/i.test(inner) && inner.replace(/<[^>]+>/g, "").trim().length < 4) continue;
    const t = E.decodeEntities(inner.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (t.length < 2) continue;
    if (/^\d{4}|^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(t) && t.length < 40) continue;
    paras.push(t);
  }
  return paras.join("\n\n");
}

/** 经济学人：语义 class 精确抽取 */
function extractEconomist(chs) {
  const arts = [];
  chs.forEach(function (c) {
    if (c.words < 120) return;                       // 跳过封面 / 栏目索引页 / 广告页
    const title = byClass(c.html, "te_article_title") || c.title;
    if (!title) return;
    const section = byClass(c.html, "te_section_title") || "";
    const rubric = byClass(c.html, "te_article_rubric") || "";
    const body = paragraphText(c.html);
    if (E.countWords(body) < 100) return;
    arts.push({ section: section, rubric: rubric, title: title, content: body, words: E.countWords(body) });
  });
  return arts;
}

/** 通用启发式：把每个「有标题且够长」的 spine 文件当一篇 */
function extractGeneric(chs, hopts) {
  hopts = hopts || {};
  const minWords = hopts.minWords || 250;
  const arts = [];
  chs.forEach(function (c) {
    if (c.words < minWords) return;
    const title = c.title;
    if (!title) return;
    if (/^(cover|contents|masthead|colophon|advert)/i.test(title)) return;
    const body = paragraphText(c.html) || c.text;
    if (E.countWords(body) < minWords) return;
    // 通用刊没有栏目字段：从正文里找全大写的栏目名（New Yorker 常见 "THE TALK" / "ANNALS OF ..."）
    let section = "";
    const cap = c.text.match(/\n([A-Z][A-Z '&]{3,40})\n/);
    if (cap) section = cap[1].trim().replace(/\s+/g, " ");
    arts.push({ section: section, rubric: "", title: title, content: body, words: E.countWords(body) });
  });
  return arts;
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
  let arts = mag.style === "economist" ? extractEconomist(chs) : extractGeneric(chs);

  // 过滤：太短的（漫画/图表说明）与重复标题
  const seen = {};
  arts = arts.filter(function (a) {
    if (a.words < 120) return false;
    const k = a.title.toLowerCase();
    if (seen[k]) return false;
    seen[k] = 1;
    return true;
  });
  // 长的优先（同时保留一点栏目多样性：按栏目轮转取）
  arts.sort(function (a, b) { return b.words - a.words; });
  const picked = arts.slice(0, mag.maxArticles);
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
      return {
        id: mag.key + "-" + issueDir.issue + "-" + (i + 1),
        section: a.section,
        rubric: a.rubric,
        title: a.title,
        words: a.words,
        content: a.content
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
module.exports = { main, MAGS, extractEconomist, extractGeneric };
