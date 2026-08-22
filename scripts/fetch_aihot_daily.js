// AIHOT 每日快照抓取脚本
// 调用 AIHOT 匿名只读 v1 API，生成 data/aihot.json（每日简报 / 精选 / 热点 / 日报归档）
// 由「每日 08:00」自动化调用，抓取后写文件并交由部署工具上线。
const fs = require("fs");
const path = require("path");

const BASE = "https://aihot.virxact.com/api/v1";
const UA = "aihot-skill/1.2.1 (+https://aihot.virxact.com/aihot-skill/)";
const OUT = path.join(__dirname, "..", "data", "aihot.json");

async function get(p) {
  const r = await fetch(BASE + p, { headers: { "User-Agent": UA, "Accept": "application/json" } });
  if (!r.ok) throw new Error("HTTP " + r.status + " @ " + p);
  return r.json();
}

function pickLinks(l) {
  return {
    aihot: (l && l.aihot) || "",
    original: (l && l.original) || ""
  };
}

(async () => {
  const [items, hot, daily, dailies] = await Promise.all([
    get("/items?mode=selected&window=24h&limit=15"),
    get("/hot-topics"),
    get("/dailies/latest"),
    get("/dailies?limit=7")
  ]);

  const selected = (items.items || []).map(function (it) {
    return {
      id: it.id,
      title: it.title,
      summary: it.summary || "",
      source: (it.source && it.source.name) || "",
      links: pickLinks(it.links),
      publishedAt: it.publishedAt || it.discoveredAt || "",
      category: it.category || "",
      score: it.score || 0
    };
  });

  const hotTopics = (hot.items || []).map(function (h) {
    return {
      rank: h.rank,
      id: h.id,
      title: h.title,
      source: (h.source && h.source.name) || "",
      links: pickLinks(h.links),
      sourceCount: h.sourceCount || 0,
      signalCount: h.signalCount || 0,
      latestAt: h.latestAt || ""
    };
  });

  const rep = (daily && daily.report) || {};
  const brief = {
    date: rep.date || "",
    generatedAt: rep.generatedAt || "",
    url: (rep.links && rep.links.aihot) || "",
    leadTitle: rep.lead ? rep.lead.title : ((dailies.items && dailies.items[0]) ? dailies.items[0].leadTitle : ""),
    sections: (rep.sections || []).map(function (s) {
      return {
        label: s.label || "",
        items: (s.items || []).map(function (i) {
          return {
            title: i.title,
            summary: i.summary || "",
            source: (i.source && i.source.name) || "",
            links: pickLinks(i.links)
          };
        })
      };
    })
  };

  const dailiesOut = (dailies.items || []).map(function (d) {
    return { date: d.date, leadTitle: d.leadTitle || "", url: (d.links && d.links.aihot) || "" };
  });

  const out = {
    updatedAt: new Date().toISOString(),
    source: "AIHOT",
    attribution: "AI 资讯由 AIHOT 提供（aihot.virxact.com）",
    brief: brief,
    selected: selected,
    hotTopics: hotTopics,
    dailies: dailiesOut
  };

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log("[AIHOT] snapshot written -> " + OUT);
  console.log("[AIHOT] brief.date=" + brief.date + " sections=" + brief.sections.length +
    " selected=" + selected.length + " hot=" + hotTopics.length + " dailies=" + dailiesOut.length);
})().catch(function (e) {
  console.error("[AIHOT] fetch failed:", e && e.message ? e.message : e);
  process.exit(1);
});
