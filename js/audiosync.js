// ===== 网盘音频同步（OpenList / alist WebDAV）=====
// 入口：renderReadingSync()（route: rsync）
// 设计：浏览器直连本机 OpenList 的 WebDAV，无需后端。
//   单文件夹模型：一个套系文件夹直接放全集文件（第1集.mp3/第1集.mp4…），扫描识别集数 → 点「看到第几集」记进度 → 原地循环播放（不搬文件）。
//   未配置网盘 / 演示模式时，走本地演示数据体验。
//   凭据只存在浏览器 localStorage（不进云端），页面设置里你自己填，我不索要。
// 依赖：DB(进度，云同步) / localStorage(配置+演示缓存，本地) / uid / showToast / formatDateTime

var AudioSync = (function () {
  var KEY_CFG = "hw_pm_openlist_config";
  var KEY_SCAN = "hw_pm_openlist_scan"; // 演示态：缓存扫描结果

  var _cfg = null;     // { demo, webdavUrl, username, password, rootPath, lastScan }
  var _scan = null;    // { sets:[{id,name,path,episodes:[{ep,name,file,fileLoc}]}], scannedAt, demo }
  var _sub = "home";  // home | materials | settings

  // ---------- 配置 ----------
  function defaultCfg() {
    return {
      demo: true, webdavUrl: "", username: "", password: "", rootPath: "/", lastScan: null,
      openlistGuideSeen: false
    };
  }
  function loadCfg() {
    try { var s = localStorage.getItem(KEY_CFG); _cfg = s ? JSON.parse(s) : null; } catch (e) { _cfg = null; }
    if (!_cfg) _cfg = defaultCfg();
    var d = defaultCfg();
    for (var k in d) if (_cfg[k] === undefined) _cfg[k] = d[k];
    // 旧版三文件夹字段（动画/音频/熏听输出）已废弃，清理掉
    delete _cfg.dirAnime; delete _cfg.dirAudio; delete _cfg.dirOutput;
    return _cfg;
  }
  function cfg() { return _cfg || loadCfg(); }
  function saveCfg() { try { localStorage.setItem(KEY_CFG, JSON.stringify(_cfg)); } catch (e) {} }
  function setSub(s) { _sub = s || "home"; }
  function getSub() { return _sub; }

  // ---------- 进度（存云端 DB，跨设备一致）----------
  function progress() {
    var g = DB.data.growth || (DB.data.growth = {});
    if (!g.rsync) g.rsync = { currentSetId: null, sets: {} };
    if (!g.rsync.sets) g.rsync.sets = {};
    return g.rsync;
  }
  function setProgress(setId) {
    var p = progress();
    if (!p.sets[setId]) p.sets[setId] = { currentEp: 0, seen: {}, log: [] };
    if (!p.sets[setId].seen) p.sets[setId].seen = {};
    if (!p.sets[setId].log) p.sets[setId].log = [];
    return p.sets[setId];
  }

  // ---------- 演示数据（未接网盘也能体验）----------
  function demoScan() {
    var defs = [
      { id: "demo_peppa", name: "小猪佩奇（示例）", path: "/示例/小猪佩奇", n: 12 },
      { id: "demo_benh", name: "班班与莉莉小羊（示例）", path: "/示例/Ben", n: 10 }
    ];
    var sets = defs.map(function (d) {
      var eps = [];
      for (var i = 1; i <= d.n; i++) {
        eps.push({ ep: i, name: "第" + i + "集", file: "第" + i + "集.mp3", fileLoc: true });
      }
      return { id: d.id, name: d.name, path: d.path, episodes: eps };
    });
    return { sets: sets, scannedAt: new Date().toISOString(), demo: true };
  }
  function loadScanCache() {
    try { var s = localStorage.getItem(KEY_SCAN); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  }
  function saveScanCache() { try { localStorage.setItem(KEY_SCAN, JSON.stringify(_scan)); } catch (e) {} }

  // ---------- 文件名 → 集数 ----------
  function parseEpisode(name) {
    if (!name) return null;
    var base = String(name).replace(/\.[a-zA-Z0-9]+$/, ""); // 先去掉扩展名（.mp4/.mkv 含数字，避免误判）
    var m;
    if ((m = base.match(/第\s*(\d+)\s*集/i))) return parseInt(m[1], 10);
    if ((m = base.match(/[eE][pP]?\s*0*(\d+)/i))) return parseInt(m[1], 10);
    if ((m = base.match(/[sS]\d+[eE]\s*0*(\d+)/i))) return parseInt(m[1], 10);
    if ((m = base.match(/(\d{1,3})/))) return parseInt(m[1], 10);
    return null;
  }
  // 由一组文件名构造「集数 → 标记」映射
  function matchEpisodes(names, flagKey) {
    var map = {};
    (names || []).forEach(function (nm) {
      var ep = parseEpisode(nm);
      if (ep == null) return;
      if (!map[ep]) map[ep] = { ep: ep };
      map[ep][flagKey] = nm;
    });
    return map;
  }

  // ---------- WebDAV 底层 ----------
  function cfgOk() { return !!(_cfg.webdavUrl && _cfg.username && _cfg.password); }
  function baseUrl() { return (_cfg.webdavUrl || "").replace(/\/+$/, ""); }
  function authHeader() {
    var raw = (_cfg.username || "") + ":" + (_cfg.password || "");
    if (typeof btoa !== "undefined") return "Basic " + btoa(unescape(encodeURIComponent(raw)));
    if (typeof Buffer !== "undefined") return "Basic " + Buffer.from(raw).toString("base64");
    return "Basic " + raw;
  }
  function enc(seg) { return encodeURIComponent(String(seg).replace(/^\/+|\/+$/g, "")); }
  // 组合 dav 内部路径（不含 base），每段做 URL 编码（中文文件夹需要）
  function davPath() {
    var segs = Array.prototype.slice.call(arguments).filter(function (s) { return s !== "" && s != null; }).map(enc);
    return segs.join("/");
  }
  function davUrl() {
    var segs = Array.prototype.slice.call(arguments).filter(function (s) { return s !== "" && s != null; }).map(enc);
    return baseUrl() + "/" + segs.join("/");
  }
  async function davRequest(method, urlPath, headersExtra, body) {
    if (!cfgOk()) throw new Error("未配置网盘 WebDAV（请到「设置」填写地址/账号/密码）");
    var segs = String(urlPath || "").replace(/^\/+/, "").split("/").map(enc);
    var url = baseUrl() + (segs.length ? "/" + segs.join("/") : "/");
    var headers = { "Authorization": authHeader() };
    if (method === "PROPFIND") headers["Depth"] = "1";
    if (headersExtra) for (var k in headersExtra) headers[k] = headersExtra[k];
    var opts = { method: method, headers: headers };
    if (body !== undefined && body !== null) opts.body = body;
    // v5.9.26：15 秒超时。手机直连局域网 IP 时 TLS 握手/路由不可达可能长时间无响应，
    // 若不加超时，fetch 会一直 pending → 表现成「点了没反应/一直转圈」。
    var ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
    if (ctrl) {
      opts.signal = ctrl.signal;
      setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, 15000);
    }
    var resp;
    try {
      resp = await fetch(url, opts);
    } catch (e) {
      if (ctrl && e && e.name === "AbortError") {
        throw new Error("连接超时（15 秒无响应）：手机无法访问 " + baseUrl() + "。请逐项检查：① 手机和电脑连同一 Wi-Fi；② 地址填 https://电脑局域网IP:5245/dav（不要用 localhost，那是手机自己）；③ iPhone 已安装并「完全信任」mkcert 根证书（设置-通用-VPN与设备管理）；④ OpenList 已开 CORS（config.json 加 cors.enable+allow_all 并重启）");
      }
      throw e;
    }
    return resp;
  }
  // 解析 WebDAV multistatus。OpenList/golang WebDAV 返回带命名空间前缀的标签
  // （<D:response>/<D:href>/<D:collection>，DAV: 命名空间），必须用 getElementsByTagNameNS 才能匹配到。
  function parseMultistatus(xmlText) {
    var out = [];
    try {
      var doc = new DOMParser().parseFromString(xmlText, "text/xml");
      var hasNS = typeof doc.getElementsByTagNameNS === "function";
      function byTag(el, name) {
        if (hasNS) { var a = el.getElementsByTagNameNS("*", name); if (a && a.length) return a; }
        return el.getElementsByTagName(name);
      }
      var resp = hasNS ? doc.getElementsByTagNameNS("*", "response") : doc.getElementsByTagName("response");
      if (!resp || !resp.length) resp = doc.getElementsByTagName("response");
      for (var i = 0; i < resp.length; i++) {
        if (i === 0) continue; // 跳过自身：Depth:1 第一个 response 是被列出的目录本身
        var r = resp[i];
        var hrefEl = byTag(r, "href")[0];
        var href = hrefEl ? (hrefEl.textContent || hrefEl.text || "") : "";
        // 优先用 displayname（OpenList 已解码，无 % 编码），否则从 href 末段取
        var nameEl = byTag(r, "displayname")[0];
        var name = nameEl ? (nameEl.textContent || nameEl.text || "") : "";
        if (!name) {
          var trimmedHref = href.replace(/\/+$/, "");
          name = decodeURIComponent(trimmedHref.split("/").pop()) || href;
        }
        var coll = byTag(r, "collection");
        var isDir = !!(coll && coll.length > 0);
        out.push({ name: name, isDir: isDir, href: href });
      }
    } catch (e) { /* 解析失败忽略 */ }
    return out;
  }
  async function propfindList(urlPath) {
    var resp = await davRequest("PROPFIND", urlPath, { "Content-Type": "application/xml; charset=utf-8" });
    if (resp.status !== 207 && resp.status !== 200) throw new Error("PROPFIND 失败 HTTP " + resp.status);
    var xml = await resp.text();
    return parseMultistatus(xml);
  }

  // ---------- 真实扫描（连网盘，单文件夹模型：套系文件夹里直接放全集文件）----------
  async function scanReal() {
    var root = _cfg.rootPath || "/";
    var entries = await propfindList(root);
    var setDirs = entries.filter(function (e) { return e.isDir && e.name && e.name !== "."; });
    var sets = [];
    for (var i = 0; i < setDirs.length; i++) {
      var sd = setDirs[i];
      var setName = sd.name;
      var setPath = root.replace(/\/+$/, "") + "/" + setName;
      var setObj = { id: setName, name: setName, path: setPath, episodes: [] };
      try {
        var files = await propfindList(setPath);
        var names = files.filter(function (e) { return !e.isDir; }).map(function (e) { return e.name; });
        // 优先用音视频文件（一套常有 .mp3 + .pdf 并存），没有音视频再退化为全部文件
        var media = names.filter(function (n) { return /\.(mp3|m4a|mp4|mkv|flac|wav|ogg|aac|webm)$/i.test(n); });
        var useNames = media.length ? media : names;
        var fileMap = matchEpisodes(useNames, "file");
        Object.keys(fileMap).map(Number).sort(function (a, b) { return a - b; }).forEach(function (ep) {
          setObj.episodes.push({ ep: ep, name: "第" + ep + "集", file: fileMap[ep].file, fileLoc: true });
        });
      } catch (e) { /* 该套读取失败，跳过细节 */ }
      sets.push(setObj);
    }
    return { sets: sets, scannedAt: new Date().toISOString(), demo: false };
  }

  // ---------- 扫描（统一入口）----------
  async function scan(force) {
    if (_cfg.demo || !cfgOk()) {
      var cached = loadScanCache();
      if (cached && cached.sets && cached.sets.length && !force) { _scan = cached; }
      else { _scan = demoScan(); saveScanCache(); }
      _scan.demo = true;
      return _scan;
    }
    try {
      _scan = await scanReal();
      _scan.demo = false;
      // 扫描为空（多半是根目录填错一层）：自动从 WebDAV 根往下定位「含套系文件夹」的那一层
      if (!_scan.sets || !_scan.sets.length) {
        try {
          var loc = await autoLocateRoot();
          if (loc.ok && loc.path && loc.path !== (_cfg.rootPath || "/")) {
            _cfg.rootPath = loc.path; saveCfg();
            _scan = await scanReal();
            _scan.demo = false;
            _scan.autoLocated = loc.path;
          }
        } catch (e2) { /* 自动定位失败不影响已扫描结果 */ }
      }
    } catch (e) {
      // 扫描失败（404/网络/CORS/路径错）不能让页面变砖：回退为「空套系」并保留错误信息
      if (!_scan) _scan = { sets: [], scannedAt: null, demo: false, error: (e && e.message ? e.message : String(e)) };
    }
    return _scan;
  }

  // ---------- 自动定位根目录：从 WebDAV 根往下找「含套系文件夹」的那一层 ----------
  // 探测一个路径，返回 {ok, items:[{name,isDir}], http?, error?}
  async function probeDir(path) {
    try {
      var resp = await davRequest("PROPFIND", path, { "Content-Type": "application/xml; charset=utf-8" });
      if (resp.status !== 207 && resp.status !== 200) return { ok: false, http: resp.status };
      var xml = await resp.text();
      var items = parseMultistatus(xml).filter(function (e) { return e.name && e.name !== "."; })
        .map(function (e) { return { name: e.name, isDir: e.isDir }; });
      return { ok: true, items: items };
    } catch (e) { return { ok: false, error: e.message }; }
  }

  // 自动定位根目录：从 WebDAV 根往下找「套系父目录」
  // 判定规则：某目录 P 的子文件夹是一套套系（里面是集数文件），则 P 即为根目录。
  async function autoLocateRoot() {
    if (!cfgOk()) return { ok: false, msg: "请先填写 WebDAV 地址/账号/密码" };
    try {
      var root = await probeDir("/");
      if (!root.ok) return { ok: false, msg: "无法访问网盘根（" + (root.http || root.error || "未知错误") + "），请检查地址/账号/密码或 CORS" };
      var dirs = root.items.filter(function (e) { return e.isDir; });
      for (var i = 0; i < dirs.length; i++) {
        var p = "/" + dirs[i].name;
        var sub = await probeDir(p);
        if (!sub.ok) continue;
        var subDirs = sub.items.filter(function (e) { return e.isDir; });
        var subFiles = sub.items.filter(function (e) { return !e.isDir; });
        if (subFiles.length >= 1 && subDirs.length === 0) {
          // p 本身就是一套（含集数文件，无更深子文件夹）
          return { ok: true, path: p, msg: "已定位到套系目录：" + p };
        }
        if (subDirs.length >= 1) {
          // p 有子文件夹，探其中一个看是否含集数文件
          var s2 = await probeDir(p + "/" + subDirs[0].name);
          if (s2.ok) {
            var f2 = s2.items.filter(function (e) { return !e.isDir; });
            if (f2.length >= 1) {
              // p 下的子文件夹是套系（含文件）→ p 就是套系父目录
              return { ok: true, path: p, msg: "已定位到套系目录：" + p };
            }
          }
        }
      }
      return { ok: false, msg: "在网盘里没找到含集数文件的目录，请确认「播客」下有套系文件夹且里面是集数文件" };
    } catch (e) { return { ok: false, msg: "自动定位失败：" + (e && e.message ? e.message : String(e)) }; }
  }

  // 路径探测器：同时探测多个候选路径，返回每层的真实内容
  async function explorePaths() {
    if (!cfgOk()) return { ok: false, msg: "请先填写 WebDAV 地址/账号/密码", levels: [] };
    var candidates = ["/"];
    // 从 "/" 开始探测，根据结果动态扩展候选列表
    var rootResult = await probeDir("/");
    var levels = [{ path: "/", result: rootResult }];
    if (rootResult.ok && rootResult.items.length) {
      // 把根目录下的每个文件夹都作为候选
      rootResult.items.forEach(function (item) {
        if (item.isDir) candidates.push("/" + item.name);
      });
    }
    // 探测第二层
    for (var i = 1; i < candidates.length; i++) {
      var p = candidates[i];
      var r = await probeDir(p);
      levels.push({ path: p, result: r });
      // 如果这层有子文件夹，再探一层
      if (r.ok && r.items.length) {
        r.items.forEach(function (item) {
          if (item.isDir && levels.length < 10) {
            var childP = p.replace(/\/+$/, "") + "/" + item.name;
            levels.push({ path: childP, result: null }); // placeholder
          }
        });
      }
    }
    // 填充第三层
    for (var j = 0; j < levels.length; j++) {
      if (levels[j].result === null) {
        levels[j].result = await probeDir(levels[j].path);
      }
    }
    return { ok: true, levels: levels };
  }

  async function ensureScan() { if (!_scan) await scan(); return _scan; }
  function scanState() { return _scan; }

  function findSet(setId) { if (!_scan) return null; for (var i = 0; i < _scan.sets.length; i++) if (_scan.sets[i].id === setId) return _scan.sets[i]; return null; }
  function findEp(set, ep) { if (!set) return null; for (var i = 0; i < set.episodes.length; i++) if (set.episodes[i].ep === ep) return set.episodes[i]; return null; }

  function log(setId, ep, action, note) {
    var sp = setProgress(setId);
    sp.log.unshift({ ts: new Date().toISOString(), ep: ep, action: action, note: note });
    if (sp.log.length > 50) sp.log = sp.log.slice(0, 50);
  }

  // ---------- 兼容旧接口：单文件夹模型不搬文件，同步=已就地可听 ----------
  async function syncOne(setId, ep) {
    await ensureScan();
    var set = findSet(setId);
    if (!set) return { ok: false, reason: "no-set" };
    var epInfo = findEp(set, ep);
    if (!epInfo) return { ok: false, reason: "no-ep" };
    return { ok: true, moved: false, reason: null };
  }

  // 看一集 → 记进度（单文件夹模型：文件就在原地，只记进度，不搬动任何文件）
  async function markSeen(setId, ep) {
    await ensureScan();
    var sp = setProgress(setId);
    var firstTime = !sp.seen[ep];
    sp.currentEp = ep;
    sp.seen[ep] = true;
    progress().currentSetId = setId;
    log(setId, ep, "seen", "记录看到第" + ep + "集");
    DB.save();
    return { ok: true, moved: false, reason: null, firstTime: firstTime };
  }

  // 一键同步：单文件夹模型无搬移，返回空结果（按钮已移除，保留接口兼容）
  async function syncAllWatched() {
    return { moved: 0, missing: [] };
  }

  // ---------- 查询 ----------
  function statusOf(setId, ep) {
    if (!_scan) return "missing";
    var set = findSet(setId); if (!set) return "missing";
    var epInfo = findEp(set, ep); if (!epInfo) return "missing";
    return epInfo.fileLoc ? "ok" : "missing";
  }
  function getOutputPlaylist(setId) {
    if (!_scan) return [];
    var set = findSet(setId); if (!set) return [];
    return set.episodes.filter(function (e) { return e.fileLoc && e.file; })
      .sort(function (a, b) { return a.ep - b.ep; })
      .map(function (e) {
        var url = (_cfg.demo || !cfgOk()) ? null : davUrl(_cfg.rootPath, set.name, e.file);
        return { ep: e.ep, name: e.name, url: url, file: e.file };
      });
  }

  // ---------- 根目录诊断：列出根路径下的子项，帮用户判断「根目录」填得对不对 ----------
  // （probeDir 已在上方定义，此处复用）

  // 当填的目录为空/404 时，自动向上/向根探测，帮用户定位正确路径
  async function diagnoseRoot() {
    var root = _cfg.rootPath || "/";
    var main = await probeDir(root);
    var extra = [];
    // 只要不是认证失败，不论填的路径是空还是 404，都尝试列出上一级与 WebDAV 根
    if (main.http !== 401 && main.http !== 403) {
      var parent = root.replace(/\/+$/, "");
      var slash = parent.lastIndexOf("/");
      var parentPath = slash <= 0 ? "/" : (parent.slice(0, slash) || "/");
      var pr = await probeDir(parentPath);
      if (pr.ok && pr.items.length) extra.push({ label: "上一级「" + parentPath + "」", items: pr.items });
      var rr = await probeDir("/");
      if (rr.ok && rr.items.length) extra.push({ label: "WebDAV 根「/」", items: rr.items });
    }
    return { ok: main.ok, http: main.http, error: main.error, items: main.items || [], extra: extra };
  }

  // ---------- 连接测试 ----------
  async function testConnection() {
    if (!cfgOk()) return { ok: false, msg: "请先填写 WebDAV 地址 / 账号 / 密码" };
    var main = await probeDir(_cfg.rootPath || "/");
    if (!main.ok) {
      if (main.http === 401 || main.http === 403) return { ok: false, msg: "认证失败（401/403）：检查账号/密码/应用密码" };
      // 路径 404/其他错误：仍尝试列出上一级与 WebDAV 根，帮用户定位
      var extra = [];
      try {
        var parent = (_cfg.rootPath || "/").replace(/\/+$/, "");
        var slash = parent.lastIndexOf("/");
        var parentPath = slash <= 0 ? "/" : (parent.slice(0, slash) || "/");
        var pr = await probeDir(parentPath);
        if (pr.ok && pr.items.length) extra.push({ label: "上一级「" + parentPath + "」", items: pr.items });
        var rr = await probeDir("/");
        if (rr.ok && rr.items.length) extra.push({ label: "WebDAV 根「/」", items: rr.items });
      } catch (e) {}
      return { ok: false, msg: "连接异常 HTTP " + main.http + "（根目录路径不对，或 CORS 未放行）", extra: extra };
    }
    var extra = [];
    if (!main.items.length) {
      var root = _cfg.rootPath || "/";
      var parent = root.replace(/\/+$/, "");
      var slash = parent.lastIndexOf("/");
      var parentPath = slash <= 0 ? "/" : (parent.slice(0, slash) || "/");
      var pr2 = await probeDir(parentPath);
      if (pr2.ok && pr2.items.length) extra.push({ label: "上一级「" + parentPath + "」", items: pr2.items });
      var rr2 = await probeDir("/");
      if (rr2.ok && rr2.items.length) extra.push({ label: "WebDAV 根「/」", items: rr2.items });
    }
    return { ok: true, msg: "连接成功（HTTP 207/200）", items: main.items, extra: extra };
  }

  // 真实模式「重新扫描」会重新拉取；演示模式清缓存重种
  function resetDemoCache() { try { localStorage.removeItem(KEY_SCAN); } catch (e) {} _scan = null; }

  // OpenList 安装 + 挂载百度网盘 + 开 WebDAV + 开 CORS 的傻瓜教程（设置页内嵌）
  var OPENLIST_GUIDE =
    "【第一步 · 装 OpenList】\n" +
    "· macOS（推荐 Homebrew）：brew install openlist-admin/openlist/openlist，然后 openlist admin 拿到初始账号密码。\n" +
    "· 通用（Docker）：docker run -d --restart=always -p 5244:5244 -v $(pwd)/openlist:/data openlistteam/openlist\n" +
    "· Windows：去 GitHub Releases 下载 openlist-windows-amd64.exe，双击运行，浏览器开 http://localhost:5244\n\n" +
    "【第二步 · 挂载百度网盘】\n" +
    "1) 登录 OpenList 后台（默认管理员账号密码用 openlist admin 查，首次需 openlist set-admin 改密）。\n" +
    "2) 存储 → 添加 → 类型选「百度网盘」→ 按提示用百度账号扫码/授权拿到刷新令牌，根目录留空或填 / 。\n" +
    "3) 保存后，左侧会出现「百度网盘」这个存储，点「启用」。\n\n" +
    "【第三步 · 开 WebDAV】\n" +
    "设置 → 前端设置 / 或使用 openlist 的 WebDAV 端口（默认 5244 同时提供 /dav 路径）。\n" +
    "WebDAV 用户名密码 = OpenList 后台「用户」里新建的账号（不是管理员也行）。\n\n" +
    "【第四步 · 开 CORS（关键，否则云端 App 跨域读不到）】\n" +
    "编辑 OpenList 的 config.json（一般在 /data/config.json），加入/修改：\n" +
    '  "cors": { "enable": true, "allow_all": true }\n' +
    "改完重启 OpenList：openlist restart（或 docker restart 容器）。\n\n" +
    "【第五步 · 在设置页填写】\n" +
    "· WebDAV 地址：http://你本机IP:5244/dav（同机用 http://localhost:5244/dav；手机访问用电脑局域网 IP + HTTPS，如 https://192.168.2.11:5245/dav）\n" +
    "· 用户名 / 密码：第三步建的那个 WebDAV 账号\n" +
    "· 根目录路径：取决于 OpenList 里「百度网盘」的【挂载路径】设置——\n" +
    "    ※ 若挂载路径是「/」（默认），WebDAV 根直接就是百度网盘内容 → 填 /播客\n" +
    "    ※ 若挂载路径是「/百度网盘」，则 WebDAV 根是百度网盘的上一级 → 填 /百度网盘/播客\n" +
    "· 点「测试连接」：结果区会直接列出根目录下的真实文件夹。若提示「目录为空」，下方会显示上一级和 WebDAV 根的真实内容，照着填即可。\n\n" +
    "【网盘目录结构（单文件夹模型，无需三文件夹）】\n" +
    "每个套系一个文件夹，全集文件直接放里面（文件名带集数，mp3/m4a/mp4 均可）：\n" +
    "/百度网盘/播客/小猪佩奇/第1集.mp3、第2集.mp3…\n" +
    "/百度网盘/播客/班班与莉莉/第1集.mp3、第2集.mp3…\n" +
    "App 里点「看到第几集」记进度；「播放列表」会就地播放该套系文件，播完自动连播下一集（不搬文件）。";

  return {
    init: loadCfg, cfg: cfg, saveCfg: saveCfg, setSub: setSub, getSub: getSub,
    progress: progress, setProgress: setProgress,
    scan: scan, ensureScan: ensureScan, scanState: scanState, resetDemoCache: resetDemoCache,
    markSeen: markSeen, syncOne: syncOne, syncAllWatched: syncAllWatched,
    statusOf: statusOf, getOutputPlaylist: getOutputPlaylist,
    testConnection: testConnection, diagnoseRoot: diagnoseRoot,
    autoLocateRoot: autoLocateRoot, explorePaths: explorePaths,
    parseEpisode: parseEpisode, matchEpisodes: matchEpisodes,
    OPENLIST_GUIDE: OPENLIST_GUIDE
  };
})();

