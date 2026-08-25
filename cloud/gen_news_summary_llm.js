#!/usr/bin/env node
// 云端「新闻摘要」生成器（调智谱 GLM-4-Flash，永久免费，开启联网检索）
// 每日北京时间 08:00 为「个人成长 → 新闻摘要」板块生成一份全球要闻速览。
// 输出: data/news_summary.json
//   { updatedAt, days: { "YYYY-MM-DD": { date, brief:[...], groups:[{cat,icon,items:[{title,summary,source,url}]}] } } }
// 幂等：若当日已生成则跳过。
const fs = require("fs");
const path = require("path");
const { chatJSON } = require("./lib_llm");

function bjTodayStr() { return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10); }

async function main(dateArg, dirArg, opts) {
  // 新闻摘要按「北京时间」切日（与精读同口径），默认取北京时间今日
  const DATE = dateArg || process.argv[2] || bjTodayStr();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(DATE)) throw new Error("日期格式错误: " + DATE);
  const DIR = dirArg || (process.argv[3] || path.join(__dirname, ".."));
  const force = opts && opts.force;
  const rfile = path.join(DIR, "data", "news_summary.json");

  let ns = {};
  try { ns = JSON.parse(fs.readFileSync(rfile, "utf8")); } catch { ns = { days: {} }; }
  if (!ns.days) ns.days = {};
  if (!force && ns.days[DATE] && ns.days[DATE].groups && ns.days[DATE].groups.length) {
    console.log(`[newssum] ${DATE} 已存在，跳过（幂等）`);
    return { skipped: true, date: DATE };
  }

  const system = "你是资深国际新闻编辑，擅长把当天全球重要新闻整理成简洁、客观、有信息量的每日摘要。输出严格 JSON，不得编造新闻。";
  const user = `请基于今天(${DATE})的真实全球要闻，生成一份「新闻摘要」。
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

  const data = await chatJSON(system, user, { webSearch: true, temperature: 0.5, maxTokens: 6000 });
  let groups = Array.isArray(data.groups) ? data.groups : [];
  let brief = Array.isArray(data.brief) ? data.brief : [];
  if (groups.length === 0) throw new Error("LLM 返回新闻摘要为空");

  const out = {
    date: DATE,
    brief: brief.slice(0, 6).map((b) => String(b || "").slice(0, 40)),
    groups: groups.slice(0, 6).map(function (g) {
      return {
        cat: String(g.cat || "其他").slice(0, 12),
        icon: String(g.icon || "📌").slice(0, 4),
        items: (Array.isArray(g.items) ? g.items : []).slice(0, 6).map(function (it) {
          return {
            title: String(it.title || "").slice(0, 60),
            summary: String(it.summary || "").slice(0, 80),
            source: String(it.source || "").slice(0, 40),
            url: String(it.url || "").slice(0, 300)
          };
        }).filter(function (it) { return it.title; })
      };
    }).filter(function (g) { return g.items.length; })
  };

  ns.days[DATE] = out;
  ns.updatedAt = DATE + "T" + new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(11, 16) + ":00+08:00";
  fs.writeFileSync(rfile, JSON.stringify(ns, null, 2));

  const itemCnt = out.groups.reduce(function (a, g) { return a + g.items.length; }, 0);
  console.log(`[newssum] ${DATE} 生成 ${out.groups.length} 组 / ${itemCnt} 条`);
  return { date: DATE, groups: out.groups.length, items: itemCnt };
}

if (require.main === module) {
  main().then(function (r) { console.log(JSON.stringify(r)); }).catch(function (e) {
    console.error("ERR", e.message); process.exit(1);
  });
}
module.exports = { main };
