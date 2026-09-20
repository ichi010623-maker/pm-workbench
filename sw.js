/* ============================================
   硬件PM工作台 Service Worker
   v5.9.167 - 单实例「离线壳 + 网络优先 + 精读素材预缓存」SW

   设计（合并 v5.9.135 离线壳、v5.9.147 经验、v5.9.167 精读素材）：
   - 只保留 **一个** install / activate / fetch 监听器（历史版本误留了重复监听器
     并有孤立代码块，导致 sw.js 语法错误 → register() 直接失败 → 旧 SW 永久
     接管并持续 serve 老缓存，这正是「改了页面看不到」的根因）。
   - 首页 / 导航 / 静态资源：network-first（8s 超时）→ 保证拿最新；
     网络失败回退缓存 → 保留离线能力。
   - 跨域请求（Supabase / CDN）一律直连，SW 不介入。
   - 新版本 activate 后 postMessage("SW_UPDATED") → app.js SWManager 自动 reload。

   v5.9.167 新增：
   - install 时除 manifest 之外，**主动预缓存精读模块全部素材**（4 刊外刊 + 8 类 TED = 13 个分册）。
   - 这样 App 安装后第一次进入精读 tab，所有外刊/TED 列表/正文都已落地本地缓存，
     不再依赖 Pages 拉取；弱网/跨网/打不开都能秒开。
   - 单个 404 不阻塞其它资源（容错，避免旧版本没某个文件时 SW 装不上）。
   - 列表变动只需重跑 `node scripts/build_reading_precache.js` 重新生成 PRECACHE_URLS 段。
   ============================================ */

const CACHE_VERSION = "v5.9.168";
const CACHE_NAME = "pm-workbench-" + CACHE_VERSION;
const NETWORK_TIMEOUT_MS = 8000;

// 预缓存清单（精读模块素材 + 应用壳）
// 数据文件由 scripts/build_reading_precache.js 同步生成；列表变化时再跑一遍。
const PRECACHE_URLS = [
  "./manifest.json",
  "./index.html",
  "./css/style.v5.9.156.css",
  "./js/app.js",
  "./js/language.js",
  "./data/lang_read_mag.json",
  "./data/lang_read_mag_economist.json",
  "./data/lang_read_mag_newyorker.json",
  "./data/lang_read_mag_atlantic.json",
  "./data/lang_read_mag_wired.json",
  "./data/lang_read_ted.json",
  "./data/lang_read_ted_tech.json",
  "./data/lang_read_ted_business.json",
  "./data/lang_read_ted_science.json",
  "./data/lang_read_ted_mind.json",
  "./data/lang_read_ted_society.json",
  "./data/lang_read_ted_culture.json",
  "./data/lang_read_ted_people.json",
  "./data/lang_read_ted_life.json"
];

// ===== Install: 预缓存离线壳 + 精读素材 + skipWaiting =====
self.addEventListener("install", function (event) {
  console.log("[SW] Installing " + CACHE_VERSION + " (precache " + PRECACHE_URLS.length + ")");
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      // 单个失败不阻塞其它资源（容错：旧版本没某个文件时仍能装上 SW）
      return Promise.all(PRECACHE_URLS.map(function (u) {
        return cache.add(u).catch(function (e) {
          console.log("[SW] precache skip:", u, e && e.message);
        });
      }));
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

// ===== Activate: 清旧缓存 + 立即接管 + 通知主线程 =====
self.addEventListener("activate", function (event) {
  console.log("[SW] Activating " + CACHE_VERSION);
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) {
          console.log("[SW] Deleting old cache:", k);
          return caches.delete(k);
        })
      );
    }).then(function () {
      return self.clients.claim();
    }).then(function () {
      return self.clients.matchAll();
    }).then(function (clients) {
      clients.forEach(function (client) {
        try { client.postMessage({ type: "SW_UPDATED", version: CACHE_VERSION }); } catch (e) {}
      });
    })
  );
});

function isSameOrigin(url) {
  return url.hostname === self.location.hostname;
}

function isIndexHtml(pathname) {
  return pathname === "/" || pathname.endsWith("/") || pathname.endsWith("/index.html");
}

function isStaticAsset(pathname) {
  return /\.(js|css|json|svg|png|jpg|jpeg|webp|woff2?|ttf)$/.test(pathname);
}

// 带超时的 fetch（弱网时快速失败，尽早回退缓存，避免白屏等待）
function fetchWithTimeout(request, ms) {
  return new Promise(function (resolve, reject) {
    var timer = setTimeout(function () { reject(new Error("network timeout")); }, ms);
    fetch(request).then(function (r) {
      clearTimeout(timer); resolve(r);
    }, function (e) {
      clearTimeout(timer); reject(e);
    });
  });
}

