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

async function main() {
  const DATE = parseDateArg(process.argv);
  const DIR = argv_dir(process.argv);
  const kfile = path.join(DIR, "data", "knowledge.json");
  const k = JSON.parse(fs.readFileSync(kfile, "utf8"));

  // 幂等检查
  if (k.history && k.history.some((h) => h.date === DATE)) {
    console.log(`[knowledge] ${DATE} 已存在，跳过生成（幂等）`);
    return { skipped: true, date: DATE };
  }

  const existingTitles = new Set(k.pool.map((p) => p.title));

  const system = `你是硬件/AI/投资/认知/营销领域的知识卡片作者。请基于真实、准确的知识创作卡片，避免虚构数据与错误结论。输出严格 JSON。`;
  const user = `请为日期 ${DATE} 创作 ${CATS.length * PER_CAT} 张知识卡片，覆盖5个分类各${PER_CAT}张：
- ai（AI/大模型）、finance（金融投资）、think（认知思维）、hwpm（硬件产品经理）、mkt（市场营销）。
每张卡片 JSON 结构：
{"cat":"ai|finance|think|hwpm|mkt","title":"简短有力(≤14字)","tag":"分类标签(≤6字)","question":"用户视角的为什么/是什么","content":"通俗解释(60-120字)","points":["要点1","要点2","要点3"],"tip":"一句话实践建议","diagram":"${[...WHITELIST].join("|")} 之一","source":"来源说明"}
要求：
1. 返回 {"cards":[...]} 共${CATS.length * PER_CAT}张，每分类恰好${PER_CAT}张。
2. 标题必须全新、不重复；points 必须恰好3条；diagram 必须是指定白名单之一。
3. 内容真实准确，面向产品经理/创业者，实用优先。`;

  const data = await chatJSON(system, user, { temperature: 0.8, maxTokens: 8000 });
  let cards = Array.isArray(data) ? data : data.cards;
  if (!Array.isArray(cards)) throw new Error("LLM 返回结构异常");

  // 校验 + 赋 id
  const usedTitles = new Set(existingTitles);
  const out = [];
  let dropped = 0;
  for (const c of cards) {
    if (!CATS.includes(c.cat)) { dropped++; continue; }
    if (!c.title || usedTitles.has(c.title)) { dropped++; continue; }
    if (!Array.isArray(c.points) || c.points.length !== 3) { dropped++; continue; }
    if (!WHITELIST.has(c.diagram)) { dropped++; continue; }
    const id = nextId(k.pool.concat(out), c.cat);
    out.push({
      cat: c.cat, id,
      title: c.title, tag: c.tag || "", question: c.question || "",
      content: c.content || "", points: c.points,
      tip: c.tip || "", diagram: c.diagram, source: c.source || "云端 LLM 生成"
    });
    usedTitles.add(c.title);
  }

  if (out.length < CATS.length * PER_CAT) {
    console.warn(`[knowledge] 有效卡 ${out.length}/${CATS.length * PER_CAT}，缺失 ${CATS.length * PER_CAT - out.length} 张（dropped ${dropped}）`);
  }

  // 写入 pool + history
  k.pool = k.pool.concat(out);
  k.history = (k.history || []).concat({ date: DATE, itemIds: out.map((o) => o.id) });
  k.dailyCount = PER_CAT * CATS.length;
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
