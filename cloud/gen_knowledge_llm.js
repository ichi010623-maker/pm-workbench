#!/usr/bin/env node
// 云端知识卡生成器（调智谱 GLM-4-Flash，永久免费 + 联网检索）
// 用法: node cloud/gen_knowledge_llm.js [YYYY-MM-DD] [repoDir]
// 幂等：若 knowledge.json 的 history 已含该日期，则跳过。
const fs = require("fs");
const path = require("path");
const { chatJSON } = require("./lib_llm");

const WHITELIST = new Set([
  "llm", "token", "prompt", "context", "embedding", "rag", "agent", "multimodal",
  "compound", "dca", "pe", "inflation", "diversify", "rule72", "nav", "bond",
  "think-compound", "second-curve", "systems", "pareto", "feedback"
]);
const CATS = ["ai", "finance", "think", "hwpm", "mkt"];
const PER_CAT = 10;

function parseDateArg(argv) {
  const d = argv[2] || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error("日期格式错误: " + d);
  return d;
}

function nextId(pool, cat) {
  let max = 0;
  for (const it of pool) {
    if (it.cat !== cat) continue;
    const m = String(it.id).match(/^(\w+)-(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[2], 10));
  }
  return cat + "-" + (max + 1);
}

// 按分类默认 diagram（模型给错时回退）
const CAT_DIAGRAM = { ai: "llm", finance: "compound", think: "feedback", hwpm: "pareto", mkt: "feedback" };

function salvage(c, cat, existingTitles) {
  if (!c || !c.title || existingTitles.has(c.title)) return null;
  // 强制归类（请求的就是该分类，不必信模型自填 cat）
  let diagram = WHITELIST.has(c.diagram) ? c.diagram : CAT_DIAGRAM[cat];
  // points 容错：补足/截断为 3 条
  let points = Array.isArray(c.points) ? c.points.filter(Boolean) : [];
  if (points.length === 0) points = [c.content || "了解核心要点", "对比异同", "落地实践"];
  points = points.slice(0, 3);
  while (points.length < 3) points.push("结合实际应用");
  return {
    cat, id: "",
    title: c.title, tag: c.tag || "", question: c.question || "",
    content: c.content || "", points,
    tip: c.tip || "", diagram, source: c.source || "云端 LLM 生成"
  };
}

async function genCategory(cat, DATE, existingTitles) {
  const catName = { ai: "AI/大模型", finance: "金融投资", think: "认知思维", hwpm: "硬件产品经理", mkt: "市场营销" }[cat];
  const system = `你是${catName}领域的知识卡片作者。基于真实准确的知识创作，避免虚构。只输出严格 JSON。`;
  const user = `为日期 ${DATE} 创作 ${PER_CAT} 张「${catName}」知识卡片。每张结构：
{"cat":"${cat}","title":"简短有力(≤14字)","tag":"标签(≤6字)","question":"用户视角的为什么/是什么","content":"通俗解释(60-120字)","points":["要点1","要点2","要点3"],"tip":"一句话实践建议","diagram":"${[...WHITELIST].join("|")} 之一","source":"来源说明"}
要求：返回 {"cards":[...]} 恰好${PER_CAT}张；标题全新不重复；points 恰好3条；diagram 必须是指定白名单之一；内容真实、面向产品经理实用优先。`;

  const out = [];
  for (let attempt = 0; attempt < 3 && out.length < PER_CAT; attempt++) {
    try {
      // maxTokens 需容纳 10 张完整卡片（content/points/tip 全字段），过小会截断 JSON 导致卡片数不足
      const data = await chatJSON(system, user, { temperature: 0.85, maxTokens: 8000 });
      let cards = Array.isArray(data) ? data : data.cards;
      if (!Array.isArray(cards)) continue;
      for (const c of cards.filter(Boolean)) {
        if (out.length >= PER_CAT) break;
        const s = salvage(c, cat, existingTitles);
        if (s) { out.push(s); existingTitles.add(s.title); }
      }
    } catch (e) {
      console.warn(`[knowledge] ${cat} 第${attempt + 1}次失败: ${e.message}`);
    }
  }
  return out;
}

async function main(dateArg, dirArg) {
  const DATE = dateArg || process.argv[2] || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(DATE)) throw new Error("日期格式错误: " + DATE);
  const DIR = dirArg || argv_dir(process.argv);
  const kfile = path.join(DIR, "data", "knowledge.json");
  const k = JSON.parse(fs.readFileSync(kfile, "utf8"));

  // 幂等检查
  if (k.history && k.history.some((h) => h.date === DATE)) {
    console.log(`[knowledge] ${DATE} 已存在，跳过生成（幂等）`);
    return { skipped: true, date: DATE };
  }

  const existingTitles = new Set(k.pool.map((p) => p.title));
  const out = [];
  for (const cat of CATS) {
    const part = await genCategory(cat, DATE, existingTitles);
    out.push(...part);
    for (const o of part) o.id = nextId(k.pool.concat(out), cat);
    console.log(`[knowledge] ${cat}: ${part.length}/${PER_CAT} 张`);
  }

  const total = CATS.length * PER_CAT;
  if (out.length < total) {
    console.warn(`[knowledge] 有效卡 ${out.length}/${total}，缺失 ${total - out.length} 张`);
  }

  // 空结果不落盘：否则会写入 itemIds 为空的 history 条目，
  // 幂等检查会认为「该日已生成」而永久跳过，导致这一天再也补不上
  if (!out.length) {
    console.error(`[knowledge] ${DATE} 有效卡为 0，放弃写入（不产生空 history 条目）`);
    return { date: DATE, count: 0, skippedWrite: true };
  }

  // 写入 pool + history
  k.pool = k.pool.concat(out);
  k.history = (k.history || []).concat({ date: DATE, itemIds: out.map((o) => o.id) });
  k.dailyCount = total;
  fs.writeFileSync(kfile, JSON.stringify(k, null, 2));

  console.log(`[knowledge] ${DATE} 生成 ${out.length} 张，pool=${k.pool.length}`);
  return { date: DATE, count: out.length, pool: k.pool.length };
}

function argv_dir(argv) {
  return argv[3] || path.join(__dirname, "..");
}

if (require.main === module) {
  main().then((r) => console.log(JSON.stringify(r))).catch((e) => {
    console.error("ERR", e.message); process.exit(1);
  });
}
module.exports = { main };
