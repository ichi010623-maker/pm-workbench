/* ============================================
   硬件PM工作台 v5.1 - 应用逻辑
   新增: 云端自动备份(含图片) / 跨设备迁移 /
         自动下载备份包 / 一键完整恢复 /
         PWA自动更新 + APP_VERSION 强制刷新 /
         实时财经数据 + 持仓管理 + 每日自动更新
   ============================================ */

// ===== APP Version (bump on every deploy to force PWA refresh) =====
var APP_VERSION = "5.9.63";

// ===== 视口高度实测（修复 iOS PWA 下 -webkit-fill-available / dvh 偏矮导致底栏离屏底有空白）=====
function setAppHeight() {
  try {
    var h = window.innerHeight || 0;
    if (window.visualViewport && window.visualViewport.height) {
      // 键盘弹出时 visualViewport 会变矮，取较大值以免布局跳动
      h = Math.max(h, window.visualViewport.height);
    }
    if (h > 0) {
      document.documentElement.style.setProperty("--app-h", h + "px");
    }
  } catch (e) {}
}
setAppHeight();
window.addEventListener("resize", setAppHeight);
window.addEventListener("orientationchange", function() {
  setAppHeight();
  setTimeout(setAppHeight, 250);
  setTimeout(setAppHeight, 600);
});
window.addEventListener("pageshow", setAppHeight);
document.addEventListener("DOMContentLoaded", setAppHeight);

// ===== Supabase 配置（请把 ANON_KEY 替换为你的 anon public key）=====
var SUPABASE_URL = "https://qzjqxkkehreccovuypps.supabase.co";
var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6anF4a2tlaHJlY2NvdnV5cHBzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1MDEwODcsImV4cCI6MjEwMTA3NzA4N30._GcbuE-Rf0nfILs3HIDPGPF_0MSCLT4ef3rOBlcK2sc";
// 云端内容存储（Supabase Storage，公开读 + anon 写策略，详见部署说明）
var NEWS_BUCKET = "app-content";
var NEWS_STORAGE_BASE = SUPABASE_URL + "/storage/v1/object/public/" + NEWS_BUCKET;
var VAPID_PUBLIC = "BMF5LY3jJ-_yMgnTgM4iBK83haz2gEe-eSLXS--fvc-zwsWEjTZK1z2flgsYlIFySpjdA81wSyDFHO1A0sW7Vy4";

// ===== 全局 Supabase 客户端实例（懒加载）=====
// 说明：window.supabase 是 supabase-js 的 createClient 函数，不是客户端实例；
// 必须 createClient 后得到的实例才有 .storage / .from 等方法。
// 简报/推送需要访问「公开读 + anon 写」的 Storage 桶，与登录态无关，故独立懒加载。
function getSb() {
  try {
    if (!window.sb && window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY &&
        SUPABASE_URL.indexOf("REPLACE") !== 0 && SUPABASE_ANON_KEY.indexOf("REPLACE") !== 0) {
      window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
  } catch (e) { window.sb = null; }
  return window.sb || null;
}

// ===== 多端同步：记录级合并 + 删除墓碑 =====
// 解决「手机端新增的衣橱/食材被自动拉取的旧云端快照覆盖消失」「删除后又被云端旧数据还原」问题。
// 思路：云端仍是事实源，但拉取时按 id 对「带 id 的记录数组」做并集合并（本地新增/他端新增都保留，
// 同 id 冲突取 updatedAt 较新者），并用墓碑(tombstone)记录被删除的 id，合并时剔除，使删除能跨端生效。
function _clone(x) { try { return JSON.parse(JSON.stringify(x)); } catch (e) { return x; } }
function _isRecordArr(a) {
  return Array.isArray(a) && a.length > 0 &&
    a.every(function (x) { return x && typeof x === "object" && !Array.isArray(x) && typeof x.id === "string"; });
}
// 删除墓碑：DB.data._tomb = { "<dottedPath>": ["id1","id2"] }
function ensureTomb() { if (!DB.data._tomb) DB.data._tomb = {}; return DB.data._tomb; }
function addTomb(path, id) {
  if (!path || !id) return;
  var t = ensureTomb();
  if (!t[path]) t[path] = [];
  if (t[path].indexOf(id) < 0) t[path].push(id);
}
function mergeData(local, remote) {
  if (!local) return _clone(remote);
  if (!remote) return _clone(local);
  var tomb = {};
  function getTomb(p) { if (!tomb[p]) tomb[p] = new Set(); return tomb[p]; }
  function loadTomb(obj) {
    if (obj && obj._tomb) {
      Object.keys(obj._tomb).forEach(function (p) {
        (obj._tomb[p] || []).forEach(function (id) { getTomb(p).add(id); });
      });
    }
  }
  loadTomb(local); loadTomb(remote);
  function mergeArr(la, ra, path) {
    var t = getTomb(path);
    var map = {};
    (ra || []).forEach(function (r) { if (r && r.id != null && !t.has(r.id)) map[r.id] = _clone(r); });
    (la || []).forEach(function (l) {
      if (!l || l.id == null) return;
      if (t.has(l.id)) return; // 本地已删除 → 不恢复
      var r = map[l.id];
      if (!r) { map[l.id] = _clone(l); }            // 仅本地有（新增未上云）
      else {
        var lt = Date.parse(l.updatedAt || l.addedDate || l.createdAt || 0) || 0;
        var rt = Date.parse(r.updatedAt || r.addedDate || r.createdAt || 0) || 0;
        map[l.id] = (lt === 0 && rt === 0) ? _clone(r) : ((lt >= rt) ? _clone(l) : r); // 同 id 取较新者；双方均无时间戳时以云端为准（防两端各自保留本地造成不同步）
      }
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }
  function mergeValue(l, r, path) {
    if (Array.isArray(r) || Array.isArray(l)) {
      if (_isRecordArr(r) || _isRecordArr(l)) return mergeArr(l || [], r || [], path);
      return _clone(r); // 非记录数组：以云端为准
    }
    if (r && typeof r === "object" && l && typeof l === "object") {
      var out = _clone(r);
      Object.keys(l).forEach(function (k) {
        if (k === "_tomb") return;
        if (!(k in out)) out[k] = _clone(l[k]);
        else out[k] = mergeValue(l[k], out[k], path ? path + "." + k : k);
      });
      return out;
    }
    return (r === undefined) ? _clone(l) : _clone(r);
  }
  var merged = mergeValue(local, remote, "");
  merged._tomb = {};
  Object.keys(tomb).forEach(function (p) { if (tomb[p].size) merged._tomb[p] = Array.from(tomb[p]); });
  return merged;
}

// ===== 白屏防护：捕获未处理异常，避免页面进入纯白屏 =====
window.addEventListener('error', function(e) {
  try {
    var c = document.getElementById('app-content');
    if (c && c.children.length === 0) {
      c.innerHTML = '<div style="padding:28px;color:#fff;font-size:14px;line-height:1.7">⚠️ 页面渲染异常，请先下拉刷新；若仍白屏，请在浏览器设置中清除本站数据后重新打开。<br><br><span style="opacity:.6">技术信息：' + (e && (e.message || (e.error && e.error.message)) || 'unknown') + '</span></div>';
    }
  } catch (_) {}
});

// ===== Live Data Cache (fetched from data/*.json) =====
var LiveData = {
  news: null,   // from data/news.json
  review: null, // from data/review.json
  videos: null, // from data/videos.json
  lastFetch: null,

  // 资讯优先从 Supabase Storage（每日自动更新）拉取，失败回退本地 data/news.json
  async fetchNews() {
    try {
      var r = await fetch(NEWS_STORAGE_BASE + "/news.json?ts=" + Date.now());
      if (r.ok) { var j = await r.json(); if (j && j.items) return j; }
    } catch (e) { console.log("[LiveData] Storage news failed, fallback", e.message); }
    try {
      var r2 = await fetch("data/news.json?v=" + APP_VERSION);
      if (r2.ok) return await r2.json();
    } catch (e) {}
    return null;
  },

  // 资讯归档（每日服务端留存），Supabase 优先、回退本地，用于历史回顾回填
  async fetchNewsArchive() {
    try {
      var r = await fetch(NEWS_STORAGE_BASE + "/news-archive.json?ts=" + Date.now());
      if (r.ok) { var j = await r.json(); if (j && typeof j === "object") return j; }
    } catch (e) { console.log("[LiveData] Storage news-archive failed, fallback", e.message); }
    try {
      var r2 = await fetch("data/news-archive.json?v=" + APP_VERSION);
      if (r2.ok) return await r2.json();
    } catch (e) {}
    return null;
  },

  async fetchAll() {
    try {
      var results = await Promise.allSettled([
        this.fetchNews(),
        fetch("data/review.json?v=" + APP_VERSION).then(function(r) { return r.ok ? r.json() : null; }),
        fetch("data/videos.json?v=" + APP_VERSION).then(function(r) { return r.ok ? r.json() : null; })
      ]);
      if (results[0].status === "fulfilled" && results[0].value) {
        this.news = results[0].value;
      }
      if (results[1].status === "fulfilled" && results[1].value) {
        this.review = results[1].value;
      }
      if (results[2] && results[2].status === "fulfilled" && results[2].value) {
        this.videos = results[2].value;
      }
      this.lastFetch = new Date().toISOString();
      console.log("[LiveData] Fetched: news=" + !!this.news + " review=" + !!this.review + " videos=" + !!this.videos);
    } catch (e) {
      console.log("[LiveData] Fetch failed:", e.message);
    }
  },

  // Check if live data is fresh (generated today)
  isNewsFresh() {
    if (!this.news || !this.news.generatedAt) return false;
    return this.news.generatedAt.slice(0, 10) === today();
  },

  // Check if review data matches a specific date
  isReviewForDate(dateStr) {
    if (!this.review || !this.review.generatedAt) return false;
    return this.review.generatedAt.slice(0, 10) === dateStr;
  },

  isReviewFresh() {
    return this.isReviewForDate(today());
  },

  // Check if review data exists at all (even from yesterday)
  hasReviewData() {
    return !!this.review && !!this.review.generatedAt;
  },

  // Get the date of the current review data
  reviewDate() {
    return this.review && this.review.generatedAt ? this.review.generatedAt.slice(0, 10) : null;
  },

  isVideosFresh() {
    if (!this.videos || !this.videos.generatedAt) return false;
    return this.videos.generatedAt.slice(0, 10) === today();
  }
};

// ===== Crypto Helper (AES-GCM via Web Crypto) =====
const CryptoHelper = {
  _key: null,
  _encoder: new TextEncoder(),
  _decoder: new TextDecoder(),

  async _getKey(password) {
    var enc = this._encoder.encode(password);
    var hash = await crypto.subtle.digest("SHA-256", enc);
    return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  },

  async encrypt(plaintext, password) {
    try {
      var key = await this._getKey(password);
      var iv = crypto.getRandomValues(new Uint8Array(12));
      var data = this._encoder.encode(plaintext);
      var cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, data);
      var combined = new Uint8Array(iv.length + cipher.byteLength);
      combined.set(iv);
      combined.set(new Uint8Array(cipher), iv.length);
      return btoa(String.fromCharCode.apply(null, combined));
    } catch (e) { return null; }
  },

  async decrypt(cipherB64, password) {
    try {
      var combined = Uint8Array.from(atob(cipherB64), function(c) { return c.charCodeAt(0); });
      var iv = combined.slice(0, 12);
      var cipher = combined.slice(12);
      var key = await this._getKey(password);
      var decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, cipher);
      return this._decoder.decode(decrypted);
    } catch (e) { return null; }
  },

  async hashPin(pin) {
    var enc = this._encoder.encode(pin);
    var hash = await crypto.subtle.digest("SHA-256", enc);
    return Array.from(new Uint8Array(hash)).map(function(b) { return b.toString(16).padStart(2,"0"); }).join("");
  }
};

// ===== Privacy Manager =====
const PrivacyManager = {
  LOCK_ENABLED_KEY: "hw_pm_lock_enabled",
  PIN_HASH_KEY: "hw_pm_pin_hash",
  ENCRYPT_ENABLED_KEY: "hw_pm_encrypt_enabled",
  PRIVACY_ACCEPTED_KEY: "hw_pm_privacy_accepted",
  LOCK_TIMEOUT: 5 * 60 * 1000, // 5 min auto-lock

  _lockTimer: null,
  _pinBuffer: "",
  _isLocked: true,

  isLockEnabled() {
    return localStorage.getItem(this.LOCK_ENABLED_KEY) === "true";
  },

  isEncryptEnabled() {
    return localStorage.getItem(this.ENCRYPT_ENABLED_KEY) === "true";
  },

  isPrivacyAccepted() {
    return localStorage.getItem(this.PRIVACY_ACCEPTED_KEY) === "true";
  },

  async setPin(pin) {
    var hash = await CryptoHelper.hashPin(pin);
    localStorage.setItem(this.PIN_HASH_KEY, hash);
    localStorage.setItem(this.LOCK_ENABLED_KEY, "true");
  },

  async verifyPin(pin) {
    var storedHash = localStorage.getItem(this.PIN_HASH_KEY);
    if (!storedHash) return true; // no pin set
    var inputHash = await CryptoHelper.hashPin(pin);
    return storedHash === inputHash;
  },

  async disableLock() {
    localStorage.setItem(this.LOCK_ENABLED_KEY, "false");
    localStorage.removeItem(this.PIN_HASH_KEY);
    this._isLocked = false;
    document.getElementById("lock-screen").classList.add("hidden");
    this.clearLockTimer();
  },

  acceptPrivacy() {
    localStorage.setItem(this.PRIVACY_ACCEPTED_KEY, "true");
  },

  startLockTimer() {
    this.clearLockTimer();
    if (!this.isLockEnabled()) return;
    this._lockTimer = setTimeout(function() {
      PrivacyManager.lock();
    }, this.LOCK_TIMEOUT);
  },

  clearLockTimer() {
    if (this._lockTimer) { clearTimeout(this._lockTimer); this._lockTimer = null; }
  },

  lock() {
    if (!this.isLockEnabled()) return;
    this._isLocked = true;
    this._pinBuffer = "";
    document.getElementById("lock-screen").classList.remove("hidden");
    document.getElementById("lock-message").textContent = "请输入解锁密码";
    document.getElementById("lock-message").classList.remove("error");
    updatePinDots();
    this.clearLockTimer();
  },

  async unlock() {
    this._isLocked = false;
    this._pinBuffer = "";
    document.getElementById("lock-screen").classList.add("hidden");
    this.startLockTimer();
  },

  resetActivityTimer() {
    if (this._isLocked) return;
    this.startLockTimer();
  }
};

// ===== Service Worker Manager =====
const SWManager = {
  _registration: null,
  _updateAvailable: false,
  _reloading: false,

  async register() {
    if (!("serviceWorker" in navigator)) return;

    // Listen for SW_UPDATED message from service worker
    // This fires after skipWaiting + clients.claim, fixing standalone PWA stuck on old version
    navigator.serviceWorker.addEventListener("message", function(event) {
      if (event.data && event.data.type === "SW_UPDATED" && !SWManager._reloading) {
        console.log("[SW] New version activated, reloading...");
        SWManager._reloading = true;
        window.location.reload();
      }
    });

    try {
      this._registration = await navigator.serviceWorker.register("./sw.js?v=" + APP_VERSION);
      console.log("[SW] Registered:", this._registration.scope);

      // If there's already a waiting worker, apply it
      if (this._registration.waiting) {
        this._applyAndReload();
        return;
      }

      // Check for updates
      this._registration.addEventListener("updatefound", function() {
        var newWorker = SWManager._registration.installing;
        if (!newWorker) return;
        newWorker.addEventListener("statechange", function() {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            SWManager._updateAvailable = true;
            SWManager._showUpdateBar();
          }
        });
      });

      // Periodic update check
      setInterval(function() {
        if (SWManager._registration) SWManager._registration.update();
      }, 60 * 60 * 1000); // check every hour
    } catch (e) {
      console.log("[SW] Registration failed:", e);
    }
  },

  _showUpdateBar() {
    var bar = document.getElementById("update-bar");
    if (bar) bar.classList.remove("hidden");
  },

  _applyAndReload() {
    if (this._registration && this._registration.waiting) {
      this._registration.waiting.postMessage({ type: "SKIP_WAITING" });
      // SW_UPDATED message listener will trigger reload
    }
  },

  applyUpdate() {
    this._applyAndReload();
    document.getElementById("update-bar").classList.add("hidden");
    window.location.reload();
  }
};

// ===== Auto Backup Timer =====
const AutoBackupTimer = {
  INTERVAL: 10 * 60 * 1000, // 10 minutes (frequent backup to prevent data loss)
  _timer: null,

  start() {
    this.stop();
    this._timer = setInterval(function() {
      try { BackupDB.save("定时备份(" + new Date().toLocaleTimeString() + ")", DB.data); }
      catch (e) { /* silent */ }
    }, this.INTERVAL);
  },

  stop() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }
};

// ===== Cloud Backup (auto-download + image bundling) =====
const CloudBackup = {
  INTERVAL: 60 * 60 * 1000, // 60 minutes auto-download
  STORAGE_KEY: "hw_pm_cloud_backup_state",
  _timer: null,
  _state: { lastBackup: null, backupCount: 0, autoDownload: true },

  init() {
    try {
      var saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) this._state = JSON.parse(saved);
    } catch (e) {}
  },

  saveState() {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this._state));
  },

  isEnabled() {
    return this._state.autoDownload !== false;
  },

  toggle(enabled) {
    this._state.autoDownload = enabled;
    this.saveState();
    if (enabled) this.start(); else this.stop();
  },

  start() {
    this.stop();
    if (!this.isEnabled()) return;
    // Do first backup after 5 minutes (give user time to settle)
    this._timer = setTimeout(function() {
      CloudBackup.runAutoDownload();
      // Then repeat every hour
      CloudBackup._timer = setInterval(function() {
        CloudBackup.runAutoDownload();
      }, CloudBackup.INTERVAL);
    }, 5 * 60 * 1000);
  },

  stop() {
    if (this._timer) { clearInterval(this._timer); clearTimeout(this._timer); this._timer = null; }
  },

  // Collect all images referenced in data from IndexedDB
  async collectImages(data) {
    var imageIds = new Set();
    function scan(obj) {
      if (!obj || typeof obj !== "object") return;
      if (Array.isArray(obj)) { obj.forEach(scan); return; }
      if (obj.images && Array.isArray(obj.images)) {
        obj.images.forEach(function(id) { if (typeof id === "string") imageIds.add(id); });
      }
      Object.values(obj).forEach(scan);
    }
    scan(data);

    var images = {};
    if (imageIds.size > 0 && ImageDB.ready) {
      for (var id of imageIds) {
        try {
          var base64 = await ImageDB.get(id);
          if (base64) images[id] = base64;  // id -> base64 string
        } catch (e) {}
      }
    }
    return images;
  },

  // Build complete backup package (data + images)
  async buildPackage() {
    var data = JSON.parse(JSON.stringify(DB.data));
    var images = await this.collectImages(data);
    return {
      version: "4.1",
      type: "cloud_backup",
      exportedAt: new Date().toISOString(),
      exportedFrom: navigator.userAgent.includes("iPhone") ? "iPhone" : (navigator.userAgent.includes("Android") ? "Android" : "Desktop"),
      data: data,
      images: images,  // { imgId: { id, data: "base64...", mime, name } }
      stats: {
        products: data.products ? data.products.length : 0,
        competitors: data.competitors ? data.competitors.length : 0,
        insights: data.insights ? data.insights.length : 0,
        ideas: data.ideas ? data.ideas.length : 0,
        images: Object.keys(images).length
      }
    };
  },

  // Auto-download backup file
  async runAutoDownload() {
    try {
      var pkg = await this.buildPackage();
      var json = JSON.stringify(pkg, null, 2);
      var blob = new Blob([json], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      var a = document.createElement("a");
      a.href = url;
      a.download = "PM工作台_云端备份_" + ts + ".json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this._state.lastBackup = new Date().toISOString();
      this._state.backupCount++;
      this.saveState();
      console.log("[CloudBackup] Auto backup downloaded: " + ts);
    } catch (e) {
      console.error("[CloudBackup] Auto backup failed:", e);
    }
  },

  // Manual full backup download (async, shows toast)
  async runManualDownload() {
    try {
      var pkg = await this.buildPackage();
      var json = JSON.stringify(pkg, null, 2);
      var blob = new Blob([json], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "PM工作台_完整备份_" + today() + ".json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this._state.lastBackup = new Date().toISOString();
      this._state.backupCount++;
      this.saveState();
      return true;
    } catch (e) {
      console.error("[CloudBackup] Manual download failed:", e);
      return false;
    }
  },

  // Restore from cloud backup file (including images)
  async restoreFromFile(file) {
    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onload = async function(e) {
        try {
          var pkg = JSON.parse(e.target.result);
          if (pkg.type !== "cloud_backup") {
            // Legacy format: plain data JSON without images
            DB.data = pkg;
            DB.saveWithBackup();
            resolve({ imagesRestored: 0, legacy: true });
            return;
          }

          // Restore images to IndexedDB
          var imageCount = 0;
          if (pkg.images && ImageDB.ready) {
            for (var imgId in pkg.images) {
              try {
                await ImageDB.put(imgId, pkg.images[imgId]);
                imageCount++;
              } catch (e) {}
            }
          }

          // Restore data
          DB.data = pkg.data;
          DB.data.meta.lastUpdated = new Date().toISOString();
          DB.data.meta.restoredFrom = pkg.exportedAt;
          DB.saveWithBackup();
          resolve({ imagesRestored: imageCount, legacy: false, stats: pkg.stats });
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }
};

// ===== Restore helper (shared by file import + cloud pull) =====
async function restorePackage(pkg) {
  if (!pkg || !pkg.data) throw new Error("备份包无效");
  // Restore images to IndexedDB
  var imageCount = 0;
  if (pkg.images && ImageDB.ready) {
    for (var imgId in pkg.images) {
      try {
        await ImageDB.put(imgId, pkg.images[imgId]);
        imageCount++;
      } catch (e) { /* skip bad image */ }
    }
  }
  DB.data = pkg.data;
  DB.data.meta.lastUpdated = new Date().toISOString();
  DB.data.meta.restoredFrom = pkg.exportedAt;
  await DB.saveWithBackup();
  return { imagesRestored: imageCount, stats: pkg.stats };
}

// ===== WebDAV Sync (Nutstore via Cloudflare Worker proxy) =====
// Browsers cannot call dav.jianguoyun.com directly (no CORS headers),
// so all requests go through a Worker proxy that adds CORS headers.
const WebDAVSync = {
  KEY: "hw_pm_webdav_config",
  _cfg: null,
  _pushTimer: null,
  _pushScheduled: false,
  _initDone: false,

  init() {
    try {
      var s = localStorage.getItem(this.KEY);
      this._cfg = s ? JSON.parse(s) : null;
    } catch (e) { this._cfg = null; }
    if (!this._cfg) this._cfg = { proxyUrl: "", folder: "PM工作台备份", username: "", appPassword: "", enabled: false, lastSync: null };
    if (!this._cfg.folder) this._cfg.folder = "PM工作台备份";

    if (!this._initDone) {
      this._initDone = true;
      var self = this;
      document.addEventListener("visibilitychange", function() {
        if (document.visibilityState === "hidden") self.flush();
      });
    }
  },

  save() {
    try { localStorage.setItem(this.KEY, JSON.stringify(this._cfg)); } catch (e) {}
  },

  isConfigured() {
    return !!(this._cfg && this._cfg.proxyUrl && this._cfg.username && this._cfg.appPassword && this._cfg.folder);
  },
  isEnabled() {
    return this.isConfigured() && this._cfg.enabled !== false;
  },

  baseUrl() {
    var base = (this._cfg.proxyUrl || "").replace(/\/+$/, "");
    var folder = (this._cfg.folder || "").replace(/^\/+|\/+$/g, "");
    return base + "/dav/" + encodeURIComponent(folder);
  },

  authHeader() {
    var user = this._cfg.username || "";
    var pass = this._cfg.appPassword || "";
    var raw = user + ":" + pass;
    var b64 = btoa(unescape(encodeURIComponent(raw)));
    return "Basic " + b64;
  },

  async _request(method, path, body, isXml) {
    if (!this.isConfigured()) throw new Error("未配置 WebDAV");
    var url = this.baseUrl() + "/" + (path || "").replace(/^\/+/, "");
    var headers = {
      "Authorization": this.authHeader(),
      "Content-Type": isXml ? "application/xml; charset=utf-8" : "application/json"
    };
    if (method === "PROPFIND") headers["Depth"] = "1";
    var opts = { method: method, headers: headers };
    if (body !== undefined && body !== null && ["GET", "HEAD", "DELETE", "OPTIONS"].indexOf(method) === -1) {
      opts.body = body;
    }
    var resp = await fetch(url, opts);
    if (method === "PROPFIND" && (resp.status === 207 || resp.status === 200)) return resp;
    return resp;
  },

  async ensureFolder() {
    try {
      // MKCOL the remote folder; 201=created, 405/409=already exists (both OK)
      await this._request("MKCOL", "", null);
    } catch (e) { /* ignore */ }
  },

  async putBackup() {
    await this.ensureFolder();
    var pkg = await CloudBackup.buildPackage();
    var body = JSON.stringify(pkg);
    var resp = await this._request("PUT", "pm-backup.json", body);
    if (!resp.ok) throw new Error("上传失败 HTTP " + resp.status);
    this._cfg.lastSync = new Date().toISOString();
    this.save();
    return pkg;
  },

  async getBackup() {
    var resp = await this._request("GET", "pm-backup.json");
    if (resp.status === 404) return null;
    if (!resp.ok) throw new Error("下载失败 HTTP " + resp.status);
    var text = await resp.text();
    return JSON.parse(text);
  },

  async testConnection() {
    if (!this.isConfigured()) return false;
    try {
      await this.ensureFolder();
      var resp = await this._request("PROPFIND", "");
      return resp.status === 207 || resp.status === 200;
    } catch (e) { return false; }
  },

  async uploadNow() {
    if (!this.isEnabled()) { showToast("WebDAV 未启用", "warning"); return; }
    showToast("正在同步到坚果云…", "info");
    try {
      await this.putBackup();
      showToast("✅ 已同步到云端 (" + formatDateTime(this._cfg.lastSync) + ")", "success");
      render();
    } catch (e) {
      showToast("同步失败: " + e.message, "warning");
    }
  },

  async pullAndRestore() {
    if (!this.isEnabled()) { showToast("WebDAV 未启用", "warning"); return; }
    showToast("正在从云端拉取…", "info");
    try {
      var pkg = await this.getBackup();
      if (!pkg) { showToast("云端暂无备份", "warning"); return; }
      if (confirm("⚠️ 从云端恢复将覆盖本地当前数据。\n\n云端备份时间: " + formatDateTime(pkg.exportedAt) + "\n确定继续？")) {
        var r = await restorePackage(pkg);
        showToast("已从云端恢复（图片 " + r.imagesRestored + " 张）", "success");
        render();
      }
    } catch (e) {
      showToast("拉取失败: " + e.message, "warning");
    }
  },

  async checkOnStartup() {
    if (!this.isEnabled()) return;
    try {
      var pkg = await this.getBackup();
      if (!pkg) return;
      var localTime = DB.data.meta.lastUpdated || "1970-01-01T00:00:00.000Z";
      var cloudTime = pkg.exportedAt || "1970-01-01T00:00:00.000Z";
      var hasLocal = (DB.data.growth.reviews.length + DB.data.products.length +
                      DB.data.competitors.length + DB.data.ideas.length + DB.data.insights.length) > 3;
      if (!hasLocal) {
        await restorePackage(pkg);
        showToast("📥 已从云端恢复数据", "success");
        render();
      } else if (cloudTime > localTime) {
        var self = this;
        setTimeout(function() {
          showConfirmDialog("☁️", "检测到云端更新",
            "云端备份时间 " + formatDateTime(pkg.exportedAt) + " 晚于本地 " + formatDateTime(localTime) +
            "。是否用云端版本覆盖本地？", [
              { text: "取消", cls: "btn-secondary", action: function() { closeModal(); } },
              { text: "覆盖本地", cls: "btn-primary", style: "background:var(--accent-red);color:white",
                action: function() { closeModal(); self._forcePull(pkg); } }
            ]);
        }, 1200);
      }
    } catch (e) { /* silent on startup */ }
  },

  async _forcePull(pkg) {
    try {
      var r = await restorePackage(pkg);
      showToast("已覆盖本地为云端版本（图片 " + r.imagesRestored + " 张）", "success");
      render();
    } catch (e) { showToast("恢复失败: " + e.message, "warning"); }
  },

  schedulePush() {
    if (!this.isEnabled() || this._pushScheduled) return;
    this._pushScheduled = true;
    var self = this;
    setTimeout(function() {
      self._pushScheduled = false;
      self.putBackup().then(function() {
        console.log("[WebDAV] auto-pushed");
      }).catch(function(e) { console.warn("[WebDAV] auto-push failed", e); });
    }, 8000);
  },

  flush() {
    if (!this.isEnabled()) return;
    this.putBackup().catch(function(e) { console.warn("[WebDAV] flush failed", e); });
  },

  start() {
    if (!this.isEnabled()) return;
    var self = this;
    this.stop();
    this._pushTimer = setInterval(function() {
      self.putBackup().catch(function(e) { console.warn("[WebDAV] periodic push failed", e); });
    }, 15 * 60 * 1000);
  },

  stop() {
    if (this._pushTimer) { clearInterval(this._pushTimer); this._pushTimer = null; }
  }
};

// ===== 全局超时工具：根治 Supabase / IndexedDB 请求 hang 导致的无限白屏 =====
function _withTimeout(promise, ms, label) {
  var _label = label || "request";
  return new Promise(function (resolve, reject) {
    var done = false;
    var timer = setTimeout(function () {
      if (done) return;
      done = true;
      reject(new Error(_label + " timeout after " + ms + "ms"));
    }, ms);
    Promise.resolve(promise).then(
      function (v) { if (done) return; done = true; clearTimeout(timer); resolve(v); },
      function (e) { if (done) return; done = true; clearTimeout(timer); reject(e); }
    );
  });
}

const ImageDB = {
  _db: null,
  ready: false,

  async open() {
    return new Promise((resolve, reject) => {
      // v2：新增 latest 单条缓存 store（防 localStorage 被浏览器清理导致重开丢数据）
      const req = indexedDB.open("pm_workbench_images_v2", 2);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("images")) {
          db.createObjectStore("images", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("backups")) {
          db.createObjectStore("backups", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("latest")) {
          db.createObjectStore("latest", { keyPath: "id" });
        }
      };
      req.onsuccess = (e) => {
        this._db = e.target.result;
        this.ready = true;
        resolve();
      };
      req.onerror = () => reject(new Error("IndexedDB open failed"));
    });
  },

  // 最新数据缓存（单条 id="latest"，每次 DB.save 更新；比 localStorage 更抗清理）
  async saveLatest(data) {
    if (!this.ready) { try { await this.open(); } catch (e) { return false; } }
    return new Promise((resolve) => {
      try {
        const tx = this._db.transaction("latest", "readwrite");
        tx.objectStore("latest").put({ id: "latest", data: JSON.parse(JSON.stringify(data)), date: new Date().toISOString() });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) { resolve(false); }
    });
  },
  async loadLatest() {
    if (!this.ready) { try { await this.open(); } catch (e) { return null; } }
    return new Promise((resolve) => {
      try {
        const tx = this._db.transaction("latest", "readonly");
        const req = tx.objectStore("latest").get("latest");
        req.onsuccess = () => resolve(req.result ? req.result.data : null);
        req.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
  },

  async store(base64) {
    if (!this.ready) await this.open();
    return new Promise((resolve) => {
      const id = "img_" + uid();
      const tx = this._db.transaction("images", "readwrite");
      tx.objectStore("images").put({ id, data: base64, date: new Date().toISOString() });
      tx.oncomplete = () => resolve(id);
    });
  },

  async storeMany(images) {
    return Promise.all(images.map(img => this.store(img)));
  },

  async get(id) {
    if (!this.ready) await this.open();
    return new Promise((resolve) => {
      const tx = this._db.transaction("images", "readonly");
      const req = tx.objectStore("images").get(id);
      req.onsuccess = () => resolve(req.result ? req.result.data : null);
    });
  },

  async getManySafe(ids) {
    if (!ids || !ids.length) return [];
    const results = await Promise.allSettled(ids.map(id => this.get(id)));
    return results.map((r, i) => r.status === "fulfilled" ? r.value : null).filter(Boolean);
  },

  async remove(id) {
    if (!this.ready) await this.open();
    return new Promise((resolve) => {
      const tx = this._db.transaction("images", "readwrite");
      tx.objectStore("images").delete(id);
      tx.oncomplete = () => resolve();
    });
  },

  async removeMany(ids) {
    if (!ids || !ids.length) return;
    await Promise.all(ids.map(id => this.remove(id)));
  },

  // Put image with specific ID (for restore)
  async put(id, base64) {
    if (!this.ready) await this.open();
    return new Promise((resolve) => {
      var tx = this._db.transaction("images", "readwrite");
      tx.objectStore("images").put({ id: id, data: base64, date: new Date().toISOString() });
      tx.oncomplete = () => resolve();
    });
  }
};

// ===== BackupDB =====
const BackupDB = {
  async save(name, data) {
    if (!ImageDB.ready) await ImageDB.open();
    return new Promise((resolve) => {
      const id = "bak_" + Date.now();
      const tx = ImageDB._db.transaction("backups", "readwrite");
      const bak = { id, name, data: JSON.parse(JSON.stringify(data)), date: new Date().toISOString() };
      tx.objectStore("backups").put(bak);
      tx.oncomplete = () => {
        BackupDB.prune();
        resolve(id);
      };
    });
  },

  async list() {
    if (!ImageDB.ready) await ImageDB.open();
    return new Promise((resolve) => {
      const tx = ImageDB._db.transaction("backups", "readonly");
      const req = tx.objectStore("backups").getAll();
      req.onsuccess = () => {
        const list = req.result || [];
        list.sort((a, b) => b.date.localeCompare(a.date));
        resolve(list);
      };
    });
  },

  async get(id) {
    if (!ImageDB.ready) await ImageDB.open();
    return new Promise((resolve) => {
      const tx = ImageDB._db.transaction("backups", "readonly");
      const req = tx.objectStore("backups").get(id);
      req.onsuccess = () => resolve(req.result);
    });
  },

  async prune() {
    const list = await this.list();
    if (list.length > 15) {
      const toDelete = list.slice(15);
      const tx = ImageDB._db.transaction("backups", "readwrite");
      toDelete.forEach(b => tx.objectStore("backups").delete(b.id));
    }
  },

  async delete(id) {
    const tx = ImageDB._db.transaction("backups", "readwrite");
    tx.objectStore("backups").delete(id);
  }
};

// ===== Seed Data =====
const SEED_DATA = {
  meta: {
    version: "2.0",
    userName: "小壹",
    estimatedGMV: "200,000",
    createdAt: new Date().toISOString(),
  },
  workbench: {
    tasks: [
      { id: "t1", text: "确认散热充电宝Qi2认证送测时间", priority: "high", done: false, date: today() },
      { id: "t2", text: "跟进桌面美拍站左右门灯与RGB互斥方案打样", priority: "high", done: false, date: today() },
      { id: "t3", text: "整理摄影LED补光灯2700K+6500K双灯珠BOM", priority: "medium", done: false, date: today() },
      { id: "t4", text: "回复Amazon listing SOP文档反馈", priority: "medium", done: true, date: today() },
    ],
    notes: [
      { id: "n1", text: "MagPop升级方向：加大底盘面积提升支撑稳定性，增加高度调节范围，参考Ulanzi MA71结构", date: today() },
      { id: "n2", text: "挂腰风扇针对摄影人群：需轻量化+长续航+静音，可考虑磁吸腰带固定方案", date: today() },
    ],
    reflections: [
      { id: "r1", text: "今天重点推进了散热充电宝认证清单梳理和桌面美拍站灯光互斥方案，进展顺利。需要尽快确定LED补光灯开模厂商。", mood: "good", date: today() },
    ],
  },
  products: [
    { id: "p1", name: "散热无线充电宝", category: "充电类", status: "研发中", stage: "pvt", priority: "high", keyParams: "10000mAh | 18W PD | Qi2 | 三档散热", description: "集成散热风扇的无线充电宝，认证送测阶段", progress: 65 },
    { id: "p2", name: "MagSafe风扇灯", category: "配件类", status: "设计阶段", stage: "evt", priority: "high", keyParams: "软管连接 | 可对折收纳 | 电池分离式", description: "电池与风扇灯通过软管连接，支持对折收纳，便携性为核心卖点", progress: 40 },
    { id: "p3", name: "挂腰风扇", category: "风扇类", status: "概念阶段", stage: "concept", priority: "medium", keyParams: "摄影人群 | 轻量化 | 长续航", description: "专为户外摄影人群设计的挂腰风扇，需解决静音与续航平衡", progress: 15 },
    { id: "p4", name: "摄影LED补光灯", category: "灯光类", status: "开模中", stage: "dvt", priority: "high", keyParams: "2700K+6500K双灯珠 | 常规芯片控成本", description: "双色温LED补光灯，采用常规芯片方案控制成本，推进开模中", progress: 55 },
    { id: "p5", name: "镜面自拍屏支架", category: "支架类", status: "设计阶段", stage: "evt", priority: "medium", keyParams: "Find My | 蓝牙HID快门 | 参考MOFT架构", description: "集成Find My定位和蓝牙快门功能的镜面自拍屏支架", progress: 30 },
    { id: "p6", name: "Moki桌面美拍站", category: "美拍类", status: "测试中", stage: "pvt", priority: "high", keyParams: "底盘30.5cm | 伸缩38cm | 镜面26x20cm", description: "主镜灯11W+门灯11W+RGB 2.6W，解决功率过高和混光串色问题", progress: 70 },
    { id: "p7", name: "便携美拍站", category: "美拍类", status: "概念阶段", stage: "concept", priority: "medium", keyParams: "便携折叠 | Amazon竞品调研中", description: "桌面美拍站的便携版本，正在做Amazon竞品调研", progress: 10 },
    { id: "p8", name: "智能美妆镜", category: "镜类", status: "概念阶段", stage: "concept", priority: "low", keyParams: "AI功能 | 硬件形态探索中", description: "探索AI功能与硬件形态结合的智能美妆镜", progress: 5 },
    { id: "p9", name: "MagPop磁吸支架升级", category: "支架类", status: "研发中", stage: "dvt", priority: "medium", keyParams: "加大尺寸 | 扩展支撑角度 | 高度调节", description: "针对现有款尺寸小、支撑角度高度有限问题进行升级", progress: 45 },
    { id: "p10", name: "伞式磁吸车载支架", category: "车载类", status: "研发中", stage: "dvt", priority: "medium", keyParams: "防眩光 | 防烫升级", description: "基于竞品差评分析推进防眩光/防烫功能升级", progress: 50 },
  ],
  industry: [
    { id: "i1", title: "Qi2无线充电标准加速普及，MFW认证生态扩大", source: "行业资讯", url: "", summary: "Qi2协议基于MagSafe技术，支持更快充电速度和更精准对齐。越来越多配件厂商获得MFW认证，市场渗透率持续提升。", tags: ["无线充电", "Qi2", "行业趋势"], date: today(-1), important: true },
    { id: "i2", title: "2026年便携美拍镜品类Amazon搜索量同比增长35%", source: "市场数据", url: "", summary: "便携美拍镜/自拍站在Amazon平台搜索热度持续上升，核心关键词集中在便携、磁吸、补光三个方向。", tags: ["美拍", "Amazon", "市场数据"], date: today(-2), important: true },
    { id: "i3", title: "Find My配件生态开放，第三方厂商加速入局", source: "行业资讯", url: "", summary: "Apple持续开放Find My网络给第三方配件厂商，支持Find My的产品在Amazon溢价明显。", tags: ["Find My", "Apple生态", "行业趋势"], date: today(-3), important: false },
    { id: "i4", title: "磁吸配件市场年复合增长率预计达18%", source: "市场报告", url: "", summary: "MagSafe兼容配件市场快速增长，车载支架、桌面支架、补光灯是增长最快的三大品类。", tags: ["MagSafe", "市场数据"], date: today(-5), important: false },
  ],
  competitors: [
    { id: "c1", name: "Ulanzi MA71 Magpop", brand: "Ulanzi", price: "$25.99", platform: "Amazon", features: ["磁吸支架", "可折叠", "多角度"], pros: ["尺寸紧凑便携", "磁吸力度强", "做工精致"], cons: ["尺寸偏小支撑不够稳", "高度调节范围有限", "大手机容易倾倒"], rating: 4, url: "", images: [], date: today(-2) },
    { id: "c2", name: "Portable Ring Light Mirror", brand: "Generic", price: "$19.99", platform: "Amazon", features: ["补光环", "镜面", "折叠支架"], pros: ["价格低", "轻便"], cons: ["灯光功率不足", "塑料感强", "续航短"], rating: 3, url: "", images: [], date: today(-5) },
    { id: "c3", name: "MagSafe Car Mount Pro", brand: "Belkin", price: "$34.95", platform: "Amazon", features: ["MagSafe", "车载", "伞式结构"], pros: ["品牌信任度高", "安装简便", "磁吸稳定"], cons: ["夏季高温烫手", "强光下反光眩目", "价格偏高"], rating: 4, url: "", images: [], date: today(-7) },
    { id: "c4", name: "MOFT Tripod Wallet", brand: "MOFT", price: "$29.90", platform: "官网", features: ["Find My", "蓝牙快门", "可拆卸", "卡片形态"], pros: ["极致轻薄", "Find My集成", "创意形态"], cons: ["价格较高", "支架高度有限", "蓝牙连接偶有断连"], rating: 5, url: "", images: [], date: today(-10) },
  ],
  insights: [
    { id: "d1", title: "摄影人群户外补光+降温双重需求", targetUser: "户外摄影爱好者", painPoint: "长时间户外拍摄时手机/相机发热严重，同时需要补光，目前没有一体化解决方案", description: "可探索补光灯+微型散热风扇的组合产品，解决摄影人群补光和设备降温的双重痛点", priority: "high", product: "摄影LED补光灯+挂腰风扇", images: [], links: [], supplements: [], date: today(-1) },
    { id: "d2", title: "桌面美拍站用户反馈高度不够", targetUser: "内容创作者/博主", painPoint: "现有伸缩杆结构难以加长，高度调整受限，无法满足站立拍摄需求", description: "需重新设计伸缩杆结构，考虑多段式伸缩或更换材质方案", priority: "high", product: "Moki桌面美拍站", images: [], links: [], supplements: [], date: today(-2) },
    { id: "d3", title: "车载支架夏季高温痛点明显", targetUser: "车主", painPoint: "夏季车内温度高，金属支架烫手，且阳光直射反光严重影响驾驶安全", description: "防眩光+防烫是伞式车载支架的核心升级方向，差评集中在这两个问题", priority: "medium", product: "伞式磁吸车载支架", images: [], links: [], supplements: [], date: today(-4) },
  ],
  demandReports: [],
  truenorthReports: [],
  ideas: [
    { id: "a1", title: "散热充电宝+手机支架一体化", description: "在散热充电宝底部集成可折叠手机支架，充电+散热+支撑三合一，差旅场景一站解决", category: "产品创意", inspiration: "用户反馈充电时无法同时看视频", status: "new", images: [], links: [], date: today(-1) },
    { id: "a2", title: "磁吸风扇灯模块化设计", description: "风扇灯组件做模块化，可单独拆卸作为手持小风扇，电池底座通用", category: "结构创新", inspiration: "参考MagSafe风扇灯软管连接方案", status: "developing", images: [], links: [], date: today(-3) },
    { id: "a3", title: "Find My+补光灯二合一自拍支架", description: "在自拍屏支架上集成Find My防丢和LED补光，旅行场景一物多用", category: "产品创意", inspiration: "MOFT tripod wallet的Find My+快门组合", status: "new", images: [], links: [], date: today(-5) },
    { id: "a4", title: "RGB氛围灯做NFC触发场景模式", description: "通过NFC标签触发RGB灯预设场景，靠近即可切换氛围光模式", category: "技术创新", inspiration: "智能家居NFC场景触发", status: "new", images: [], links: [], date: today(-7) },
    { id: "a5", title: "挂腰风扇集成香薰模块", description: "在挂腰风扇出风口增加可更换香薰片，吹风+香薰二合一", category: "产品创意", inspiration: "香薰风扇概念", status: "archived", images: [], links: [], date: today(-10) },
  ],
  planning: [
    { id: "pl1", product: "散热无线充电宝", phase: "认证送测", startDate: "2026-08-01", endDate: "2026-09-15", status: "进行中", milestones: ["CCC认证", "CE-RED认证", "FCC认证", "Qi2认证", "PSE/KC认证"], notes: "需同步推进IEC 62133、UL2054、UN38.3、MSDS" },
    { id: "pl2", product: "Moki桌面美拍站", phase: "方案优化", startDate: "2026-07-20", endDate: "2026-08-30", status: "进行中", milestones: ["灯光互斥方案验证", "伸缩杆结构优化", "功率控制方案确认"], notes: "解决三路灯光24.6W功率过高和RGB混光串色问题" },
    { id: "pl3", product: "摄影LED补光灯", phase: "开模", startDate: "2026-07-15", endDate: "2026-09-01", status: "进行中", milestones: ["双灯珠方案确认", "模具开发", "T0样件验证"], notes: "2700K+6500K双灯珠，常规芯片控成本" },
    { id: "pl4", product: "伞式磁吸车载支架", phase: "竞品分析", startDate: "2026-07-10", endDate: "2026-08-10", status: "进行中", milestones: ["竞品差评收集", "防眩光方案选型", "防烫材料测试"], notes: "基于竞品差评分析定位升级机会" },
    { id: "pl5", product: "MagPop磁吸支架升级", phase: "设计", startDate: "2026-08-01", endDate: "2026-10-01", status: "待启动", milestones: ["尺寸加大方案", "支撑角度优化", "高度调节机构设计"], notes: "参考Ulanzi MA71产品文档" },
  ],
  activity: [
    { id: "ac1", type: "idea", text: "新增想法：散热充电宝+手机支架一体化", date: today(-1) },
    { id: "ac2", type: "competitor", text: "新增竞品分析：Ulanzi MA71 Magpop", date: today(-2) },
    { id: "ac3", type: "industry", text: "收藏行业情报：便携美拍镜品类Amazon增长35%", date: today(-2) },
    { id: "ac4", type: "insight", text: "新增需求洞察：摄影人群户外补光+降温双重需求", date: today(-1) },
  ],
  // ===== 个人成长区数据 =====
  growth: {
    // 每日饮食（7天减脂计划轮换）
    diet: {
      // 检查/打卡数据
      checkoffs: {}, // { "2026-07-28": { breakfast: true, lunch: true, preWorkout: true, postWorkout: true, supper: true, extraSnack: true } }
      cheatMeals: [], // { id, date, note }
      // 7天减脂饮食计划轮换（key: 1-7, 1=周一）
      mealPlan: {
        "1": { breakfast: { name: "燕麦牛奶+水煮蛋", items: "即食燕麦50g + 脱脂牛奶200ml + 水煮蛋1个 + 蓝莓30g", kcal: 335, protein: 21, carb: 44, fat: 9 }, lunch: { name: "鸡胸肉藜麦沙拉", items: "煎鸡胸肉120g + 藜麦80g + 混合生菜200g + 橄榄油5ml", kcal: 410, protein: 40, carb: 38, fat: 12 }, preWorkout: { name: "香蕉+黑咖啡", items: "香蕉1根 + 美式黑咖啡1杯", kcal: 105, protein: 1, carb: 27, fat: 0 }, postWorkout: { name: "蛋白粉+脱脂牛奶", items: "乳清蛋白粉25g + 脱脂牛奶250ml", kcal: 210, protein: 30, carb: 14, fat: 2 }, supper: { name: "西兰花炒牛肉", items: "瘦牛肉100g + 西兰花200g + 蒜蓉", kcal: 295, protein: 34, carb: 10, fat: 14 }, extraSnack: { name: "无糖酸奶(可选)", items: "无糖酸奶150ml", kcal: 62, protein: 5, carb: 7, fat: 2 } },
        "2": { breakfast: { name: "全麦三明治+水煮蛋", items: "全麦面包2片 + 火腿片30g + 生菜20g + 水煮蛋1个", kcal: 345, protein: 22, carb: 38, fat: 12 }, lunch: { name: "香煎三文鱼+糙米饭", items: "三文鱼120g + 糙米饭100g + 芦笋150g", kcal: 430, protein: 35, carb: 40, fat: 14 }, preWorkout: { name: "全麦饼干+黑咖啡", items: "全麦饼干2片 + 美式黑咖啡1杯", kcal: 100, protein: 2, carb: 22, fat: 2 }, postWorkout: { name: "蛋白粉+香蕉奶昔", items: "蛋白粉25g + 香蕉半根 + 脱脂牛奶200ml", kcal: 240, protein: 28, carb: 24, fat: 2 }, supper: { name: "番茄豆腐虾仁汤", items: "虾仁100g + 嫩豆腐100g + 番茄1个", kcal: 260, protein: 30, carb: 15, fat: 8 }, extraSnack: { name: "黄瓜条(可选)", items: "黄瓜1根", kcal: 16, protein: 1, carb: 3, fat: 0 } },
        "3": { breakfast: { name: "希腊酸奶+坚果+水果", items: "无糖希腊酸奶150g + 混合坚果20g + 草莓80g + 蜂蜜5g", kcal: 320, protein: 18, carb: 30, fat: 16 }, lunch: { name: "鸡腿肉蔬菜炒面", items: "去皮鸡腿肉100g + 全麦意面60g + 彩椒青椒100g", kcal: 420, protein: 32, carb: 45, fat: 12 }, preWorkout: { name: "苹果+黑咖啡", items: "苹果1个 + 美式黑咖啡1杯", kcal: 95, protein: 0.5, carb: 25, fat: 0 }, postWorkout: { name: "蛋白粉+水", items: "乳清蛋白粉25g + 水250ml", kcal: 110, protein: 25, carb: 2, fat: 1 }, supper: { name: "清蒸鲈鱼+蒜蓉西兰花", items: "鲈鱼150g + 西兰花200g", kcal: 280, protein: 35, carb: 8, fat: 12 }, extraSnack: { name: "圣女果(可选)", items: "圣女果100g", kcal: 22, protein: 1, carb: 5, fat: 0 } },
        "4": { breakfast: { name: "牛油果蛋饼", items: "鸡蛋2个 + 牛油果半个 + 全麦饼皮1张", kcal: 340, protein: 18, carb: 22, fat: 22 }, lunch: { name: "牛肉沙拉碗", items: "瘦牛肉100g + 鹰嘴豆50g + 混合生菜200g + 橄榄油5ml", kcal: 380, protein: 35, carb: 28, fat: 16 }, preWorkout: { name: "蛋白棒+黑咖啡", items: "低糖蛋白棒1条 + 美式黑咖啡1杯", kcal: 170, protein: 15, carb: 15, fat: 5 }, postWorkout: { name: "蛋白粉+脱脂牛奶", items: "乳清蛋白粉25g + 脱脂牛奶250ml", kcal: 210, protein: 30, carb: 14, fat: 2 }, supper: { name: "泡菜豆腐锅", items: "嫩豆腐150g + 泡菜80g + 金针菇100g + 鸡蛋1个", kcal: 270, protein: 24, carb: 18, fat: 10 }, extraSnack: { name: "毛豆(可选)", items: "水煮毛豆100g", kcal: 120, protein: 11, carb: 9, fat: 5 } },
        "5": { breakfast: { name: "隔夜燕麦杯", items: "即食燕麦50g + 奇亚籽10g + 脱脂牛奶200ml + 香蕉半根", kcal: 340, protein: 14, carb: 52, fat: 8 }, lunch: { name: "虾仁蛋炒饭(低油)", items: "虾仁100g + 鸡蛋1个 + 糙米饭100g + 杂蔬80g", kcal: 410, protein: 32, carb: 42, fat: 10 }, preWorkout: { name: "全麦吐司+黑咖啡", items: "全麦吐司1片 + 花生酱5g + 黑咖啡1杯", kcal: 130, protein: 5, carb: 20, fat: 4 }, postWorkout: { name: "蛋白粉+水", items: "乳清蛋白粉25g + 水250ml", kcal: 110, protein: 25, carb: 2, fat: 1 }, supper: { name: "烤鸡胸+烤蔬菜", items: "鸡胸肉120g + 南瓜150g + 西葫芦100g", kcal: 310, protein: 35, carb: 22, fat: 8 }, extraSnack: { name: "无糖豆浆(可选)", items: "无糖豆浆250ml", kcal: 45, protein: 4, carb: 3, fat: 2 } },
        "6": { breakfast: { name: "蛋白松饼+蓝莓", items: "蛋白粉15g + 鸡蛋1个 + 燕麦粉30g + 蓝莓50g", kcal: 300, protein: 28, carb: 28, fat: 8 }, lunch: { name: "金枪鱼牛油果拌饭", items: "水浸金枪鱼100g + 牛油果半个 + 糙米饭100g + 紫菜", kcal: 440, protein: 32, carb: 40, fat: 16 }, preWorkout: { name: "红薯+黑咖啡", items: "蒸红薯100g + 美式黑咖啡1杯", kcal: 100, protein: 2, carb: 23, fat: 0 }, postWorkout: { name: "蛋白粉+脱脂牛奶", items: "蛋白粉25g + 脱脂牛奶250ml", kcal: 210, protein: 30, carb: 14, fat: 2 }, supper: { name: "番茄鸡肉丸子汤", items: "鸡胸肉丸子120g + 番茄2个 + 冬瓜150g", kcal: 260, protein: 30, carb: 15, fat: 6 }, extraSnack: { name: "坚果(可选)", items: "混合坚果15g", kcal: 90, protein: 3, carb: 3, fat: 8 } },
        "7": { breakfast: { name: "法式吐司+水果", items: "全麦吐司2片蛋液浸泡 + 枫糖浆5g + 草莓80g", kcal: 330, protein: 14, carb: 48, fat: 10 }, lunch: { name: "照烧鸡腿饭", items: "去皮鸡腿120g + 糙米饭100g + 西兰花100g + 照烧汁(低糖)", kcal: 450, protein: 35, carb: 48, fat: 12 }, preWorkout: { name: "香蕉+黑咖啡", items: "香蕉1根 + 美式黑咖啡1杯", kcal: 105, protein: 1, carb: 27, fat: 0 }, postWorkout: { name: "蛋白粉+香蕉", items: "蛋白粉25g + 香蕉半根 + 水250ml", kcal: 175, protein: 25, carb: 15, fat: 1 }, supper: { name: "蒜蓉大虾+杂粮饭", items: "大虾8只 + 杂粮饭80g + 清炒时蔬150g", kcal: 370, protein: 30, carb: 35, fat: 10 }, extraSnack: { name: "水果碗(可选)", items: "芒果/火龙果/猕猴桃150g", kcal: 80, protein: 1, carb: 20, fat: 0 } }
      }
    },
    // 🔥 爆款视频拆解 (v2 — 分类+图片+标签)
    videos: {
      items: [],
      lastGeneratedMorning: null,
      lastGeneratedEvening: null,
      customTagBank: {}
    },
    // 小红书爆款笔记查询（XHS）
    xhs: {
      history: [],
      subscriptions: [],
      source: "demo",
      redfoxKey: ""
    },
    mr: {
      history: [],
      reports: []
    },
    // 每日复盘（股市收盘专用）
    reviews: [], // { id, date, marketOverview, sectors, holdingsPL, tradeReview, opportunities, risks }
    // 投资理财
    invest: {
      assets: [],        // { id, name, category, amount, note }
      holdings: [],      // { id, name, code, market, cost, shares, price, updatedAt }
      netWorthLog: [],   // { date, value }
      cash: 0,
      expenses: [],
      settings: {}
    },
    // 英语学习（雅思+硬件/外贸双词库，双Tab模式）
    english: {
      currentTab: "words", // "words" | "reading"
      studyLog: {}, // { "2026-07-28": { duration: 45, completed: true } }
      streak: 0,
      lastStudyDate: null,
      dailyWords: {}, // { "2026-07-28": [word objects] }
      dailyReading: {}, // { "2026-07-28": { en: "...", cn: "..." } }
      timerRunning: false,
      timerStart: null,
      timerElapsed: 0,
      newWords: [],
      masteredWords: [],
      deck: [], // 艾宾浩斯复习卡：{ en, cn, phonetic, pos, example, box, next, last, reps, lapses }
      readRate: 0.9,
      // 新模块字段
      wrongList: {},          // { "2026-08-03": ["en", ...] } 次日复习清单
      statReviewed: 0,        // 累计复习次数
      statLearned: 0,         // 累计新学词数
      reviewDoneToday: 0,     // 今日已完成复习数（用于完成率）
      reviewDate: null,
      checkinQuoteIndex: null,
      quoteDay: null,
      testMode: "ec",         // ec | ce | sp
      vocabBank: [
        { en: "abandon", phonetic: "/əˈbændən/", cn: "放弃；抛弃", example: "He had to abandon his plan due to budget constraints." },
        { en: "abstract", phonetic: "/ˈæbstrækt/", cn: "抽象的；摘要", example: "The abstract concept was difficult for students to grasp." },
        { en: "accommodate", phonetic: "/əˈkɑːmədeɪt/", cn: "容纳；适应", example: "The venue can accommodate up to 500 guests." },
        { en: "accumulate", phonetic: "/əˈkjuːmjəleɪt/", cn: "积累；积聚", example: "Small investments accumulate into significant wealth over time." },
        { en: "adequate", phonetic: "/ˈædɪkwət/", cn: "充足的；适当的", example: "Make sure you have adequate preparation before the exam." },
        { en: "allocate", phonetic: "/ˈæləkeɪt/", cn: "分配；拨出", example: "The company will allocate more resources to R&D." },
        { en: "alternative", phonetic: "/ɔːlˈtɜːrnətɪv/", cn: "替代方案；替代的", example: "We need an alternative energy source for sustainability." },
        { en: "analyze", phonetic: "/ˈænəlaɪz/", cn: "分析；解析", example: "We need to analyze the data before making a decision." },
        { en: "anticipate", phonetic: "/ænˈtɪsɪpeɪt/", cn: "预期；预料", example: "We anticipate strong demand for the new product line." },
        { en: "assess", phonetic: "/əˈses/", cn: "评估；评定", example: "Experts will assess the environmental impact of the project." },
        { en: "beneficial", phonetic: "/ˌbenɪˈfɪʃəl/", cn: "有益的；有利的", example: "Regular exercise is highly beneficial to your health." },
        { en: "commodity", phonetic: "/kəˈmɑːdəti/", cn: "商品；日用品", example: "Oil is one of the most traded commodities in the world." },
        { en: "compensate", phonetic: "/ˈkɑːmpenseɪt/", cn: "补偿；赔偿", example: "The company will compensate customers for the delay." },
        { en: "component", phonetic: "/kəmˈpoʊnənt/", cn: "部件；组成部分", example: "Each component must pass rigorous quality testing." },
        { en: "consequence", phonetic: "/ˈkɑːnsəkwens/", cn: "结果；后果", example: "Every design decision has its consequence downstream." },
        { en: "constraint", phonetic: "/kənˈstreɪnt/", cn: "约束；限制", example: "Budget constraints forced the team to prioritize features." },
        { en: "consumption", phonetic: "/kənˈsʌmpʃən/", cn: "消费；消耗", example: "Household consumption accounts for 60% of GDP." },
        { en: "coordinate", phonetic: "/koʊˈɔːrdɪneɪt/", cn: "协调；配合", example: "We need to coordinate with the marketing team on launch." },
        { en: "criterion", phonetic: "/kraɪˈtɪriən/", cn: "标准；准则", example: "Price remains the primary criterion for supplier selection." },
        { en: "derive", phonetic: "/dɪˈraɪv/", cn: "源自；获得", example: "Many design insights derive from user feedback." },
        { en: "diminish", phonetic: "/dɪˈmɪnɪʃ/", cn: "减少；削弱", example: "Product quality must not diminish after cost-cutting." },
        { en: "distinction", phonetic: "/dɪˈstɪŋkʃən/", cn: "区别；特征", example: "The key distinction lies in the material quality." },
        { en: "diverse", phonetic: "/daɪˈvɜːrs/", cn: "多样的；不同的", example: "A diverse product portfolio reduces business risk." },
        { en: "evaluate", phonetic: "/ɪˈvæljueɪt/", cn: "评估；评价", example: "We evaluate suppliers based on quality and lead time." },
        { en: "fluctuate", phonetic: "/ˈflʌktʃueɪt/", cn: "波动；起伏", example: "Raw material prices fluctuate significantly each quarter." },
        { en: "implement", phonetic: "/ˈɪmplɪment/", cn: "实施；执行", example: "We plan to implement the new process next month." },
        { en: "incentive", phonetic: "/ɪnˈsentɪv/", cn: "激励；动机", example: "Tax incentives encourage investment in R&D." },
        { en: "integrate", phonetic: "/ˈɪntɪɡreɪt/", cn: "整合；融合", example: "We need to integrate feedback into the next iteration." },
        { en: "negotiate", phonetic: "/nɪˈɡoʊʃieɪt/", cn: "谈判；协商", example: "The PM must negotiate timelines with engineering." },
        { en: "specification", phonetic: "/ˌspesɪfɪˈkeɪʃən/", cn: "规格；规范", example: "Product specifications must be finalized before tooling." }
      ],
      techVocabBank: [
        { en: "prototype", phonetic: "/ˈproʊtətaɪp/", cn: "原型；样机", example: "The prototype passed all initial functional tests." },
        { en: "tooling", phonetic: "/ˈtuːlɪŋ/", cn: "模具；工装", example: "Tooling costs account for 30% of the initial investment." },
        { en: "injection molding", phonetic: "/ɪnˈdʒekʃən ˈmoʊldɪŋ/", cn: "注塑成型", example: "Injection molding is ideal for high-volume plastic parts." },
        { en: "tensile strength", phonetic: "/ˈtensəl streŋθ/", cn: "抗拉强度", example: "The tensile strength of this alloy exceeds 500 MPa." },
        { en: "thermal conductivity", phonetic: "/ˈθɜːrməl kɑːndʌkˈtɪvəti/", cn: "导热性", example: "Good thermal conductivity is critical for heat sink design." },
        { en: "dissipation", phonetic: "/ˌdɪsɪˈpeɪʃən/", cn: "散热；消散", example: "Effective heat dissipation prevents device overheating." },
        { en: "torque", phonetic: "/tɔːrk/", cn: "扭矩；转矩", example: "The magnetic mount requires at least 1.5 Nm of torque." },
        { en: "calibration", phonetic: "/ˌkælɪˈbreɪʃən/", cn: "校准；标定", example: "Color calibration ensures accurate LED temperature output." },
        { en: "form factor", phonetic: "/fɔːrm ˈfæktər/", cn: "外形规格", example: "The compact form factor makes it ideal for travel use." },
        { en: "chassis", phonetic: "/ˈʃæsi/", cn: "底盘；外壳", example: "The aluminum chassis provides both durability and heat sink." },
        { en: "tolerance", phonetic: "/ˈtɑːlərəns/", cn: "公差；容差", example: "Tight machining tolerance ensures consistent part fit." },
        { en: "connector", phonetic: "/kəˈnektər/", cn: "连接器；接口", example: "USB-C connector has become the industry standard." },
        { en: "BOM", phonetic: "/biː oʊ em/", cn: "物料清单 (Bill of Materials)", example: "Optimizing the BOM reduced unit cost by 12%." },
        { en: "OEM", phonetic: "/oʊ iː em/", cn: "原始设备制造商", example: "We work with OEM partners for final assembly." },
        { en: "supplier", phonetic: "/səˈplaɪər/", cn: "供应商", example: "Qualifying a new supplier typically takes 4-6 weeks." },
        { en: "sourcing", phonetic: "/ˈsɔːrsɪŋ/", cn: "采购；寻源", example: "Global sourcing helps diversify supply chain risk." },
        { en: "logistics", phonetic: "/ləˈdʒɪstɪks/", cn: "物流", example: "Overseas logistics add 15-20 days to the lead time." },
        { en: "fulfillment", phonetic: "/fʊlˈfɪlmənt/", cn: "履约；交付执行", example: "FBA handles storage, packing, and fulfillment for sellers." },
        { en: "warehousing", phonetic: "/ˈwerhaʊzɪŋ/", cn: "仓储", example: "Overseas warehousing reduces delivery time significantly." },
        { en: "tariff", phonetic: "/ˈtærɪf/", cn: "关税", example: "Section 301 tariffs affect many Chinese exports to the US." },
        { en: "compliance", phonetic: "/kəmˈplaɪəns/", cn: "合规", example: "FCC and CE compliance are mandatory for electronics export." },
        { en: "certification", phonetic: "/ˌsɜːrtɪfɪˈkeɪʃən/", cn: "认证", example: "Qi2 certification is required for wireless charging products." },
        { en: "lead time", phonetic: "/liːd taɪm/", cn: "交付周期；前置时间", example: "Current lead time for chip components is 8-12 weeks." },
        { en: "MOQ", phonetic: "/em oʊ kjuː/", cn: "最小起订量 (Minimum Order Quantity)", example: "The factory MOQ for custom packaging is 5,000 units." },
        { en: "SKU", phonetic: "/ˌes keɪ ˈjuː/", cn: "库存单位 (Stock Keeping Unit)", example: "Each color variant requires a separate SKU." },
        { en: "PCB", phonetic: "/piː siː biː/", cn: "印刷电路板", example: "The PCB layout must account for thermal management." },
        { en: "firmware", phonetic: "/ˈfɜːrmwer/", cn: "固件", example: "A firmware update resolved the Bluetooth connectivity issue." },
        { en: "lithium battery", phonetic: "/ˈlɪθiəm ˈbætəri/", cn: "锂电池", example: "Lithium battery shipping requires UN38.3 certification." },
        { en: "iteration", phonetic: "/ˌɪtəˈreɪʃən/", cn: "迭代", example: "Each design iteration brings us closer to the target cost." },
        { en: "benchmark", phonetic: "/ˈbentʃmɑːrk/", cn: "对标；基准测试", example: "We benchmarked our product against the top competitors." }
      ],
      // 7-day rotating reading articles (hardware/trade themed)
      readingArticles: [
        {
          title: "From Prototype to Mass Production: A Hardware PM's Journey",
          en: "Bringing a hardware product from concept to market is a complex process that requires careful planning and coordination. The journey begins with a prototype—an early sample built to test the form factor and core functionality. Once the prototype is validated, the team must finalize the bill of materials (BOM) and begin sourcing components from qualified suppliers.\n\nThe next critical phase is tooling. For plastic enclosures, injection molding is the most common manufacturing method. The mold design must account for material shrinkage, tolerance requirements, and thermal management considerations. A well-designed chassis with adequate heat dissipation can significantly extend a product's lifespan.\n\nBefore mass production can begin, compliance and certification are non-negotiable. Products sold internationally must meet FCC, CE, or other regional standards. For wireless charging devices, Qi2 certification is increasingly important. Each certification adds both time and cost to the development cycle.\n\nThroughout the process, the hardware PM must coordinate between engineering, sourcing, and logistics teams. They evaluate trade-offs constantly: cost versus quality, lead time versus MOQ, performance versus power consumption. The ability to negotiate effectively with suppliers and communicate technical specifications clearly is what separates successful products from failed ones.\n\nAs one veteran PM put it: 'A great product is not just designed—it is iterated, benchmarked, and refined through countless versions until every component meets the criterion of excellence.'",
          cn: "将硬件产品从概念推向市场是一个需要精心规划和协调的复杂过程。旅程从原型机开始——一个用于测试外形规格和核心功能的早期样品。原型验证通过后，团队必须最终确定物料清单(BOM)，并开始从合格的供应商处采购零部件。\n\n下一个关键阶段是模具开发。对于塑料外壳来说，注塑成型是最常见的制造方法。模具设计必须考虑材料收缩、公差要求以及散热管理等因素。一个具备良好散热性能的外壳设计，可以大幅延长产品的使用寿命。\n\n在大规模生产开始之前，合规和认证是必不可少的。销往国际市场的产品必须满足FCC、CE或其他地区标准。对于无线充电设备来说，Qi2认证越来越重要。每项认证都会增加开发周期的时间和成本。\n\n在整个过程中，硬件产品经理必须在工程、采购和物流团队之间进行协调。他们不断评估各种权衡：成本与质量、交付周期与最小起订量、性能与功耗。能否有效地与供应商谈判、清晰地传达技术规格，是成功产品与失败产品的分水岭。\n\n正如一位资深产品经理所说：'伟大的产品不是设计出来的——它是通过无数次迭代、对标和打磨，直到每一个部件都达到卓越标准而诞生的。'"
        },
        {
          title: "Navigating Cross-Border E-Commerce for Consumer Electronics",
          en: "Selling consumer electronics across borders presents both immense opportunities and unique challenges. The global e-commerce market has seen substantial growth, with platforms like Amazon, Shopify, and AliExpress enabling brands to reach customers worldwide. However, success in cross-border trade requires more than just listing products online.\n\nLogistics is often the biggest headache. Choosing between air freight, sea freight, or express courier affects both cost and lead time. Many sellers use overseas warehousing combined with local fulfillment services such as FBA (Fulfillment by Amazon) to reduce delivery times and improve customer experience. The trade-off is higher inventory risk and warehousing costs.\n\nTariff and tax regulations add another layer of complexity. Different countries impose varying tariff rates on electronic goods, and these rates can fluctuate based on trade policies. Understanding the harmonized system (HS) codes for your products is essential for accurate customs clearance. A misclassification can result in unexpected duties or even shipment rejection.\n\nIntellectual property protection is critical. Patents, trademarks, and design rights must be secured in each target market. Counterfeit products and copycat competitors are persistent problems, especially for popular accessory categories like phone mounts, charging cables, and portable power banks.\n\nTo succeed, brands must benchmark their pricing against local competitors, adapt product packaging to regional preferences, and build a diverse sales channel strategy. The margin per SKU may be thin, but with the right sourcing strategy and supply chain management, cross-border e-commerce can be a powerful growth engine for hardware brands.",
          cn: "消费电子产品的跨境电商既充满机遇，也面临独特挑战。全球电商市场持续增长，亚马逊、Shopify、速卖通等平台使品牌能够触达全球消费者。然而，跨境电商的成功不仅仅是在线上架商品那么简单。\n\n物流往往是最让人头疼的环节。在空运、海运和快递之间做选择，直接影响成本和交付周期。许多卖家采用海外仓储配合本地履约服务（如亚马逊FBA），以缩短配送时间、改善客户体验。代价是更高的库存风险和仓储成本。\n\n关税和税务法规增加了另一层复杂性。不同国家对电子产品征收不同的关税税率，而这些税率可能因贸易政策而波动。准确了解产品的协调制度(HS)编码对于顺利完成清关至关重要，分类错误可能导致意外关税甚至货物被拒。\n\n知识产权保护至关重要。专利、商标和外观设计权必须在每个目标市场取得。假冒产品和仿冒竞争对手是持续存在的问题，尤其是在手机支架、充电线、便携充电宝等热门配件品类。\n\n要想成功，品牌必须以竞争对手的定价为基准，根据区域偏好调整产品包装，并建立多元化的销售渠道策略。虽然每个SKU的利润率可能很薄，但通过正确的采购策略和供应链管理，跨境电商可以成为硬件品牌强大的增长引擎。"
        },
        {
          title: "The Art of Supplier Sourcing and Negotiation",
          en: "Supplier sourcing is one of the most critical skills for a hardware PM. Finding the right manufacturing partner can determine whether a product ships on time, meets quality standards, and stays within budget. The process requires methodical evaluation, not just the lowest quote.\n\nA comprehensive supplier assessment examines multiple dimensions: production capacity, quality control systems, previous client references, and financial stability. Visiting the factory in person reveals details that video calls cannot—the cleanliness of the production floor, the calibration status of equipment, and the working conditions that affect output consistency.\n\nNegotiation is not about squeezing the supplier for the lowest price. Effective negotiation creates a mutually beneficial relationship. Key points to negotiate include the MOQ, payment terms, lead time commitments, and warranty provisions. A good PM knows when to compromise on price and when to insist on quality specifications.\n\nComponent sourcing requires understanding the BOM at a granular level. Each item on the bill of materials has alternatives. A connector from supplier A versus supplier B might save 0.02 per unit but introduce compatibility risks. These micro-decisions accumulate across thousands of units and can make or break the product margin.\n\nThe most successful PMs build long-term partnerships rather than transactional relationships. They share forecast data, collaborate on cost-reduction initiatives, and treat suppliers as an extension of their own team. In the fast-paced world of consumer electronics, a trusted supplier network is a competitive advantage that cannot be easily replicated.",
          cn: "供应商寻源是硬件产品经理最关键的能力之一。找到合适的制造合作伙伴，决定着产品能否按时出货、达到质量标准、控制在预算之内。这个过程需要系统性的评估，而不仅仅是选择最低报价。\n\n全面的供应商评估考察多个维度：产能、质量控制体系、过往客户评价和财务稳定性。亲自拜访工厂能发现视频会议无法呈现的细节——生产车间的清洁程度、设备的校准状态，以及影响产出一致性的工作条件。\n\n谈判不是一味压价。有效的谈判创造互利共赢的关系。需要谈判的关键点包括最小起订量、付款条件、交付周期承诺和质保条款。优秀的产品经理知道什么时候在价格上妥协，什么时候在质量规格上坚持。\n\n零部件采购需要从细粒度层面理解物料清单(BOM)。BOM上的每一项都有替代方案。供应商A和供应商B的连接器可能每只相差2分钱，但引入兼容性风险。这些微观决策在数千件产品中累积起来，可能决定产品利润的成败。\n\n最成功的产品经理建立的是长期合作伙伴关系，而非一次性交易。他们分享预测数据、协作推进降本方案、将供应商视为团队的延伸。在快节奏的消费电子领域，可靠的供应商网络是一种难以复制的竞争优势。"
        },
        {
          title: "Quality Control and Certification for Global Markets",
          en: "Quality is not inspected into a product—it is designed in. This principle guides every stage of hardware development, from component selection to final assembly. For products shipping to global markets, robust quality control and certification processes are essential to avoid costly returns, regulatory penalties, and brand damage.\n\nThe quality journey begins with design review. Engineers evaluate the tolerance stack-up of mechanical parts, the thermal dissipation performance of the enclosure, and the reliability of connectors under repeated use. Simulation tools can predict failure modes, but nothing replaces physical testing with actual prototypes.\n\nDuring production, a multi-stage inspection process catches defects early. Incoming quality control (IQC) verifies components from suppliers. In-process quality control (IPQC) monitors production at critical checkpoints. Final quality control (OQC) ensures the finished product meets specifications before packaging. For electronics, functional testing of each PCB, battery safety checks, and drop tests for mechanical durability are standard procedures.\n\nCertification is the gatekeeper to international markets. FCC for the US, CE for Europe, CCC for China—each requires specific lab testing and documentation. For products with lithium batteries, UN38.3 certification for safe transport is mandatory. The Qi2 wireless charging standard adds another layer of compliance testing. A smart PM plans certification timelines early, as testing and documentation can take 4-8 weeks.\n\nPost-market surveillance completes the quality loop. Monitoring customer returns, analyzing failure patterns, and feeding insights back into the design process turns quality from a checkpoint into a continuous improvement cycle. In the end, compliance is not just about paperwork—it is about earning customer trust, one product at a time.",
          cn: "质量不是检验出来的——是设计出来的。这一原则指导着硬件开发的每个阶段，从零部件选择到最终组装。对于销往全球市场的产品，健全的质量控制和认证流程对于避免高昂的退货、监管处罚和品牌损伤至关重要。\n\n质量旅程从设计评审开始。工程师评估机械部件的公差累积、外壳的散热性能、连接器在反复使用下的可靠性。仿真工具可以预测故障模式，但没有什么能替代用真实原型进行的物理测试。\n\n在生产过程中，多阶段检验流程能够在早期拦截缺陷。来料质量控制(IQC)验证供应商的零部件。过程质量控制(IPQC)在关键节点监控生产。最终质量控制(OQC)确保成品在包装前符合规格。对于电子产品，PCB功能测试、电池安全检查和机械耐用性跌落测试是标准流程。\n\n认证是通向国际市场的守门人。美国的FCC、欧洲的CE、中国的CCC——每一项都需要特定的实验室测试和文档。对于含锂电池的产品，UN38.3安全运输认证是强制性的。Qi2无线充电标准又增加了一层合规测试。聪明的产品经理会提前规划认证时间线，因为测试和文档处理可能需要4-8周。\n\n上市后监管构成了质量闭环的最后一环。监控客户退货、分析故障模式、将洞察反馈给设计流程，将质量从一个检查点转变为持续改进的循环。归根结底，合规不仅关乎文书——更关乎赢得客户信任，一件产品一件产品地积累。"
        },
        {
          title: "Understanding BOM Cost and Pricing Strategy",
          en: "The Bill of Materials (BOM) is the foundation of hardware product economics. It lists every component, from the PCB and connectors to the packaging and user manual. Understanding and optimizing the BOM is perhaps the most impactful skill a hardware PM can develop.\n\nA typical consumer electronics BOM breaks down into several categories: electronic components (chips, sensors, PCB), mechanical parts (chassis, brackets, screws), battery and power systems, packaging and accessories, and assembly labor. Each category has its own cost drivers and optimization levers. Electronic components, for example, often benefit from volume discounts, while mechanical parts are heavily influenced by tooling amortization and material selection.\n\nPricing strategy must account for far more than just the BOM cost. The total landed cost includes shipping, tariffs, warehousing, and fulfillment fees. Platform commissions (typically 8-15% on e-commerce marketplaces), marketing spend, and return allowances must all be factored into the retail price. A common rule of thumb: the retail price should be at least 3-4x the BOM cost to sustain a healthy business.\n\nCost engineering involves creative problem-solving. Could an alternative material reduce the injection molding cycle time? Could a combined connector module eliminate two separate components? Could firmware optimization reduce the need for a more expensive microcontroller? These questions drive iterative cost reduction without compromising quality.\n\nThe best PMs treat the BOM as a living document. They benchmark every line item against industry standards, negotiate with suppliers quarterly, and continuously evaluate alternative sourcing options. A 0.10 saving on a connector, multiplied by 100,000 units, becomes 10,000 in additional margin—enough to fund the next product iteration.",
          cn: "物料清单(BOM)是硬件产品经济性的基础。它列出每一个组件，从PCB和连接器到包装和用户手册。理解和优化BOM可能是硬件产品经理能够培养的最有影响力的技能。\n\n典型的消费电子BOM分为几个类别：电子元器件（芯片、传感器、PCB）、机械部件（外壳、支架、螺丝）、电池和电源系统、包装和配件，以及组装人工。每个类别都有各自的成本驱动因素和优化杠杆。例如，电子元器件通常受益于批量折扣，而机械部件则深受模具摊销和材料选择的影响。\n\n定价策略必须考虑远不止BOM成本这么简单。总落地成本包括运输、关税、仓储和履约费用。平台佣金（电商平台通常为8-15%）、营销支出和退货预留都必须计入零售价中。一个常用的经验法则：零售价应该是BOM成本的至少3-4倍，才能支撑健康的业务。\n\n成本工程涉及创造性的问题解决。替代材料能否缩短注塑成型周期？组合式连接器模块能否省掉两个独立组件？固件优化能否降低对更昂贵微控制器的需求？这些问题驱动着在不牺牲质量前提下的迭代降本。\n\n最优秀的产品经理将BOM视为一份活的文档。他们以行业标准为基准对标每一个明细项，每季度与供应商谈判，持续评估替代采购方案。一个连接器节省1毛钱，乘以10万件，就是1万元的额外利润——足以资助下一代产品的迭代开发。"
        },
        {
          title: "Wireless Charging and the Qi2 Revolution",
          en: "The wireless charging landscape is undergoing a significant transformation with the introduction of the Qi2 standard. Built on Apple's MagSafe technology and adopted by the Wireless Power Consortium (WPC), Qi2 promises better alignment, improved efficiency, and a more consistent user experience across devices.\n\nAt its core, Qi2 introduces a magnetic alignment system that ensures the charging coil in the phone precisely aligns with the coil in the charger. This magnetic connection eliminates the common frustration of misaligned placement—a phone placed slightly off-center causing slow charging or no charging at all. The enhanced alignment also improves energy transfer efficiency, reducing power waste and heat generation.\n\nFor hardware PMs working in the accessories space, Qi2 opens new opportunities and challenges. Products must now integrate magnetic rings and meet stricter thermal management requirements. The BOM for a Qi2 charger includes additional components: magnets, shielding materials, and potentially more sophisticated microcontrollers to handle the communication protocol. These additions increase the unit cost but also justify a premium retail price.\n\nCertification is the critical gate. Qi2 certification requires passing a comprehensive suite of tests covering safety, interoperability, and performance. The process involves working with WPC-authorized test labs and can take several months. Planning certification timelines early in the product development cycle is essential to avoid launch delays.\n\nAs the ecosystem grows, we can expect to see Qi2 expand beyond smartphones into wearables, earbuds, and even kitchen appliances. The convergence of magnetic attachment and wireless power creates a platform for modular accessories—imagine a portable battery that snaps onto the back of a phone, or a car mount that charges while holding the device securely. For the imaginative hardware PM, Qi2 is not just a standard; it is a design language for the next generation of consumer electronics.",
          cn: "随着Qi2标准的推出，无线充电领域正在经历重大变革。Qi2建立在苹果MagSafe技术之上，由无线充电联盟(WPC)采纳，承诺更好的磁吸对齐、更高的效率和跨设备更一致的用户体验。\n\nQi2的核心是引入磁吸对齐系统，确保手机中的充电线圈与充电器中的线圈精确对齐。这种磁吸连接消除了对齐不准的常见困扰——手机放偏一点就导致充电慢或根本不充电。增强的对齐方式还提升了能量传输效率，减少了功率浪费和热量产生。\n\n对于配件领域的硬件产品经理来说，Qi2开辟了新的机遇和挑战。产品现在必须集成磁环，并满足更严格的热管理要求。Qi2充电器的BOM包含额外的组件：磁铁、屏蔽材料，以及可能需要更复杂的微控制器来处理通信协议。这些增加提高了单位成本，但也为溢价零售价提供了合理性。\n\n认证是关键门槛。Qi2认证需要通过一整套涵盖安全、互操作性和性能的全面测试。这个过程需要与WPC授权的测试实验室合作，可能需要几个月。在产品开发周期早期规划认证时间线，对于避免上市延迟至关重要。\n\n随着生态系统的发展，我们可以预期Qi2将从智能手机扩展到可穿戴设备、耳机，甚至厨房电器。磁吸连接与无线充电的融合创造了一个模块化配件的平台——想象一下可以吸附在手机背面的便携电池，或者在牢固固定设备的同时为其充电的车载支架。对于有想象力的硬件产品经理来说，Qi2不仅是标准，更是下一代消费电子产品的设计语言。"
        },
        {
          title: "Product Design: Balancing Form Factor and Performance",
          en: "Every hardware product represents a carefully negotiated compromise between form factor and performance. The sleek, lightweight devices consumers love demand engineering ingenuity that balances thermal dissipation, structural integrity, and battery life within a compact chassis.\n\nThermal management is often the hardest constraint. As components shrink and power density increases, heat dissipation becomes a design challenge that ripples through every decision. The choice of enclosure material directly affects thermal conductivity—aluminum dissipates heat effectively but adds weight and cost; plastic requires additional thermal solutions like graphite sheets or heat spreaders. Ventilation design, component placement, and even the thickness of the PCB copper layer all contribute to the thermal equation.\n\nBattery capacity imposes another fundamental trade-off. Users demand all-day battery life, but lithium batteries are bulky and heavy. The form factor must accommodate the battery while leaving room for the PCB, connectors, speakers, cameras, and—for accessories—mounting mechanisms like magnetic rings or clamps. Every millimeter of thickness saved requires careful integration.\n\nStructural integrity cannot be sacrificed. A product that feels fragile or breaks during normal use will generate returns that destroy margins. Drop tests, bend tests, and connector pull-force tests are standard validation procedures. The tolerance specifications for mating parts determine how securely components fit together and how consistently products perform across manufacturing batches.\n\nThe art of hardware design lies in finding the sweet spot where form meets function without exceeding the target BOM cost. It requires anticipating how design choices made today will affect tooling decisions weeks later, and certification timelines months after that. The best products feel inevitable in retrospect—every curve, every port placement, every material choice seems to have no alternative. But behind that inevitability lies months of iteration, benchmarking, and difficult trade-offs that only the product team fully understands.",
          cn: "每一款硬件产品都代表了外形规格与性能之间精心磋商的妥协。消费者喜爱的轻薄设备，需要工程智慧来平衡散热、结构强度和电池续航，并将它们容纳在紧凑的外壳之中。\n\n散热管理往往是最难的约束。随着组件不断缩小、功率密度不断增加，散热成为一个贯穿每个设计决策的挑战。外壳材料的选择直接影响导热性——铝材散热效果好但增加重量和成本；塑料需要额外的散热方案，如石墨片或散热片。通风设计、组件布局，甚至PCB铜层厚度，都参与散热方程的计算。\n\n电池容量带来另一个基本取舍。用户要求全天续航，但锂电池体积大、重量重。外形规格必须容纳电池，同时为PCB、连接器、扬声器、摄像头以及——对于配件来说——磁环或夹具等安装机构留出空间。每节省一毫米的厚度都需要精心的集成。\n\n结构强度不能妥协。一个在使用过程中感觉脆弱或容易损坏的产品，会产生大量退货，从而侵蚀利润。跌落测试、弯曲测试和连接器拔力测试是标准的验证流程。配合部件的公差规格决定了组件之间的配合紧密度，以及产品在制造批次之间性能的一致性。\n\n硬件设计的艺术在于找到形态与功能的最佳结合点，同时不超过目标BOM成本。这需要预见到今天的每个设计选择将如何影响几周后的模具决策，以及几个月后的认证时间线。最好的产品在事后看起来是必然的——每个弧度、每个接口位置、每个材料选择都像是没有其他选择。但在这必然性背后，是只有产品团队才完全理解的数月迭代、反复对标和艰难的取舍。"
        }
      ]
    }
  }
};

// ===== Lock Screen UI =====
function renderLockNumpad() {
  var pad = document.getElementById("lock-numpad");
  if (!pad) return;
  var keys = ["1","2","3","4","5","6","7","8","9","","0","del"];
  pad.innerHTML = keys.map(function(k) {
    if (k === "") return '<div class="numpad-key empty"></div>';
    if (k === "del") return '<div class="numpad-key del" onclick="numpadInput(\'del\')">⌫</div>';
    return '<div class="numpad-key" onclick="numpadInput(\'' + k + '\')">' + k + '</div>';
  }).join("");
}

function updatePinDots() {
  var dots = document.querySelectorAll("#lock-pin-dots .pin-dot");
  dots.forEach(function(dot, i) {
    if (i < PrivacyManager._pinBuffer.length) { dot.classList.add("filled"); }
    else { dot.classList.remove("filled", "error"); }
  });
}

async function numpadInput(key) {
  if (key === "del") {
    PrivacyManager._pinBuffer = PrivacyManager._pinBuffer.slice(0, -1);
    updatePinDots();
    return;
  }

  PrivacyManager._pinBuffer += key;
  updatePinDots();

  if (PrivacyManager._pinBuffer.length === 4) {
    var valid = await PrivacyManager.verifyPin(PrivacyManager._pinBuffer);
    if (valid) {
      await PrivacyManager.unlock();
      initApp();
    } else {
      // shake animation
      document.querySelectorAll("#lock-pin-dots .pin-dot").forEach(function(d) { d.classList.add("error"); });
      document.getElementById("lock-message").textContent = "密码错误，请重试";
      document.getElementById("lock-message").classList.add("error");
      PrivacyManager._pinBuffer = "";
      setTimeout(function() {
        updatePinDots();
        document.getElementById("lock-message").textContent = "请输入解锁密码";
        document.getElementById("lock-message").classList.remove("error");
      }, 800);
    }
  }
}

async function showSetPinModal() {
  var pin1 = "";
  var pin2 = "";
  var step = 1;

  showModal(
    '<div class="modal-title">🔒 设置应用锁密码</div>' +
    '<div class="lock-pin-dots" id="set-pin-dots"><div class="pin-dot"></div><div class="pin-dot"></div><div class="pin-dot"></div><div class="pin-dot"></div></div>' +
    '<div class="lock-message" id="set-pin-msg">请输入4位数字密码</div>' +
    '<div class="lock-numpad" id="set-pin-pad"></div>' +
    '<div class="btn-row" style="margin-top:12px"><button class="btn btn-secondary" id="set-pin-cancel" onclick="closeModal()">取消</button></div>'
  );

  var pad = document.getElementById("set-pin-pad");
  var keys = ["1","2","3","4","5","6","7","8","9","","0","del"];
  pad.innerHTML = keys.map(function(k) {
    if (k === "") return '<div class="numpad-key empty"></div>';
    if (k === "del") return '<div class="numpad-key del">⌫</div>';
    return '<div class="numpad-key">' + k + '</div>';
  }).join("");

  var dots = document.querySelectorAll("#set-pin-dots .pin-dot");

  pad.querySelectorAll(".numpad-key:not(.empty)").forEach(function(btn) {
    btn.addEventListener("click", function() {
      if (btn.classList.contains("del")) {
        if (step === 1) { pin1 = pin1.slice(0, -1); } else { pin2 = pin2.slice(0, -1); }
      } else {
        if (step === 1) {
          pin1 += btn.textContent.trim();
          if (pin1.length === 4) {
            updateSetPinDots(pin1);
            setTimeout(function() {
              step = 2; pin2 = "";
              updateSetPinDots("");
              document.getElementById("set-pin-msg").textContent = "请再次输入确认密码";
            }, 300);
            return;
          }
        } else {
          pin2 += btn.textContent.trim();
          if (pin2.length === 4) {
            updateSetPinDots(pin2);
            setTimeout(async function() {
              if (pin1 === pin2) {
                await PrivacyManager.setPin(pin1);
                closeModal();
                document.getElementById("app").classList.remove("hidden");
                await init();
                showToast("应用锁已设置", "success");
              } else {
                document.getElementById("set-pin-msg").textContent = "两次密码不一致，请重试";
                step = 1; pin1 = ""; pin2 = "";
                updateSetPinDots("");
              }
            }, 200);
            return;
          }
        }
      }
      updateSetPinDots(step === 1 ? pin1 : pin2);
    });
  });

  function updateSetPinDots(pin) {
    dots.forEach(function(dot, i) {
      if (i < pin.length) { dot.classList.add("filled"); }
      else { dot.classList.remove("filled", "error"); }
    });
  }
}

// ===== Privacy Acceptance =====
async function acceptPrivacy() {
  PrivacyManager.acceptPrivacy();
  var enableLock = document.getElementById("privacy-enable-lock");
  if (enableLock && enableLock.checked) {
    document.getElementById("privacy-notice").classList.add("hidden");
    setTimeout(function() { showSetPinModal(); }, 400);
  } else {
    PrivacyManager._isLocked = false;
    document.getElementById("privacy-notice").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
    localStorage.setItem(PrivacyManager.LOCK_ENABLED_KEY, "false");
    await init();
  }
}

// ===== SW Update Handler =====
function applyUpdate() {
  SWManager.applyUpdate();
}

// ===== Activity Tracking (for auto-lock) =====
function trackActivity() {
  PrivacyManager.resetActivityTimer();
}

// ===== Utilities =====
function today(offset) { offset = offset || 0; const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); }
function addDays(dateStr, n) { var d = new Date(dateStr + "T00:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function greeting() {
  const h = new Date().getHours();
  if (h < 6) return "夜深了"; if (h < 9) return "早上好"; if (h < 12) return "上午好";
  if (h < 14) return "中午好"; if (h < 18) return "下午好"; if (h < 22) return "晚上好"; return "夜深了";
}
function formatDate(dateStr) {
  const d = new Date(dateStr);
  const dayNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return d.getMonth() + 1 + "月" + d.getDate() + "日 " + dayNames[d.getDay()];
}
function formatDateShort(dateStr) {
  const d = new Date(dateStr); const now = new Date();
  const diff = Math.floor((now - d) / 86400000);
  if (diff === 0) return "今天"; if (diff === 1) return "昨天";
  if (diff < 7) return diff + "天前"; return (d.getMonth() + 1) + "/" + d.getDate();
}

function formatCount(num) {
  if (!num || num === 0) return "0";
  if (num >= 10000) return (num / 10000).toFixed(1) + "万";
  if (num >= 1000) return (num / 1000).toFixed(1) + "k";
  return String(num);
}


function formatDateTime(iso) {
  const d = new Date(iso);
  return (d.getMonth() + 1) + "/" + d.getDate() + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}
function escapeHtml(str) {
  if (!str) return ""; const div = document.createElement("div"); div.textContent = str; return div.innerHTML;
}
function statusBadge(status) {
  const map = { "概念阶段": "badge-gray", "设计阶段": "badge-purple", "研发中": "badge-blue", "开模中": "badge-teal", "测试中": "badge-orange", "生产中": "badge-green", "已上市": "badge-green" };
  return '<span class="badge ' + (map[status] || "badge-gray") + '">' + escapeHtml(status) + '</span>';
}
function stageBadge(stage) {
  const map = { concept: { label: "概念", cls: "stage-concept" }, evt: { label: "EVT", cls: "stage-evt" }, dvt: { label: "DVT", cls: "stage-dvt" }, pvt: { label: "PVT", cls: "stage-pvt" }, mp: { label: "MP", cls: "stage-mp" } };
  const s = map[stage] || map.concept;
  return '<span class="product-stage-badge ' + s.cls + '">' + s.label + '</span>';
}
function stageLabel(stage) {
  const map = { concept: "概念", evt: "EVT工程验证", dvt: "DVT设计验证", pvt: "PVT生产验证", mp: "MP量产" };
  return map[stage] || "概念";
}

// ===== DB =====
const DB = {
  KEY: "hw_pm_workbench_v2",
  data: null,
  unsavedChanges: 0,

  init() {
    // 登录态：以本地缓存(DB.KEY)+离线草稿为兜底种子，云端仍为事实源（syncNow 后再以云端合并）
    if (typeof SyncManager !== "undefined" && SyncManager.isAuthed && SyncManager.isAuthed()) {
      var base = JSON.parse(JSON.stringify(SEED_DATA));
      this.data = base;
      try {
        var cache = localStorage.getItem(this.KEY);
        if (cache) { this.data = deepMerge(JSON.parse(JSON.stringify(SEED_DATA)), JSON.parse(cache)); }
      } catch (e) {}
      try {
        var draft = localStorage.getItem("hw_pm_offline_draft");
        if (draft) { this.data = deepMerge(this.data, JSON.parse(draft)); }
      } catch (e) {}
      return;
    }
    const saved = localStorage.getItem(this.KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        this.data = deepMerge(JSON.parse(JSON.stringify(SEED_DATA)), parsed);
      } catch (e) {
        this.data = JSON.parse(JSON.stringify(SEED_DATA));
      }
    } else {
      this.data = JSON.parse(JSON.stringify(SEED_DATA));
    }
  },
  save() {
    this.data.meta.lastUpdated = new Date().toISOString();
    this.unsavedChanges++;
    // IndexedDB 最新缓存（防 localStorage 被浏览器清理；每次改动同步写，重开秒回）
    try { ImageDB.saveLatest(this.data); } catch (e) {}
    // 云端为主：登录态也写本地缓存作兜底（关闭/断网/云端瞬时失败时重开不丢），再防抖推送云端
    if (typeof SyncManager !== "undefined" && SyncManager.isAuthed && SyncManager.isAuthed()) {
      try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) {}
      if (navigator.onLine) {
        try { localStorage.removeItem("hw_pm_offline_draft"); } catch (e) {}
      } else {
        try { localStorage.setItem("hw_pm_offline_draft", JSON.stringify(this.data)); } catch (e) {}
      }
      try { SyncManager.schedulePush(); } catch (e) {}
    } else {
      // 未登录兜底：理论上被登录门拦截，此处仍写本地避免静默丢失
      localStorage.setItem(this.KEY, JSON.stringify(this.data));
    }
    if (typeof WebDAVSync !== "undefined") WebDAVSync.schedulePush();
  },
  async saveWithBackup() {
    this.data.meta.lastUpdated = new Date().toISOString();
    this.unsavedChanges = 0;
    // 登录态直接推云端；未登录兜底写本地
    if (typeof SyncManager !== "undefined" && SyncManager.isAuthed && SyncManager.isAuthed()) {
      try { await SyncManager.forcePush(); } catch (e) {}
    } else {
      localStorage.setItem(this.KEY, JSON.stringify(this.data));
    }
  },
  reset() {
    this.data = JSON.parse(JSON.stringify(SEED_DATA));
    this.save();
  },
  export() {
    return JSON.stringify(this.data, null, 2);
  },
  import(json) {
    this.data = JSON.parse(json);
    this.save();
  },
  logActivity(type, text) {
    this.data.activity.unshift({ id: uid(), type: type, text: text, date: today() });
    if (this.data.activity.length > 50) this.data.activity.pop();
    this.save();
  }
};

function deepMerge(target, source) {
  for (const key in source) {
    if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key]) && target[key] && typeof target[key] === "object") {
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

// ===== Toast =====
function showToast(msg, type) {
  type = type || "";
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();
  const t = document.createElement("div");
  t.className = "toast " + type;
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 400); }, 2000);
}

// ===== State =====
let currentRoute = "home";
let currentFilter = "all";
let industrySub = "news"; // "news"(自动资讯) | "mine"(我的情报)
let currentZone = "work"; // 已废弃：不再分区，保留以兼容旧引用
var navStack = []; // 导航历史栈，用于「右滑 / 返回」回上一级
let pendingImages = [];
let pendingImageIds = [];
let editingItemId = null;
let editingType = null;
let preResetData = null; // for undo reset
let undoResetTimer = null;
let growthCurrentTab = ""; // sub-tab within growth modules

// ===== Router =====
function navigate(route, opts) {
  opts = opts || {};
  trackActivity();
  if (!opts.replace && route !== currentRoute) {
    navStack.push(currentRoute);
    if (navStack.length > 60) navStack.shift();
  }
  currentRoute = route;
  currentFilter = "all";
  editingItemId = null;
  editingType = null;
  clearPendingImages();
  if (route === "reviews") markReviewSeen();
  render();
  var ac = document.getElementById("app-content");
  if (ac) ac.scrollTop = 0;
}

// 子页签视图注册表：记录每个路由的「默认子视图」与读写器。
var SUBVIEW_REGISTRY = {
  insights:    { def: "list",  get: function () { return window.__insightsView; },            set: function (v) { window.__insightsView = v; } },
  industry:    { def: "news",  get: function () { return industrySub; },                      set: function (v) { industrySub = v; } },
  competitors: { def: "list",  get: function () { return window.__competitorSub; },           set: function (v) { window.__competitorSub = v; } },
  videos:      { def: "list",  get: function () { return window.__videosView; },              set: function (v) { window.__videosView = v; } },
  rsync:       { def: "home",  get: function () { return (typeof AudioSync !== "undefined" && AudioSync.getSub) ? AudioSync.getSub() : "home"; },
                           set: function (v) { if (typeof AudioSync !== "undefined" && AudioSync.setSub) AudioSync.setSub(v); } }
};

// 微信式视图栈：路由与子页签切换都压入 navStack（子页签为 {type:"sub",route,sub} 对象），
// 返回恰好回退一层并恢复上一层视图（含子页签原样），绝不跨级跳回。
function setSubView(route, sub) {
  var reg = SUBVIEW_REGISTRY[route];
  if (!reg) return;
  var cur = reg.get() || reg.def;
  if (cur === sub) { render(); return; }
  navStack.push({ type: "sub", route: route, sub: cur });
  if (navStack.length > 60) navStack.shift();
  reg.set(sub);
  render();
}

// 右滑 / 返回按钮（微信式）：关弹窗 → 回退最近一层（子页签恢复原样 / 路由回上一页）→ 回首页
function goBack() {
  var overlay = document.getElementById("modal-overlay");
  if (overlay && overlay.classList.contains("active")) { closeModal(); return; }
  if (navStack.length > 0) {
    var prev = navStack.pop();
    if (prev && typeof prev === "object" && prev.type === "sub") {
      var reg = SUBVIEW_REGISTRY[prev.route];
      if (reg) reg.set(prev.sub);
      render();
    } else {
      navigate(prev, { replace: true });
    }
  } else if (currentRoute !== "home") {
    navigate("home", { replace: true });
  }
}

function setFilter(f) { currentFilter = f; render(); }

// ===== Render =====
function render() {
  renderZoneTabs();
  renderHeader();
  switch (currentRoute) {
    case "home": renderHome(); break;
    case "workbench": renderWorkbench(); break;
    case "products": renderProducts(); break;
    case "industry": renderIndustry(); break;
    case "brief": renderBrief(); break;
    case "competitors": renderCompetitors(); break;
    case "insights": renderInsights(); break;
    case "ideas": renderIdeas(); break;
    case "planning": renderPlanning(); break;
    case "settings": renderSettings(); break;
    case "videos": renderVideos(); break;
    case "reviews": renderReviews(); break;
    case "invest": renderInvest(); break;
    case "aihot": renderAihot(); break;
    case "learn": renderLearn(); break;
    case "english": case "language": renderLanguage(); break;
    case "outfit": renderOutfit(); break;
    case "fridge": renderFridge(); break;
    case "recipes": renderRecipes(); break;
    case "diet": renderDiet(); break;
    case "fitness": renderFitness(); break;
    case "checkin": renderCheckin(); break;
    case "growth": renderGrowthHome(); break;
    case "reading": renderReading(); break;
    case "rsync": renderReadingSync(); break;
    case "xhsfav": renderXhsFav(); break;
    default: renderHome(); break;
  }
  renderNav();
}

// ===== Header =====
function renderHeader() {
  var h = document.getElementById("app-header");
  var titles = {
    home: ["首页", "产品经理工作台"],
    workbench: ["今日任务", "今日待办与复盘记录"],
    products: ["产品看板", DB.data.products.length + "条产品线"],
    industry: ["行业情报", "市场动态与趋势"],
    competitors: ["竞品研判", DB.data.competitors.length + "个竞品追踪"],
    insights: ["需求洞察", "用户痛点与市场机会"],
    ideas: ["想法库", DB.data.ideas.length + "个想法"],
    planning: ["产品规划", "路线图与里程碑"],
    settings: ["设置", "数据与主题管理"],
    videos: ["爆款视频拆解", "从内容创作到产品机会"],
    brief: ["每日简报", "资讯 · 物品 · 待办 · 复盘 · 学习"],
    reviews: ["每日复盘", "工作进度与次日计划"],
    invest: ["投资理财", "资产分布 · 盈亏记录 · 行情看板"],
    language: ["语言学习", "英/日/韩 · 八大模块"],
    outfit: ["穿搭管理", "衣橱 · 搭配 · 日程 · 复盘"],
    fridge: ["物品管理", "分类库存 · 到期预警 · 护肤 · 家人"],
    recipes: ["菜谱", "菜谱库 · 一周食谱 · 我的收藏"],
    diet: ["饮食打卡", "每日五餐 · 营养统计 · 放纵餐"],
    fitness: ["健身", "运动 · 体重 · 饮食 · 训练 · 体态"],
    checkin: ["每日打卡", "英语 · 饮食 · 运动 · 阶段奖励"],
    growth: ["个人成长", "投资理财 · 健身 · 语言学习 · 阅读"],
    aihot: ["AI 资讯", "AIHOT 每日简报 · 精选 · 热点"],
    learn: ["知识学习", "AI 小知识 · 金融小知识 · 卡片速学"],
    xhsfav: ["收藏知识库", "小红书收藏 · 分类汇总 · 关键词检索"],
    reading: ["阅读", "书 / 电子书 / 播客 / 演讲 + AI 探讨"],
    rsync: ["百度网盘", "百度网盘音频 · 自动连播"],
  };
  var t = titles[currentRoute] || ["", ""];
  var canBack = (navStack.length > 0) || currentRoute !== "home";
  h.innerHTML = '<div class="page-header">' +
    '<button class="icon-btn' + (canBack ? "" : " hidden") + '" onclick="goBack()">←</button>' +
    '<div><h2>' + t[0] + '</h2><div class="subtitle">' + t[1] + '</div></div></div>';
}

// ===== Zone Tabs（已废弃：不再分区，保留空壳避免引用报错）=====
function renderZoneTabs() {
  var tabs = document.getElementById("zone-tabs");
  if (tabs) { tabs.classList.add("hidden"); tabs.innerHTML = ""; }
}

// ===== Home =====
// 首页日期条：日期 + 星期 + 节日提醒
var FESTIVALS = {
  "01-01": "元旦", "02-14": "情人节", "03-08": "妇女节", "03-12": "植树节",
  "04-05": "清明节", "05-01": "劳动节", "05-04": "青年节", "05-10": "母亲节",
  "06-01": "儿童节", "06-19": "端午节", "06-21": "父亲节", "07-01": "建党节",
  "08-01": "建军节", "08-19": "七夕节", "08-27": "中元节", "09-03": "抗战胜利日",
  "09-10": "教师节", "09-25": "中秋节", "10-01": "国庆节", "10-19": "重阳节",
  "10-31": "万圣节", "11-11": "双十一", "12-22": "冬至", "12-24": "平安夜",
  "12-25": "圣诞节", "02-17": "春节", "03-03": "元宵节", "03-19": "龙抬头",
  "01-01-next": "元旦"
};
var FESTIVAL_NOTE = {
  "元旦": "新的一年，制定理财目标的好时机 🎯",
  "春节": "辞旧迎新，记得盘点年度资产与收益 🧧",
  "元宵节": "元宵团圆，顺手记一笔本月开销 🏮",
  "情人节": "宠爱自己，也别忘了控制预算 💝",
  "妇女节": "致敬每一位认真生活的她 🌷",
  "植树节": "种下财富的小树，定投正当时 🌱",
  "清明节": "慎终追远，也是整理家庭财务的节点 🍃",
  "劳动节": "劳动创造价值，也别忘了让钱生钱 💪",
  "青年节": "年轻就是复利，越早开始越划算 ⚡",
  "母亲节": "感恩母亲，给她一份安心保障 🌸",
  "儿童节": "保持童心，理财也可以很有趣 🎈",
  "端午节": "端午安康，粽享好收益 🍙",
  "父亲节": "父爱如山，给他配置稳健资产 🛡️",
  "建军节": "致敬最可爱的人 🎖️",
  "七夕节": "牛郎织女，也谈谈家庭的「共同账户」 💞",
  "中元节": "缅怀先人，传承良好家风与财富观 🕯️",
  "抗战胜利日": "铭记历史，珍惜和平岁月 🕊️",
  "教师节": "感恩师者，知识是最好的投资 📚",
  "中秋节": "花好月圆，盘点三季度收益 🥮",
  "国庆节": "举国同庆，长假也是复盘良机 🇨🇳",
  "重阳节": "登高敬老，备好养老与保障规划 🍂",
  "万圣节": "不给糖就捣蛋，别让通胀偷走购买力 🎃",
  "双十一": "理性消费，先清购物车再下单 🛒",
  "冬至": "冬至阳生，正是定投播种时 ❄️",
  "平安夜": "平安喜乐，资产也要稳健平安 🔔",
  "圣诞节": "圣诞快乐，给明年做个储蓄计划 🎄"
};
function pad2(n) { return (n < 10 ? "0" : "") + n; }
function weekdayCn(d) { return "日一二三四五六".charAt(d.getDay()); }
function homeDateHtml() {
  var d = new Date();
  var y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
  var iso = y + "-" + pad2(m) + "-" + pad2(day);
  var key = pad2(m) + "-" + pad2(day);
  var fes = FESTIVALS[key];
  // 母亲节/父亲节等相对节日用当年动态计算兜底（简版：仅用固定表）
  var lunarNote = "";
  var main =
    '<div class="hd-main">' +
      '<span class="hd-date">' + m + '月' + day + '日</span>' +
      '<span class="hd-week">星期' + weekdayCn(d) + '</span>' +
      (fes ? '<span class="hd-festival">🎉 ' + fes + '</span>' : '') +
    '</div>';
  var sub = '<div class="hd-sub">' + y + '年' + (fes ? ' · ' + (FESTIVAL_NOTE[fes] || fes + '快乐') : ' · 今天也要好好打理资产') + '</div>';
  return '<div class="home-datebar' + (fes ? ' is-festival' : '') + '" onclick="navigate(\'invest\')">' + main + sub + '</div>';
}

// 首页天气卡：读取穿搭模块的天气缓存（手机定位天气），放在首页顶部
function homeWeatherHtml() {
  var g = (DB.data && DB.data.growth) || {};
  var o = g.outfit || {};
  var w = o.weatherCache;
  if (w && w.temp != null) {
    var cond = w.condition || "—";
    var loc = (o.useGeo && o.geoLabel) ? o.geoLabel : (o.city || "当地");
    var meta = [];
    if (w.humidity != null) meta.push("💧" + w.humidity + "%");
    if (w.wind != null) meta.push("💨" + w.wind + "km/h");
    return '<div class="home-weather">' +
      '<div class="hw-icon">' + (w.geo ? "📍" : "🌤️") + '</div>' +
      '<div class="hw-info"><div class="hw-temp">' + w.temp + '° <span class="hw-cond">' + cond + '</span></div>' +
      '<div class="hw-loc">' + escapeHtml(loc) + (meta.length ? ' · ' + meta.join(' · ') : '') + (w.geo ? ' · 手机定位' : '') + '</div></div>' +
      '<button class="hw-refresh" onclick="if(window.refreshWeather)refreshWeather()">🔄</button>' +
      '</div>';
  }
  return '<div class="home-weather hw-empty" onclick="if(window.loadWeather)loadWeather()">' +
    '<div class="hw-icon">🌤️</div>' +
    '<div class="hw-info"><div class="hw-temp" style="font-size:14px">点击获取我的天气</div>' +
    '<div class="hw-loc">📍 授权后自动显示当地温度与穿搭建议</div></div>' +
    '<div class="hw-go">›</div></div>';
}

function briefBannerHtml() {
  var g = DB.data.growth || {};
  var nd = (typeof LiveData !== "undefined" && LiveData.news) ? LiveData.news : null;
  var newsItems = (nd && nd.items) ? nd.items : [];
  var official = newsItems.filter(function (n) { return n.category === "official"; }).length;
  var hw = newsItems.filter(function (n) { return n.category === "hardware" || n.category === "ai" || n.category === "tech"; }).length;
  var fridge = g.fridge || {};
  var expiring = (fridge.items || []).filter(function (it) { var d = (typeof itemDaysLeft === "function" ? itemDaysLeft(it) : null); return d != null && d <= 3; }).length;
  var tasks = DB.data.workbench.tasks.filter(function (t) { return t.date === today(); });
  var pending = tasks.filter(function (t) { return !t.done; }).length;
  var eng = (typeof engGet === "function") ? engGet() : (g.english || {});
  var streak = eng.streak || 0;
  var parts = [];
  if (official) parts.push("📰 官媒 " + official);
  if (hw) parts.push("硬件 " + hw);
  if (expiring) parts.push("🧊 临期 " + expiring);
  if (pending) parts.push("📋 待办 " + pending);
  parts.push("🔥 打卡 " + streak + " 天");
  return '<div class="brief-banner" onclick="navigate(\'brief\')">' +
    '<div class="brief-banner-ic">📋</div>' +
    '<div class="brief-banner-main"><div class="brief-banner-t">每日简报</div>' +
    '<div class="brief-banner-s">' + (parts.length ? parts.join(" · ") : "暂无更新") + '</div></div>' +
    '<div class="brief-banner-go">›</div></div>';
}

// ===== 首页「全部模块」自定义排位 =====
function toggleModuleEdit() {
  window.moduleEditMode = !window.moduleEditMode;
  render();
}
function moveModule(id, dir) {
  var all = ["industry", "brief", "competitors", "insights", "ideas", "outfit", "fridge", "videos", "invest", "language", "diet", "checkin"];
  var order = (DB.data.moduleOrder && DB.data.moduleOrder.length) ? DB.data.moduleOrder.slice() : all.slice();
  var i = order.indexOf(id);
  if (i < 0) return;
  var j = i + dir;
  if (j < 0 || j >= order.length) return;
  var t = order[i]; order[i] = order[j]; order[j] = t;
  DB.data.moduleOrder = order;
  try { DB.save(); } catch (e) {}
  render();
}

function renderHome() {
  var c = document.getElementById("app-content");
  var tasks = DB.data.workbench.tasks.filter(function(t) { return t.date === today(); });
  var taskDone = tasks.filter(function(t) { return t.done; }).length;
  var ideas = DB.data.ideas.length, competitors = DB.data.competitors.length, industry = DB.data.industry.length;

  var pendingTasks = tasks.filter(function(t) { return !t.done; }).length;
  var taskAlert = pendingTasks > 0;

  var overdueTasks = tasks.filter(isTaskOverdue);
  var overdueBanner = overdueTasks.length > 0
    ? '<div class="overdue-banner">🔴 ' + overdueTasks.length + ' 项任务已超时，请立即处理！</div>'
    : '';
  // 当天首次进入首页且存在超时任务时，弹出明显提醒（每天仅弹一次）
  if (overdueTasks.length > 0 && !sessionStorage.getItem("overdue_shown_" + today())) {
    showOverdueModal(overdueTasks);
    sessionStorage.setItem("overdue_shown_" + today(), "1");
  }

  var gHome = (DB.data && DB.data.growth) || {};
  var outfitItems = (gHome.outfit && gHome.outfit.wardrobe) ? gHome.outfit.wardrobe.length : 0;
  var fridgeItems = (gHome.fridge && gHome.fridge.items) ? gHome.fridge.items.length : 0;
  var videosCnt = (gHome.videos && gHome.videos.items) ? gHome.videos.items.length : 0;
  var investCnt = (gHome.invest) ? (gHome.invest.assets.length + gHome.invest.holdings.length) : 0;
  var engHome = gHome.english || {};
  var langHome = gHome.language || {};
  var studyDays = (engHome.studyLog) ? Object.keys(engHome.studyLog).length : 0;
  if (langHome.langs) {
    studyDays = 0;
    ["en", "ja", "ko"].forEach(function (lc) {
      var l = langHome.langs[lc];
      if (l && l.stats && l.stats.studyLog) studyDays += Object.keys(l.stats.studyLog).length;
    });
  }
  var recipeFavs = (gHome.recipes && gHome.recipes.favs) ? gHome.recipes.favs.length : 0;
  var dietChecks = (typeof dietChecksToday === "function") ? dietChecksToday() : 0;
  var sportLogs = (gHome.sport && gHome.sport.logs) ? gHome.sport.logs : {};
  var sportDays = Object.keys(sportLogs).length;
  var ckHome = (gHome.checkin && gHome.checkin.streak) ? gHome.checkin.streak : 0;
  var gReading = (gHome.reading && gHome.reading.items) || [];
  var growthCount = investCnt + studyDays + (sportDays + (typeof ftHomeCount === "function" ? ftHomeCount() : 0)) + gReading.length;
  var sections = [
    { id: "industry", icon: "📰", title: "行业情报", color: "rgba(100,210,255,0.12)", count: industry },
    { id: "brief", icon: "📋", title: "每日简报", color: "rgba(94,92,230,0.12)", count: 0 },
    { id: "competitors", icon: "🔍", title: "竞品研判", color: "rgba(255,159,10,0.12)", count: competitors },
    { id: "insights", icon: "💡", title: "需求洞察", color: "rgba(255,214,10,0.12)", count: DB.data.insights.length },
    { id: "ideas", icon: "💭", title: "想法库", color: "rgba(191,90,242,0.12)", count: ideas },
    { id: "outfit", icon: "👗", title: "穿搭管理", color: "rgba(255,105,180,0.12)", count: outfitItems },
    { id: "fridge", icon: "📦", title: "物品管理", color: "rgba(90,200,250,0.14)", count: fridgeItems },
    { id: "videos", icon: "🔥", title: "爆款视频", color: "rgba(255,159,10,0.12)", count: videosCnt },
    { id: "growth", icon: "🌱", title: "个人成长", color: "rgba(48,209,88,0.13)", count: growthCount, sub: "投资 · 健身 · 语言 · 阅读" },
    { id: "recipes", icon: "🍳", title: "菜谱", color: "rgba(255,159,10,0.13)", count: recipeFavs },
    { id: "diet", icon: "🥗", title: "饮食打卡", color: "rgba(48,209,88,0.12)", count: dietChecks },
    { id: "checkin", icon: "🎯", title: "每日打卡", color: "rgba(255,159,10,0.13)", count: ckHome },
  ];
  // 自定义排位：按 DB.data.moduleOrder 重排（未收录的按默认顺序追加；旧「english」视为「language」）
  var _mo = DB.data.moduleOrder;
  if (_mo && _mo.length) {
    _mo = _mo.map(function (x) { return x === "english" ? "language" : x; });
    // 个人成长聚合：把投资/语言/健身收进「个人成长」hub（保留原位置）
    if (_mo.indexOf("growth") === -1) {
      var gi = _mo.indexOf("invest"); if (gi === -1) gi = _mo.indexOf("language"); if (gi === -1) gi = _mo.indexOf("fitness");
      if (gi === -1) _mo.push("growth"); else _mo.splice(gi, 0, "growth");
    }
    var _byId = {}; sections.forEach(function (s) { _byId[s.id] = s; });
    var _ordered = [];
    _mo.forEach(function (id) { if (_byId[id]) { _ordered.push(_byId[id]); delete _byId[id]; } });
    Object.keys(_byId).forEach(function (k) { _ordered.push(_byId[k]); });
    sections = _ordered;
  }

  c.innerHTML =
    homeDateHtml() +
    overdueBanner +
    homeWeatherHtml() +
    briefBannerHtml() +
    checkinBannerHtml() +
    '<div class="stats-grid">' +
      '<div class="stat-card' + (taskAlert ? ' stat-alert pulse' : '') + '" style="grid-column:1/-1" onclick="navigate(\'workbench\')"><div class="stat-accent" style="background:' + (taskAlert ? 'var(--accent-red)' : 'var(--accent-blue)') + '"></div><div class="stat-icon">📋</div><div class="stat-value">' + (taskAlert ? pendingTasks + ' 项待办' : taskDone + '/' + tasks.length) + '</div><div class="stat-label">今日任务</div>' + (taskAlert ? '<div class="stat-alert-tag">⚠ 待完成 ' + pendingTasks + ' 项</div>' : '') + '</div>' +
    '</div>' +
    '<div class="section-title"><span class="emoji">🧭</span> 全部模块' +
      '<button class="module-order-btn" onclick="toggleModuleEdit()">' + (window.moduleEditMode ? '✅ 完成' : '↕️ 排序') + '</button>' +
    '</div>' +
    '<div class="section-grid">' +
      sections.map(function(s, i) {
        var moveHtml = window.moduleEditMode
          ? '<div class="nav-move"><button class="nav-move-btn" onclick="event.stopPropagation();moveModule(\'' + s.id + '\',-1)' + (i === 0 ? '" disabled' : '') + '">▲</button><button class="nav-move-btn" onclick="event.stopPropagation();moveModule(\'' + s.id + '\',1)' + (i === sections.length - 1 ? '" disabled' : '') + '">▼</button></div>'
          : '';
        var cardCls = window.moduleEditMode ? 'nav-card nav-edit' : 'nav-card';
        var clickAttr = window.moduleEditMode ? '' : 'onclick="navigate(\'' + s.id + '\')"';
        return '<div class="' + cardCls + '" ' + clickAttr + '>' + (s.count > 0 ? '<div class="nav-count">' + s.count + '</div>' : '') + '<div class="nav-icon" style="background:' + s.color + '">' + s.icon + '</div><div class="nav-title">' + s.title + '</div>' + (s.sub ? '<div class="nav-sub">' + s.sub + '</div>' : '') + moveHtml + '</div>';
      }).join("") +
    '</div>' +
    '<div class="section-title"><span class="emoji">⚡</span> 最近动态</div>' +
    '<div class="card">' +
      DB.data.activity.slice(0, 6).map(function(a) {
        var icons = { idea: "💭", competitor: "🔍", industry: "📰", insight: "💡", task: "📋", product: "📊", planning: "🗺️" };
        var colors = { idea: "rgba(191,90,242,0.15)", competitor: "rgba(255,159,10,0.15)", industry: "rgba(100,210,255,0.15)", insight: "rgba(255,214,10,0.15)", task: "rgba(10,132,255,0.15)", product: "rgba(94,92,230,0.15)", planning: "rgba(48,209,88,0.15)" };
        return '<div class="activity-item"><div class="activity-icon" style="background:' + (colors[a.type] || "rgba(142,142,147,0.15)") + '">' + (icons[a.type] || "📝") + '</div><div><div class="activity-text">' + escapeHtml(a.text) + '</div><div class="activity-time">' + formatDateShort(a.date) + '</div></div></div>';
      }).join("") +
    '</div>';
  writeBriefSnapshot();
}

// ===== 个人成长 主页（参考工作区首页，聚合所有成长模块） =====

// ---------- 🎯 每日打卡 & 阶段奖励（v5.8.77） ----------
function spGet() {
  var g = DB.data.growth;
  if (!g.sport) g.sport = (typeof spDefault === "function") ? spDefault() : { logs: {}, preset: "跑步" };
  return g.sport;
}
function ckGet() {
  var g = DB.data.growth;
  if (!g.checkin) g.checkin = (typeof ckDefault === "function") ? ckDefault() : { days: {}, rewards: { small: [], medium: [], large: [], xl: [] }, streak: 0, lastDate: null, best: 0 };
  return g.checkin;
}
// 今日三件事完成情况（英语≥1分钟 / 主餐≥2餐 / 有运动记录）
function checkinPartsToday() {
  var g = DB.data.growth || {};
  var sec = 0;
  if (typeof lgTodaySeconds === "function") { try { sec = lgTodaySeconds("en") || 0; } catch (e) {} }
  var mealsDone = (typeof dietChecksToday === "function") ? dietChecksToday() : 0;
  var sp = g.sport || {};
  var spRec = (sp.logs || {})[today()];
  return {
    english: sec >= 60, sec: sec,
    food: mealsDone >= 2, mealsDone: mealsDone,
    sport: !!(spRec && (spRec.durationMin || 0) > 0),
    sportMin: spRec ? (spRec.durationMin || 0) : 0,
    sportType: spRec ? spRec.type : ""
  };
}
// 首页打卡横幅
function checkinBannerHtml() {
  var ck = ckGet();
  var p = checkinPartsToday();
  var done = p.english && p.food && p.sport;
  var cls = done ? "ck-banner done" : "ck-banner";
  var sub = done ? "今日打卡成功 🎉 连续 " + (ck.streak || 0) + " 天"
    : "英语" + (p.english ? "✓" : "✗") + " · 饮食" + (p.food ? "✓" : "✗") + " · 运动" + (p.sport ? "✓" : "✗") + " · 连续 " + (ck.streak || 0) + " 天";
  return '<div class="' + cls + '" onclick="navigate(\'checkin\')">' +
    '<div class="ck-banner-ic">' + (done ? "🎉" : "🎯") + '</div>' +
    '<div class="ck-banner-main"><div class="ck-banner-t">每日打卡' + (done ? " · 已达成" : "") + '</div>' +
    '<div class="ck-banner-s">' + sub + '</div></div>' +
    '<div class="ck-banner-go">›</div></div>';
}
// 🏃 运动页
var __spType = null;
function spPickType(t) { __spType = t; render(); }
function spSaveToday() {
  var sp = spGet();
  var minEl = document.getElementById("sp-min"), kcalEl = document.getElementById("sp-kcal"), noteEl = document.getElementById("sp-note");
  if (!minEl) return;
  var min = parseInt(minEl.value, 10) || 0;
  if (min <= 0) { if (typeof showToast === "function") showToast("请填写运动时长", "warn"); return; }
  var kcal = kcalEl ? (parseInt(kcalEl.value, 10) || 0) : 0;
  var note = noteEl ? noteEl.value : "";
  spLogDay(sp, today(), __spType || sp.preset || "其他", min, kcal, note);
  __spType = null;
  DB.save();
  if (typeof DB.logActivity === "function") DB.logActivity("sport", "记录运动：" + min + " 分钟");
  if (typeof showToast === "function") showToast("✅ 已记录运动 " + min + " 分钟", "success");
  render();
}
function spDeleteToday() {
  spRemoveLog(spGet(), today());
  DB.save();
  render();
  if (typeof showToast === "function") showToast("已删除今日运动记录", "success");
}
function renderSport() {
  var c = document.getElementById("app-content");
  var fLink = '<div class="card" style="cursor:pointer" onclick="navigate(\'fitness\')"><div class="flex-between"><div class="card-title">💪 减脂健身</div><div style="color:var(--text-secondary)">→</div></div><div class="card-body">体重目标进度 · 饮食记录 · 训练周计划 · 体态跟练</div></div>';
  var sp = spGet();
  var rec = (sp.logs || {})[today()];
  var wk = spWeekSummary(sp, today());
  var st = spStats(sp);
  var typeChips = '<div class="sp-chips">' + SPORT_TYPES.map(function (t) {
    var sel = (rec && rec.type === t) || (!rec && (__spType || sp.preset) === t);
    return '<div class="sp-chip' + (sel ? " on" : "") + '" onclick="spPickType(\'' + t + '\')">' + t + '</div>';
  }).join("") + '</div>';
  var form = rec
    ? '<div class="card"><div class="card-h">✅ 今日已记录</div>' +
      '<div class="sp-recv">' + escapeHtml(rec.type || "") + ' · ' + (rec.durationMin || 0) + ' 分钟' + (rec.kcal ? " · " + rec.kcal + " 千卡" : "") + (rec.note ? '<div class="sp-note">' + escapeHtml(rec.note) + '</div>' : "") + '</div>' +
      '<div class="btn-row" style="margin-top:10px"><button class="btn btn-secondary" style="flex:1" onclick="__spType=null;render()">✏️ 重新记录</button><button class="btn btn-secondary" style="flex:1;color:var(--accent-red)" onclick="spDeleteToday()">🗑 删除</button></div></div>'
    : '<div class="card"><div class="card-h">🏃 记录今日运动</div>' +
      typeChips +
      '<input id="sp-min" class="form-input" type="number" placeholder="运动时长（分钟）" min="1" style="margin-top:10px">' +
      '<input id="sp-kcal" class="form-input" type="number" placeholder="消耗（千卡，可选）" min="0" style="margin-top:10px">' +
      '<input id="sp-note" class="form-input" placeholder="备注（可选）" style="margin-top:10px">' +
      '<button class="btn btn-primary" style="width:100%;margin-top:12px;justify-content:center" onclick="spSaveToday()">保存记录</button></div>';
  var weekHtml = '<div class="card"><div class="card-h">📊 本周运动汇总 <span class="sp-sub">' + formatDateShort(wk.monday) + ' ~ ' + formatDateShort(wk.sunday) + '</span></div>' +
    '<div class="sp-stat-row">' +
      '<div class="sp-stat"><div class="sp-stat-v">' + wk.days + '</div><div class="sp-stat-l">运动天数</div></div>' +
      '<div class="sp-stat"><div class="sp-stat-v">' + wk.totalMin + '</div><div class="sp-stat-l">总时长(分)</div></div>' +
      '<div class="sp-stat"><div class="sp-stat-v">' + wk.totalKcal + '</div><div class="sp-stat-l">消耗(千卡)</div></div>' +
      '<div class="sp-stat"><div class="sp-stat-v">' + escapeHtml(wk.topType) + '</div><div class="sp-stat-l">主力类型</div></div>' +
    '</div></div>';
  var dates = Object.keys(sp.logs || {}).sort().reverse();
  var hist = dates.length ? dates.map(function (d) {
    var r = sp.logs[d];
    return '<div class="sp-hist-item"><div class="sp-hist-d">' + formatDateShort(d) + '</div>' +
      '<div class="sp-hist-m">' + escapeHtml(r.type || "") + ' · ' + (r.durationMin || 0) + ' 分钟' + (r.kcal ? " · " + r.kcal + " 千卡" : "") + '</div>' +
      '<button class="sp-hist-del" onclick="spRemoveDay(\'' + d + '\')">✕</button></div>';
  }).join("") : '<div class="empty-state" style="padding:16px 0"><div class="empty-icon">🏃</div><div class="empty-text">还没有运动记录<br>从今天开始，每天动一动！</div></div>';
  var histHtml = '<div class="card"><div class="card-h">📜 历史记录 <span class="sp-sub">共 ' + st.totalDays + ' 天 · ' + st.totalMin + ' 分钟</span></div>' + hist + '</div>';
  c.innerHTML = fLink + '<div class="enm-hint" style="margin-bottom:6px">累计运动 ' + st.totalDays + ' 天 · 连续 ' + st.streak + ' 天 · 共 ' + st.totalMin + ' 分钟 / ' + st.totalKcal + ' 千卡</div>' + form + weekHtml + histHtml;
}
function spRemoveDay(d) {
  spRemoveLog(spGet(), d);
  DB.save();
  render();
}
// 🎯 打卡页 + 日历复盘
function ckDoCheckin() {
  var p = checkinPartsToday();
  var ck = ckGet();
  ckComputeDay(ck, today(), p.english, p.food, p.sport);
  ckUpdateStreak(ck, today());
  var res = ckEnsureRewards(ck, today());
  DB.save();
  if (typeof DB.logActivity === "function") DB.logActivity("checkin", "每日打卡：" + (p.english ? "英语✓" : "英语✗") + (p.food ? " 食物✓" : " 食物✗") + (p.sport ? " 运动✓" : " 运动✗"));
  if (p.english && p.food && p.sport) {
    if (res.granted.length) {
      showCheckinRewardModal(res.granted, ck.streak);
    } else {
      if (typeof showToast === "function") showToast("✅ 今日已打卡，连续 " + ck.streak + " 天", "success");
    }
  } else {
    var miss = [];
    if (!p.english) miss.push("英语学习 ≥1 分钟");
    if (!p.food) miss.push("饮食打卡 ≥2 餐");
    if (!p.sport) miss.push("记录运动");
    if (typeof showToast === "function") showToast("还差：" + miss.join("、") + "，完成后再来打卡！", "warn");
  }
  render();
}
function showCheckinRewardModal(granted, streak) {
  var html = '<div class="modal-title">🎉 打卡成功！</div>' +
    '<div class="ck-reward-conf">连续打卡 <b>' + streak + '</b> 天，解锁奖励：</div>' +
    granted.map(function (r) {
      return '<div class="ck-reward-item"><div class="ck-reward-name">' + (CK_REWARD_NAMES[r.level] || r.level) + '</div><div class="ck-reward-text">' + escapeHtml(r.text) + '</div></div>';
    }).join("") +
    '<div class="btn-row" style="margin-top:14px"><button class="btn btn-primary" style="flex:1" onclick="closeModal()">开心收下 🎁</button></div>';
  showModal(html);
}
function ckMonthNav(delta) {
  var y = parseInt(window.__ckMonth.slice(0, 4), 10);
  var m = parseInt(window.__ckMonth.slice(5, 7), 10);
  var d = new Date(Date.UTC(y, m - 1 + delta, 1, 12));
  window.__ckMonth = d.toISOString().slice(0, 7);
  render();
}
function openCheckinDay(dateStr) {
  var ck = ckGet();
  var day = (ck.days || {})[dateStr] || {};
  var hist = (typeof intelHistoryDates === "function") ? intelHistoryDates(DB.data.industryHistory || {}) : [];
  var brief = hist.indexOf(dateStr) !== -1;
  var allRewards = [];
  Object.keys(ck.rewards || {}).forEach(function (lv) { (ck.rewards[lv] || []).forEach(function (r) { if (r.date === dateStr) allRewards.push({ level: lv, text: r.text }); }); });
  var item = function (icon, label, ok) { return '<div class="ck-day-item"><span>' + icon + ' ' + label + '</span><span>' + (ok ? "✅" : "⬜") + '</span></div>'; };
  var html =
    '<div class="modal-title">📅 ' + formatDate(dateStr) + '</div>' +
    '<div class="ck-day-detail">' +
      item("🌐", "英语学习", !!day.english) +
      item("🥗", "饮食打卡", !!day.food) +
      item("🏃", "运动记录", !!day.sport) +
      item("📰", "每日简报完成", brief) +
      '<div class="ck-day-sum">' + (day.done ? "🎯 当天打卡成功" : "🎯 未完成打卡") + '</div>' +
      (allRewards.length ? '<div class="ck-day-rewards">' + allRewards.map(function (r) { return '<div>' + (CK_REWARD_NAMES[r.level] || r.level) + '：' + escapeHtml(r.text) + '</div>'; }).join("") + '</div>' : "") +
    '</div>' +
    '<div class="btn-row" style="margin-top:14px"><button class="btn btn-secondary" style="flex:1" onclick="closeModal()">关闭</button></div>';
  showModal(html);
}
function renderCheckin() {
  var c = document.getElementById("app-content");
  var ck = ckGet();
  var p = checkinPartsToday();
  ckComputeDay(ck, today(), p.english, p.food, p.sport);
  ckUpdateStreak(ck, today());
  if (!window.__ckMonth) window.__ckMonth = today().slice(0, 7);
  var hist = (typeof intelHistoryDates === "function") ? intelHistoryDates(DB.data.industryHistory || {}) : [];
  var cells = ckCalendarCells(ck, hist, window.__ckMonth);
  // 今日三件事
  var row = function (icon, label, done, val, goto) {
    return '<div class="ck-task" onclick="navigate(\'' + goto + '\')">' +
      '<span class="ck-task-ic">' + icon + '</span>' +
      '<span class="ck-task-l">' + label + '</span>' +
      '<span class="ck-task-v">' + (val || "—") + '</span>' +
      '<span class="ck-task-s">' + (done ? "✅" : "⬜") + '</span></div>';
  };
  var tasksHtml = '<div class="card"><div class="card-h">🎯 今日打卡 · ' + formatDate(today()) + '</div>' +
    row("🌐", "英语学习", p.english, p.sec + " 分钟", "language") +
    row("🥗", "饮食打卡", p.food, p.mealsDone + "/5 餐", "diet") +
    row("🏃", "运动记录", p.sport, (p.sportMin ? p.sportMin + " 分钟" : "未记录"), "sport") +
    '<button class="btn btn-primary" style="width:100%;margin-top:12px;justify-content:center;gap:6px" onclick="ckDoCheckin()">🎯 打卡</button>' +
    '<div class="ck-hint">三项全部完成即为打卡成功，每天解锁神秘小奖励，连续 7/30/90 天有阶段大奖。</div></div>';
  // 阶段奖励进度
  var milestones = [7, 30, 90];
  var nxt = null;
  for (var i = 0; i < milestones.length; i++) { if (ck.streak < milestones[i]) { nxt = milestones[i]; break; } }
  var progPct = nxt ? Math.min(100, Math.round(ck.streak / nxt * 100)) : 100;
  var progHtml = '<div class="card"><div class="card-h">🏅 阶段奖励进度</div>' +
    '<div class="ck-streak"><span class="ck-streak-v">' + ck.streak + '</span><span class="ck-streak-l">天连续打卡' + (ck.best ? " · 历史最佳 " + ck.best + " 天" : "") + '</span></div>' +
    (nxt ? '<div class="ck-prog"><div class="ck-prog-bar"><div style="width:' + progPct + '%"></div></div><div class="ck-prog-l">距离 ' + nxt + ' 天里程碑还差 ' + (nxt - ck.streak) + ' 天</div></div>' : '<div class="ck-prog-l" style="color:var(--accent-green)">👑 90 天超大奖励已达成！</div>') +
    '<div class="ck-milestones">' +
      '<div class="ck-ms' + (ck.streak >= 7 ? " on" : "") + '"><span>🎉</span><span>7天·中奖励</span></div>' +
      '<div class="ck-ms' + (ck.streak >= 30 ? " on" : "") + '"><span>🏅</span><span>30天·大奖励</span></div>' +
      '<div class="ck-ms' + (ck.streak >= 90 ? " on" : "") + '"><span>👑</span><span>90天·超大奖励</span></div>' +
    '</div></div>';
  // 奖励记录
  var lvMeta = [["small", "🎁 神秘小奖励（每日）"], ["medium", "🎉 中奖励（每7天）"], ["large", "🏅 大奖励（30天）"], ["xl", "👑 超大奖励（90天）"]];
  var rewardsHtml = '<div class="card"><div class="card-h">🎁 奖励记录</div>' +
    lvMeta.map(function (lm) {
      var list = (ck.rewards[lm[0]] || []).slice().reverse().slice(0, 8);
      var body = list.length ? list.map(function (r) {
        return '<div class="ck-reward-row"><span class="ck-reward-date">' + formatDateShort(r.date) + '</span><span class="ck-reward-txt">' + escapeHtml(r.text) + '</span></div>';
      }).join("") : '<div class="ck-reward-empty">' + lm[1] + ' · 暂无记录</div>';
      return '<div class="ck-reward-group"><div class="ck-reward-group-h">' + lm[1] + '</div>' + body + '</div>';
    }).join("") + '</div>';
  // 日历
  var calHtml = '<div class="card"><div class="card-h">📅 日历复盘</div>' +
    '<div class="ck-cal-nav"><button class="btn btn-secondary" onclick="ckMonthNav(-1)" style="padding:4px 10px">‹</button>' +
      '<span class="ck-cal-month">' + window.__ckMonth + '</span>' +
      '<button class="btn btn-secondary" onclick="ckMonthNav(1)" style="padding:4px 10px">›</button></div>' +
    '<div class="ck-week-h"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div>' +
    '<div class="ck-cal">' + cells.map(function (cell) {
      if (!cell.inMonth) return '<div class="ck-cell empty"></div>';
      var cls = "ck-cell";
      if (cell.today) cls += " today";
      if (cell.done) cls += " done";
      var marks = [];
      if (cell.done) marks.push("🎯");
      if (cell.brief) marks.push("📰");
      return '<div class="' + cls + '" onclick="openCheckinDay(\'' + cell.date + '\')"><div class="ck-day">' + cell.day + '</div><div class="ck-marks">' + marks.join("") + '</div></div>';
    }).join("") + '</div>' +
    '<div class="ck-cal-legend"><span>🎯 打卡成功</span><span>📰 简报完成</span><span>点击日期查看详情</span></div></div>';
  c.innerHTML = '<div class="enm-hint" style="margin-bottom:6px">每日打卡 = 英语学习 + 饮食打卡 + 运动记录 全部完成 · 连续天数在日历复盘</div>' + tasksHtml + progHtml + rewardsHtml + calHtml;
}

function renderGrowthHome() {
  var c = document.getElementById("app-content");
  if (!c) return;
  var g = DB.data.growth || {};
  var eng = (typeof engGet === "function") ? engGet() : (g.english || {});
  var studyDays = (eng.studyLog) ? Object.keys(eng.studyLog).length : 0;
  var invest = g.invest || { assets: [], holdings: [] };
  var investCnt = (invest.assets ? invest.assets.length : 0) + (invest.holdings ? invest.holdings.length : 0);
  var fitCnt = (typeof ftHomeCount === "function")
    ? ftHomeCount()
    : (g.sport && g.sport.logs ? Object.keys(g.sport.logs).length : 0);
  var rdItems = (g.reading && g.reading.items) ? g.reading.items : [];
  var rdCnt = rdItems.length;

  var cards = [
    { id: "invest", icon: "📈", title: "投资理财", color: "rgba(48,209,88,0.14)", count: investCnt, desc: "资产分布 · 盈亏 · 行情" },
    { id: "fitness", icon: "💪", title: "健身", color: "rgba(255,105,180,0.13)", count: fitCnt, desc: "运动 · 体重 · 训练 · 体态" },
    { id: "language", icon: "🌐", title: "语言学习", color: "rgba(10,132,255,0.12)", count: studyDays, desc: "英 / 日 / 韩 · 八大模块" },
    { id: "reading", icon: "📖", title: "阅读", color: "rgba(191,90,242,0.13)", count: rdCnt, desc: "书 / 电子书 / 播客 / 演讲 + AI 探讨" },
    { id: "aihot", icon: "🤖", title: "AI 资讯", color: "rgba(10,132,255,0.13)", count: 0, desc: "AIHOT 每日简报 · 精选 · 热点" },
    { id: "learn", icon: "🧠", title: "知识学习", color: "rgba(191,90,242,0.14)", count: (typeof learnCount === "function") ? learnCount() : 0, desc: "AI 小知识 · 金融小知识 · 卡片速学" },
    { id: "xhsfav", icon: "📌", title: "收藏知识库", color: "rgba(255,45,85,0.13)", count: (typeof xfCount === "function") ? xfCount() : 0, desc: "小红书收藏 · 分类汇总 · 关键词检索" }
  ];

  c.innerHTML =
    homeWeatherHtml() +
    '<div class="section-title"><span class="emoji">🌱</span> 个人成长</div>' +
    '<div class="section-grid">' +
      cards.map(function (s) {
        return '<div class="nav-card" onclick="navigate(\'' + s.id + '\')">' +
          (s.count > 0 ? '<div class="nav-count">' + s.count + '</div>' : '') +
          '<div class="nav-icon" style="background:' + s.color + '">' + s.icon + '</div>' +
          '<div class="nav-title">' + s.title + '</div>' +
          '<div class="nav-sub">' + s.desc + '</div>' +
        '</div>';
      }).join("") +
    '</div>' +
    '<div class="section-title"><span class="emoji">⚡</span> 最近动态</div>' +
    '<div class="card">' +
      DB.data.activity.slice(0, 6).map(function (a) {
        var icons = { idea: "💭", competitor: "🔍", industry: "📰", insight: "💡", task: "📋", product: "📊", planning: "🗺️", review: "📈", diet: "🥗", video: "🔥", english: "📚", invest: "📈", outfit: "👗", fridge: "📦", reading: "📖", fitness: "💪", language: "🌐" };
        var colors = { idea: "rgba(191,90,242,0.15)", competitor: "rgba(255,159,10,0.15)", industry: "rgba(100,210,255,0.15)", insight: "rgba(255,214,10,0.15)", task: "rgba(10,132,255,0.15)", product: "rgba(94,92,230,0.15)", planning: "rgba(48,209,88,0.15)", review: "rgba(191,90,242,0.15)", diet: "rgba(48,209,88,0.15)", video: "rgba(255,159,10,0.15)", english: "rgba(10,132,255,0.15)", invest: "rgba(48,209,88,0.15)", outfit: "rgba(255,105,180,0.15)", fridge: "rgba(90,200,250,0.18)", reading: "rgba(191,90,242,0.15)", fitness: "rgba(255,105,180,0.15)", language: "rgba(10,132,255,0.15)" };
        return '<div class="activity-item"><div class="activity-icon" style="background:' + (colors[a.type] || "rgba(142,142,147,0.15)") + '">' + (icons[a.type] || "📝") + '</div><div><div class="activity-text">' + escapeHtml(a.text) + '</div><div class="activity-time">' + formatDateShort(a.date) + '</div></div></div>';
      }).join("") +
    '</div>';
  writeBriefSnapshot();
}

// ===== Workbench =====
var workbenchTaskFilter = "today"; // today | todo | done
function setWorkbenchTaskFilter(f) { workbenchTaskFilter = f; render(); }

function renderWorkbench() {
  var c = document.getElementById("app-content");
  var tasks;
  if (workbenchTaskFilter === "todo") tasks = DB.data.workbench.tasks.filter(function(t) { return !t.done; });
  else if (workbenchTaskFilter === "done") tasks = DB.data.workbench.tasks.filter(function(t) { return t.done; });
  else tasks = DB.data.workbench.tasks.filter(function(t) { return t.date === today(); });
  var notes = DB.data.workbench.notes.filter(function(n) { return n.date === today(); });
  var reflections = DB.data.workbench.reflections.filter(function(r) { return r.date === today(); });

  // === 历史已完成任务（按完成日期分组，可折叠，仅“今日”视图展示）===
  var historyHtml = "";
  if (workbenchTaskFilter === "today") {
    var historyTasks = DB.data.workbench.tasks.filter(function(t) { return t.done && t.completedAt; });
    var historyGroups = {};
    historyTasks.forEach(function(t) {
      var d = (t.completedAt || "").slice(0, 10) || (t.date || "");
      (historyGroups[d] = historyGroups[d] || []).push(t);
    });
    var historyDates = Object.keys(historyGroups).sort().reverse();
    historyHtml = historyDates.length ? (
      '<div class="section-title"><span class="emoji">📚</span> 历史已完成 <span style="margin-left:auto;font-size:13px;color:var(--text-secondary);font-weight:400">' + historyTasks.length + ' 项</span></div>' +
      historyDates.map(function(d) {
        var items = historyGroups[d];
        return '<div class="history-group">' +
          '<div class="history-date" onclick="toggleHistory(\'' + d + '\')">📅 ' + d + ' <span class="history-count">' + items.length + ' 项</span><span class="history-arrow" id="ha-' + d + '">▸</span></div>' +
          '<div class="history-items hidden" id="hi-' + d + '">' +
            items.map(function(t) { return taskTreeHtml(t); }).join("") +
          '</div></div>';
      }).join("")
    ) : "";
  }

  var filterBar =
    '<div class="filter-bar" style="margin:2px 0 10px">' +
    '<div class="chip' + (workbenchTaskFilter === "today" ? " active" : "") + '" onclick="setWorkbenchTaskFilter(\'today\')">今日</div>' +
    '<div class="chip' + (workbenchTaskFilter === "todo" ? " active" : "") + '" onclick="setWorkbenchTaskFilter(\'todo\')">待办</div>' +
    '<div class="chip' + (workbenchTaskFilter === "done" ? " active" : "") + '" onclick="setWorkbenchTaskFilter(\'done\')">已处理(留存)</div>' +
    '</div>';

  var taskTitle = workbenchTaskFilter === "done" ? "已处理任务（已留存）" : (workbenchTaskFilter === "todo" ? "待办任务" : "今日任务");
  var taskEmoji = workbenchTaskFilter === "done" ? "📥" : "📋";
  var taskCount = workbenchTaskFilter === "today"
    ? (tasks.filter(function(t){return taskAllDone(t);}).length + '/' + tasks.length)
    : tasks.length;
  if (workbenchTaskFilter === "done") taskEmoji = "📥";

  c.innerHTML =
    filterBar +
    '<div class="section-title"><span class="emoji">' + taskEmoji + '</span> ' + taskTitle + ' <span style="margin-left:auto;font-size:13px;color:var(--text-secondary);font-weight:400">' + taskCount + ' 项</span></div>' +
    (tasks.length === 0 ? '<div class="empty-state"><div class="empty-icon">📝</div><div class="empty-text">' + (workbenchTaskFilter === "done" ? "还没有已处理的任务" : "还没有任务<br>点击下方+添加") + '</div></div>' : tasks.map(taskTreeHtml).join("")) +
    historyHtml +
    '<div class="section-title"><span class="emoji">📓</span> 快速笔记</div>' +
    (notes.length === 0 ? '<div class="card"><div class="card-body" style="text-align:center">还没有笔记，点击+记录灵感</div></div>' : notes.map(function(n) {
      return '<div class="card"><div class="flex-between mb-8"><div class="card-title">📝 笔记</div><span class="text-xs text-secondary">' + formatDateShort(n.date) + '</span></div><div class="card-body">' + escapeHtml(n.text) + '</div></div>';
    }).join("")) +
    '<div class="section-title"><span class="emoji">🤔</span> 今日复盘</div>' +
    (reflections.length === 0 ? '<div class="card"><div class="card-body" style="text-align:center">今天还没有复盘记录</div></div>' : reflections.map(function(r) {
      return '<div class="card"><div class="flex-between mb-8"><div class="card-title">🤔 复盘</div><span class="text-xs text-secondary">' + formatDateShort(r.date) + '</span></div><div class="card-body">' + escapeHtml(r.text) + '</div></div>';
    }).join(""));
}

// ===== Products =====
function renderProducts() {
  var c = document.getElementById("app-content");
  var categories = ["all"].concat(Array.from(new Set(DB.data.products.map(function(p) { return p.category; }))));
  var filtered = DB.data.products;
  if (currentFilter !== "all") filtered = filtered.filter(function(p) { return p.category === currentFilter; });

  c.innerHTML =
    '<div class="filter-bar">' + categories.map(function(cat) { return '<div class="chip' + (currentFilter === cat ? ' active' : '') + '" onclick="setFilter(\'' + cat + '\')">' + (cat === "all" ? "全部" : cat) + '</div>'; }).join("") + '</div>' +
    '<div class="product-grid">' +
    filtered.map(function(p) {
      return '<div class="card" onclick="showProductDetail(\'' + p.id + '\')">' +
        '<div class="card-header"><div><div class="card-title">' + escapeHtml(p.name) + ' ' + stageBadge(p.stage || "concept") + '</div><div class="text-xs text-secondary mt-8">' + escapeHtml(p.category) + ' · ' + escapeHtml(p.keyParams) + '</div></div>' + statusBadge(p.status) + '</div>' +
        '<div class="card-body mt-8">' + escapeHtml(p.description) + '</div>' +
        '<div class="progress-bar"><div class="progress-fill" style="width:' + p.progress + '%;background:' + (p.progress > 60 ? "var(--accent-green)" : p.progress > 30 ? "var(--accent-orange)" : "var(--accent-blue)") + '"></div></div>' +
        '<div class="text-xs text-secondary mt-8 flex-between"><span>进度 ' + p.progress + '%</span><span>优先级: ' + (p.priority === "high" ? "高" : p.priority === "medium" ? "中" : "低") + '</span></div>' +
      '</div>';
    }).join("") +
    '</div>';
}

function showProductDetail(id) {
  var p = DB.data.products.find(function(x) { return x.id === id; });
  if (!p) return;
  var params = p.keyParams.split("|").map(function(s) { return s.trim(); });
  showModal(
    '<div class="modal-title">' + escapeHtml(p.name) + '</div>' +
    '<div style="margin-bottom:12px">' + statusBadge(p.status) + ' ' + stageBadge(p.stage || "concept") + ' <span class="badge badge-gray">' + escapeHtml(p.category) + '</span></div>' +
    '<div class="form-group"><div class="form-label">核心参数</div><div style="display:flex;flex-wrap:wrap;gap:6px">' + params.map(function(pa) { return '<span class="badge badge-blue">' + escapeHtml(pa) + '</span>'; }).join("") + '</div></div>' +
    '<div class="form-group"><div class="form-label">产品描述</div><div style="font-size:14px;line-height:1.6;color:var(--text-secondary)">' + escapeHtml(p.description) + '</div></div>' +
    '<div class="form-group"><div class="form-label">开发进度</div><div class="progress-bar"><div class="progress-fill" style="width:' + p.progress + '%;background:var(--accent-blue)"></div></div><div class="text-sm text-secondary mt-8">' + p.progress + '%</div></div>' +
    '<div class="btn-row"><button class="btn btn-secondary" onclick="closeModal()">关闭</button></div>'
  );
}

// ===== Industry (含来源链接 + 手动粘贴) =====
function setIndustrySub(s) { setSubView("industry", s); }
function goAiOutputs() {
  try {
    if (currentRoute === "industry") { setSubView("industry", "outputs"); return; }
    navigate("industry");
    setSubView("industry", "outputs");
  } catch (e) { if (typeof navigate === "function") navigate("industry"); }
}
function setNewsCat(f) { window.__newsCatFilter = f; render(); }

function renderIndustry() {
  var c = document.getElementById("app-content");
  var t = function (id, label) { return '<div class="chip' + (industrySub === id ? " active" : "") + '" onclick="setIndustrySub(\'' + id + '\')">' + label + '</div>'; };
  var tabBar = '<div class="filter-bar" style="margin-bottom:10px">' +
    t("news", "🌐 资讯情报") + t("history", "📅 历史回顾") + t("fav", "⭐ 收藏") + t("custom", "🤖 自定义情报") + t("opportunity", "📈 市场机会") + t("mine", "📋 我的情报") + t("outputs", "🤖 我的产出") +
    '</div>';
  if (industrySub === "history") c.innerHTML = tabBar + renderIntelHistory();
  else if (industrySub === "fav") c.innerHTML = tabBar + renderIntelFav();
  else if (industrySub === "custom") c.innerHTML = tabBar + renderIntelCustom();
  else if (industrySub === "opportunity") c.innerHTML = tabBar + renderIntelOpportunity();
  else if (industrySub === "mine") c.innerHTML = tabBar + renderMyIntel();
  else if (industrySub === "outputs") { c.innerHTML = tabBar + '<div id="aio-body"></div>'; if (typeof renderAiOutputs === "function") renderAiOutputs(); }
  else c.innerHTML = tabBar + renderLiveNews();
}

// 通用情报卡片（含收藏星标），供 资讯/历史 复用
function intelItemCard(item, dateStr, scope, idx, catLabel) {
  var fav = (typeof intelFavKey === "function") ? intelIsFav(DB.data.industryFav, intelFavKey(item, dateStr)) : false;
  var c = catLabel ? '<span class="badge" style="background:#3d7fd622;color:#3d7fd6">' + escapeHtml(catLabel) + '</span>' : '';
  var meta = [];
  if (item.source) meta.push(escapeHtml(item.source));
  if (item.pubTime) meta.push("🕒 " + escapeHtml(item.pubTime));
  else if (dateStr) meta.push("🕒 " + formatDateShort(dateStr));
  var tags = (item.tags || []).slice(0, 3).map(function (t) { return escapeHtml(t); }).join("/");
  var sum = item.summary || "";
  if (sum.length > 130) sum = sum.slice(0, 130) + "…";
  return '<div class="card">' +
    '<div class="card-header"><div class="card-title">' + escapeHtml(item.title) + '</div>' + c +
      '<button class="intel-star' + (fav ? " on" : "") + '" onclick="toggleIntelFav(\'' + scope + '\',' + idx + ')">' + (fav ? "★" : "☆") + '</button></div>' +
    (sum ? '<div class="card-body">' + escapeHtml(sum) + '</div>' : '') +
    '<div class="flex-between mt-12"><span class="text-xs text-secondary">' + meta.join(" · ") + (tags ? ' · ' + tags : '') + '</span>' +
      '<span class="intel-acts">' +
        (item.url ? '<a href="' + item.url + '" target="_blank" rel="noopener" class="source-link" onclick="event.stopPropagation()">🔗 原文 ↗</a>' : '') +
        '<button class="intel-act" onclick="openIntelComment(\'' + scope + '\',' + idx + ')">💬 ' + intelCommentCount(scope, idx) + '</button>' +
        intelExportBtn(scope, idx) +
      '</span>' +
    '</div></div>';
}

// —— 自动资讯（来自 Supabase Storage / news.json，每日 7:00 抓取）——
function renderLiveNews() {
  var nd = (typeof LiveData !== "undefined" && LiveData.news) ? LiveData.news : null;
  if (!nd || !nd.items || !nd.items.length) {
    return '<div class="empty-state"><div class="empty-icon">📰</div><div class="empty-text">今日资讯尚未生成<br>每日 7:00 自动抓取官媒与科技热点</div></div>';
  }
  if (window.__newsCatFilter == null) window.__newsCatFilter = "all";
  var cats = nd.categories || [];
  var catMap = {};
  cats.forEach(function (c) { catMap[c.key] = c.label; });
  var catHtml = '<div class="filter-bar" style="margin-bottom:8px">' +
    '<div class="chip' + (window.__newsCatFilter === "all" ? " active" : "") + '" onclick="setNewsCat(\'all\')">全部</div>' +
    cats.map(function(cat) { return '<div class="chip' + (window.__newsCatFilter === cat.key ? " active" : "") + '" onclick="setNewsCat(\'' + cat.key + '\')">' + (cat.icon || "") + ' ' + cat.label + '</div>'; }).join("") +
    '</div>';

  var items = nd.items.slice().sort(function(a, b) { return (a.priority || 5) - (b.priority || 5); });
  if (window.__newsCatFilter !== "all") items = items.filter(function(n) { return (n.category || "") === window.__newsCatFilter; });
  window.__liveNews = { items: items, date: (nd.generatedAt || "").slice(0, 10) };

  var list = items.map(function(n, idx) {
    return intelItemCard(n, window.__liveNews.date, "news", idx, catMap[n.category] || n.category);
  }).join("");

  var fresh = (nd.generatedAt && nd.generatedAt.slice(0, 10) === today()) ? '<span class="badge badge-green" style="margin-left:6px">今日已更新</span>' : '';
  return '<div class="enm-hint" style="margin-bottom:6px">每日 7:00 自动抓取官媒与科技热点' + fresh + ' · 点 ☆ 收藏</div>' + catHtml + list;
}

// —— 我的情报（手动粘贴录入）——
function renderMyIntel() {
  var allTags = Array.from(new Set(DB.data.industry.flatMap(function(i) { return i.tags; })));
  var tags = ["all"].concat(allTags);
  var filtered = DB.data.industry;
  if (currentFilter !== "all") filtered = filtered.filter(function(i) { return i.tags.indexOf(currentFilter) >= 0; });
  window.__myIntel = filtered;
  var html =
    '<div class="filter-bar">' + tags.map(function(t) { return '<div class="chip' + (currentFilter === t ? ' active' : '') + '" onclick="setFilter(\'' + t + '\')">' + (t === "all" ? "全部" : t) + '</div>'; }).join("") + '</div>' +
    '<div style="margin-bottom:12px"><button class="btn btn-secondary" onclick="openPasteIndustry()" style="width:100%;justify-content:center;gap:6px">📋 粘贴情报内容</button></div>' +
    (filtered.length === 0 ? '<div class="empty-state"><div class="empty-icon">📰</div><div class="empty-text">还没有行业情报</div></div>' : filtered.map(function(i, idx) {
      var key = intelFavKey(i, i.date); var fav = intelIsFav(DB.data.industryFav, key);
      return '<div class="card">' +
        '<div class="card-header"><div class="card-title">' + escapeHtml(i.title) + '</div>' + (i.important ? '<span class="badge badge-red">重要</span>' : '') +
          '<button class="intel-star' + (fav ? ' on' : '') + '" onclick="toggleIntelFav(\'mine\',' + idx + ')">' + (fav ? '★' : '☆') + '</button></div>' +
        '<div class="card-body">' + escapeHtml(i.summary) + '</div>' +
        '<div style="margin-top:8px">' + i.tags.map(function(t) { return '<span class="badge badge-teal">' + escapeHtml(t) + '</span>'; }).join("") + '</div>' +
        '<div class="flex-between mt-12">' +
          '<span class="text-xs text-secondary">' + escapeHtml(i.source) + ' · ' + formatDateShort(i.date) + '</span>' +
          '<span class="intel-acts">' +
            (i.url ? '<a href="' + i.url + '" target="_blank" rel="noopener" class="source-link" onclick="event.stopPropagation()">🔗 查看原文 →</a>' : '<button class="source-link" onclick="event.stopPropagation();editIndustryUrl(\'' + i.id + '\')">🔗 添加链接</button>') +
            '<button class="intel-act" onclick="openIntelComment(\'mine\',' + idx + ')">💬 ' + intelCommentCount('mine', idx) + '</button>' +
            intelExportBtn('mine', idx) +
          '</span>' +
        '</div>' +
      '</div>';
    }).join(""));
  return html;
}

// —— 历史回顾（微信聊天记录式：月历 + 聊天气泡）——
// 月历格子：monthStr 形如 "2026-08"；有留存的日期打红点
function intelCalCells(history, monthStr) {
  var hist = history || {};
  var y = parseInt(monthStr.slice(0, 4), 10);
  var m = parseInt(monthStr.slice(5, 7), 10);
  var first = new Date(Date.UTC(y, m - 1, 1, 12));
  var last = new Date(Date.UTC(y, m, 0, 12));
  var out = [];
  var lead = (first.getUTCDay() + 6) % 7; // 周一为一周起始
  for (var i = 0; i < lead; i++) out.push({ date: "", day: "", has: false, inMonth: false, today: false });
  for (var d = new Date(Date.UTC(y, m - 1, 1, 12)); d <= last; d.setUTCDate(d.getUTCDate() + 1)) {
    var ds = d.toISOString().slice(0, 10);
    out.push({ date: ds, day: d.getUTCDate(), has: !!hist[ds], inMonth: true, today: ds === (typeof today === "function" ? today() : "") });
  }
  return out;
}
function intelCalMonthNav(delta) {
  var y = parseInt(window.__intelCalMonth.slice(0, 4), 10);
  var m = parseInt(window.__intelCalMonth.slice(5, 7), 10);
  var d = new Date(Date.UTC(y, m - 1 + delta, 1, 12));
  window.__intelCalMonth = d.toISOString().slice(0, 7);
  render();
}
// 日期分隔条（微信聊天记录式居中时间胶囊）
function intelBubbleDateTag(dateStr) {
  var t = formatDateShort(dateStr);
  var now = new Date(); var d = new Date(dateStr + "T00:00:00");
  var diff = Math.floor((now - d) / 86400000);
  if (diff === 0 || diff === 1) return t;
  return t + " · " + (d.getMonth() + 1) + "月" + d.getDate() + "日 周" + "日一二三四五六".charAt(d.getDay());
}
function renderIntelHistory() {
  var history = DB.data.industryHistory || {};
  var dates = intelHistoryDates(history);
  if (!dates.length) {
    return '<div class="empty-state"><div class="empty-icon">📅</div><div class="empty-text">还没有历史推送记录<br>从今日起，每日 7:00 抓取的资讯会自动留存，可在此回顾</div></div>';
  }
  if (!window.__intelSelDate || dates.indexOf(window.__intelSelDate) < 0) window.__intelSelDate = dates[0];
  if (!window.__intelCalMonth) window.__intelCalMonth = window.__intelSelDate.slice(0, 7);
  if (window.__intelHistSearch == null) window.__intelHistSearch = "";
  if (window.__intelHistCat == null) window.__intelHistCat = "all";
  var sel = window.__intelSelDate;
  var day = history[sel] || {};
  var cats = day.categories || [];
  // 缓存当日基准数据，供搜索/筛选局部刷新（不丢焦点）
  window.__intelHistDay = { sel: sel, items: intelHistoryByDate(history, sel), cats: cats };

  // 月历卡片
  var cells = intelCalCells(history, window.__intelCalMonth);
  var calHtml = '<div class="wx-cal">' +
    '<div class="wx-cal-nav"><button class="btn btn-secondary" onclick="intelCalMonthNav(-1)" style="padding:4px 10px">‹</button>' +
      '<span class="wx-cal-month">' + window.__intelCalMonth + '</span>' +
      '<button class="btn btn-secondary" onclick="intelCalMonthNav(1)" style="padding:4px 10px">›</button></div>' +
    '<div class="wx-week-h"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div>' +
    '<div class="wx-cal-grid">' + cells.map(function (cell) {
      if (!cell.inMonth) return '<div class="wx-cell empty"></div>';
      var cls = "wx-cell";
      if (cell.today) cls += " today";
      if (cell.has) cls += " has";
      if (cell.date === sel) cls += " sel";
      return '<div class="' + cls + '" onclick="setIntelHistoryDate(\'' + cell.date + '\')">' +
        '<span class="wx-day">' + cell.day + '</span>' +
        (cell.has ? '<span class="wx-dot"></span>' : '') +
        '</div>';
    }).join("") + '</div>' +
    '<div class="wx-cal-legend"><span><i class="wx-dot"></i> 有情报</span><span><b>描边</b> 今天</span><span><b>高亮</b> 当前查看</span></div></div>';

  // 日期快捷条（横滑，保留快速切换）
  var dateBar = '<div class="wx-date-strip">' +
    dates.slice(0, 21).map(function(d) {
      return '<div class="wx-date-chip' + (d === sel ? ' active' : '') + '" onclick="setIntelHistoryDate(\'' + d + '\')">' +
        '<span class="wx-date-m">' + (d.slice(5, 7) + "/" + d.slice(8, 10)) + '</span>' +
        '<span class="wx-date-w">' + formatDateShort(d) + '</span></div>';
    }).join("") + '</div>';

  var catMap = {}; cats.forEach(function(c) { catMap[c.key] = c.label; });
  var catFilter = '<div class="filter-bar" style="margin:8px 0">' +
    '<div class="chip' + (window.__intelHistCat === "all" ? " active" : "") + '" onclick="setIntelHistCat(\'all\')">全部</div>' +
    cats.map(function (c) { return '<div class="chip' + (window.__intelHistCat === c.key ? " active" : "") + '" onclick="setIntelHistCat(\'' + c.key + '\')">' + escapeHtml(c.label) + '</div>'; }).join("") +
    '</div>';

  var searchBox = '<div class="intel-search-row">' +
    '<input id="intel-hist-search" class="intel-key" placeholder="🔍 搜索标题/摘要/来源…" value="' + escapeHtml(window.__intelHistSearch) + '" oninput="applyIntelHistFilter()">' +
    '<button id="intel-hist-clear" class="intel-search-clear" style="display:' + (window.__intelHistSearch ? "flex" : "none") + '" onclick="clearIntelHistSearch()">✕</button>' +
    '</div>';

  var head = '<div class="wx-chat-head">' +
    '<span class="wx-chat-title">💬 ' + sel + ' 情报记录</span>' +
    '<span class="wx-chat-count">' + intelHistoryByDate(history, sel).length + ' 条</span></div>';

  return '<div class="enm-hint" style="margin-bottom:6px">📅 已留存 ' + dates.length + ' 天资讯 · 点日历日期查看当天情报</div>' +
    calHtml + dateBar + head + searchBox + catFilter +
    '<div id="intel-hist-list">' + intelHistListHtml() + '</div>';
}
// 气泡列表 HTML（依据当前 搜索词 + 分类筛选 计算）——微信聊天记录样式
function intelHistListHtml() {
  var d = window.__intelHistDay;
  if (!d) return "";
  var catMap = {}; (d.cats || []).forEach(function (c) { catMap[c.key] = c.label; });
  var items = intelSearchItems(d.items, window.__intelHistSearch);
  items = intelFilterItemsByCategory(items, window.__intelHistCat);
  window.__liveNews = { items: items, date: d.sel };
  if (!items.length) return '<div class="empty-state" style="padding:18px 0"><div class="empty-icon">🔍</div><div class="empty-text">没有匹配的资讯</div></div>';
  return '<div class="wx-bubble-date">' + intelBubbleDateTag(d.sel) + '</div>' +
    items.map(function (n, idx) {
      return intelBubbleCard(n, d.sel, idx, catMap[n.category] || n.category);
    }).join("");
}
// 单条情报气泡（微信风格：左侧头像点 + 白色圆角气泡）
function intelBubbleCard(item, dateStr, idx, catLabel) {
  var fav = (typeof intelFavKey === "function") ? intelIsFav(DB.data.industryFav, intelFavKey(item, dateStr)) : false;
  var c = catLabel ? '<span class="wx-bubble-cat">' + escapeHtml(catLabel) + '</span>' : '';
  var meta = [];
  if (item.source) meta.push(escapeHtml(item.source));
  var pub = item.pubTime || "";
  // 微信风格：同一留存日的条目只显示时间（时分）；纯日期且同一天则省略
  if (pub) {
    if (pub.slice(0, 10) === dateStr) pub = pub.slice(11).trim();
    if (pub) meta.push("🕒 " + escapeHtml(pub));
  }
  var tags = (item.tags || []).slice(0, 3).map(function (t) { return escapeHtml(t); }).join("/");
  var sum = item.summary || "";
  if (sum.length > 150) sum = sum.slice(0, 150) + "…";
  var star = '<button class="intel-star' + (fav ? " on" : "") + '" onclick="toggleIntelFav(\'news\',' + idx + ')">' + (fav ? "★" : "☆") + '</button>';
  return '<div class="wx-msg">' +
    '<div class="wx-avatar">📰</div>' +
    '<div class="wx-bubble">' +
      '<div class="wx-bubble-h">' + c + '<span class="wx-bubble-meta">' + meta.join(" · ") + (tags ? ' · ' + tags : '') + '</span>' + star + '</div>' +
      '<div class="wx-bubble-title">' + escapeHtml(item.title) + '</div>' +
      (sum ? '<div class="wx-bubble-body">' + escapeHtml(sum) + '</div>' : '') +
      '<div class="wx-bubble-acts">' +
        (item.url ? '<a href="' + item.url + '" target="_blank" rel="noopener" class="source-link" onclick="event.stopPropagation()">🔗 原文 ↗</a>' : '') +
        '<button class="intel-act" onclick="openIntelComment(\'news\',' + idx + ')">💬 ' + intelCommentCount('news', idx) + '</button>' +
        intelExportBtn('news', idx) +
      '</div>' +
    '</div></div>';
}
// 关键词输入：仅刷新列表，保持输入框焦点
function applyIntelHistFilter() {
  var el = document.getElementById("intel-hist-search");
  window.__intelHistSearch = el ? el.value : "";
  var list = document.getElementById("intel-hist-list");
  if (list) list.innerHTML = intelHistListHtml();
  var cb = document.getElementById("intel-hist-clear");
  if (cb) cb.style.display = window.__intelHistSearch ? "flex" : "none";
}
function clearIntelHistSearch() {
  window.__intelHistSearch = "";
  var el = document.getElementById("intel-hist-search");
  if (el) el.value = "";
  var cb = document.getElementById("intel-hist-clear");
  if (cb) cb.style.display = "none";
  var list = document.getElementById("intel-hist-list");
  if (list) list.innerHTML = intelHistListHtml();
}
function setIntelHistCat(catKey) { window.__intelHistCat = catKey; render(); }
function setIntelHistoryDate(d) { window.__intelSelDate = d; render(); }

// —— 收藏列表（按分类分组 + 筛选 + 重命名/删除分类）——
function renderIntelFav() {
  var fav = DB.data.industryFav || [];
  window.__favItems = fav;
  if (!fav.length) {
    return '<div class="empty-state"><div class="empty-icon">⭐</div><div class="empty-text">还没有收藏的情报<br>在资讯 / 历史 / 我的情报中点击 ☆ 即可收藏并选择分类</div></div>';
  }
  var cats = DB.data.industryFavCats || [];
  if (window.__intelFavFilter == null) window.__intelFavFilter = "all";
  if (window.__intelFavSearch == null) window.__intelFavSearch = "";
  window.__intelFavBase = fav; // 供搜索局部刷新
  var hint = '<div class="intel-fav-hint"><div class="intel-fav-hint-l">已收藏 <b>' + fav.length + '</b> 条 · ' + cats.length + ' 个分类</div>' +
    '<button class="intel-export-btn" onclick="downloadIntelFavExport()">📤 导出</button></div>';
  var searchBox = '<div class="intel-search-row">' +
    '<input id="intel-fav-search" class="intel-key" placeholder="🔍 搜索标题/摘要/评论…" value="' + escapeHtml(window.__intelFavSearch) + '" oninput="applyIntelFavFilter()">' +
    '<button id="intel-fav-clear" class="intel-search-clear" style="display:' + (window.__intelFavSearch ? "flex" : "none") + '" onclick="clearIntelFavSearch()">✕</button>' +
    '</div>';
  var filterBar = '<div class="filter-bar" style="margin:8px 0">' +
    '<div class="chip' + (window.__intelFavFilter === "all" ? " active" : "") + '" onclick="setIntelFavFilter(\'all\')">全部</div>' +
    cats.map(function (c) { return '<div class="chip' + (window.__intelFavFilter === c.id ? " active" : "") + '" onclick="setIntelFavFilter(\'' + c.id + '\')">' + escapeHtml(c.name) + '</div>'; }).join("") +
    '</div>';
  return hint + searchBox + filterBar + '<div id="intel-fav-body">' + intelFavBodyHtml() + '</div>';
}

// 收藏分组 HTML（依据当前 搜索词 + 分类筛选 计算）；卡片索引指向原始收藏数组
function intelFavBodyHtml() {
  var fav = window.__intelFavBase || [];
  var cats = DB.data.industryFavCats || [];
  var searched = intelSearchFav(fav, window.__intelFavSearch, DB.data.industryComments);
  var visible = (window.__intelFavFilter === "all") ? searched : searched.filter(function (f) { return (f.catId || "") === window.__intelFavFilter; });
  if (!visible.length) return '<div class="empty-state" style="padding:18px 0"><div class="empty-icon">🔍</div><div class="empty-text">没有匹配的收藏</div></div>';
  var groups = [];
  cats.forEach(function (c) { groups.push({ cat: c, items: visible.filter(function (f) { return (f.catId || "") === c.id; }) }); });
  var uncat = visible.filter(function (f) { return !f.catId || !cats.some(function (c) { return c.id === f.catId; }); });
  if (uncat.length) groups.push({ cat: { id: "", name: "未分类" }, items: uncat });
  return groups.filter(function (g) { return g.items.length; }).map(function (g) {
    var header = '<div class="intel-fav-group-h"><span>' + escapeHtml(g.cat.name) + ' · ' + g.items.length + '</span>' +
      (g.cat.id ? '<span class="intel-fav-group-acts"><button class="intel-cmt-del" onclick="renameIntelFavCat(\'' + g.cat.id + '\')">✎ 重命名</button><button class="intel-cmt-del" onclick="removeIntelFavCat(\'' + g.cat.id + '\')">🗑 删除</button></span>' : '') +
      '</div>';
    var cards = g.items.map(function (f) {
      var realIdx = fav.indexOf(f);
      var meta = [];
      if (f.source) meta.push(escapeHtml(f.source));
      meta.push("🕒 " + formatDateShort(f.date));
      var tags = (f.tags || []).slice(0, 3).map(function (t) { return escapeHtml(t); }).join("/");
      return '<div class="card">' +
        '<div class="card-header"><div class="card-title">' + escapeHtml(f.title) + '</div>' +
          '<button class="intel-star on" onclick="toggleIntelFav(\'fav\',' + realIdx + ')">★</button></div>' +
        (f.summary ? '<div class="card-body">' + escapeHtml(f.summary) + '</div>' : '') +
        '<div style="margin-top:8px">' + (f.tags || []).map(function (t) { return '<span class="badge badge-teal">' + escapeHtml(t) + '</span>'; }).join("") + '</div>' +
        '<div class="flex-between mt-12"><span class="text-xs text-secondary">' + meta.join(" · ") + (tags ? ' · ' + tags : '') + '</span>' +
          '<span class="intel-acts">' +
            (f.url ? '<a href="' + f.url + '" target="_blank" rel="noopener" class="source-link" onclick="event.stopPropagation()">🔗 原文 ↗</a>' : '') +
            '<button class="intel-act" onclick="openIntelComment(\'fav\',' + realIdx + ')">💬 ' + intelCommentCount('fav', realIdx) + '</button>' +
            intelExportBtn('fav', realIdx) +
          '</span>' +
        '</div></div>';
    }).join("");
    return header + cards;
  }).join("");
}

// 收藏搜索：仅刷新分组，保持输入框焦点
function applyIntelFavFilter() {
  var el = document.getElementById("intel-fav-search");
  window.__intelFavSearch = el ? el.value : "";
  var body = document.getElementById("intel-fav-body");
  if (body) body.innerHTML = intelFavBodyHtml();
  var cb = document.getElementById("intel-fav-clear");
  if (cb) cb.style.display = window.__intelFavSearch ? "flex" : "none";
}
function clearIntelFavSearch() {
  window.__intelFavSearch = "";
  var el = document.getElementById("intel-fav-search");
  if (el) el.value = "";
  var cb = document.getElementById("intel-fav-clear");
  if (cb) cb.style.display = "none";
  var body = document.getElementById("intel-fav-body");
  if (body) body.innerHTML = intelFavBodyHtml();
}
// 导出收藏（含分类名 + 评论数）为 JSON 下载
function downloadIntelFavExport() {
  if (typeof ensureIndustry === "function") ensureIndustry();
  var fav = DB.data.industryFav || [];
  var cats = DB.data.industryFavCats || [];
  var catName = function (id) { return intelFavCatName(cats, id); };
  var rows = fav.map(function (f) {
    return {
      title: f.title, summary: f.summary, source: f.source, url: f.url,
      date: f.date, category: catName(f.catId), tags: f.tags || [],
      commentCount: (DB.data.industryComments && f.key && DB.data.industryComments[f.key]) ? DB.data.industryComments[f.key].length : 0
    };
  });
  try {
    var blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), count: rows.length, favorites: rows }, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = "硬件PM情报收藏_" + today() + ".json";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (typeof showToast === "function") showToast("已导出 " + rows.length + " 条收藏", "success");
  } catch (e) {
    if (typeof showToast === "function") showToast("导出失败：" + (e && e.message ? e.message : e), "error");
  }
}

// —— 自定义情报（免费大模型按需求收集）——
function renderIntelCustom() {
  var cfg = (typeof loadAiConfig === "function") ? loadAiConfig() : {};
  var defProv = cfg.provider || "gemini";
  var provOpts = Object.keys(INTEL_PROVIDERS).map(function(k) {
    var p = INTEL_PROVIDERS[k];
    var sel = (defProv === k) ? " selected" : "";
    return '<option value="' + k + '"' + sel + '>' + p.name + intelProvBadge(k) + '</option>';
  }).join("");
  var keyVal = cfg.key ? cfg.key : "";
  var input =
    '<div class="card intel-custom">' +
      '<div class="card-title">🤖 按需求收集情报</div>' +
      '<textarea id="intel-need" class="intel-need" rows="3" placeholder="例如：调研折叠屏铰链供应商格局与成本趋势 / 分析磁吸车载支架海外差评痛点 / 跟进 AI 硬件最新融资动态"></textarea>' +
      '<div class="intel-row"><select id="intel-prov" class="intel-prov">' + provOpts + '</select></div>' +
      '<div class="intel-row"><input id="intel-key" class="intel-key" type="password" placeholder="API Key（仅存本机）" value="' + escapeHtml(keyVal) + '"></div>' +
      '<label class="intel-ws"><input type="checkbox" id="intel-ws"' + ((cfg.webSearch !== false) ? " checked" : "") + ' onchange="intelToggleWs(this)"> 🌐 联网检索（获取真实来源链接·智谱搜索约¥0.01/次）</label>' +
      '<button id="intel-gen-btn" class="btn btn-primary" style="width:100%;justify-content:center;gap:6px" onclick="intelGenerate()">🤖 生成情报</button>' +
      '<div id="intel-gen-err" class="intel-gen-err" style="display:none"></div>' +
      '<div class="intel-help">默认 <b>Gemini（AI Studio 免费 Key · 联网搜索带来源）</b>；大陆需开 VPN 直连。无 VPN 可改用 <b>智谱 GLM-4-Flash / 硅基流动（国内·免费）</b>。Key 仅存本机，不上云。</div>' +
      '<div class="intel-guide-link"><button class="intel-export-btn" onclick="openFreeApiGuide()">🔑 如何获取免费 Key（Gemini / 智谱）？</button></div>' +
    '</div>';

  var results = DB.data.industryCustom || [];
  var flat = [];
  var resHtml = results.length ? '' : '<div class="empty-state"><div class="empty-icon">🤖</div><div class="empty-text">还没有自定义情报<br>输入需求，让免费大模型帮你收集</div></div>';
  if (results.length) {
    resHtml = results.map(function(r) {
      var itemsHtml = (r.items || []).map(function(it, j) {
        var fIdx = flat.length;
        var flatItem = { id: r.id + "#" + j, title: it.title, summary: it.point, source: it.source, url: it.url, tags: it.tags || [], date: r.date, origin: "custom" };
        flat.push(flatItem);
        var fav = intelIsFav(DB.data.industryFav, intelFavKey(flatItem, r.date));
        var meta = [];
        if (it.source) meta.push(escapeHtml(it.source));
        var tags = (it.tags || []).slice(0, 3).map(function(t) { return escapeHtml(t); }).join("/");
        return '<div class="intel-sub">' +
          '<div class="intel-sub-head"><span>' + escapeHtml(it.title) + '</span>' +
            '<button class="intel-star' + (fav ? ' on' : '') + '" onclick="toggleIntelFav(\'custom\',' + fIdx + ')">' + (fav ? '★' : '☆') + '</button></div>' +
          (it.point ? '<div class="intel-sub-body">' + escapeHtml(it.point) + '</div>' : '') +
          '<div class="flex-between mt-12"><span class="text-xs text-secondary">' + meta.join(" · ") + (tags ? ' · ' + tags : '') + '</span>' +
            '<span class="intel-acts">' +
              (it.url ? '<a href="' + it.url + '" target="_blank" rel="noopener" class="source-link" onclick="event.stopPropagation()">🔗 来源 ↗</a>' : '') +
              '<button class="intel-act" onclick="openIntelComment(\'custom\',' + fIdx + ')">💬 ' + intelCommentCount('custom', fIdx) + '</button>' +
              intelExportBtn('custom', fIdx) +
            '</span>' +
          '</div></div>';
      }).join("");
      var srcHtml = (r.sources || []).length ? '<div class="intel-sources">参考来源：' + (r.sources || []).map(function(s) {
        return s.url ? '<a href="' + s.url + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">' + escapeHtml(s.title || s.url) + ' ↗</a>' : escapeHtml(s.title || "");
      }).join(" · ") + '</div>' : '';
      return '<div class="card" style="margin-top:10px">' +
        '<div class="card-header"><div class="card-title">' + escapeHtml(r.title) + '</div><span class="badge" style="background:#7c5cff22;color:#7c5cff">自定义</span></div>' +
        (r.summary ? '<div class="card-body">' + escapeHtml(r.summary) + '</div>' : '') +
        (r.need ? '<div class="enm-hint" style="margin:6px 0">需求：' + escapeHtml(r.need) + '</div>' : '') +
        itemsHtml + srcHtml +
        '<div class="intel-custom-actions"><button class="intel-export-btn" onclick="saveCustomToMyIntel(\'' + r.id + '\')">📥 转存「我的情报」</button><button class="intel-export-btn" onclick="goAiOutputs()">🤖 我的产出</button></div>' +
      '</div>';
    }).join("");
  }
  window.__customIntelItems = flat;
  return input + resHtml;
}

// —— 市场机会（六维分析 · 免费大模型）——
function renderIntelOpportunity() {
  var cfg = (typeof loadAiConfig === "function") ? loadAiConfig() : {};
  var defProv = cfg.provider || "gemini";
  var provOpts = Object.keys(INTEL_PROVIDERS).map(function (k) {
    var p = INTEL_PROVIDERS[k];
    var sel = (defProv === k) ? " selected" : "";
    return '<option value="' + k + '"' + sel + '>' + p.name + intelProvBadge(k) + '</option>';
  }).join("");
  var keyVal = cfg.key ? cfg.key : "";
  var input =
    '<div class="card intel-custom mkt-input">' +
      '<div class="card-title">📈 市场机会研究</div>' +
      '<div class="enm-hint" style="margin:4px 0 10px">输入你想研究的市场，用<b>国内免费大模型（智谱/硅基流动·直连）</b>生成六维市场机会报告（规模/渗透/增量/未满足需求/蓝海/替代）。</div>' +
      '<textarea id="mkt-market" class="intel-need" rows="2" placeholder="例如：折叠屏手机支架 / 便携美拍镜 / 散热无线充电宝 / MagSafe 磁吸风扇灯 / 挂腰摄影风扇"></textarea>' +
      '<div class="intel-row"><select id="mkt-prov" class="intel-prov">' + provOpts + '</select></div>' +
      '<div class="intel-row"><input id="mkt-key" class="intel-key" type="password" placeholder="API Key（仅存本机，与自定义情报共享）" value="' + escapeHtml(keyVal) + '"></div>' +
      '<label class="intel-ws"><input type="checkbox" id="mkt-ws"' + ((cfg.webSearch !== false) ? " checked" : "") + ' onchange="intelToggleWs(this)"> 🌐 联网检索（获取真实来源链接·智谱搜索约¥0.01/次）</label>' +
      '<button id="mkt-gen-btn" class="btn btn-primary" style="width:100%;justify-content:center;gap:6px" onclick="mktGenerate()">📈 生成市场机会报告</button>' +
      '<div id="mkt-gen-err" class="intel-gen-err" style="display:none"></div>' +
      '<div class="intel-help">默认 <b>Gemini（AI Studio 免费 Key · 联网搜索带来源）</b>；大陆需开 VPN 直连。无 VPN 可改用 <b>智谱 GLM-4-Flash / 硅基流动（国内·免费）</b>，与「🤖 自定义情报」共享配置，已设置则自动沿用。Key 仅存本机、不上云。</div>' +
      '<div class="intel-guide-link"><button class="intel-export-btn" onclick="openFreeApiGuide()">🔑 如何获取免费 Key（Gemini / 智谱）？</button></div>' +
    '</div>';

  var list = DB.data.marketOpp || [];
  var resHtml = list.length ? '' : '<div class="empty-state"><div class="empty-icon">📈</div><div class="empty-text">还没有市场机会报告<br>输入一个市场，让免费大模型帮你做六维机会分析</div></div>';
  if (list.length) {
    resHtml = list.slice().reverse().map(function (r) { return mktReportCard(r); }).join("");
  }
  return input + resHtml;
}

// 联网检索开关：写入共享 AI 配置（智谱 Web Search，用于产出真实来源链接）
function intelToggleWs(el) {
  var cfg = (typeof loadAiConfig === "function") ? loadAiConfig() : {};
  cfg.webSearch = !!el.checked;
  if (typeof saveAiConfig === "function") saveAiConfig(cfg);
}

// 市场机会评级徽章
function mktRatingBadge(rating) {
  var map = { "高": ["badge-red", "高机会"], "中": ["badge-orange", "中机会"], "低": ["badge-gray", "低机会"] };
  var key = String(rating || "").trim();
  var m = map[key] || ["badge-blue", (key ? "机会:" + key : "待评级")];
  return '<span class="badge ' + m[0] + '">' + m[1] + '</span>';
}
function mktKv(k, v) {
  if (!v) return "";
  return '<div class="mkt-kv"><span class="mkt-k">' + escapeHtml(k) + '</span><span class="mkt-v">' + escapeHtml(v) + '</span></div>';
}
function mktTbl(headers, rows) {
  if (!rows || !rows.length) return "";
  var th = headers.map(function (h) { return '<th>' + escapeHtml(h) + '</th>'; }).join("");
  var tr = rows.map(function (row) {
    return '<tr>' + row.map(function (c) { return '<td>' + escapeHtml(c == null ? "" : c) + '</td>'; }).join("") + '</tr>';
  }).join("");
  return '<table class="mkt-tbl"><thead><tr>' + th + '</tr></thead><tbody>' + tr + '</tbody></table>';
}
function mktDim(title, body) {
  if (!body) return "";
  return '<div class="mkt-dim"><div class="mkt-dim-t">' + title + '</div>' + body + '</div>';
}
// 渲染一条市场机会报告（六维）
function mktReportCard(r) {
  if (!r) return "";
  var d = r.dims || {};
  var s = d.scale || {}, pen = d.penetration || {}, inc = d.increment || {}, unm = d.unmet || {}, blue = d.blueocean || {}, sub = d.substitution || {};

  var scaleHtml = mktKv("当前规模(TAM)", s.tam) + mktKv("增速(CAGR)", s.cagr);
  if (s.segments && s.segments.length) scaleHtml += mktTbl(["细分市场", "规模", "占比", "增速", "阶段"], s.segments.map(function (x) { return [x.name, x.size, x.share, x.growth, x.stage]; }));
  if (s.drivers && s.drivers.length) scaleHtml += '<div class="mkt-sub">驱动因素</div>' + mktTbl(["驱动因素", "影响"], s.drivers.map(function (x) { return [x.factor, x.impact]; }));

  var penHtml = mktKv("当前渗透率", pen.rate) + mktKv("理论上限", pen.ceiling) + mktKv("剩余空间", pen.space) + mktKv("生命周期", pen.stage);
  if (pen.segments && pen.segments.length) penHtml += mktTbl(["群体/区域/场景", "渗透率", "与总体差距", "增长潜力"], pen.segments.map(function (x) { return [x.group, x.rate, x.gap, x.potential]; }));

  var incHtml = mktKv("存量规模", inc.stock) + mktKv("增量规模", inc.incremental);
  if (inc.sources && inc.sources.length) incHtml += mktTbl(["增量来源", "规模", "占比", "增速"], inc.sources.map(function (x) { return [x.source, x.size, x.share, x.growth]; }));
  if (inc.scenarios && inc.scenarios.length) incHtml += mktTbl(["情景", "假设", "增量空间", "概率"], inc.scenarios.map(function (x) { return [x.name, x.assumption, x.space, x.prob]; }));

  var unmHtml = "";
  if (unm.needs && unm.needs.length) unmHtml += '<div class="mkt-sub">需求层次</div>' + mktTbl(["需求", "满足度", "缺口", "优先级"], unm.needs.map(function (x) { return [x.need, x.satisfaction, x.gap, x.priority]; }));
  if (unm.pains && unm.pains.length) unmHtml += '<div class="mkt-sub">用户痛点</div>' + mktTbl(["痛点", "影响", "普遍性", "解决难度", "机会价值"], unm.pains.map(function (x) { return [x.pain, x.impact, x.universality, x.solutionDifficulty, x.opportunityValue]; }));
  if (unm.trends && unm.trends.length) unmHtml += '<div class="mkt-sub">需求趋势</div>' + mktTbl(["趋势", "速度", "潜力"], unm.trends.map(function (x) { return [x.trend, x.speed, x.potential]; }));

  var blueHtml = "";
  if (blue.redsea && (blue.redsea.competition || blue.redsea.priceWar || blue.redsea.profit || blue.redsea.diff)) {
    blueHtml += mktKv("竞争强度", blue.redsea.competition) + mktKv("价格战", blue.redsea.priceWar) + mktKv("利润空间", blue.redsea.profit) + mktKv("差异化", blue.redsea.diff);
  }
  if (blue.canvas && blue.canvas.length) blueHtml += '<div class="mkt-sub">价值曲线画布</div>' + mktTbl(["竞争要素", "行业", "我们", "动作"], blue.canvas.map(function (x) { return [x.factor, x.industry, x.ours, x.action]; }));
  if (blue.opportunities && blue.opportunities.length) blueHtml += '<div class="mkt-sub">蓝海机会</div>' + mktTbl(["机会", "目标用户", "价值主张", "可行性", "评分"], blue.opportunities.map(function (x) { return [x.desc, x.target, x.value, x.feasibility, x.score]; }));

  var subHtml = "";
  if (sub.direct && sub.direct.length) subHtml += '<div class="mkt-sub">直接替代品</div>' + mktTbl(["替代品", "替代度", "威胁", "趋势"], sub.direct.map(function (x) { return [x.item, x.degree, x.threat, x.trend]; }));
  if (sub.adjacent && sub.adjacent.length) subHtml += '<div class="mkt-sub">相邻/跨界市场</div>' + mktTbl(["相邻市场", "关联度", "进入难度", "机会"], sub.adjacent.map(function (x) { return [x.market, x.relevance, x.difficulty, x.opportunity]; }));
  if (sub.opportunities && sub.opportunities.length) subHtml += '<div class="mkt-sub">替代市场机会</div>' + mktTbl(["机会", "替代逻辑", "相对优势", "潜在规模"], sub.opportunities.map(function (x) { return [x.desc, x.logic, x.advantage, x.size]; }));

  var findings = (r.findings || []).map(function (f) { return '<li>' + escapeHtml(f) + '</li>'; }).join("");
  var sugg = (r.suggestions || []).map(function (f) { return '<li>' + escapeHtml(f) + '</li>'; }).join("");
  var src = (r.sources || []).map(function (x) { return x.url ? '<a href="' + x.url + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">' + escapeHtml(x.title || x.url) + ' ↗</a>' : escapeHtml(x.title || ""); }).join(" · ");

  return '<div class="card mkt-report">' +
    '<div class="card-header"><div class="card-title">📈 ' + escapeHtml(r.market || "市场机会") + '</div>' + mktRatingBadge(r.rating) +
      '<button class="intel-act" onclick="mktDelete(\'' + r.id + '\')">🗑</button></div>' +
    (r.summary ? '<div class="card-body">' + escapeHtml(r.summary) + '</div>' : '') +
    (r.ratingReason ? '<div class="enm-hint">评级理由：' + escapeHtml(r.ratingReason) + '</div>' : '') +
    mktDim("📊 市场规模", scaleHtml) +
    mktDim("🌊 渗透率", penHtml) +
    mktDim("📈 增量空间", incHtml) +
    mktDim("💡 未被满足需求", unmHtml) +
    mktDim("🌟 蓝海机会", blueHtml) +
    mktDim("🔄 替代市场", subHtml) +
    (findings ? '<div class="mkt-sec"><div class="mkt-sec-t">🔑 核心发现</div><ul class="mkt-ul">' + findings + '</ul></div>' : '') +
    (sugg ? '<div class="mkt-sec"><div class="mkt-sec-t">✅ 行动建议</div><ul class="mkt-ul">' + sugg + '</ul></div>' : '') +
    (src ? '<div class="intel-sources">参考来源：' + src + '</div>' : '') +
    '<div class="mkt-card-actions"><button class="intel-export-btn" onclick="goAiOutputs()">🤖 查看「我的产出」</button></div>' +
  '</div>';
}

// 生成市场机会报告（复用共享 AI 配置 + callLLMForPrompt 六维提示词）
async function mktGenerate() {
  var mEl = document.getElementById("mkt-market");
  var provEl = document.getElementById("mkt-prov");
  var keyEl = document.getElementById("mkt-key");
  var btn = document.getElementById("mkt-gen-btn");
  if (!mEl || !provEl || !keyEl) return;
  var market = mEl.value.trim();
  var provider = provEl.value;
  var key = keyEl.value.trim();
  if (!market) { if (typeof showToast === "function") showToast("请先输入你想研究的市场", "warn"); if (mEl) mEl.focus(); return; }
  if (!key) { if (typeof showToast === "function") showToast("请填写 API Key（免费获取见下方说明）", "warn"); if (keyEl) keyEl.focus(); return; }
  if (typeof saveAiConfig === "function") saveAiConfig({ provider: provider, key: key });
  var errBox = document.getElementById("mkt-gen-err");
  if (errBox) errBox.style.display = "none";
  if (btn) { btn.disabled = true; btn.textContent = "📈 生成中…（约 20-40 秒）"; }
  try {
    var prompt = marketOpportunityPrompt(market, typeof today === "function" ? today() : "nodate");
    var parsed = await callLLMForPrompt(provider, key, prompt);
    var obj = parseMarketOpportunity(parsed.text);
    var result = buildMarketOpportunityResult(obj, { market: market, provider: provider, sources: parsed.sources, text: parsed.text, date: (typeof today === "function" ? today() : "nodate") });
    DB.data.marketOpp = DB.data.marketOpp || [];
    DB.data.marketOpp.unshift(result);
    DB.save();
    if (typeof DB.logActivity === "function") DB.logActivity("industry", "生成市场机会报告：" + market);
    if (typeof showToast === "function") showToast("已生成「" + market + "」市场机会报告", "success");
    render();
  } catch (e) {
    var msg = (e && e.message ? e.message : String(e));
    if (errBox) {
      errBox.style.display = "block";
      errBox.textContent = "❌ 生成失败：" + msg;
      if (typeof showToast === "function") showToast("生成失败，详见下方红字提示", "error");
    } else {
      if (typeof showToast === "function") showToast("生成失败：" + msg.slice(0, 80), "error");
    }
    if (btn) { btn.disabled = false; btn.textContent = "📈 生成市场机会报告"; }
  }
}

// 删除市场机会报告
function mktDelete(id) {
  if (typeof confirm === "function" && !confirm("确定删除这份市场机会报告？")) return;
  DB.data.marketOpp = (DB.data.marketOpp || []).filter(function (r) { return r.id !== id; });
  DB.save();
  render();
}

// 自定义情报 → 一键转存为「我的情报」
function saveCustomToMyIntel(id) {
  var list = DB.data.industryCustom || [];
  var r = null;
  for (var i = 0; i < list.length; i++) { if (list[i].id === id) { r = list[i]; break; } }
  if (!r) { if (typeof showToast === "function") showToast("未找到该条情报", "warn"); return; }
  if (typeof ensureIndustry === "function") ensureIndustry();
  DB.data.industry = DB.data.industry || [];
  var entries = customIntelToMyIntel(r);
  DB.data.industry = entries.concat(DB.data.industry); // 新转存的置顶
  DB.save();
  if (typeof DB.logActivity === "function") DB.logActivity("industry", "转存自定义情报到我的情报：" + (r.title || ""));
  if (typeof showToast === "function") showToast("已转存 " + entries.length + " 条到「我的情报」", "success");
  render();
}

// —— Gemini Key 申请引导页（应用内）——
function openFreeApiGuide() {
  var step = function (n, title, body) {
    return '<div class="gemini-step"><span class="gemini-step-num">' + n + '</span><div class="gemini-step-body"><div class="gemini-step-t">' + title + '</div><div class="gemini-step-d">' + body + '</div></div></div>';
  };
  var html =
    '<div class="modal-title">🔑 获取免费大模型 Key</div>' +
    '<div class="gemini-guide">' +
      '<div style="margin-bottom:10px;color:var(--text-secondary);font-size:13px"><b>默认模型：Google Gemini（AI Studio 免费 Key · 联网搜索带来源链接）</b>。Gemini 在大陆需开 VPN 才能直连；若不便用 VPN，可改用下方国内免费方案兜底。</div>' +
      step(1, "方案A·Gemini（推荐·免费·有来源）", '打开 <a href="https://aistudio.google.com/" target="_blank" rel="noopener">aistudio.google.com</a>，用 Google 账号登录，左侧「Get API key」创建密钥（<b>免费额度、无需信用卡、带 google_search 接地可返回真实来源链接</b>）。<br><b>注意：大陆网络需开启 VPN 后才能调用。</b>') +
      step(2, "方案B·智谱 GLM-4-Flash（国内·永久免费）", '打开 <a href="https://open.bigmodel.cn/" target="_blank" rel="noopener">open.bigmodel.cn</a>，手机号注册登录，进入「API Keys」创建密钥（无需信用卡、国内直连）。') +
      step(3, "方案C·硅基流动 SiliconFlow（国内·多模型免费）", '打开 <a href="https://cloud.siliconflow.cn/" target="_blank" rel="noopener">cloud.siliconflow.cn</a>，手机号注册，左侧「API 密钥」新建密钥；免费模型含 Qwen2.5-7B、GLM-4-9B 等。') +
      step(4, "复制 Key 并回填", "复制密钥（Gemini 形如 <code>AIza...</code>，国内厂形如 <code>xxx.xxxx</code>），妥善保存、勿公开；回到本模块在 API Key 框粘贴即可（与「🤖 自定义情报 / 📈 市场机会 / 爆款视频 / 市场调研」共享配置）。Key 仅存本机、不上云。") +
    '</div>' +
    '<div class="gemini-tip">💡 默认模型已设为「Gemini」；有 VPN 直接用，享受联网检索 + 真实来源。无 VPN 时在下拉切「智谱 GLM-4-Flash / 硅基流动」。联网检索开关默认开启（Gemini 接地≈免费，国内模型约¥0.01/次）。</div>' +
    '<div class="btn-row" style="margin-top:14px"><button class="btn btn-secondary" onclick="closeModal()">关闭</button><button class="btn btn-primary" onclick="closeFreeApiGuide()">我已复制 Key，去填写 →</button></div>';
  showModal(html);
}
function closeFreeApiGuide() {
  closeModal();
  var k = document.getElementById("intel-key");
  if (k) k.focus();
}

// —— 收藏切换：点击 ☆ 打开分类选择器（不再直接 toggle）——
function toggleIntelFav(scope, idx) {
  var r = resolveIntelItem(scope, idx);
  if (!r) return;
  openIntelFavPicker(scope, idx);
}

// 解析某张卡片对应的条目与收藏状态（收藏 / 评论共用）
function resolveIntelItem(scope, idx) {
  var item = null, dateStr = null;
  if (scope === "news") { var l = window.__liveNews; if (l) { item = l.items[idx]; dateStr = l.date; } }
  else if (scope === "mine") { item = (window.__myIntel || [])[idx]; }
  else if (scope === "custom") { item = (window.__customIntelItems || [])[idx]; }
  else if (scope === "fav") { item = (window.__favItems || [])[idx]; }
  if (!item) return null;
  var key = item.key || intelFavKey(item, dateStr);
  var isFav = intelIsFav(DB.data.industryFav, key);
  var catId = null;
  if (isFav) {
    var f = null;
    for (var i = 0; i < DB.data.industryFav.length; i++) { if (DB.data.industryFav[i].key === key) { f = DB.data.industryFav[i]; break; } }
    catId = f ? f.catId : null;
  }
  return { item: item, dateStr: dateStr, key: key, isFav: isFav, catId: catId, title: item.title || "" };
}

// —— 收藏分类选择器 ——
function openIntelFavPicker(scope, idx) {
  var r = resolveIntelItem(scope, idx);
  if (!r) return;
  var cats = DB.data.industryFavCats || [];
  window.__favPick = {
    scope: scope, idx: idx, key: r.key, isFav: r.isFav, title: r.title,
    catId: r.catId || (cats[0] ? cats[0].id : null)
  };
  renderIntelFavPicker();
}
function renderIntelFavPicker() {
  var p = window.__favPick;
  if (!p) return;
  var cats = DB.data.industryFavCats || [];
  var chips = cats.map(function (c) {
    return '<div class="chip' + (c.id === p.catId ? " active" : "") + '" onclick="setIntelFavCat(\'' + c.id + '\')">' + escapeHtml(c.name) + '</div>';
  }).join("");
  var html =
    '<div class="modal-title">⭐ 收藏到分类</div>' +
    '<div class="intel-fav-item">' + escapeHtml(p.title || "") + '</div>' +
    '<div class="form-label">选择分类</div>' +
    '<div class="filter-bar intel-cat-chips">' + chips + '</div>' +
    '<div class="intel-row" style="display:flex;gap:8px;margin-top:10px">' +
      '<input id="intel-new-cat" class="intel-key" placeholder="自定义分类名称…" style="flex:1">' +
      '<button class="btn btn-secondary" onclick="addIntelFavCat()">+ 添加</button>' +
    '</div>' +
    '<div class="btn-row" style="margin-top:16px">' +
      '<button class="btn btn-secondary" onclick="closeModal()">取消</button>' +
      (p.isFav ? '<button class="btn" style="color:var(--accent-red)" onclick="removeIntelFavNow()">取消收藏</button>' : '') +
      '<button class="btn btn-primary" onclick="confirmIntelFav()">确认收藏</button>' +
    '</div>';
  showModal(html);
}
function setIntelFavCat(id) { if (window.__favPick) { window.__favPick.catId = id; renderIntelFavPicker(); } }
function addIntelFavCat() {
  var p = window.__favPick; if (!p) return;
  var el = document.getElementById("intel-new-cat");
  if (!el) return;
  var name = el.value.trim();
  if (!name) { if (typeof showToast === "function") showToast("请输入分类名称", "warn"); return; }
  if (typeof ensureIndustry === "function") ensureIndustry();
  var res = intelAddFavCat(DB.data.industryFavCats, name);
  DB.data.industryFavCats = res.cats;
  p.catId = res.id;
  DB.save();
  renderIntelFavPicker();
}
function confirmIntelFav() {
  var p = window.__favPick; if (!p || !p.catId) { if (typeof showToast === "function") showToast("请选择分类", "warn"); return; }
  var r = resolveIntelItem(p.scope, p.idx);
  if (!r) return;
  if (p.isFav) {
    DB.data.industryFav = DB.data.industryFav.map(function (f) { if (f.key === p.key) f.catId = p.catId; return f; });
  } else {
    DB.data.industryFav = intelAddFav(DB.data.industryFav, r.item, r.dateStr, p.catId);
  }
  DB.save();
  if (typeof DB.logActivity === "function") DB.logActivity("industry", (p.isFav ? "更新收藏分类" : "收藏") + "情报：" + (r.title || ""));
  closeModal();
  render();
  if (typeof showToast === "function") showToast(p.isFav ? "已更新分类 ⭐" : "已收藏 ⭐", "success");
}
function removeIntelFavNow() {
  var p = window.__favPick; if (!p) return;
  DB.data.industryFav = intelRemoveFav(DB.data.industryFav, p.key);
  DB.save();
  if (typeof DB.logActivity === "function") DB.logActivity("industry", "取消收藏情报：" + (p.title || ""));
  closeModal();
  render();
  if (typeof showToast === "function") showToast("已取消收藏", "success");
}
function renameIntelFavCat(id) {
  var cats = DB.data.industryFavCats || [];
  var cat = null;
  for (var i = 0; i < cats.length; i++) { if (cats[i].id === id) { cat = cats[i]; break; } }
  if (!cat) return;
  showModal(
    '<div class="modal-title">重命名分类</div>' +
    '<div class="form-group"><div class="form-label">分类名称</div><input id="intel-cat-name" class="form-input" value="' + escapeHtml(cat.name) + '"></div>' +
    '<div class="btn-row"><button class="btn btn-secondary" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="submitRenameFavCat(\'' + id + '\')">保存</button></div>'
  );
}
function submitRenameFavCat(id) {
  var el = document.getElementById("intel-cat-name");
  if (!el) return;
  var name = el.value.trim();
  if (!name) { if (typeof showToast === "function") showToast("名称不能为空", "warn"); return; }
  DB.data.industryFavCats = intelRenameFavCat(DB.data.industryFavCats, id, name);
  DB.save();
  closeModal();
  render();
}
function removeIntelFavCat(id) {
  showConfirmDialog("🗑", "删除分类", "删除后该分类下的收藏将自动移到其余分类，确定删除？", [
    { text: "取消", cls: "btn-secondary", action: function () { closeModal(); } },
    { text: "删除", cls: "btn-primary", style: "color:#fff;background:var(--accent-red)", action: function () { doRemoveIntelFavCat(id); } }
  ]);
}
function doRemoveIntelFavCat(id) {
  var res = intelRemoveFavCat(DB.data.industryFavCats, id);
  DB.data.industryFavCats = res.cats;
  DB.data.industryFav = (DB.data.industryFav || []).map(function (f) { if (f.catId === id) f.catId = res.reassignTo; return f; });
  DB.save();
  if (window.__intelFavFilter === id) window.__intelFavFilter = "all";
  closeModal();
  render();
  if (typeof showToast === "function") showToast("已删除分类", "success");
}
function setIntelFavFilter(id) { window.__intelFavFilter = id; render(); }

// —— 评论 ——
function openIntelComment(scope, idx) {
  var r = resolveIntelItem(scope, idx);
  if (!r) return;
  window.__cmtKey = r.key;
  window.__cmtTitle = r.title;
  window.__cmtEditing = null;
  renderIntelCommentModal();
}
function renderIntelCommentModal() {
  var key = window.__cmtKey;
  var list = intelListComments(DB.data.industryComments, key);
  var itemsHtml = list.length ? list.map(function (c) {
    if (window.__cmtEditing === c.id) {
      return '<div class="intel-cmt intel-cmt-editing">' +
        '<textarea id="intel-cmt-edit" class="intel-need" rows="3">' + escapeHtml(c.text) + '</textarea>' +
        '<div class="intel-cmt-edit-acts">' +
          '<button class="intel-cmt-del" onclick="cancelEditIntelComment()">取消</button>' +
          '<button class="intel-act" onclick="updateIntelComment(\'' + c.id + '\')">保存</button>' +
        '</div></div>';
    }
    return '<div class="intel-cmt">' +
      '<div class="intel-cmt-text">' + escapeHtml(c.text) + '</div>' +
      '<div class="intel-cmt-meta"><span>' + formatDateShort((c.createdAt || "").slice(0, 10)) + (c.updatedAt ? ' · 已编辑' : '') + '</span>' +
        '<span class="intel-cmt-meta-acts">' +
          '<button class="intel-cmt-del" onclick="editIntelComment(\'' + c.id + '\')">编辑</button>' +
          '<button class="intel-cmt-del" onclick="removeIntelComment(\'' + c.id + '\')">删除</button>' +
        '</span></div>' +
      '</div>';
  }).join("") : '<div class="empty-state" style="padding:18px 0"><div class="empty-icon">💬</div><div class="empty-text">还没有评论，来写第一条</div></div>';
  var html =
    '<div class="modal-title">💬 评论</div>' +
    '<div class="intel-fav-item" style="margin-bottom:10px">' + escapeHtml(window.__cmtTitle || "") + '</div>' +
    '<div class="intel-cmt-list">' + itemsHtml + '</div>' +
    '<textarea id="intel-cmt-input" class="intel-need" rows="3" placeholder="写下你的评论…"></textarea>' +
    '<div class="btn-row" style="margin-top:10px">' +
      (list.length ? '<button class="btn btn-secondary" onclick="downloadIntelCommentsExport()">📤 导出评论</button>' : '') +
      '<button class="btn btn-secondary" onclick="closeModal()">关闭</button><button class="btn btn-primary" onclick="addIntelComment()">发布评论</button></div>';
  showModal(html);
}
function editIntelComment(cmtId) { window.__cmtEditing = cmtId; renderIntelCommentModal(); }
function cancelEditIntelComment() { window.__cmtEditing = null; renderIntelCommentModal(); }
function updateIntelComment(cmtId) {
  var el = document.getElementById("intel-cmt-edit");
  if (!el) return;
  var t = el.value.trim();
  if (!t) { if (typeof showToast === "function") showToast("评论不能为空", "warn"); return; }
  var res = intelUpdateComment(DB.data.industryComments, window.__cmtKey, cmtId, t);
  DB.data.industryComments = res.comments;
  DB.save();
  window.__cmtEditing = null;
  renderIntelCommentModal();
  render();
  if (typeof showToast === "function") showToast("评论已更新", "success");
}
// 导出当前条目的评论为 JSON 下载
function downloadIntelCommentsExport() {
  var key = window.__cmtKey;
  var title = window.__cmtTitle || "";
  var list = intelListComments(DB.data.industryComments, key);
  if (!list.length) { if (typeof showToast === "function") showToast("暂无评论可导出", "warn"); return; }
  try {
    var blob = new Blob([JSON.stringify({ title: title, key: key, exportedAt: new Date().toISOString(), comments: list }, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = "情报评论_" + (key || "item") + ".json";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (typeof showToast === "function") showToast("已导出 " + list.length + " 条评论", "success");
  } catch (e) {
    if (typeof showToast === "function") showToast("导出失败：" + (e && e.message ? e.message : e), "error");
  }
}
function addIntelComment() {
  var el = document.getElementById("intel-cmt-input");
  if (!el) return;
  var t = el.value.trim();
  if (!t) { if (typeof showToast === "function") showToast("评论不能为空", "warn"); return; }
  DB.data.industryComments = intelAddComment(DB.data.industryComments, window.__cmtKey, t).comments;
  DB.save();
  renderIntelCommentModal();
  render();
}
// 按条目导出整页情报（含评论），下载为 JSON
function exportIntelItem(scope, idx) {
  var r = resolveIntelItem(scope, idx);
  if (!r) { if (typeof showToast === "function") showToast("未找到该条情报", "warn"); return; }
  var item = r.item;
  var comments = intelListComments(DB.data.industryComments, r.key);
  var data = {
    title: item.title || "",
    summary: item.summary || item.point || "",
    tags: item.tags || [],
    source: item.source || "",
    url: item.url || "",
    date: r.dateStr || item.date || "",
    category: item.category || (item.origin === "custom" ? "自定义情报" : ""),
    scope: scope,
    favCat: r.catId ? intelFavCatName(DB.data.industryFavCats, r.catId) : "",
    exportedAt: new Date().toISOString(),
    comments: comments.map(function (c) { return { text: c.text, createdAt: c.createdAt, updatedAt: c.updatedAt || null }; })
  };
  try {
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var fname = (item.title ? item.title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 40) : (r.key || "item"));
    var a = document.createElement("a");
    a.href = url; a.download = "情报_" + fname + ".json";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (typeof showToast === "function") showToast("已导出情报（含 " + comments.length + " 条评论）", "success");
  } catch (e) {
    if (typeof showToast === "function") showToast("导出失败：" + (e && e.message ? e.message : e), "error");
  }
}
// 情报卡上的导出按钮 HTML
function intelExportBtn(scope, idx) {
  return '<button class="intel-act" onclick="exportIntelItem(\'' + scope + '\',' + idx + ')">📤 导出</button>';
}
function removeIntelComment(cmtId) {
  DB.data.industryComments = intelRemoveComment(DB.data.industryComments, window.__cmtKey, cmtId);
  DB.save();
  renderIntelCommentModal();
  render();
}
function intelCommentCount(scope, idx) {
  var r = resolveIntelItem(scope, idx);
  if (!r) return 0;
  return intelListComments(DB.data.industryComments, r.key).length;
}

// —— 自定义情报生成（浏览器侧调用免费大模型）——
async function intelGenerate() {
  var needEl = document.getElementById("intel-need");
  var provEl = document.getElementById("intel-prov");
  var keyEl = document.getElementById("intel-key");
  var btn = document.getElementById("intel-gen-btn");
  if (!needEl || !provEl || !keyEl) return;
  var need = needEl.value.trim();
  var provider = provEl.value;
  var key = keyEl.value.trim();
  if (!need) { if (typeof showToast === "function") showToast("请先描述你的情报需求", "warn"); return; }
  if (!key) { if (typeof showToast === "function") showToast("请填写 API Key（免费获取见下方说明）", "warn"); return; }
  if (typeof saveAiConfig === "function") saveAiConfig({ provider: provider, key: key });
  var errBox = document.getElementById("intel-gen-err");
  if (errBox) errBox.style.display = "none";
  if (btn) { btn.disabled = true; btn.textContent = "🤖 生成中…"; }
  try {
    var result = await callIntelLLM(provider, key, need);
    DB.data.industryCustom = DB.data.industryCustom || [];
    DB.data.industryCustom.unshift(result);
    DB.save();
    if (typeof DB.logActivity === "function") DB.logActivity("industry", "生成自定义情报：" + (result.title || need));
    if (typeof showToast === "function") showToast("已生成 " + result.items.length + " 条情报", "success");
    render();
  } catch (e) {
    var msg = (e && e.message ? e.message : String(e));
    if (errBox) {
      errBox.style.display = "block";
      errBox.textContent = "❌ 生成失败：" + msg;
      if (typeof showToast === "function") showToast("生成失败，详见下方红字提示", "error");
    } else {
      if (typeof showToast === "function") showToast("生成失败：" + msg.slice(0, 80), "error");
    }
    if (btn) { btn.disabled = false; btn.textContent = "🤖 生成情报"; }
  }
}

// ==============================
// 📋 每日合并简报（资讯 + 物品 + 待办 + 天气 + 复盘 + 学习）
// ==============================
function writeBriefSnapshot() {
  // 写入个性化简报快照到 Supabase Storage，供 7:00 自动化推送使用（anon 可写）
  try {
    var g = DB.data.growth || {};
    var fridge = g.fridge || {};
    var eng = (typeof engGet === "function") ? engGet() : (g.english || {});
    var tasks = DB.data.workbench.tasks.filter(function (t) { return t.date === today(); });
    var snap = {
      date: today(),
      fridgeExpiring: (fridge.items || []).filter(function (it) { var d = (typeof itemDaysLeft === "function" ? itemDaysLeft(it) : null); return d != null && d <= 3; }).length,
      pendingTasks: tasks.filter(function (t) { return !t.done; }).length,
      overdue: tasks.filter(isTaskOverdue).length,
      streak: eng.streak || 0,
      dueReview: (typeof engVocabDue === "function" ? engVocabDue() : 0),
      weatherTemp: (g.outfit && g.outfit.weatherCache) ? g.outfit.weatherCache.temp : null
    };
    var sb = getSb();
    if (sb) {
      sb.storage.from(NEWS_BUCKET).upload("brief/snapshot.json", JSON.stringify(snap), { contentType: "application/json", upsert: true }).catch(function () {});
    }
  } catch (e) {}
}

function renderBrief() {
  var c = document.getElementById("app-content");
  var g = DB.data.growth || {};
  var nd = (typeof LiveData !== "undefined" && LiveData.news) ? LiveData.news : null;
  var newsItems = (nd && nd.items) ? nd.items.slice().sort(function (a, b) { return (a.priority || 5) - (b.priority || 5); }) : [];
  var official = newsItems.filter(function (n) { return n.category === "official"; });
  var hw = newsItems.filter(function (n) { return n.category === "hardware" || n.category === "ai" || n.category === "tech"; });
  var finance = newsItems.filter(function (n) { return n.category === "finance"; });
  var cctv = newsItems.filter(function (n) { return n.category === "cctv"; });
  var intlfin = newsItems.filter(function (n) { return n.category === "intlfin"; });
  var world = newsItems.filter(function (n) { return n.category === "world"; });

  var fridge = g.fridge || {};
  var expiring = (fridge.items || []).filter(function (it) { var d = (typeof itemDaysLeft === "function" ? itemDaysLeft(it) : null); return d != null && d <= 3; })
    .sort(function (a, b) { return (typeof itemDaysLeft === "function" ? itemDaysLeft(a) : 0) - (typeof itemDaysLeft === "function" ? itemDaysLeft(b) : 0); });

  var tasks = DB.data.workbench.tasks.filter(function (t) { return t.date === today(); });
  var pending = tasks.filter(function (t) { return !t.done; });
  var overdue = tasks.filter(isTaskOverdue);

  var o = g.outfit || {}; var w = o.weatherCache;
  var review = (typeof LiveData !== "undefined" && LiveData.review) ? LiveData.review : null;
  var eng = (typeof engGet === "function") ? engGet() : (g.english || {});
  var streak = eng.streak || 0;
  var dueReview = (typeof engVocabDue === "function" ? engVocabDue() : 0);

  function sec(title, icon, body) {
    return '<div class="brief-sec"><div class="brief-sec-h"><span class="brief-sec-ic">' + icon + '</span>' + title + '</div>' + body + '</div>';
  }

  var newsBody = '<div class="brief-meta">📰 官媒热点 ' + official.length + ' · 科技/AI ' + hw.length + ' · 财经 ' + finance.length + ' · 央视财经 ' + cctv.length + ' · 国际金融 ' + intlfin.length + ' · 国际 ' + world.length + ' 条</div>' +
    (newsItems.length ? newsItems.slice(0, 5).map(function (n) {
      return '<div class="brief-news-row"><span class="brief-dot"></span><div><div class="brief-news-t">' + escapeHtml(n.title) + '</div>' +
        '<div class="brief-news-m">' + escapeHtml(n.source || "") + (n.pubTime ? ' · 🕒 ' + escapeHtml(n.pubTime) : '') +
        (n.url ? ' · <a href="' + n.url + '" target="_blank" rel="noopener">原文 ↗</a>' : '') + '</div></div></div>';
    }).join("") : '<div class="brief-empty">今日资讯尚未生成</div>');
  if (newsItems.length > 5) newsBody += '<div style="text-align:center;margin-top:8px"><button class="enm-ghost-btn" onclick="navigate(\'industry\')">查看全部资讯 →</button></div>';

  var fridgeBody = expiring.length ? expiring.map(function (it) {
    var d = itemDaysLeft(it);
    return '<div class="brief-news-row"><span class="brief-dot" style="background:var(--accent-red)"></span><div><div class="brief-news-t">' + escapeHtml(it.name) + '</div>' +
      '<div class="brief-news-m">' + escapeHtml([it.group, it.cat].filter(Boolean).join(" · ")) + ' · ' + (d < 0 ? '已过期' + Math.abs(d) + '天' : '剩 ' + d + ' 天') + '</div></div></div>';
  }).join("") : '<div class="brief-empty">🟢 暂无临期物品</div>';

  var taskBody = (pending.length || overdue.length) ? pending.map(function (t) {
    var ov = overdue.indexOf(t) >= 0;
    return '<div class="brief-news-row"><span class="brief-dot" style="background:' + (ov ? 'var(--accent-red)' : 'var(--accent-orange)') + '"></span><div><div class="brief-news-t' + (ov ? ' brief-over' : '') + '">' + escapeHtml(t.text) + '</div>' +
      '<div class="brief-news-m">' + (ov ? '⏰ 已超时' : '待处理') + (t.due ? ' · 截止 ' + escapeHtml(t.due) : '') + '</div></div></div>';
  }).join("") : '<div class="brief-empty">✅ 今日待办已全部完成</div>';

  var wxBody = (w && w.temp != null)
    ? '<div class="brief-news-row"><span class="brief-dot" style="background:var(--accent-blue)"></span><div><div class="brief-news-t">' + w.temp + '° ' + escapeHtml(w.condition || "") + '</div>' +
      '<div class="brief-news-m">' + escapeHtml((o.useGeo && o.geoLabel) ? o.geoLabel : (o.city || "当地")) + (o.useGeo ? ' · 手机定位' : '') + (w.humidity != null ? ' · 💧' + w.humidity + '%' : '') + '</div></div></div>'
    : '<div class="brief-empty">尚未获取天气，首页点击获取</div>';

  var revBody = review ? '<div class="brief-news-row"><span class="brief-dot" style="background:var(--accent-purple)"></span><div><div class="brief-news-t">前一日收盘复盘已生成</div>' +
    '<div class="brief-news-m">' + formatDateShort((review.generatedAt || "").slice(0, 10)) + ' · <a href="#" onclick="event.preventDefault();navigate(\'reviews\')">查看复盘 →</a></div></div></div>'
    : '<div class="brief-empty">暂无复盘数据</div>';

  var engBody = '<div class="brief-news-row"><span class="brief-dot" style="background:var(--accent-blue)"></span><div><div class="brief-news-t">🔥 连续学习 ' + streak + ' 天</div>' +
    '<div class="brief-news-m">待复习生词 ' + dueReview + ' 个' + (dueReview > 0 ? ' · <a href="#" onclick="event.preventDefault();navigate(\'language\')">去复习 →</a>' : '') + '</div></div></div>';

  c.innerHTML =
    '<div class="brief-hero">' +
      '<div class="brief-hero-title">📋 每日简报</div>' +
      '<div class="brief-hero-date">' + formatDate(today()) + (nd && nd.generatedAt && nd.generatedAt.slice(0, 10) === today() ? ' · 资讯已更新' : '') + '</div>' +
    '</div>' +
    sec("资讯情报", "🌐", newsBody) +
    sec("物品临期提醒", "📦", fridgeBody) +
    sec("今日待办 / 逾期", "📋", taskBody) +
    sec("天气与穿搭", "🌤️", wxBody) +
    sec("收盘复盘要点", "📈", revBody) +
    sec("语言学习", "🌐", engBody) +
    '<div style="text-align:center;margin-top:10px"><button class="enm-ghost-btn" onclick="if(window.subscribeBrief)subscribeBrief()">' + (isPushSubscribed() ? "🔔 已开启推送（重设）" : "🔔 开启每日推送") + '</button></div>';
}

function subscribeBrief() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    showToast("当前浏览器不支持系统推送", "error"); return;
  }
  if (!window.Notification || Notification.permission === "denied") {
    showToast("通知权限已被拒绝，请在浏览器/系统设置中开启", "error"); return;
  }
  Notification.requestPermission().then(function (perm) {
    if (perm !== "granted") { showToast("未授权通知权限", "error"); return; }
    navigator.serviceWorker.ready.then(function (reg) {
      reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: VAPID_PUBLIC
      }).then(function (sub) {
        var s = sub.toJSON();
        try { localStorage.setItem("hw_pm_push_sub", JSON.stringify(s)); } catch (e) {}
        showPushSubModal(s);
      }).catch(function (e) {
        showToast("订阅失败：" + (e && e.message ? e.message : e), "error");
      });
    }).catch(function () {
      showToast("Service Worker 未就绪", "error");
    });
  });
}

function showPushSubModal(s) {
  var json = JSON.stringify(s, null, 2);
  showModal(
    '<div class="modal-title">🔔 已生成手机推送订阅</div>' +
    '<div style="font-size:13px;color:var(--text-muted);line-height:1.6;margin-bottom:10px">' +
    '把下面的订阅信息<b>复制并发给「AI 助手」</b>（或粘贴到工作台对话里），我会把它接通到每日 <b>08:30</b> 的自动推送，之后每天简报会直接出现在你手机的通知栏。' +
    '</div>' +
    '<textarea class="paste-area" id="push-sub-json" readonly style="height:170px;font-size:11px">' + escapeHtml(json) + '</textarea>' +
    '<div class="btn-row">' +
    '<button type="button" class="btn btn-secondary" onclick="closeModal()">关闭</button>' +
    '<button type="button" class="btn btn-primary" onclick="copyPushSub()">📋 复制订阅信息</button>' +
    '</div>'
  );
}

function copyPushSub() {
  var ta = document.getElementById("push-sub-json");
  if (!ta) return;
  ta.select();
  try {
    document.execCommand("copy");
    showToast("已复制，去发给 AI 助手即可接通推送 🔔", "success");
  } catch (e) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(ta.value).then(function () { showToast("已复制 🔔", "success"); },
        function () { showToast("请手动长按复制", "error"); });
    } else {
      showToast("请手动长按复制", "error");
    }
  }
}

function isPushSubscribed() {
  try { return !!localStorage.getItem("hw_pm_push_sub"); } catch (e) { return false; }
}

// ===== 8:30 每日简报弹窗（应用内）=====
function showBriefModal() {
  var g = DB.data.growth || {};
  var nd = (typeof LiveData !== "undefined" && LiveData.news) ? LiveData.news : null;
  var newsItems = (nd && nd.items) ? nd.items.slice().sort(function (a, b) { return (a.priority || 5) - (b.priority || 5); }) : [];
  var tasks = DB.data.workbench.tasks.filter(function (t) { return t.date === today(); });
  var pending = tasks.filter(function (t) { return !t.done; });
  var overdue = tasks.filter(isTaskOverdue);
  var top = newsItems.slice(0, 4).map(function (n) {
    return '<div class="brief-news-row"><span class="brief-dot"></span><div><div class="brief-news-t">' + escapeHtml(n.title) + '</div>' +
      '<div class="brief-news-m">' + escapeHtml(n.source || "") + '</div></div></div>';
  }).join("");
  if (!top) top = '<div class="brief-empty">今日资讯尚未生成</div>';
  var taskLine = (pending.length || overdue.length)
    ? ((overdue.length ? "⏰ 逾期 " + overdue.length + " 项 · " : "") + "待办 " + pending.length + " 项")
    : "✅ 今日待办已全部完成";
  showModal(
    '<div class="modal-title">📋 每日简报 · 08:30</div>' +
    '<div style="font-size:12px;color:var(--text-muted);margin:2px 0 12px">' + formatDate(today()) + '</div>' +
    '<div class="brief-meta">📰 资讯 ' + newsItems.length + ' 条 · ' + taskLine + '</div>' +
    top +
    '<div class="btn-row">' +
    '<button type="button" class="btn btn-secondary" onclick="closeModal()">稍后查看</button>' +
    '<button type="button" class="btn btn-primary" onclick="closeModal();navigate(\'brief\')">查看完整简报</button>' +
    '</div>'
  );
}

function scheduleBriefPopup() {
  try {
    var key = "briefPopup_" + today();
    if (localStorage.getItem(key)) return; // 今天已弹过
    var now = new Date();
    var target = new Date();
    target.setHours(8, 30, 0, 0);
    function fire() {
      if (!localStorage.getItem("briefPopup_" + today())) {
        localStorage.setItem("briefPopup_" + today(), "1");
        showBriefModal();
      }
    }
    if (now >= target) {
      setTimeout(fire, 1000); // 8:30 后打开 App → 立即送达
    } else {
      setTimeout(fire, target - now); // 8:30 前打开 → 到点弹
    }
  } catch (e) {}
}

function openPasteIndustry() {
  showModal(
    '<div class="modal-title">📋 粘贴行业情报</div>' +
    '<form onsubmit="submitPasteIndustry(event)">' +
    '<div class="form-group"><div class="form-label">标题</div><input class="form-input" name="title" placeholder="情报标题..." required></div>' +
    '<div class="form-group"><div class="form-label">来源</div><input class="form-input" name="source" placeholder="来源 / 渠道" value="手动录入"></div>' +
    '<div class="form-group"><div class="form-label">内容摘要（直接粘贴）</div><textarea class="paste-area" name="summary" placeholder="在这里粘贴你看到的情报内容、文章摘录、数据截图文字...&#10;&#10;支持多行粘贴" required></textarea></div>' +
    '<div class="form-group"><div class="form-label">原文链接（可选）</div><input class="form-input" name="url" placeholder="https://..."></div>' +
    '<div class="form-group"><div class="form-label">标签（逗号分隔）</div><input class="form-input" name="tags" placeholder="无线充电, Qi2, 行业趋势"></div>' +
    '<div class="form-group"><label style="display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer"><input type="checkbox" name="important" style="width:20px;height:20px"> 标记为重要</label></div>' +
    '<div class="btn-row"><button type="button" class="btn btn-secondary" onclick="closeModal()">取消</button><button type="submit" class="btn btn-primary">保存</button></div>' +
    '</form>'
  );
}

function submitPasteIndustry(event) {
  event.preventDefault();
  var fd = new FormData(event.target);
  var data = Object.fromEntries(fd);
  DB.data.industry.unshift({
    id: uid(), title: data.title, source: data.source || "手动录入",
    url: data.url || "", summary: data.summary,
    tags: data.tags ? data.tags.split(",").map(function(s) { return s.trim(); }).filter(Boolean) : [],
    date: today(), important: data.important === "on"
  });
  DB.logActivity("industry", "手动录入情报：" + data.title);
  DB.save();
  closeModal();
  render();
}

function editIndustryUrl(id) {
  var item = DB.data.industry.find(function(i) { return i.id === id; });
  if (!item) return;
  showModal(
    '<div class="modal-title">编辑链接</div>' +
    '<form onsubmit="submitIndustryUrl(event,\'' + id + '\')">' +
    '<div class="form-group"><div class="form-label">原文链接</div><input class="form-input" name="url" placeholder="https://..." value="' + escapeHtml(item.url || "") + '"></div>' +
    '<div class="btn-row"><button type="button" class="btn btn-secondary" onclick="closeModal()">取消</button><button type="submit" class="btn btn-primary">保存</button></div>' +
    '</form>'
  );
}

function submitIndustryUrl(event, id) {
  event.preventDefault();
  var fd = new FormData(event.target);
  var item = DB.data.industry.find(function(i) { return i.id === id; });
  if (item) { item.url = fd.get("url"); DB.save(); }
  closeModal();
  render();
}

// ===== Image Upload Helper =====
function clearPendingImages() {
  pendingImages = [];
  pendingImageIds = [];
}

async function handleImageSelect(event) {
  var files = event.target.files;
  if (!files || !files.length) return;
  for (var i = 0; i < files.length; i++) {
    try {
      var compressed = await compressImage(files[i]);
      pendingImages.push({ data: compressed, id: null });
    } catch (e) {
      // skip failed images
    }
  }
  renderImagePreviews();
  event.target.value = "";
}

// 粘贴图片链接（与"相关链接/网页"明确区分，此处直接当图片渲染）
function addImageByUrl() {
  var inp = document.getElementById("img-url-input");
  if (!inp) return;
  var url = (inp.value || "").trim();
  if (!url) { showToast("请输入图片链接", "warning"); return; }
  pendingImages.push({ data: url, id: null, isUrl: true });
  inp.value = "";
  renderImagePreviews();
}

// 点击详情/卡片内图片放大查看
function viewFull(event) {
  event.stopPropagation();
  var src = event.currentTarget.getAttribute("data-src");
  var viewer = document.createElement("div");
  viewer.className = "image-viewer";
  viewer.innerHTML = '<button class="viewer-close" onclick="this.parentElement.remove()">✕</button><img src="' + src + '" alt="预览">';
  viewer.addEventListener("click", function(e) { if (e.target === viewer) viewer.remove(); });
  document.body.appendChild(viewer);
}

// 图片区：可粘贴"图片链接"（与下面"相关链接/网页"明确区分，此处直接当图片渲染）
function imgUrlInputHtml() {
  return '<div class="img-url-row"><input id="img-url-input" class="form-input" placeholder="或粘贴图片链接(https://...jpg/png)" style="flex:1"><button type="button" class="btn btn-secondary" onclick="addImageByUrl()">添加图片链接</button></div>';
}

function renderImagePreviews() {
  var container = document.getElementById("img-previews");
  if (!container) return;
  container.innerHTML = pendingImages.map(function(img, idx) {
    return '<div class="image-thumb" style="background-image:url(' + img.data + ')"><div class="img-delete" onclick="event.stopPropagation();removePendingImage(' + idx + ')">✕</div></div>';
  }).join("");
  if (pendingImages.length < 9) {
    container.innerHTML += '<div class="image-thumb" style="display:flex;align-items:center;justify-content:center;border-style:dashed;cursor:pointer" onclick="document.getElementById(\'img-input\').click()"><span style="font-size:24px;color:var(--text-tertiary)">+</span></div>';
  }
}

function removePendingImage(idx) {
  pendingImages.splice(idx, 1);
  renderImagePreviews();
}

function viewImage(idx) {
  var viewer = document.createElement("div");
  viewer.className = "image-viewer";
  viewer.innerHTML = '<button class="viewer-close" onclick="this.parentElement.remove()">✕</button><img src="' + pendingImages[idx].data + '" alt="预览">';
  viewer.addEventListener("click", function(e) { if (e.target === viewer) viewer.remove(); });
  document.body.appendChild(viewer);
}

function compressImage(file) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onload = function(e) {
      var img = new Image();
      img.onload = function() {
        var maxSize = 600;
        var w = img.width, h = img.height;
        if (w > maxSize || h > maxSize) {
          if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
          else { w = Math.round(w * maxSize / h); h = maxSize; }
        }
        var canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        var ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function storePendingImages() {
  var ids = [];
  for (var i = 0; i < pendingImages.length; i++) {
    var item = pendingImages[i];
    var id;
    if (item.id) {
      id = item.id; // 已有图片：保留原 id（删除通过"不包含它"自然生效）
    } else {
      id = await ImageDB.store(item.data); // 新图片：存入并返回新 id
    }
    ids.push(id);
  }
  return ids;
}

// Image display in cards (async loaded)
function imagePreviewHtml(imageIds) {
  if (!imageIds || !imageIds.length) return "";
  return '<div class="card-images" id="cip-' + uid() + '" data-imgids="' + imageIds.join(",") + '"><div style="font-size:12px;color:var(--text-tertiary);padding:20px">加载图片中...</div></div>';
}

async function loadCardImages(containerId, imageIds) {
  var el = document.getElementById(containerId);
  if (!el || !imageIds || !imageIds.length) return;
  try {
    var imgs = await ImageDB.getManySafe(imageIds);
    el.innerHTML = imgs.map(function(src) {
      return '<div class="ci-thumb" style="background-image:url(' + src + ')" onclick="viewImageSrc(event,\'' + src + '\')"></div>';
    }).join("");
  } catch (e) {
    el.innerHTML = "";
  }
}

function viewImageSrc(event, src) {
  event.stopPropagation();
  var viewer = document.createElement("div");
  viewer.className = "image-viewer";
  viewer.innerHTML = '<button class="viewer-close" onclick="this.parentElement.remove()">✕</button><img src="' + src + '" alt="预览">';
  viewer.addEventListener("click", function(e) { if (e.target === viewer) viewer.remove(); });
  document.body.appendChild(viewer);
}

// Links display in cards
function linksHtml(links) {
  if (!links || !links.length) return "";
  return '<div class="card-links">' + links.map(function(l) {
    var title = l.title || l.url || "";
    return '<a href="' + l.url + '" target="_blank" rel="noopener" class="cl-link" onclick="event.stopPropagation()">🔗 ' + escapeHtml((title.length > 25 ? title.slice(0,25) + "..." : title) || "链接") + '</a>';
  }).join("") + '</div>';
}

function supplementsHtml(supplements) {
  if (!supplements || !supplements.length) return "";
  return '<div class="supplement-section">' + supplements.map(function(s) {
    return '<div class="supplement-item"><span class="sup-date">' + formatDateShort(s.date) + '</span><div>' + escapeHtml(s.text) + '</div></div>';
  }).join("") + '</div>';
}

// ===== Competitors =====
function renderCompetitors() {
  var c = document.getElementById("app-content");
  if (!window.__competitorSub) window.__competitorSub = "list";
  var sub = '<div class="vv-subtabs">' +
    '<span class="vv-subtab' + (window.__competitorSub === "list" ? " active" : "") + '" onclick="setSubView(\'competitors\',\'list\')">📋 我的竞品</span>' +
    '<span class="vv-subtab' + (window.__competitorSub === "amazon" ? " active" : "") + '" onclick="setSubView(\'competitors\',\'amazon\')">🛒 Amazon 竞品调研</span>' +
    '</div>';
  if (window.__competitorSub === "amazon") {
    c.innerHTML = sub + '<div id="ari-console"></div>';
    if (typeof renderAriConsole === "function") renderAriConsole(document.getElementById("ari-console"));
    return;
  }
  var brands = ["all"].concat(Array.from(new Set(DB.data.competitors.map(function(x) { return x.brand; }))));
  var filtered = DB.data.competitors;
  if (currentFilter !== "all") filtered = filtered.filter(function(x) { return x.brand === currentFilter; });

  c.innerHTML = sub +
    '<div class="filter-bar">' + brands.map(function(b) { return '<div class="chip' + (currentFilter === b ? ' active' : '') + '" onclick="setFilter(\'' + b + '\')">' + (b === "all" ? "全部" : b) + '</div>'; }).join("") + '</div>' +
    '<div class="competitor-grid">' +
    (filtered.length === 0 ? '<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-text">还没有竞品记录</div></div>' : filtered.map(function(x) {
      return '<div class="card" onclick="showCompetitorDetail(\'' + x.id + '\')">' +
        '<div class="card-header"><div><div class="card-title">' + escapeHtml(x.name) + '</div><div class="text-xs text-secondary mt-8">' + escapeHtml(x.brand) + ' · ' + escapeHtml(x.platform) + ' · ' + escapeHtml(x.price) + '</div></div>' +
        '<div style="display:flex;align-items:center;gap:8px"><span style="font-size:16px">' + "⭐".repeat(x.rating) + '<span style="color:var(--text-tertiary)">' + "⭐".repeat(5 - x.rating) + '</span></span>' +
        '<button class="comp-del" title="删除竞品" onclick="event.stopPropagation();deleteCompetitor(\'' + x.id + '\')">🗑</button></div></div>' +
        '<div class="card-body"><div style="margin-bottom:6px"><span style="color:var(--accent-green)">✓ 优势:</span> ' + escapeHtml(x.pros.join("、")) + '</div>' +
        '<div><span style="color:var(--accent-red)">✗ 不足:</span> ' + escapeHtml(x.cons.join("、")) + '</div></div>' +
        (x.images && x.images.length ? '<div class="card-images" id="ci-' + x.id + '" data-imgids="' + x.images.join(",") + '"><span class="text-xs" style="color:var(--text-tertiary);padding:12px">加载中...</span></div>' : '') +
      '</div>';
    }).join("")) +
    '</div>';

  // async load images
  filtered.forEach(function(x) {
    if (x.images && x.images.length) loadCardImages("ci-" + x.id, x.images);
  });
}

function showCompetitorDetail(id) {
  var x = DB.data.competitors.find(function(c) { return c.id === id; });
  if (!x) return;
  var modalId = "modal-cd-" + uid();

  showModal(
    '<div class="modal-title">' + escapeHtml(x.name) + '</div>' +
    '<div style="margin-bottom:12px"><span class="badge badge-blue">' + escapeHtml(x.brand) + '</span> <span class="badge badge-gray">' + escapeHtml(x.platform) + '</span> <span class="badge badge-green">' + escapeHtml(x.price) + '</span></div>' +
    (x.images && x.images.length ? '<div class="card-images" id="md-' + modalId + '" data-imgids="' + x.images.join(",") + '"><div style="font-size:12px;color:var(--text-tertiary);padding:20px">加载中...</div></div>' : '') +
    '<div class="form-group"><div class="form-label">产品特性</div><div style="display:flex;flex-wrap:wrap;gap:6px">' + x.features.map(function(f) { return '<span class="badge badge-teal">' + escapeHtml(f) + '</span>'; }).join("") + '</div></div>' +
    '<div class="form-group"><div class="form-label" style="color:var(--accent-green)">✓ 优势</div><ul style="padding-left:20px;font-size:14px;color:var(--text-secondary);line-height:1.8">' + x.pros.map(function(p) { return '<li>' + escapeHtml(p) + '</li>'; }).join("") + '</ul></div>' +
    '<div class="form-group"><div class="form-label" style="color:var(--accent-red)">✗ 不足</div><ul style="padding-left:20px;font-size:14px;color:var(--text-secondary);line-height:1.8">' + x.cons.map(function(p) { return '<li>' + escapeHtml(p) + '</li>'; }).join("") + '</ul></div>' +
    '<div class="form-group"><div class="form-label">评分</div><div style="font-size:20px">' + "⭐".repeat(x.rating) + '<span style="color:var(--text-tertiary)">' + "⭐".repeat(5 - x.rating) + '</span></div></div>' +
    '<div class="btn-row">' +
      '<button class="btn btn-secondary" onclick="closeModal();editCompetitor(\'' + x.id + '\')">✏️ 编辑</button>' +
      '<button class="btn btn-danger" onclick="deleteCompetitor(\'' + x.id + '\')">🗑 删除</button>' +
      (x.url ? '<a href="' + x.url + '" target="_blank" rel="noopener" class="btn btn-secondary" style="text-decoration:none">查看链接</a>' : '') +
      '<button class="btn btn-secondary" onclick="closeModal()">关闭</button>' +
    '</div>'
  );

  if (x.images && x.images.length) loadCardImages("md-" + modalId, x.images);
}

// ===== Insights (含图片/链接/补录) =====
function renderInsights() {
  var c = document.getElementById("app-content");
  if (!window.__insightsView) window.__insightsView = "list";
  if (window.__insightsView === "mr") { renderMrQuery(c); return; }
  if (window.__insightsView === "demand") { renderDemandMine(); return; }
  if (window.__insightsView === "truenorth") { renderTrueNorth(); return; }
  var v = window.__insightsView;
  var subtabs =
    '<div class="vv-subtabs">' +
    '<span class="vv-subtab' + (v === "list" ? " active" : "") + '" onclick="setSubView(\'insights\',\'list\')">💡 我的洞察</span>' +
    '<span class="vv-subtab' + (v === "mr" ? " active" : "") + '" onclick="setSubView(\'insights\',\'mr\')">📊 市场调研报告</span>' +
    '<span class="vv-subtab' + (v === "demand" ? " active" : "") + '" onclick="setSubView(\'insights\',\'demand\')">📣 需求挖掘</span>' +
    '<span class="vv-subtab' + (v === "truenorth" ? " active" : "") + '" onclick="setSubView(\'insights\',\'truenorth\')">🧭 TrueNorth</span>' +
    '</div>';
  var priorities = ["all", "high", "medium", "low"];
  var filtered = DB.data.insights;
  if (currentFilter !== "all") filtered = filtered.filter(function(i) { return i.priority === currentFilter; });

  var priorityMap = { high: { label: "高优先级", badge: "badge-red" }, medium: { label: "中优先级", badge: "badge-orange" }, low: { label: "低优先级", badge: "badge-gray" } };

  c.innerHTML =
    subtabs +
    '<div class="filter-bar">' + priorities.map(function(p) { return '<div class="chip' + (currentFilter === p ? ' active' : '') + '" onclick="setFilter(\'' + p + '\')">' + (p === "all" ? "全部" : priorityMap[p] ? priorityMap[p].label : p) + '</div>'; }).join("") + '</div>' +
    '<div class="insight-grid">' +
    (filtered.length === 0 ? '<div class="empty-state"><div class="empty-icon">💡</div><div class="empty-text">还没有需求洞察</div></div>' : filtered.map(function(i) {
      return '<div class="card" onclick="openInsightDetail(\'' + i.id + '\')">' +
        '<div class="card-header"><div class="card-title">' + escapeHtml(i.title) + '</div><span class="badge ' + priorityMap[i.priority].badge + '">' + priorityMap[i.priority].label + '</span></div>' +
        '<div class="card-body"><div style="margin-bottom:6px"><strong>目标用户:</strong> ' + escapeHtml(i.targetUser) + '</div>' +
        '<div style="margin-bottom:6px"><strong style="color:var(--accent-red)">痛点:</strong> ' + escapeHtml(i.painPoint) + '</div>' +
        '<div><strong style="color:var(--accent-green)">机会:</strong> ' + escapeHtml(i.description) + '</div></div>' +
        (i.images && i.images.length ? '<div class="card-images" id="cii-' + i.id + '" data-imgids="' + i.images.join(",") + '"><span class="text-xs" style="color:var(--text-tertiary);padding:12px">加载中...</span></div>' : '') +
        linksHtml(i.links) +
        supplementsHtml(i.supplements) +
        '<div class="flex-between mt-12"><span class="badge badge-blue">关联: ' + escapeHtml(i.product) + '</span><span class="text-xs text-secondary">' + formatDateShort(i.date) + '</span></div>' +
        '<div class="inline-actions">' +
          '<button class="ia-btn ia-btn-edit" onclick="event.stopPropagation();editInsight(\'' + i.id + '\')">✏️ 编辑</button>' +
          '<button class="ia-btn ia-btn-note" onclick="event.stopPropagation();supplementInsight(\'' + i.id + '\')">📝 补录</button>' +
          '<button class="ia-btn ia-btn-delete" onclick="event.stopPropagation();deleteItem(\'' + i.id + '\')">🗑 删除</button>' +
        '</div>' +
      '</div>';
    }).join("")) +
    '</div>';

  filtered.forEach(function(i) {
    if (i.images && i.images.length) loadCardImages("cii-" + i.id, i.images);
  });
}

// 需求洞察详情卡（点击进入，底部可编辑/删除/补录）
async function openInsightDetail(id) {
  var i = DB.data.insights.find(function(x) { return x.id === id; });
  if (!i) return;
  var priorityMap = { high: "高优先级", medium: "中优先级", low: "低优先级" };
  var badgeMap = { high: "badge-red", medium: "badge-orange", low: "badge-gray" };
  var imgs = (i.images && i.images.length) ? await ImageDB.getManySafe(i.images) : [];
  var imgHtml = imgs.length ? '<div class="detail-imgs">' + imgs.map(function(src) {
    return '<div class="detail-img" style="background-image:url(' + src + ')" data-src="' + src + '" onclick="viewFull(event)"></div>';
  }).join("") + '</div>' : '';

  showModal(
    '<div class="detail-head"><div class="detail-title">' + escapeHtml(i.title) + '</div>' +
    '<div class="flex gap wrap">' +
      '<span class="badge ' + badgeMap[i.priority] + '">' + priorityMap[i.priority] + '</span>' +
      (i.product ? '<span class="badge badge-blue">关联: ' + escapeHtml(i.product) + '</span>' : '') +
    '</div></div>' +
    '<div class="detail-body">' +
      '<div style="margin-bottom:8px"><strong>目标用户:</strong> ' + escapeHtml(i.targetUser) + '</div>' +
      '<div style="margin-bottom:8px"><strong style="color:var(--accent-red)">痛点:</strong> ' + escapeHtml(i.painPoint) + '</div>' +
      '<div><strong style="color:var(--accent-green)">机会:</strong> ' + escapeHtml(i.description) + '</div>' +
    '</div>' +
    imgHtml +
    linksHtml(i.links) +
    supplementsHtml(i.supplements) +
    '<div class="detail-date">创建于 ' + formatDateShort(i.date) + '</div>' +
    '<div class="detail-actions">' +
      '<button class="btn btn-primary" onclick="closeModal();editInsight(\'' + i.id + '\')">✏️ 编辑</button>' +
      '<button class="btn btn-note" onclick="closeModal();supplementInsight(\'' + i.id + '\')">📝 补录</button>' +
      '<button class="btn btn-danger" onclick="if(confirm(\'确定删除该洞察？\')){closeModal();deleteItem(\'' + i.id + '\')}">🗑 删除</button>' +
      '<button class="btn btn-secondary" onclick="closeModal()">关闭</button>' +
    '</div>'
  );
}

async function editInsight(id) {
  var i = DB.data.insights.find(function(x) { return x.id === id; });
  if (!i) return;
  editingItemId = id; editingType = "insight";
  clearPendingImages();
  // load existing image previews
  if (i.images && i.images.length) {
    var existing = await ImageDB.getManySafe(i.images);
    pendingImages = i.images.map(function(id, k) { return { data: existing[k], id: id }; }).filter(function(x) { return x.data; });
  }
  showEditInsightForm(i);
}

function showEditInsightForm(i) {
  var imgSection = '<div class="form-group"><div class="form-label">图片（点击+添加）</div>' +
    '<div class="image-preview-grid" id="img-previews">' + existingThumbsHtml() + '</div>' +
    '<input type="file" id="img-input" accept="image/*" multiple style="display:none" onchange="handleImageSelect(event)">' +
    '<div class="btn btn-secondary" onclick="document.getElementById(\'img-input\').click()" style="margin-top:6px">📷 添加图片</div>' + imgUrlInputHtml() + '</div>';

  showModal(
    '<div class="modal-title">✏️ 编辑需求洞察</div>' +
    '<form onsubmit="submitEditInsight(event)">' +
    '<div class="form-group"><div class="form-label">标题</div><input class="form-input" name="title" value="' + escapeHtml(i.title) + '" required></div>' +
    '<div class="form-group"><div class="form-label">目标用户</div><input class="form-input" name="targetUser" value="' + escapeHtml(i.targetUser) + '" required></div>' +
    '<div class="form-group"><div class="form-label">痛点描述</div><textarea class="form-textarea" name="painPoint" required>' + escapeHtml(i.painPoint) + '</textarea></div>' +
    '<div class="form-group"><div class="form-label">机会/方案</div><textarea class="form-textarea" name="description" required>' + escapeHtml(i.description) + '</textarea></div>' +
    '<div class="form-row"><div class="form-group"><div class="form-label">优先级</div><select class="form-select" name="priority"><option value="high"' + (i.priority === "high" ? " selected" : "") + '>高优先级</option><option value="medium"' + (i.priority === "medium" ? " selected" : "") + '>中优先级</option><option value="low"' + (i.priority === "low" ? " selected" : "") + '>低优先级</option></select></div>' +
    '<div class="form-group"><div class="form-label">关联产品</div><input class="form-input" name="product" value="' + escapeHtml(i.product || "") + '"></div></div>' +
    imgSection +
    linkEditorHtml(i.links || []) +
    '<div class="btn-row"><button type="button" class="btn btn-secondary" onclick="closeModal()">取消</button><button type="submit" class="btn btn-primary">保存修改</button></div>' +
    '</form>'
  );
}

async function submitEditInsight(event) {
  event.preventDefault();
  var fd = new FormData(event.target);
  var data = Object.fromEntries(fd);
  var i = DB.data.insights.find(function(x) { return x.id === editingItemId; });
  if (!i) { closeModal(); return; }

  Object.assign(i, {
    title: data.title, targetUser: data.targetUser, painPoint: data.painPoint,
    description: data.description, priority: data.priority, product: data.product || ""
  });

  // store new images
  var newIds = await storePendingImages();
  // 清理被删除的已有图片（避免在 ImageDB 留下孤儿）
  var removedIds = (i.images || []).filter(function(old) { return newIds.indexOf(old) === -1; });
  if (removedIds.length) { try { await ImageDB.removeMany(removedIds); } catch (e) {} }
  i.images = newIds;

  // parse links
  i.links = parseLinksFromForm(data);

  DB.save();
  clearPendingImages();
  closeModal();
  render();
  showToast("洞察已更新", "success");
}

async function supplementInsight(id) {
  var i = DB.data.insights.find(function(x) { return x.id === id; });
  if (!i) return;
  editingItemId = id;

  showModal(
    '<div class="modal-title">📝 补录笔记</div>' +
    '<div style="font-size:13px;color:var(--text-secondary);margin-bottom:12px">关联洞察: <strong>' + escapeHtml(i.title) + '</strong></div>' +
    supplementsHtml(i.supplements) +
    '<form onsubmit="submitSupplement(event)">' +
    '<div class="form-group"><div class="form-label">补录内容</div><textarea class="form-textarea" name="text" placeholder="补充你的观察、新发现、数据更新..." required></textarea></div>' +
    '<div class="btn-row"><button type="button" class="btn btn-secondary" onclick="closeModal()">取消</button><button type="submit" class="btn btn-primary">添加补录</button></div>' +
    '</form>'
  );
}

function submitSupplement(event) {
  event.preventDefault();
  var fd = new FormData(event.target);
  var i = DB.data.insights.find(function(x) { return x.id === editingItemId; });
  if (!i) { closeModal(); return; }
  if (!i.supplements) i.supplements = [];
  i.supplements.push({ text: fd.get("text"), date: today() });
  DB.logActivity("insight", "补录洞察：" + i.title);
  DB.save();
  closeModal();
  render();
  showToast("补录已保存", "success");
}

// ===== Ideas (含图片/链接) =====
function renderIdeas() {
  var c = document.getElementById("app-content");
  var categories = ["all"].concat(Array.from(new Set(DB.data.ideas.map(function(i) { return i.category; }))));
  if (window.__ideaStatusFilter == null) window.__ideaStatusFilter = "all";
  var filtered = DB.data.ideas;
  if (currentFilter !== "all") filtered = filtered.filter(function(i) { return i.category === currentFilter; });
  if (window.__ideaStatusFilter !== "all") filtered = filtered.filter(function(i) { return (i.status || "new") === window.__ideaStatusFilter; });

  var statusMap = { new: { label: "新想法", badge: "badge-blue" }, developing: { label: "孵化中", badge: "badge-orange" }, archived: { label: "已归档", badge: "badge-gray" } };
  var statusTabs = [["all", "全部"], ["new", "新想法"], ["developing", "孵化中"], ["archived", "已归档"]];

  c.innerHTML =
    '<div class="filter-bar">' + statusTabs.map(function(st) { return '<div class="chip' + (window.__ideaStatusFilter === st[0] ? ' active' : '') + '" onclick="setIdeaStatusFilter(\'' + st[0] + '\')">' + st[1] + '</div>'; }).join("") + '</div>' +
    '<div class="filter-bar">' + categories.map(function(cat) { return '<div class="chip' + (currentFilter === cat ? ' active' : '') + '" onclick="setFilter(\'' + cat + '\')">' + (cat === "all" ? "全部" : cat) + '</div>'; }).join("") + '</div>' +
    '<div class="idea-grid">' +
    (filtered.length === 0 ? '<div class="empty-state"><div class="empty-icon">💭</div><div class="empty-text">' + (window.__ideaStatusFilter === "archived" ? '还没有归档的想法<br>点卡片上的「📦 归档」即可收纳' : '还没有想法记录<br>灵感来了随时记录！') + '</div></div>' : filtered.map(function(i) {
      return '<div class="card" onclick="openIdeaDetail(\'' + i.id + '\')">' +
        '<div class="card-header"><div class="card-title">' + escapeHtml(i.title) + '</div><span class="badge ' + statusMap[i.status].badge + '">' + statusMap[i.status].label + '</span></div>' +
        '<div class="card-body">' + escapeHtml(i.description) + '</div>' +
        (i.images && i.images.length ? '<div class="card-images" id="cia-' + i.id + '" data-imgids="' + i.images.join(",") + '"><span class="text-xs" style="color:var(--text-tertiary);padding:12px">加载中...</span></div>' : '') +
        linksHtml(i.links) +
        '<div class="flex-between mt-12"><div><span class="badge badge-purple">' + escapeHtml(i.category) + '</span>' + (i.inspiration ? '<span class="badge badge-gray">灵感: ' + escapeHtml(i.inspiration) + '</span>' : '') + '</div><span class="text-xs text-secondary">' + formatDateShort(i.date) + '</span></div>' +
        '<div class="inline-actions">' +
          '<button class="ia-btn ia-btn-edit" onclick="event.stopPropagation();editIdea(\'' + i.id + '\')">✏️ 编辑</button>' +
          (i.status !== "developing" ? '<button class="ia-btn ia-btn-note" onclick="event.stopPropagation();cycleIdeaStatus(\'' + i.id + '\',\'developing\')">🔥 孵化中</button>' : '') +
          (i.status !== "archived" ? '<button class="ia-btn ia-btn-note" onclick="event.stopPropagation();cycleIdeaStatus(\'' + i.id + '\',\'archived\')">📦 归档</button>' : '') +
          '<button class="ia-btn ia-btn-delete" onclick="event.stopPropagation();deleteItemGeneric(\'ideas\',\'' + i.id + '\')">🗑</button>' +
        '</div>' +
      '</div>';
    }).join("")) +
    '</div>';

  filtered.forEach(function(i) {
    if (i.images && i.images.length) loadCardImages("cia-" + i.id, i.images);
  });
}

// 想法详情卡（点击进入，底部可编辑/删除）
async function openIdeaDetail(id) {
  var i = DB.data.ideas.find(function(x) { return x.id === id; });
  if (!i) return;
  var statusMap = { new: "新想法", developing: "孵化中", archived: "已归档" };
  var badgeMap = { new: "badge-blue", developing: "badge-orange", archived: "badge-gray" };
  var imgs = (i.images && i.images.length) ? await ImageDB.getManySafe(i.images) : [];
  var imgHtml = imgs.length ? '<div class="detail-imgs">' + imgs.map(function(src) {
    return '<div class="detail-img" style="background-image:url(' + src + ')" data-src="' + src + '" onclick="viewFull(event)"></div>';
  }).join("") + '</div>' : '';

  showModal(
    '<div class="detail-head"><div class="detail-title">' + escapeHtml(i.title) + '</div>' +
    '<div class="flex gap wrap">' +
      '<span class="badge ' + badgeMap[i.status] + '">' + statusMap[i.status] + '</span>' +
      '<span class="badge badge-purple">' + escapeHtml(i.category) + '</span>' +
      (i.inspiration ? '<span class="badge badge-gray">灵感: ' + escapeHtml(i.inspiration) + '</span>' : '') +
    '</div></div>' +
    '<div class="detail-body">' + escapeHtml(i.description) + '</div>' +
    (i.detail ? '<div class="detail-detail"><div class="detail-detail-label">📋 详细描述</div><div class="detail-detail-body">' + escapeHtml(i.detail) + '</div></div>' : '') +
    imgHtml +
    linksHtml(i.links) +
    '<div class="detail-date">创建于 ' + formatDateShort(i.date) + '</div>' +
    (function(){
      var synced = i.syncedInsightId && DB.data.insights.some(function(x){ return x.id === i.syncedInsightId; });
      var syncBtn = synced
        ? '<button class="btn btn-note" onclick="closeModal();syncIdeaToInsight(\'' + i.id + '\')">✅ 已同步·查看需求洞察</button>'
        : '<button class="btn btn-accent" onclick="syncIdeaToInsight(\'' + i.id + '\')">🔄 同步到需求洞察</button>';
      return '<div class="detail-actions">' +
        syncBtn +
        '<button class="btn btn-primary" onclick="closeModal();editIdea(\'' + i.id + '\')">✏️ 编辑</button>' +
        '<button class="btn btn-danger" onclick="if(confirm(\'确定删除该想法？\')){closeModal();deleteItemGeneric(\'ideas\',\'' + i.id + '\')}">🗑 删除</button>' +
        '<button class="btn btn-secondary" onclick="closeModal()">关闭</button>' +
      '</div>';
    })()
  );
}

// 想法库 → 需求洞察：把一条想法同步为一条需求洞察（去重，已同步则点开查看）
function syncIdeaToInsight(id) {
  var i = DB.data.ideas.find(function(x) { return x.id === id; });
  if (!i) return;
  // 已同步过：直接打开对应的需求洞察详情，不重复创建
  if (i.syncedInsightId) {
    var existing = DB.data.insights.find(function(x) { return x.id === i.syncedInsightId; });
    if (existing) { showToast("该想法已同步到需求洞察", "info"); openInsightDetail(i.syncedInsightId); return; }
  }
  var newId = uid();
  DB.data.insights.unshift({
    id: newId,
    title: i.title,
    targetUser: "",
    painPoint: i.inspiration || "",
    description: i.detail || i.description,
    priority: "medium",
    product: i.category || "",
    images: (i.images || []).slice(),
    links: (i.links || []).slice(),
    supplements: [],
    date: today(),
    fromIdea: i.id,
  });
  i.syncedInsightId = newId;
  DB.save();
  DB.logActivity("insight", "想法同步为需求洞察：" + i.title);
  showToast("已同步到需求洞察 ✅", "success");
  renderIdeas();
  openIdeaDetail(id);
}

async function editIdea(id) {
  var i = DB.data.ideas.find(function(x) { return x.id === id; });
  if (!i) return;
  editingItemId = id; editingType = "idea";
  clearPendingImages();
  if (i.images && i.images.length) {
    var existing = await ImageDB.getManySafe(i.images);
    pendingImages = i.images.map(function(id, k) { return { data: existing[k], id: id }; }).filter(function(x) { return x.data; });
  }

  showModal(
    '<div class="modal-title">✏️ 编辑想法</div>' +
    '<form onsubmit="submitEditIdea(event)">' +
    '<div class="form-group"><div class="form-label">标题</div><input class="form-input" name="title" value="' + escapeHtml(i.title) + '" required></div>' +
    '<div class="form-group"><div class="form-label">描述（简短）</div><textarea class="form-textarea" name="description" required>' + escapeHtml(i.description) + '</textarea></div>' +
    '<div class="form-group"><div class="form-label">详细描述（长文）</div><textarea class="form-textarea" name="detail" placeholder="产品背景、方案细节、技术要点等，可写长文..." style="min-height:100px">' + escapeHtml(i.detail || "") + '</textarea></div>' +
    '<div class="form-row"><div class="form-group"><div class="form-label">分类</div><select class="form-select" name="category"><option value="产品创意"' + (i.category === "产品创意" ? " selected" : "") + '>产品创意</option><option value="结构创新"' + (i.category === "结构创新" ? " selected" : "") + '>结构创新</option><option value="技术创新"' + (i.category === "技术创新" ? " selected" : "") + '>技术创新</option><option value="市场机会"' + (i.category === "市场机会" ? " selected" : "") + '>市场机会</option><option value="用户体验"' + (i.category === "用户体验" ? " selected" : "") + '>用户体验</option></select></div>' +
    '<div class="form-group"><div class="form-label">灵感来源</div><input class="form-input" name="inspiration" value="' + escapeHtml(i.inspiration || "") + '"></div></div>' +
    '<div class="form-group"><div class="form-label">图片（点击+添加）</div><div class="image-preview-grid" id="img-previews">' + existingThumbsHtml() + '</div><input type="file" id="img-input" accept="image/*" multiple style="display:none" onchange="handleImageSelect(event)"><div class="btn btn-secondary" onclick="document.getElementById(\'img-input\').click()" style="margin-top:6px">📷 添加图片</div>' + imgUrlInputHtml() + '</div>' +
    linkEditorHtml(i.links || []) +
    '<div class="btn-row"><button type="button" class="btn btn-secondary" onclick="closeModal()">取消</button><button type="submit" class="btn btn-primary">保存修改</button></div>' +
    '</form>'
  );
}

async function submitEditIdea(event) {
  event.preventDefault();
  var fd = new FormData(event.target);
  var data = Object.fromEntries(fd);
  var i = DB.data.ideas.find(function(x) { return x.id === editingItemId; });
  if (!i) { closeModal(); return; }

  Object.assign(i, {
    title: data.title, description: data.description,
    detail: data.detail || "",
    category: data.category, inspiration: data.inspiration || ""
  });

  var newIds = await storePendingImages();
  // 清理被删除的已有图片（避免在 ImageDB 留下孤儿）
  var removedIds = (i.images || []).filter(function(old) { return newIds.indexOf(old) === -1; });
  if (removedIds.length) { try { await ImageDB.removeMany(removedIds); } catch (e) {} }
  i.images = newIds;
  i.links = parseLinksFromForm(data);

  DB.logActivity("idea", "编辑想法：" + i.title);
  DB.save();
  clearPendingImages();
  closeModal();
  render();
  showToast("想法已更新", "success");
}

// ===== Edit Competitor =====
async function editCompetitor(id) {
  var x = DB.data.competitors.find(function(c) { return c.id === id; });
  if (!x) return;
  editingItemId = id; editingType = "competitor";
  clearPendingImages();
  if (x.images && x.images.length) {
    var existing = await ImageDB.getManySafe(x.images);
    pendingImages = x.images.map(function(id, k) { return { data: existing[k], id: id }; }).filter(function(y) { return y.data; });
  }

  showModal(
    '<div class="modal-title">✏️ 编辑竞品</div>' +
    '<form onsubmit="submitEditCompetitor(event)">' +
    '<div class="form-group"><div class="form-label">产品名称</div><input class="form-input" name="name" value="' + escapeHtml(x.name) + '" required></div>' +
    '<div class="form-row"><div class="form-group"><div class="form-label">品牌</div><input class="form-input" name="brand" value="' + escapeHtml(x.brand) + '" required></div>' +
    '<div class="form-group"><div class="form-label">价格</div><input class="form-input" name="price" value="' + escapeHtml(x.price) + '"></div></div>' +
    '<div class="form-group"><div class="form-label">平台</div><input class="form-input" name="platform" value="' + escapeHtml(x.platform) + '"></div>' +
    '<div class="form-group"><div class="form-label">产品特性（逗号分隔）</div><input class="form-input" name="features" value="' + escapeHtml(x.features.join(",")) + '"></div>' +
    '<div class="form-group"><div class="form-label">优势（逗号分隔）</div><textarea class="form-textarea" name="pros" style="min-height:60px">' + escapeHtml(x.pros.join(",")) + '</textarea></div>' +
    '<div class="form-group"><div class="form-label">不足（逗号分隔）</div><textarea class="form-textarea" name="cons" style="min-height:60px">' + escapeHtml(x.cons.join(",")) + '</textarea></div>' +
    '<div class="form-group"><div class="form-label">评分（1-5）</div><select class="form-select" name="rating"><option value="5"' + (x.rating === 5 ? " selected" : "") + '>⭐⭐⭐⭐⭐</option><option value="4"' + (x.rating === 4 ? " selected" : "") + '>⭐⭐⭐⭐</option><option value="3"' + (x.rating === 3 ? " selected" : "") + '>⭐⭐⭐</option><option value="2"' + (x.rating === 2 ? " selected" : "") + '>⭐⭐</option><option value="1"' + (x.rating === 1 ? " selected" : "") + '>⭐</option></select></div>' +
    '<div class="form-group"><div class="form-label">链接</div><input class="form-input" name="url" value="' + escapeHtml(x.url || "") + '"></div>' +
    '<div class="form-group"><div class="form-label">图片（点击+添加）</div><div class="image-preview-grid" id="img-previews">' + existingThumbsHtml() + '</div><input type="file" id="img-input" accept="image/*" multiple style="display:none" onchange="handleImageSelect(event)"><div class="btn btn-secondary" onclick="document.getElementById(\'img-input\').click()" style="margin-top:6px">📷 添加图片</div>' + imgUrlInputHtml() + '</div>' +
    '<div class="btn-row"><button type="button" class="btn btn-secondary" onclick="closeModal()">取消</button><button type="submit" class="btn btn-primary">保存修改</button></div>' +
    '</form>'
  );
}

async function submitEditCompetitor(event) {
  event.preventDefault();
  var fd = new FormData(event.target);
  var data = Object.fromEntries(fd);
  var x = DB.data.competitors.find(function(c) { return c.id === editingItemId; });
  if (!x) { closeModal(); return; }

  Object.assign(x, {
    name: data.name, brand: data.brand, price: data.price || "",
    platform: data.platform || "",
    features: data.features ? data.features.split(",").map(function(s) { return s.trim(); }).filter(Boolean) : [],
    pros: data.pros ? data.pros.split(",").map(function(s) { return s.trim(); }).filter(Boolean) : [],
    cons: data.cons ? data.cons.split(",").map(function(s) { return s.trim(); }).filter(Boolean) : [],
    rating: parseInt(data.rating) || 3, url: data.url || ""
  });

  var newIds = await storePendingImages();
  // 清理被删除的已有图片（避免在 ImageDB 留下孤儿）
  var removedIds = (x.images || []).filter(function(old) { return newIds.indexOf(old) === -1; });
  if (removedIds.length) { try { await ImageDB.removeMany(removedIds); } catch (e) {} }
  x.images = newIds;

  DB.logActivity("competitor", "编辑竞品：" + x.name);
  DB.save();
  clearPendingImages();
  closeModal();
  render();
  showToast("竞品已更新", "success");
}

// 删除竞品（列表 🗑 / 详情弹窗共用）
function deleteCompetitor(id) {
  var x = DB.data.competitors.find(function(c) { return c.id === id; });
  if (!x) return;
  if (typeof confirm === "function" && !confirm("确定删除竞品「" + x.name + "」？删除后不可恢复。")) return;
  var idx = DB.data.competitors.indexOf(x);
  if (idx >= 0) DB.data.competitors.splice(idx, 1);
  DB.logActivity("competitor", "删除竞品：" + x.name);
  DB.save();
  closeModal();
  render();
  if (typeof showToast === "function") showToast("竞品已删除", "success");
}

// ===== Planning (含看板) =====
function renderPlanning() {
  var c = document.getElementById("app-content");
  var statuses = ["all", "进行中", "待启动", "已完成"];
  var filtered = DB.data.planning;
  if (currentFilter !== "all") filtered = filtered.filter(function(p) { return p.status === currentFilter; });

  // stats
  var products = DB.data.products;
  var total = products.length;
  var evtCount = products.filter(function(p) { return p.stage === "evt"; }).length;
  var dvtCount = products.filter(function(p) { return p.stage === "dvt"; }).length;
  var pvtCount = products.filter(function(p) { return p.stage === "pvt"; }).length;
  var mpCount = products.filter(function(p) { return p.stage === "mp"; }).length;
  var gmv = DB.data.meta.estimatedGMV || "0";

  // find product names per stage
  var evtNames = products.filter(function(p) { return p.stage === "evt"; }).map(function(p) { return p.name; }).join("、");
  var dvtNames = products.filter(function(p) { return p.stage === "dvt"; }).map(function(p) { return p.name; }).join("、");
  var pvtNames = products.filter(function(p) { return p.stage === "pvt"; }).map(function(p) { return p.name; }).join("、");
  var mpNames = products.filter(function(p) { return p.stage === "mp"; }).map(function(p) { return p.name; }).join("、");

  var statusColors = { "进行中": "var(--accent-blue)", "待启动": "var(--text-tertiary)", "已完成": "var(--accent-green)" };

  c.innerHTML =
    '<!-- 看板 -->' +
    '<div class="section-title" style="margin-top:0"><span class="emoji">📊</span> 在研项目总览 <button class="card-edit-btn" onclick="editGMV()" style="display:inline-flex;margin-left:8px" title="编辑GMV">✏️</button></div>' +
    '<div class="planning-dashboard">' +
      '<div class="plan-db-card"><div class="pd-value" style="color:var(--accent-blue)">' + total + '</div><div class="pd-label">总产品线</div></div>' +
      '<div class="plan-db-card"><div class="pd-value" style="color:var(--accent-indigo)">' + (evtCount + dvtCount + pvtCount) + '</div><div class="pd-label">在研项目</div></div>' +
      '<div class="plan-db-card"><div class="pd-value" style="color:var(--accent-green)">¥' + escapeHtml(gmv) + '</div><div class="pd-label">预估年内GMV</div><div class="pd-sub">万美元</div></div>' +
    '</div>' +
    '<div class="plan-stage-row">' +
      '<div class="plan-stage-item" style="border-top:2px solid var(--accent-orange)"><div class="ps-value">' + evtCount + '</div><div class="ps-label">EVT</div><div class="ps-detail">' + (evtNames || "—") + '</div></div>' +
      '<div class="plan-stage-item" style="border-top:2px solid var(--accent-blue)"><div class="ps-value">' + dvtCount + '</div><div class="ps-label">DVT</div><div class="ps-detail">' + (dvtNames || "—") + '</div></div>' +
      '<div class="plan-stage-item" style="border-top:2px solid var(--accent-indigo)"><div class="ps-value">' + pvtCount + '</div><div class="ps-label">PVT</div><div class="ps-detail">' + (pvtNames || "—") + '</div></div>' +
      '<div class="plan-stage-item" style="border-top:2px solid var(--accent-green)"><div class="ps-value">' + mpCount + '</div><div class="ps-label">MP</div><div class="ps-detail">' + (mpNames || "—") + '</div></div>' +
    '</div>' +

    '<!-- 路线图 -->' +
    '<div class="section-title"><span class="emoji">🗺️</span> 路线图</div>' +
    '<div class="filter-bar">' + statuses.map(function(s) { return '<div class="chip' + (currentFilter === s ? ' active' : '') + '" onclick="setFilter(\'' + s + '\')">' + (s === "all" ? "全部" : s) + '</div>'; }).join("") + '</div>' +
    '<div class="timeline">' +
      filtered.map(function(p) {
        return '<div class="timeline-item"><div class="timeline-dot" style="background:' + (statusColors[p.status] || "var(--text-tertiary)") + '"></div>' +
          '<div class="timeline-content"><div class="flex-between mb-8"><div class="card-title">' + escapeHtml(p.product) + '</div><span class="badge ' + (p.status === "进行中" ? "badge-blue" : p.status === "已完成" ? "badge-green" : "badge-gray") + '">' + p.status + '</span></div>' +
          '<div class="text-sm" style="color:var(--accent-blue);font-weight:600;margin-bottom:6px">' + escapeHtml(p.phase) + '</div>' +
          '<div class="text-xs text-secondary mb-8">' + p.startDate + ' → ' + p.endDate + '</div><div style="margin-top:8px">' +
          p.milestones.map(function(m) { return '<div style="font-size:13px;padding:4px 0;display:flex;align-items:center;gap:8px"><span style="color:var(--accent-blue)">○</span> ' + escapeHtml(m) + '</div>'; }).join("") +
          '</div>' + (p.notes ? '<div class="card-body mt-8" style="padding:8px;background:var(--bg-tertiary);border-radius:8px">📝 ' + escapeHtml(p.notes) + '</div>' : '') +
          '</div></div>';
      }).join("") +
    '</div>';
}

function editGMV() {
  showModal(
    '<div class="modal-title">设置预估年内GMV</div>' +
    '<form onsubmit="submitGMV(event)">' +
    '<div class="form-group"><div class="form-label">预估GMV（万美元）</div><input class="form-input" name="gmv" type="number" value="' + escapeHtml(DB.data.meta.estimatedGMV || "0") + '" placeholder="例如: 200,000"></div>' +
    '<div class="btn-row"><button type="button" class="btn btn-secondary" onclick="closeModal()">取消</button><button type="submit" class="btn btn-primary">保存</button></div>' +
    '</form>'
  );
}

function submitGMV(event) {
  event.preventDefault();
  var fd = new FormData(event.target);
  DB.data.meta.estimatedGMV = fd.get("gmv");
  DB.save();
  closeModal();
  render();
  showToast("GMV已更新", "success");
}

// ===== Settings (含备份管理 + 安全设置) =====
// ===== 设置页 · 模型配置（Gemini 等 API Key，仅存本机 localStorage hw_pm_ai_config）=====
function settingsModelOptions() {
  var keys = Object.keys((typeof INTEL_PROVIDERS !== "undefined") ? INTEL_PROVIDERS : {});
  if (!keys.length) return '<option value="gemini">Gemini</option>';
  var cfg = (typeof loadAiConfig === "function") ? loadAiConfig() : {};
  var defProv = cfg.provider || "gemini";
  return keys.filter(function (k) {
    var p = INTEL_PROVIDERS[k];
    return p && typeof p.buildBodyForPrompt === "function" && p.search !== false;
  }).map(function (k) {
    var p = INTEL_PROVIDERS[k];
    return '<option value="' + k + '"' + (k === defProv ? " selected" : "") + '>' + escapeHtml((p.label || k) + (p.search ? " 🌐" : "")) + "</option>";
  }).join("");
}
function saveSettingsModel() {
  var cfg = (typeof loadAiConfig === "function") ? loadAiConfig() : {};
  var keyEl = document.getElementById("set-model-key");
  var provEl = document.getElementById("set-model-provider");
  cfg.apiKey = keyEl ? keyEl.value.trim() : (cfg.apiKey || "");
  if (provEl) cfg.provider = provEl.value;
  if (typeof saveAiConfig === "function") saveAiConfig(cfg);
  if (typeof showToast === "function") showToast("模型配置已保存（仅存本机，不上云）", "success");
}
function toggleSettingsWs(el) {
  var cfg = (typeof loadAiConfig === "function") ? loadAiConfig() : {};
  cfg.webSearch = (cfg.webSearch === false) ? true : false;
  if (typeof saveAiConfig === "function") saveAiConfig(cfg);
  if (el) el.textContent = cfg.webSearch !== false ? "已开启" : "已关闭";
  if (typeof showToast === "function") showToast(cfg.webSearch !== false ? "已开启联网检索（真实来源）" : "已关闭联网检索（仅用预置资讯）", "success");
}

async function renderSettings() {
  var c = document.getElementById("app-content");
  var isDark = document.documentElement.getAttribute("data-theme") === "dark";
  var isLocked = PrivacyManager.isLockEnabled();
  var cbEnabled = CloudBackup.isEnabled();
  var cbState = CloudBackup._state || { lastBackup: null, backupCount: 0 };
  var lastBackupStr = cbState.lastBackup ? formatDateTime(cbState.lastBackup) : "暂无";
  var isEncrypted = PrivacyManager.isEncryptEnabled();
  var aiCfg = (typeof loadAiConfig === "function") ? loadAiConfig() : {};

  var wd = WebDAVSync._cfg || {};
  var wdEnabled = !!(wd.enabled && wd.proxyUrl && wd.username && wd.appPassword && wd.folder);
  var wdProxy = wd.proxyUrl || "";
  var wdFolder = wd.folder || "PM工作台备份";
  var wdUser = wd.username || "";
  var wdPass = wd.appPassword || "";
  var wdLastSync = wd.lastSync || null;

  var versionsHtml = "";
  try {
    var versions = await BackupDB.list();
    versionsHtml = versions.length ? versions.map(function(v) {
      return '<div class="version-item"><div><div class="v-date">' + v.name + '</div><div class="v-time">' + formatDateTime(v.date) + '</div></div><div class="v-actions"><button class="v-btn v-btn-restore" onclick="restoreBackup(\'' + v.id + '\')">恢复</button><button class="v-btn v-btn-delete" onclick="deleteBackup(\'' + v.id + '\')">删除</button></div></div>';
    }).join("") : '<div style="padding:12px;text-align:center;color:var(--text-secondary);font-size:13px">还没有自动备份记录</div>';
  } catch (e) {
    versionsHtml = '<div style="padding:12px;text-align:center;color:var(--text-secondary);font-size:13px">IndexedDB不可用</div>';
  }

  var email = (typeof SyncManager !== "undefined" && SyncManager.getEmail) ? SyncManager.getEmail() : "";
  var syncErr = (typeof SyncManager !== "undefined" && SyncManager.getLastError) ? SyncManager.getLastError() : "";
  c.innerHTML =
    '<div class="section-title"><span class="emoji">☁️</span> 账号与同步</div>' +
    '<div class="account-card">' +
      '<div class="account-email">' + (email ? escapeHtml(email) : '未登录（访客）') + '</div>' +
      '<div class="account-sync">数据实时同步至云端 · 跨设备一致' + (syncErr ? ' · <span style="color:#dc2626">同步异常：' + escapeHtml(String(syncErr).slice(0, 60)) + '</span>' : '') + '</div>' +
      '<div class="account-actions">' +
        '<button class="ac-btn" onclick="SyncManager.syncNow();showToast(\'已触发同步\',\'success\')">🔄 立即同步</button>' +
        '<button class="ac-btn" onclick="accountSwitch()">🔄 切换账号</button>' +
        '<button class="ac-btn" onclick="accountAdd()">➕ 添加账号</button>' +
        '<button class="ac-btn ac-btn-danger" onclick="accountLogout()">🚪 退出登录</button>' +
      '</div>' +
    '</div>' +
    '<div class="section-title"><span class="emoji">🔐</span> 安全与隐私</div>' +
    '<div class="security-card" onclick="toggleAppLock()"><div class="flex-between"><div><div class="card-title">应用锁</div><div class="card-body">4位数字密码保护，' + (isLocked ? '5分钟无操作自动锁定' : '关闭状态') + '</div></div><span class="security-status ' + (isLocked ? 'enabled' : 'disabled') + '">' + (isLocked ? '✓ 已开启' : '已关闭') + '</span></div></div>' +
    '<div class="security-card" onclick="manualLock()"><div class="flex-between"><div><div class="card-title">🔒 立即锁定</div><div class="card-body">手动锁定应用，需输入密码解锁</div></div><div style="color:var(--text-secondary)">→</div></div></div>' +

    '<div class="section-title"><span class="emoji">🛡️</span> 手动备份下载</div>' +
    '<div class="card" style="cursor:pointer" onclick="downloadCloudBackup()"><div class="flex-between"><div class="card-title">📥 下载完整备份</div><div style="color:var(--text-secondary)">→</div></div><div class="card-body">把云端数据（含图片）打包成 JSON 下载到本机<br><span style="font-size:11px;color:var(--text-tertiary)">数据已实时存于云端，此为主动备份副本</span></div></div>' +
    '<div class="card" style="cursor:pointer" onclick="runManualBackup()"><div class="flex-between"><div class="card-title">💾 保存本地快照</div><div style="color:var(--text-secondary)">→</div></div><div class="card-body">在浏览器 IndexedDB 存一份手动快照<br><span style="font-size:11px;color:var(--text-tertiary)">一次性手动快照，非自动</span></div></div>' +

    /* 坚果云 WebDAV 自动同步设置已移除 */

    '<div class="section-title"><span class="emoji">📦</span> 手动下载备份（迁移 / 兜底）</div>' +
    '<div class="cloud-backup-section">' +
      '<div class="cb-actions">' +
        '<button class="cb-btn cb-btn-primary" onclick="downloadCloudBackup()">📥 下载完整备份</button>' +
        '<button class="cb-btn" onclick="document.getElementById(\'import-file\').click()">📤 从备份恢复</button>' +
      '</div>' +
      '<div class="cb-guide">' +
        '<div class="cb-guide-title">🔄 换设备 / 兜底迁移</div>' +
        '<div class="cb-step"><span class="cb-step-num">1</span> 点「📥 下载完整备份」保存 JSON 到云盘/微信</div>' +
        '<div class="cb-step"><span class="cb-step-num">2</span> 新设备打开工作台 → 设置 → 点「📤 从备份恢复」选 JSON</div>' +
        '<div class="cb-tip">💡 日常数据已实时同步云端，下载备份仅用于换机或额外保险。</div>' +
      '</div>' +
    '</div>' +
    '<input type="file" id="import-file" accept=".json" style="display:none" onchange="importData(event)">' +

    '<div class="section-title"><span class="emoji">🎨</span> 外观</div>' +
    '<div class="card" onclick="toggleTheme()" style="cursor:pointer"><div class="flex-between"><div><div class="card-title">主题模式</div><div class="card-body">' + (isDark ? "当前: 深色模式 🌙" : "当前: 浅色模式 ☀️") + '</div></div><div style="font-size:24px">' + (isDark ? "🌙" : "☀️") + '</div></div></div>' +

    '<div class="section-title"><span class="emoji">🤖</span> 行业情报 · AI 模型</div>' +
    '<div class="card"><div class="card-title">⚙️ 模型配置（在此填写 Gemini 等 Key）</div>' +
      '<div class="form-group"><div class="form-label">模型</div><select class="form-select" id="set-model-provider">' + settingsModelOptions() + '</select></div>' +
      '<div class="form-group"><div class="form-label">API Key（仅存本机，不上云）</div><input class="form-input" id="set-model-key" type="password" placeholder="粘贴 Key（Gemini 形如 AIza…）" value="' + escapeHtml(aiCfg.apiKey || "") + '"></div>' +
      '<div class="form-group"><div class="form-label">🌐 联网检索（Gemini 接地≈免费 · 真实来源）</div><button class="btn btn-secondary" id="set-model-ws" onclick="toggleSettingsWs(this)">' + (aiCfg.webSearch !== false ? "已开启" : "已关闭") + '</button></div>' +
      '<div class="btn-row"><button class="btn btn-primary" onclick="saveSettingsModel()">💾 保存配置</button></div>' +
      '<div class="intel-help">默认 <b>Gemini（AI Studio 免费 Key · 联网搜索带来源）</b>；大陆需开 VPN 直连。无 VPN 可改 <b>智谱 GLM-4-Flash / 硅基流动（国内·免费）</b>。Key 仅存本机、不上云。</div>' +
    '</div>' +
    '<div class="card" onclick="openFreeApiGuide()" style="cursor:pointer"><div class="flex-between"><div><div class="card-title">🔑 获取免费 Key 引导</div><div class="card-body">Gemini（AI Studio 免费·需VPN）/ 智谱·硅基流动 国内免费<br><span style="font-size:11px;color:var(--text-tertiary)">用于情报/市场机会等模块，Key 仅存本机不上云</span></div></div><div style="color:var(--text-secondary)">→</div></div></div>' +
    '<div class="section-title"><span class="emoji">💾</span> 数据管理</div>' +
    '<div class="card" onclick="exportData()" style="cursor:pointer"><div class="flex-between"><div class="card-title">📤 导出完整备份（含图片）</div><div style="color:var(--text-secondary)">→</div></div><div class="card-body">导出完整JSON文件，包含所有数据+图片<br><span style="font-size:11px;color:var(--text-tertiary)">数据已实时同步云端，导出用于额外备份</span></div></div>' +
    '<div class="card" onclick="location.href=\'./migrate.html\'" style="cursor:pointer;border:1px solid #bfdbfe;background:#eff6ff"><div class="flex-between"><div><div class="card-title">📦 旧站数据迁移工具</div><div class="card-body">从 CloudStudio 旧域名全量搬迁到本 EdgeOne 域名<br><span style="font-size:11px;color:var(--text-tertiary)">含 localStorage + 图片库（收藏/AI Key/想法等），跨域无损迁移</span></div></div><div style="color:var(--text-secondary);font-size:20px">→</div></div>' +
    '<div class="card" onclick="confirmReset()" style="cursor:pointer"><div class="flex-between"><div class="card-title" style="color:var(--accent-red)">🗑️ 重置数据</div><div style="color:var(--text-secondary)">→</div></div><div class="card-body">恢复到初始示例数据（有30秒撤销机会）</div></div>' +

    '<div class="section-title"><span class="emoji">🗄️</span> 本地历史备份恢复</div>' +
    '<div class="card"><div class="card-body" style="padding:14px">' +
      '<div style="font-size:13px;color:var(--text-secondary);line-height:1.7;margin-bottom:10px">升级后发现数据变少？浏览器本地可能仍保留着升级前的历史快照。选择「条数最多」的快照「合并上云」最安全——合并不会删除任何一方数据，仅补齐云端缺失项。</div>' +
      '<div id="local-backup-list" class="local-backup-list">读取中…</div>' +
    '</div></div>' +


    '<div class="section-title"><span class="emoji">ℹ️</span> 关于</div>' +
    '<div class="card"><div class="card-title">硬件PM工作台 v5.0</div><div class="card-body">专为硬件产品经理打造的每日中枢工作台<br><br>💼 工作区: 7大模块 · 🌱 个人成长: 6大模块<br><br>✨ v5.0 新增:<br>• PWA 自动更新 + 主屏幕缓存修复<br>• 英语学习双Tab：单词例句 + 文章朗读<br>• 阅读文章支持TTS播放 + 生词标注<br>• 设置页可从个人成长区直接访问<br><br>v4.x: 饮食 / 视频拆解 / 新闻 / 复盘 / 账户 / 英语 / 云端备份</div></div>';
  setTimeout(loadLocalBackupList, 60);
}

// ===== 账号操作：退出 / 切换 / 添加（均先登出当前账号，回到登录门）=====
function accountLogout() {
  if (typeof SyncManager !== "undefined") { try { SyncManager.logout(); } catch (e) {} }
  showToast("已退出登录", "success");
  setTimeout(function () { location.reload(); }, 600);
}
function accountSwitch() {
  if (typeof SyncManager !== "undefined") { try { SyncManager.logout(); } catch (e) {} }
  showToast("请登录其他账号", "success");
  setTimeout(function () { location.reload(); }, 600);
}
function accountAdd() {
  if (typeof SyncManager !== "undefined") { try { SyncManager.logout(); } catch (e) {} }
  showToast("请注册新账号，或登录其他账号", "success");
  setTimeout(function () { location.reload(); }, 600);
}

function toggleAppLock() {
  if (PrivacyManager.isLockEnabled()) {
    if (confirm("确认关闭应用锁？")) {
      PrivacyManager.disableLock();
      render();
      showToast("应用锁已关闭", "warning");
    }
  } else {
    showSetPinModal();
  }
}

function manualLock() {
  closeModal();
  PrivacyManager.lock();
}

function toggleCloudBackup(enabled) {
  CloudBackup.toggle(enabled);
  var msg = enabled ? "云端自动备份已开启（每60分钟下载一次）" : "云端自动备份已关闭";
  showToast(msg, enabled ? "success" : "warning");
  render();
}

// ===== WebDAV config handlers =====
function saveWebDavConfig() {
  if (!WebDAVSync._cfg) WebDAVSync._cfg = {};
  var cfg = WebDAVSync._cfg;
  cfg.proxyUrl = (document.getElementById("wd-proxy").value || "").trim();
  cfg.folder = (document.getElementById("wd-folder").value || "").trim() || "PM工作台备份";
  cfg.username = (document.getElementById("wd-user").value || "").trim();
  cfg.appPassword = document.getElementById("wd-pass").value;
  cfg.enabled = document.getElementById("wd-enabled").checked;
  WebDAVSync.save();
  if (cfg.enabled) WebDAVSync.start(); else WebDAVSync.stop();
  showToast("配置已保存" + (cfg.enabled ? "，自动同步已开启" : ""), "success");
  render();
}

function testWebDav() {
  if (!WebDAVSync._cfg) WebDAVSync._cfg = {};
  WebDAVSync._cfg.proxyUrl = (document.getElementById("wd-proxy").value || "").trim();
  WebDAVSync._cfg.folder = (document.getElementById("wd-folder").value || "").trim() || "PM工作台备份";
  WebDAVSync._cfg.username = (document.getElementById("wd-user").value || "").trim();
  WebDAVSync._cfg.appPassword = document.getElementById("wd-pass").value;
  if (!WebDAVSync.isConfigured()) { showToast("请先填写代理地址、账号、应用密码", "warning"); return; }
  showToast("正在测试连接…", "info");
  WebDAVSync.testConnection().then(function(ok) {
    showToast(ok ? "✅ 连接成功" : "❌ 连接失败（检查地址/账号/密码）", ok ? "success" : "warning");
  });
}

async function downloadCloudBackup() {
  showToast("正在打包完整备份（含图片）…", "info");
  var ok = await CloudBackup.runManualDownload();
  if (ok) {
    showToast("备份已下载！文件包含全部数据+图片", "success");
    render();
  } else {
    showToast("备份失败，请重试", "warning");
  }
}

async function runManualBackup() {
  await DB.saveWithBackup();
  showToast("备份已完成", "success");
  render();
}

async function restoreBackup(id) {
  if (!confirm("⚠️ 确认恢复到此备份版本？\n\n当前数据将被覆盖。建议先导出备份。")) return;
  var bak = await BackupDB.get(id);
  if (bak) {
    localStorage.setItem(DB.KEY, JSON.stringify(bak.data));
    DB.init();
    render();
    showToast("数据已恢复", "success");
  }
}

async function deleteBackup(id) {
  if (!confirm("确认删除此备份版本？")) return;
  await BackupDB.delete(id);
  render();
  showToast("备份已删除", "warning");
}

// 统计关键数据条数（用于判断哪份备份更完整）
function _countData(o) {
  if (!o || typeof o !== "object") return 0;
  var c = 0;
  c += (o.products || []).length;
  c += (o.competitors || []).length;
  c += (o.ideas || []).length;
  c += (o.insights || []).length;
  c += (o.industry || []).length;
  var g = o.growth || {};
  c += (g.reviews || []).length;
  c += ((g.videos && g.videos.items) || []).length;
  c += ((g.news && g.news.items) || []).length;
  c += ((g.outfit && g.outfit.wardrobe) || []).length;
  c += ((g.fridge && g.fridge.items) || []).length;
  if (g.language && g.language.langs) {
    ["en", "ja", "ko"].forEach(function (lc) { var l = g.language.langs[lc]; if (l) c += (l.words || []).length; });
  } else {
    c += ((g.english && g.english.words) || []).length;
  }
  c += ((g.diet && g.diet.items) || []).length;
  c += ((g.account && g.account.holdings) || []).length;
  c += ((o.workbench && o.workbench.tasks) || []).length;
  return c;
}

// 设置页：列出本机 IndexedDB 历史备份
async function loadLocalBackupList() {
  var box = document.getElementById("local-backup-list");
  if (!box) return;
  try {
    var list = await BackupDB.list();
    if (!list || !list.length) {
      box.innerHTML = '<div style="font-size:12px;color:var(--text-tertiary)">未找到本地历史备份</div>';
      return;
    }
    box.innerHTML = list.map(function (v) {
      var cnt = _countData(v.data);
      return '<div class="lb-item"><div class="lb-info"><div class="lb-name">' + escapeHtml(v.name) + '</div><div class="lb-meta">' + formatDateTime(v.date) + ' · 约 ' + cnt + ' 条</div></div><button class="lb-btn" data-bid="' + v.id + '" onclick="restoreBackupMerged(this.dataset.bid)">合并上云</button></div>';
    }).join("");
  } catch (e) {
    box.innerHTML = '<div style="font-size:12px;color:var(--text-tertiary)">读取失败：' + ((e && e.message) || "") + '</div>';
  }
}

// 把本地历史备份合并回云端（以云端当前为主，补入历史备份独有项），并立即同步上云
async function restoreBackupMerged(id) {
  if (!confirm("将把该本地历史备份与当前云端数据合并（保留双方内容），并同步到云端？\n\n建议先到「数据管理」导出一次完整备份以防万一。")) return;
  var bak = await BackupDB.get(id);
  if (!bak || !bak.data) { showToast("备份不存在", "warning"); return; }
  DB.data = mergeData(bak.data, DB.data); // 以云端(当前)为主，补入历史备份独有项
  try { localStorage.setItem(DB.KEY, JSON.stringify(DB.data)); } catch (e) {}
  try { DB.save(); } catch (e) {}   // save 内会写 IDB latest + 推送
  showToast("正在合并并同步到云端…", "info");
  try { if (window.SyncManager) await SyncManager.forcePush(); } catch (e) {}
  render();
  showToast("合并完成，已同步云端", "success");
}

// ===== Link Editor (for forms) =====
function linkEditorHtml(links) {
  var existingHtml = (links || []).map(function(l, idx) {
    return '<div class="link-item"><span class="link-icon">🔗</span><span class="link-text">' + escapeHtml(l.title || l.url) + '</span><button type="button" class="link-remove" onclick="this.parentElement.remove()">✕</button><input type="hidden" name="link_url_' + idx + '" value="' + escapeHtml(l.url) + '"><input type="hidden" name="link_title_' + idx + '" value="' + escapeHtml(l.title || "") + '"></div>';
  }).join("");

  return '<div class="form-group"><div class="form-label">相关链接</div>' +
    '<div id="link-list-container">' + existingHtml + '</div>' +
    '<div class="link-add-row"><input id="link-url-input" placeholder="https://..." style="flex:1"><input id="link-title-input" placeholder="链接标题" style="flex:1"><button type="button" class="add-link-btn" onclick="addLinkItem()">+</button></div></div>';
}

function addLinkItem() {
  var urlInput = document.getElementById("link-url-input");
  var titleInput = document.getElementById("link-title-input");
  var container = document.getElementById("link-list-container");
  if (!urlInput || !container) return;
  var url = urlInput.value.trim();
  if (!url) { showToast("请输入链接地址", "warning"); return; }
  var title = titleInput ? titleInput.value.trim() : url;
  var idx = Date.now();
  var div = document.createElement("div");
  div.className = "link-item";
  div.innerHTML = '<span class="link-icon">🔗</span><span class="link-text">' + escapeHtml(title || url) + '</span><button type="button" class="link-remove" onclick="this.parentElement.remove()">✕</button><input type="hidden" name="link_url_' + idx + '" value="' + escapeHtml(url) + '"><input type="hidden" name="link_title_' + idx + '" value="' + escapeHtml(title) + '">';
  container.appendChild(div);
  urlInput.value = ""; if (titleInput) titleInput.value = "";
}

function parseLinksFromForm(data) {
  var links = [];
  Object.keys(data).forEach(function(key) {
    if (key.startsWith("link_url_")) {
      var suffix = key.replace("link_url_", "");
      var url = data[key];
      var titleKey = "link_title_" + suffix;
      var title = data[titleKey] || url;
      if (url) links.push({ url: url, title: title });
    }
  });
  return links;
}

// ===== Form: Add with images =====
async function handleFormWithImages(event, type, cb) {
  event.preventDefault();
  var fd = new FormData(event.target);
  var data = Object.fromEntries(fd);

  // store pending images
  var imageIds = await storePendingImages();

  // call the callback with data and image IDs
  cb(data, imageIds);

  DB.save();
  clearPendingImages();
  closeModal();
  render();
}

function existingThumbsHtml() {
  return pendingImages.map(function(img, idx) {
    return '<div class="image-thumb" style="background-image:url(' + img.data + ')"><div class="img-delete" onclick="event.stopPropagation();removePendingImage(' + idx + ')">✕</div></div>';
  }).join("") + (pendingImages.length < 9 ? '<div class="image-thumb" style="display:flex;align-items:center;justify-content:center;border-style:dashed;cursor:pointer" onclick="document.getElementById(\'img-input\').click()"><span style="font-size:24px;color:var(--text-tertiary)">+</span></div>' : "");
}

// ===== Quick Add =====
function openQuickAdd() {
  showModal(
    '<div class="modal-title">快速添加</div>' +
    '<div class="quick-menu">' +
      '<div class="quick-menu-item" onclick="closeModal();setTimeout(function(){showAddForm(\'task\')},300)"><div class="qm-icon">✅</div><div class="qm-label">任务</div></div>' +
      '<div class="quick-menu-item" onclick="closeModal();setTimeout(function(){showAddForm(\'note\')},300)"><div class="qm-icon">📓</div><div class="qm-label">笔记</div></div>' +
      '<div class="quick-menu-item" onclick="closeModal();setTimeout(function(){showAddForm(\'idea\')},300)"><div class="qm-icon">💭</div><div class="qm-label">想法</div></div>' +
      '<div class="quick-menu-item" onclick="closeModal();setTimeout(function(){showAddForm(\'competitor\')},300)"><div class="qm-icon">🔍</div><div class="qm-label">竞品</div></div>' +
      '<div class="quick-menu-item" onclick="closeModal();setTimeout(function(){showAddForm(\'industry\')},300)"><div class="qm-icon">📰</div><div class="qm-label">情报</div></div>' +
      '<div class="quick-menu-item" onclick="closeModal();setTimeout(function(){showAddForm(\'insight\')},300)"><div class="qm-icon">💡</div><div class="qm-label">洞察</div></div>' +
      '<div class="quick-menu-item" onclick="closeModal();setTimeout(function(){showAddForm(\'reflection\')},300)"><div class="qm-icon">🤔</div><div class="qm-label">复盘</div></div>' +
      '<div class="quick-menu-item" onclick="closeModal();setTimeout(function(){navigate(\'fridge\');setTimeout(function(){ if(typeof showFridgeItemModal===\'function\') showFridgeItemModal(); },260)},300)"><div class="qm-icon">📦</div><div class="qm-label">物品</div></div>' +
    '</div>' +
    '<div class="btn-row"><button class="btn btn-secondary" onclick="closeModal()">取消</button></div>'
  );
}

function showAddForm(type) {
  clearPendingImages();

  var forms = {
    task: function() {
      return '<div class="modal-title">添加任务</div><form onsubmit="submitFormSimple(event,\'task\')"><div class="form-group"><div class="form-label">任务内容</div><textarea class="form-textarea" name="text" placeholder="输入任务内容..." required></textarea></div><div class="form-group"><div class="form-label">子任务（可选，每行一个）</div><textarea class="form-textarea" name="subs" placeholder="大任务拆成小点，每行一个：&#10;例如：&#10;确认送测时间&#10;联系认证机构&#10;整理测试清单" style="min-height:60px"></textarea></div><div class="form-group"><div class="form-label">优先级</div><select class="form-select" name="priority"><option value="high">高优先级</option><option value="medium" selected>中优先级</option><option value="low">低优先级</option></select></div><div class="form-group"><div class="form-label">完成截止时间（可选）</div><input class="form-input" type="time" name="due"></div><div class="btn-row"><button type="button" class="btn btn-secondary" onclick="closeModal()">取消</button><button type="submit" class="btn btn-primary">添加</button></div></form>';
    },
    note: function() {
      return '<div class="modal-title">快速笔记</div><form onsubmit="submitFormSimple(event,\'note\')"><div class="form-group"><div class="form-label">笔记内容</div><textarea class="form-textarea" name="text" placeholder="记录灵感、想法、待办..." required></textarea></div><div class="btn-row"><button type="button" class="btn btn-secondary" onclick="closeModal()">取消</button><button type="submit" class="btn btn-primary">保存</button></div></form>';
    },
    reflection: function() {
      return '<div class="modal-title">今日复盘</div><form onsubmit="submitFormSimple(event,\'reflection\')"><div class="form-group"><div class="form-label">复盘内容</div><textarea class="form-textarea" name="text" placeholder="今天的收获、思考、改进点..." required></textarea></div><div class="form-group"><div class="form-label">心情</div><select class="form-select" name="mood"><option value="great">🎉 很棒</option><option value="good" selected>😊 不错</option><option value="ok">😐 一般</option><option value="bad">😕 不太好</option></select></div><div class="btn-row"><button type="button" class="btn btn-secondary" onclick="closeModal()">取消</button><button type="submit" class="btn btn-primary">保存</button></div></form>';
    },
    idea: function() {
      return '<div class="modal-title">记录想法</div><form onsubmit="handleFormWithImages(event,\'idea\',submitNewIdea)"><div class="form-group"><div class="form-label">想法标题</div><input class="form-input" name="title" placeholder="给想法起个名字..." required></div><div class="form-group"><div class="form-label">描述（简短）</div><textarea class="form-textarea" name="description" placeholder="一句话概括你的想法..." required></textarea></div><div class="form-group"><div class="form-label">详细描述（长文）</div><textarea class="form-textarea" name="detail" placeholder="产品背景、方案细节、技术要点等，可写长文..." style="min-height:100px"></textarea></div><div class="form-row"><div class="form-group"><div class="form-label">分类</div><select class="form-select" name="category"><option value="产品创意">产品创意</option><option value="结构创新">结构创新</option><option value="技术创新">技术创新</option><option value="市场机会">市场机会</option><option value="用户体验">用户体验</option></select></div><div class="form-group"><div class="form-label">灵感来源</div><input class="form-input" name="inspiration" placeholder="可选"></div></div><div class="form-group"><div class="form-label">图片（可选）</div><div class="image-preview-grid" id="img-previews">' + existingThumbsHtml() + '</div><input type="file" id="img-input" accept="image/*" multiple style="display:none" onchange="handleImageSelect(event)"><div class="btn btn-secondary" onclick="document.getElementById(\'img-input\').click()" style="margin-top:6px">📷 添加图片</div>' + imgUrlInputHtml() + '</div>' + linkEditorHtml([]) + '<div class="btn-row"><button type="button" class="btn btn-secondary" onclick="closeModal()">取消</button><button type="submit" class="btn btn-primary">保存</button></div></form>';
    },
    competitor: function() {
      return '<div class="modal-title">添加竞品</div><form onsubmit="handleFormWithImages(event,\'competitor\',submitNewCompetitor)"><div class="form-group"><div class="form-label">产品名称</div><input class="form-input" name="name" placeholder="竞品产品名..." required></div><div class="form-row"><div class="form-group"><div class="form-label">品牌</div><input class="form-input" name="brand" placeholder="品牌名" required></div><div class="form-group"><div class="form-label">价格</div><input class="form-input" name="price" placeholder="$XX.XX"></div></div><div class="form-group"><div class="form-label">平台</div><input class="form-input" name="platform" placeholder="Amazon / 官网 / 淘宝..." value="Amazon"></div><div class="form-group"><div class="form-label">产品特性（逗号分隔）</div><input class="form-input" name="features" placeholder="磁吸, 折叠, 补光..."></div><div class="form-group"><div class="form-label">优势（逗号分隔）</div><textarea class="form-textarea" name="pros" placeholder="做工好, 价格低..." style="min-height:60px"></textarea></div><div class="form-group"><div class="form-label">不足（逗号分隔）</div><textarea class="form-textarea" name="cons" placeholder="尺寸小, 续航短..." style="min-height:60px"></textarea></div><div class="form-group"><div class="form-label">评分（1-5）</div><select class="form-select" name="rating"><option value="5">⭐⭐⭐⭐⭐</option><option value="4" selected>⭐⭐⭐⭐</option><option value="3">⭐⭐⭐</option><option value="2">⭐⭐</option><option value="1">⭐</option></select></div><div class="form-group"><div class="form-label">链接（可选）</div><input class="form-input" name="url" placeholder="https://..."></div><div class="form-group"><div class="form-label">图片（可选）</div><div class="image-preview-grid" id="img-previews">' + existingThumbsHtml() + '</div><input type="file" id="img-input" accept="image/*" multiple style="display:none" onchange="handleImageSelect(event)"><div class="btn btn-secondary" onclick="document.getElementById(\'img-input\').click()" style="margin-top:6px">📷 添加图片</div>' + imgUrlInputHtml() + '</div><div class="btn-row"><button type="button" class="btn btn-secondary" onclick="closeModal()">取消</button><button type="submit" class="btn btn-primary">保存</button></div></form>';
    },
    industry: function() {
      return '<div class="modal-title">添加行业情报</div><form onsubmit="submitFormSimple(event,\'industry\')"><div class="form-group"><div class="form-label">标题</div><input class="form-input" name="title" placeholder="情报标题..." required></div><div class="form-group"><div class="form-label">来源</div><input class="form-input" name="source" placeholder="行业资讯 / 市场数据 / 竞品动态..." value="行业资讯"></div><div class="form-group"><div class="form-label">摘要</div><textarea class="form-textarea" name="summary" placeholder="情报摘要..." required></textarea></div><div class="form-group"><div class="form-label">标签（逗号分隔）</div><input class="form-input" name="tags" placeholder="无线充电, Qi2, 行业趋势"></div><div class="form-group"><div class="form-label">原文链接（可选）</div><input class="form-input" name="url" placeholder="https://..."></div><div class="form-group"><label style="display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer"><input type="checkbox" name="important" style="width:20px;height:20px"> 标记为重要</label></div><div class="btn-row"><button type="button" class="btn btn-secondary" onclick="closeModal()">取消</button><button type="submit" class="btn btn-primary">保存</button></div></form>';
    },
    insight: function() {
      return '<div class="modal-title">添加需求洞察</div><form onsubmit="handleFormWithImages(event,\'insight\',submitNewInsight)"><div class="form-group"><div class="form-label">洞察标题</div><input class="form-input" name="title" placeholder="需求/痛点标题..." required></div><div class="form-group"><div class="form-label">目标用户</div><input class="form-input" name="targetUser" placeholder="目标用户群体..." required></div><div class="form-group"><div class="form-label">痛点描述</div><textarea class="form-textarea" name="painPoint" placeholder="用户遇到的痛点..." required></textarea></div><div class="form-group"><div class="form-label">机会/方案</div><textarea class="form-textarea" name="description" placeholder="可能的解决机会或方案..." required></textarea></div><div class="form-row"><div class="form-group"><div class="form-label">优先级</div><select class="form-select" name="priority"><option value="high">高优先级</option><option value="medium" selected>中优先级</option><option value="low">低优先级</option></select></div><div class="form-group"><div class="form-label">关联产品</div><input class="form-input" name="product" placeholder="关联产品线"></div></div><div class="form-group"><div class="form-label">图片（可选）</div><div class="image-preview-grid" id="img-previews">' + existingThumbsHtml() + '</div><input type="file" id="img-input" accept="image/*" multiple style="display:none" onchange="handleImageSelect(event)"><div class="btn btn-secondary" onclick="document.getElementById(\'img-input\').click()" style="margin-top:6px">📷 添加图片</div>' + imgUrlInputHtml() + '</div>' + linkEditorHtml([]) + '<div class="btn-row"><button type="button" class="btn btn-secondary" onclick="closeModal()">取消</button><button type="submit" class="btn btn-primary">保存</button></div></form>';
    },
    planning: function() {
      return '<div class="modal-title">添加规划项</div><form onsubmit="submitFormSimple(event,\'planning\')"><div class="form-group"><div class="form-label">产品名称</div><input class="form-input" name="product" placeholder="产品线名称..." required></div><div class="form-group"><div class="form-label">阶段</div><input class="form-input" name="phase" placeholder="如：概念设计 / 开模 / 认证..." required></div><div class="form-row"><div class="form-group"><div class="form-label">开始日期</div><input class="form-input" type="date" name="startDate" value="' + today() + '"></div><div class="form-group"><div class="form-label">结束日期</div><input class="form-input" type="date" name="endDate" value="' + today(30) + '"></div></div><div class="form-group"><div class="form-label">状态</div><select class="form-select" name="status"><option value="待启动">待启动</option><option value="进行中" selected>进行中</option><option value="已完成">已完成</option></select></div><div class="form-group"><div class="form-label">里程碑（逗号分隔）</div><textarea class="form-textarea" name="milestones" placeholder="里程碑1, 里程碑2, 里程碑3..." style="min-height:60px"></textarea></div><div class="form-group"><div class="form-label">备注</div><textarea class="form-textarea" name="notes" placeholder="补充说明..."></textarea></div><div class="btn-row"><button type="button" class="btn btn-secondary" onclick="closeModal()">取消</button><button type="submit" class="btn btn-primary">保存</button></div></form>';
    }
  };

  showModal(forms[type]());
}

// ===== New item callbacks (with images) =====
function submitNewIdea(data, imageIds) {
  DB.data.ideas.unshift({
    id: uid(), title: data.title, description: data.description,
    detail: data.detail || "",
    category: data.category, inspiration: data.inspiration,
    status: "new", images: imageIds || [],
    links: parseLinksFromForm(data), date: today(),
  });
  DB.logActivity("idea", "新增想法：" + data.title);
}

function submitNewCompetitor(data, imageIds) {
  DB.data.competitors.unshift({
    id: uid(), name: data.name, brand: data.brand, price: data.price || "",
    platform: data.platform || "", features: data.features ? data.features.split(",").map(s => s.trim()).filter(Boolean) : [],
    pros: data.pros ? data.pros.split(",").map(s => s.trim()).filter(Boolean) : [],
    cons: data.cons ? data.cons.split(",").map(s => s.trim()).filter(Boolean) : [],
    rating: parseInt(data.rating) || 3, url: data.url || "",
    images: imageIds || [], date: today(),
  });
  DB.logActivity("competitor", "新增竞品：" + data.name);
}

function submitNewInsight(data, imageIds) {
  DB.data.insights.unshift({
    id: uid(), title: data.title, targetUser: data.targetUser,
    painPoint: data.painPoint, description: data.description,
    priority: data.priority, product: data.product || "",
    images: imageIds || [], links: parseLinksFromForm(data),
    supplements: [], date: today(),
  });
  DB.logActivity("insight", "新增洞察：" + data.title);
}

// ===== Simple form submit (no images) =====
function submitFormSimple(event, type) {
  event.preventDefault();
  var fd = new FormData(event.target);
  var data = Object.fromEntries(fd);

  switch (type) {
    case "task": {
      var subs = (data.subs || "").split("\n").map(function (s) { return s.trim(); }).filter(Boolean).map(function (s) { return { id: uid(), text: s, done: false }; });
      DB.data.workbench.tasks.unshift({ id: uid(), text: data.text, priority: data.priority, done: false, date: today(), due: data.due || "", subs: subs.length ? subs : undefined });
      DB.logActivity("task", "新增任务：" + data.text + (subs.length ? "（含 " + subs.length + " 个子任务）" : ""));
      break;
    }
    case "note":
      DB.data.workbench.notes.unshift({ id: uid(), text: data.text, date: today() });
      break;
    case "reflection":
      DB.data.workbench.reflections.unshift({ id: uid(), text: data.text, mood: data.mood, date: today() });
      break;
    case "industry":
      DB.data.industry.unshift({ id: uid(), title: data.title, source: data.source || "", url: data.url || "", summary: data.summary, tags: data.tags ? data.tags.split(",").map(s => s.trim()).filter(Boolean) : [], date: today(), important: data.important === "on" });
      DB.logActivity("industry", "收藏情报：" + data.title);
      break;
    case "planning":
      DB.data.planning.unshift({ id: uid(), product: data.product, phase: data.phase, startDate: data.startDate, endDate: data.endDate, status: data.status, milestones: data.milestones ? data.milestones.split(",").map(s => s.trim()).filter(Boolean) : [], notes: data.notes || "" });
      DB.logActivity("planning", "新增规划：" + data.product + " - " + data.phase);
      break;
  }
  DB.save();
  closeModal();
  render();
}

// ===== Interactions =====
// ---------- 任务层级工具（父任务含子任务，可无限细分，逐个勾选小点） ----------
var _taskExpanded = {};   // 展开状态（会话级）
function taskSubs(t) { return t.subs || []; }
// 递归：全部叶子完成才算完成
function taskAllDone(t) {
  var subs = taskSubs(t);
  if (!subs.length) return !!t.done;
  return subs.every(function (s) { return taskAllDone(s); });
}
// 递归：{done, total} 叶子统计
function taskSubCount(t) {
  var subs = taskSubs(t);
  if (!subs.length) return { done: t.done ? 1 : 0, total: 1 };
  var d = 0, n = 0;
  subs.forEach(function (s) { var r = taskSubCount(s); d += r.done; n += r.total; });
  return { done: d, total: n };
}
// 递归：设置任务及所有子孙完成状态（父勾选=一键全完成/全取消）
function taskSetDone(t, done) {
  taskSubs(t).forEach(function (s) { taskSetDone(s, done); });
  t.done = done;
  t.completedAt = done ? new Date().toISOString() : null;
}
// 递归查找子孙（含子任务）
function taskFindSub(t, subId) {
  var subs = taskSubs(t);
  for (var i = 0; i < subs.length; i++) {
    if (subs[i].id === subId) return subs[i];
    var r = taskFindSub(subs[i], subId);
    if (r) return r;
  }
  return null;
}
// 勾选父任务（有子任务时级联全部）
function toggleTask(id) {
  var task = DB.data.workbench.tasks.find(function(t) { return t.id === id; });
  if (task) {
    taskSetDone(task, !taskAllDone(task));
    DB.save(); render();
  }
}
// 勾选某个子任务 → 自动向上推断父任务完成态
function toggleSub(taskId, subId) {
  var t = DB.data.workbench.tasks.find(function(x) { return x.id === taskId; });
  if (!t) return;
  var s = taskFindSub(t, subId);
  if (!s) return;
  taskSetDone(s, !taskAllDone(s));
  syncTaskChain([t]);
  DB.save(); render();
  if (document.getElementById("ts-list")) loadTaskEditList(taskId); // 编辑弹窗内同步刷新
}
// 递归向上同步 done/completedAt
function syncTaskChain(list) {
  list.forEach(function (x) {
    if (taskSubs(x).length) {
      x.done = taskSubs(x).every(function (c) { return taskAllDone(c); });
      if (x.done && !x.completedAt) x.completedAt = new Date().toISOString();
      if (!x.done) x.completedAt = null;
      syncTaskChain(taskSubs(x));
    }
  });
}
function toggleTaskExpand(id) { _taskExpanded[id] = !_taskExpanded[id]; render(); }

// ---------- 任务树渲染（递归，支持任意层级） ----------
function taskTreeHtml(t) {
  var subs = taskSubs(t);
  var allDone = taskAllDone(t);
  var cnt = taskSubCount(t);
  var hasSub = subs.length > 0;
  var expanded = !!_taskExpanded[t.id];
  var overdue = !allDone && isTaskOverdue(t);
  var row =
    '<div class="task-item' + (allDone ? ' done' : '') + (overdue ? ' task-overdue' : '') + '"' +
    (hasSub ? ' onclick="toggleTaskExpand(\'' + t.id + '\')"' : ' onclick="toggleTask(\'' + t.id + '\')"') + '>' +
    '<div class="task-priority priority-' + (t.priority || 3) + '"></div>' +
    (hasSub ? '<span class="task-expand' + (expanded ? ' open' : '') + '">' + (expanded ? '▾' : '▸') + '</span>' : '') +
    '<div class="task-checkbox' + (allDone ? ' done' : '') + '" onclick="event.stopPropagation();toggleTask(\'' + t.id + '\')"></div>' +
    '<div class="task-text">' + escapeHtml(t.text) +
      (hasSub ? '<span class="task-progress">' + cnt.done + '/' + cnt.total + '</span>' : '') +
      (t.due ? '<span class="task-due' + (overdue ? ' overdue' : '') + '">⏰ ' + t.due + (overdue ? ' 已超时' : '') + '</span>' : '') +
    '</div>' +
    '<div class="task-ops">' +
      '<span class="to-btn" title="编辑" onclick="event.stopPropagation();showTaskEditModal(\'' + t.id + '\')">✏️</span>' +
      '<span class="to-btn" title="添加子任务" onclick="event.stopPropagation();addSubQuick(\'' + t.id + '\')">＋</span>' +
      '<span class="to-btn" title="删除" onclick="event.stopPropagation();taskDel(\'' + t.id + '\')">🗑</span>' +
    '</div></div>';
  if (hasSub && expanded) {
    row += '<div class="task-sub-list">' + subs.map(function (s) { return taskSubTreeHtml(t.id, s); }).join("") + '</div>';
  }
  return row;
}
function taskSubTreeHtml(taskId, s) {
  var subs = taskSubs(s);
  var allDone = taskAllDone(s);
  var cnt = taskSubCount(s);
  var hasSub = subs.length > 0;
  var expanded = !!_taskExpanded[s.id];
  var row =
    '<div class="task-sub-item' + (allDone ? ' done' : '') + '"' +
    (hasSub ? ' onclick="toggleTaskExpand(\'' + s.id + '\')"' : ' onclick="toggleSub(\'' + taskId + '\',\'' + s.id + '\')"') + '>' +
    (hasSub ? '<span class="task-expand small' + (expanded ? ' open' : '') + '">' + (expanded ? '▾' : '▸') + '</span>' : '') +
    '<div class="task-checkbox small' + (allDone ? ' done' : '') + '" onclick="event.stopPropagation();toggleSub(\'' + taskId + '\',\'' + s.id + '\')"></div>' +
    '<div class="task-text">' + escapeHtml(s.text) +
      (hasSub ? '<span class="task-progress">' + cnt.done + '/' + cnt.total + '</span>' : '') +
    '</div>' +
    '<div class="task-ops">' +
      '<span class="to-btn" title="编辑" onclick="event.stopPropagation();editSubInline(\'' + taskId + '\',\'' + s.id + '\')">✏️</span>' +
      '<span class="to-btn" title="删除" onclick="event.stopPropagation();delSub(\'' + taskId + '\',\'' + s.id + '\')">🗑</span>' +
    '</div></div>';
  if (hasSub && expanded) {
    row += '<div class="task-sub-list">' + subs.map(function (c) { return taskSubTreeHtml(taskId, c); }).join("") + '</div>';
  }
  return row;
}

// ---------- 任务编辑 / 子任务管理 ----------
function showTaskEditModal(id) {
  var t = DB.data.workbench.tasks.find(function (x) { return x.id === id; });
  if (!t) return;
  showModal(
    '<div class="modal-title">✏️ 编辑任务</div>' +
    '<form onsubmit="saveTaskEdit(event,\'' + id + '\')">' +
    '<div class="form-group"><div class="form-label">任务内容</div><textarea class="form-textarea" name="text" required>' + escapeHtml(t.text) + '</textarea></div>' +
    '<div class="form-row">' +
    '<div class="form-group"><div class="form-label">优先级</div><select class="form-select" name="priority"><option value="high"' + (t.priority === "high" ? " selected" : "") + '>高优先级</option><option value="medium"' + (t.priority === "medium" ? " selected" : "") + '>中优先级</option><option value="low"' + (t.priority === "low" ? " selected" : "") + '>低优先级</option></select></div>' +
    '<div class="form-group"><div class="form-label">截止时间</div><input class="form-input" type="time" name="due" value="' + escapeHtml(t.due || "") + '"></div>' +
    '</div>' +
    '<div class="form-group"><div class="form-label">任务日期</div><input class="form-input" type="date" name="date" value="' + escapeHtml(t.date || today()) + '"></div>' +
    '<div class="form-group"><div class="form-label">子任务（可继续细分，逐个勾选完成）</div>' +
      '<div class="ts-list" id="ts-list"></div>' +
      '<div class="ts-add"><input class="form-input" id="ts-new" placeholder="输入小点内容，回车添加…" style="flex:1" onkeydown="if(event.key===\'Enter\'){event.preventDefault();addSubFromEdit(\'' + id + '\')}"><button type="button" class="btn btn-secondary" onclick="addSubFromEdit(\'' + id + '\')">＋ 添加小点</button></div>' +
    '</div>' +
    '<div class="btn-row">' +
      '<button type="button" class="btn btn-secondary" style="color:var(--accent-red)" onclick="taskDel(\'' + id + '\')">🗑 删除</button>' +
      '<button type="button" class="btn btn-secondary" onclick="closeModal()">取消</button>' +
      '<button type="submit" class="btn btn-primary">保存</button>' +
    '</div></form>'
  );
  loadTaskEditList(id);
}
// 刷新编辑弹窗内的子任务列表（含空态）
function loadTaskEditList(taskId) {
  var t = DB.data.workbench.tasks.find(function (x) { return x.id === taskId; });
  var box = document.getElementById("ts-list");
  if (!t || !box) return;
  var subs = taskSubs(t);
  if (!subs.length) { box.innerHTML = '<div class="ts-empty">还没有小点，输入后按回车添加</div>'; return; }
  box.innerHTML = subs.map(function (s) {
    var allDone = taskAllDone(s);
    return '<div class="ts-row">' +
      '<div class="task-checkbox small' + (allDone ? " done" : "") + '" onclick="event.stopPropagation();toggleSub(\'' + taskId + '\',\'' + s.id + '\')"></div>' +
      '<div class="ts-text' + (allDone ? " done" : "") + '">' + escapeHtml(s.text) + '</div>' +
      '<div class="ts-ops"><span class="to-btn" onclick="editSubInline(\'' + taskId + '\',\'' + s.id + '\')">✏️</span><span class="to-btn" onclick="delSub(\'' + taskId + '\',\'' + s.id + '\')">🗑</span></div>' +
      '</div>';
  }).join("");
}
function saveTaskEdit(event, id) {
  event.preventDefault();
  var t = DB.data.workbench.tasks.find(function (x) { return x.id === id; });
  if (!t) return;
  var fd = new FormData(event.target);
  var data = Object.fromEntries(fd);
  if (!data.text || !data.text.trim()) { showToast("任务内容不能为空", "warning"); return; }
  t.text = data.text.trim();
  t.priority = data.priority;
  t.due = data.due || "";
  if (data.date) t.date = data.date;
  DB.save(); closeModal(); render();
  showToast("已保存", "success");
}
function taskDel(id) {
  if (!confirm("确认删除这个任务（含全部子任务）？")) return;
  var idx = DB.data.workbench.tasks.findIndex(function (x) { return x.id === id; });
  if (idx >= 0) DB.data.workbench.tasks.splice(idx, 1);
  DB.save(); closeModal(); render();
  showToast("已删除", "success");
}
function addSubQuick(taskId) {
  var t = DB.data.workbench.tasks.find(function (x) { return x.id === taskId; });
  if (!t) return;
  var v = prompt("子任务内容：", "");
  if (v === null) return;
  if (!v.trim()) return;
  t.subs = taskSubs(t);
  t.subs.push({ id: uid(), text: v.trim(), done: false });
  _taskExpanded[taskId] = true;
  DB.save(); render();
}
function addSubFromEdit(taskId) {
  var t = DB.data.workbench.tasks.find(function (x) { return x.id === taskId; });
  if (!t) return;
  var inp = document.getElementById("ts-new");
  var v = inp ? inp.value : "";
  if (!v.trim()) return;
  t.subs = taskSubs(t);
  t.subs.push({ id: uid(), text: v.trim(), done: false });
  DB.save();
  if (inp) inp.value = "";
  loadTaskEditList(taskId);
}
function editSubInline(taskId, subId) {
  var t = DB.data.workbench.tasks.find(function (x) { return x.id === taskId; });
  if (!t) return;
  var s = taskFindSub(t, subId);
  if (!s) return;
  var v = prompt("修改子任务：", s.text);
  if (v === null) return;
  if (!v.trim()) { showToast("内容不能为空", "warning"); return; }
  s.text = v.trim();
  DB.save();
  if (document.getElementById("ts-list")) loadTaskEditList(taskId); else render();
}
function delSub(taskId, subId) {
  if (!confirm("确认删除这个子任务？")) return;
  var t = DB.data.workbench.tasks.find(function (x) { return x.id === taskId; });
  if (!t) return;
  function remove(list) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === subId) { list.splice(i, 1); return true; }
      if (list[i].subs && list[i].subs.length && remove(list[i].subs)) return true;
    }
    return false;
  }
  if (remove(taskSubs(t))) {
    syncTaskChain([t]);
    DB.save();
    if (document.getElementById("ts-list")) loadTaskEditList(taskId); else render();
    showToast("已删除", "success");
  }
}

function isTaskOverdue(t) {
  if (!t || !t.due || taskAllDone(t)) return false;
  try {
    var due = new Date(today() + "T" + t.due);
    return new Date() > due;
  } catch (e) { return false; }
}

function showOverdueModal(list) {
  showModal(
    '<div class="modal-title" style="color:var(--accent-red)">⚠️ 任务超时提醒</div>' +
    '<div class="overdue-modal-text">以下 ' + list.length + ' 项任务已超过截止时间仍未完成：</div>' +
    list.map(function(t) { return '<div class="overdue-modal-item">🔴 ' + escapeHtml(t.text) + ' <span style="color:var(--text-secondary);font-weight:400">（截止 ' + (t.due || "") + '）</span></div>'; }).join("") +
    '<div class="btn-row"><button class="btn btn-primary" onclick="closeModal()">我知道了</button></div>'
  );
}

function cycleIdeaStatus(id, status) {
  var idea = DB.data.ideas.find(function(i) { return i.id === id; });
  if (idea) { idea.status = status; DB.save(); render(); }
}

function setIdeaStatusFilter(st) {
  window.__ideaStatusFilter = st;
  renderIdeas();
}

function deleteItemGeneric(type, id) {
  var typeLabel = { ideas: "想法", insights: "洞察", competitors: "竞品", products: "产品" }[type] || "条目";
  showConfirmDialog("🗑", "删除" + typeLabel, "确定删除这条" + typeLabel + "？删除后不可恢复。", [
    { text: "取消", cls: "btn-secondary", action: function () { closeModal(); } },
    { text: "删除", cls: "btn-primary", style: "color:#fff;background:var(--accent-red)", action: function () { doDeleteItemGeneric(type, id); } }
  ]);
}
function doDeleteItemGeneric(type, id) {
  if (!DB.data[type]) return;
  var item = DB.data[type].find(function (x) { return x.id === id; });
  // cleanup images if any
  if (item && item.images && item.images.length) {
    try { if (typeof ImageDB !== "undefined" && ImageDB.removeMany) ImageDB.removeMany(item.images); }
    catch (e) { console.warn("[deleteItemGeneric] ImageDB cleanup failed", e); }
  }
  DB.data[type] = DB.data[type].filter(function (x) { return x.id !== id; });
  DB.save();
  render();
  if (typeof showToast === "function") showToast("已删除", "success");
}

function deleteItem(id) {
  deleteItemGeneric("insights", id);
}

function toggleTheme() {
  var current = document.documentElement.getAttribute("data-theme");
  var next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("hw_pm_theme", next);
  render();
}

async function exportData() {
  showToast("正在打包备份文件（含图片）…", "info");
  var ok = await CloudBackup.runManualDownload();
  if (ok) {
    showToast("完整备份已下载！含数据+图片", "success");
  } else {
    showToast("备份失败，请重试", "warning");
  }
}

async function importData(event) {
  var file = event.target.files[0];
  if (!file) return;
  showToast("正在恢复数据…", "info");
  try {
    var result = await CloudBackup.restoreFromFile(file);
    var msg = "数据已恢复";
    if (result.stats) {
      msg += "（产品" + result.stats.products + "个，竞品" + result.stats.competitors + "个，图片" + result.imagesRestored + "张）";
    }
    showToast(msg, "success");
    render();
  } catch (err) {
    showToast("导入失败，请检查文件格式", "warning");
  }
  event.target.value = "";
}

function confirmReset() {
  showConfirmDialog(
    "⚠️",
    "确认重置所有数据？",
    "此操作将清除所有工作区和成长区数据，恢复为初始示例状态。建议先导出备份。",
    [
      { text: "取消", cls: "btn-secondary", action: function() { closeModal(); } },
      { text: "先导出备份", cls: "btn-secondary", action: function() { closeModal(); exportData(); } },
      { text: "确认重置", cls: "btn-primary", style: "background:var(--accent-red);color:white", action: function() { closeModal(); executeReset(); } }
    ]
  );
}

async function executeReset() {
  // backup before reset
  try {
    await BackupDB.save("重置前备份", DB.data);
  } catch (e) { /* silent */ }
  preResetData = JSON.parse(JSON.stringify(DB.data));

  DB.data = JSON.parse(JSON.stringify(SEED_DATA));
  DB.save();
  render();
  showUndoBar();
  showToast("数据已重置", "warning");
}

function showUndoBar() {
  var bar = document.getElementById("undo-bar");
  bar.classList.remove("hidden");
  if (undoResetTimer) clearTimeout(undoResetTimer);
  undoResetTimer = setTimeout(function() {
    dismissUndo();
  }, 30000); // 30秒后悔时间
}

function undoReset() {
  if (!preResetData) return;
  DB.data = preResetData;
  DB.save();
  preResetData = null;
  document.getElementById("undo-bar").classList.add("hidden");
  if (undoResetTimer) clearTimeout(undoResetTimer);
  render();
  showToast("已撤销重置", "success");
}

function dismissUndo() {
  preResetData = null;
  document.getElementById("undo-bar").classList.add("hidden");
  if (undoResetTimer) clearTimeout(undoResetTimer);
}

// ===== Confirm Dialog (reusable) =====
function showConfirmDialog(icon, title, body, buttons) {
  var overlay = document.getElementById("modal-overlay");
  var sheet = document.getElementById("modal-sheet");
  sheet.innerHTML =
    '<div class="confirm-dialog">' +
    '<div class="confirm-icon">' + icon + '</div>' +
    '<div class="confirm-title">' + title + '</div>' +
    '<div class="confirm-body">' + body + '</div>' +
    '<div class="confirm-actions">' +
      buttons.map(function(b, i) {
        return '<button class="btn ' + b.cls + '" data-confirm="' + i + '"' + (b.style ? ' style="' + b.style + '"' : '') + '>' + b.text + '</button>';
      }).join("") +
    '</div></div>';
  // 用事件监听绑定（避免内联函数字符串在极端情况下失效导致点击无反应）
  buttons.forEach(function(b, i) {
    var btn = sheet.querySelector('[data-confirm="' + i + '"]');
    if (btn) btn.addEventListener("click", function() { try { b.action(); } catch (e) { console.error("[confirm]", e); } });
  });
  overlay.classList.add("active");
  sheet.classList.add("active");
}

// ===== Modal =====
function showModal(html) {
  document.getElementById("modal-overlay").classList.add("active");
  document.getElementById("modal-sheet").innerHTML = '<div class="modal-handle"></div>' + html;
  document.getElementById("modal-sheet").classList.add("active");
}

function closeModal() {
  document.getElementById("modal-overlay").classList.remove("active");
  document.getElementById("modal-sheet").classList.remove("active");
  clearPendingImages();
}

// ===== Bottom Nav =====
// ===== 收盘复盘提醒（提醒我关注） =====
function reviewSeenKey() {
  return "hw_pm_review_seen_" + (LiveData.reviewDate() || today());
}

function markReviewSeen() {
  try {
    if (LiveData.isReviewFresh()) localStorage.setItem(reviewSeenKey(), "1");
  } catch (e) {}
  var bar = document.getElementById("review-reminder-bar");
  if (bar) bar.classList.add("hidden");
  if (typeof renderNav === "function") renderNav();
}

function notifyReviewIfFresh() {
  if (!LiveData.isReviewFresh()) return;
  try {
    if (localStorage.getItem(reviewSeenKey()) === "1") return;
  } catch (e) { return; }

  // 顶部提醒横幅
  var bar = document.getElementById("review-reminder-bar");
  if (bar) bar.classList.remove("hidden");

  // 底部导航红点
  if (typeof renderNav === "function") renderNav();

  // 浏览器系统通知（若已授权）
  try {
    if ("Notification" in window) {
      var fire = function() {
        try {
          var n = new Notification("📊 今日收盘复盘已生成", {
            body: "点击查看重点关注板块与持仓建议",
            tag: "pm-review-" + today(),
            requireInteraction: false
          });
          n.onclick = function() { window.focus(); markReviewSeen(); navigate("reviews"); n.close(); };
        } catch (e) {}
      };
      if (Notification.permission === "granted") {
        fire();
      } else if (Notification.permission !== "denied") {
        Notification.requestPermission().then(function(p) { if (p === "granted") fire(); }).catch(function(){});
      }
    }
  } catch (e) {}
}

function renderNav() {
  var nav = document.getElementById("app-nav");
  var items = [
    { id: "home", emoji: "🏠", text: "首页" },
    { id: "fab", emoji: "+", text: "" },
    { id: "settings", emoji: "⚙️", text: "设置" },
  ];
  nav.innerHTML = items.map(function(item) {
    if (item.id === "fab") return '<div class="nav-item fab" onclick="openQuickAdd()"><div class="fab-btn">+</div></div>';
    return '<div class="nav-item' + (currentRoute === item.id ? " active" : "") + '" onclick="navigate(\'' + item.id + '\')"><div class="nav-emoji">' + item.emoji + '</div><div class="nav-text">' + item.text + '</div></div>';
  }).join("");
}


// ==============================
// 🔥 爆款视频拆解 v3 — 互动数据 + 搜索筛选 + 趋势分析 + 脚本创作
// ==============================

// --- 视频模块状态 ---
if (!window.__videosCategoryFilter) window.__videosCategoryFilter = "all";
if (!window.__videosSessionFilter) window.__videosSessionFilter = "all";
if (!window.__videosTagSummary) window.__videosTagSummary = false;
if (!window.__videosSummaryTag) window.__videosSummaryTag = null;
if (!window.__videosSearchQuery) window.__videosSearchQuery = "";
if (!window.__videosAnalyticsView) window.__videosAnalyticsView = null;
if (!window.__videosView) window.__videosView = "list"; // "list"(我的拆解) | "xhs"(小红书爆款笔记)

var VIDEO_CATEGORIES = [
  { key: "all", label: "全部" },
  { key: "跨境产品", label: "🌏 跨境产品" },
  { key: "美妆", label: "💄 美妆" },
  { key: "生活", label: "🏠 生活" },
  { key: "乡村", label: "🌾 乡村" }
];

function renderVideos() {
  var c = document.getElementById("app-content");
  var vd = DB.data.growth.videos;
  var items = (vd && vd.items) ? vd.items : [];

  // Auto-import live video data if fresh and not yet imported today
  if (LiveData.isVideosFresh() && LiveData.videos && LiveData.videos.items) {
    var liveDate = LiveData.videos.generatedAt ? LiveData.videos.generatedAt.slice(0, 10) : "";
    var alreadyImported = items.some(function(v) {
      return v.date === liveDate && v.session === LiveData.videos.session;
    });
    if (!alreadyImported) {
      var newItems = LiveData.videos.items.map(function(item) {
        return {
          id: item.id || ("live_" + uid()),
          title: item.title,
          description: item.description || "",
          hashtags: item.hashtags || [],
          platform: item.platform || "",
          category: item.category || "",
          url: item.url || "",
          image: item.image || "",
          customTags: [],
          likes: item.likes || 0,
          comments: item.comments || 0,
          saves: item.saves || 0,
          date: liveDate || today(),
          session: LiveData.videos.session || "morning"
        };
      });
      items = newItems.concat(items);
      if (!vd.items) vd.items = [];
      var existingIds = {};
      vd.items.forEach(function(v) { existingIds[v.id] = true; });
      newItems.forEach(function(v) {
        if (!existingIds[v.id]) vd.items.unshift(v);
      });
      DB.save();
      items = vd.items;
    }
  }
  // 子视图切换：我的拆解 / 小红书爆款笔记
  var subtabs =
    '<div class="vv-subtabs">' +
    '<span class="vv-subtab' + (window.__videosView !== "xhs" ? " active" : "") + '" onclick="setSubView(\'videos\',\'list\')">📂 我的拆解</span>' +
    '<span class="vv-subtab' + (window.__videosView === "xhs" ? " active" : "") + '" onclick="setSubView(\'videos\',\'xhs\')">🔍 小红书爆款笔记</span>' +
    '</div>';
  if (window.__videosView === "xhs") { renderXhsQuery(c); return; }

  var catFilter = window.__videosCategoryFilter;
  var sessFilter = window.__videosSessionFilter;
  var tagSummaryMode = window.__videosTagSummary;
  var analyticsView = window.__videosAnalyticsView;

  // --- Tag Summary Mode ---
  if (tagSummaryMode) {
    renderVideosTagSummary(c, items);
    return;
  }

  // --- Analytics View ---
  if (analyticsView) {
    renderVideoAnalytics(c, items);
    return;
  }

  // --- Filter by category ---
  var filtered = items;
  if (catFilter !== "all") {
    filtered = filtered.filter(function(v) { return v.category === catFilter; });
  }

  // --- Filter by session ---
  if (sessFilter !== "all") {
    var targetDate = today();
    filtered = filtered.filter(function(v) { return v.date === targetDate && v.session === sessFilter; });
  }

  // --- Search filter ---
  var searchQuery = window.__videosSearchQuery || "";
  if (searchQuery) {
    var q = searchQuery.toLowerCase();
    filtered = filtered.filter(function(v) {
      return (v.title && v.title.toLowerCase().indexOf(q) !== -1) ||
             (v.description && v.description.toLowerCase().indexOf(q) !== -1) ||
             (v.hashtags && v.hashtags.some(function(h) { return h.toLowerCase().indexOf(q) !== -1; })) ||
             (v.customTags && v.customTags.some(function(t) { return t.toLowerCase().indexOf(q) !== -1; }));
    });
  }

  // --- Count today's sessions for badge ---
  var todayItems = items.filter(function(v) { return v.date === today(); });
  var morningCount = todayItems.filter(function(v) { return v.session === "morning"; }).length;
  var eveningCount = todayItems.filter(function(v) { return v.session === "evening"; }).length;

  // --- Category Tabs ---
  c.innerHTML =
    subtabs +
    '<div class="filter-bar" style="flex-wrap:wrap">' +
      VIDEO_CATEGORIES.map(function(cat) {
        return '<div class="chip' + (catFilter === cat.key ? ' active' : '') + '" onclick="window.__videosCategoryFilter=\'' + cat.key + '\';window.__videosSearchQuery=\'\';render();">' + cat.label + '</div>';
      }).join("") +
    '</div>';

  // --- Search Bar ---
  c.innerHTML +=
    '<div class="vv-search-bar">' +
      '<input class="vv-search-input" id="vv-search-input" type="text" placeholder="🔍 搜索标题、文案、话题、标签..." value="' + escapeHtml(searchQuery) + '" oninput="window.__videosSearchQuery=this.value;render();">' +
      (searchQuery ? '<button class="btn btn-secondary" style="padding:6px 12px;font-size:12px;white-space:nowrap" onclick="window.__videosSearchQuery=\'\';render();">✕ 清除</button>' : '') +
      '<span class="vv-search-count">' + filtered.length + ' 条</span>' +
    '</div>';

  // --- Session Tabs ---
  c.innerHTML +=
    '<div class="vv-session-bar">' +
      '<span class="vv-session-tab' + (sessFilter === "all" ? ' active' : '') + '" onclick="window.__videosSessionFilter=\'all\';render();">📋 全部</span>' +
      '<span class="vv-session-tab' + (sessFilter === "morning" ? ' active' : '') + '" onclick="window.__videosSessionFilter=\'morning\';render();">🌅 上午 (' + morningCount + ')</span>' +
      '<span class="vv-session-tab' + (sessFilter === "evening" ? ' active' : '') + '" onclick="window.__videosSessionFilter=\'evening\';render();">🌇 下午 (' + eveningCount + ')</span>' +
    '</div>';

  if (filtered.length === 0) {
    c.innerHTML += '<div class="empty-state"><div class="empty-icon">🔥</div><div class="empty-text">' + (searchQuery ? '没有匹配的视频' : '该分类下还没有视频') + '</div></div>';
  } else {
    filtered.forEach(function(v) {
      var hashtags = (v.hashtags || []).join(" ");
      var customTags = v.customTags || [];
      var likes = v.likes || 0;
      var comments = v.comments || 0;
      var saves = v.saves || 0;
      c.innerHTML += '<div class="vv-card">' +
        '<div class="vv-thumb">' +
          (v.image ? '<img src="' + v.image + '" alt="" class="vv-thumb-img" onclick="previewVideoImage(this)">' : '<div class="vv-thumb-placeholder">📷</div>') +
          '<span class="vv-platform-badge vv-badge-' + (v.platform === "抖音" ? "douyin" : "xhs") + '">' + escapeHtml(v.platform || "") + '</span>' +
        '</div>' +
        '<div class="vv-body">' +
          '<div class="vv-title">' + escapeHtml(v.title) + '</div>' +
          (v.description ? '<div class="vv-desc">' + escapeHtml(v.description) + '</div>' : '') +
          (hashtags ? '<div class="vv-hashtags">' + escapeHtml(hashtags) + '</div>' : '') +
          '<div class="vv-eng-stats">' +
            (likes > 0 ? '<span class="vv-eng-item">👍 ' + formatCount(likes) + '</span>' : '') +
            (comments > 0 ? '<span class="vv-eng-item">💬 ' + formatCount(comments) + '</span>' : '') +
            (saves > 0 ? '<span class="vv-eng-item">⭐ ' + formatCount(saves) + '</span>' : '') +
          '</div>' +
          '<div class="vv-tags-row">' +
            (customTags.length > 0
              ? customTags.map(function(t) {
                  return '<span class="vv-custom-tag" onclick="event.stopPropagation();filterByTag(\'' + t.replace(/'/g, "\\'") + '\')">' + escapeHtml(t) + '</span>';
                }).join("")
              : '<span class="vv-no-tag">无标签</span>') +
            '<button class="vv-add-tag-btn" onclick="event.stopPropagation();promptAddVideoTag(\'' + v.id + '\')" title="添加标签">+</button>' +
          '</div>' +
          '<div class="vv-actions">' +
            (v.url ? '<a href="' + v.url + '" target="_blank" rel="noopener" class="btn btn-primary" style="flex:1;padding:8px;font-size:12px;text-decoration:none;text-align:center">🔗 查看原视频</a>' : '<button class="btn btn-secondary" style="flex:1;padding:8px;font-size:12px" disabled>暂无链接</button>') +
            '<button class="btn btn-secondary" style="padding:8px 10px;font-size:12px" onclick="event.stopPropagation();showAddVideoForm(\'' + v.id + '\')">✏️</button>' +
            '<button class="btn btn-secondary" style="padding:8px 10px;font-size:12px;color:var(--accent-red)" onclick="event.stopPropagation();deleteGrowthItem(\'growth_videos\',\'' + v.id + '\')">🗑️</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    });
  }

  c.innerHTML +=
    '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="btn btn-primary" onclick="showAddVideoForm()" style="flex:1;min-width:90px">+ 手动添加</button>' +
      '<button class="btn btn-secondary" onclick="window.__videosTagSummary=true;render();" style="flex:1;min-width:90px">🏷️ 标签汇总</button>' +
      '<button class="btn btn-secondary" onclick="window.__videosAnalyticsView=\'overview\';render();" style="flex:1;min-width:90px">📊 趋势分析</button>' +
    '</div>';
}

// ===== Tag Summary — with time-period analysis =====
function renderVideosTagSummary(c, items) {
  var tagMap = {};
  items.forEach(function(v) {
    var tags = v.customTags || [];
    tags.forEach(function(t) {
      if (!tagMap[t]) tagMap[t] = [];
      tagMap[t].push(v);
    });
  });

  var tagNames = Object.keys(tagMap).sort();
  var summaryTag = window.__videosSummaryTag;

  c.innerHTML =
    '<div style="margin-bottom:12px">' +
      '<button class="btn btn-secondary" onclick="window.__videosTagSummary=false;window.__videosSummaryTag=null;render();">⬅ 返回视频列表</button>' +
    '</div>';

  if (summaryTag && tagMap[summaryTag]) {
    var videos = tagMap[summaryTag];
    // --- Platform distribution ---
    var pMap = {};
    videos.forEach(function(v) { pMap[v.platform] = (pMap[v.platform] || 0) + 1; });
    var platformStr = Object.keys(pMap).map(function(p) { return p + '×' + pMap[p]; }).join('、');

    // --- Time-period analysis ---
    var periods = analyzeTagTimePeriods(videos);
    var totalEngagement = videos.reduce(function(acc, v) { return acc + (v.likes||0) + (v.comments||0) + (v.saves||0); }, 0);

    c.innerHTML +=
      '<div class="vv-summary-header">' +
        '<h3 style="margin:0 0 8px 0">🏷️ ' + escapeHtml(summaryTag) + '</h3>' +
        '<div class="vv-tag-stats-grid">' +
          '<div class="vv-tag-stat"><span class="vv-tag-stat-val">' + videos.length + '</span><span class="vv-tag-stat-label">视频数</span></div>' +
          '<div class="vv-tag-stat"><span class="vv-tag-stat-val">' + platformStr + '</span><span class="vv-tag-stat-label">平台分布</span></div>' +
          '<div class="vv-tag-stat"><span class="vv-tag-stat-val">' + formatCount(totalEngagement) + '</span><span class="vv-tag-stat-label">总互动量</span></div>' +
        '</div>' +
      '</div>';

    // --- Time period trend chart ---
    if (periods.monthly.length > 0) {
      c.innerHTML += '<div class="vv-analytics-section">' +
        '<h4 style="margin:0 0 10px 0">📈 月度趋势</h4>' +
        renderTrendChart(periods.monthly, videos.length) +
      '</div>';
    }

    // --- Content direction insight ---
    c.innerHTML +=
      '<div class="vv-insight-box">' +
        '<div class="vv-insight-title">💡 内容方向总结</div>' +
        '<div class="vv-insight-text">' + generateTagInsight(summaryTag, videos, periods) + '</div>' +
        '<button class="btn btn-primary" style="margin-top:10px;width:100%" onclick="showScriptEditor(\'' + summaryTag.replace(/'/g, "\\'") + '\')">✍️ 基于此方向写视频脚本</button>' +
      '</div>';

    // --- Video list ---
    videos.forEach(function(v) {
      c.innerHTML += '<div class="vv-card" style="margin-bottom:8px">' +
        '<div class="vv-thumb" style="width:80px;height:80px;min-width:80px;border-radius:8px;overflow:hidden">' +
          (v.image ? '<img src="' + v.image + '" alt="" style="width:100%;height:100%;object-fit:cover">' : '<div class="vv-thumb-placeholder" style="width:80px;height:80px">📷</div>') +
        '</div>' +
        '<div class="vv-body">' +
          '<div class="vv-title" style="font-size:13px">' + escapeHtml(v.title) + '</div>' +
          '<div class="vv-hashtags" style="font-size:11px">' + escapeHtml((v.hashtags || []).join(" ")) + '</div>' +
          '<div class="vv-eng-stats">' +
            (v.likes ? '<span class="vv-eng-item">👍 ' + formatCount(v.likes) + '</span>' : '') +
            (v.comments ? '<span class="vv-eng-item">💬 ' + formatCount(v.comments) + '</span>' : '') +
            (v.saves ? '<span class="vv-eng-item">⭐ ' + formatCount(v.saves) + '</span>' : '') +
          '</div>' +
        '</div>' +
      '</div>';
    });
  } else {
    // --- Tag list with time periods for each ---
    if (tagNames.length === 0) {
      c.innerHTML += '<div class="empty-state"><div class="empty-icon">🏷️</div><div class="empty-text">还没有添加任何标签</div><p style="color:var(--text-secondary);font-size:13px">在视频卡片上点击 + 按钮添加自定义标签</p></div>';
    } else {
      // Overall trend across all tags
      var allPeriods = analyzeTagTimePeriods(items);

      c.innerHTML += '<div class="vv-summary-header"><h3 style="margin:0 0 10px 0">🏷️ 标签总览（共 ' + tagNames.length + ' 个标签，' + items.length + ' 个视频）</h3></div>';

      if (allPeriods.monthly.length > 0) {
        c.innerHTML += '<div class="vv-analytics-section">' +
          '<h4 style="margin:0 0 10px 0">📈 全网月度热度趋势</h4>' +
          renderTrendChart(allPeriods.monthly, items.length) +
        '</div>';
      }

      c.innerHTML += '<p style="color:var(--text-secondary);font-size:12px;margin:10px 0">点击标签查看详情和内容方向建议</p>';

      tagNames.forEach(function(tag) {
        var count = tagMap[tag].length;
        var platforms = Array.from(new Set(tagMap[tag].map(function(v) { return v.platform; })));
        var totEng = tagMap[tag].reduce(function(acc, v) { return acc + (v.likes||0) + (v.comments||0) + (v.saves||0); }, 0);
        var tagPeriods = analyzeTagTimePeriods(tagMap[tag]);

        c.innerHTML +=
          '<div class="vv-tag-summary-card" onclick="window.__videosSummaryTag=\'' + tag.replace(/'/g, "\\'") + '\';render();">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">' +
              '<span style="font-weight:700;font-size:15px">🏷️ ' + escapeHtml(tag) + '</span>' +
              '<span class="chip" style="font-size:11px">' + count + ' 个视频</span>' +
            '</div>' +
            '<div style="display:flex;gap:12px;margin-top:6px;font-size:11px;color:var(--text-secondary);flex-wrap:wrap">' +
              '<span>平台：' + platforms.join('、') + '</span>' +
              (totEng > 0 ? '<span>互动：' + formatCount(totEng) + '</span>' : '') +
              (tagPeriods.monthly && tagPeriods.monthly.length > 0 ? '<span style="color:var(--accent-green)">活跃 ' + tagPeriods.monthly.length + ' 个月</span>' : '') +
            '</div>' +
            '<div class="vv-mini-trend">' +
              (tagPeriods.monthly ? tagPeriods.monthly.map(function(m) {
                var pct = tagPeriods.maxCount > 0 ? Math.round(m.count / tagPeriods.maxCount * 100) : 10;
                return '<span class="vv-mini-bar" style="height:' + pct + '%" title="' + m.label + ': ' + m.count + '条"></span>';
              }).join("") : '') +
            '</div>' +
            '<div style="color:var(--accent-green);font-size:11px;margin-top:6px">💡 点击查看内容方向分析 → 可写脚本</div>' +
          '</div>';
      });
    }
  }
}

// ===== Analytics Dashboard =====
function renderVideoAnalytics(c, items) {
  var period = window.__videosAnalyticsPeriod || "monthly"; // weekly, monthly, quarterly, yearly

  c.innerHTML =
    '<div style="margin-bottom:12px">' +
      '<button class="btn btn-secondary" onclick="window.__videosAnalyticsView=null;render();">⬅ 返回视频列表</button>' +
    '</div>' +
    '<h3 style="margin:0 0 4px 0">📊 爆款视频趋势分析</h3>' +
    '<p style="color:var(--text-secondary);font-size:12px;margin:0 0 12px 0">共分析 ' + items.length + ' 条视频数据</p>';

  // Period selector
  var periods = ["weekly", "monthly", "quarterly", "yearly"];
  var periodLabels = { weekly: "周", monthly: "月", quarterly: "季", yearly: "年" };
  c.innerHTML += '<div class="vv-period-tabs">';
  periods.forEach(function(p) {
    c.innerHTML += '<span class="chip' + (period === p ? ' active' : '') + '" onclick="window.__videosAnalyticsPeriod=\'' + p + '\';render();">' + periodLabels[p] + '</span>';
  });
  c.innerHTML += '</div>';

  // Aggregate data by period
  var buckets = aggregateByPeriod(items, period);
  if (Object.keys(buckets).length === 0) {
    c.innerHTML += '<div class="empty-state"><div class="empty-icon">📊</div><div class="empty-text">数据量不足，暂无趋势</div></div>';
    return;
  }

  // Category breakdown
  var catBreakdown = {};
  items.forEach(function(v) {
    var cat = v.category || "其他";
    catBreakdown[cat] = (catBreakdown[cat] || 0) + 1;
  });

  // Summary stats
  var totalLikes = items.reduce(function(a, v) { return a + (v.likes||0); }, 0);
  var totalComments = items.reduce(function(a, v) { return a + (v.comments||0); }, 0);
  var totalSaves = items.reduce(function(a, v) { return a + (v.saves||0); }, 0);
  var withEngagement = items.filter(function(v) { return (v.likes||0)+(v.comments||0)+(v.saves||0) > 0; }).length;

  c.innerHTML +=
    '<div class="vv-analytics-cards">' +
      '<div class="vv-analytics-card"><div class="vv-a-val">' + items.length + '</div><div class="vv-a-label">总视频</div></div>' +
      '<div class="vv-analytics-card"><div class="vv-a-val">' + formatCount(totalLikes) + '</div><div class="vv-a-label">总点赞</div></div>' +
      '<div class="vv-analytics-card"><div class="vv-a-val">' + formatCount(totalComments) + '</div><div class="vv-a-label">总评论</div></div>' +
      '<div class="vv-analytics-card"><div class="vv-a-val">' + formatCount(totalSaves) + '</div><div class="vv-a-label">总收藏</div></div>' +
    '</div>';

  // Category distribution chart
  var catKeys = Object.keys(catBreakdown).sort(function(a, b) { return catBreakdown[b] - catBreakdown[a]; });
  var maxCat = Math.max.apply(null, Object.values(catBreakdown));
  c.innerHTML += '<div class="vv-analytics-section"><h4 style="margin:0 0 10px 0">📂 分类分布</h4>';
  catKeys.forEach(function(cat) {
    var pct = Math.round(catBreakdown[cat] / items.length * 100);
    c.innerHTML +=
      '<div class="vv-bar-row">' +
        '<span class="vv-bar-label">' + escapeHtml(cat) + '</span>' +
        '<div class="vv-bar-track"><div class="vv-bar-fill" style="width:' + pct + '%"></div></div>' +
        '<span class="vv-bar-val">' + catBreakdown[cat] + ' (' + pct + '%)</span>' +
      '</div>';
  });
  c.innerHTML += '</div>';

  // Trend over time
  var bucketKeys = Object.keys(buckets).sort();
  var maxCount = 0;
  bucketKeys.forEach(function(k) { if (buckets[k].count > maxCount) maxCount = buckets[k].count; });

  if (bucketKeys.length > 1) {
    c.innerHTML += '<div class="vv-analytics-section"><h4 style="margin:0 0 10px 0">📈 ' + periodLabels[period] + '热度趋势</h4>' +
      '<div class="vv-chart-container">' +
        bucketKeys.map(function(k) {
          var b = buckets[k];
          var h = maxCount > 0 ? Math.round(b.count / maxCount * 100) : 10;
          return '<div class="vv-chart-col">' +
            '<div class="vv-chart-bar" style="height:' + h + '%" title="' + b.label + ': ' + b.count + '条 | 互动' + formatCount(b.engagement) + '">' +
              '<span class="vv-chart-val">' + b.count + '</span>' +
            '</div>' +
            '<div class="vv-chart-label">' + b.label + '</div>' +
          '</div>';
        }).join("") +
      '</div>' +
    '</div>';

    // Engagement trend
    var maxEng = 0;
    bucketKeys.forEach(function(k) { if (buckets[k].engagement > maxEng) maxEng = buckets[k].engagement; });
    if (maxEng > 0) {
      c.innerHTML += '<div class="vv-analytics-section"><h4 style="margin:0 0 10px 0">💥 ' + periodLabels[period] + '互动量趋势</h4>' +
        '<div class="vv-chart-container">' +
          bucketKeys.map(function(k) {
            var b = buckets[k];
            var h = maxEng > 0 ? Math.round(b.engagement / maxEng * 100) : 10;
            return '<div class="vv-chart-col">' +
              '<div class="vv-chart-bar vv-chart-bar-eng" style="height:' + h + '%" title="' + b.label + ': ' + formatCount(b.engagement) + '">' +
                '<span class="vv-chart-val">' + formatCount(b.engagement) + '</span>' +
              '</div>' +
              '<div class="vv-chart-label">' + b.label + '</div>' +
            '</div>';
          }).join("") +
        '</div>' +
      '</div>';
    }
  }

  // Top hashtags
  var hashCount = {};
  items.forEach(function(v) {
    (v.hashtags || []).forEach(function(h) { hashCount[h] = (hashCount[h] || 0) + 1; });
  });
  var topHashes = Object.entries(hashCount).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 10);

  if (topHashes.length > 0) {
    var maxHash = topHashes[0][1];
    c.innerHTML += '<div class="vv-analytics-section"><h4 style="margin:0 0 10px 0">🔥 热门话题</h4>';
    topHashes.forEach(function(e) {
      var pct = Math.round(e[1] / maxHash * 100);
      c.innerHTML +=
        '<div class="vv-bar-row">' +
          '<span class="vv-bar-label" style="font-size:11px">' + escapeHtml(e[0]) + '</span>' +
          '<div class="vv-bar-track"><div class="vv-bar-fill vv-bar-fill-hash" style="width:' + pct + '%"></div></div>' +
          '<span class="vv-bar-val" style="font-size:11px">' + e[1] + '次</span>' +
        '</div>';
    });
    c.innerHTML += '</div>';
  }
}

// ===== Helper: aggregate items by time period =====
function aggregateByPeriod(items, period) {
  var buckets = {};
  items.forEach(function(v) {
    var key;
    var d = new Date(v.date);
    if (isNaN(d.getTime())) return;
    if (period === "weekly") {
      // Get ISO week: Monday = start
      var day = d.getDay() || 7;
      var monday = new Date(d);
      monday.setDate(d.getDate() - day + 1);
      key = monday.toISOString().slice(0, 10);
    } else if (period === "monthly") {
      key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    } else if (period === "quarterly") {
      var q = Math.floor(d.getMonth() / 3) + 1;
      key = d.getFullYear() + " Q" + q;
    } else if (period === "yearly") {
      key = String(d.getFullYear());
    }
    if (!buckets[key]) buckets[key] = { count: 0, engagement: 0, label: key };
    buckets[key].count++;
    buckets[key].engagement += (v.likes||0) + (v.comments||0) + (v.saves||0);
  });
  return buckets;
}

// ===== Helper: analyze tag time periods =====
function analyzeTagTimePeriods(videos) {
  var monthly = {};
  var maxCount = 0;
  videos.forEach(function(v) {
    var d = new Date(v.date);
    if (isNaN(d.getTime())) return;
    var key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    if (!monthly[key]) monthly[key] = { label: key, count: 0, engagement: 0 };
    monthly[key].count++;
    monthly[key].engagement += (v.likes||0) + (v.comments||0) + (v.saves||0);
    if (monthly[key].count > maxCount) maxCount = monthly[key].count;
  });
  var monthsArr = Object.keys(monthly).sort().map(function(k) { return monthly[k]; });
  return { monthly: monthsArr, maxCount: maxCount };
}

// ===== Render trend chart (SVG-like mini bars) =====
function renderTrendChart(monthlyData, total) {
  var maxCount = Math.max.apply(null, monthlyData.map(function(m) { return m.count; }).concat([1]));
  return '<div class="vv-mini-trend vv-mini-trend-lg">' +
    monthlyData.map(function(m) {
      var pct = Math.round(m.count / maxCount * 100);
      return '<div class="vv-mini-col">' +
        '<div class="vv-mini-bar vv-mini-bar-lg" style="height:' + pct + '%" title="' + m.label + ': ' + m.count + '条">' +
          '<span class="vv-mini-val">' + m.count + '</span>' +
        '</div>' +
        '<div class="vv-mini-label">' + m.label + '</div>' +
      '</div>';
    }).join("") +
  '</div>';
}

// ===== Generate tag insight text =====
function generateTagInsight(tagName, videos, periods) {
  var totalEng = videos.reduce(function(a, v) { return a + (v.likes||0) + (v.comments||0) + (v.saves||0); }, 0);
  var catMap = {};
  videos.forEach(function(v) { catMap[v.category] = (catMap[v.category]||0) + 1; });
  var topCat = Object.keys(catMap).sort(function(a,b){return catMap[b]-catMap[a];})[0] || "";

  var avgEng = videos.length > 0 ? Math.round(totalEng / videos.length) : 0;

  var topHashes = {};
  videos.forEach(function(v) {
    (v.hashtags||[]).forEach(function(h) { topHashes[h] = (topHashes[h]||0) + 1; });
  });
  var hashList = Object.entries(topHashes).sort(function(a,b){return b[1]-a[1];}).slice(0,5).map(function(e){return e[0];});

  var insights = [];
  insights.push('「' + tagName + '」主题下共收集 ' + videos.length + ' 个爆款视频');
  if (topCat) insights.push('集中出现在「' + topCat + '」分类中');
  if (avgEng > 0) insights.push('平均每个视频获得 ' + formatCount(avgEng) + ' 次互动');
  if (hashList.length > 0) insights.push('高频话题：' + hashList.join('、'));
  if (periods.monthly.length >= 2) {
    var recent = periods.monthly[periods.monthly.length - 1];
    var prev = periods.monthly[periods.monthly.length - 2];
    if (recent.count > prev.count) {
      insights.push('趋势：近一个月视频量增长 ' + Math.round((recent.count - prev.count) / prev.count * 100) + '%');
    } else if (recent.count < prev.count) {
      insights.push('趋势：近一个月视频量下降 ' + Math.round((prev.count - recent.count) / prev.count * 100) + '%');
    }
  }

  insights.push('建议：围绕' + (hashList.length > 0 ? hashList.slice(0,3).join('、') : tagName) + '做系列内容，结合产品经理视角做深度拆解');
  return insights.join('；');
}

// ===== Script Editor =====
var __videosScripts = {};

function showScriptEditor(tagName) {
  var vd = DB.data.growth.videos;
  if (!vd.scripts) vd.scripts = {};
  var existing = vd.scripts[tagName] || "";
  var tagData = getTagAnalysisData(tagName);

  var html = '<div class="modal-title">✍️ 视频脚本创作</div>' +
    '<div style="font-size:13px;color:var(--text-secondary);margin-bottom:12px">基于「' + escapeHtml(tagName) + '」标签的趋势分析编写脚本</div>';

  if (tagData) {
    html +=
      '<div class="vv-insight-box" style="margin-bottom:12px">' +
        '<div class="vv-insight-title">📊 参考数据</div>' +
        '<div class="vv-insight-text" style="font-size:11px">' +
          tagData + '</div>' +
      '</div>';
  }

  html +=
    '<div class="form-group"><div class="form-label">脚本标题</div><input class="form-input" id="vv-script-title" placeholder="给脚本起个名字"></div>' +
    '<div class="form-group"><div class="form-label">脚本内容</div>' +
      '<textarea class="form-textarea" id="vv-script-body" rows="12" placeholder="开始写你的视频脚本...\n\n格式参考：\n【开头钩子】3秒吸引注意\n【正文】核心内容拆解\n【结尾】引导互动/关注\n【BGM建议】配合画面节奏的配乐">' + escapeHtml(existing) + '</textarea>' +
    '</div>' +
    '<div class="form-group"><div class="form-label">拍摄要点 / 备注</div>' +
      '<textarea class="form-textarea" id="vv-script-notes" rows="3" placeholder="运镜建议、道具列表、出镜注意事项..."></textarea>' +
    '</div>' +
    '<div class="btn-row">' +
      '<button type="button" class="btn btn-secondary" onclick="closeModal()">取消</button>' +
      '<button type="button" class="btn btn-primary" onclick="saveVideoScript(\'' + tagName.replace(/'/g, "\\'") + '\')">💾 保存脚本</button>' +
    '</div>';

  showModal(html);
}

function getTagAnalysisData(tagName) {
  var vd = DB.data.growth.videos;
  var items = (vd && vd.items) ? vd.items : [];
  var tagged = items.filter(function(v) { return (v.customTags||[]).indexOf(tagName) !== -1; });
  if (tagged.length === 0) return null;

  var totalEng = tagged.reduce(function(a, v) { return a + (v.likes||0)+(v.comments||0)+(v.saves||0); }, 0);
  var topPlatform = "";
  var pMap = {};
  tagged.forEach(function(v) { pMap[v.platform] = (pMap[v.platform]||0)+1; });
  var platforms = Object.entries(pMap).sort(function(a,b){return b[1]-a[1];});

  var lines = [];
  lines.push('共 ' + tagged.length + ' 个视频');
  lines.push('总互动量：' + formatCount(totalEng));
  if (platforms.length > 0) lines.push('主要平台：' + platforms.map(function(p){return p[0]+'×'+p[1];}).join('、'));
  return lines.join(' | ');
}

function saveVideoScript(tagName) {
  var title = document.getElementById("vv-script-title").value.trim();
  var body = document.getElementById("vv-script-body").value.trim();
  var notes = document.getElementById("vv-script-notes").value.trim();

  if (!body) { showToast("请填写脚本内容", "error"); return; }

  var vd = DB.data.growth.videos;
  if (!vd.scripts) vd.scripts = {};
  vd.scripts[tagName] = body;
  if (title) {
    if (!vd.savedScripts) vd.savedScripts = [];
    vd.savedScripts.unshift({
      id: uid(),
      tag: tagName,
      title: title,
      content: body,
      notes: notes,
      date: today()
    });
  }
  DB.save();
  closeModal();
  showToast("脚本已保存", "success");
  window.__videosTagSummary = true;
  window.__videosSummaryTag = tagName;
  render();
}

// ===== Script list view =====
function renderVideoScripts() {
  var vd = DB.data.growth.videos;
  var scripts = (vd && vd.savedScripts) ? vd.savedScripts : [];
  var c = document.getElementById("app-content");

  c.innerHTML =
    '<div style="margin-bottom:12px">' +
      '<button class="btn btn-secondary" onclick="window.__videosTagSummary=true;window.__videosSummaryTag=null;render();">⬅ 返回标签汇总</button>' +
    '</div>' +
    '<h3 style="margin:0 0 12px 0">✍️ 已保存的脚本（共 ' + scripts.length + ' 篇）</h3>';

  if (scripts.length === 0) {
    c.innerHTML += '<div class="empty-state"><div class="empty-icon">✍️</div><div class="empty-text">还没有保存脚本<br>在标签汇总中点击「基于此方向写视频脚本」开始创作</div></div>';
  } else {
    scripts.forEach(function(s) {
      c.innerHTML +=
        '<div class="vv-script-card">' +
          '<div style="display:flex;justify-content:space-between;align-items:flex-start">' +
            '<div>' +
              '<div style="font-weight:700;font-size:14px">' + escapeHtml(s.title || "未命名脚本") + '</div>' +
              '<div style="font-size:11px;color:var(--text-secondary);margin-top:2px">🏷️ ' + escapeHtml(s.tag) + ' · ' + s.date + '</div>' +
            '</div>' +
            '<div style="display:flex;gap:4px">' +
              '<button class="btn btn-secondary" style="padding:4px 8px;font-size:11px" onclick="showScriptEditor(\'' + s.tag.replace(/'/g, "\\'") + '\');closeModal();">✏️ 编辑</button>' +
              '<button class="btn btn-secondary" style="padding:4px 8px;font-size:11px;color:var(--accent-red)" onclick="deleteVideoScript(\'' + s.id + '\')">🗑️</button>' +
            '</div>' +
          '</div>' +
          '<div style="font-size:12px;color:var(--text-secondary);margin-top:8px;white-space:pre-wrap;max-height:80px;overflow:hidden">' + escapeHtml(s.content.slice(0, 200)) + (s.content.length > 200 ? '...' : '') + '</div>' +
        '</div>';
    });
  }
}

function deleteVideoScript(scriptId) {
  if (!confirm("确定删除这个脚本吗？")) return;
  var vd = DB.data.growth.videos;
  if (vd.savedScripts) {
    vd.savedScripts = vd.savedScripts.filter(function(s) { return s.id !== scriptId; });
  }
  DB.save();
  renderVideoScripts();
}

// ===== Filter by Tag =====
function filterByTag(tag) {
  window.__videosTagSummary = true;
  window.__videosSummaryTag = tag;
  render();
}

// ===== Tag Management =====
function promptAddVideoTag(videoId) {
  var vd = DB.data.growth.videos;
  var items = (vd && vd.items) ? vd.items : [];
  var v = items.find(function(x) { return x.id === videoId; });
  if (!v) return;

  var existingTags = (v.customTags || []).join("、");
  var allTags = vd.customTagBank ? Object.keys(vd.customTagBank).sort() : [];

  var html = '<div class="modal-title">🏷️ 管理标签</div>' +
    '<div style="margin-bottom:8px;font-size:14px;font-weight:600">' + escapeHtml(v.title) + '</div>' +
    '<div class="form-group"><div class="form-label">已有标签</div><div style="font-size:13px;color:var(--text-secondary)">' + (existingTags || '暂无') + '</div></div>' +
    '<div class="form-group"><div class="form-label">添加新标签（用逗号分隔多个）</div><input class="form-input" id="vv-new-tag-input" placeholder="如：爆款模式、情绪营销"></div>' +
    '<div class="form-group"><div class="form-label">从已有标签库选择</div>' +
      '<div class="vv-existing-tags" style="display:flex;flex-wrap:wrap;gap:4px;max-height:120px;overflow-y:auto">' +
        (allTags.length > 0
          ? allTags.map(function(t) {
              var escapedTag = t.replace(/'/g, "\\'");
              return '<span class="vv-tag-chip" onclick="event.stopPropagation();var el=document.getElementById(\'vv-new-tag-input\');el.value=(el.value||\'\')+(el.value?\',\':\'\')+\'' + escapedTag + '\'" style="cursor:pointer;font-size:12px;padding:4px 8px;border-radius:12px;background:var(--bg-tertiary);border:1px solid var(--border-color)">' + escapeHtml(t) + '</span>';
            }).join("")
          : '<span style="font-size:12px;color:var(--text-muted)">暂无标签库</span>') +
      '</div>' +
    '</div>' +
    '<div class="btn-row">' +
      '<button type="button" class="btn btn-secondary" onclick="closeModal()">取消</button>' +
      (existingTags ? '<button type="button" class="btn btn-secondary" style="color:var(--accent-red)" onclick="clearVideoTags(\'' + videoId + '\')">清空标签</button>' : '') +
      '<button type="button" class="btn btn-primary" onclick="saveVideoTags(\'' + videoId + '\')">保存</button>' +
    '</div>';

  showModal(html);
}

function saveVideoTags(videoId) {
  var input = document.getElementById("vv-new-tag-input");
  if (!input) return;
  var raw = input.value.trim();
  var newTags = raw ? raw.split(/[,，、]+/).map(function(s) { return s.trim(); }).filter(Boolean) : [];
  var uniqueTags = Array.from(new Set(newTags));

  var vd = DB.data.growth.videos;
  var items = (vd && vd.items) ? vd.items : [];
  var v = items.find(function(x) { return x.id === videoId; });
  if (!v) { closeModal(); return; }

  v.customTags = uniqueTags;

  if (!vd.customTagBank) vd.customTagBank = {};
  uniqueTags.forEach(function(t) { vd.customTagBank[t] = true; });

  DB.save();
  closeModal();
  render();
}

function clearVideoTags(videoId) {
  var vd = DB.data.growth.videos;
  var items = (vd && vd.items) ? vd.items : [];
  var v = items.find(function(x) { return x.id === videoId; });
  if (!v) { closeModal(); return; }
  v.customTags = [];
  DB.save();
  closeModal();
  render();
}

// ===== Add/Edit Video Form (v3 — with engagement stats) =====
function showAddVideoForm(editId) {
  var vd = DB.data.growth.videos;
  var items = (vd && vd.items) ? vd.items : [];
  var v = editId ? items.find(function(x) { return x.id === editId; }) : null;

  var html = '<div class="modal-title">🔥 ' + (v ? '编辑' : '添加') + '爆款视频</div>' +
    '<form onsubmit="' + (v ? 'submitEditVideoV2(event,\'' + editId + '\')' : 'submitNewVideoV2(event)') + '">' +
    '<div class="form-group" style="text-align:center">' +
      '<div class="vv-upload-zone" onclick="triggerVideoImageUpload()" id="vv-upload-preview">' +
        (v && v.image
          ? '<img src="' + v.image + '" style="max-width:100%;max-height:160px;border-radius:8px">' +
            '<div style="font-size:11px;color:var(--text-secondary);margin-top:4px">点击更换图片</div>'
          : '<div style="font-size:36px">📷</div><div style="font-size:12px;color:var(--text-secondary);margin-top:4px">点击上传封面图</div>') +
      '</div>' +
      '<input type="file" accept="image/*" id="vv-file-input" style="display:none" onchange="handleVideoImageUpload(this)">' +
      '<input type="hidden" name="image" id="vv-image-data" value="' + escapeHtml(v ? (v.image || "") : "") + '">' +
    '</div>' +
    '<div class="form-group"><div class="form-label">视频标题</div><input class="form-input" name="title" value="' + escapeHtml(v ? v.title : '') + '" placeholder="视频标题..." required></div>' +
    '<div class="form-row">' +
      '<div class="form-group"><div class="form-label">平台</div><select class="form-select" name="platform">' +
        '<option value="小红书"' + (v && v.platform === "小红书" ? " selected" : "") + '>小红书</option>' +
        '<option value="抖音"' + (v && v.platform === "抖音" ? " selected" : "") + '>抖音</option>' +
        '<option value="TikTok"' + (v && v.platform === "TikTok" ? " selected" : "") + '>TikTok</option>' +
      '</select></div>' +
      '<div class="form-group"><div class="form-label">分类</div><select class="form-select" name="category">' +
        '<option value="跨境产品"' + (v && v.category === "跨境产品" ? " selected" : "") + '>跨境产品</option>' +
        '<option value="美妆"' + (v && v.category === "美妆" ? " selected" : "") + '>美妆</option>' +
        '<option value="生活"' + (v && v.category === "生活" ? " selected" : "") + '>生活</option>' +
        '<option value="乡村"' + (v && v.category === "乡村" ? " selected" : "") + '>乡村</option>' +
      '</select></div>' +
    '</div>' +
    '<div class="form-group"><div class="form-label">文案内容</div><textarea class="form-textarea" name="description" rows="3" placeholder="视频文案...">' + escapeHtml(v ? (v.description || "") : "") + '</textarea></div>' +
    '<div class="form-group"><div class="form-label">话题标签（用空格或#分���）</div><input class="form-input" name="hashtagsStr" value="' + escapeHtml(v ? (v.hashtags || []).join(" ") : '') + '" placeholder="#跨境好物 #爆款 #2024"></div>' +
    '<div class="form-row">' +
      '<div class="form-group"><div class="form-label">点赞数</div><input class="form-input" type="number" name="likes" value="' + (v ? (v.likes || 0) : '') + '" placeholder="0"></div>' +
      '<div class="form-group"><div class="form-label">评论数</div><input class="form-input" type="number" name="comments" value="' + (v ? (v.comments || 0) : '') + '" placeholder="0"></div>' +
      '<div class="form-group"><div class="form-label">收藏数</div><input class="form-input" type="number" name="saves" value="' + (v ? (v.saves || 0) : '') + '" placeholder="0"></div>' +
    '</div>' +
    '<div class="form-group"><div class="form-label">视频链接</div><input class="form-input" name="url" value="' + escapeHtml(v ? (v.url || "") : "") + '" placeholder="https://..."></div>' +
    '<div class="form-group"><div class="form-label">更新时段</div><select class="form-select" name="session">' +
      '<option value="morning"' + (v && v.session === "morning" ? " selected" : "") + '>上午 (12:10)</option>' +
      '<option value="evening"' + (v && v.session === "evening" ? " selected" : "") + '>下午 (19:00)</option>' +
    '</select></div>' +
    '<div class="btn-row">' +
      '<button type="button" class="btn btn-secondary" onclick="closeModal()">取消</button>' +
      '<button type="submit" class="btn btn-primary">保存</button>' +
    '</div>' +
    '</form>';

  showModal(html);
}

function triggerVideoImageUpload() {
  document.getElementById("vv-file-input").click();
}

function handleVideoImageUpload(input) {
  var file = input.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    alert("图片不能超过2MB");
    return;
  }
  var reader = new FileReader();
  reader.onload = function(e) {
    document.getElementById("vv-image-data").value = e.target.result;
    var preview = document.getElementById("vv-upload-preview");
    preview.innerHTML = '<img src="' + e.target.result + '" style="max-width:100%;max-height:160px;border-radius:8px"><div style="font-size:11px;color:var(--text-secondary);margin-top:4px">点击更换图片</div>';
  };
  reader.readAsDataURL(file);
}

function submitNewVideoV2(event) {
  event.preventDefault();
  var fd = new FormData(event.target);
  var data = Object.fromEntries(fd);
  var vd = DB.data.growth.videos;
  if (!vd.items) {
    vd.items = [];
    vd.customTagBank = {};
  }

  var hashtags = data.hashtagsStr
    ? data.hashtagsStr.split(/[\\s#]+/).filter(function(s) {
        var t = s.trim();
        return t.length > 0;
      }).map(function(s) { return s.startsWith("#") ? s : "#" + s; })
    : [];

  vd.items.unshift({
    id: uid(),
    title: data.title,
    platform: data.platform,
    category: data.category,
    url: data.url || "",
    description: data.description || "",
    hashtags: hashtags,
    image: data.image || "",
    customTags: [],
    likes: parseInt(data.likes) || 0,
    comments: parseInt(data.comments) || 0,
    saves: parseInt(data.saves) || 0,
    date: today(),
    session: data.session || "morning"
  });
  DB.save();
  closeModal();
  render();
}

function submitEditVideoV2(event, id) {
  event.preventDefault();
  var fd = new FormData(event.target);
  var data = Object.fromEntries(fd);
  var vd = DB.data.growth.videos;
  var items = (vd && vd.items) ? vd.items : [];
  var v = items.find(function(x) { return x.id === id; });
  if (!v) { closeModal(); return; }

  var hashtags = data.hashtagsStr
    ? data.hashtagsStr.split(/[\\s#]+/).filter(function(s) {
        var t = s.trim();
        return t.length > 0;
      }).map(function(s) { return s.startsWith("#") ? s : "#" + s; })
    : [];

  Object.assign(v, {
    title: data.title,
    platform: data.platform,
    category: data.category,
    url: data.url || "",
    description: data.description || "",
    hashtags: hashtags,
    image: data.image || v.image || "",
    likes: parseInt(data.likes) || 0,
    comments: parseInt(data.comments) || 0,
    saves: parseInt(data.saves) || 0,
    session: data.session || v.session || "morning"
  });
  DB.save();
  closeModal();
  render();
}

function previewVideoImage(el) {
  var src = el.src;
  showModal(
    '<div style="text-align:center;padding:0">' +
      '<img src="' + src + '" style="max-width:100%;max-height:70vh;border-radius:8px">' +
      '<div style="margin-top:10px"><button class="btn btn-secondary" onclick="closeModal()">关闭</button></div>' +
    '</div>'
  );
}


// ==============================
// 📈 每日复盘（股市收盘复盘）
// ==============================
function renderReviews() {
  var c = document.getElementById("app-content");
  var reviews = DB.data.growth.reviews || [];
  var reviewDate = growthCurrentTab || today();

  // Try live data for the selected date (from data/review.json)
  // If viewing today and no fresh data, fall back to most recent live data
  var liveReview = LiveData.isReviewForDate(reviewDate) ? LiveData.review : null;
  var isStaleLive = false;
  if (!liveReview && reviewDate === today() && LiveData.hasReviewData()) {
    // Today's data not generated yet (automation runs at 2 PM), show most recent
    liveReview = LiveData.review;
    isStaleLive = true;
  }
  var useLive = !!liveReview;

  // Check if user already saved a manual review for this date
  var todayReview = reviews.find(function(r) { return r.date === reviewDate; });

  // If live data is available AND user hasn't saved their own review, use live data
  var hasReview = !!todayReview;
  var liveBadge = '';
  if (useLive && !hasReview) {
    if (isStaleLive) {
      var rDate = LiveData.reviewDate();
      var label = rDate === today(-1) ? '\u6628\u65e5\u6570\u636e' : rDate;
      liveBadge = ' <span style="font-size:10px;background:var(--text-tertiary);color:#fff;padding:2px 6px;border-radius:10px;vertical-align:middle">' + label + '</span>';
    } else {
      liveBadge = ' <span style="font-size:10px;background:var(--accent-green);color:#fff;padding:2px 6px;border-radius:10px;vertical-align:middle">\u5b9e\u65f6</span>';
    }
  }

  // Date nav
  c.innerHTML =
    '<div class="diet-date-nav">' +
      '<div class="date-arrow" onclick="shiftReviewDate(-1)">◀</div>' +
      '<div class="date-display">' + formatDate(reviewDate) + (reviewDate === today() ? ' <span style="font-size:11px;color:var(--accent-green)">今天</span>' + liveBadge : '') + '</div>' +
      '<div class="date-arrow" onclick="shiftReviewDate(1)">▶</div>' +
    '</div>';

  // ---- RENDER CARD ----
  function rvCard(marketOverview, sectors, holdingsPL, tradeReview, opportunities, risks, showActions, reviewId, indices) {
    var hasCharts = Array.isArray(sectors) && sectors.length > 0;
    var hasIndices = Array.isArray(indices) && indices.length > 0;

    // ---- Index chart section ----
    var indexChartHtml = "";
    if (hasIndices) {
      indexChartHtml = '<div class="rv-section"><div class="rv-label">📊 指数涨跌幅对比</div>' +
        '<canvas id="rv-index-chart" class="rv-chart-canvas"></canvas></div>';
    }

    // ---- Sector section ----
    var sectorHtml = "";
    if (hasCharts) {
      // Sector ranking chart (horizontal bar)
      sectorHtml = '<canvas id="rv-sector-chart" class="rv-chart-canvas" style="margin-bottom:8px"></canvas>' +
        '<canvas id="rv-sector-summary" class="rv-chart-canvas" style="margin-bottom:8px"></canvas>' +
        '<details style="margin-top:4px"><summary style="font-size:11px;color:var(--text-tertiary);cursor:pointer">📋 详细板块数据</summary>' +
        '<div class="rv-sectors-table" style="margin-top:6px">' +
        sectors.map(function(s) {
          var icon = s.trend === "up" ? "📈" : "📉";
          var clr = s.trend === "up" ? "var(--accent-red)" : "var(--accent-green)";
          return '<div class="rv-sector-row"><span>' + icon + ' ' + escapeHtml(s.name) + '</span><span style="color:' + clr + ';font-weight:700">' + (s.trend === "up" ? "+" : "") + s.change + '%</span><span style="font-size:11px;color:var(--text-tertiary);flex:1;text-align:right">' + escapeHtml(s.detail || "") + '</span></div>';
        }).join("") +
        '</div></details>';
    } else {
      sectorHtml = '<div class="rv-text">' + escapeHtml(sectors || "（未记录）") + '</div>';
    }

    c.innerHTML +=
      '<div class="rv-card">' +
        '<div class="rv-section"><div class="rv-label">📊 当日大盘整体波动概况</div><div class="rv-text">' + escapeHtml(marketOverview || "（未记录）") + '</div></div>' +
        indexChartHtml +
        '<div class="rv-section"><div class="rv-label">🏭 重点行业/板块行情记录</div>' + sectorHtml + '</div>' +
        '<div class="rv-section"><div class="rv-label">💰 个人持仓盈亏记录</div><div class="rv-text">' + escapeHtml(holdingsPL || "（未记录）") + '</div></div>' +
        '<div class="rv-section"><div class="rv-label">📝 个人交易操作反思</div><div class="rv-text">' + escapeHtml(tradeReview || "（未记录）") + '</div></div>' +
        '<div class="rv-section"><div class="rv-label">🎯 机会总结</div><div class="rv-text">' + escapeHtml(opportunities || "（未记录）") + '</div></div>' +
        '<div class="rv-section"><div class="rv-label">⚠️ 风险提醒</div><div class="rv-text">' + escapeHtml(risks || "（未记录）") + '</div></div>' +
        (showActions ? '<div class="card-actions" style="display:flex;gap:8px;margin-top:12px">' +
          '<button class="btn btn-secondary" style="flex:1;padding:10px;font-size:13px" onclick="showAddReviewFormNew(\'' + reviewId + '\')">✏️ 编辑</button>' +
          '<button class="btn btn-secondary" style="flex:1;padding:10px;font-size:13px;color:var(--accent-red)" onclick="deleteGrowthItem(\'growth_reviews\',\'' + reviewId + '\')">🗑 删除</button>' +
        '</div>' : '<div class="card-actions" style="display:flex;gap:8px;margin-top:12px"><button class="btn btn-secondary" style="flex:1;padding:10px;font-size:13px" onclick="saveLiveReview()">💾 保存为我的复盘</button></div>') +
      '</div>';

    // Draw charts after DOM update
    if (hasIndices) setTimeout(function() { drawIndexBarChart("rv-index-chart", indices); }, 50);
    if (hasCharts) {
      setTimeout(function() {
        drawSectorChart("rv-sector-chart", sectors);
        drawSectorSummary("rv-sector-summary", sectors);
      }, 50);
    }
  }

  if (hasReview) {
    // User already saved a review
    rvCard(todayReview.marketOverview, todayReview.sectors, todayReview.holdingsPL, todayReview.tradeReview, todayReview.opportunities, todayReview.risks, true, todayReview.id, todayReview.indices);
  } else if (liveReview) {
    // Use auto-generated live data
    rvCard(liveReview.marketOverview || "", liveReview.sectors || [], "（请根据你的实际持仓，补充个人盈亏记录）", "（请记录今日交易操作和反思）", liveReview.opportunities || "", liveReview.risks || "", false, null, liveReview.indices);
  } else {
    c.innerHTML += '<div class="empty-state"><div class="empty-icon">📈</div><div class="empty-text">' + (reviewDate === today() ? "今日复盘模板已就绪，收盘后将自动填充大盘数据" : "该日没有复盘记录") + '</div></div>';
  }

  var btnLabel = hasReview ? "✏️ 编辑今日复盘" : (liveReview ? "✍️ 补充个人持仓与交易复盘" : "+ 写今日复盘");
  c.innerHTML += '<div style="margin-top:12px"><button class="btn btn-primary" onclick="showAddReviewFormNew()" style="width:100%">' + btnLabel + '</button></div>';
}

function shiftReviewDate(offset) {
  growthCurrentTab = growthCurrentTab || today();
  var d = new Date(growthCurrentTab);
  d.setDate(d.getDate() + offset);
  growthCurrentTab = d.toISOString().slice(0, 10);
  render();
}

function showAddReviewFormNew(editId) {
  var reviewDate = growthCurrentTab || today();
  var r = editId ? DB.data.growth.reviews.find(function(x) { return x.id === editId; }) : DB.data.growth.reviews.find(function(x) { return x.date === reviewDate; });

  // Pre-fill with live data if available (even if from yesterday, better than empty)
  var liveReview = (!r && LiveData.hasReviewData()) ? LiveData.review : null;
  var prefill = r || liveReview || {};

  // Format sectors from live data array into readable text
  var sectorsStr = "";
  if (r && r.sectors) {
    sectorsStr = typeof r.sectors === "string" ? r.sectors : (Array.isArray(r.sectors) ? r.sectors.map(function(s) { return s.name + " " + (s.trend === "up" ? "+" : "") + s.change + "% " + (s.detail || ""); }).join("\\n") : "");
  } else if (liveReview && liveReview.sectors && Array.isArray(liveReview.sectors)) {
    sectorsStr = liveReview.sectors.map(function(s) {
      return s.name + " " + (s.trend === "up" ? "+" : "") + s.change + "% " + (s.detail || "");
    }).join("\n");
  }

  var isEditing = !!r;
  var formAction = isEditing ? 'submitEditReviewV2(event,\'' + r.id + '\')' : 'submitReviewV2(event)';
  var titleText = isEditing ? '编辑' : (liveReview ? '补充持仓与交易复盘\n大盘数据已自动填充，只需填持仓和交易部分' : '写');

  showModal(
    '<div class="modal-title">📈 ' + titleText + '</div>' +
    '<form onsubmit="' + formAction + '">' +
    '<input type="hidden" name="date" value="' + reviewDate + '">' +
    '<div class="form-group"><div class="form-label">📊 当日大盘整体波动概况 ' + (liveReview ? '<span style=\\"font-size:10px;color:var(--accent-green)\\">(已自动填充)</span>' : '') + '</div><textarea class="form-textarea" name="marketOverview" placeholder="上证/深成指/创业板涨跌幅..." style="min-height:60px">' + escapeHtml(prefill.marketOverview || "") + '</textarea></div>' +
    '<div class="form-group"><div class="form-label">🏭 重点行业/板块行情记录 ' + (liveReview ? '<span style=\\"font-size:10px;color:var(--accent-green)\\">(已自动填充)</span>' : '') + '</div><textarea class="form-textarea" name="sectors" placeholder="涨幅居前板块、跌幅居前板块..." style="min-height:60px">' + escapeHtml(sectorsStr) + '</textarea></div>' +
    '<div class="form-group"><div class="form-label">💰 个人持仓盈亏记录 <span style=\\"color:var(--accent-orange);font-size:11px\\">⬅ 手动填写</span></div><textarea class="form-textarea" name="holdingsPL" placeholder="个股涨跌、持仓市值变化、当日盈亏..." style="min-height:60px">' + escapeHtml(isEditing ? (prefill.holdingsPL || "") : "") + '</textarea></div>' +
    '<div class="form-group"><div class="form-label">📝 个人交易操作反思 <span style=\\"color:var(--accent-orange);font-size:11px\\">⬅ 手动填写</span></div><textarea class="form-textarea" name="tradeReview" placeholder="买入/卖出操作复盘、执行纪律自查、心态评估..." style="min-height:80px">' + escapeHtml(isEditing ? (prefill.tradeReview || "") : "") + '</textarea></div>' +
    '<div class="form-group"><div class="form-label">🎯 机会总结 ' + (liveReview ? '<span style=\\"font-size:10px;color:var(--accent-green)\\">(已自动填充)</span>' : '') + '</div><textarea class="form-textarea" name="opportunities" placeholder="明天关注方向、潜力标的、操作计划..." style="min-height:60px">' + escapeHtml(prefill.opportunities || "") + '</textarea></div>' +
    '<div class="form-group"><div class="form-label">⚠️ 风险提醒 ' + (liveReview ? '<span style=\\"font-size:10px;color:var(--accent-green)\\">(已自动填充)</span>' : '') + '</div><textarea class="form-textarea" name="risks" placeholder="持仓风险点、市场风险因素..." style="min-height:60px">' + escapeHtml(prefill.risks || "") + '</textarea></div>' +
    '<div class="btn-row"><button type="button" class="btn btn-secondary" onclick="closeModal()">取消</button><button type="submit" class="btn btn-primary">保存复盘</button></div>' +
    '</form>'
  );
}

function submitReviewV2(event) {
  event.preventDefault();
  var fd = new FormData(event.target);
  var data = Object.fromEntries(fd);
  var existing = DB.data.growth.reviews.find(function(r) { return r.date === data.date; });
  // preserve structured indices/sectors from live or existing data
  var liveIndices = LiveData.isReviewFresh() && LiveData.review ? LiveData.review.indices : null;
  var liveSectors = LiveData.isReviewFresh() && LiveData.review ? LiveData.review.sectors : null;
  if (existing) {
    Object.assign(existing, {
      marketOverview: data.marketOverview, sectors: data.sectors, holdingsPL: data.holdingsPL,
      tradeReview: data.tradeReview, opportunities: data.opportunities, risks: data.risks,
      indices: existing.indices || liveIndices || []
    });
  } else {
    DB.data.growth.reviews.unshift({
      id: uid(), date: data.date, marketOverview: data.marketOverview, sectors: data.sectors,
      holdingsPL: data.holdingsPL, tradeReview: data.tradeReview,
      opportunities: data.opportunities, risks: data.risks,
      indices: liveIndices || []
    });
  }
  growthCurrentTab = data.date;
  DB.save();
  closeModal();
  render();
}

function submitEditReviewV2(event, id) {
  event.preventDefault();
  var fd = new FormData(event.target);
  var data = Object.fromEntries(fd);
  var r = DB.data.growth.reviews.find(function(x) { return x.id === id; });
  if (!r) { closeModal(); return; }
  var liveIndices = LiveData.isReviewFresh() && LiveData.review ? LiveData.review.indices : null;
  Object.assign(r, {
    marketOverview: data.marketOverview, sectors: data.sectors, holdingsPL: data.holdingsPL,
    tradeReview: data.tradeReview, opportunities: data.opportunities, risks: data.risks,
    indices: r.indices || liveIndices || []
  });
  DB.save();
  closeModal();
  render();
}

// Save auto-generated live review data as user's own review
function saveLiveReview() {
  markReviewSeen();
  if (!LiveData.hasReviewData()) {
    showToast("\u6682\u65e0\u5b9e\u65f6\u6570\u636e\uff0c\u8bf7\u624b\u52a8\u586b\u5199", "error");
    return;
  }
  var lr = LiveData.review;
  var existing = DB.data.growth.reviews.find(function(r) { return r.date === today(); });
  if (existing) {
    Object.assign(existing, {
      marketOverview: lr.marketOverview || "",
      sectors: lr.sectors || [],
      indices: lr.indices || [],
      opportunities: lr.opportunities || "",
      risks: lr.risks || ""
    });
  } else {
    DB.data.growth.reviews.unshift({
      id: uid(),
      date: today(),
      marketOverview: lr.marketOverview || "",
      sectors: lr.sectors || [],
      indices: lr.indices || [],
      holdingsPL: "（请根据实际持仓补充盈亏记录）",
      tradeReview: "（请记录今日交易操作和反思）",
      opportunities: lr.opportunities || "",
      risks: lr.risks || ""
    });
  }
  DB.save();
  showToast("已保存实时复盘数据，请补充个人持仓和反思", "success");
  render();
}

// ===== 复盘可视化图表 =====

function isDarkTheme() {
  return document.documentElement.getAttribute("data-theme") !== "light";
}

// 指数涨跌幅柱状图
function drawIndexBarChart(canvasId, indices) {
  var canvas = document.getElementById(canvasId);
  if (!canvas || !indices || !indices.length) return;

  var container = canvas.parentElement;
  var w = container.clientWidth - 24 || 320;
  var h = 200;
  var dpr = window.devicePixelRatio || 1;

  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";

  var ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  var dark = isDarkTheme();
  var txtC = dark ? "#8e8e93" : "#666";
  var upC = "#ff453a";
  var downC = "#30d158";
  var pad = { t: 20, r: 12, b: 38, l: 12 };
  var cw = w - pad.l - pad.r;
  var ch = h - pad.t - pad.b;

  var n = indices.length;
  var barW = Math.min(34, (cw / n) * 0.65);
  var gap = cw / n;

  var vals = indices.map(function(d) { return d.change; });
  var maxV = Math.max.apply(null, vals.concat([0]));
  var minV = Math.min.apply(null, vals.concat([0]));
  var absM = Math.max(Math.abs(maxV), Math.abs(minV), 0.5);
  var range = absM * 1.4;

  var zeroY = pad.t + ch;
  if (minV < 0) zeroY = pad.t + ch * (absM + maxV) / (2 * absM);
  if (maxV < 0) zeroY = pad.t;

  // zero line
  ctx.strokeStyle = dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(pad.l, zeroY);
  ctx.lineTo(w - pad.r, zeroY);
  ctx.stroke();
  ctx.setLineDash([]);

  // bars
  indices.forEach(function(d, i) {
    var x = pad.l + gap * i + (gap - barW) / 2;
    var barH = (Math.abs(d.change) / range) * (ch * 0.9);
    var y = d.change >= 0 ? zeroY - barH : zeroY;
    var color = d.change >= 0 ? upC : downC;

    // bar with rounded top
    var r = 4;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y + barH);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.lineTo(x + barW - r, y);
    ctx.quadraticCurveTo(x + barW, y, x + barW, y + r);
    ctx.lineTo(x + barW, y + barH);
    ctx.closePath();
    ctx.fill();

    // value
    ctx.fillStyle = color;
    ctx.font = "bold 11px -apple-system, sans-serif";
    ctx.textAlign = "center";
    var vY = d.change >= 0 ? y - 7 : y + barH + 17;
    ctx.fillText((d.change >= 0 ? "+" : "") + d.change.toFixed(2) + "%", x + barW / 2, vY);

    // label
    ctx.fillStyle = txtC;
    ctx.font = "10px -apple-system, sans-serif";
    var name = d.name.replace("指数", "").replace("指", "");
    ctx.fillText(name, x + barW / 2, h - 8);
  });
}

// 板块涨跌幅排行横向柱状图 (Top 10)
function drawSectorChart(canvasId, sectors) {
  var canvas = document.getElementById(canvasId);
  if (!canvas || !sectors || !sectors.length) return;

  // sort by change desc
  var sorted = sectors.slice().sort(function(a, b) { return b.change - a.change; });
  var top = sorted.slice(0, 10);
  var n = top.length;

  var container = canvas.parentElement;
  var w = container.clientWidth - 24 || 320;
  var rowH = 24;
  var h = n * rowH + 20;
  var dpr = window.devicePixelRatio || 1;

  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";

  var ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  var dark = isDarkTheme();
  var txtC = dark ? "#8e8e93" : "#888";
  var nameC = dark ? "#ccc" : "#333";
  var upC = "#ff453a";
  var downC = "#30d158";
  var bgC = dark ? "#2a2a3e" : "#eee";

  var labelW = 80;
  var valW = 52;
  var barArea = w - labelW - valW - 12;

  var absM = 0;
  top.forEach(function(d) { if (Math.abs(d.change) > absM) absM = Math.abs(d.change); });
  absM = Math.max(absM, 0.5);
  var scale = barArea / absM;

  top.forEach(function(d, i) {
    var y = 8 + i * rowH;
    var color = d.change >= 0 ? upC : downC;
    var barLen = Math.abs(d.change) * scale;

    // name
    ctx.fillStyle = nameC;
    ctx.font = "11px -apple-system, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(d.name.length > 5 ? d.name.slice(0, 5) + ".." : d.name, labelW - 4, y + 16);

    // bg track
    ctx.fillStyle = bgC;
    ctx.fillRect(labelW + 4, y + 4, barArea, 14);

    // bar
    var barX = d.change >= 0 ? labelW + 4 : labelW + 4 + barArea - barLen;
    ctx.fillStyle = color;
    ctx.fillRect(barX, y + 4, barLen, 14);

    // value
    ctx.fillStyle = color;
    ctx.font = "bold 11px -apple-system, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText((d.change >= 0 ? "+" : "") + d.change.toFixed(2) + "%", w - valW, y + 16);
  });
}

// 板块涨跌分布概览
function drawSectorSummary(canvasId, sectors) {
  var canvas = document.getElementById(canvasId);
  if (!canvas || !sectors || !sectors.length) return;

  var upCount = sectors.filter(function(s) { return s.change >= 0; }).length;
  var downCount = sectors.length - upCount;

  var w = 280;
  var h = 80;
  var dpr = window.devicePixelRatio || 1;

  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = "100%";
  canvas.style.maxWidth = w + "px";
  canvas.style.height = h + "px";

  var ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  var dark = isDarkTheme();
  var upC = "#ff453a";
  var downC = "#30d158";
  var txtC = dark ? "#8e8e93" : "#666";

  var barH = 24;
  var barW = w - 40;
  var upW = (upCount / sectors.length) * barW;
  var downW = barW - upW;

  // labels
  ctx.fillStyle = txtC;
  ctx.font = "12px -apple-system, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("涨 " + upCount + " 个板块", 20, 22);

  ctx.textAlign = "right";
  ctx.fillText(downCount + " 个板块 跌", w - 20, 22);

  // bars
  if (upW > 0) {
    ctx.fillStyle = upC;
    ctx.beginPath();
    ctx.moveTo(20, 30);
    ctx.lineTo(20 + upW - 4, 30);
    ctx.quadraticCurveTo(20 + upW, 30, 20 + upW, 34);
    ctx.lineTo(20 + upW, 50);
    ctx.quadraticCurveTo(20 + upW, 54, 20 + upW - 4, 54);
    ctx.lineTo(20, 54);
    ctx.closePath();
    ctx.fill();
  }

  if (downW > 0) {
    ctx.fillStyle = downC;
    ctx.beginPath();
    ctx.moveTo(w - 20, 30);
    ctx.lineTo(w - 20 - downW + 4, 30);
    ctx.quadraticCurveTo(w - 20 - downW, 30, w - 20 - downW, 34);
    ctx.lineTo(w - 20 - downW, 50);
    ctx.quadraticCurveTo(w - 20 - downW, 54, w - 20 - downW + 4, 54);
    ctx.lineTo(w - 20, 54);
    ctx.closePath();
    ctx.fill();
  }

  // percentage
  var upPct = Math.round(upCount / sectors.length * 100);
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.font = "bold 13px -apple-system, sans-serif";
  ctx.textAlign = "center";
  if (upW > 17) ctx.fillText(upPct + "%", 20 + upW / 2, 48);
  if (downW > 17) {
    ctx.textAlign = "center";
    ctx.fillText((100 - upPct) + "%", w - 20 - downW / 2, 48);
  }
}

// 渲染所有复盘图表
function renderReviewCharts(indices, sectors) {
  if (indices && indices.length) drawIndexBarChart("rv-index-chart", indices);
  if (sectors && sectors.length) {
    drawSectorChart("rv-sector-chart", sectors);
    drawSectorSummary("rv-sector-summary", sectors);
  }
}


// ==============================
// 📚 英语学习（雅思+硬件外贸双词库，双Tab模式）

// ==============================
// 🔔 今日总览浮窗
// ==============================
function showDailyOverview() {
  var mealsDone = (typeof dietChecksToday === "function") ? dietChecksToday() : 0;

  var eng = (typeof engGet === "function") ? engGet() : (DB.data.growth.english || {});
  var todayLog = (eng.studyLog || {})[today()] || { duration: 0, completed: false };

  var reviews = DB.data.growth.reviews || [];
  var hasReview = reviews.some(function(r) { return r.date === today(); });

  var inv = DB.data.growth.invest || { assets: [], holdings: [], cash: 0 };
  var invAssetSum = (inv.assets || []).reduce(function(s, a) { return s + (a.amount || 0); }, 0);
  var invHoldSum = (inv.holdings || []).reduce(function(s, h) { return s + (h.shares || 0) * (h.price || 0); }, 0);
  var investSummary = "¥" + ((inv.cash || 0) + invAssetSum + invHoldSum).toLocaleString();

  var acc = DB.data.growth.account;
  var todayExp = acc && acc.expenses ? acc.expenses.filter(function(e) { return e.date === today() && e.type === "out"; }) : [];
  var todayExpTotal = todayExp.reduce(function(s, e) { return s + (e.amount || 0); }, 0);

  var news = (DB.data.growth.news.items || DB.data.growth.news || []).filter(function(n) { return n.date === today(); });

  var html = '<div class="modal-title">📋 今日总览 · ' + formatDate(today()) + '</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +

    // Diet
    '<div class="ov-card" onclick="closeModal();navigate(\'diet\')">' +
      '<div class="ov-icon">🥗</div>' +
      '<div class="ov-title">饮食打卡</div>' +
      '<div class="ov-value" style="color:' + (mealsDone >= 5 ? 'var(--accent-green)' : mealsDone >= 3 ? 'var(--accent-orange)' : 'var(--accent-red)') + '">' + mealsDone + '/5</div>' +
    '</div>' +

    // Study
    '<div class="ov-card" onclick="closeModal();navigate(\'language\')">' +
      '<div class="ov-icon">🌐</div>' +
      '<div class="ov-title">语言学习</div>' +
      '<div class="ov-value" style="color:' + (todayLog.completed ? 'var(--accent-green)' : 'var(--text-secondary)') + '">' + (todayLog.completed ? '✅ 已打卡' : todayLog.duration + '分钟') + '</div>' +
    '</div>' +

    // Review
    '<div class="ov-card" onclick="closeModal();navigate(\'reviews\')">' +
      '<div class="ov-icon">📈</div>' +
      '<div class="ov-title">复盘</div>' +
      '<div class="ov-value" style="color:' + (hasReview ? 'var(--accent-green)' : 'var(--accent-red)') + '">' + (hasReview ? '✅ 已完成' : '❌ 未完成') + '</div>' +
    '</div>' +

    // Invest
    '<div class="ov-card" onclick="closeModal();navigate(\'invest\')">' +
      '<div class="ov-icon">📈</div>' +
      '<div class="ov-title">投资理财</div>' +
      '<div class="ov-value">' + investSummary + '</div>' +
    '</div>' +

    // News
    '<div class="ov-card" onclick="closeModal();navigate(\'news\')">' +
      '<div class="ov-icon">📰</div>' +
      '<div class="ov-title">今日新闻</div>' +
      '<div class="ov-value">' + news.length + '条</div>' +
    '</div>' +

    // Videos
    '<div class="ov-card" onclick="closeModal();navigate(\'videos\')">' +
      '<div class="ov-icon">🔥</div>' +
      '<div class="ov-title">爆款视频</div>' +
      '<div class="ov-value">' + ((DB.data.growth.videos.items || DB.data.growth.videos || []).length) + '条</div>' +
    '</div>' +

    '</div>' +
    '<div style="margin-top:12px"><button class="btn btn-primary" onclick="closeModal()" style="width:100%">关闭</button></div>';

  showModal(html);
}

// ===== Generic delete for growth items =====
function deleteGrowthItem(type, id) {
  showConfirmDialog(
    "🗑️", "确认删除？", "删除后不可恢复。",
    [
      { text: "取消", cls: "btn-secondary", action: function() { closeModal(); } },
      { text: "确认删除", cls: "btn-primary", style: "background:var(--accent-red);color:white", action: function() { closeModal(); doDeleteGrowth(type, id); } }
    ]
  );
}

function doDeleteGrowth(type, id) {
  var map = {
    growth_videos: "videos",
    growth_reviews: "reviews"
  };
  var key = map[type];
  if (!key) return;

  // Handle nested data structures
  if (key === "videos") {
    DB.data.growth.videos.items = (DB.data.growth.videos.items || DB.data.growth.videos || []).filter(function(x) { return x.id !== id; });
  } else {
    DB.data.growth[key] = (DB.data.growth[key] || []).filter(function(x) { return x.id !== id; });
  }
  DB.save();
  render();
}

// Backward compatibility: keep old function references
function showEditVideoForm(id) { showAddVideoForm(id); }
function showAddReviewForm() { showAddReviewFormNew(); }
function showEditReviewForm(id) { showAddReviewFormNew(id); }

// Update deleteItemGeneric to handle growth items
var _origDeleteGeneric = deleteItemGeneric;
deleteItemGeneric = function(type, id) {
  if (type && type.indexOf("growth_") === 0) {
    return deleteGrowthItem(type, id);
  }
  if (!confirm("确认删除？")) return;
  _origDeleteGeneric(type, id);
};

function bindEvents() {
  document.getElementById("modal-overlay").addEventListener("click", closeModal);
  document.addEventListener("keydown", function(e) { if (e.key === "Escape") closeModal(); });

  // ===== 右滑返回上一级（全局手势，document 捕获阶段，任意位置可触发）=====
  var sx = 0, sy = 0, st = 0, tracking = false, maxDx = 0, maxDy = 0;

  // 起点若落在横向可滚动容器 / 输入控件上则不拦截
  function swipeBlocked(target) {
    var el = target;
    var depth = 0;
    while (el && el.nodeType === 1 && depth < 12) {
      var tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (el.scrollWidth - el.clientWidth > 8) {
        var ox = "";
        try { ox = window.getComputedStyle(el).overflowX; } catch (err) {}
        if (ox === "auto" || ox === "scroll") return true;
      }
      el = el.parentElement;
      depth++;
    }
    return false;
  }

  function onSwipeStart(e) {
    tracking = false;
    if (!e.touches || e.touches.length !== 1) return;
    var t = e.touches[0];
    if (!t) return;
    if (swipeBlocked(e.target)) return;
    sx = t.clientX; sy = t.clientY; st = Date.now();
    maxDx = 0; maxDy = 0;
    tracking = true;
  }

  function onSwipeMove(e) {
    if (!tracking) return;
    if (!e.touches || e.touches.length !== 1) { tracking = false; return; }
    var t = e.touches[0];
    if (!t) return;
    maxDx = t.clientX - sx;
    maxDy = Math.abs(t.clientY - sy);
  }

  function onSwipeEnd(e) {
    if (!tracking) return;
    tracking = false;
    var t = (e.changedTouches && e.changedTouches[0]) || null;
    var dx = t ? (t.clientX - sx) : maxDx;
    var dy = t ? Math.abs(t.clientY - sy) : maxDy;
    var dt = Date.now() - st;
    if (dt > 1000) return;                 // 太慢不算手势
    if (dx < 60) return;                   // 右滑距离不足
    if (dy > 90) return;                   // 纵向偏移过大
    if (dx < dy * 1.2) return;             // 必须以横向为主
    goBack();
  }

  document.addEventListener("touchstart", onSwipeStart, { passive: true, capture: true });
  document.addEventListener("touchmove", onSwipeMove, { passive: true, capture: true });
  document.addEventListener("touchend", onSwipeEnd, { passive: true, capture: true });
  document.addEventListener("touchcancel", function() { tracking = false; }, { passive: true, capture: true });

  // Activity tracking for auto-lock
  ["click", "touchstart", "keydown", "scroll"].forEach(function(evt) {
    document.addEventListener(evt, function() { trackActivity(); }, { passive: true });
  });
}

// ===== Init (Phase 1: Lock Screen Check) =====
async function init() {
  try {
    // Theme
    var savedTheme = localStorage.getItem("hw_pm_theme") || "light";
    document.documentElement.setAttribute("data-theme", savedTheme);

    // Render lock numpad
    renderLockNumpad();

    // Check if privacy accepted
    if (!PrivacyManager.isPrivacyAccepted()) {
      // Privacy notice is visible by default (no hidden class in HTML)
      document.getElementById("app").classList.add("hidden");
      return;
    }

    // Privacy accepted → hide notice, show app
    document.getElementById("privacy-notice").classList.add("hidden");

    // Check if app lock is enabled
    if (PrivacyManager.isLockEnabled()) {
      PrivacyManager._isLocked = true;
      document.getElementById("lock-screen").classList.remove("hidden");
      document.getElementById("app").classList.add("hidden");
      return;
    }

    // No lock, proceed to auth gate
    PrivacyManager._isLocked = false;
    document.getElementById("app").classList.remove("hidden");

    // === Auth Gate (Supabase) ===
    try { await SyncManager.init(); } catch (e) {}
    if (!SyncManager.isAuthed()) {
      try { bindAuthUI(); } catch (e) {}
      showAuth();
      return;
    }
    hideAuth();
    await initApp();
  } catch (e) {
    console.error("[Init] Error:", e);
    // Emergency fallback: skip privacy/lock, go straight to app
    document.getElementById("privacy-notice").classList.add("hidden");
    document.getElementById("lock-screen").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
    PrivacyManager._isLocked = false;
    try { await initApp(); } catch (e2) {
      document.getElementById("app-content").innerHTML = '<div class="empty-state"><div class="empty-icon">😵</div><div class="empty-text">加载失败，请刷新页面重试</div></div>';
    }
  }
}

// ===== Init (Phase 2: App Initialization) =====
async function initApp() {
  // === VERSION CHECK: force refresh if app was updated ===
  var storedVersion = localStorage.getItem("_app_version");
  if (storedVersion !== APP_VERSION) {
    console.log("[App] Version mismatch: stored=" + storedVersion + ", current=" + APP_VERSION + ". Updating...");
    // Save backup before version change (in case reload causes issues)
    try {
      DB.init();
      await BackupDB.save("\u7248\u672c\u66f4\u65b0\u524d\u5907\u4efd", DB.data);
    } catch (e) {}
    // Unregister old SW first
    if ("serviceWorker" in navigator) {
      var registrations = await navigator.serviceWorker.getRegistrations();
      for (var r of registrations) { r.unregister(); }
    }
    // Clear SW caches
    if ("caches" in window) {
      var keys = await caches.keys();
      for (var k of keys) { await caches.delete(k); }
    }
    localStorage.setItem("_app_version", APP_VERSION);
    window.location.reload(true);
    return;
  }
  localStorage.setItem("_app_version", APP_VERSION);

  // Init IndexedDB
  try { await ImageDB.open(); } catch (e) { /* IndexedDB may not be available */ }

  // Init data
  DB.init();
  // 行业情报增强：初始化 history/fav/custom 容器
  if (typeof ensureIndustry === "function") ensureIndustry();

  // === 云端同步拉取（登录后把云端数据作为事实源）===
  if (window.SyncManager && SyncManager.isAuthed && SyncManager.isAuthed()) {
    // 迁移：升级前以 guest 模式存的本地数据，登录后合并上云，避免强制登录导致旧数据丢失
    try {
      var _old = localStorage.getItem(DB.KEY);
      if (_old) {
        var _op = JSON.parse(_old);
        DB.data = mergeData(_op, DB.data); // 以云端(已拉取)为主，补入本地旧 guest 独有数据
      }
    } catch (e) {}
    // 本地缓存保留作兜底（不再删除）：重开先读缓存，syncNow 以云端为主合并，双向不丢
    //
    // 🚨 关键修复（v5.8.80）：此前这里串行 await syncNow + forcePush + BackupDB.list，
    // 且 Supabase 请求无超时 → 网络慢/抖动/移动端切换时请求 hang 住，首屏 render() 迟迟不执行 = 白屏。
    // 改为「本地优先、后台同步」：首屏用本地缓存(DB.init 已加载)立即渲染秒开，
    // 云端同步放后台且带超时，绝不再阻塞渲染。
    //
    // IndexedDB latest 缓存兜底：localStorage 可能被浏览器清理，IDB 更持久，缺失数据自动补回。
    // 加 3s 超时，极端情况下也不阻塞首屏（IDB 正常是毫秒级）。
    try {
      var _idb = await _withTimeout(ImageDB.loadLatest(), 3000, "idb loadLatest");
      if (_idb) { DB.data = mergeData(DB.data, _idb); }
    } catch (e) { console.warn("[Init] idb load skipped:", e && e.message); }
    // 后台同步云端：fire-and-forget，syncNow 内部带 9s 超时、成功后自动 render 刷新，不再 await 阻塞首屏
    try { SyncManager.syncNow(); } catch (e) { console.warn("[Sync] sync failed", e); }
    // 自动恢复：当前数据仍明显少于本机最新备份时自动合并（无需再手动去「本地历史备份恢复」）
    // 放后台 .then，避免阻塞首屏
    BackupDB.list().then(function(_baks) {
      if (_baks && _baks.length) {
        var _cur = _countData(DB.data);
        var _best = _countData(_baks[0].data);
        if (_best > _cur + 5) {
          DB.data = mergeData(DB.data, _baks[0].data);
          try { SyncManager.forcePush(); } catch (e) {}
          showToast("🔁 已自动恢复本地历史数据（" + _best + " 条）", "success");
        }
      }
    }).catch(function (e) { console.warn("[Init] backup list skipped:", e && e.message); });
    // 联网后自动把离线草稿补推上云
    window.addEventListener("online", function() {
      try {
        var d = localStorage.getItem("hw_pm_offline_draft");
        if (d) { DB.data = mergeData(DB.data, JSON.parse(d)); SyncManager.forcePush(); localStorage.removeItem("hw_pm_offline_draft"); }
      } catch (e) {}
    });
  }

  // 轻量本地自动快照（仅登录态）：每 10 分钟在 IndexedDB 存一份，自动保留最近 15 份
  // 云端仍是事实源，快照仅作极端兜底（云端被覆盖/浏览器异常时可从设置「本地历史备份恢复」一键合并回云）
  if (window.SyncManager && SyncManager.isAuthed && SyncManager.isAuthed()) {
    try { AutoBackupTimer.start(); } catch (e) {}
  }

  // (数据丢失检测保持关闭：数据以云端为事实源)

  // Init cloud backup state (no auto-download; manual download only)
  CloudBackup.init();

  // Init WebDAV sync (Nutstore) — config UI removed, safe no-op if unconfigured
  WebDAVSync.init();
  WebDAVSync.start();
  WebDAVSync.checkOnStartup();

  // Register Service Worker
  SWManager.register();

  // Fetch live financial data (news + review) - async, non-blocking
  LiveData.fetchAll().then(function() {
    notifyReviewIfFresh();
    // 行业情报增强：把当日抓取的资讯留存到历史，便于回顾
    try {
      if (typeof snapshotNewsForDate === "function" && LiveData.news && DB.data.industryHistory) {
        DB.data.industryHistory = snapshotNewsForDate(LiveData.news, DB.data.industryHistory);
        DB.save();
      }
    } catch (e) { console.warn("[Intel] snapshot failed", e); }
    // 行业情报增强：用服务端每日归档回填缺失日期（幂等，不覆盖已有）
    LiveData.fetchNewsArchive().then(function(archive) {
      try {
        if (archive && typeof reconcileIntelHistory === "function" && DB.data.industryHistory) {
          var before = Object.keys(DB.data.industryHistory).length;
          DB.data.industryHistory = reconcileIntelHistory(archive, DB.data.industryHistory);
          if (Object.keys(DB.data.industryHistory).length > before) {
            DB.save();
            console.log("[Intel] archive reconcile backfilled " + (Object.keys(DB.data.industryHistory).length - before) + " day(s)");
          }
        }
      } catch (e) { console.warn("[Intel] archive reconcile failed", e); }
    });
  });

  // Events
  bindEvents();

  // Start auto-lock timer
  PrivacyManager.startLockTimer();

  // 处理推送/分享深链：URL 带 #brief 等 hash 时直接跳转对应模块
  try {
    if (location.hash && location.hash.length > 1) {
      var hr = decodeURIComponent(location.hash.replace(/^#/, ""));
      var _valid = ["home","workbench","industry","brief","competitors","insights","ideas","settings","videos","reviews","invest","english","language","outfit","fridge","diet","checkin"];
      if (_valid.indexOf(hr) >= 0) { navigate(hr); history.replaceState(null, "", location.pathname); }
    }
    window.addEventListener("hashchange", function() {
      if (location.hash && location.hash.length > 1) {
        var h2 = decodeURIComponent(location.hash.replace(/^#/, ""));
        if (_valid && _valid.indexOf(h2) >= 0) navigate(h2);
      }
    });
  } catch (e) {}

  // 8:30 每日简报弹窗（应用内，与手机推送互补）
  scheduleBriefPopup();

  // Render
  render();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", function() { init(); });

  // ===== Supabase 同步层 =====
  var SyncManager = (function() {
    var client = null;
    var session = null;
    var status = "guest";
    var pushTimer = null;
    var syncInterval = null;
    var lastSyncAt = 0;
    var lastError = null;
    var lastPushRetryAt = 0;

    async function init() {
      if (!window.supabase || !SUPABASE_URL || SUPABASE_URL.indexOf("REPLACE") === 0 || !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.indexOf("REPLACE") === 0) {
        setStatus("guest"); return;
      }
      try {
        client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        window.sb = client; // 暴露全局客户端实例，供简报/推送等 Storage 操作复用
      } catch (e) { setStatus("guest"); return; }
      try {
        var res = await client.auth.getSession();
        session = res.data.session;
        setStatus(session ? (navigator.onLine ? "online" : "offline") : "guest");
      } catch (e) { setStatus("guest"); return; }
      client.auth.onAuthStateChange(function(_e, s) {
        session = s;
        setStatus(s ? (navigator.onLine ? "online" : "offline") : "guest");
      });
      // 切回标签页 / 窗口聚焦时自动同步，多端自动收敛
      if (typeof document !== "undefined") {
        document.addEventListener("visibilitychange", function() {
          if (document.hidden) { try { flushPush(); } catch (e) {} }   // 手机锁屏/切走立即推送，避免定时器被系统杀掉
          else { syncNow(); }
        });
      }
      if (typeof window !== "undefined") {
        window.addEventListener("focus", function() { syncNow(); });
        window.addEventListener("pagehide", function() { try { flushPush(); } catch (e) {} });   // 页面卸载前兜底推送
        window.addEventListener("beforeunload", function() { try { flushPush(); } catch (e) {} });
      }
      // 定时自动同步：已打开的电脑端持续接收手机端新内容（输入时不打断）
      if (!syncInterval) {
        syncInterval = setInterval(function() {
          if (session && !document.hidden && !_isTyping()) syncNow();
        }, 25000);
      }
    }

    function setStatus(st) { status = st; renderBar(); }

    function renderBar() {
      var bar = document.getElementById("sync-bar");
      if (!bar) return;
      if (status === "guest") { bar.classList.add("hidden"); return; }
      bar.classList.remove("hidden");
      var map = {
        online:  { c: "sync-online",  icon: "🟢", t: "已同步云端" },
        offline: { c: "sync-offline", icon: "🔴", t: "离线 · 仅本机" },
        syncing: { c: "sync-syncing", icon: "🟡", t: "同步中…" },
        error:   { c: "sync-error",   icon: "⚠️", t: "同步失败" }
      };
      var m = map[status] || map.offline;
      var sub = "";
      if (lastError) {
        sub = '<span class="sync-sub" style="color:#dc2626">⚠ ' + escapeHtml(String(lastError).slice(0, 90)) + '</span>';
      } else if (lastSyncAt) {
        var d = new Date(lastSyncAt);
        var hh = ("0" + d.getHours()).slice(-2), mm = ("0" + d.getMinutes()).slice(-2), ss = ("0" + d.getSeconds()).slice(-2);
        sub = '<span class="sync-sub">上次 ' + hh + ':' + mm + ':' + ss + '</span>';
      }
      bar.className = "sync-bar " + m.c;
      bar.innerHTML = '<span class="sync-dot"></span><span class="sync-text">' + m.t + '</span>' + sub +
        '<button class="sync-btn" onclick="SyncManager.syncNow()">↻ 同步</button>' +
        '<button class="sync-btn" onclick="SyncManager.logout()">退出</button>';
    }

    async function pull() {
      if (!client || !session) return;
      try {
        setStatus("syncing");
        var r = await _withTimeout(
          client.from("user_data").select("data").eq("user_id", session.user.id).single(),
          9000, "supabase pull"
        );
        if (r.error && r.error.code !== "PGRST116") { console.warn("[Sync] pull", r.error); setStatus(navigator.onLine ? "online" : "offline"); return; }
        if (r.data && r.data.data) {
          DB.data = mergeData(DB.data, r.data.data);
          if (!DB.data.growth) DB.data.growth = {};
          DB.save();
        } else {
          await forcePush();
        }
        setStatus(navigator.onLine ? "online" : "offline");
      } catch (e) { console.warn("[Sync] pull ex", e); setStatus(navigator.onLine ? "online" : "offline"); }
    }

    function schedulePush() {
      if (!client || !session) return;
      if (pushTimer) clearTimeout(pushTimer);
      pushTimer = setTimeout(function() { forcePush(); }, 800);
    }

    // 立即把待推送内容发出去（切走/锁屏/卸载前调用），避免定时器被后台杀掉
    function flushPush() {
      if (!client || !session) return;
      if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
      forcePush();
    }

    async function forcePush() {
      if (!client || !session) return;
      try {
        setStatus("syncing");
        var p = { user_id: session.user.id, data: DB.data, updated_at: new Date().toISOString() };
        var r = await client.from("user_data").upsert(p);
        // token 过期/瞬时失败：刷新 session 后重试一次（避免静默丢失导致重开需手动恢复）
        if (r.error && (!lastPushRetryAt || Date.now() - lastPushRetryAt > 15000)) {
          lastPushRetryAt = Date.now();
          try {
            var s2 = await client.auth.getSession();
            if (s2.data && s2.data.session) {
              session = s2.data.session;
              r = await client.from("user_data").upsert(p);
            }
          } catch (e2) {}
        }
        if (r.error) { lastError = (r.error.message || "push error"); setStatus("error"); return; }
        lastError = ""; lastSyncAt = Date.now();
        setStatus(navigator.onLine ? "online" : "offline");
        try { localStorage.removeItem("hw_pm_offline_draft"); } catch (e) {}
      } catch (e) { lastError = (e && e.message) || String(e); setStatus("error"); }
    }

    // 多端同步：云端为事实源。先拉云端（确保手机端输入出现在电脑端），
    // 云端无数据时才把本地推上去。避免「先推后拉」用过期本地数据覆盖其它端的新内容。
    function _isTyping() {
      var el = document.activeElement;
      if (!el) return false;
      var t = (el.tagName || "").toLowerCase();
      return t === "input" || t === "textarea" || el.isContentEditable;
    }
    async function syncNow() {
      if (!client || !session) return;
      try {
        setStatus("syncing");
        // 9s 超时：Supabase 慢/抖动/移动端网络切换时避免无限等待（曾是白屏主因）
        var r = await _withTimeout(
          client.from("user_data").select("data,updated_at").eq("user_id", session.user.id).single(),
          9000, "supabase pull"
        );
        if (r.error && r.error.code !== "PGRST116") { lastError = (r.error.message || "pull error"); setStatus("error"); return; }
        if (r.data && r.data.data) {
          DB.data = mergeData(DB.data, r.data.data);
          if (!DB.data.growth) DB.data.growth = {};
          DB.save();
        } else {
          await forcePush();
        }
        lastError = ""; lastSyncAt = Date.now();
        setStatus(navigator.onLine ? "online" : "offline");
        // 正在输入时跳过整页重渲染，避免 sync 刷新打断当前录入；数据已合并进 DB.data，下次导航即生效
        if (typeof render === "function" && !_isTyping()) render();
      } catch (e) {
        lastError = (e && e.message) || String(e);
        // 超时/失败：标记 error，但绝不阻塞——首屏已用本地数据渲染
        setStatus(navigator.onLine ? "error" : "offline");
      }
    }

    async function login(email, password) {
      if (!client) return { error: { message: "未配置 Supabase" } };
      return client.auth.signInWithPassword({ email: email, password: password });
    }
    async function signup(email, password) {
      if (!client) return { error: { message: "未配置 Supabase" } };
      return client.auth.signUp({ email: email, password: password });
    }
    function authErr(e) {
      if (!e) return "未知错误";
      var m = (e.message || "").toLowerCase();
      if (m.indexOf("invalid login") >= 0 || m.indexOf("invalid credentials") >= 0)
        return "邮箱或密码不正确，或该账号尚未完成邮箱确认（请到 Supabase 控制台关闭「Confirm email」后重新注册）";
      if (m.indexOf("user already registered") >= 0)
        return "该邮箱已注册，请用「登录」标签直接登录（或先到 Supabase 控制台确认邮件）";
      if (m.indexOf("email not confirmed") >= 0)
        return "邮箱尚未确认，请先查收确认邮件，或到 Supabase 控制台关闭「Confirm email」";
      if (m.indexOf("password should be") >= 0)
        return "密码太短，至少需要 6 位";
      return e.message || "未知错误";
    }
    async function logout() {
      if (!client) return;
      try { await client.auth.signOut(); } catch (e) {}
      session = null; setStatus("guest");
    }
    function isAuthed() { return !!session; }
    window.addEventListener("online", function() { if (session) setStatus("online"); });
    window.addEventListener("offline", function() { if (session) setStatus("offline"); });

    return {
      init: init, pull: pull, schedulePush: schedulePush, forcePush: forcePush, flushPush: flushPush,
      login: login, signup: signup, logout: logout, isAuthed: isAuthed,
      getEmail: function() { return session ? (session.user && session.user.email) || "" : ""; },
      getStatus: function() { return status; }, getLastError: function() { return lastError; }
    };
  })();

  // ===== 登录/认证 UI =====
  function showAuth() {
    var s = document.getElementById("auth-screen");
    if (s) s.classList.remove("hidden");
    document.getElementById("app").classList.add("hidden");
  }
  function hideAuth() {
    var s = document.getElementById("auth-screen");
    if (s) s.classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
  }
  function bindAuthUI() {
    var lb = document.getElementById("auth-login-btn");
    var sb = document.getElementById("auth-signup-btn");
    if (lb) lb.onclick = function() {
      var email = (document.getElementById("auth-email").value || "").trim();
      var pwd = document.getElementById("auth-password").value || "";
      var msg = document.getElementById("auth-msg");
      if (!email || pwd.length < 6) { msg.textContent = "请输入邮箱和至少 6 位密码"; return; }
      msg.textContent = "登录中…";
      SyncManager.login(email, pwd).then(function(r) {
        if (r.error) { msg.textContent = "登录失败：" + SyncManager.authErr(r.error); return; }
        msg.textContent = ""; location.reload();
      });
    };
    if (sb) sb.onclick = function() {
      var email = (document.getElementById("auth-email").value || "").trim();
      var pwd = document.getElementById("auth-password").value || "";
      var msg = document.getElementById("auth-msg");
      if (!email || pwd.length < 6) { msg.textContent = "请输入邮箱和至少 6 位密码"; return; }
      msg.textContent = "注册中…";
      SyncManager.signup(email, pwd).then(function(r) {
        if (r.error) { msg.textContent = "注册失败：" + SyncManager.authErr(r.error); return; }
        msg.textContent = "注册成功，正在登录…"; location.reload();
      });
    };
  }
  function toggleHistory(d) {
    var el = document.getElementById("hi-" + d);
    var ar = document.getElementById("ha-" + d);
    if (!el) return;
    if (el.classList.contains("hidden")) { el.classList.remove("hidden"); if (ar) ar.textContent = "▾"; }
    else { el.classList.add("hidden"); if (ar) ar.textContent = "▸"; }
  }
} else {
  init();
}



