#!/usr/bin/env node
/**
 * lib_epub.js —— 极简 EPUB/ZIP 读取器 + XHTML→纯文本
 *
 * 为什么不用现成库：
 * - 仓库里的外刊 epub 由第三方工具生成，Info-ZIP 的 `unzip` 会报
 *   "bad zipfile offset (local header sig)"（Info-ZIP 依赖本地头位置自洽）。
 *   我们只依赖 EOCD → 中央目录 → 本地头的标准链路，逐条读字节流，
 *   并显式校验三段签名，损坏文件立刻抛错而不是静默产出空文章。
 * - 沙箱里没装 adm-zip 等 npm 包，也不希望为一次周更引入依赖树。
 *
 * 校验约定（downloadOk 请配合使用）：
 *   offset 0 必须是 "PK\x03\x04"（本地头），否则说明下到的是 GitHub 的
 *   HTML 错误页 —— 这正是 9/20 首次抓取踩到的坑（续传把 HTML 拼在了 zip 前面）。
 */
const zlib = require("zlib");

const SIG_LOCAL = 0x04034b50;
const SIG_CD = 0x02014b50;
const SIG_EOCD = 0x06054b50;

/** 读取中央目录，返回 [{name, method, csize, usize, lho}] */
function listEntries(buf) {
  let eocd = -1;
  const from = Math.max(0, buf.length - 66000);
  for (let i = buf.length - 22; i >= from; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("不是有效的 zip/epub：找不到 EOCD");
  const cnt = buf.readUInt16LE(eocd + 10);
  const cdOff = buf.readUInt32LE(eocd + 16);
  if (cdOff >= buf.length || buf.readUInt32LE(cdOff) !== SIG_CD) {
    throw new Error("中央目录签名不符，文件可能被截断或前置了非 zip 内容");
  }
  let p = cdOff;
  const out = [];
  for (let k = 0; k < cnt; k++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== SIG_CD) break;
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nl = buf.readUInt16LE(p + 28);
    const el = buf.readUInt16LE(p + 30);
    const cl = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nl).toString("utf8");
    out.push({ name, method, csize, usize, lho });
    p += 46 + nl + el + cl;
  }
  return out;
}

/** 按中央目录条目读取并解压，返回 Buffer */
function readEntry(buf, e) {
  const p = e.lho;
  if (p + 30 > buf.length || buf.readUInt32LE(p) !== SIG_LOCAL) {
    throw new Error("本地头签名不符: " + e.name);
  }
  const nl = buf.readUInt16LE(p + 26);
  const el = buf.readUInt16LE(p + 28);
  const start = p + 30 + nl + el;
  const data = buf.slice(start, start + e.csize);
  if (e.method === 0) return data;
  if (e.method === 8) return zlib.inflateRawSync(data);
  throw new Error("不支持的压缩方式 " + e.method + ": " + e.name);
}

/** 下载后的字节流是否是一个可解析的 epub（而非 GitHub 的 HTML 错误页） */
function looksLikeZip(buf) {
  if (!buf || buf.length < 100) return false;
  if (buf.readUInt32LE(0) !== SIG_LOCAL) return false;
  try { listEntries(buf); return true; } catch (_) { return false; }
}

const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ldquo: "\u201c", rdquo: "\u201d", lsquo: "\u2018", rsquo: "\u2019",
  mdash: "\u2014", ndash: "\u2013", hellip: "\u2026", middot: "\u00b7",
  eacute: "\u00e9", egrave: "\u00e8", agrave: "\u00e0", ccedil: "\u00e7",
  uuml: "\u00fc", ouml: "\u00f6", auml: "\u00e4", szlig: "\u00df",
  quot2: '"', "#39": "'", times: "\u00d7", laquo: "\u00ab", raquo: "\u00bb",
  copy: "\u00a9", reg: "\u00ae", trade: "\u2122", deg: "\u00b0", pound: "\u00a3",
  euro: "\u20ac", yen: "\u00a5", bull: "\u2022", dagger: "\u2020", prime: "\u2032"
};

function decodeEntities(s) {
  return String(s).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, function (m, ent) {
    if (ent[0] === "#") {
      const code = ent[1] === "x" || ent[1] === "X"
        ? parseInt(ent.slice(2), 16)
        : parseInt(ent.slice(1), 10);
      if (!isFinite(code) || code < 0 || code > 0x10ffff) return m;
      try { return String.fromCodePoint(code); } catch (_) { return m; }
    }
    const k = ent.toLowerCase();
    return Object.prototype.hasOwnProperty.call(ENTITIES, k) ? ENTITIES[k] : m;
  });
}

/** 剥标签（可反复调用：calibre 生成的 epub 里存在 &lt;em&gt; 这类二次转义） */
function stripTags(s) { return String(s).replace(/<[^>]*>/g, " "); }
/** 归一空白 */
function squash(s) { return String(s).replace(/\s+/g, " ").trim(); }

