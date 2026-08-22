// ===== 阅读模块（书 / 电子书 / 播客 / 演讲 / 视频 + AI 互相探讨）=====
// 入口：renderReading()（route: reading）
// 数据：DB.data.growth.reading = { items:[], filter:"all", seeded:false }
// 依赖：intel.js 的 callLLMForPrompt / loadAiConfig（共享 AI Key）

var RD_TYPES = [
  { k: "book", t: "📚 书", verb: "阅读" },
  { k: "ebook", t: "📱 电子书", verb: "阅读" },
  { k: "podcast", t: "🎧 播客", verb: "收听" },
  { k: "talk", t: "🎤 演讲", verb: "观看" },
  { k: "video", t: "🎬 视频", verb: "观看" }
];

function rdTypeName(k) {
  for (var i = 0; i < RD_TYPES.length; i++) if (RD_TYPES[i].k === k) return RD_TYPES[i].t;
  return k || "条目";
}
function rdTypeVerb(k) {
  for (var i = 0; i < RD_TYPES.length; i++) if (RD_TYPES[i].k === k) return RD_TYPES[i].verb;
  return "查看";
}
// 书/电子书用「看」，音频/视频类用「听/看」
function rdStatuses(type) {
  if (type === "podcast" || type === "talk" || type === "video") return ["想听", "在听", "已听"];
  return ["想看", "在读", "已读"];
}

// 取阅读数据（带兜底 + 首次播种一个「得到」播客示例）
function rdGet() {
  var g = DB.data.growth || (DB.data.growth = {});
  if (!g.reading) g.reading = { items: [], filter: "all", seeded: false };
  if (!g.reading.items) g.reading.items = [];
  if (g.reading.filter == null) g.reading.filter = "all";
  if (!g.reading.seeded) {
    g.reading.items.push({
      id: uid(),
      title: "得到·罗辑思维（占位示例）",
      type: "podcast",
      author: "罗振宇",
      platform: "得到",
      url: "https://www.dedao.cn/",
      status: "想听",
      rating: 0,
      note: "先放一个「得到」播客占位——把链接换成你常听的节目即可，点「▶ 收听」会直接打开。",
      createdAt: new Date().toISOString(),
      discussion: []
    });
    g.reading.seeded = true;
    DB.save();
  }
  return g.reading;
}

// ---------- 渲染 ----------
function renderReading() {
  var c = document.getElementById("app-content");
  if (!c) return;
  var rd = rdGet();
  var items = rd.items || [];
  var f = rd.filter || "all";
  var filtered = f === "all" ? items.slice() : items.filter(function (x) { return x.type === f; });
  filtered.sort(function (a, b) { return (b.createdAt || "").localeCompare(a.createdAt || ""); });

  var total = items.length;
  var active = items.filter(function (x) { return rdStatuses(x.type).indexOf(x.status) === 1; }).length;
  var done = items.filter(function (x) { return rdStatuses(x.type).indexOf(x.status) === 2; }).length;

  function cnt(t) { return items.filter(function (x) { return x.type === t; }).length; }
  var chips =
    '<div class="chip' + (f === "all" ? " active" : "") + '" onclick="rdSetFilter(\'all\')">全部 ' + total + '</div>' +
    RD_TYPES.map(function (t) {
      return '<div class="chip' + (f === t.k ? " active" : "") + '" onclick="rdSetFilter(\'' + t.k + '\')">' + t.t + ' ' + cnt(t.k) + '</div>';
    }).join("");

  var html =
    '<div class="stats-grid">' +
      '<div class="stat-card"><div class="stat-icon">📚</div><div class="stat-value">' + total + '</div><div class="stat-label">总条目</div></div>' +
      '<div class="stat-card"><div class="stat-icon">📖</div><div class="stat-value">' + active + '</div><div class="stat-label">在读/在听</div></div>' +
      '<div class="stat-card"><div class="stat-icon">✅</div><div class="stat-value">' + done + '</div><div class="stat-label">已读/已听</div></div>' +
    '</div>' +
    '<div class="filter-bar" style="margin:2px 0 10px">' + chips + '</div>' +
    '<div class="flex-between mb-8"><div class="card-title">📚 我的书架 / 听单</div>' +
      '<button class="btn btn-secondary btn-mini" onclick="navigate(\'rsync\')">🎧 百度网盘</button>' +
      '<button class="btn btn-secondary btn-mini" onclick="rdImportBiliModal()">🎬 导入B站</button>' +
      '<button class="btn btn-primary btn-mini" onclick="rdAddModal()">➕ 添加</button></div>';

  if (!filtered.length) {
    html += '<div class="empty-state"><div class="empty-icon">📚</div><div class="empty-text">还没有记录<br>点「🎬 导入B站」输入 BV 号即可自动拉取标题/封面/分P；也可点「➕ 添加」一本书、一个播客，或放直链视频（百度网盘用 alist 直链可站内播放）</div></div>';
  } else {
    html += filtered.map(rdCardHtml).join("");
  }
  c.innerHTML = html;
}

