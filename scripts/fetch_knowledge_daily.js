// 知识学习 · 每日自动化脚本
// 作用：
//   1) 首次运行把旧「categories」结构迁移为「pool + cats + history」按日期结构；
//   2) 按日追加知识卡（每日 dailyCount 张），从最后一条历史续接，循环不重复直到池用尽；
//   3) 幂等：已存在当天的条目就跳过，绝不重复写、不升版本号。
// 用法：node scripts/fetch_knowledge_daily.js [jsonPath]
//   默认：data/knowledge.json
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const JSON_PATH = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, "data", "knowledge.json");

// ---- 复用 knowledge.js 里的纯函数 ----
const sandbox = { console, Math, Date, JSON, Object, Array };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, "js", "knowledge.js"), "utf8"), sandbox);
const learnNextDailyItemIds = sandbox.learnNextDailyItemIds;

// ---- 日期工具（Asia/Shanghai 视角）----
function tzDate(offsetDays) {
  // 返回 YYYY-MM-DD
  const now = new Date();
  const sh = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + (8 * 3600000));
  sh.setDate(sh.getDate() + (offsetDays || 0));
  const y = sh.getFullYear();
  const m = String(sh.getMonth() + 1).padStart(2, "0");
  const d = String(sh.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function addDays(str, n) {
  const [y, m, d] = str.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return tzFromDate(dt);
}
function tzFromDate(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ---- 旧结构 → 新结构 ----
function migrate(old) {
  if (old.pool) return old; // 已是新结构
  const cats = (old.categories || []).map(c => ({
    id: c.id, name: c.name, icon: c.icon, desc: c.desc, color: c.color
  }));
  const catMap = {};
  (old.categories || []).forEach(c => { (c.items || []).forEach(it => { catMap[it.id] = c.id; }); });
  const pool = [];
  (old.categories || []).forEach(c => {
    (c.items || []).forEach(it => { pool.push(Object.assign({ cat: c.id }, it)); });
  });
  return {
    updatedAt: new Date().toISOString(),
    dailyCount: 1,
    cats,
    pool,
    history: []
  };
}

function main() {
  const today = tzDate(0);
  let data = migrate(JSON.parse(fs.readFileSync(JSON_PATH, "utf8")));
  const dailyCount = data.dailyCount || 1;
  const pool = data.pool || [];
  if (!pool.length) { console.log("⚠️ pool 为空，退出"); process.exit(0); }

  // 已存在的最新日期
  const dates = (data.history || []).map(h => h.date).sort();
  const latest = dates.length ? dates[dates.length - 1] : null;

  let start;
  if (!latest) {
    start = addDays(today, -12); // 首次回填近 13 天
  } else if (latest < today) {
    start = addDays(latest, 1);
  } else {
    start = null; // 今天已存在，无需追加
  }

  let added = 0;
  if (start) {
    let d = start;
    while (d <= today) {
      const itemIds = learnNextDailyItemIds(pool, data.history, dailyCount);
      if (!itemIds.length) break;
      data.history.push({ date: d, itemIds });
      added++;
      d = addDays(d, 1);
    }
  }

  data.updatedAt = new Date().toISOString();
  fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2) + "\n", "utf8");

  console.log(`✅ 知识库日期结构更新完成`);
  console.log(`   今日日期: ${today}`);
  console.log(`   本次新增天数: ${added}`);
  console.log(`   历史总天数: ${data.history.length}`);
  console.log(`   卡片池: ${pool.length} 张`);
}

try {
  main();
} catch (e) {
  console.error("❌ 知识库每日更新失败:", e.message);
  process.exit(1);
}