// =================== 全局渲染 / 交互（供 onclick 调用）===================

function rsCurrentSetId() {
  var p = AudioSync.progress();
  if (p.currentSetId && AudioSync.scanState() && AudioSync.scanState().sets.some(function (s) { return s.id === p.currentSetId; })) return p.currentSetId;
  var st = AudioSync.scanState();
  return (st && st.sets && st.sets[0]) ? st.sets[0].id : null;
}

async function renderReadingSync() {
  var c = document.getElementById("app-content");
  if (!c) return;
  AudioSync.init();
  try { await AudioSync.ensureScan(); } catch (e) { /* 扫描失败也照常渲染空状态 */ }
  var st = AudioSync.scanState() || { sets: [] };
  var p = AudioSync.progress();
  var cfg = AudioSync.cfg();
  var sub = AudioSync.getSub();
  var curId = rsCurrentSetId();
  var curSet = st.sets.filter(function (s) { return s.id === curId; })[0] || st.sets[0];

  var subtabs =
    '<div class="filter-bar" style="margin:2px 0 12px">' +
      '<div class="chip' + (sub === "home" ? " active" : "") + '" onclick="rsShow(\'home\')">🏠 首页</div>' +
      '<div class="chip' + (sub === "materials" ? " active" : "") + '" onclick="rsShow(\'materials\')">🗂️ 素材管理</div>' +
      '<div class="chip' + (sub === "settings" ? " active" : "") + '" onclick="rsShow(\'settings\')">⚙️ 设置</div>' +
    '</div>';

  if (sub === "materials") { c.innerHTML = rsTopPlayerHtml() + rsMaterialsHtml(st, p, cfg) + subtabs; rsSyncPlayerUI(); return; }
  if (sub === "settings") { c.innerHTML = rsTopPlayerHtml() + rsSettingsHtml(cfg) + subtabs; rsSyncPlayerUI(); return; }

  // ---- 首页 ----
  var totalEps = curSet ? curSet.episodes.length : 0;
  var seenCount = curSet ? curSet.episodes.filter(function (e) { return p.sets[curId] && p.sets[curId].seen[e.ep]; }).length : 0;
  var missingCount = curSet ? curSet.episodes.filter(function (e) { return !e.fileLoc; }).length : 0;

  var setOptions = st.sets.map(function (s) {
    return '<option value="' + escapeHtml(s.id) + '"' + (s.id === curId ? " selected" : "") + '>' + escapeHtml(s.name) + '</option>';
  }).join("");

  var grid = "";
  if (curSet) {
    grid = '<div class="rs-grid">';
    curSet.episodes.forEach(function (e) {
      var seen = p.sets[curId] && p.sets[curId].seen[e.ep];
      var stt = AudioSync.statusOf(curId, e.ep);
      var cls = "rs-cell" + (seen ? " seen" : "");
      var badge = stt === "ok" ? "🎧" : "⚠️";
      grid += '<div class="' + cls + '" onclick="rsMarkSeen(' + e.ep + ')"><div class="rs-ep">' + e.ep + '</div><div class="rs-badge">' + badge + '</div></div>';
    });
    grid += '</div>';
  } else {
    grid = '<div class="empty-state"><div class="empty-icon">📂</div><div class="empty-text">还没有扫描到套系<br>去「⚙️ 设置」填写网盘地址并「扫描网盘」，或先开「演示模式」体验。</div></div>';
  }

  var logHtml = "";
  var logArr = (p.sets[curId] && p.sets[curId].log) || [];
  if (logArr.length) {
    logHtml = '<div class="rs-log"><div class="card-title">📝 最近记录</div>' +
      logArr.slice(0, 8).map(function (l) {
        var icon = l.action === "seen" ? "👁" : (l.action === "sync" ? "✅" : (l.action === "skip" ? "↪️" : (l.action === "missing" ? "⚠️" : "•")));
        return '<div class="rs-log-row"><span class="rs-log-icon">' + icon + '</span><span class="rs-log-ep">第' + l.ep + '集</span><span class="rs-log-note">' + escapeHtml(l.note) + '</span><span class="rs-log-time">' + formatDateTime(l.ts) + '</span></div>';
      }).join("") + '</div>';
  }

  var demoNote = (cfg.demo || !cfg.webdavUrl) ? '<div class="rs-demo-note">🧪 当前为<b>演示模式</b>：用示例内容体验「看一集→点进度→播放」。连上你的网盘后，这里显示真实套系与进度。</div>' : "";
  var errNote = (st.error && !cfg.demo) ? '<div class="rs-demo-note" style="border-color:#e53e3e;color:#c53030">⚠️ 上次扫描失败（' + escapeHtml(st.error) + '）。请到「⚙️ 设置」修正根目录路径或测试连接后重新扫描。</div>' : "";

  var html =
    rsTopPlayerHtml() +
    '<div class="section-title"><span class="emoji">🎧</span> 百度网盘</div>' +
    subtabs +
    demoNote +
    errNote +
    '<div class="rs-home-card">' +
      '<div class="rs-row"><div><div class="card-title">当前在看</div>' +
        '<select class="rs-select" onchange="rsSelectSet(this.value)">' + setOptions + '</select></div>' +
        '<div class="rs-progress-pill">看到第 <b>' + (p.sets[curId] ? p.sets[curId].currentEp : 0) + '</b> 集</div>' +
      '</div>' +
      '<div class="rs-stats">' +
        '<div class="rs-stat"><div class="rs-stat-v">' + totalEps + '</div><div class="rs-stat-l">总集数</div></div>' +
        '<div class="rs-stat"><div class="rs-stat-v">' + seenCount + '</div><div class="rs-stat-l">已看</div></div>' +
        '<div class="rs-stat"><div class="rs-stat-v">' + missingCount + '</div><div class="rs-stat-l">缺文件</div></div>' +
      '</div>' +
      '<div class="rs-hint">👆 看完一集，点对应的数字格子记进度；下方「播放列表」点任意一集开始播放，播完自动连播下一集，不会搬动网盘里的文件。</div>' +
    '</div>' +
    grid +
    logHtml +
    rsPlaylistHtml(curId, st);

  c.innerHTML = html;
  rsSyncPlayerUI();
}