function rdCardHtml(it) {
  var st = rdStatuses(it.type);
  var typeT = rdTypeName(it.type);
  var verb = rdTypeVerb(it.type);
  var rating = "";
  for (var i = 1; i <= 5; i++) {
    rating += '<span class="rd-star" onclick="rdRate(\'' + it.id + '\',' + i + ')">' + (i <= (it.rating || 0) ? "★" : "☆") + '</span>';
  }
  var meta = (it.author || it.platform)
    ? '<div class="rd-meta">' + escapeHtml(it.author || "") + (it.author && it.platform ? " · " : "") + escapeHtml(it.platform || "") + '</div>'
    : "";
  var note = it.note ? '<div class="rd-note">' + escapeHtml(it.note) + '</div>' : "";
  var discN = (it.discussion && it.discussion.length) ? " (" + it.discussion.length + ")" : "";
  var cover = it.cover ? '<img class="rd-cover" src="' + escapeHtml(it.cover) + '" alt="" loading="lazy">' : "";
  return '<div class="rd-card">' +
    '<div class="rd-card-top">' +
      '<span class="rd-type">' + typeT + '</span>' +
      '<span class="rd-status rd-status-' + st.indexOf(it.status) + '" onclick="rdCycleStatus(\'' + it.id + '\')">' + escapeHtml(it.status) + ' ▾</span>' +
    '</div>' +
    cover +
    '<div class="rd-title">' + escapeHtml(it.title) + '</div>' +
    meta + note +
    '<div class="rd-rating">' + rating + '</div>' +
    '<div class="rd-actions">' +
      '<button class="btn btn-secondary btn-mini" onclick="rdPlay(\'' + it.id + '\')">▶ ' + verb + '</button>' +
      '<button class="btn btn-secondary btn-mini" onclick="rdDiscuss(\'' + it.id + '\')">💬 探讨' + discN + '</button>' +
      '<button class="btn btn-ghost btn-mini" onclick="rdEdit(\'' + it.id + '\')">✎</button>' +
      '<button class="btn btn-ghost btn-mini rd-del" onclick="rdDelete(\'' + it.id + '\')">🗑</button>' +
    '</div>' +
  '</div>';
}

function rdSetFilter(f) { var rd = rdGet(); rd.filter = f; DB.save(); render(); }

function rdCycleStatus(id) {
  var rd = rdGet(); var it = rdById(rd, id); if (!it) return;
  var st = rdStatuses(it.type); var i = st.indexOf(it.status);
  it.status = st[(i + 1) % st.length];
  DB.save(); render();
}
function rdRate(id, n) {
  var rd = rdGet(); var it = rdById(rd, id); if (!it) return;
  it.rating = (it.rating === n) ? 0 : n; // 再点同一颗取消
  DB.save(); render();
}
function rdById(rd, id) {
  for (var i = 0; i < rd.items.length; i++) if (rd.items[i].id === id) return rd.items[i];
  return null;
}
function rdDelete(id) {
  if (typeof confirm === "function" && !confirm("确定删除这条记录？探讨内容也会一并删除。")) return;
  var rd = rdGet(); rd.items = rd.items.filter(function (x) { return x.id !== id; });
  DB.save(); render();
}