// Network-first + 写缓存 + 失败回退缓存
function networkFirst(request) {
  return fetchWithTimeout(request, NETWORK_TIMEOUT_MS).then(function (response) {
    if (response && response.status === 200 && response.type === "basic") {
      var clone = response.clone();
      caches.open(CACHE_NAME).then(function (cache) {
        cache.put(request, clone).catch(function () {});
      });
    }
    return response;
  }).catch(function () {
    return caches.match(request).then(function (cached) {
      if (cached) return cached;
      // 导航请求兜底：尝试任意缓存中的 index.html（离线打开已访问过的应用）
      if (request.mode === "navigate") {
        return caches.match("./index.html").then(function (idx) {
          if (idx) return idx;
          return new Response(
            "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>" +
            "<body style='font-family:-apple-system,system-ui,sans-serif;padding:28px;text-align:center;color:#0f172a'>" +
            "<div style='font-size:38px'>📡</div><h3>暂时离线</h3>" +
            "<p style='color:#64748b;font-size:13px;line-height:1.8'>当前无网络，且本地暂无可用缓存。<br>请连接网络后重试。</p>" +
            "<button onclick='location.reload()' style='margin-top:8px;padding:12px 20px;border:0;border-radius:12px;background:#0a84ff;color:#fff;font-size:15px'>重新加载</button>" +
            "</body>",
            { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
          );
        });
      }
      return new Response("Offline", { status: 503, statusText: "Offline" });
    });
  });
}

// Cache-first + 后台刷新：精读素材（已 install 预缓存），命中秒返回，
// 同时异步去网络更新（后台拿到新版本后写回缓存；用户每次都能拿到上次成功的版本）。
// 适用于：网络经常打不开、但素材每周更新一次的场景（用户每次冷启动拿到新内容，无需手动操作）。
function cacheFirstStaleWhileRevalidate(request) {
  return caches.match(request).then(function (cached) {
    var networkFetch = fetchWithTimeout(request, NETWORK_TIMEOUT_MS).then(function (response) {
      if (response && response.status === 200 && response.type === "basic") {
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(request, clone).catch(function () {});
        });
      }
      return response;
    }).catch(function () {
      // 网络失败：返回缓存（若有），否则错误
      if (cached) return cached;
      return new Response("Offline", { status: 503, statusText: "Offline" });
    });
    return cached || networkFetch;
  });
}

function isReadingAsset(pathname) {
  // 精读素材：data/lang_read_mag*.json + data/lang_read_ted*.json
  return /^\/data\/lang_read_(mag|ted)(_[a-z]+)?\.json$/.test(pathname);
}

// ===== Fetch（唯一监听器）=====
self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;

  var url;
  try { url = new URL(req.url); } catch (e) { return; }

  // 跨域（Supabase API / CDN）一律直连，SW 不介入
  if (!isSameOrigin(url)) return;

  // watchdog 强制刷新路径（?r=timestamp / ?reset=1）绕过缓存直取网络
  if (url.search.indexOf("r=") >= 0 || url.search.indexOf("reset=1") >= 0) {
    event.respondWith(fetch(req).catch(function () { return caches.match(req); }));
    return;
  }

  // 精读素材：cache-first + 后台异步刷新（v5.9.167）
  // 已经在 install 时预缓存，命中秒返回；后台异步去 Pages 拉新版本替换缓存。
  // 用户每次启动都能拿到上一次成功的版本；周度更新无需手动操作。
  if (isReadingAsset(url.pathname)) {
    event.respondWith(cacheFirstStaleWhileRevalidate(req));
    return;
  }

  // 首页 / 导航 / 静态资源：全部 network-first（保证拿最新，离线回退缓存）
  if (isIndexHtml(url.pathname) || req.mode === "navigate" || isStaticAsset(url.pathname)) {
    event.respondWith(networkFirst(req));
    return;
  }

  // 其他请求：直连
});

// ===== Messages from main thread =====
self.addEventListener("message", function (event) {
  if (!event.data) return;

  if (event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  if (event.data.type === "CLEAR_CACHES") {
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { return caches.delete(k); }));
    });
  }

  if (event.data.type === "CHECK_VERSION") {
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ version: CACHE_VERSION });
    }
  }
});

// ===== Web Push 每日简报推送 =====
self.addEventListener("push", function (event) {
  var data = { title: "📋 每日简报", body: "今日资讯已更新，点击查看完整简报" };
  try { if (event.data) data = event.data.json(); } catch (e) {}
  var opts = {
    body: data.body || "",
    tag: "daily-brief",
    renotify: true,
    requireInteraction: false,
    data: { url: data.url || "/" }
  };
  event.waitUntil(self.registration.showNotification(data.title || "📋 每日简报", opts));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clients) {
      for (var i = 0; i < clients.length; i++) {
        if ("focus" in clients[i]) { clients[i].navigate(target); return clients[i].focus(); }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