function rsShow(sub) {
  if (typeof setSubView === "function") { setSubView("rsync", sub); return; }
  AudioSync.setSub(sub); renderReadingSync();
}

function rsSelectSet(id) {
  AudioSync.progress().currentSetId = id;
  DB.save();
  renderReadingSync();
}

async function rsMarkSeen(ep) {
  var id = rsCurrentSetId();
  if (!id) { showToast("请先在设置里扫描网盘或开启演示模式", "warning"); return; }
  var res = await AudioSync.markSeen(id, ep);
  showToast("✅ 已记录看到第" + ep + "集", "success");
  renderReadingSync();
}

async function rsScan() {
  // v5.9.26：点击后按钮立即反馈「扫描中…」，杜绝「点了没反应」的错觉
  var scanBtn = null;
  var allBtns = document.querySelectorAll(".rs-actions .btn");
  for (var i = 0; i < allBtns.length; i++) { if (allBtns[i].textContent.indexOf("扫描") >= 0) { scanBtn = allBtns[i]; break; } }
  if (scanBtn) { scanBtn.disabled = true; scanBtn.textContent = "⏳ 扫描中…"; }
  try {
    // 先同步表单里刚填的值（防止没点「保存」就扫描 → 用了旧配置/演示模式 → 没反应）
    var cfg = AudioSync.cfg();
    var el = function (id) { return document.getElementById(id); };
    cfg.webdavUrl = (el("rs-url") ? el("rs-url").value : cfg.webdavUrl || "").trim();
    cfg.username = (el("rs-user") ? el("rs-user").value : cfg.username || "").trim();
    cfg.password = (el("rs-pass") ? el("rs-pass").value : cfg.password || "").trim();
    cfg.rootPath = (el("rs-root") ? el("rs-root").value : cfg.rootPath || "/").trim();
    if (cfg.webdavUrl && cfg.username && cfg.password) cfg.demo = false;
    AudioSync.saveCfg();

    showToast("正在扫描网盘…", "info");
    var st = await AudioSync.scan(true);
    DB.save();
    if (st.demo) {
      showToast("⚠️ 仍是演示模式：请确认 WebDAV 地址/账号/密码已填对，再点扫描", "warning");
    } else if (!st.sets || !st.sets.length) {
      var diag = await AudioSync.diagnoseRoot();
      var tip;
      if (!diag.ok) {
        tip = "根目录「" + (cfg.rootPath || "/") + "」访问失败" + (diag.http ? "（HTTP " + diag.http + "）" : "") + (diag.error ? "：" + diag.error : "") + "。多半路径不对，或该目录在网盘里不存在。";
      } else if (!diag.items.length) {
        var real = (diag.extra && diag.extra.length)
          ? diag.extra.map(function (g) {
              return g.label + "：" + g.items.map(function (i) { return i.name; }).slice(0, 8).join("、");
            }).join("；")
          : "（上一级与 WebDAV 根都为空）";
        tip = "根目录「" + (cfg.rootPath || "/") + "」下是空的，说明路径前缀不对。你网盘里的真实结构是：" + real + "。请把根目录改成含有「套系文件夹」的那一层（如 /播客 或 /百度网盘/播客，取决于 OpenList 挂载路径）。";
      } else {
        var dirs = diag.items.filter(function (i) { return i.isDir; }).map(function (i) { return i.name; });
        tip = "根目录「" + (cfg.rootPath || "/") + "」下看到：" + dirs.slice(0, 6).join("、") + (dirs.length > 6 ? "…" : "") + (dirs.length ? "（这几个文件夹就是「套系」；若不是你要的，请把根目录改成它们的父级）。" : "（没有文件夹）。");
      }
      showToast("⚠️ 没扫到套系。" + tip, "warning");
    } else {
      showToast("✅ 扫描完成，共 " + st.sets.length + " 套", "success");
    }
  } catch (e) {
    // 扫描抛错（如根目录 404）：跑诊断，把真实结构拼进提示，帮用户定位路径
    try {
      var d = await AudioSync.diagnoseRoot();
      var real = (d.extra && d.extra.length)
        ? d.extra.map(function (g) { return g.label + "：" + g.items.map(function (i) { return i.name; }).slice(0, 8).join("、"); }).join("；")
        : "";
      showToast("❌ 扫描失败（" + (e && e.message ? e.message : e) + "）" + (real ? "。你网盘真实结构：" + real : ""), "error");
    } catch (e2) {
      showToast("❌ 扫描失败：" + (e && e.message ? e.message : e), "error");
    }
  } finally {
    if (scanBtn) { scanBtn.disabled = false; scanBtn.textContent = "🔄 扫描网盘"; }
  }
  renderReadingSync();
}