// ---------- 添加 / 编辑 ----------
function rdAddModal() { rdEdit(null); }
function rdEdit(id) {
  var rd = rdGet();
  var it = id ? rdById(rd, id) : null;
  var isEdit = !!it;
  var d = it || { title: "", type: "book", author: "", platform: "", url: "", status: "想看", rating: 0, note: "", cover: "" };
  var typeOpts = RD_TYPES.map(function (t) { return '<option value="' + t.k + '"' + (t.k === d.type ? " selected" : "") + '>' + t.t + '</option>'; }).join("");
  var statusOpts = rdStatuses(d.type).map(function (s) { return '<option' + (s === d.status ? " selected" : "") + '>' + s + '</option>'; }).join("");
  var ratingOpts = [0, 1, 2, 3, 4, 5].map(function (n) {
    return '<option value="' + n + '"' + (n === (d.rating || 0) ? " selected" : "") + '>' + (n === 0 ? "未评" : n + "★") + '</option>';
  }).join("");
  showModal(
    '<div class="rd-form">' +
      '<div class="rd-form-h">' + (isEdit ? "✎ 编辑条目" : "➕ 添加阅读 / 收听") + '</div>' +
      '<label>标题 *<input id="rd-f-title" value="' + escapeHtml(d.title) + '" placeholder="书名 / 节目名 / 演讲主题"></label>' +
      '<div class="rd-form-row"><label>类型<select id="rd-f-type" onchange="rdTypeChange()">' + typeOpts + '</select></label>' +
      '<label>状态<select id="rd-f-status">' + statusOpts + '</select></label></div>' +
      '<div class="rd-form-row"><label>作者 / 主讲<input id="rd-f-author" value="' + escapeHtml(d.author || "") + '"></label>' +
      '<label>平台 / 出处<input id="rd-f-platform" value="' + escapeHtml(d.platform || "") + '"></label></div>' +
      '<label>播放 / 阅读链接<textarea id="rd-f-url" placeholder="B站视频链接 / 直链视频(mp4·webm·m3u8)可站内播放 / 得到或播客地址 / 网页（留空也可，后续再补）">' + escapeHtml(d.url || "") + '</textarea></label>' +
      '<label>封面图 URL（可选）<input id="rd-f-cover" value="' + escapeHtml(d.cover || "") + '" placeholder="粘贴封面图片地址；导入B站视频会自动带上"></label>' +
      '<div class="rd-form-hint">📌 百度网盘视频：网盘页无法内嵌播放，请在 <b>alist</b> 挂载后复制<b>直链</b>（如 <code>https://你的alist/d/xxx.mp4</code>）填进来，即可站内直接播放。</div>' +
      '<label>评分<select id="rd-f-rating">' + ratingOpts + '</select></label>' +
      '<label>笔记<textarea id="rd-f-note" placeholder="一句话感想 / 推荐理由 / 想探讨的问题">' + escapeHtml(d.note || "") + '</textarea></label>' +
      '<div class="rd-form-actions"><button class="btn btn-secondary" onclick="closeModal()">取消</button>' +
      '<button class="btn btn-primary" onclick="rdSave(\'' + (id || "") + '\')">保存</button></div>' +
    '</div>'
  );
}
function rdTypeChange() {
  var t = document.getElementById("rd-f-type").value;
  var sel = document.getElementById("rd-f-status");
  if (sel) sel.innerHTML = rdStatuses(t).map(function (s) { return "<option>" + s + "</option>"; }).join("");
}
function rdSave(id) {
  var title = (document.getElementById("rd-f-title").value || "").trim();
  if (!title) { showToast("请填写标题"); return; }
  var rd = rdGet();
  var rec = id ? rdById(rd, id) : null;
  if (!rec) { rec = { id: uid(), createdAt: new Date().toISOString(), discussion: [] }; rd.items.unshift(rec); }
  rec.title = title;
  rec.type = document.getElementById("rd-f-type").value;
  rec.author = (document.getElementById("rd-f-author").value || "").trim();
  rec.platform = (document.getElementById("rd-f-platform").value || "").trim();
  rec.url = (document.getElementById("rd-f-url").value || "").trim();
  rec.cover = (document.getElementById("rd-f-cover").value || "").trim();
  rec.status = document.getElementById("rd-f-status").value;
  rec.rating = parseInt(document.getElementById("rd-f-rating").value || "0", 10) || 0;
  rec.note = (document.getElementById("rd-f-note").value || "").trim();
  if (!rec.createdAt) rec.createdAt = new Date().toISOString();
  if (!rec.discussion) rec.discussion = [];
  DB.save();
  closeModal();
  render();
}

