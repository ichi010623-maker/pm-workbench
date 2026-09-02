// ============================================================
// 行业情报 · llm/parser（AI 返回结果解析 + 规范化）
// 依赖：providers（intelExtractTextLinks），外部 uid() / today()
// ============================================================
(function (root) {
  "use strict";

  // 从模型原始文本稳健提取 JSON（兼容 ```json 代码块与前后噪声）
  function parseIntelLLM(text) {
    if (text == null) throw new Error("模型返回为空");
    var s = String(text).trim();
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    var a = s.indexOf("{"), b = s.lastIndexOf("}");
    if (a < 0 || b < 0 || b < a) throw new Error("未找到 JSON 对象");
    return JSON.parse(s.slice(a, b + 1));
  }

  // 把模型解析结果规范化为统一结构
  function buildIntelResult(parsed, opts) {
    parsed = parsed || {};
    opts = opts || {};
    var items = Array.isArray(parsed.items)
      ? parsed.items.filter(function (it) { return it && it.title; }).map(function (it) {
          return {
            title: String(it.title || ""),
            point: String(it.point || it.summary || ""),
            source: String(it.source || ""),
            url: String(it.url || ""),
            tags: Array.isArray(it.tags) ? it.tags.map(String) : []
          };
        })
      : [];
    var sources = Array.isArray(parsed.sources)
      ? parsed.sources.filter(function (s) { return s && s.url; }).map(function (s) { return { title: String(s.title || ""), url: String(s.url || "") }; })
      : [];
    (opts.sources || []).forEach(function (s) {
      if (s && s.url && !sources.some(function (x) { return x.url === s.url; })) sources.push({ title: s.title || "", url: s.url });
    });
    if (typeof root.intelExtractTextLinks === "function") {
      root.intelExtractTextLinks(opts.text).forEach(function (s) {
        if (s && s.url && !sources.some(function (x) { return x.url === s.url; })) sources.push({ title: s.title || "", url: s.url });
      });
    }
    return {
      id: (typeof uid === "function" ? uid() : "id" + Math.random().toString(36).slice(2, 9)),
      date: opts.date || (typeof today === "function" ? today() : "nodate"),
      need: opts.need || "",
      provider: opts.provider || "",
      title: String(parsed.title || ("情报：" + (opts.need || ""))),
      summary: String(parsed.summary || ""),
      items: items,
      sources: sources
    };
  }

  // 把一条自定义情报结果转存为「我的情报」：逐条 item 拆成独立 industry 条目
  function customIntelToMyIntel(r) {
    r = r || {};
    var date = r.date || (typeof today === "function" ? today() : "nodate");
    var out = [];
    var items = Array.isArray(r.items) ? r.items : [];
    if (!items.length) {
      // 无子条目时，把整条简报作为一条我的情报
      out.push({
        id: (typeof uid === "function" ? uid() : "id" + Math.random().toString(36).slice(2, 9)),
        title: String(r.title || "自定义情报"), summary: String(r.summary || ""),
        source: "", url: "", tags: [], date: date, important: false, origin: "custom:intel"
      });
      return out;
    }
    items.forEach(function (it) {
      out.push({
        id: (typeof uid === "function" ? uid() : "id" + Math.random().toString(36).slice(2, 9)),
        title: String(it.title || ""),
        summary: String(it.point || it.summary || ""),
        source: String(it.source || ""),
        url: String(it.url || ""),
        tags: Array.isArray(it.tags) ? it.tags.map(String) : [],
        date: date,
        important: false,
        origin: "custom:intel"
      });
    });
    return out;
  }

  // 市场机会 JSON 解析（复用 parseIntelLLM）
  function parseMarketOpportunity(text) {
    if (text == null) throw new Error("模型返回为空");
    return parseIntelLLM(text);
  }

  // 把六维市场机会 JSON 规范化为统一结构
  function buildMarketOpportunityResult(parsed, opts) {
    parsed = parsed || {};
    opts = opts || {};
    var arr = function (x) { return Array.isArray(x) ? x : []; };
    var str = function (x, d) { return x == null ? (d || "") : String(x); };
    var num = function (x) { var n = Number(x); return isNaN(n) ? null : n; };
    function dimSeg(list, keys) {
      return arr(list).filter(function (o) { return o && (o[keys.idx] || o[keys.idx2]); })
        .map(function (o) {
          var row = {}; keys.cols.forEach(function (c) { row[c] = str(o[c]); });
          return row;
        });
    }
    var dims = {
      scale: {
        tam: str(parsed.scale && parsed.scale.tam),
        cagr: str(parsed.scale && parsed.scale.cagr),
        segments: dimSeg(parsed.scale && parsed.scale.segments, { idx: "name", idx2: "name", cols: ["name", "size", "share", "growth", "stage"] }),
        drivers: dimSeg(parsed.scale && parsed.scale.drivers, { idx: "factor", idx2: "factor", cols: ["factor", "impact"] })
      },
      penetration: {
        rate: str(parsed.penetration && parsed.penetration.rate),
        ceiling: str(parsed.penetration && parsed.penetration.ceiling),
        space: str(parsed.penetration && parsed.penetration.space),
        stage: str(parsed.penetration && parsed.penetration.stage),
        segments: dimSeg(parsed.penetration && parsed.penetration.segments, { idx: "group", idx2: "group", cols: ["group", "rate", "gap", "potential"] })
      },
      increment: {
        stock: str(parsed.increment && parsed.increment.stock),
        incremental: str(parsed.increment && parsed.increment.incremental),
        sources: dimSeg(parsed.increment && parsed.increment.sources, { idx: "source", idx2: "source", cols: ["source", "size", "share", "growth"] }),
        scenarios: dimSeg(parsed.increment && parsed.increment.scenarios, { idx: "name", idx2: "name", cols: ["name", "assumption", "space", "prob"] })
      },
      unmet: {
        needs: dimSeg(parsed.unmet && parsed.unmet.needs, { idx: "need", idx2: "need", cols: ["need", "satisfaction", "gap", "priority"] }),
        pains: dimSeg(parsed.unmet && parsed.unmet.pains, { idx: "pain", idx2: "pain", cols: ["pain", "impact", "universality", "solutionDifficulty", "opportunityValue"] }),
        trends: dimSeg(parsed.unmet && parsed.unmet.trends, { idx: "trend", idx2: "trend", cols: ["trend", "speed", "potential"] })
      },
      blueocean: {
        redsea: (parsed.blueocean && parsed.blueocean.redsea) ? {
          competition: str(parsed.blueocean.redsea.competition), priceWar: str(parsed.blueocean.redsea.priceWar),
          profit: str(parsed.blueocean.redsea.profit), diff: str(parsed.blueocean.redsea.diff)
        } : {},
        canvas: dimSeg(parsed.blueocean && parsed.blueocean.canvas, { idx: "factor", idx2: "factor", cols: ["factor", "industry", "ours", "action"] }),
        opportunities: dimSeg(parsed.blueocean && parsed.blueocean.opportunities, { idx: "desc", idx2: "desc", cols: ["desc", "target", "value", "feasibility", "score"] })
          .map(function (o) { o.score = num(o.score); return o; })
      },
      substitution: {
        direct: dimSeg(parsed.substitution && parsed.substitution.direct, { idx: "item", idx2: "item", cols: ["item", "degree", "threat", "trend"] }),
        adjacent: dimSeg(parsed.substitution && parsed.substitution.adjacent, { idx: "market", idx2: "market", cols: ["market", "relevance", "difficulty", "opportunity"] }),
        opportunities: dimSeg(parsed.substitution && parsed.substitution.opportunities, { idx: "desc", idx2: "desc", cols: ["desc", "logic", "advantage", "size"] })
      }
    };
    var sources = arr(parsed.sources).filter(function (s) { return s && s.url; }).map(function (s) { return { title: str(s.title), url: str(s.url) }; });
    (opts.sources || []).forEach(function (s) {
      if (s && s.url && !sources.some(function (x) { return x.url === s.url; })) sources.push({ title: str(s.title), url: s.url });
    });
    if (typeof root.intelExtractTextLinks === "function") {
      root.intelExtractTextLinks(opts.text).forEach(function (s) {
        if (s && s.url && !sources.some(function (x) { return x.url === s.url; })) sources.push({ title: str(s.title), url: s.url });
      });
    }
    return {
      id: (typeof uid === "function" ? uid() : "mo" + Math.random().toString(36).slice(2, 9)),
      market: str(opts.market),
      date: opts.date || (typeof today === "function" ? today() : "nodate"),
      createdAt: new Date().toISOString(),
      provider: opts.provider || "",
      summary: str(parsed.summary),
      rating: str(parsed.rating),
      ratingReason: str(parsed.ratingReason),
      dims: dims,
      findings: arr(parsed.findings).map(function (f) { return str(f); }).filter(function (f) { return f; }),
      suggestions: arr(parsed.suggestions).map(function (s) { return str(s); }).filter(function (s) { return s; }),
      sources: sources
    };
  }

  root.parseIntelLLM = parseIntelLLM;
  root.buildIntelResult = buildIntelResult;
  root.customIntelToMyIntel = customIntelToMyIntel;
  root.parseMarketOpportunity = parseMarketOpportunity;
  root.buildMarketOpportunityResult = buildMarketOpportunityResult;
})(typeof globalThis !== "undefined" ? globalThis : this);