#!/usr/bin/env node
/**
 * 本机自动化入口（免费方案，替代腾讯云 SCF 与 GitHub Actions）
 *
 * 用法: node cloud/local_run.js <daily|news|reading|newssum|patrol>
 *
 * 职责：
 *   1. 读取 cloud/local.env 注入凭据（密钥不落定时任务、不进版本库）
 *   2. 同步主库最新代码/数据（git pull --rebase）
 *   3. 调用 cloud/ci_run.js 执行生成 → 升版本 → 测试 → push 主库 → 部署 GitHub Pages
 *   4. 打印本次结果摘要
 *
 * 设计要点：
 *   - 全程 0 成本：智谱 GLM-4-Flash 免费额度 + GitHub Pages 免费 + 本机算力
 *   - 幂等：重复执行不会重复生成（生成脚本按日期判断），patrol 负责自愈补漏
 */
const fs = require("fs");
const path = require("path");
const { execSync, spawnSync } = require("child_process");

const BASE = path.join(__dirname, "..");
const JOB = (process.argv[2] || "daily").toLowerCase();

/** 读取 key=value 形式的 env 文件，注入 process.env（不覆盖已有环境变量） */
function loadEnv(file) {
  if (!fs.existsSync(file)) {
    console.error("[local_run] 缺少凭据文件:", file);
    process.exit(1);
  }
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const s = line.trim();
    if (!s || s.startsWith("#")) continue;
    const i = s.indexOf("=");
    if (i < 0) continue;
    const k = s.slice(0, i).trim();
    const v = s.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}

function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: BASE, stdio: "inherit", ...opts });
}

function gitOut(cmd) {
  return execSync(cmd, { cwd: BASE, encoding: "utf8" }).trim();
}

/**
 * 单实例锁：多个 local_run 并发时，git pull --rebase 会 reset 工作区，
 * 把另一个进程正在生成的内容回滚。这里用 lockfile + 存活检测强制串行。
 */
const LOCK_FILE = path.join(BASE, ".local_run.lock");
function releaseLock() {
  try { fs.unlinkSync(LOCK_FILE); } catch (_) {}
}
function acquireLock() {
  try {
    const fd = fs.openSync(LOCK_FILE, "wx");
    fs.writeSync(fd, String(process.pid) + " " + new Date().toISOString());
    fs.closeSync(fd);
    process.on("exit", releaseLock);
    process.on("SIGINT", () => { releaseLock(); process.exit(130); });
    process.on("SIGTERM", () => { releaseLock(); process.exit(143); });
    return true;
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
    try {
      const pid = parseInt(fs.readFileSync(LOCK_FILE, "utf8").trim().split(/\s+/)[0], 10);
      process.kill(pid, 0); // 持有者仍存活 → 放弃本次执行
      console.error(`[local_run] 另一个实例正在运行 (pid ${pid})，本次跳过以避免并发污染`);
      return false;
    } catch (_) {
      try { fs.unlinkSync(LOCK_FILE); } catch (__) {}
      return acquireLock(); // 僵死锁：清理后重试
    }
  }
}

function main() {
  if (!acquireLock()) process.exit(0);
  // 本机所有网络操作直连（智谱/百度国内直连，GitHub 直连已验证可用）；
  // 沙箱代理(50066)时好时坏，带代理反而 git push 502，故统一移除代理环境变量
  ["HTTPS_PROXY", "HTTP_PROXY", "https_proxy", "http_proxy", "ALL_PROXY", "all_proxy"].forEach((k) => delete process.env[k]);
  loadEnv(path.join(__dirname, "local.env"));
  process.env.CLOUD = "1"; // 启用 run_daily.finish() 的 push + 部署
  process.env.TZ = process.env.TZ || "Asia/Shanghai";
  // 定时任务环境的 PATH 常不含 node，这里把当前 node 所在目录前置，保证内部 spawnSync("node", ...) 可用
  process.env.PATH = path.dirname(process.execPath) + path.delimiter + process.env.PATH;

  console.log(`[local_run] JOB=${JOB} 时间=${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`);

  // 1. 用 token 重写 origin，使 push 无需交互（token 仅写入本机 .git/config，不入库）
  const token = process.env.GH_TOKEN;
  if (token) {
    run(`git remote set-url origin https://ichi010623-maker:${token}@github.com/ichi010623-maker/pm-workbench.git`);
  }

  // 2. 同步最新：本地若残留未提交改动先提交，再 rebase 到远程最新之上
  try {
    const dirty = gitOut("git status --porcelain");
    if (dirty) {
      console.log("[local_run] 发现未提交改动，先本地提交");
      run('git add -A');
      run('git commit -q -m "auto: 本地同步" || true', { shell: "/bin/bash" });
    }
    run("git pull --rebase --quiet origin main");
    console.log("[local_run] 已同步主库最新: " + gitOut("git log --oneline -1"));
  } catch (e) {
    console.error("[local_run] 同步主库失败:", e.message);
    // 不致命：继续基于本地副本执行，patrol 任务仍可自愈
  }

  // 3. 执行任务（ci_run 内部完成 生成 → 升版本 → 测试 → push → 部署）
  const r = spawnSync(process.execPath, [path.join(__dirname, "ci_run.js"), JOB, BASE], {
    cwd: BASE,
    stdio: "inherit",
    env: process.env,
    timeout: 25 * 60 * 1000, // 25 分钟上限：daily 全量生成最长约 8 分钟
  });
  if (r.status !== 0) {
    console.error(`[local_run] 任务 ${JOB} 失败 (exit ${r.status})`);
    process.exit(r.status || 1);
  }

  // 4. 摘要
  try {
    const ver = (fs.readFileSync(path.join(BASE, "index.html"), "utf8").match(/\?v=([\d.]+)/) || [])[1];
    console.log(`[local_run] 完成 JOB=${JOB} 版本=v${ver} 站点=${process.env.SITE_URL}`);
  } catch (_) {
    console.log(`[local_run] 完成 JOB=${JOB}`);
  }
}

main();