// ---------- 导入B站视频（与语言模块视频课一致：输 BV 号 → 自动拉标题/封面/分P）----------
function rdImportBiliModal() {
  showModal(
    '<div class="rd-form">' +
      '<div class="rd-form-h">🎬 导入B站视频</div>' +
      '<label>BV 号 / 视频链接<input id="rd-bili-bv" placeholder="BV1W4Ne6nEhM 或粘贴B站链接"></label>' +
      '<div class="rd-form-hint">支持多集合集，会自动拉取全部分P。已收录的可秒导；未收录的会尝试实时拉取（可能被浏览器 CORS 拦截）。</div>' +
      '<div class="rd-form-actions"><button class="btn btn-secondary" onclick="closeModal()">取消</button>' +
      '<button class="btn btn-primary" onclick="rdImportBiliGo()">导入</button></div>' +
    '</div>'
  );
}
function rdParseBv(s) {
  var m = String(s || "").match(/BV[0-9A-Za-z]{10}/);
  return m ? m[0] : "";
}
function rdBiliPresetUrl() {
  return (typeof LG_VIDEO_JSON !== "undefined" && LG_VIDEO_JSON) ? LG_VIDEO_JSON : "data/lang_videos.json";
}
function rdImportBiliGo() {
  var inp = document.getElementById("rd-bili-bv");
  var bvid = rdParseBv(inp ? inp.value : "");
  if (!bvid) { showToast("没识别到 BV 号", "warn"); return; }
  var rd = rdGet();
  // 去重：已存在同 BV 的条目
  var dup = (rd.items || []).filter(function (x) { return (x.url || "").indexOf(bvid) >= 0 || (x.bvid && x.bvid === bvid); })[0];
  if (dup) { showToast("《" + (dup.title || bvid) + "》已经在书架里了", "warn"); closeModal(); return; }
  showToast("正在拉取视频…", "info");
  fetch(rdBiliPresetUrl() + "?t=" + Date.now())
    .then(function (r) { return r.json(); })
    .then(function (j) {
      var hit = (j.courses || []).filter(function (c) { return c.bvid === bvid; })[0];
      if (hit) { rdAddBili(hit); return; }
      return rdFetchBiliLive(bvid);
    })
    .catch(function () { return rdFetchBiliLive(bvid); });
}
function rdFetchBiliLive(bvid) {
  return fetch("https://api.bilibili.com/x/web-interface/view?bvid=" + bvid)
    .then(function (r) { return r.json(); })
    .then(function (j) {
      if (!j.data) throw new Error("no data");
      var v = j.data, pages = v.pages || [];
      rdAddBili({
        bvid: v.bvid, title: v.title, up: v.owner ? v.owner.name : "",
        cover: (v.pic || "").replace(/^http:/, "https:"),
        episodes: pages.map(function (p) { return { p: p.page, title: p.part || ("P" + p.page) }; })
      });
    })
    .catch(function () {
      closeModal();
      showToast("拉取失败：该视频未收录，且浏览器无法直连B站接口（可点「➕ 添加」手动粘贴链接）", "error");
    });
}
function rdAddBili(c) {
  var rd = rdGet();
  var bvid = c.bvid;
  var rec = {
    id: uid(),
    title: c.title || bvid,
    type: "video",
    author: c.up || "",
    platform: "B站",
    url: "https://www.bilibili.com/video/" + bvid,
    cover: c.cover || "",
    bvid: bvid,
    episodes: (c.episodes || []).slice(),
    status: "想看",
    rating: 0,
    note: (c.episodes && c.episodes.length > 1) ? ("共 " + c.episodes.length + " 集，点 ▶ 观看可切换分P") : "",
    createdAt: new Date().toISOString(),
    discussion: []
  };
  rd.items.unshift(rec);
  DB.save();
  closeModal();
  render();
  showToast("已导入《" + (c.title || bvid).slice(0, 16) + "》" + ((c.episodes || []).length ? " · " + c.episodes.length + " 集" : ""), "success");
}