/**
 * 文本清洗：解实体 → 再剥一次标签。
 * 顺序很关键：epub 里常见 &lt;em&gt;标题&lt;/em&gt;，
 * 若只「先剥标签再解实体」，解码后会凭空冒出一对真标签（首跑真实事故：
 * Atlantic 标题渲染成 `Why <em>Widow's Bay</em> Is the Show of the Summer`）。
 */
function cleanText(s) { return squash(stripTags(decodeEntities(s))); }

/**
 * XHTML → 纯文本。
 * 先把块级标签换成换行，再剥标签、解实体、压空白。
 * 不引入 DOM：epub 内的 xhtml 由工具生成，结构规整，正则足够，
 * 且能避免在沙箱里为一次周更拉起 jsdom。
 */
function htmlToText(html) {
  let s = String(html);
  s = s.replace(/<\?xml[\s\S]*?\?>/g, "");
  s = s.replace(/<!DOCTYPE[\s\S]*?>/gi, "");
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, " ");
  // 块级 → 换行
  s = s.replace(/<\/?(p|div|section|article|li|ul|ol|tr|blockquote|figure|figcaption|h[1-6]|br|hr)\b[^>]*>/gi, "\n");
  s = stripTags(s);
  s = decodeEntities(s);
  s = stripTags(s);          // 解实体后再剥一次（处理 &lt;em&gt; 二次转义）
  s = s.replace(/\u00a0/g, " ");
  s = s.replace(/[ \t\f\v]+/g, " ");
  s = s.replace(/ *\n */g, "\n");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

/** 抽取 <title> / 第一个 h1-h3 作为文章标题 */
function extractTitle(html) {
  const m = String(html).match(/<h[123][^>]*>([\s\S]*?)<\/h[123]>/i);
  if (m) {
    const t = cleanText(m[1]);
    if (t) return t;
  }
  const t2 = String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (t2) {
    const t = cleanText(t2[1]);
    if (t) return t;
  }
  return "";
}

/** 按出现顺序返回所有 h1-h3 文本（Atlantic/Wired 这类 calibre epub 用 [0]=标题 [1]=副题） */
function extractHeadings(html) {
  const out = [];
  const re = /<h[123][^>]*>([\s\S]*?)<\/h[123]>/gi;
  let m;
  while ((m = re.exec(String(html)))) {
    const t = cleanText(m[1]);
    if (t) out.push(t);
  }
  return out;
}

/** 词数（英文按空白切分） */
function countWords(s) {
  const t = String(s || "").trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

/** 解析 container.xml，返回 OPF 路径 */
function opfPath(buf, entries) {
  const c = entries.find(function (e) { return /META-INF\/container\.xml$/i.test(e.name); });
  if (!c) throw new Error("epub 缺少 META-INF/container.xml");
  const xml = readEntry(buf, c).toString("utf8");
  const m = xml.match(/full-path\s*=\s*"([^"]+)"/i);
  if (!m) throw new Error("container.xml 里找不到 rootfile full-path");
  return m[1];
}

/**
 * 解析 OPF：返回 {title, chapters:[{href, id}]}（按 spine 顺序）
 * chapters 已解析成相对 OPF 的绝对路径。
 */
function parseOpf(buf, entries) {
  const opf = opfPath(buf, entries);
  const ent = entries.find(function (e) { return e.name === opf; });
  if (!ent) throw new Error("OPF 不存在: " + opf);
  const xml = readEntry(buf, ent).toString("utf8");
  const baseDir = opf.replace(/[^/]+$/, "");

  const manifest = {};
  const mre = /<item\b[^>]*>/gi;
  let m;
  while ((m = mre.exec(xml))) {
    const tag = m[0];
    const id = (tag.match(/\bid\s*=\s*"([^"]*)"/i) || [])[1];
    const href = (tag.match(/\bhref\s*=\s*"([^"]*)"/i) || [])[1];
    const mt = (tag.match(/media-type\s*=\s*"([^"]*)"/i) || [])[1] || "";
    if (id && href) manifest[id] = { href: decodeEntities(href), mediaType: mt };
  }

  const spine = [];
  const sre = /<itemref\b[^>]*>/gi;
  while ((m = sre.exec(xml))) {
    const idref = (m[0].match(/\bidref\s*=\s*"([^"]*)"/i) || [])[1];
    if (idref && manifest[idref]) spine.push(manifest[idref].href);
  }

  const titleM = xml.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i);
  const title = titleM ? decodeEntities(titleM[1]).trim() : "";

  const chapters = spine.map(function (h) {
    const clean = h.split("#")[0];
    return { href: baseDir + clean, id: clean };
  });
  return { title, chapters };
}

module.exports = {
  listEntries, readEntry, looksLikeZip, htmlToText, extractTitle, extractHeadings,
  countWords, parseOpf, decodeEntities, stripTags, cleanText
};
