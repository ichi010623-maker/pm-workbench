/**
 * pm-workbench 云端自动更新 · Cloudflare Workflow
 *
 * 目标：不依赖本机开机，7×24 自动生成并部署（0 成本）。
 *  - 生成模型：Workers AI @cf/zai-org/glm-4.7-flash（免费 10k neurons/天，本项目约用 1k）
 *  - 数据真值：GitHub 主库 ichi010623-maker/pm-workbench（Contents API 读写）
 *  - 部署目标：GitHub Pages 站点库 ichi010623-maker/pm-workbench-site
 *  - 触发：wrangler.toml [[workflows]].schedules 直接挂 cron（UTC），event.schedule.cron 分派任务
 *  - 手动触发：GET /?job=daily|news|reading|newssum|patrol
 *
 * 复用 cloud/gen_*.js 的 generate()（已重构为纯内存进出），esbuild 打包时
 * alias fs/path/child_process/process → src/stubs/*，generate() 路径不触碰这些模块。
 */
import { WorkflowEntrypoint } from "cloudflare:workers";
import * as kg from "../../cloud/gen_knowledge_llm.js";
import * as nw from "../../cloud/gen_news_llm.js";
import * as rd from "../../cloud/gen_reading_llm.js";
import * as nsm from "../../cloud/gen_news_summary_llm.js";

// ---------- GitHub Contents API ----------
const GH_OWNER = "ichi010623-maker";
const GH_MAIN = "pm-workbench";          // 主库（数据真值）
const GH_SITE = "pm-workbench-site";     // 站点库（GitHub Pages 部署目标）
const API = "https://api.github.com";

function ghHdrs(env) {
  return {
    Authorization: `Bearer ${env.GH_TOKEN}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "pmwb-workflow",
    "Content-Type": "application/json",
  };
}

async function ghGet(env, repo, path) {
  const r = await fetch(`${API}/repos/${GH_OWNER}/${repo}/contents/${path}`, { headers: ghHdrs(env) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GET ${repo}/${path}: ${r.status}`);
  return r.json();
}

function b64enc(s) { return btoa(unescape(encodeURIComponent(s))); }
function b64dec(s) { return decodeURIComponent(escape(atob(s))); }

async function ghPut(env, repo, path, content, sha) {
  const body = { message: `auto: workflow 更新 ${path}`, content: b64enc(content) };
  if (sha) body.sha = sha;
  const r = await fetch(`${API}/repos/${GH_OWNER}/${repo}/contents/${path}`, {
    method: "PUT", headers: ghHdrs(env), body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`PUT ${repo}/${path}: ${r.status} ${t.slice(0, 200)}`);
  }
  return r.json();
}

async function pullFiles(env, repo, paths) {
  const out = {};
  await Promise.all(paths.map(async (p) => {
    const j = await ghGet(env, repo, p);
    if (j) out[p] = { sha: j.sha, text: b64dec(j.content) };
  }));
  return out;
}

// ---------- Workers AI LLM（注入生成器）----------
function parseJson(t) {
  let s = String(t).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const i = s.indexOf("{");
  const j = s.lastIndexOf("}");
  if (i >= 0 && j > i) s = s.slice(i, j + 1);
  return JSON.parse(s);
}

function makeLlm(env) {
  return async (system, user, opts = {}) => {
    const res = await env.AI.run("@cf/zai-org/glm-4.7-flash", {
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      max_tokens: opts.maxTokens || 4096,
      temperature: opts.temperature ?? 0.5,
    });
    const text = (res && (res.response ?? res.output)) || "";
    if (!text) throw new Error("Workers AI 空响应");
    return parseJson(text);
  };
}

