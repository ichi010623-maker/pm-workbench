// 精准部署：只上传指定文件列表到 GitHub Pages（复用 Contents API）。
// 用于只改了少量文件、不想全量遍历整树的场景。
// 用法：node cloud/deploy_targeted.js file1 file2 ...
// 凭据从 cloud/local.env 读取（GH_TOKEN / GH_REPO）。
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const API = "https://api.github.com";
const UA = "pm-workbench-deploy";

function loadEnv() {
  const p = path.join(__dirname, "local.env");
  if (!fs.existsSync(p)) return {};
  const out = {};
  fs.readFileSync(p, "utf8").split(/\r?\n/).forEach(line => {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2];
  });
  return out;
}

function authHeaders(token) {
  return {
    "Authorization": `Bearer ${token}`,
    "User-Agent": UA,
    "Content-Type": "application/json",
    "Accept": "application/vnd.github+json"
  };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function blobSha(buf) {
  const header = Buffer.from(`blob ${buf.length}\0`);
  return crypto.createHash("sha1").update(header).update(buf).digest("hex");
}

async function ensureRepo(owner, repo, token) {
  const url = `${API}/repos/${owner}/${repo}`;
  const r = await fetch(url, { headers: authHeaders(token) });
  if (r.ok) return { existed: true };
  const cr = await fetch(`${API}/user/repos`, {
    method: "POST", headers: authHeaders(token),
    body: JSON.stringify({ name: repo, private: false, auto_init: false, description: "硬件PM工作台 静态站点 GitHub Pages" })
  });
  if (!cr.ok) { const t = await cr.text(); throw new Error(`创建仓库失败 ${repo}: ${cr.status} ${t.slice(0,200)}`); }
  return { existed: false, created: true };
}

async function putFile(owner, repo, token, absPath, baseDir) {
  const rel = path.relative(baseDir, absPath).split(path.sep).join("/");
  const seg = rel.split("/").map(encodeURIComponent).join("/");
  const url = `${API}/repos/${owner}/${repo}/contents/${seg}`;
  const buf = fs.readFileSync(absPath);
  const content = buf.toString("base64");
  const localSha = blobSha(buf);

  const getRemoteSha = async () => {
    for (let i = 0; i < 4; i++) {
      try {
        const r = await fetch(url, { headers: authHeaders(token) });
        if (r.ok) { const j = await r.json(); if (j && j.sha) return j.sha; }
        if (r.status === 403 || r.status === 429) { await sleep(1200 * (i + 1)); continue; }
      } catch (e) { /* 网络抖动 */ }
      await sleep(400 * (i + 1));
    }
    return null;
  };

  let remoteSha = await getRemoteSha();
  if (remoteSha && remoteSha === localSha) return "skip";

  const putOnce = async sha => {
    const body = { message: "deploy: " + rel, content, branch: "main" };
    if (sha) body.sha = sha;
    return fetch(url, { method: "PUT", headers: authHeaders(token), body: JSON.stringify(body) });
  };

  let res = await putOnce(remoteSha);
  if (!res.ok && res.status === 422 && !remoteSha) {
    await sleep(800);
    remoteSha = await getRemoteSha();
    if (remoteSha) res = await putOnce(remoteSha);
  }
  if (!res.ok) { const t = await res.text(); throw new Error(`上传失败 ${rel}: ${res.status} ${t.slice(0,200)}`); }
  return remoteSha ? "update" : "create";
}

async function ensurePages(owner, repo, token) {
  const getUrl = `${API}/repos/${owner}/${repo}/pages`;
  const gr = await fetch(getUrl, { headers: authHeaders(token) });
  if (gr.ok) { const j = await gr.json(); return { alreadyOn: true, url: j.html_url }; }
  let res = await fetch(getUrl, {
    method: "POST", headers: authHeaders(token),
    body: JSON.stringify({ build_type: "legacy", source: { branch: "main", path: "/" } })
  });
  if (!res.ok) res = await fetch(getUrl, {
    method: "POST", headers: authHeaders(token),
    body: JSON.stringify({ build_type: "legacy", source_branch: "main", source_path: "/" })
  });
  if (!res.ok) { if (res.status === 409) return { alreadyOn: true, url: null }; const t = await res.text(); throw new Error(`开启 Pages 失败: ${res.status} ${t.slice(0,200)}`); }
  const j = await res.json();
  return { alreadyOn: false, url: j.html_url };
}

async function main() {
  const env = loadEnv();
  const token = env.GH_TOKEN;
  const repo = env.GH_REPO;
  if (!token) throw new Error("缺少 GH_TOKEN");
  if (!repo || !repo.includes("/")) throw new Error("缺少 GH_REPO");
  const [owner, name] = repo.split("/");
  const baseDir = process.cwd();
  const files = process.argv.slice(2);
  if (!files.length) throw new Error("请指定要部署的文件列表");

  const r0 = await ensureRepo(owner, name, token);
  console.log(`[gh-pages] 仓库 ${repo}: ${r0.existed ? "已存在" : "已创建"}`);
  let created = 0, updated = 0, skipped = 0;
  for (const f of files) {
    const abs = path.join(baseDir, f);
    const r = await putFile(owner, name, token, abs, baseDir);
    if (r === "create") { created++; console.log(`  + ${f}`); }
    else if (r === "update") { updated++; console.log(`  ~ ${f}`); }
    else { skipped++; console.log(`  = ${f} (未变)`); }
    await sleep(150);
  }
  console.log(`[gh-pages] 完成 新建=${created} 更新=${updated} 跳过=${skipped}`);
  const p = await ensurePages(owner, name, token);
  console.log(`[gh-pages] Pages: 已开启 url=${p.url || "(仓库 Settings → Pages 查看)"}`);
  console.log("DONE url:", p.url || `https://${owner}.github.io/${name}/`);
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch(e => { console.error("DEPLOY_FAIL:", e.message || e); process.exit(1); });
}
module.exports = { main, putFile, ensureRepo, ensurePages, loadEnv };
