// 部署到 GitHub Pages（免费托管 · 纯 API 建库/部署/开启，无需人工点击）
// 流程：确保公开仓库存在 → 遍历站点文件(INCLUDE) 经 GitHub contents API 创建/更新 → 开启 GitHub Pages(自动构建)
// 环境变量: GH_TOKEN(必), GH_REPO(必, 形如 owner/repo), BASE(站点根目录, 默认 cwd)
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const API = "https://api.github.com";
const UA = "pm-workbench-deploy";

// 网络抖动/限流重试：Node fetch 直连 api.github.com（不走系统代理），偶发超时/403/429，重试可自愈
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const INCLUDE = new Set([
  "index.html", "migrate.html", "manifest.json", "sw.js",
  "css", "js", "data"
]);

function authHeaders(token) {
  return {
    "Authorization": `Bearer ${token}`,
    "User-Agent": UA,
    "Content-Type": "application/json",
    "Accept": "application/vnd.github+json"
  };
}

function walk(dir, includeAll = false) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    if (name === ".git" || name === "node_modules" || name === ".workbuddy") continue;
    const p = path.join(dir, name);
    let st;
    try { st = fs.statSync(p); } catch { continue; }
    if (st.isDirectory()) {
      if (includeAll || INCLUDE.has(name)) out.push(...walk(p, true));
    } else if (includeAll || INCLUDE.has(name)) {
      out.push(p);
    }
  }
  return out;
}

// git blob sha1（与 GitHub 返回的文件 sha 一致，用于跳过未变更文件）
function blobSha(buf) {
  const header = Buffer.from(`blob ${buf.length}\0`);
  return crypto.createHash("sha1").update(header).update(buf).digest("hex");
}

async function putFile(owner, repo, token, absPath, baseDir) {
  const rel = path.relative(baseDir, absPath).split(path.sep).join("/");
  const seg = rel.split("/").map(encodeURIComponent).join("/");
  const url = `${API}/repos/${owner}/${repo}/contents/${seg}`;
  const buf = fs.readFileSync(absPath);
  const content = buf.toString("base64");
  const localSha = blobSha(buf);

  // 获取远端 sha（带重试）：失败返回 null，后续 PUT 会按“新建”处理并自动补 sha 重试
  const getRemoteSha = async () => {
    for (let i = 0; i < 4; i++) {
      try {
        const r = await fetch(url, { headers: authHeaders(token) });
        if (r.ok) { const j = await r.json(); if (j && j.sha) return j.sha; }
        if (r.status === 403 || r.status === 429) { await sleep(1200 * (i + 1)); continue; }
      } catch (e) { /* 网络抖动，重试 */ }
      await sleep(400 * (i + 1));
    }
    console.warn(`[gh-pages] ${rel} 远端 sha 获取失败，将按新建处理`);
    return null;
  };

  let remoteSha = await getRemoteSha();
  if (remoteSha && remoteSha === localSha) return "skip";

  const putOnce = async (sha) => {
    const body = { message: "deploy: " + rel, content, branch: "main" };
    if (sha) body.sha = sha;
    return fetch(url, { method: "PUT", headers: authHeaders(token), body: JSON.stringify(body) });
  };

  let res = await putOnce(remoteSha);
  // 422 且因缺 sha（GET 失败导致）→ 重取 sha 再试一次
  if (!res.ok && res.status === 422 && !remoteSha) {
    await sleep(800);
    remoteSha = await getRemoteSha();
    if (remoteSha) res = await putOnce(remoteSha);
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`GitHub 上传失败 ${rel}: ${res.status} ${t.slice(0, 200)}`);
  }
  return remoteSha ? "update" : "create";
}

async function ensureRepo(owner, repo, token) {
  const url = `${API}/repos/${owner}/${repo}`;
  const r = await fetch(url, { headers: authHeaders(token) });
  if (r.ok) return { existed: true };
  // 不存在则创建公开仓库
  const cr = await fetch(`${API}/user/repos`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ name: repo, private: false, auto_init: false, description: "硬件PM工作台 静态站点 GitHub Pages" })
  });
  if (!cr.ok) {
    const t = await cr.text();
    throw new Error(`创建仓库失败 ${repo}: ${cr.status} ${t.slice(0, 200)}`);
  }
  return { existed: false, created: true };
}

async function ensurePages(owner, repo, token) {
  const getUrl = `${API}/repos/${owner}/${repo}/pages`;
  const gr = await fetch(getUrl, { headers: authHeaders(token) });
  if (gr.ok) {
    const j = await gr.json();
    return { alreadyOn: true, url: j.html_url };
  }
  // 未开启 → 开启（兼容新旧 API body）
  const postUrl = `${API}/repos/${owner}/${repo}/pages`;
  let res = await fetch(postUrl, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ build_type: "legacy", source: { branch: "main", path: "/" } })
  });
  if (!res.ok) {
    // 回退到新字段写法
    res = await fetch(postUrl, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ build_type: "legacy", source_branch: "main", source_path: "/" })
    });
  }
  if (!res.ok) {
    const t = await res.text();
    if (res.status === 409) return { alreadyOn: true, url: null };
    throw new Error(`开启 GitHub Pages 失败: ${res.status} ${t.slice(0, 200)}`);
  }
  const j = await res.json();
  return { alreadyOn: false, url: j.html_url };
}

async function deploy(baseDir, repo, token) {
  if (!token) throw new Error("缺少 GH_TOKEN");
  if (!repo || !repo.includes("/")) throw new Error("缺少 GH_REPO (形如 owner/repo)");
  const [owner, name] = repo.split("/");
  const r0 = await ensureRepo(owner, name, token);
  console.log(`[gh-pages] 仓库 ${repo}: ${r0.existed ? "已存在" : "已创建"}`);
  const files = walk(baseDir);
  console.log(`[gh-pages] 待处理 ${files.length} 个文件 → ${repo}`);
  let created = 0, updated = 0, skipped = 0;
  for (const f of files) {
    const r = await putFile(owner, name, token, f, baseDir);
    if (r === "create") created++;
    else if (r === "update") updated++;
    else skipped++;
    await sleep(150); // 轻微限速，避免突发限流
  }
  console.log(`[gh-pages] 完成 新建=${created} 更新=${updated} 跳过=${skipped}`);
  const p = await ensurePages(owner, name, token);
  console.log(`[gh-pages] Pages: ${p.alreadyOn ? "已开启" : "已开启(新建)"} url=${p.url || "(仓库 Settings → Pages 查看)"}`);
  return p.url || `https://${owner}.github.io/${name}/`;
}

module.exports = { deploy, walk, INCLUDE };

if (require.main === module) {
  const BASE = process.argv[2] || process.cwd();
  const REPO = process.argv[3] || process.env.GH_REPO;
  const TOKEN = process.env.GH_TOKEN;
  deploy(BASE, REPO, TOKEN)
    .then(url => { console.log("DONE url:", url); process.exit(0); })
    .catch(e => { console.error("DEPLOY_FAIL:", e.message || e); process.exit(1); });
}