// ---------- AIHOT 快照（复刻 scripts/fetch_aihot_daily.js，纯 fetch）----------
async function fetchAihot() {
  const BASE = "https://aihot.virxact.com/api/v1";
  const UA = "aihot-skill/1.2.1 (+https://aihot.virxact.com/aihot-skill/)";
  const get = async (p) => {
    const r = await fetch(BASE + p, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!r.ok) throw new Error("HTTP " + r.status + " @" + p);
    return r.json();
  };
  const pickLinks = (l) => ({ aihot: (l && l.aihot) || "", original: (l && l.original) || "" });
  const [items, hot, daily, dailies] = await Promise.all([
    get("/items?mode=selected&window=24h&limit=15"),
    get("/hot-topics"),
    get("/dailies/latest"),
    get("/dailies?limit=7"),
  ]);
  const selected = (items.items || []).map((it) => ({
    id: it.id, title: it.title, summary: it.summary || "",
    source: (it.source && it.source.name) || "", links: pickLinks(it.links),
    publishedAt: it.publishedAt || it.discoveredAt || "", category: it.category || "", score: it.score || 0,
  }));
  const hotTopics = (hot.items || []).map((h) => ({
    rank: h.rank, id: h.id, title: h.title, source: (h.source && h.source.name) || "",
    links: pickLinks(h.links), sourceCount: h.sourceCount || 0,
    signalCount: h.signalCount || 0, latestAt: h.latestAt || "",
  }));
  const rep = (daily && daily.report) || {};
  const brief = {
    date: rep.date || "", generatedAt: rep.generatedAt || "",
    url: (rep.links && rep.links.aihot) || "",
    leadTitle: rep.lead ? rep.lead.title : ((dailies.items && dailies.items[0]) ? dailies.items[0].leadTitle : ""),
    sections: (rep.sections || []).map((s) => ({
      label: s.label || "",
      items: (s.items || []).map((i) => ({
        title: i.title, summary: i.summary || "",
        source: (i.source && i.source.name) || "", links: pickLinks(i.links),
      })),
    })),
  };
  const dailiesOut = (dailies.items || []).map((d) => ({
    date: d.date, leadTitle: d.leadTitle || "", url: (d.links && d.links.aihot) || "",
  }));
  return {
    updatedAt: new Date().toISOString(),
    source: "AIHOT",
    attribution: "AI 资讯由 AIHOT 提供（aihot.virxact.com）",
    brief, selected, hotTopics, dailies: dailiesOut,
  };
}

// ---------- 版本提升（复刻 run_daily.bumpVersion）----------
function bump(files) {
  const m = files["index.html"].match(/硬件PM工作台 v(\d+)\.(\d+)\.(\d+)/);
  if (!m) throw new Error("无法解析当前版本");
  let [, maj, min, pat] = m.map(Number);
  pat += 1;
  const nv = `${maj}.${min}.${pat}`;
  files["index.html"] = files["index.html"]
    .replace(/硬件PM工作台 v\d+\.\d+\.\d+/, `硬件PM工作台 v${nv}`)
    .replace(/\?v=\d+\.\d+\.\d+/g, `?v=${nv}`);
  files["js/app.js"] = files["js/app.js"].replace(/APP_VERSION = "\d+\.\d+\.\d+"/, `APP_VERSION = "${nv}"`);
  files["sw.js"] = files["sw.js"].replace(/CACHE_VERSION = "v\d+\.\d+\.\d+"/, `CACHE_VERSION = "v${nv}"`);
  return nv;
}

// ---------- cron → 任务 ----------
function inferJob(cron) {
  const map = {
    "10 23 * * *": "daily",
    "0 4 * * *": "news",
    "0 10 * * *": "news",
    "5 16 * * *": "reading",
    "0 0 * * *": "newssum",
    "0 */6 * * *": "patrol",
  };
  return map[cron] || "daily";
}

// ---------- Workflow ----------
const DATA_PATHS = [
  "data/knowledge.json", "data/news.json", "data/news-archive.json",
  "data/lang_reading.json", "data/news_summary.json", "data/aihot.json",
];
const APP_PATHS = ["index.html", "js/app.js", "sw.js"];