// ---------- 播放 / 直达 ----------
// 媒体类型识别：bilibili / 音频 / 直链视频 / HLS(m3u8) / 百度网盘 / 普通外链
function rdMediaKind(url) {
  if (!url) return "none";
  if (/bilibili\.com\/video\/BV/i.test(url) || /player\.bilibili/i.test(url)) return "bilibili";
  if (/pan\.baidu\.com/i.test(url)) return "baidu";
  if (/\.(m3u8)(\?|$)/i.test(url)) return "m3u8";
  if (/\.(mp4|webm|ogg|mov|m4v|mkv)(\?|$)/i.test(url)) return "video";
  if (/\.(mp3|m4a|wav|ogg|aac|flac)(\?|$)/i.test(url)) return "audio";
  return "link";
}

function rdInitHls(videoEl, src) {
  function attach() {
    if (window.Hls && window.Hls.isSupported && window.Hls.isSupported()) {
      try {
        var hls = new window.Hls();
        hls.loadSource(src);
        hls.attachMedia(videoEl);
        hls.on(window.Hls.Events.ERROR, function (e, d) {
          if (d && d.fatal) showToast("HLS 播放失败：" + (d.details || ""));
        });
        return;
      } catch (e) { /* 落到原生兜底 */ }
    }
    if (videoEl.canPlayType && videoEl.canPlayType("application/vnd.apple.mpegurl")) {
      videoEl.src = src; return;
    }
    showToast("当前浏览器不支持 HLS 播放");
  }
  if (window.Hls) { attach(); return; }
  // 兜底：动态加载本地 hls.min.js
  var s = document.createElement("script");
  s.src = "js/vendor/hls.min.js";
  s.onload = attach;
  s.onerror = function () { showToast("HLS 播放器加载失败"); };
  document.head.appendChild(s);
}