function rsMaterialsHtml(st, p, cfg) {
  var curId = rsCurrentSetId();
  var curSet = st.sets.filter(function (s) { return s.id === curId; })[0] || st.sets[0];
  var body = "";
  if (!curSet) {
    body = '<div class="empty-state"><div class="empty-icon">🗂️</div><div class="empty-text">没有素材，请先扫描网盘。</div></div>';
  } else {
    body = '<div class="rs-mat-set">📁 ' + escapeHtml(curSet.name) + '</div>';
    body += '<div class="rs-mat-table">';
    body += '<div class="rs-mat-head"><span>集数</span><span>文件</span><span>状态</span></div>';
    curSet.episodes.forEach(function (e) {
      var seen = p.sets[curId] && p.sets[curId].seen[e.ep];
      var stt = AudioSync.statusOf(curId, e.ep);
      var badge = stt === "ok"
        ? '<span class="rs-badge-pill matched">🎧 在文件夹里</span>'
        : '<span class="rs-badge-pill missing">缺文件</span>';
      body += '<div class="rs-mat-row' + (seen ? " seen" : "") + '">' +
        '<span class="rs-mat-ep">第' + e.ep + '集</span>' +
        '<span>' + escapeHtml(e.file || "—") + '</span>' +
        '<span>' + badge + (seen ? ' <span class="rs-badge-pill seenp">已看</span>' : "") + '</span></div>';
    });
    body += '</div>';
  }
  return '<div class="section-title"><span class="emoji">🗂️</span> 素材管理</div>' +
    '<div class="rs-hint">看每集文件状态：文件在套系文件夹里 = 🎧 可听；没有文件 = 缺文件（请补上该集文件）；点「已看」表示你看到过这集。</div>' +
    body;
}

