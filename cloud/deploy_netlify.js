// 云端部署到 Netlify（境外免费托管，免备案）
// 流程：遍历站点目录 → 计算 sha1 → POST 创建 deploy → PUT 上传 required 文件 → 自动上线
// 环境变量: NETLIFY_TOKEN(必), NETLIFY_SITE_ID(必)
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const API = "https://api.netlify.com/api/v1";
// 仅部署 PWA 生产所需文件/目录（仓库根下的开发/运维文件不部署）
const INCLUDE = new Set([
  "index.html", "migrate.html", "manifest.json", "sw.js",
  "css", "js", "data"
]);

function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    let st;
    try { st = fs.statSync(p); } catch { continue; }
    if (st.isDirectory()) {
      if (INCLUDE.has(name)) out.push(...walk(p));
    } else if (INCLUDE.has(name)) {
      out.push(p);
    }
  }
  return out;
}

async function deploy(siteDir, token, siteId) {
  if (!token) throw new Error("缺少 NETLIFY_TOKEN");
  if (!siteId) throw new Error("缺少 NETLIFY_SITE_ID");
  const files = walk(siteDir);
  if (files.length === 0) throw new Error("站点目录为空，无文件可部署");
  const filesMap = {};
  for (const f of files) {
    const rel = path.relative(siteDir, f).split(path.sep).join("/");
    filesMap[rel] = crypto.createHash("sha1").update(fs.readFileSync(f)).digest("hex");
  }
  // 1. 创建 deploy（sha1 已命中的文件无需重传）
  let resp = await fetch(`${API}/sites/${siteId}/deploys`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ files: filesMap, draft: false })
  });
  const deploy = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error("Netlify 创建部署失败: " + (deploy.message || resp.status));
  console.log(`[netlify] deploy ${deploy.id} 待上传 ${(deploy.required || []).length} 文件`);
  // 2. 上传 required 文件
  for (const rel of deploy.required || []) {
    const local = path.join(siteDir, ...rel.split("/"));
    const buf = fs.readFileSync(local);
    const enc = rel.split("/").map(encodeURIComponent).join("/");
    const up = await fetch(`${API}/deploys/${deploy.id}/files/${enc}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" },
      body: buf
    });
    if (!up.ok) throw new Error(`Netlify 上传失败 ${rel}: ${up.status}`);
  }
  console.log("[netlify] 部署上线 ✅ " + (deploy.ssl_url || deploy.url || ""));
  return deploy.ssl_url || deploy.url || "";
}

// 幂等：site_id 缺失时自动创建站点（返回 {id, url}）
async function ensureSite(token, name) {
  if (!token) throw new Error("缺少 NETLIFY_TOKEN");
  const resp = await fetch(`${API}/sites`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: name || "pm-workbench" })
  });
  const s = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error("Netlify 创建站点失败: " + (s.message || resp.status));
  console.log(`[netlify] 站点已建 id=${s.id} url=${s.ssl_url || s.url}`);
  return { id: s.id, url: s.ssl_url || s.url || "" };
}

module.exports = { deploy, ensureSite };
