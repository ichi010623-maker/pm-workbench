#!/usr/bin/env node
// 云端资讯生成器（调智谱 GLM-4-Flash，永久免费 + 联网检索，保证真实新闻）
// 用法: node cloud/gen_news_llm.js [YYYY-MM-DD] [repoDir]
// 幂等：若 news.json 已含当日 id 前缀，则跳过。
const fs = require("fs");
const path = require("path");
const { chatJSON } = require("./lib_llm");

const CATS = ["official", "hardware", "ai", "tech"];

function parseDateArg(argv) {
  const d = argv[2] || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error("日期格式错误: " + d);
  return d;
}
function argv_dir(argv) { return argv[3] || path.join(__dirname, ".."); }

/**
 * 无文件系统生成入口（供 Cloudflare Worker 使用）：
 * 传入 news 数据对象（opts.archive 可选传 news-archive 对象），原地更新并返回。
 * opts.llm 可注入自定义 LLM 实现；opts.refresh 允许覆盖当日旧资讯。
 */
async function generate(n, DATE, opts = {}) {
  const llm = opts.llm || null;
  const REFRESH = opts.refresh;
  const arc = opts.archive || null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(DATE)) throw new Error("日期格式错误: " + DATE);

  if (!REFRESH && (n.items || []).some((it) => String(it.id).startsWith(DATE + "-"))) {
    console.log(`[news] ${DATE} 已存在，跳过（幂等）`);
    return { skipped: true, date: DATE, data: n, archive: arc };
  }

  const system = `你是科技/硬件/AI 行业资讯编辑。必须基于真实发生的新闻，禁止编造。输出严格 JSON。`;
  const user = `请整理 ${DATE} 当天真实的科技/硬件/AI/政策资讯，约13条，覆盖：
- official（政策/监管）、hardware（硬件产品/芯片/终端）、ai（大模型/算法/公司）、tech（前沿技术/算力/机器人）。
每条 JSON：
{"category":"official|hardware|ai|tech","priority":3-5(5最重要),"title":"新闻标题(真实)","summary":"60-120字事实概述","source":"媒体/官方名称","url":"该新闻真实可访问链接"}
额外返回字段：leadTitle（一句话概括今日最大热点，≤60字）。
要求：返回 {"items":[...13条], "leadTitle":"..."}。只写真实新闻，不确定则降低 priority 或省略。`;

  const chat = llm || chatJSON;
  // 联网检索仅智谱通道支持；Worker（Workers AI）无联网时关闭，靠模型训练知识兜底
  const data = await chat(system, user, { temperature: 0.5, maxTokens: 6000, webSearch: !!llm ? false : true });
  let items = data.items;
  if (!Array.isArray(items) || items.length === 0) throw new Error("LLM 返回资讯异常");

  // 规整 + 赋 id
  const out = items.slice(0, 16).map((it, i) => ({
    id: `${DATE}-${String(i + 1).padStart(3, "0")}`,
    category: CATS.includes(it.category) ? it.category : "tech",
    priority: Math.min(5, Math.max(1, parseInt(it.priority, 10) || 3)),
    title: it.title || "",
    summary: it.summary || "",
    source: it.source || "",
    url: it.url || ""
  }));
  const leadTitle = data.leadTitle || out[0]?.title || "";

  // news.json：去重当日后前置
  n.items = n.items.filter((it) => !String(it.id).startsWith(DATE + "-"));
  n.items = out.concat(n.items);
  // generatedAt：07:00 定时用 T07:00:00；12/18 点刷新用实际时间（北京时间）
  if (REFRESH) {
    const now = new Date(Date.now() + 8 * 3600 * 1000);
    n.generatedAt = now.toISOString().replace("T", " ").slice(0, 16) + "+08:00";
  } else {
    n.generatedAt = DATE + "T07:00:00+08:00";
  }
  n.categories = n.categories || CATS;

  const res = { date: DATE, count: out.length, leadTitle, data: n };
  if (arc) {
    arc[DATE] = { generatedAt: n.generatedAt, categories: n.categories, items: out };
    res.archive = arc;
  }
  console.log(`[news] ${DATE} 生成 ${out.length} 条；archive 已更新（aihot 由 fetch_aihot_daily.js 管理）`);
  return res;
}

async function main(dateArg, dirArg, opts) {
  const DATE = dateArg || process.argv[2] || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(DATE)) throw new Error("日期格式错误: " + DATE);
  const DIR = dirArg || argv_dir(process.argv);
  const REFRESH = opts && opts.refresh; // 12/18 点重跑：允许覆盖当日旧资讯
  const nfile = path.join(DIR, "data", "news.json");
  const afile = path.join(DIR, "data", "news-archive.json");

  const n = JSON.parse(fs.readFileSync(nfile, "utf8"));
  const arc = JSON.parse(fs.readFileSync(afile, "utf8"));

  const r = await generate(n, DATE, { refresh: REFRESH, archive: arc });
  if (r.data) fs.writeFileSync(nfile, JSON.stringify(r.data, null, 2));
  if (r.archive) fs.writeFileSync(afile, JSON.stringify(r.archive, null, 2));
  return r;
}

function argv_dir(argv) { return argv[3] || path.join(__dirname, ".."); }

if (require.main === module) {
  main().then((r) => console.log(JSON.stringify(r))).catch((e) => {
    console.error("ERR", e.message); process.exit(1);
  });
}
module.exports = { main, generate };
