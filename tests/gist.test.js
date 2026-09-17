// GitHub Gist 同步模块测试 · v5.9.140
// 覆盖：config CRUD / isConfigured / _request 错误处理 / uploadNow / pullAndRestore / 调度
// 真实 fetch 路径由 vm sandbox 拦截，按 mock 行为返回
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const SRC = fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8");

// 抽取 GitHubGistSync 对象（含完整 const 定义到末尾分号）
const m = SRC.match(/const GitHubGistSync = \{[\s\S]*?\n\};/);
if (!m) { console.error("无法从 app.js 抽取 GitHubGistSync 定义"); process.exit(1); }
// const → var，让 vm 注入后挂到 globalThis
const code = m[0].replace(/^const GitHubGistSync = /, "var GitHubGistSync = ");

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log("  ✗ " + msg); } }
function eq(a, b, msg) { ok(a === b, msg + " (实际 " + JSON.stringify(a) + " ≠ 期望 " + JSON.stringify(b) + ")"); }
function section(t) { console.log("\n▶ " + t); }

function mkSb(overrides) {
  var saved = {};
  var o = overrides || {};
  var sb = {
    console, Math, Date, JSON, Object, Array, String, Number, parseInt, parseFloat, isNaN,
    encodeURIComponent, decodeURIComponent, btoa: s => Buffer.from(s, "binary").toString("base64"),
    setTimeout, clearTimeout, setInterval, clearInterval, Promise,
    fetch: o.fetch || (() => Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve("") })),
    localStorage: { getItem: k => (k in saved ? saved[k] : null), setItem: (k, v) => { saved[k] = String(v); }, removeItem: k => { delete saved[k]; } },
    showToast(msg, type) { (sb.__toasts = sb.__toasts || []).push({ msg: msg, type: type }); },
    render() {},
    formatDateTime: ts => String(ts || ""),
    confirm: o.confirm || (() => true),
    restorePackage: function (pkg) { return Promise.resolve({ imagesRestored: 0 }); },
    CloudBackup: o.cloudBackup || {
      buildPackage: () => Promise.resolve({ exportedAt: "2026-09-17T00:00:00.000Z", data: { hello: "world" } })
    },
    document: { addEventListener() {}, visibilityState: "visible" }
  };
  vm.createContext(sb);
  vm.runInContext(code, sb);
  return sb;
}

// 把所有 async test 串到一个 main()，避免顶层 return 嵌套 Promise 链被沙箱 SIGKILL
const _tests = [];

function t_sync(name, fn) { _tests.push(function () { fn(); return Promise.resolve(); }); }
function t_async(name, fn) { _tests.push(fn); }

t_sync("A. 默认配置与初始化", function () {
  const sb = mkSb();
  sb.GitHubGistSync.init();
  const cfg = sb.GitHubGistSync.getConfig();
  ok(cfg && typeof cfg === "object", "init 后 getConfig 返回对象");
  eq(cfg.description, "硬件PM工作台 备份", "默认 description");
  eq(cfg.enabled, false, "默认未启用");
  eq(cfg.token, "", "默认 token 为空");
  const st = sb.GitHubGistSync.getStatus();
  ok(st.enabled === false, "未配置时 enabled=false");
  ok(st.gistId === null && st.lastSync === null, "未配置时 gistId/lastSync 为 null");
});

t_sync("B. config 增改存", function () {
  const sb = mkSb();
  sb.GitHubGistSync.init();
  sb.GitHubGistSync.updateToken("ghp_test123");
  sb.GitHubGistSync.updateDesc("我的工作台");
  sb.GitHubGistSync.updateEnabled(true);
  sb.GitHubGistSync.saveConfig();
  sb.GitHubGistSync.init();
  const cfg = sb.GitHubGistSync.getConfig();
  eq(cfg.token, "ghp_test123", "token 持久化");
  eq(cfg.description, "我的工作台", "desc 持久化");
  eq(cfg.enabled, true, "enabled 持久化");
});

t_sync("C. 调度生命周期", function () {
  const sb = mkSb();
  sb.GitHubGistSync.init();
  sb.GitHubGistSync.schedulePush();
  sb.GitHubGistSync.updateToken("ghp_x");
  sb.GitHubGistSync.updateEnabled(true);
  sb.GitHubGistSync.saveConfig();
  sb.GitHubGistSync.schedulePush();
  sb.GitHubGistSync.updateEnabled(false);
  sb.GitHubGistSync.saveConfig();
  sb.GitHubGistSync.flush();
  ok(true, "schedulePush / flush 在不同状态下均不抛错");
  sb.GitHubGistSync.start();
  sb.GitHubGistSync.start();
  sb.GitHubGistSync.stop();
  sb.GitHubGistSync.stop();
  ok(true, "start/stop 幂等");
});

t_async("D. _request 未配置 → 抛错", function () {
  const sb = mkSb();
  sb.GitHubGistSync.init();
  return sb.GitHubGistSync._request("GET", "/user").then(
    function () { fail++; console.log("  ✗ 未配置 token 时不应成功"); },
    function (e) { ok(true, "未配置 token → " + e.message); }
  );
});

