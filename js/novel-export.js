/* ============================================
 * 小说创作 · 导出引擎 v1.0 (v5.9.137)
 * 零依赖纯前端：自实现 CRC32 + store-only ZIP → 真 OOXML
 *   · Word  .docx  —— 设定集 / 大纲 / 幕后卡片 / 正文 / 评审
 *   · Excel .xlsx  —— 10 张表（概览 章节 人物 关系 时间线 伏笔 情绪线 灵感 素材 评审）
 * API：
 *   NvExport.docxBytes(data, bookId, opts)  -> Uint8Array
 *   NvExport.xlsxBytes(data, bookId, opts)  -> Uint8Array
 *   NvExport.save(bytes, filename, mime)
 *   NvExport.fileName(title, kind)
 * ============================================ */
(function (root) {
  "use strict";
  if (root.NvExport) return;

  // ============================================================
  // A. 字节 / XML 基础工具
  // ============================================================
  function u8(str) {
    str = String(str == null ? "" : str);
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(str);
    var bin = unescape(encodeURIComponent(str));
    var a = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return a;
  }
  function clean(s) {
    return String(s == null ? "" : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  }
  function xmlEscape(s) {
    return clean(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }
  function arr(v) { return Array.isArray(v) ? v : (v == null || v === "" ? [] : [v]); }
  function join(v, sep) {
    var a = arr(v);
    var out = [];
    a.forEach(function (x) {
      if (x == null) return;
      var s = (typeof x === "object") ? (x.name || x.title || x.text || x.label || JSON.stringify(x)) : String(x);
      if (s) out.push(s);
    });
    return out.join(sep || "、");
  }
  function n2(v) { var n = parseInt(v, 10); return isNaN(n) ? 0 : n; }

  // ============================================================
  // B. CRC32 + ZIP（store，无压缩）
  // ============================================================
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(buf) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function le(n, bytes) {
    var a = new Array(bytes);
    for (var i = 0; i < bytes; i++) a[i] = (n >>> (8 * i)) & 0xFF;
    return a;
  }
  function zip(files) {
    var DOS_TIME = 0, DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
    var parts = [], central = [], offset = 0;
    files.forEach(function (f) {
      var name = u8(f.name);
      var data = (typeof f.data === "string") ? u8(f.data) : f.data;
      var crc = crc32(data), len = data.length;
      var local = [].concat(
        le(0x04034b50, 4), le(20, 2), le(0, 2), le(0, 2), le(DOS_TIME, 2), le(DOS_DATE, 2),
        le(crc, 4), le(len, 4), le(len, 4), le(name.length, 2), le(0, 2)
      );
      parts.push(new Uint8Array(local), name, data);
      central.push({ name: name, crc: crc, len: len, offset: offset });
      offset += local.length + name.length + len;
    });
    var cdParts = [], cdSize = 0;
    central.forEach(function (e) {
      var rec = [].concat(
        le(0x02014b50, 4), le(20, 2), le(20, 2), le(0, 2), le(0, 2), le(DOS_TIME, 2), le(DOS_DATE, 2),
        le(e.crc, 4), le(e.len, 4), le(e.len, 4), le(e.name.length, 2), le(0, 2), le(0, 2),
        le(0, 2), le(0, 2), le(0, 4), le(e.offset, 4)
      );
      cdParts.push(new Uint8Array(rec), e.name);
      cdSize += rec.length + e.name.length;
    });
    var eocd = new Uint8Array([].concat(
      le(0x06054b50, 4), le(0, 2), le(0, 2), le(central.length, 2), le(central.length, 2),
      le(cdSize, 4), le(offset, 4), le(0, 2)
    ));
    var all = parts.concat(cdParts, [eocd]);
    var total = 0;
    all.forEach(function (p) { total += p.length; });
    var out = new Uint8Array(total), pos = 0;
    all.forEach(function (p) { out.set(p, pos); pos += p.length; });
    return out;
  }

  // ============================================================
  // C. Word（OOXML docx）
  // ============================================================
  var W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

  var CT_DOCX = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
    '</Types>';

  var RELS_DOCX = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
    '</Relationships>';

  var DOC_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '</Relationships>';

  var STYLES_DOCX = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:docDefaults><w:rPrDefault><w:rPr>' +
    '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="宋体" w:cs="Times New Roman"/>' +
    '<w:sz w:val="21"/><w:szCs w:val="21"/>' +
    '</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr>' +
    '<w:spacing w:after="90" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/>' +
    '<w:pPr><w:jc w:val="center"/><w:spacing w:before="2400" w:after="200"/></w:pPr>' +
    '<w:rPr><w:rFonts w:eastAsia="黑体"/><w:b/><w:sz w:val="56"/><w:szCs w:val="56"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/>' +
    '<w:pPr><w:jc w:val="center"/><w:spacing w:after="120"/></w:pPr>' +
    '<w:rPr><w:color w:val="6B7280"/><w:sz w:val="24"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>' +
    '<w:pPr><w:outlineLvl w:val="0"/><w:spacing w:before="400" w:after="160"/><w:pBdr><w:bottom w:val="single" w:sz="8" w:space="2" w:color="9CA3AF"/></w:pBdr></w:pPr>' +
    '<w:rPr><w:rFonts w:eastAsia="黑体"/><w:b/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>' +
    '<w:pPr><w:outlineLvl w:val="1"/><w:spacing w:before="280" w:after="120"/></w:pPr>' +
    '<w:rPr><w:rFonts w:eastAsia="黑体"/><w:b/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>' +
    '<w:pPr><w:outlineLvl w:val="2"/><w:spacing w:before="200" w:after="100"/></w:pPr>' +
    '<w:rPr><w:b/><w:sz w:val="23"/><w:szCs w:val="23"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/>' +
    '<w:pPr><w:ind w:left="480" w:right="480"/><w:spacing w:after="120"/></w:pPr>' +
    '<w:rPr><w:i/><w:color w:val="6B7280"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="Caption"/><w:basedOn w:val="Normal"/><w:qFormat/>' +
    '<w:pPr><w:spacing w:after="60"/></w:pPr>' +
    '<w:rPr><w:color w:val="6B7280"/><w:sz w:val="18"/></w:rPr></w:style>' +
    '</w:styles>';

  function WRuns(text, bold) {
    var lines = clean(text).split("\n");
    var rpr = bold ? "<w:rPr><w:b/></w:rPr>" : "";
    var out = "";
    lines.forEach(function (seg, i) {
      if (i > 0) out += "<w:br/>";
      out += "<w:r>" + rpr + '<w:t xml:space="preserve">' + xmlEscape(seg) + "</w:t></w:r>";
    });
    return out || '<w:r><w:t xml:space="preserve"></w:t></w:r>';
  }
  function WPara(text, style, opts) {
    opts = opts || {};
    var pr = "";
    if (style || opts.after != null || opts.jc) {
      pr = "<w:pPr>";
      if (style) pr += '<w:pStyle w:val="' + style + '"/>';
      if (opts.jc) pr += '<w:jc w:val="' + opts.jc + '"/>';
      if (opts.after != null) pr += '<w:spacing w:after="' + opts.after + '"/>';
      pr += "</w:pPr>";
    }
    return "<w:p>" + pr + WRuns(text, opts.bold) + "</w:p>";
  }
  function WPageBreak() { return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'; }

  function WCell(text, width, opts) {
    opts = opts || {};
    var tcPr = '<w:tcPr><w:tcW w:w="' + width + '" w:type="dxa"/>' +
      (opts.fill ? '<w:shd w:val="clear" w:color="auto" w:fill="' + opts.fill + '"/>' : "") +
      '<w:vAlign w:val="center"/></w:tcPr>';
    return "<w:tc>" + tcPr +
      '<w:p><w:pPr><w:spacing w:before="20" w:after="20" w:line="264" w:lineRule="auto"/></w:pPr>' +
      WRuns(text, opts.bold) + "</w:p></w:tc>";
  }
  var TBL_BORDERS = '<w:tblBorders>' +
    '<w:top w:val="single" w:sz="6" w:space="0" w:color="D1D5DB"/>' +
    '<w:left w:val="single" w:sz="6" w:space="0" w:color="D1D5DB"/>' +
    '<w:bottom w:val="single" w:sz="6" w:space="0" w:color="D1D5DB"/>' +
    '<w:right w:val="single" w:sz="6" w:space="0" w:color="D1D5DB"/>' +
    '<w:insideH w:val="single" w:sz="6" w:space="0" w:color="D1D5DB"/>' +
    '<w:insideV w:val="single" w:sz="6" w:space="0" w:color="D1D5DB"/>' +
    '</w:tblBorders>';
  function WTable(header, rows, widths) {
    var TOTAL = 9360;
    var cols = (header && header.length) || (rows[0] && rows[0].length) || 1;
    var w = [];
    if (widths && widths.length === cols) {
      w = widths.slice();
    } else {
      var each = Math.floor(TOTAL / cols);
      for (var i = 0; i < cols; i++) w.push(i === cols - 1 ? TOTAL - each * (cols - 1) : each);
    }
    var out = '<w:tbl><w:tblPr><w:tblW w:w="' + TOTAL + '" w:type="dxa"/><w:tblLayout w:type="fixed"/>' +
      TBL_BORDERS + '</w:tblPr><w:tblGrid>' +
      w.map(function (x) { return '<w:gridCol w:w="' + x + '"/>'; }).join("") + "</w:tblGrid>";
    if (header && header.length) {
      out += "<w:tr>" + header.map(function (h, i) {
        return WCell(h, w[i], { bold: true, fill: "F3F4F6" });
      }).join("") + "</w:tr>";
    }
    (rows || []).forEach(function (r) {
      out += "<w:tr>" + w.map(function (width, i) {
        return WCell(r[i] == null ? "" : r[i], width);
      }).join("") + "</w:tr>";
    });
    out += "</w:tbl>" + WPara("", null, { after: 60 });
    return out;
  }
  function wBlock(b) {
    if (!b) return "";
    switch (b.t) {
      case "title": return WPara(b.text, "Title", { bold: true });
      case "subtitle": return WPara(b.text, "Subtitle", { jc: "center" });
      case "h1": return WPara(b.text, "Heading1");
      case "h2": return WPara(b.text, "Heading2");
      case "h3": return WPara(b.text, "Heading3");
      case "caption": return WPara(b.text, "Caption");
      case "quote": return WPara(b.text, "Quote");
      case "pb": return WPageBreak();
      case "p": return WPara(b.text, null, { bold: !!b.bold });
      case "table": return WTable(b.header, b.rows, b.widths);
      case "kv": return WTable(["项目", "内容"], b.rows, [2200, 7160]);
      case "bullets": return (b.items || []).map(function (x) { return WPara("· " + x); }).join("");
      default: return WPara(b.text || "");
    }
  }
  function coreXml(meta) {
    meta = meta || {};
    var now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
      'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      "<dc:title>" + xmlEscape(meta.title || "") + "</dc:title>" +
      "<dc:subject>" + xmlEscape(meta.subject || "") + "</dc:subject>" +
      "<dc:creator>" + xmlEscape(meta.creator || "PM 工作台") + "</dc:creator>" +
      "<cp:lastModifiedBy>" + xmlEscape(meta.creator || "PM 工作台") + "</cp:lastModifiedBy>" +
      '<dcterms:created xsi:type="dcterms:W3CDTF">' + now + "</dcterms:created>" +
      '<dcterms:modified xsi:type="dcterms:W3CDTF">' + now + "</dcterms:modified>" +
      "</cp:coreProperties>";
  }
  var APP_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ' +
    'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
    "<Application>PM Workbench Novel Studio</Application></Properties>";

  function docxFiles(blocks, meta) {
    var body = blocks.map(wBlock).join("");
    body += '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
      '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="851" w:footer="992" w:gutter="0"/>' +
      "</w:sectPr>";
    var docXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      "<w:document " + W_NS + "><w:body>" + body + "</w:body></w:document>";
    return [
      { name: "[Content_Types].xml", data: CT_DOCX },
      { name: "_rels/.rels", data: RELS_DOCX },
      { name: "word/document.xml", data: docXml },
      { name: "word/styles.xml", data: STYLES_DOCX },
      { name: "word/_rels/document.xml.rels", data: DOC_RELS },
      { name: "docProps/core.xml", data: coreXml(meta) },
      { name: "docProps/app.xml", data: APP_XML }
    ];
  }

  // ============================================================
  // D. Excel（OOXML xlsx）
  // ============================================================
  var CT_XLSX_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>';
  var RELS_XLSX = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
    '</Relationships>';

  var STYLES_XLSX = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="2">' +
    '<font><sz val="11"/><color theme="1"/><name val="等线"/><family val="2"/></font>' +
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="等线"/><family val="2"/></font>' +
    '</fonts>' +
    '<fills count="3">' +
    '<fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF4F46E5"/><bgColor indexed="64"/></patternFill></fill>' +
    '</fills>' +
    '<borders count="2"><border/>' +
    '<border><left style="thin"><color rgb="FFD1D5DB"/></left><right style="thin"><color rgb="FFD1D5DB"/></right>' +
    '<top style="thin"><color rgb="FFD1D5DB"/></top><bottom style="thin"><color rgb="FFD1D5DB"/></bottom></border>' +
    '</borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="4">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  function colName(n) {
    var s = "";
    while (n > 0) {
      var m = (n - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s || "A";
  }
  function xCell(ref, val, s) {
    if (typeof val === "number" && isFinite(val)) return '<c r="' + ref + '" s="' + s + '"><v>' + val + "</v></c>";
    var t = clean(val);
    if (t === "") return '<c r="' + ref + '" s="' + s + '"/>';
    return '<c r="' + ref + '" s="' + s + '" t="inlineStr"><is><t xml:space="preserve">' + xmlEscape(t) + "</t></is></c>";
  }
  function sheetXml(sheet) {
    var header = sheet.header || [];
    var rows = sheet.rows || [];
    var cols = Math.max(header.length, 1);
    (rows.forEach ? rows : []).forEach(function (r) { if (r && r.length > cols) cols = r.length; });
    var widths = sheet.widths && sheet.widths.length ? sheet.widths : [];
    var out = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetViews><sheetView workbookViewId="0">' +
      '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
      "</sheetView></sheetViews>" +
      '<sheetFormatPr defaultRowHeight="16"/>';
    var colXml = "";
    for (var i = 0; i < cols; i++) {
      var w = widths[i] || (i === 0 ? 10 : 20);
      colXml += '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>';
    }
    if (colXml) out += "<cols>" + colXml + "</cols>";
    out += "<sheetData>";
    if (header.length) {
      out += '<row r="1" ht="24" customHeight="1">' + header.map(function (h, i) {
        return xCell(colName(i + 1) + "1", h, 1);
      }).join("") + "</row>";
    }
    var startRow = header.length ? 2 : 1;
    rows.forEach(function (r, ri) {
      var rn = startRow + ri;
      var cells = "";
      for (var ci = 0; ci < cols; ci++) {
        var v = r ? r[ci] : "";
        var st = (typeof v === "number" && isFinite(v)) ? 3 : 2;
        cells += xCell(colName(ci + 1) + rn, v, st);
      }
      out += '<row r="' + rn + '">' + cells + "</row>";
    });
    out += "</sheetData></worksheet>";
    return out;
  }
  function safeSheetName(name, used) {
    var s = clean(name).replace(/[\[\]\*\?\/\\:]/g, "-").slice(0, 28) || "Sheet";
    var base = s, i = 2;
    while (used[s]) { s = base.slice(0, 26) + "-" + i; i++; }
    used[s] = 1;
    return s;
  }
  function xlsxFiles(sheets, meta) {
    var used = {};
    var names = sheets.map(function (s) { return safeSheetName(s.name, used); });
    var ct = CT_XLSX_HEAD;
    sheets.forEach(function (s, i) {
      ct += '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ' +
        'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
    });
    ct += "</Types>";

    var wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      sheets.map(function (s, i) {
        return '<sheet name="' + xmlEscape(names[i]) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
      }).join("") + "</sheets></workbook>";

    var wbRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map(function (s, i) {
        return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" ' +
          'Target="worksheets/sheet' + (i + 1) + '.xml"/>';
      }).join("") +
      '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      "</Relationships>";

    var files = [
      { name: "[Content_Types].xml", data: ct },
      { name: "_rels/.rels", data: RELS_XLSX },
      { name: "xl/workbook.xml", data: wb },
      { name: "xl/_rels/workbook.xml.rels", data: wbRels },
      { name: "xl/styles.xml", data: STYLES_XLSX },
      { name: "docProps/core.xml", data: coreXml(meta) },
      { name: "docProps/app.xml", data: APP_XML }
    ];
    sheets.forEach(function (s, i) {
      files.push({ name: "xl/worksheets/sheet" + (i + 1) + ".xml", data: sheetXml(s) });
    });
    return files;
  }

  // ============================================================
  // E. 数据模型 → 导出内容
  // ============================================================
  function chapterSort(a, b) { return n2(a.num) - n2(b.num); }
  function reviewOf(data, chId) {
    var r = (data.reviews || []).filter(function (x) { return x.chapterId === chId; });
    return r.length ? r[r.length - 1] : null;
  }
  function specLine(ch) {
    var L = [];
    if (ch.spec) {
      if (arr(ch.spec.must_happen).length) L.push("必须发生：" + join(ch.spec.must_happen, "；"));
      if (arr(ch.spec.key_scenes).length) L.push("关键场景：" + join(ch.spec.key_scenes, "；"));
      if (arr(ch.spec.new_hooks).length) L.push("新钩子：" + join(ch.spec.new_hooks, "；"));
      if (arr(ch.spec.tension).length) {
        L.push("张力曲线：" + ch.spec.tension.map(function (t) { return "p" + t.position + "=" + t.value; }).join(" → "));
      }
    }
    if (ch.goal) L.unshift("本章目标：" + ch.goal);
    return L.join("\n");
  }
  function charCardRows(c) {
    var card = c.card || {};
    var rows = [
      ["角色定位", c.role || ""],
      ["年龄", c.age || ""],
      ["职业", c.job || ""],
      ["城市", c.city || ""],
      ["性格关键词", join(c.personality || c.traits)],
      ["核心欲望", c.desire || ""],
      ["核心恐惧", c.fear || card.fear || ""],
      ["人物缺陷", c.flaw || ""],
      ["爱情观", c.loveView || ""],
      ["习惯", join(c.habits)],
      ["外貌", card.appearance || ""],
      ["秘密", join(c.secrets) || card.secret || ""],
      ["口头禅", card.catchphrase || ""]
    ];
    var arc = "";
    if (card.arcStart || card.arcEnd) {
      arc = [card.arcStart, card.arcConflict, card.arcTurn, card.arcEnd].filter(Boolean).join("  →  ");
    } else if (c.arc) {
      arc = c.arc;
    }
    rows.push(["成长弧光", arc]);
    (c.relationships || []).forEach(function (r) {
      if (r) rows.push(["关系 · " + (r.with || ""), (r.type || "") + (r.note ? "（" + r.note + "）" : "")]);
    });
    return rows.filter(function (r) { return String(r[1] || "").trim() !== ""; });
  }

  // 归属判定：显式 bookId 优先；缺失时按 id 前缀 cN_/chN_/fsN_ 映射到第 N 本书
  function belongs(item, bid, books) {
    if (!bid) return true;
    if (!item) return false;
    if (item.bookId) return item.bookId === bid;
    var idx = books.map(function (b) { return b.id; }).indexOf(bid);
    if (idx < 0) return true;
    var m = String(item.id || "").match(/^[a-z]+(\d+)_/i);
    if (m) return parseInt(m[1], 10) === idx + 1;
    return true;
  }
  function collect(data, bookId, opts) {
    opts = opts || {};
    data = data || {};
    var books = data.books || [];
    var book = books.filter(function (b) { return b.id === bookId; })[0] || books[0] || {};
    var bid = book.id;
    var byBook = function (list) { return (list || []).filter(function (x) { return belongs(x, bid, books); }); };
    var chapters = byBook(data.chapters).sort(chapterSort);
    if (opts.chapterId) chapters = chapters.filter(function (c) { return c.id === opts.chapterId; });
    var chars = byBook(data.chars);
    var relations = byBook(data.relations);
    var events = byBook(data.events);
    var foreshadows = byBook(data.foreshadows);
    var inspirations = byBook(data.inspirations);
    var materials = byBook(data.materials);
    var emotions = byBook(data.emotions);
    return {
      book: book, chapters: chapters, chars: chars, relations: relations, events: events,
      foreshadows: foreshadows, inspirations: inspirations, materials: materials, emotions: emotions,
      reviews: data.reviews || []
    };
  }

  var FS_LABEL = { setup: "已埋", pending: "待兑", paid: "已兑", lost: "遗失" };
  function fsLabel(s) { return FS_LABEL[s] || s || ""; }
  function wordsOf(s) { var m = String(s || "").match(/[\u4e00-\u9fff]/g); return m ? m.length : 0; }
  function totalWords(chs) { var t = 0; chs.forEach(function (c) { t += wordsOf(c.draft); }); return t; }

  // ---------- Word 文档块 ----------
  function docxBlocks(m, opts) {
    opts = opts || {};
    var b = m.book || {};
    var scoped = opts.chapterId ? "chapter" : "book";
    var B = [];
    B.push({ t: "title", text: b.title || "未命名小说" });
    var sub = [b.genre, b.style, b.pov === "first" ? "第一人称" : "第三人称"].filter(Boolean).join(" · ");
    B.push({ t: "subtitle", text: sub + "　|　共 " + m.chapters.length + " 章　" + totalWords(m.chapters) + " 字" });
    B.push({ t: "caption", text: "导出时间 " + new Date().toLocaleString("zh-CN") + " · PM 工作台 小说创作" });
    B.push({ t: "pb" });

    if (scoped === "book") {
      B.push({ t: "h1", text: "一、故事总纲" });
      B.push({
        t: "kv", rows: [
          ["一句话故事", b.oneLiner || ""],
          ["主题", join(b.themes)],
          ["类型", b.genre || ""],
          ["风格", b.style || ""],
          ["叙事视角", b.pov === "first" ? "第一人称（我）" : "第三人称"],
          ["目标字数", b.targetWords ? b.targetWords + " 字" : ""],
          ["当前进度", m.chapters.length + " 章 / " + totalWords(m.chapters) + " 字"],
          ["状态", b.status || ""]
        ]
      });
      if (arr(b.volumes).length) {
        B.push({ t: "h1", text: "二、卷结构" });
        B.push({
          t: "table", header: ["卷", "卷名", "起止章", "实际章数", "字数"],
          rows: b.volumes.map(function (v) {
            var cs = m.chapters.filter(function (c) { return n2(c.volume) === n2(v.num); });
            return [v.num, v.title, (v.range || "") , cs.length, totalWords(cs)];
          }),
          widths: [700, 3400, 1660, 1400, 2200]
        });
      }
      B.push({ t: "h1", text: "三、人物设定" });
      m.chars.forEach(function (c) {
        B.push({ t: "h2", text: c.name + (c.role ? "（" + c.role + "）" : "") });
        B.push({ t: "kv", rows: charCardRows(c) });
      });
      if (m.relations.length) {
        B.push({ t: "h1", text: "四、人物关系" });
        B.push({
          t: "table", header: ["A", "B", "关系", "过去", "现在", "核心矛盾", "当前状态"],
          rows: m.relations.map(function (r) { return [r.a, r.b, r.type, r.past, r.now, r.conflict, r.state]; }),
          widths: [900, 900, 1300, 1400, 1400, 1860, 1600]
        });
      }
      if (m.events.length) {
        B.push({ t: "h1", text: "五、时间线" });
        B.push({
          t: "table", header: ["时间", "事件", "人物", "发生", "影响", "关联章节"],
          rows: m.events.map(function (e) {
            return [e.time || (e.chapter ? "第" + e.chapter + "章" : ""), e.title, join(e.chars || e.affectedChars), e.happened || e.summary, e.impact || e.feeling, join(e.chapters)];
          }),
          widths: [1200, 1800, 1300, 2200, 1860, 1000]
        });
      }
      if (m.foreshadows.length) {
        B.push({ t: "h1", text: "六、伏笔库" });
        B.push({
          t: "table", header: ["伏笔", "首现章", "计划回收", "状态", "备注"],
          rows: m.foreshadows.map(function (f) {
            return [f.title, f.setupChapter != null ? "第 " + f.setupChapter + " 章" : "", f.payoffChapter != null ? "第 " + f.payoffChapter + " 章" : "", fsLabel(f.status), f.note || ""];
          }),
          widths: [2200, 1400, 1500, 1200, 3060]
        });
      }
      if (m.emotions.length) {
        B.push({ t: "h1", text: "七、情绪线" });
        m.emotions.forEach(function (e) {
          B.push({ t: "h2", text: (e.a || "") + " × " + (e.b || "") });
          B.push({
            t: "table", header: ["章节", "阶段", "强度"],
            rows: (e.points || []).map(function (p) { return ["第 " + p.ch + " 章", p.stage || "", p.value != null ? p.value : ""]; }),
            widths: [2400, 4600, 2360]
          });
        });
      }
      if (m.inspirations.length) {
        B.push({ t: "h1", text: "八、灵感箱" });
        B.push({
          t: "table", header: ["灵感", "类型", "关联人物", "适合章节"],
          rows: m.inspirations.map(function (i) { return [i.text, i.type || "", join(i.chars), i.targetChapter ? "第 " + i.targetChapter + " 章" : ""]; }),
          widths: [4600, 1500, 1800, 1460]
        });
      }
      if (m.materials.length) {
        B.push({ t: "h1", text: "九、素材库" });
        var byKind = {};
        m.materials.forEach(function (x) { var k = x.kind || "其他"; (byKind[k] = byKind[k] || []).push(x); });
        Object.keys(byKind).forEach(function (k) {
          B.push({ t: "h3", text: k + "（" + byKind[k].length + "）" });
          B.push({
            t: "table", header: ["标题", "内容", "标签"],
            rows: byKind[k].map(function (x) { return [x.title || "", x.content || "", join(x.tags)]; }),
            widths: [2000, 5360, 2000]
          });
        });
      }
    }

    // 章节大纲 + 正文
    B.push({ t: "h1", text: (scoped === "book" ? "十、" : "") + "章节大纲" + (opts.chapterId ? "" : "（幕后卡片）") });
    m.chapters.forEach(function (ch) {
      var card = ch.card || {};
      var vol = b.volumes && b.volumes.filter(function (v) { return n2(v.num) === n2(ch.volume); })[0];
      B.push({ t: "h2", text: "第 " + ch.num + " 章　" + (ch.title || "") });
      var rows = [
        ["所属卷", (vol ? "第" + vol.num + "卷 " + vol.title : (ch.volume ? "第 " + ch.volume + " 卷" : ""))],
        ["时间", card.time || ""],
        ["地点", card.place || ""],
        ["涉及人物", join(card.chars)],
        ["本章任务", card.task || ch.goal || ""],
        ["剧情 · 开始", card.plot && card.plot.start],
        ["剧情 · 冲突", card.plot && card.plot.conflict],
        ["剧情 · 高潮", card.plot && card.plot.climax],
        ["剧情 · 结尾", card.plot && card.plot.end],
        ["情绪推进", card.emotion ? [card.emotion.aFrom && (card.emotion.a + "：" + card.emotion.aFrom + " → " + card.emotion.aTo),
          card.emotion.bFrom && (card.emotion.b + "：" + card.emotion.bFrom + " → " + card.emotion.bTo)].filter(Boolean).join("；") : ""],
        ["必须出现", join(card.mustAppear)],
        ["不能出现", join(card.mustNot)],
        ["关联伏笔", card.fsRef || ""],
        ["规格 Spec", specLine(ch)],
        ["字数", wordsOf(ch.draft) + " 字"]
      ].filter(function (r) { return String(r[1] || "").trim() !== ""; });
      B.push({ t: "kv", rows: rows });
    });

    B.push({ t: "pb" });
    B.push({ t: "h1", text: (scoped === "book" ? "十一、" : "") + "正文" });
    m.chapters.forEach(function (ch) {
      B.push({ t: "h2", text: "第 " + ch.num + " 章　" + (ch.title || "") });
      B.push({ t: "caption", text: wordsOf(ch.draft) + " 字 · " + (ch.status || "draft") });
      var text = String(ch.draft || "").trim();
      if (!text) {
        B.push({ t: "quote", text: "（本章尚无正文）" });
      } else {
        text.split(/\n+/).forEach(function (seg) {
          if (seg.trim()) B.push({ t: "p", text: seg.trim() });
        });
      }
    });

    if (scoped === "book") {
      var revs = m.chapters.map(function (ch) { return { ch: ch, r: reviewOf({ reviews: m.reviews }, ch.id) }; })
        .filter(function (x) { return x.r; });
      if (revs.length) {
        B.push({ t: "pb" });
        B.push({ t: "h1", text: "十二、评审记录（5 维加权）" });
        B.push({
          t: "table", header: ["章节", "总分", "阅读者", "编审", "故事家", "文学顾问", "毒舌读者", "红线"],
          rows: revs.map(function (x) {
            var s = x.r.scores || {};
            return ["第 " + x.ch.num + " 章", x.r.finalScore != null ? x.r.finalScore : "",
              s.reader && s.reader.score, s.editor && s.editor.score, s.storyteller && s.storyteller.score,
              s.literary && s.literary.score, s.troll && s.troll.score, join(x.r.flags)];
          }),
          widths: [1100, 800, 1000, 1000, 1000, 1400, 1300, 1760]
        });
      }
    }
    return B;
  }

  // ---------- Excel 工作表 ----------
  function xlsxSheets(m) {
    var b = m.book || {};
    var S = [];
    S.push({
      name: "概览", header: ["项目", "内容"], widths: [22, 52],
      rows: [
        ["书名", b.title || ""],
        ["一句话故事", b.oneLiner || ""],
        ["主题", join(b.themes)],
        ["类型", b.genre || ""],
        ["风格", b.style || ""],
        ["叙事视角", b.pov === "first" ? "第一人称" : "第三人称"],
        ["目标字数", n2(b.targetWords) || ""],
        ["章节数", m.chapters.length],
        ["已写字数", totalWords(m.chapters)],
        ["人物数", m.chars.length],
        ["伏笔数", m.foreshadows.length],
        ["关系数", m.relations.length],
        ["时间线事件", m.events.length],
        ["灵感条数", m.inspirations.length],
        ["素材条数", m.materials.length],
        ["导出时间", new Date().toLocaleString("zh-CN")]
      ]
    });
    S.push({
      name: "章节", header: ["章号", "卷", "标题", "状态", "字数", "本章任务", "时间", "地点", "涉及人物", "必须出现", "不能出现", "关联伏笔", "本卷"],
      widths: [7, 7, 26, 10, 9, 36, 12, 14, 22, 26, 22, 16, 10],
      rows: m.chapters.map(function (c) {
        var card = c.card || {};
        var vol = (b.volumes || []).filter(function (v) { return n2(v.num) === n2(c.volume); })[0];
        return [n2(c.num), n2(c.volume) || "", c.title || "", c.status || "draft", wordsOf(c.draft),
          card.task || c.goal || "", card.time || "", card.place || "", join(card.chars),
          join(card.mustAppear), join(card.mustNot), card.fsRef || "", vol ? vol.title : ""];
      })
    });
    S.push({
      name: "章节规格", header: ["章号", "标题", "目标", "必须发生", "关键场景", "新钩子", "张力曲线"],
      widths: [7, 26, 36, 36, 30, 26, 24],
      rows: m.chapters.map(function (c) {
        var sp = c.spec || {};
        return [n2(c.num), c.title || "", c.goal || "", join(sp.must_happen, "；"), join(sp.key_scenes, "；"), join(sp.new_hooks, "；"),
          arr(sp.tension).map(function (t) { return "p" + t.position + "=" + t.value; }).join(" → ")];
      })
    });
    S.push({
      name: "人物", header: ["姓名", "角色", "年龄", "职业", "城市", "性格", "核心欲望", "核心恐惧", "人物缺陷", "爱情观", "习惯", "外貌", "秘密", "成长弧光"],
      widths: [12, 12, 8, 16, 10, 24, 30, 26, 24, 24, 22, 30, 26, 40],
      rows: m.chars.map(function (c) {
        var card = c.card || {};
        var arc = [card.arcStart, card.arcConflict, card.arcTurn, card.arcEnd].filter(Boolean).join(" → ") || c.arc || "";
        return [c.name || "", c.role || "", c.age || "", c.job || "", c.city || "",
          join(c.personality || c.traits), c.desire || "", c.fear || card.fear || "", c.flaw || "",
          c.loveView || "", join(c.habits), card.appearance || "", join(c.secrets) || card.secret || "", arc];
      })
    });
    S.push({
      name: "人物关系", header: ["A", "B", "关系", "过去", "现在", "核心矛盾", "当前状态", "变化记录"],
      widths: [12, 12, 22, 26, 26, 30, 14, 34],
      rows: m.relations.map(function (r) {
        return [r.a || "", r.b || "", r.type || "", r.past || "", r.now || "", r.conflict || "", r.state || "",
          arr(r.changes).map(function (x) { return "第" + x.ch + "章 " + (x.note || ""); }).join("；")];
      })
    });
    S.push({
      name: "时间线", header: ["时间", "事件", "人物", "发生", "感受", "影响", "关联章节"],
      widths: [12, 24, 22, 40, 22, 32, 18],
      rows: m.events.map(function (e) {
        return [e.time || "", e.title || "", join(e.chars || e.affectedChars), e.happened || e.summary || "",
          e.feeling || "", e.impact || "", join(e.chapters) || (e.chapter ? "第" + e.chapter + "章" : "")];
      })
    });
    S.push({
      name: "伏笔", header: ["伏笔", "首现章", "计划回收章", "状态", "备注"],
      widths: [28, 10, 14, 10, 40],
      rows: m.foreshadows.map(function (f) {
        return [f.title || "", n2(f.setupChapter) || "", f.payoffChapter != null ? n2(f.payoffChapter) : "", fsLabel(f.status), f.note || ""];
      })
    });
    var emoRows = [];
    m.emotions.forEach(function (e) {
      (e.points || []).forEach(function (p) {
        emoRows.push([(e.a || "") + " × " + (e.b || ""), n2(p.ch), p.stage || "", p.value != null ? p.value : ""]);
      });
    });
    S.push({ name: "情绪线", header: ["人物对", "章节", "阶段", "强度"], widths: [22, 8, 18, 8], rows: emoRows });
    S.push({
      name: "灵感", header: ["灵感", "类型", "关联人物", "适合章节", "关联", "时间"],
      widths: [50, 14, 20, 12, 20, 20],
      rows: m.inspirations.map(function (i) {
        return [i.text || "", i.type || "", join(i.chars), n2(i.targetChapter) || "", i.related || "",
          i.ts ? String(i.ts).slice(0, 16).replace("T", " ") : ""];
      })
    });
    S.push({
      name: "素材", header: ["类型", "标题", "内容", "标签", "时间"],
      widths: [14, 24, 60, 20, 20],
      rows: m.materials.map(function (x) {
        return [x.kind || "", x.title || "", x.content || "", join(x.tags), x.ts ? String(x.ts).slice(0, 16).replace("T", " ") : ""];
      })
    });
    var rvRows = m.chapters.map(function (c) {
      var r = reviewOf({ reviews: m.reviews }, c.id);
      if (!r) return null;
      var s = r.scores || {};
      return [n2(c.num), c.title || "", r.finalScore != null ? r.finalScore : "",
        s.reader && s.reader.score, s.editor && s.editor.score, s.storyteller && s.storyteller.score,
        s.literary && s.literary.score, s.troll && s.troll.score, join(r.flags), r.notes || ""];
    }).filter(Boolean);
    S.push({
      name: "评审", header: ["章号", "标题", "总分", "阅读者", "编审", "故事家", "文学顾问", "毒舌读者", "红线", "备注"],
      widths: [7, 24, 8, 10, 10, 10, 12, 12, 28, 30],
      rows: rvRows
    });
    return S.filter(function (s) { return s.rows && s.rows.length; });
  }

  // ============================================================
  // F. 文件产物 / 下载
  // ============================================================
  function docxBytes(data, bookId, opts) {
    opts = opts || {};
    var m = collect(data, bookId, opts);
    var files = docxFiles(docxBlocks(m, opts), {
      title: (m.book && m.book.title) || "小说",
      subject: "小说创作 · 设定集与正文",
      creator: "PM 工作台"
    });
    return zip(files);
  }
  function xlsxBytes(data, bookId, opts) {
    var m = collect(data, bookId, opts);
    var files = xlsxFiles(xlsxSheets(m), {
      title: (m.book && m.book.title) || "小说",
      subject: "小说创作 · 全量数据",
      creator: "PM 工作台"
    });
    return zip(files);
  }
  function fileName(title, kind, ext) {
    var t = clean(title || "小说").replace(/[\/\\:*?"<>|\s]+/g, "_").slice(0, 40);
    var d = new Date();
    var stamp = d.getFullYear() + ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2);
    return t + "_" + (kind || "导出") + "_" + stamp + "." + ext;
  }
  function toBlob(bytes, mime) {
    if (typeof Blob === "undefined") return bytes;
    return new Blob([bytes], { type: mime });
  }
  function save(bytes, filename, mime) {
    mime = mime || "application/octet-stream";
    var blob = toBlob(bytes, mime);
    if (typeof document === "undefined" || typeof URL === "undefined" || !URL.createObjectURL) return { ok: false };
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename; a.rel = "noopener"; a.style.display = "none";
    try { document.body.appendChild(a); } catch (e) {}
    a.click();
    setTimeout(function () {
      try { if (a.parentNode) a.parentNode.removeChild(a); } catch (e) {}
      try { URL.revokeObjectURL(url); } catch (e) {}
    }, 2000);
    return { ok: true, filename: filename };
  }

  root.NvExport = {
    version: "1.0.0",
    u8: u8, crc32: crc32, zip: zip, colName: colName, xmlEscape: xmlEscape,
    docxFiles: docxFiles, xlsxFiles: xlsxFiles,
    docxBlocks: docxBlocks, xlsxSheets: xlsxSheets, collect: collect,
    docxBytes: docxBytes, xlsxBytes: xlsxBytes,
    fileName: fileName, save: save, toBlob: toBlob
  };
})(typeof window !== "undefined" ? window : this);
