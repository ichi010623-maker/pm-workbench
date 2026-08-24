// Gitee 文件读写（无需 git 二进制，纯 API）。用于云端函数同步仓库。
// 私有仓需 access_token。
const API = "https://gitee.com/api/v5";
const OWNER = process.env.GITEE_OWNER || "ichi0623";
const REPO = process.env.GITEE_REPO || "pm-workbench";
const TOKEN = process.env.GITEE_TOKEN;

function auth(q) {
  const s = new URLSearchParams(q);
  if (TOKEN) s.set("access_token", TOKEN);
  return s.toString();
}

async function getFile(path, ref = "main") {
  const url = `${API}/repos/${OWNER}/${REPO}/contents/${encodeURI(path)}?${auth({ ref })}`;
  const r = await fetch(url);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("Gitee GET " + r.status + " " + path);
  const j = await r.json();
  const content = Buffer.from(j.content, "base64").toString("utf8");
  return { content, sha: j.sha };
}

async function putFile(path, content, message, sha) {
  const url = `${API}/repos/${OWNER}/${REPO}/contents/${encodeURI(path)}?${auth({})}`;
  const body = {
    message,
    content: Buffer.from(content, "utf8").toString("base64"),
    branch: "main"
  };
  if (sha) body.sha = sha;
  // Gitee：文件已存在(有 sha)用 PUT 更新，否则 POST 新建
  const method = sha ? "PUT" : "POST";
  const r = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error("Gitee " + method + " " + r.status + " " + txt.slice(0, 200));
  }
  return r.json();
}

// 批量更新多个文件（同一提交信息）。自动处理 sha。
async function commitFiles(files, message) {
  for (const f of files) {
    const cur = await getFile(f.path).catch(() => null);
    await putFile(f.path, f.content, message, cur?.sha);
  }
}

module.exports = { getFile, putFile, commitFiles, OWNER, REPO };