function rdPlay(id) {
  var rd = rdGet(); var it = rdById(rd, id); if (!it) return;
  var url = (it.url || "").trim();
  var verb = (it.type === "podcast") ? "收听" : (it.type === "video" || it.type === "talk") ? "观看" : "阅读";
  var kind = rdMediaKind(url);
  var body;
  if (kind === "bilibili") {
    var m = url.match(/BV[0-9A-Za-z]+/);
    var bv = m ? m[0] : "";
    var epSel = "";
    if (it.episodes && it.episodes.length > 1) {
      var opts = it.episodes.map(function (e, i) {
        return '<option value="' + (i + 1) + '">' + escapeHtml((e.title || ("P" + (i + 1))).slice(0, 28)) + '</option>';
      }).join("");
      epSel = '<div class="rd-ep-sel">分P：<select id="rdEp" onchange="var f=document.getElementById(\'rdBili\');if(f)f.src=\'https://player.bilibili.com/player.html?bvid=' + bv + '&p=\'+this.value+\'&autoplay=0&high_quality=1&danmaku=0\'">' + opts + '</select></div>';
    }
    var src = "https://player.bilibili.com/player.html?bvid=" + bv + "&p=1&autoplay=0&high_quality=1&danmaku=0";
    body = epSel + '<iframe id="rdBili" class="rd-iframe" src="' + src + '" frameborder="0" scrolling="no" allowfullscreen="true" allow="autoplay; fullscreen; encrypted-media"></iframe>';
  } else if (kind === "audio") {
    body = '<audio class="rd-audio" controls src="' + escapeHtml(url) + '"></audio>';
  } else if (kind === "video" || kind === "m3u8") {
    var vhtml = '<video id="rdVideo" class="rd-video" controls preload="metadata" playsinline' +
      (kind === "video" ? ' src="' + escapeHtml(url) + '"' : '') + '></video>' +
      '<div class="rd-hint">💡 直链可站内直接播放；若加载失败，多为网盘/平台防盗链，请用 alist 直链。</div>';
    body = vhtml;
  } else if (kind === "baidu") {
    body = '<div class="rd-open">' +
      '<div class="rd-open-tip">🔍 检测到 <b>百度网盘</b> 链接。网盘页面不支持 iframe 内嵌，且其直链带防盗链，无法直接在这里播放。</div>' +
      '<div class="rd-hint">✅ 解决方案：把网盘挂到 <b>alist</b>（本地/小服务器），复制 alist 生成的直链（形如 <code>https://你的alist/d/...mp4</code> 或 <code>.m3u8</code>）填进来，即可<b>站内直接播放</b>。</div>' +
      '<a class="rd-open-link" href="' + escapeHtml(url) + '" target="_blank" rel="noopener">' + escapeHtml(url) + '</a>' +
      '<button class="btn btn-primary" onclick="window.open(\'' + escapeHtml(url) + '\',\'_blank\')">↗ 打开网盘</button>' +
    '</div>';
  } else if (url) {
    body = '<div class="rd-open">' +
      '<div class="rd-open-tip">该内容需在新窗口打开（部分平台不支持内嵌播放）：</div>' +
      '<a class="rd-open-link" href="' + escapeHtml(url) + '" target="_blank" rel="noopener">' + escapeHtml(url) + '</a>' +
      '<button class="btn btn-primary" onclick="window.open(\'' + escapeHtml(url) + '\',\'_blank\')">↗ 打开</button>' +
    '</div>';
  } else {
    body = '<div class="rd-open-tip">这条还没填播放链接。点「✎ 编辑」补一个 B站 / 直链视频 / 播客地址即可。</div>';
  }
  showModal(
    '<div class="rd-player">' +
      '<div class="rd-player-h">▶ ' + verb + '：' + escapeHtml(it.title) + '</div>' +
      body +
    '</div>'
  );
  if (kind === "m3u8") {
    var v = document.getElementById("rdVideo");
    if (v) rdInitHls(v, url);
  }
}

// ---------- AI 互相探讨 ----------
function rdBuildPrompt(item, history, userMsg) {
  var verb = (item.type === "podcast") ? "收听" : (item.type === "video" || item.type === "talk") ? "观看" : "阅读";
  var ctx = "【资料】标题：《" + (item.title || "") + "》\n类型：" + rdTypeName(item.type) +
    (item.author ? "\n作者/主讲：" + item.author : "") +
    (item.platform ? "\n平台/出处：" + item.platform : "") +
    (item.note ? "\n我的笔记：" + item.note : "");
  var hist = (history || []).map(function (m) {
    return (m.role === "user" ? "用户" : "AI") + "：" + m.text;
  }).join("\n");
  return "你是一位善于思辨、敢于提出不同视角的阅读/播客/演讲探讨伙伴。用户正在" + verb + "《" + (item.title || "") + "》。\n" +
    ctx + "\n\n你们之前的探讨：\n" + (hist || "（暂无）") + "\n\n用户刚才说：" + (userMsg || "") +
    "\n\n请你像朋友一样回应：有深度、能激发进一步思考，可以在关键处提出不同看法或追问，不要长篇说教。用简体中文，控制在 200 字以内。";
}

