#!/usr/bin/env node
// 云端精读文章生成器（调智谱 GLM-4-Flash，免费）
// 每日为语言学习「精读」模块推送 10 篇短英文文章（含中文翻译）
// 输出: data/lang_reading.json  { updatedAt, days: { "YYYY-MM-DD": [ {level,title,content,translation} x10 ] } }
// 幂等：若当日已生成则跳过。
const fs = require("fs");
const path = require("path");
const { chatJSON } = require("./lib_llm");

async function main(dateArg, dirArg, opts) {
  const DATE = dateArg || process.argv[2] || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(DATE)) throw new Error("日期格式错误: " + DATE);
  const DIR = dirArg || (process.argv[3] || path.join(__dirname, ".."));
  const force = opts && opts.force;
  const rfile = path.join(DIR, "data", "lang_reading.json");

  let rd = {};
  try { rd = JSON.parse(fs.readFileSync(rfile, "utf8")); } catch { rd = { days: {} }; }
  if (!rd.days) rd.days = {};
  if (!force && rd.days[DATE] && rd.days[DATE].length >= 10) {
    console.log(`[reading] ${DATE} 已存在，跳过（幂等）`);
    return { skipped: true, date: DATE };
  }

  // 已用标题（防重复主题）
  const used = [];
  Object.keys(rd.days).forEach((d) => {
    (rd.days[d] || []).forEach((a) => a && a.title && used.push(a.title));
  });

  const system = "你是英语学习内容编辑，擅长写适合精读的短英文文章。输出严格 JSON。";
  const user = `为今天(${DATE})写 10 篇短英文精读文章。要求：
- 每篇 content 60~100 词，句子简单清晰，适合非母语者精读。
- 主题多样且有知识性：科技、生活、职场、文化、健康、环境、心理学、美食、旅行、体育等轮换。
- 每篇含中文全文翻译 translation（自然、准确）。
- level 分级："入门"|"进阶"|"挑战" 均匀分布。
- title 用英文（≤8词）。
- 避免与以下已用标题重复：${used.slice(0, 40).join(" / ") || "（无）"}
返回严格 JSON：{"articles":[{"level":"...","title":"...","content":"...","translation":"..."} ×10]}`;

  const data = await chatJSON(system, user, { temperature: 0.8, maxTokens: 6000 });
  let arts = data.articles;
  if (!Array.isArray(arts) || arts.length === 0) throw new Error("LLM 返回精读文章异常");

  const out = arts.slice(0, 10).map((a) => ({
    level: ["入门", "进阶", "挑战"].includes(a.level) ? a.level : "进阶",
    title: String(a.title || "").slice(0, 80),
    content: String(a.content || ""),
    translation: String(a.translation || "")
  })).filter((a) => a.title && a.content);

  rd.days[DATE] = out;
  rd.updatedAt = DATE + "T" + new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(11, 16) + ":00+08:00";
  fs.writeFileSync(rfile, JSON.stringify(rd, null, 2));

  console.log(`[reading] ${DATE} 生成 ${out.length} 篇精读文章`);
  return { date: DATE, count: out.length };
}

if (require.main === module) {
  main().then((r) => console.log(JSON.stringify(r))).catch((e) => {
    console.error("ERR", e.message); process.exit(1);
  });
}
module.exports = { main };
