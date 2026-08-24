#!/usr/bin/env node
// 云端巡逻自愈：核查线上站点健康，异常则重跑每日生成并重新部署
// 用法: node cloud/patrol.js [repoDir]
// 环境变量: SITE_URL(必), AUTH_COOKIE(可选, 预览令牌), EDGEONE_TOKEN 等(自愈部署用)
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const gitee = require("./lib_gitee");

function todayStr() { return new Date().toISOString().slice(0, 10); }
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

async function diagnose(SITE, COOKIE) {
  const issues = [];
  // 1. 关键端点可达
  for (const ep of ["/", "/data/knowledge.json", "/data/news.json", "/data/aihot.json", "/migrate.html"]) {
    const c = getCode(SITE + ep, COOKIE);
    if (c !== "200") issues.push(`端点 ${ep} 状态码 ${c}`);
  }
  // 2. 知识卡含今日（对照 Gitee 真值，区分"内容缺失"与"部署滞后"）
  let siteHasToday = false;
  let giteeHasToday = null; // null=无法获取
  try {
    const k = JSON.parse(httpGet(SITE + "/data/knowledge.json", COOKIE).body);
    siteHasToday = (k.history || []).some((h) => h.date === todayStr());
    if (!k.pool || k.pool.length < 600) issues.push(`知识池异常(${k.pool?.length})`);
  } catch (e) { issues.push("解析线上 knowledge.json 失败: " + e.message); }
  try {
    const gk = JSON.parse((await gitee.getFile("data/knowledge.json")).content);
    giteeHasToday = (gk.history || []).some((h) => h.date === todayStr());
  } catch (e) { giteeHasToday = null; }
  if (!siteHasToday) {
    if (giteeHasToday) issues.push(`线上知识卡缺今日(${todayStr()})，Gitee 已有 → 部署滞后/失败`);
    else issues.push(`知识卡 history 缺今日(${todayStr()})，Gitee 亦缺 → 生成缺失`);
  }
  // 3. 资讯新鲜度（同样对照 Gitee）
  let siteNewsToday = false;
  let giteeNewsToday = null;
  try {
    const n = JSON.parse(httpGet(SITE + "/data/news.json", COOKIE).body);
    siteNewsToday = (n.generatedAt || "").slice(0, 10) === todayStr();
  } catch (e) { issues.push("解析线上 news.json 失败: " + e.message); }
  try {
    const gn = JSON.parse((await gitee.getFile("data/news.json")).content);
    giteeNewsToday = (gn.generatedAt || "").slice(0, 10) === todayStr();
  } catch (e) { giteeNewsToday = null; }
  if (!siteNewsToday) {
    if (giteeNewsToday) issues.push(`线上资讯 generatedAt 非今日，Gitee 已是今日 → 部署滞后/失败`);
    else issues.push(`资讯 generatedAt 非今日，Gitee 亦非 → 生成缺失`);
  }
  return issues;
}

async function heal(BASE) {
  console.log("[patrol] 触发自愈：重跑每日生成 + 部署");
  const r = spawnSync("node", [path.join(BASE, "cloud", "run_daily.js"), BASE], { stdio: "inherit" });
  return r.status === 0;
}

async function main(baseArg) {
  const BASE = baseArg || process.argv[2] || path.join(__dirname, "..");
  const SITE = (process.env.SITE_URL || "https://pm-workbench-dqtlusrk.edgeone.cool").replace(/\/$/, "");
  const COOKIE = process.env.AUTH_COOKIE || "";

  console.log(`[patrol] 巡检 ${SITE}`);
  const issues = await diagnose(SITE, COOKIE);
  if (issues.length === 0) {
    console.log("[patrol] 健康 ✅ 无需处理");
    return { ok: true, issues: [] };
  }
  console.warn("[patrol] 发现问题:\n - " + issues.join("\n - "));
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
