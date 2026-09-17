// 小说导出引擎测试 · v5.9.139
// 覆盖：CRC32 / ZIP 结构 / DOCX OOXML / XLSX OOXML / 分表 / 按章导出 / 文件名
const fs = require("fs");
const vm = require("vm");
const zlib = require("zlib");

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log("  ✗ " + msg); } }
function eq(a, b, msg) { ok(a === b, msg + " (实际 " + JSON.stringify(a) + " ≠ 期望 " + JSON.stringify(b) + ")"); }
function section(t) { console.log("\n▶ " + t); }

const ROOT = "/Users/ichi/WorkBuddy/2026-07-30-21-36-02/pm-workbench-auto";
const SRC = fs.readFileSync(ROOT + "/js/novel-export.js", "utf8");
const SEED = JSON.parse(fs.readFileSync(ROOT + "/data/novel.json", "utf8"));

function mkSandbox() {
  const sb = {
    console, Math, Date, JSON, Object, Array, String, Number, parseInt, parseFloat, isNaN,
    encodeURIComponent, decodeURIComponent, TextEncoder, Uint8Array, Uint16Array, Uint32Array,
    ArrayBuffer, DataView, unescape, escape, setTimeout, clearTimeout
  };
  sb.globalThis = sb;
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(SRC, sb);
  return sb;
}

