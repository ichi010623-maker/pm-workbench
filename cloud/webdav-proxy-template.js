// Cloudflare Worker 模板 · 代理浏览器 → 坚果云 WebDAV
// 用途：解决浏览器无 CORS 无法直连 dav.jianguoyun.com 的问题
// 部署：Cloudflare Dashboard → Workers & Pages → Create Worker → 粘贴本文件 → Deploy
// 配额：免费 10 万次/天（PM 工作台每日同步 < 100 次）

// 你的坚果云 WebDAV 账号信息（在 Worker 的 Settings → Variables 里设置，勿写进代码）
//   NUTSTORE_USER      = 登录坚果云的邮箱/手机
//   NUTSTORE_APP_PASS  = 坚果云应用授权密码（非登录密码）

const NUTSTORE_HOST = "dav.jianguoyun.com";

export default {
  async fetch(request, env) {
    // CORS 预检（OPTIONS）
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    const user = env.NUTSTORE_USER;
    const pass = env.NUTSTORE_APP_PASS;
    if (!user || !pass) {
      return new Response(
        JSON.stringify({ error: "Worker 未配置 NUTSTORE_USER / NUTSTORE_APP_PASS（Settings → Variables）" }),
        { status: 500, headers: { ...corsHeaders(), "Content-Type": "application/json" } }
      );
    }

    // 解析路径：/dav/<folder>/<file> → https://dav.jianguoyun.com/dav/<folder>/<file>
    const url = new URL(request.url);
    const pathAndQuery = url.pathname + url.search;
    const targetUrl = "https://" + NUTSTORE_HOST + pathAndQuery;

    // 构造上游请求
    const upstreamHeaders = new Headers();
    // 透传关键 header（PROPFIND/Depth/Content-Type/Range/If-Match 等）
    const passthrough = [
      "Content-Type", "Depth", "Range", "If-Match", "If-None-Match",
      "Overwrite", "Destination", "Content-Length", "Host"
    ];
    for (const h of passthrough) {
      const v = request.headers.get(h);
      if (v) upstreamHeaders.set(h, v);
    }
    // Basic Auth
    upstreamHeaders.set("Authorization", "Basic " + btoa(user + ":" + pass));

    const upstreamResp = await fetch(targetUrl, {
      method: request.method,
      headers: upstreamHeaders,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
    });

    // 构造响应：透传状态码 + 关键 header + 加 CORS
    const respHeaders = new Headers();
    const allowResp = ["Content-Type", "Content-Length", "ETag", "Last-Modified", "Accept-Ranges", "Content-Range"];
    for (const h of allowResp) {
      const v = upstreamResp.headers.get(h);
      if (v) respHeaders.set(h, v);
    }
    Object.entries(corsHeaders()).forEach(([k, v]) => respHeaders.set(k, v));

    return new Response(upstreamResp.body, {
      status: upstreamResp.status,
      headers: respHeaders,
    });
  },
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE, PROPFIND, MKCOL, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Depth, Overwrite, If-Match, If-None-Match, Destination, Range",
    "Access-Control-Max-Age": "86400",
  };
}