function rsSettingsHtml(cfg) {
  return '<div class="section-title"><span class="emoji">⚙️</span> 网盘音频同步设置</div>' +
    '<div class="rs-set-card">' +
      '<label class="rs-field"><span>WebDAV 地址</span><input id="rs-url" class="rs-input" placeholder="http://localhost:5244/dav 或 https://192.168.2.11:5245/dav" value="' + escapeHtml(cfg.webdavUrl) + '"></label>' +
      '<label class="rs-field"><span>用户名</span><input id="rs-user" class="rs-input" placeholder="OpenList 里建的 WebDAV 账号" value="' + escapeHtml(cfg.username) + '"></label>' +
      '<label class="rs-field"><span>密码 / 应用密码</span><input id="rs-pass" type="password" class="rs-input" placeholder="WebDAV 账号的密码" value="' + escapeHtml(cfg.password) + '"></label>' +
      '<label class="rs-field"><span>根目录路径</span>' +
        '<div style="display:flex;gap:6px;align-items:center">' +
          '<input id="rs-root" class="rs-input" placeholder="留空或填错都没关系，点右边「自动定位」" value="' + escapeHtml(cfg.rootPath) + '">' +
          '<button class="btn btn-secondary btn-mini" style="white-space:nowrap" onclick="rsAutoLocate()">🔍 自动定位</button>' +
        '</div>' +
      '</label>' +
      '<div class="rs-hint" style="margin:4px 0 8px">📁 目录结构：百度网盘根目录下每个文件夹=一套内容，全集文件直接放里面（第1集.mp3…）。拿不准根目录就点「🔍 自动定位」，App 自己从网盘根往下找。</div>' +
      '<label class="rs-check"><input type="checkbox" id="rs-demo"' + (cfg.demo ? " checked" : "") + ' onchange="rsToggleDemo(this.checked)"> 演示模式（不连网盘，用示例内容体验三步流程）</label>' +
      '<div class="rs-actions">' +
        '<button class="btn btn-secondary btn-mini" onclick="rsTestConn()">🔌 测试连接</button>' +
        '<button class="btn btn-secondary btn-mini" onclick="rsScan()">🔄 扫描网盘</button>' +
        '<button class="btn btn-primary btn-mini" onclick="rsSaveCfg()">💾 保存配置</button>' +
      '</div>' +
      '<div id="rs-conn-result" class="rs-conn"></div>' +
    '</div>' +
    '<details class="rs-guide"><summary>📘 怎么装 OpenList 并挂载百度网盘？（点开看完整教程）</summary>' +
      '<pre class="rs-guide-text">' + escapeHtml(AudioSync.OPENLIST_GUIDE) + '</pre></details>';
}

