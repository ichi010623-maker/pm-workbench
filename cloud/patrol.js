#!/usr/bin/env node
// 云端巡逻自愈：核查线上站点健康，异常则重跑每日生成并重新部署
// 用法: node cloud/patrol.js [repoDir]
// 环境变量: SITE_URL(必), AUTH_COOKIE(可选, 预览令牌), EDGEONE_TOKEN 等(自愈部署用)
// 说明: 迁移到 GitHub 主库后，主库即本地 checkout，故"内容缺失"判定直接读本地 data/*.json，
//       不再依赖 Gitee（Gitee 已弃用）。
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function todayStr() { return new Date().toISOString().slice(0, 10); }

// 读取本地主库 data 文件（即最新真值），失败返回 null
function readLocalJson(BASE, rel) {
  try {
    const p = path.join(BASE, rel);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) { return null; }
}

function httpGet(url, cookie) {
  const r = spawnSync("curl", [
    "-sL", "--max-time", "25", "-w", "%{http_code}",
    ...(cookie ? ["-b", cookie] : []),
    "-o", "/tmp/_patrol_body", url
  ]);
  const code = parseInt((r.stdout || "").toString().trim() || "0", 10);
  let body = "";
  try { body = fs.readFileSync("/tmp/_patrol_body", "utf8"); } catch {}
  return { code, body };
}
function getCode(url, cookie) {
  const r = spawnSync("curl", ["-s", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", "25", ...(cookie ? ["-b", cookie] : []), url]);
  return r.stdout.toString().trim();
}

async function diagnose(BASE, SITE, COOKIE) {
  const issues = [];
  let healable = false; // 仅当本地主库也缺内容（生成缺失）时才自愈；部署滞后/站点未就绪不折腾
  // 1. 关键端点可达
  for (const ep of ["/", "/data/knowledge.json", "/data/news.json", "/data/aihot.json", "/migrate.html"]) {
    const c = getCode(SITE + ep, COOKIE);
    if (c !== "200") issues.push(`端点 ${ep} 状态码 ${c}`);
  }
  // 2. 知识卡含今日（对照本地主库真值，区分"内容缺失"与"部署滞后"）
  let siteHasToday = false;
  let localHasToday = null; // null=无法读取本地
  try {
    const k = JSON.parse(httpGet(SITE + "/data/knowledge.json", COOKIE).body);
    siteHasToday = (k.history || []).some((h) => h.date === todayStr());
    if (!k.pool || k.pool.length < 600) issues.push(`知识池异常(${k.pool?.length})`);
  } catch (e) { issues.push("解析线上 knowledge.json 失败: " + e.message); }
  const lk = readLocalJson(BASE, "data/knowledge.json");
  if (lk) localHasToday = (lk.history || []).some((h) => h.date === todayStr());
  if (!siteHasToday) {
    if (localHasToday) issues.push(`线上知识卡缺今日(${todayStr()})，主库已有 → 部署滞后`);
    else { issues.push(`知识卡 history 缺今日(${todayStr()})，主库亦缺 → 生成缺失`); healable = true; }
  }
  // 3. 资讯新鲜度（对照本地主库；与 newsGen 幂等口径一致：按 items id 前缀「UTC 日期」判断当日）
  let siteNewsToday = false;
  let localNewsToday = null;
  try {
    const n = JSON.parse(httpGet(SITE + "/data/news.json", COOKIE).body);
    siteNewsToday = (n.items || []).some((it) => String(it.id).startsWith(todayStr() + "-"));
  } catch (e) { issues.push("解析线上 news.json 失败: " + e.message); }
  const ln = readLocalJson(BASE, "data/news.json");
  if (ln) localNewsToday = (ln.items || []).some((it) => String(it.id).startsWith(todayStr() + "-"));
  if (!siteNewsToday) {
    if (localNewsToday) issues.push(`线上资讯缺当日(id前缀${todayStr()})，主库已有 → 部署滞后`);
    else { issues.push(`资讯缺当日(id前缀${todayStr()})，主库亦缺 → 生成缺失`); healable = true; }
  }
  return { issues, healable };
}

async function heal(BASE) {
  console.log("[patrol] 触发自愈：重跑每日生成 + 部署");
  const r = spawnSync("node", [path.join(BASE, "cloud", "run_daily.js"), BASE], { stdio: "inherit" });
  return r.status === 0;
}

async function main(baseArg) {
  const BASE = baseArg || process.argv[2] || path.join(__dirname, "..");
  const SITE = (process.env.SITE_URL || "https://ichi010623-maker.github.io/pm-workbench-site/").replace(/\/$/, "");
  const COOKIE = process.env.AUTH_COOKIE || "";

  console.log(`[patrol] 巡检 ${SITE}`);
  const { issues, healable } = await diagnose(BASE, SITE, COOKIE);
  if (issues.length === 0) {
    console.log("[patrol] 健康 ✅ 无需处理");
    return { ok: true, issues: [] };
  }
  console.warn("[patrol] 发现问题:\n - " + issues.join("\n - "));
  if (!healable) {
    // 主库内容正常，只是站点未就绪/部署滞后（如 Pages 构建中）
    // 此时自愈无意义（会空涨版本号），等下一次定时部署即可
    console.warn("[patrol] 内容源正常，属部署滞后/站点未就绪 → 跳过自愈，等待下次定时部署");
    return { ok: true, skipped: true, issues };
  }
  const healed = await heal(BASE);
  if (healed) {
    console.log("[patrol] 自愈完成 ✅");
    return { ok: true, healed: true, issues };
  }
  console.error("[patrol] 自愈失败 ❌，需人工介入");
  // 这里可接告警（如企业微信/邮件），免费方案先打日志
  return { ok: false, issues };
}

if (require.main === module) {
  main().then((r) => process.exit(r.ok ? 0 : 2)).catch((e) => { console.error(e); process.exit(2); });
}
module.exports = { main, diagnose };
