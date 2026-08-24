// 云端部署到 Netlify（境外免费托管，免备案）
// 流程：遍历站点目录 → 计算 sha1 → POST 创建 deploy → 按 required(sha1列表) PUT 上传 → 自动上线
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

function walk(dir, includeAll = false) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
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

async function deploy(siteDir, token, siteId) {
  if (!token) throw new Error("缺少 NETLIFY_TOKEN");
  if (!siteId) throw new Error("缺少 NETLIFY_SITE_ID");
  const files = walk(siteDir);
  if (files.length === 0) throw new Error("站点目录为空，无文件可部署");
  const filesMap = {};   // relPath -> sha1
  const byHash = {};     // sha1 -> 本地绝对路径
  for (const f of files) {
    const rel = path.relative(siteDir, f).split(path.sep).join("/");
    const h = crypto.createHash("sha1").update(fs.readFileSync(f)).digest("hex");
    filesMap[rel] = h;
    byHash[h] = f;
  }
  console.log(`[netlify] 共 ${files.length} 个文件`);
  // 1. 创建 deploy
  let resp = await fetch(`${API}/sites/${siteId}/deploys`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ files: filesMap, draft: false })
  });
  const deploy = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error("Netlify 创建部署失败: " + (deploy.message || resp.status));
  const required = deploy.required || [];
  console.log(`[netlify] deploy ${deploy.id} 待上传 ${required.length} 文件`);
  // 2. 按 sha1 上传 required 文件
  for (const h of required) {
    const local = byHash[h];
    if (!local) { console.warn("[netlify] 跳过未知 hash:", h); continue; }
    const buf = fs.readFileSync(local);
    const up = await fetch(`${API}/deploys/${deploy.id}/files/${h}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" },
      body: buf
    });
    if (!up.ok) throw new Error(`Netlify 上传失败 ${h}: ${up.status}`);
  }
  console.log("[netlify] 部署上线 ✅ " + (deploy.ssl_url || deploy.url || ""));
  // 保险：确保公开访问（新建/重置站点可能默认开登录墙）
  try { await setPublic(token, siteId); } catch { /* 非致命 */ }
  return deploy.ssl_url || deploy.url || "";
}

// 幂等：site_id 缺失时自动创建站点（返回 {id, url}）；始终确保公开访问(sso_login=false)
async function ensureSite(token, name) {
  if (!token) throw new Error("缺少 NETLIFY_TOKEN");
  let resp = await fetch(`${API}/sites`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: name || "pm-workbench" })
  });
  let s = await resp.json().catch(() => ({}));
  if (!resp.ok && s.message !== "site name is already taken") {
    throw new Error("Netlify 创建站点失败: " + (s.message || resp.status));
  }
  if (!s.id) {
    // 名字被占 → 查已有
    const list = await fetch(`${API}/sites?name=${encodeURIComponent(name || "pm-workbench")}`, { headers: { Authorization: `Bearer ${token}` } });
    const arr = await list.json();
    s = (arr || []).find((x) => x.name === (name || "pm-workbench"));
  }
  await setPublic(token, s.id);
  console.log(`[netlify] 站点就绪 id=${s.id} url=${s.ssl_url || s.url}`);
  return { id: s.id, url: s.ssl_url || s.url || "" };
}

// 关闭站点的登录墙（新建站点默认 sso_login=true，必须关闭才能公开访问）
async function setPublic(token, siteId) {
  const resp = await fetch(`${API}/sites/${siteId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ sso_login: false })
  });
  if (!resp.ok) throw new Error("Netlify 关闭访问控制失败: " + resp.status);
  return true;
}

module.exports = { deploy, ensureSite, setPublic };