function rsToggleDemo(on) {
  AudioSync.cfg().demo = !!on;
  AudioSync.saveCfg();
  if (on) AudioSync.resetDemoCache();
  showToast(on ? "已开启演示模式" : "已关闭演示模式", "info");
  renderReadingSync();
}

function rsSaveCfg() {
  var cfg = AudioSync.cfg();
  cfg.webdavUrl = (document.getElementById("rs-url").value || "").trim();
  cfg.username = (document.getElementById("rs-user").value || "").trim();
  cfg.password = (document.getElementById("rs-pass").value || "").trim();
  cfg.rootPath = (document.getElementById("rs-root").value || "/").trim();
  // 保存真实配置后，关闭演示模式（让用户用真网盘）
  if (cfg.webdavUrl && cfg.username && cfg.password) cfg.demo = false;
  AudioSync.saveCfg();
  showToast("✅ 已保存", "success");
  renderReadingSync();
}

function rsListingHtml(label, items) {
  if (!items || !items.length) return "";
  return '<div style="margin-top:6px;font-size:12px;line-height:1.8;color:#555">' + escapeHtml(label || "目录") + '：<br>' +
    items.slice(0, 12).map(function (i) { return (i.isDir ? "📁 " : "📄 ") + escapeHtml(i.name); }).join("<br>") + '</div>';
}

async function rsTestConn() {
  var tBtn = null;
  var allBtns = document.querySelectorAll(".rs-actions .btn");
  for (var i = 0; i < allBtns.length; i++) { if (allBtns[i].textContent.indexOf("测试") >= 0) { tBtn = allBtns[i]; break; } }
  if (tBtn) { tBtn.disabled = true; tBtn.textContent = "⏳ 测试中…"; }
  try {
    var cfg = AudioSync.cfg();
    cfg.webdavUrl = (document.getElementById("rs-url").value || "").trim();
    cfg.username = (document.getElementById("rs-user").value || "").trim();
    cfg.password = (document.getElementById("rs-pass").value || "").trim();
    cfg.rootPath = (document.getElementById("rs-root").value || "/").trim();
    AudioSync.saveCfg();
    var r = await AudioSync.testConnection();
    var el = document.getElementById("rs-conn-result");
    if (el) {
      var extra = "";
      if (r.ok) {
        if (r.items && r.items.length) {
          extra += rsListingHtml("根目录「" + (cfg.rootPath || "/") + "」下的项目", r.items);
        } else {
          extra += '<div style="margin-top:8px;font-size:12px;color:#d33">⚠️ 该目录为空，说明路径前缀不对。参考下面的真实结构：</div>';
        }
        if (r.extra) {
          r.extra.forEach(function (g) { extra += rsListingHtml(g.label, g.items); });
        }
      }
      el.innerHTML = '<div class="' + (r.ok ? "rs-conn-ok" : "rs-conn-bad") + '">' + (r.ok ? "✅ " : "⚠️ ") + escapeHtml(r.msg) + '</div>' + extra;
    }
    showToast(r.ok ? (r.items && r.items.length ? "连接成功，已列出目录" : "连上了，但目录为空，请看下方真实结构") : "连接失败，见下方说明", r.ok ? "success" : "warning");
  } catch (e) {
    // v5.9.26：网络错误（证书/超时/CORS）必须给出明确反馈，不能静默「没反应」
    var el2 = document.getElementById("rs-conn-result");
    if (el2) el2.innerHTML = '<div class="rs-conn-bad">❌ ' + escapeHtml(e && e.message ? e.message : String(e)) + '</div>';
    showToast("❌ 连接失败：" + (e && e.message ? e.message : e), "error");
  } finally {
    if (tBtn) { tBtn.disabled = false; tBtn.textContent = "🔌 测试连接"; }
  }
}