// ---- 独立 ZIP 解析器（不复用被测代码，确保校验独立）----
const CRC_TABLE = (function () {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; }
  return t;
})();
function refCrc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function parseZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 70000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return { error: "no EOCD" };
  const total = buf.readUInt16LE(eocd + 10);
  const cdOff = buf.readUInt32LE(eocd + 16);
  let p = cdOff;
  const entries = [];
  const problems = [];
  for (let i = 0; i < total; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) { problems.push("bad central signature at " + i); break; }
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28);
    const elen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const off = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nlen).toString("utf8");
    const lhlen = 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28);
    const raw = buf.slice(off + lhlen, off + lhlen + csize);
    let data;
    if (method === 0) data = raw;
    else if (method === 8) { try { data = zlib.inflateRawSync(raw); } catch (e) { problems.push(name + ": inflate failed " + e.message); data = Buffer.alloc(0); } }
    else { problems.push(name + ": unsupported method " + method); data = Buffer.alloc(0); }
    if (data.length !== usize) problems.push(name + ": size mismatch (" + data.length + " ≠ " + usize + ")");
    if (refCrc32(data) !== crc) problems.push(name + ": CRC mismatch");
    entries.push({ name, data, method });
    p += 46 + nlen + elen + clen;
  }
  return { total, entries, problems, eocd };
}
function names(z) { return z.entries.map(e => e.name); }
function entry(z, n) { return z.entries.filter(e => e.name === n)[0]; }
function xmlOk(s) {
  // 轻量良构性检查：标签配对（忽略自闭合、声明、注释、CDATA）
  const stack = [];
  const re = /<(\/?)([A-Za-z_][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  let m;
  const src = String(s).replace(/<\?[\s\S]*?\?>/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
  while ((m = re.exec(src))) {
    const close = m[1] === "/", name = m[2], selfClose = m[4] === "/";
    if (selfClose) continue;
    if (close) {
      if (!stack.length) return { ok: false, why: "多余闭合 </" + name + ">" };
      const top = stack.pop();
      if (top !== name) return { ok: false, why: "标签不匹配：<" + top + "> 对 </" + name + ">" };
    } else stack.push(name);
  }
  if (stack.length) return { ok: false, why: "未闭合：" + stack.slice(-3).join(",") };
  return { ok: true };
}

const sb = mkSandbox();
const E = sb.NvExport;
ok(!!E, "NvExport 已导出到全局");

// ============ A. 基础工具 ============
section("A. CRC32 / 列名 / XML 转义");
const c1 = E.crc32(E.u8("123456789"));
eq(c1 >>> 0, 0xCBF43926, "crc32('123456789') == CBF43926");
eq(refCrc32(Buffer.from("hello world")) >>> 0, E.crc32(E.u8("hello world")) >>> 0, "crc32 与独立实现一致");
eq(E.colName(1), "A", "colName(1) = A");
eq(E.colName(26), "Z", "colName(26) = Z");
eq(E.colName(27), "AA", "colName(27) = AA");
eq(E.colName(52), "AZ", "colName(52) = AZ");
eq(E.colName(53), "BA", "colName(53) = BA");
eq(E.xmlEscape('<a & "b">'), "&lt;a &amp; &quot;b&quot;&gt;", "xmlEscape 转义四类字符");

// ============ B. ZIP 打包器 ============
section("B. ZIP 打包与完整性");
const zipBuf = E.zip([
  { name: "a.txt", data: E.u8("hello") },
  { name: "dir/b.xml", data: E.u8("<r><x>1</x></r>") },
  { name: "中文/名字.txt", data: E.u8("中文内容") }
]);
ok(zipBuf instanceof Uint8Array, "zip 返回 Uint8Array");
const z = parseZip(Buffer.from(zipBuf));
eq(z.total, 3, "ZIP 目录条目数 3");
eq(z.problems.length, 0, "ZIP 无结构问题（CRC/长度）");
ok(names(z).indexOf("中文/名字.txt") >= 0, "UTF-8 文件名往返正确");
eq(Buffer.from(entry(z, "a.txt").data).toString("utf8"), "hello", "条目内容往返正确");

// ============ C. 数据收集 ============
section("C. collect() 分组与过滤");
const m1 = E.collect(SEED, "book_xuanshenji");
eq(m1.book.id, "book_xuanshenji", "collect 定位到书籍");
ok(m1.chapters.length === 6, "荒神祭 6 章");
ok(m1.chars.length === 7, "荒神祭 7 人");
ok(m1.foreshadows.length === 8, "荒神祭 8 条伏笔");
ok(m1.relations.length >= 5, "荒神祭关系已收集");
ok(m1.inspirations.length >= 3, "荒神祭灵感已收集");
ok(m1.materials.length >= 4, "荒神祭素材已收集");
ok(m1.emotions.length >= 2, "荒神祭情绪线已收集");
ok(m1.events.every(e => !e.bookId || e.bookId === "book_xuanshenji"), "事件按书过滤");
ok(m1.chapters.every((c, i, a) => i === 0 || (a[i - 1].num || 0) <= (c.num || 0)), "章节按序号排序");

const m1c = E.collect(SEED, "book_xuanshenji", { chapterId: "ch1_01" });
eq(m1c.chapters.length, 1, "按章筛选只留 1 章");

const m2 = E.collect(SEED, "book_fuguang");
eq(m2.book.id, "book_fuguang", "collect 第二本书");
ok(m2.chapters.length === 6 && m2.chars.length === 5, "浮光 6 章 5 人");

// ============ D. DOCX ============
section("D. DOCX（OOXML）结构与内容");
const dBlocks = E.docxBlocks(m1);
ok(Array.isArray(dBlocks) && dBlocks.length > 10, "docxBlocks 产出块数组");
const dFiles = E.docxFiles(dBlocks, { title: "荒神祭", subject: "s", creator: "c" });
ok(Array.isArray(dFiles), "docxFiles 返回文件数组");
const dMap = {}; dFiles.forEach(f => { dMap[f.name] = f.data; });
const dNames = Object.keys(dMap);
ok(dNames.indexOf("[Content_Types].xml") >= 0, "含 [Content_Types].xml");
ok(dNames.indexOf("_rels/.rels") >= 0, "含 _rels/.rels");
ok(dNames.indexOf("word/document.xml") >= 0, "含 word/document.xml");
ok(dNames.indexOf("word/styles.xml") >= 0, "含 word/styles.xml");
let badXml = [];
dNames.forEach(n => { if (/\.(xml|rels)$/.test(n)) { const r = xmlOk(dMap[n]); if (!r.ok) badXml.push(n + " :: " + r.why); } });
eq(badXml.length, 0, "DOCX 全部 XML 良构");

const docx = Buffer.from(E.docxBytes(SEED, "book_xuanshenji"));
eq(docx.slice(0, 2).toString("latin1"), "PK", "docx 以 PK 开头");
ok(docx.length > 20000, "docx 体积 > 20KB（含正文）");
const dz = parseZip(docx);
eq(dz.problems.length, 0, "docx ZIP 完整性 OK");
const docXml = Buffer.from(entry(dz, "word/document.xml").data).toString("utf8");
ok(docXml.indexOf("荒神祭") >= 0, "正文含书名");
ok(docXml.indexOf("林渊") >= 0, "正文含人物");
ok(docXml.indexOf("灭门之夜") >= 0, "正文含章节标题");
ok(docXml.indexOf("w:tbl") >= 0, "正文含表格（设定/关系）");
ok(/w:pStyle/.test(docXml), "使用样式引用");
ok(docXml.indexOf("半截残玉") >= 0, "含伏笔内容");
const r = xmlOk(docXml);
ok(r.ok, "document.xml 良构" + (r.ok ? "" : " :: " + r.why));

const chapDocx = Buffer.from(E.docxBytes(SEED, "book_xuanshenji", { chapterId: "ch1_01" }));
const cz = parseZip(chapDocx);
const cXml = Buffer.from(entry(cz, "word/document.xml").data).toString("utf8");
ok(cXml.indexOf("灭门之夜") >= 0, "单章导出含该章");
ok(cXml.indexOf("圣女姜禾") < 0, "单章导出不含其它章");

// ============ E. XLSX ============
section("E. XLSX（OOXML）工作表结构");
const sheets = E.xlsxSheets(m1);
const xFiles = E.xlsxFiles(sheets, { title: "荒神祭", subject: "s", creator: "c" });
ok(Array.isArray(xFiles), "xlsxFiles 返回文件数组");
const xMap = {}; xFiles.forEach(f => { xMap[f.name] = f.data; });
const xNames = Object.keys(xMap);
ok(xNames.indexOf("[Content_Types].xml") >= 0, "xlsx 含 [Content_Types].xml");
ok(xNames.indexOf("xl/workbook.xml") >= 0, "xlsx 含 xl/workbook.xml");
ok(xNames.filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).length >= 8, "至少 8 张工作表");
badXml = [];
xNames.forEach(n => { if (/\.(xml|rels)$/.test(n)) { const rr = xmlOk(xMap[n]); if (!rr.ok) badXml.push(n + " :: " + rr.why); } });
eq(badXml.length, 0, "XLSX 全部 XML 良构");

ok(sheets.length >= 8, "工作表定义 ≥ 8");
const sheetNames = sheets.map(s => s.name);
["概览", "章节", "人物", "关系", "时间线", "伏笔", "情绪线", "灵感", "素材"].forEach(n => ok(sheetNames.some(s => s.indexOf(n) >= 0), "含工作表：" + n));
ok(sheets.every(s => Array.isArray(s.header) && s.header.length >= 2), "每张表都有表头");
ok(sheets.every(s => Array.isArray(s.rows)), "每张表都有数据区");
const chapterSheet = sheets.filter(s => s.name === "章节")[0];
ok(chapterSheet.rows.length >= 6, "章节表含 6 行数据");
ok(chapterSheet.header.some(c => String(c).indexOf("字数") >= 0), "章节表含字数列");
const charSheet = sheets.filter(s => s.name === "人物")[0];
ok(charSheet.rows.length >= 7, "人物表含 7 人数据");
ok(charSheet.header.some(c => String(c).indexOf("弧光") >= 0), "人物表含弧光列");
const relSheet = sheets.filter(s => s.name.indexOf("关系") >= 0)[0];
ok(relSheet.rows.length >= 5, "关系表含数据");
ok(relSheet.header.some(c => String(c).indexOf("矛盾") >= 0), "关系表含核心矛盾列");

const xbuf = Buffer.from(E.xlsxBytes(SEED, "book_xuanshenji"));
eq(xbuf.slice(0, 2).toString("latin1"), "PK", "xlsx 以 PK 开头");
ok(xbuf.length > 10000, "xlsx 体积 > 10KB");
const xz = parseZip(xbuf);
eq(xz.problems.length, 0, "xlsx ZIP 完整性 OK");
const xDoc = Buffer.from(entry(xz, "xl/workbook.xml").data).toString("utf8");
ok(xDoc.indexOf("章节") >= 0 && xDoc.indexOf("人物") >= 0, "workbook.xml 含表名");
const sheet1 = Buffer.from(entry(xz, "xl/worksheets/sheet1.xml").data).toString("utf8");
ok(/<row /.test(sheet1) && /<c /.test(sheet1), "sheet1 含行列单元");
ok(/r="A1"/.test(sheet1), "含 A1 单元引用");

// ============ F. 文件名 / 落盘辅助 ============
section("F. 文件名与导出辅助");
const fn1 = E.fileName(m1.book.title, "正文与设定", "docx");
ok(/\.docx$/.test(fn1), "docx 文件名后缀正确");
ok(fn1.indexOf("荒神祭") >= 0, "docx 文件名含书名");
ok(!/[\\/:*?"<>|]/.test(fn1), "文件名不含非法字符");
const fn2 = E.fileName(m1.book.title, "全量数据", "xlsx");
ok(/\.xlsx$/.test(fn2), "xlsx 文件名后缀正确");
ok(/\d{8}/.test(fn2), "文件名含日期戳");
eq(E.fileName('a/b:c*d?e"f<g>h i', "x", "docx").indexOf("/"), -1, "非法字符被替换");
ok(typeof E.toBlob === "function", "toBlob 暴露");

// ============ G. 边界 ============
section("G. 空数据 / 缺字段边界");
const emptyData = { books: [{ id: "b0", title: "空书" }], chapters: [], chars: [], events: [], foreshadows: [], reviews: [] };
let e1 = null, e2 = null, eErr = "";
try { e1 = Buffer.from(E.docxBytes(emptyData, "b0")); } catch (err) { eErr = err.message; }
try { e2 = Buffer.from(E.xlsxBytes(emptyData, "b0")); } catch (err) { eErr += " | " + err.message; }
eq(eErr, "", "空数据不抛错");
ok(e1 && parseZip(e1).problems.length === 0, "空书 docx 仍为合法 ZIP");
ok(e2 && parseZip(e2).problems.length === 0, "空书 xlsx 仍为合法 ZIP");
const unk = parseZip(Buffer.from(E.docxBytes(SEED, "不存在的书")));
eq(unk.problems.length, 0, "未知书 id 回退首本且结构合法");
const noTables = E.collect({ books: [{ id: "x", title: "X" }] }, "x");
eq(noTables.relations.length, 0, "缺 relations 表不报错");
ok(Array.isArray(noTables.inspirations) && Array.isArray(noTables.materials) && Array.isArray(noTables.emotions), "缺表返回空数组");

console.log("\n=== 通过 " + pass + " / 失败 " + fail + " ===");
process.exit(fail === 0 ? 0 : 1);
