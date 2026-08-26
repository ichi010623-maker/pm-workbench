/* ============================================
   硬件PM工作台 v5.9.69 - Service Worker
   离线缓存 + 自动更新 + 隐私保护
   ============================================ */

const CACHE_VERSION = "v5.9.81";
const CACHE_NAME = "pm-workbench-" + CACHE_VERSION;
const APP_SHELL_ASSETS = [];

// Install: skip caching static assets entirely — all files use network-first
self.addEventListener("install", function(event) {
  console.log("[SW] Installing " + CACHE_VERSION + " [network-first mode]");
  event.waitUntil(self.skipWaiting());
});

// Activate: clean old caches, claim clients, notify reload
self.addEventListener("activate", function(event) {
  console.log("[SW] Activating " + CACHE_VERSION);
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
          .map(function(key) {
            console.log("[SW] Deleting old cache:", key);
            return caches.delete(key);
          })
      );
    }).then(function() {
      return self.clients.claim();
    }).then(function() {
      // Notify all clients to reload (fixes standalone PWA stuck on old version)
      return self.clients.matchAll().then(function(clients) {
        clients.forEach(function(client) {
          client.postMessage({ type: "SW_UPDATED", version: CACHE_VERSION });
        });
      });
    })
  );
});

// Fetch strategy
self.addEventListener("fetch", function(event) {
  var url = new URL(event.request.url);
  if (event.request.method !== "GET") return;

  // Skip non-local requests
  if (!url.hostname.includes(self.location.hostname)) return;

  // index.html: NETWORK-FIRST (always get latest HTML, critical for updates)
  if (isIndexHtml(url.pathname)) {
    event.respondWith(networkFirstWithCache(event.request));
    return;
  }

  // ALL assets: NETWORK-FIRST (always fetch latest, fall back to cache for offline)
  event.respondWith(networkFirstWithCache(event.request));
});

function isIndexHtml(pathname) {
  return pathname === "/" || pathname.endsWith("/") || pathname.endsWith("/index.html");
}

function isStaticAsset(pathname) {
  return pathname.endsWith(".css") || pathname.endsWith(".js") || pathname.endsWith(".json") || pathname.endsWith(".svg");
}

// Network-first: try network, fall back to cache, cache the response
function networkFirstWithCache(request) {
  return fetch(request).then(function(response) {
    if (!response || response.status !== 200) return response;
    var clone = response.clone();
    caches.open(CACHE_NAME).then(function(cache) {
      cache.put(request, clone);
    });
    return response;
  }).catch(function() {
    return caches.match(request).then(function(cached) {
      return cached || new Response("Offline — 请连接网络后重试", {
        status: 503,
        statusText: "Service Unavailable",
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    });
  });
}

// Cache-first: serve from cache, update cache in background
function cacheFirstWithBgUpdate(request) {
  return caches.match(request).then(function(cached) {
    // Fetch and update cache in background
    var fetchPromise = fetch(request).then(function(response) {
      if (response && response.status === 200) {
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(request, clone);
        });
      }
      return response;
    }).catch(function() {});

    // Return cached immediately
    if (cached) return cached;

    // Wait for network if not cached
    return fetchPromise;
  });
}

// Listen for messages from main thread
self.addEventListener("message", function(event) {
  if (!event.data) return;

  if (event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  if (event.data.type === "CHECK_VERSION") {
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ version: CACHE_VERSION });
    }
  }
});

// ===== Web Push 每日简报推送 =====
self.addEventListener("push", function(event) {
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

self.addEventListener("notificationclick", function(event) {
  event.notification.close();
  var target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function(clients) {
      for (var i = 0; i < clients.length; i++) {
        if ("focus" in clients[i]) { clients[i].navigate(target); return clients[i].focus(); }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