// ---------- 自动定位根目录（一键）+ 路径探测器 ----------
async function rsAutoLocate() {
  var aBtn = null;
  var allBtns = document.querySelectorAll(".rs-actions .btn");
  for (var i = 0; i < allBtns.length; i++) { if (allBtns[i].textContent.indexOf("自动定位") >= 0) { aBtn = allBtns[i]; break; } }
  if (aBtn) { aBtn.disabled = true; aBtn.textContent = "⏳ 定位中…"; }
  try {
    var cfg = AudioSync.cfg();
    cfg.webdavUrl = (document.getElementById("rs-url").value || "").trim();
    cfg.username = (document.getElementById("rs-user").value || "").trim();
    cfg.password = (document.getElementById("rs-pass").value || "").trim();
    AudioSync.saveCfg();
    var el = document.getElementById("rs-conn-result");
    if (el) el.innerHTML = '<div class="rs-conn-ok">🔍 正在从网盘根往下探测路径…（最多 30 秒）</div>';
    showToast("🔍 正在探测网盘结构…", "info");

    // 先尝试自动定位
    var r = await AudioSync.autoLocateRoot();

    if (r.ok) {
      var rootInput = document.getElementById("rs-root");
      if (rootInput) rootInput.value = r.path;
      cfg.rootPath = r.path; AudioSync.saveCfg();
      if (el) el.innerHTML = '<div class="rs-conn-ok">✅ ' + escapeHtml(r.msg) + '（已自动填入并保存，正在扫描…）</div>';
      showToast("✅ 已定位：" + r.path, "success");
      setTimeout(function () { if (typeof rsScan === "function") rsScan(); }, 600);
      return;
    }

    // 自动定位失败 → 运行完整路径探测器，把每层真实内容展示出来
    if (el) el.innerHTML = '<div class="rs-conn-ok">🔍 自动定位未命中，正在探测每层路径…</div>';

    var exp = await AudioSync.explorePaths();
    var html = "";
    if (!exp.ok || !exp.levels || !exp.levels.length) {
      html = '<div class="rs-conn-bad">⚠️ 探测完全失败：' + escapeHtml(exp.msg || "未知错误") + '</div>';
    } else {
      html = '<div style="margin-top:8px"><b>📂 网盘路径探测器（从根往下逐层列出）：</b><br>' +
        '<div style="font-size:11px;color:#888;margin-bottom:6px">点任意一行可自动设为根目录</div>';
      for (var li = 0; li < exp.levels.length; li++) {
        var lv = exp.levels[li];
        var itemsHtml = "";
        if (lv.result && lv.result.ok && lv.result.items && lv.result.items.length) {
          itemsHtml = lv.result.items.map(function (it) {
            return (it.isDir ? "📁 " : "📄 ") + escapeHtml(it.name);
          }).join(" · ");
        } else if (lv.result && !lv.result.ok) {
          itemsHtml = '<span style="color:#d33">' + (lv.result.http ? ("HTTP " + lv.result.http) : (lv.result.error || "无法访问")) + '</span>';
        } else {
          itemsHtml = '<span style="color:#999">(空)</span>';
        }
        // 高亮"含多个子文件夹的层"（很可能是套系父级）
        var dirCount = (lv.result && lv.result.ok && lv.result.items) ? lv.result.items.filter(function (it) { return it.isDir; }).length : 0;
        var hint = dirCount >= 2 ? ' <span style="background:#e8f5e9;color:#2e7d32;padding:1px 6px;border-radius:3px;font-size:10px">← 含 ' + dirCount + ' 个文件夹，可能是套系目录</span>' : '';
        html += '<div style="cursor:pointer;padding:4px 8px;margin:2px 0;border-radius:4px' +
          (dirCount >= 2 ? ';background:#f0f7ff' : '') +
          '" onclick="rsPickRoot(\'' + escapeHtml(lv.path).replace(/'/g, "\\'") + '\')">' +
          '<code style="font-size:12px;color:#1565c0">' + escapeHtml(lv.path || "/") + '</code>' + hint +
          '<div style="font-size:12px;color:#444;margin-left:12px;margin-top:2px">' + (itemsHtml || "(无)") + '</div></div>';
      }
      html += '</div>';
    }
    if (el) el.innerHTML = '<div class="rs-conn-bad">⚠️ 自动定位未找到，但已探测出网盘完整结构 👇（点上面任意一行自动设为根目录）</div>' + html;
    showToast("请查看下方路径探测器结果，点击正确的行", "warning");
  } catch (e2) {
    if (el) el.innerHTML = '<div class="rs-conn-bad">⚠️ 探测异常：' + escapeHtml(e2 && e2.message ? e2.message : String(e2)) + '</div>';
  } finally {
    if (aBtn) { aBtn.disabled = false; aBtn.textContent = "🔍 自动定位"; }
  }
}

function rsPickRoot(path) {
  var el = document.getElementById("rs-root");
  if (el) el.value = path;
  var cfg = AudioSync.cfg();
  cfg.rootPath = path; AudioSync.saveCfg();
  showToast("已选根目录：" + path + "，请点「扫描网盘」", "success");
}

// =================== 顶部播放条 + 播放引擎 ===================
// 持久化 audio 元素挂到 body，避免页面重渲染（innerHTML 重写）打断播放
var rsPlayer = { setId: null, ep: null, setName: "", epName: "", speed: 1, playlist: [] };

function rsGetAudio() {
  var a = document.getElementById("rs-audio");
  if (!a) {
    a = document.createElement("audio");
    a.id = "rs-audio";
    a.preload = "none";
    document.body.appendChild(a);
    a.addEventListener("timeupdate", function () {
      var cur = document.getElementById("rs-pb-cur");
      var dur = document.getElementById("rs-pb-dur");
      var range = document.getElementById("rs-pb-range");
      if (a.duration && !isNaN(a.duration)) {
        if (cur) cur.textContent = rsFmtTime(a.currentTime);
        if (dur) dur.textContent = rsFmtTime(a.duration);
        if (range && document.activeElement !== range) range.value = Math.round((a.currentTime / a.duration) * 100);
      }
    });
    a.addEventListener("ended", function () { rsPlayNext(); });
    a.addEventListener("play", function () { rsUpdatePlayBtn(true); });
    a.addEventListener("pause", function () { rsUpdatePlayBtn(false); });
    a.addEventListener("error", function () {
      if (a.src) showToast("音频解码失败，可能为文件格式不支持", "warning");
    });
  }
  return a;
}

function rsTopPlayerHtml() {
  var speedOpts = [["0.75", "0.75×"], ["1", "1×"], ["1.25", "1.25×"], ["1.5", "1.5×"], ["2", "2×"]]
    .map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === String(rsPlayer.speed) ? " selected" : "") + '>' + o[1] + '</option>'; })
    .join("");
  return '<div id="rs-player-bar" class="rs-player-bar">' +
    '<div class="rs-pb-now">' +
      '<div class="rs-pb-icon">🎧</div>' +
      '<div class="rs-pb-meta">' +
        '<div class="rs-pb-title" id="rs-pb-title">未播放</div>' +
        '<div class="rs-pb-sub" id="rs-pb-sub">选择下方播放列表里的任意一集开始</div>' +
      '</div>' +
    '</div>' +
    '<div class="rs-pb-controls">' +
      '<button class="rs-pb-btn" id="rs-pb-play" onclick="rsTogglePlay()">▶️</button>' +
      '<select class="rs-pb-speed" id="rs-pb-speed" onchange="rsSetSpeed(this.value)">' + speedOpts + '</select>' +
    '</div>' +
    '<div class="rs-pb-progress">' +
      '<span class="rs-pb-time" id="rs-pb-cur">0:00</span>' +
      '<input type="range" id="rs-pb-range" class="rs-pb-range" min="0" max="100" value="0" oninput="rsSeek(this.value)">' +
      '<span class="rs-pb-time" id="rs-pb-dur">0:00</span>' +
    '</div>' +
  '</div>';
}

