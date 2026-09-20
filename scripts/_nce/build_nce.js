/* 合并 scripts/_nce/*.jsonl → data/lang_listen_nce1.json / lang_listen_nce2.json
 * 同时做严格校验：JSON 合法性 / 课号连续 / 课名唯一 / 句子格式（en|zh）
 * 用法: node scripts/_nce/build_nce.js
 */
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname);
const OUT = path.join(__dirname, "..", "..", "data");

const BOOKS = [
  {
    id: 1,
    name: "新概念英语 第一册",
    subtitle: "First Things First · 英语初阶",
    files: ["n1_a.jsonl", "n1_b.jsonl", "n1_c.jsonl", "n1_d.jsonl"],
    count: 144
  },
  {
    id: 2,
    name: "新概念英语 第二册",
    subtitle: "Practice and Progress · 实践与进步",
    files: ["n2_a.jsonl", "n2_b.jsonl", "n2_c.jsonl"],
    count: 96
  }
];

const errors = [];
let total = 0;

function fail(msg) { errors.push(msg); }

const built = BOOKS.map(function (b) {
  const lessons = [];
  b.files.forEach(function (f) {
    const p = path.join(DIR, f);
    if (!fs.existsSync(p)) { fail("缺少分片文件 " + f); return; }
    const lines = fs.readFileSync(p, "utf8").split("\n");
    lines.forEach(function (raw, i) {
      const line = raw.trim();
      if (!line) return;
      let o;
      try { o = JSON.parse(line); }
      catch (e) {
        fail(f + ":" + (i + 1) + " JSON 解析失败 → " + e.message + " | " + line.slice(0, 70));
        return;
      }
      if (typeof o.n !== "number") { fail(f + ":" + (i + 1) + " 缺 n"); return; }
      if (!o.t || typeof o.t !== "string") { fail(f + ":" + (i + 1) + " 缺课名 t"); return; }
      if (!Array.isArray(o.s) || !o.s.length) { fail(f + ":" + (i + 1) + " 缺句子 s"); return; }
      o.s.forEach(function (s, si) {
        if (typeof s !== "string") { fail(f + ":" + (i + 1) + " 第" + (si + 1) + "句不是字符串"); return; }
        const parts = s.split("|");
        if (parts.length !== 2) { fail(f + ":" + (i + 1) + " 第" + (si + 1) + "句 | 数量=" + parts.length + " → " + s.slice(0, 50)); return; }
        if (!parts[0].trim() || !parts[1].trim()) { fail(f + ":" + (i + 1) + " 第" + (si + 1) + "句有空段"); return; }
      });
      lessons.push({ n: o.n, t: o.t, zh: o.zh || "", g: o.g || "", s: o.s });
    });
  });

  // 排序 + 连续性
  lessons.sort(function (a, b) { return a.n - b.n; });
  lessons.forEach(function (l, i) {
    if (l.n !== i + 1) fail("第" + b.id + "册 课号不连续：位置" + (i + 1) + " 是第" + l.n + "课");
  });
  if (lessons.length !== b.count) fail("第" + b.id + "册 课数=" + lessons.length + "，期望 " + b.count);

  // 课名允许重复（新概念第一册奇数课/偶数课常共用句型名），
  // 但导入听力模块时是按「素材标题」去重的，所以派生标题必须全局唯一 —— 靠课号保证。
  const seen = {};
  lessons.forEach(function (l) {
    const key = "📘 新概念 " + b.id + " · L" + l.n + " " + l.t;
    if (seen[key] !== undefined) fail("第" + b.id + "册 派生素材标题重复：" + key);
    seen[key] = l.n;
  });
  const dupNames = {};
  lessons.forEach(function (l) { dupNames[l.t] = (dupNames[l.t] || 0) + 1; });
  const repeated = Object.keys(dupNames).filter(function (k) { return dupNames[k] > 1; });
  if (repeated.length) {
    console.log("   ℹ 第" + b.id + "册 有 " + repeated.length + " 个课名被多课共用（正常，靠课号区分）：" + repeated.slice(0, 4).join(" / ") + (repeated.length > 4 ? " …" : ""));
  }

  total += lessons.length;
  return {
    id: b.id,
    name: b.name,
    subtitle: b.subtitle,
    count: b.count,
    note: "按课次与语法点编排的听力磨耳素材（每课 3 句，英文 + 中文对照）。课名为公开目录信息，练习句为按该课场景与语法点编写，非教材原文；如需替换为教材原文，可在听力详情页用「✏️ 编辑」修改。",
    lessons: lessons
  };
});

if (errors.length) {
  console.log("❌ 校验失败 " + errors.length + " 项：");
  errors.slice(0, 40).forEach(function (e) { console.log("   - " + e); });
  process.exit(1);
}

built.forEach(function (b) {
  const p = path.join(OUT, "lang_listen_nce" + b.id + ".json");
  fs.writeFileSync(p, JSON.stringify(b, null, 0));
  const bytes = fs.statSync(p).size;
  console.log("✅ " + path.basename(p) + "  课数=" + b.lessons.length + "  句子=" + b.lessons.reduce(function (a, l) { return a + l.s.length; }, 0) + "  大小=" + (bytes / 1024).toFixed(1) + "KB");
});
console.log("总计 " + total + " 课，全部校验通过");