export class PmwbWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    const env = this.env;
    const job = event.payload && event.payload.job
      ? event.payload.job
      : inferJob(event.schedule ? event.schedule.cron : "");
    const bjDate = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    const utcDate = new Date().toISOString().slice(0, 10);
    console.log(`[wf] job=${job} bj=${bjDate} utc=${utcDate} cron=${event.schedule ? event.schedule.cron : "-"}`);

    // 1) 拉主库数据 + 版本文件
    const files = await step.do("load-repo", async () => {
      const dataFiles = await pullFiles(env, GH_MAIN, DATA_PATHS);
      const appFiles = await pullFiles(env, GH_MAIN, APP_PATHS);
      return { ...dataFiles, ...appFiles };
    });
    const changed = new Set();
    const parse = (p, fallback) => { try { return JSON.parse(files[p].text); } catch { return fallback; } };
    const save = (p, obj) => { files[p] = { ...files[p], text: JSON.stringify(obj, null, 2) }; changed.add(p); };
    const llm = makeLlm(env);

    // 2) 按任务生成（各生成器幂等：当日已有则跳过）
    if (job === "daily" || job === "patrol") {
      await step.do("generate-knowledge", async () => {
        const k = parse("data/knowledge.json", { pool: [], history: [], dailyCount: 50, cats: [] });
        const r = await kg.generate(k, utcDate, { llm });
        if (r.changed) save("data/knowledge.json", k);
        return { count: r.count, skipped: !!r.skipped };
      });
      await step.do("generate-news", async () => {
        const n = parse("data/news.json", { items: [] });
        const arc = parse("data/news-archive.json", {});
        const r = await nw.generate(n, utcDate, { llm, refresh: false, archive: arc });
        if (r.count !== undefined && !r.skipped) { save("data/news.json", n); save("data/news-archive.json", arc); }
        return { count: r.count, skipped: !!r.skipped };
      });
      await step.do("generate-reading", async () => {
        const r = parse("data/lang_reading.json", { days: {} });
        const rr = await rd.generate(r, bjDate, { llm });
        if (rr.count !== undefined && !rr.skipped) save("data/lang_reading.json", r);
        return { count: rr.count, skipped: !!rr.skipped };
      });
      await step.do("generate-aihot", async () => {
        try { save("data/aihot.json", await fetchAihot()); return { ok: true }; }
        catch (e) { console.log("[aihot] 抓取失败:", e.message); return { ok: false }; }
      });
    } else if (job === "news") {
      await step.do("generate-news-refresh", async () => {
        const n = parse("data/news.json", { items: [] });
        const arc = parse("data/news-archive.json", {});
        const r = await nw.generate(n, utcDate, { llm, refresh: true, archive: arc });
        if (r.count !== undefined && !r.skipped) { save("data/news.json", n); save("data/news-archive.json", arc); }
        return { count: r.count };
      });
    } else if (job === "reading") {
      await step.do("generate-reading-day", async () => {
        const r = parse("data/lang_reading.json", { days: {} });
        const rr = await rd.generate(r, bjDate, { llm });
        if (rr.count !== undefined && !rr.skipped) save("data/lang_reading.json", r);
        return { count: rr.count, skipped: !!rr.skipped };
      });
    } else if (job === "newssum") {
      await step.do("generate-newssum", async () => {
        const s = parse("data/news_summary.json", { days: {} });
        const rs = await nsm.generate(s, bjDate, { llm, webSearch: false });
        if (rs.groups !== undefined && !rs.skipped && !rs.skippedNoSource) save("data/news_summary.json", s);
        return { groups: rs.groups, skipped: !!rs.skipped };
      });
    }

    if (changed.size === 0) {
      console.log("[wf] 当日内容已存在，无需变更");
      return { job, skipped: true };
    }

    // 3) 升版本
    await step.do("bump-version", async () => {
      if (files["index.html"] && files["js/app.js"] && files["sw.js"]) {
        const nv = bump(files);
        changed.add("index.html"); changed.add("js/app.js"); changed.add("sw.js");
        return nv;
      }
      return null;
    });

    // 4) 写回主库 + 部署站点库
    await step.do("commit-deploy", async () => {
      const paths = [...changed];
      // 主库：全部改动文件
      for (const p of paths) await ghPut(env, GH_MAIN, p, files[p].text, files[p].sha);
      // 站点库：版本文件 + 数据文件（部署）
      const sitePaths = paths.filter((p) => p.startsWith("index") || p.startsWith("js/") || p.startsWith("sw") || p.startsWith("data/"));
      for (const p of sitePaths) {
        const ex = await ghGet(env, GH_SITE, p);
        await ghPut(env, GH_SITE, p, files[p].text, ex ? ex.sha : undefined);
      }
      return { pushed: paths.length, deployed: sitePaths.length };
    });

    return { job, changed: [...changed] };
  }
}

// ---------- fetch 入口：手动触发 / 健康检查 ----------
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") return Response.json({ ok: true, name: "pmwb-auto" });
    const job = url.searchParams.get("job") || "daily";
    const id = crypto.randomUUID();
    try {
      const instance = await env.PMWB_WORKFLOW.create({ id, params: { job } });
      return Response.json({ id, job, status: (await instance.status()).status });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500 });
    }
  },
};