function rsPlaylistHtml(curId, st) {
  var list = AudioSync.getOutputPlaylist(curId);
  if (!list.length) {
    return '<div class="rs-loop"><div class="card-title">📃 播放列表</div><div class="rs-hint">这个套系里还没有可播放的文件，或扫描结果为空。</div></div>';
  }
  rsPlayer.playlist = list;
  rsPlayer.setId = curId;
  var rows = list.map(function (i) {
    return '<div class="rs-pl-item' + (i.ep === rsPlayer.ep ? " playing" : "") + '" data-ep="' + i.ep + '" onclick="rsPlayEp(' + i.ep + ')">' +
      '<span class="rs-pl-play">▶️</span>' +
      '<span class="rs-pl-name">第' + i.ep + '集 · ' + escapeHtml(i.name) + '</span>' +
    '</div>';
  }).join("");
  return '<div class="rs-loop"><div class="card-title">📃 播放列表 · 自动连播下一集</div>' +
    '<div class="rs-loop-list">' + rows + '</div>' +
    '<div class="rs-hint">点任意一集开始；播完会自动连播下一集（不循环、不搬动网盘文件）。连接真实网盘时经授权拉取播放；演示模式仅展示列表。</div></div>';
}

function rsFmtTime(s) {
  s = Math.floor(s || 0);
  var m = Math.floor(s / 60), sec = s % 60;
  return m + ":" + (sec < 10 ? "0" : "") + sec;
}

function rsUpdatePlayBtn(playing) {
  var b = document.getElementById("rs-pb-play");
  if (b) b.textContent = playing ? "⏸️" : "▶️";
}

function rsUpdateNowPlaying() {
  var t = document.getElementById("rs-pb-title");
  var s = document.getElementById("rs-pb-sub");
  if (t) t.textContent = rsPlayer.setName ? (rsPlayer.setName + " · 第" + rsPlayer.ep + "集") : "未播放";
  if (s) s.textContent = rsPlayer.epName || "选择下方播放列表里的任意一集开始";
}

function rsHighlightPlaylist() {
  var rows = document.querySelectorAll(".rs-pl-item");
  for (var i = 0; i < rows.length; i++) {
    var ep = parseInt(rows[i].getAttribute("data-ep"), 10);
    if (ep === rsPlayer.ep) rows[i].classList.add("playing");
    else rows[i].classList.remove("playing");
  }
}

// 重渲染后把持久播放状态同步回 UI（顶栏文字、按钮、高亮）
function rsSyncPlayerUI() {
  rsUpdateNowPlaying();
  var a = document.getElementById("rs-audio");
  rsUpdatePlayBtn(!!(a && !a.paused && a.src));
  rsHighlightPlaylist();
  var sp = document.getElementById("rs-pb-speed");
  if (sp) sp.value = String(rsPlayer.speed);
}

async function rsLoadEp(ep, autoplay) {
  var setId = rsCurrentSetId();
  var list = AudioSync.getOutputPlaylist(setId);
  rsPlayer.playlist = list;
  rsPlayer.setId = setId;
  var set = (AudioSync.scanState() && AudioSync.scanState().sets.filter(function (s) { return s.id === setId; })[0]) || {};
  var item = list.filter(function (i) { return i.ep === ep; })[0];
  if (!item) return;
  rsPlayer.ep = ep;
  rsPlayer.setName = set.name || "";
  rsPlayer.epName = item.name || ("第" + ep + "集");
  rsUpdateNowPlaying();
  rsHighlightPlaylist();
  var audio = rsGetAudio();
  audio.playbackRate = rsPlayer.speed;
  if (!item.url) {
    showToast("演示模式无真实文件，连上网盘后可播放", "info");
    return;
  }
  // 取消上一段 objectURL，避免内存堆积
  if (audio.src && audio.src.indexOf("blob:") === 0) { try { URL.revokeObjectURL(audio.src); } catch (e) {} }
  showToast("正在拉取文件…", "info");
  try {
    var ctrl = new AbortController();
    var to = setTimeout(function () { ctrl.abort(); }, 15000);
    var cfg = AudioSync.cfg();
    var raw = cfg.username + ":" + cfg.password;
    var auth = "Basic " + (typeof btoa !== "undefined" ? btoa(unescape(encodeURIComponent(raw))) : raw);
    var resp = await fetch(item.url, { headers: { "Authorization": auth }, signal: ctrl.signal });
    clearTimeout(to);
    if (!resp.ok) {
      if (resp.status === 401) throw new Error("账号或密码错误（HTTP 401），请到「百度网盘/熏听」设置更新 WebDAV 密码");
      throw new Error("HTTP " + resp.status);
    }
    var blob = await resp.blob();
    audio.src = URL.createObjectURL(blob);
    rsUpdateNowPlaying();
    if (autoplay !== false) {
      try { await audio.play(); }
      catch (e) { showToast("自动播放被浏览器拦截，点 ▶️ 继续播放", "warning"); }
    }
  } catch (e) {
    if (e && e.name === "AbortError") showToast("拉取超时（15s），检查网络或 WebDAV 账号密码", "warning");
    else showToast("播放失败：" + (e && e.message ? e.message : e), "warning");
  }
}

function rsPlayEp(ep) { rsLoadEp(ep, true); }

// 播完自动连播下一集（不循环；到最后一集停止）
function rsPlayNext() {
  var list = rsPlayer.playlist;
  if (!list || !list.length) return;
  var idx = -1;
  for (var i = 0; i < list.length; i++) { if (list[i].ep === rsPlayer.ep) { idx = i; break; } }
  if (idx < 0 || idx + 1 >= list.length) {
    rsUpdatePlayBtn(false);
    showToast("已播放到本套系最后一集 🎉", "success");
    return;
  }
  rsLoadEp(list[idx + 1].ep, true);
}

function rsTogglePlay() {
  var audio = rsGetAudio();
  if (!audio.src && !rsPlayer.ep) {
    // 没点过具体某集：默认从播放列表第一集开始
    var list = AudioSync.getOutputPlaylist(rsCurrentSetId());
    if (list.length) { rsLoadEp(list[0].ep, true); }
    else showToast("当前套系没有可播放的文件", "warning");
    return;
  }
  if (audio.paused) { audio.play().catch(function () { showToast("点 ▶️ 继续播放", "warning"); }); }
  else audio.pause();
}

function rsSetSpeed(v) {
  rsPlayer.speed = parseFloat(v) || 1;
  var audio = rsGetAudio();
  audio.playbackRate = rsPlayer.speed;
}

function rsSeek(pct) {
  var audio = rsGetAudio();
  if (audio.duration && !isNaN(audio.duration)) audio.currentTime = (parseFloat(pct) / 100) * audio.duration;
}