function rdDiscuss(id) {
  var rd = rdGet(); var it = rdById(rd, id); if (!it) return;
  it.discussion = it.discussion || [];
  window.__rdDiscId = id;
  var cfg = (typeof loadAiConfig === "function") ? loadAiConfig() : {};
  var provider = (cfg && cfg.provider && cfg.provider !== "gemini") ? cfg.provider : "gemini";
  var modelNote = (cfg && cfg.apiKey)
    ? ("当前模型：" + provider + " · 探讨内容自动存档")
    : ("⚠️ 尚未配置 AI Key，请先到「设置」添加（支持 Gemini / 智谱 / 硅基流动等联网模型）后再探讨");
  showModal(
    '<div class="rd-disc">' +
      '<div class="rd-disc-h">💬 与 AI 探讨：《' + escapeHtml(it.title) + '》</div>' +
      '<div class="rd-disc-sub">' + modelNote + '</div>' +
      '<div class="rd-disc-body" id="rd-disc-body">' + rdDiscMsgsHtml(it) + '</div>' +
      '<div class="rd-disc-input">' +
        '<textarea id="rd-disc-input" placeholder="写下你的观点 / 疑问，回车发送（Shift+Enter 换行）" onkeydown="if(event.key===\'Enter\'&&!event.shiftKey){event.preventDefault();rdDiscussSend();}"></textarea>' +
        '<button class="btn btn-primary" onclick="rdDiscussSend()">发送</button>' +
      '</div>' +
    '</div>'
  );
  var body = document.getElementById("rd-disc-body");
  if (body) body.scrollTop = body.scrollHeight;
}
function rdDiscMsgsHtml(it) {
  if (!it.discussion || !it.discussion.length) {
    return '<div class="rd-disc-empty">还没有探讨记录。说说你的想法，让 AI 陪你一起思辨～</div>';
  }
  return it.discussion.map(rdDiscBubble).join("");
}
function rdDiscBubble(m) {
  var cls = m.role === "user" ? "user" : "ai";
  var name = m.role === "user" ? "我" : "AI";
  if (m.error) cls += " err";
  return '<div class="rd-bubble ' + cls + '"><span class="rd-bubble-name">' + name + '</span><div class="rd-bubble-text">' + escapeHtml(m.text || "") + '</div></div>';
}
function rdRenderDiscBody(id) {
  var rd = rdGet(); var it = rdById(rd, id); if (!it) return;
  var body = document.getElementById("rd-disc-body");
  if (body) { body.innerHTML = rdDiscMsgsHtml(it); body.scrollTop = body.scrollHeight; }
}
async function rdDiscussSend() {
  var id = window.__rdDiscId; if (!id) return;
  var input = document.getElementById("rd-disc-input"); if (!input) return;
  var text = (input.value || "").trim();
  if (!text) { showToast("先写点什么吧"); return; }
  var rd = rdGet(); var it = rdById(rd, id); if (!it) return;
  it.discussion = it.discussion || [];
  it.discussion.push({ role: "user", text: text, at: new Date().toISOString() });
  input.value = "";
  rdRenderDiscBody(id);

  var body = document.getElementById("rd-disc-body");
  var loadingEl = null;
  if (body) {
    loadingEl = document.createElement("div");
    loadingEl.className = "rd-bubble ai";
    loadingEl.id = "rd-loading";
    loadingEl.innerHTML = '<span class="rd-bubble-name">AI</span><div class="rd-bubble-text">思考中…💭</div>';
    body.appendChild(loadingEl);
    body.scrollTop = body.scrollHeight;
  }

  var cfg = (typeof loadAiConfig === "function") ? loadAiConfig() : {};
  var apiKey = (cfg && cfg.apiKey) ? cfg.apiKey : "";
  var provider = (cfg && cfg.provider && cfg.provider !== "gemini") ? cfg.provider : "gemini";
  try {
    if (!apiKey) throw new Error("请先在「设置」配置 AI Key（支持 Gemini / 智谱 / 硅基流动等联网模型）");
    if (typeof callLLMForPrompt !== "function") throw new Error("AI 探讨功能未加载（callLLMForPrompt 缺失）");
    var prompt = rdBuildPrompt(it, it.discussion.slice(0, -1), text);
    var res = await callLLMForPrompt(provider, apiKey, prompt);
    it.discussion.push({ role: "ai", text: (res && res.text) || "(空响应)", at: new Date().toISOString(), provider: provider });
    DB.save();
  } catch (e) {
    it.discussion.push({ role: "ai", text: "⚠️ " + (e && e.message ? e.message : e), at: new Date().toISOString(), error: true });
    DB.save();
  }
  rdRenderDiscBody(id);
}