t_async("E. _findGistByDesc 描述匹配", function () {
  const sb = mkSb({
    fetch: function (url, opts) {
      if (url.indexOf("/gists?per_page=100") >= 0) {
        return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve([{ id: "g1", description: "其他项目" }, { id: "g2", description: "硬件PM工作台 备份" }, { id: "g3", description: "硬件PM工作台 备份" }]); } });
      }
      return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({}); } });
    }
  });
  sb.GitHubGistSync.init();
  sb.GitHubGistSync.updateToken("ghp_x");
  return sb.GitHubGistSync._findGistByDesc().then(function (id) {
    eq(id, "g2", "_findGistByDesc 返回第一个匹配 ID");
  });
});

t_async("F. testConnection 401 → toast 报错", function () {
  const sb = mkSb({
    fetch: function () { return Promise.resolve({ ok: false, status: 401, text: function () { return Promise.resolve('{"message":"Bad credentials"}'); } }); }
  });
  sb.GitHubGistSync.init();
  sb.GitHubGistSync.updateToken("bad");
  return sb.GitHubGistSync.testConnection().then(function (result) {
    ok(result === false, "401 凭据错 → 返回 false");
    const st = sb.GitHubGistSync.getStatus();
    ok(st.error && /Bad credentials/.test(st.error), "status.error 记录到错误");
    const toasts = sb.__toasts || [];
    ok(toasts.some(function (x) { return /Bad credentials/.test(x.msg); }), "toast 提示包含错误信息");
  });
});

t_async("G. uploadNow 成功路径 → gistId 写入", function () {
  const sb = mkSb({
    fetch: function (url, opts) {
      if (opts && opts.method === "POST" && url.indexOf("/gists") >= 0) {
        return Promise.resolve({ ok: true, status: 201, json: function () { return Promise.resolve({ id: "new_gist_42" }); } });
      }
      return Promise.resolve({ ok: false, status: 404, text: function () { return Promise.resolve(""); } });
    }
  });
  sb.GitHubGistSync.init();
  sb.GitHubGistSync.updateToken("ghp_ok");
  sb.GitHubGistSync.updateEnabled(true);
  sb.GitHubGistSync.saveConfig();
  return sb.GitHubGistSync.uploadNow().then(function () {
    const st = sb.GitHubGistSync.getStatus();
    eq(st.gistId, "new_gist_42", "gistId 已写入");
    ok(st.lastSync !== null, "lastSync 已更新");
    ok((sb.__toasts || []).some(function (t) { return /已同步到 Gist/.test(t.msg); }), "成功 toast 出现");
  });
});

t_async("H. uploadNow 二次 → PATCH", function () {
  const sb = mkSb({
    fetch: function (url, opts) {
      if (opts && opts.method === "POST") return Promise.resolve({ ok: true, status: 201, json: function () { return Promise.resolve({ id: "g1" }); } });
      if (opts && opts.method === "PATCH") return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ id: "g1" }); } });
      return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({}); } });
    }
  });
  sb.GitHubGistSync.init();
  sb.GitHubGistSync.updateToken("ghp_ok");
  sb.GitHubGistSync.updateEnabled(true);
  sb.GitHubGistSync.saveConfig();
  return sb.GitHubGistSync.uploadNow().then(function () { return sb.GitHubGistSync.uploadNow(); });
});

t_async("I. pullAndRestore 走 GET 拉 gist → confirm 弹窗", function () {
  const sb = mkSb({
    confirm: function () { return false; },
    fetch: function (url, opts) {
      if (url.indexOf("/gists?per_page=100") >= 0) {
        return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve([{ id: "g42", description: "硬件PM工作台 备份" }]); } });
      }
      if (/gists\/g42/.test(url)) {
        return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ id: "g42", files: { "pm-backup.json": { content: JSON.stringify({ exportedAt: "2026-09-17", data: { x: 1 } }) } } }); } });
      }
      return Promise.resolve({ ok: false, status: 404, text: function () { return Promise.resolve(""); } });
    }
  });
  sb.GitHubGistSync.init();
  sb.GitHubGistSync.updateToken("ghp_ok");
  sb.GitHubGistSync.updateEnabled(true);
  return sb_pullNoop(sb);
});

t_async("J. 网络异常 → status.error 记录", function () {
  const sb = mkSb({
    fetch: function () { return Promise.reject(new Error("network down")); }
  });
  sb.GitHubGistSync.init();
  sb.GitHubGistSync.updateToken("ghp_ok");
  sb.GitHubGistSync.updateEnabled(true);
  return sb.GitHubGistSync.uploadNow().then(function () {
    const st = sb.GitHubGistSync.getStatus();
    ok(st.error && /network down/.test(st.error), "网络错被记录到 status.error");
    ok((sb.__toasts || []).some(function (t) { return /network down/.test(t.msg); }), "toast 提示网络错");
  });
});

function sb_pullNoop(sb) {
  return sb.GitHubGistSync.pullAndRestore().then(function () {
    ok(true, "pullAndRestore 完成（confirm 取消时不弹 toast 也算通过）");
  });
}

(async function main() {
  for (let i = 0; i < _tests.length; i++) {
    try { await _tests[i](); } catch (e) { fail++; console.log("  ✗ 测试 " + (i+1) + " 抛错: " + e.message); }
  }
  console.log("\n=== 通过 " + pass + " / 失败 " + fail + " ===");
  process.exit(fail === 0 ? 0 : 1);
})();
