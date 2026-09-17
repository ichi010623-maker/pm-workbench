/* ============================================
   硬件PM工作台 Service Worker
   v5.9.135 - 离线壳 + 网络优先 + 版本化缓存（修复手机端打不开）

   设计目标（按优先级）：
   1. 有网 → 永远拿最新（network-first，绝不锁死旧版本）
   2. 无网/弱网 → 回退缓存，至少能打开上次成功访问过的版本（离线可用）
   3. 版本升级 → 新 SW 立即接管 + 清旧缓存
   4. 故障自救 → ?reset=1 一键清 SW + 清缓存
   ============================================ */

const CACHE_VERSION = "v5.9.141";
const CACHE_NAME = "pm-workbench-" + CACHE_VERSION;
const NETWORK_TIMEOUT_MS = 8000;

// ===== Install: 预缓存最小壳（只放不随版本变化的静态资源，避免锁死版本）=====
self.addEventListener("install", function (event) {
  console.log("[SW] Installing " + CACHE_VERSION + " [offline-shell + network-first]");
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(["./manifest.json"]).catch(function (e) {
        console.log("[SW] precache skipped:", e && e.message);
      });
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

// ===== Activate: 清旧缓存 + 立即接管所有页面 =====
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
        client.postMessage({ type: "SW_UPDATED", version: CACHE_VERSION });
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

// ===== Fetch =====
self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;

  var url;
  try { url = new URL(req.url); } catch (e) { return; }

  // 跨域（Supabase API / CDN）一律直连，SW 不介入
  if (!isSameOrigin(url)) return;

  // watchdog 强制刷新路径（?r=timestamp）绕过缓存直取网络
  if (url.search.indexOf("r=") >= 0 || url.search.indexOf("reset=1") >= 0) {
    event.respondWith(fetch(req).catch(function () { return caches.match(req); }));
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
