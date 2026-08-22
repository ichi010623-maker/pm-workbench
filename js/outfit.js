// ============================================================
// 👗 穿搭管理模块（个人成长区）
// 5 个固定子模块：今日智能穿搭 / 衣橱管理 / 搭配创作库 / 日程规划 / 周月复盘
// 数据全部本地（DB.data.growth.outfit），随 Supabase 同步与备份生效。
// ============================================================

var outfitTab = "today";
var outfitWeatherLoading = false;
var outfitWeatherTriedDate = "";
var outfitWeekOffset = 0;
var outfitFilter = { season: "all", style: "all", cat: "all" };
var outfitReportRange = "week"; // week | month
var _outfitPhotoCtx = null;      // 实拍上传上下文 {ids, occasion}
var _outfitPhotoInput = null;    // 懒加载的文件选择 input

var OUTFIT_CATEGORIES = ["上装", "下装", "连衣裙", "外套", "鞋履", "配饰"];
var OUTFIT_SEASONS = ["春", "夏", "秋", "冬", "全季"];
var OUTFIT_STYLES = ["通勤", "休闲", "气质", "运动", "复古", "甜美", "酷飒"];
var OUTFIT_CITY = {
  "北京": [39.9042, 116.4074], "上海": [31.2304, 121.4737], "广州": [23.1291, 113.2644],
  "深圳": [22.5431, 114.0579], "杭州": [30.2741, 120.1551], "成都": [30.5728, 104.0668],
  "重庆": [29.5630, 106.5516], "武汉": [30.5928, 114.3055], "西安": [34.3416, 108.9398],
  "南京": [32.0603, 118.7969], "苏州": [31.2989, 120.5853], "天津": [39.3434, 117.3616],
  "长沙": [28.2282, 112.9388], "郑州": [34.7466, 113.6254], "青岛": [36.0671, 120.3826],
  "厦门": [24.4798, 118.0894], "昆明": [24.8801, 102.8329], "沈阳": [41.8057, 123.4315],
  "大连": [38.9140, 121.6147], "哈尔滨": [45.8038, 126.5349], "济南": [36.6512, 117.1201],
  "福州": [26.0745, 119.2965], "合肥": [31.8206, 117.2272], "南昌": [28.6829, 115.8579],
  "贵阳": [26.6477, 106.6302], "南宁": [22.8170, 108.3665], "太原": [37.8706, 112.5489],
  "石家庄": [38.0428, 114.5149], "兰州": [36.0611, 103.8343], "乌鲁木齐": [43.8256, 87.6168],
  "拉萨": [29.6520, 91.1721], "海口": [20.0440, 110.1999],
  "中国香港": [22.3193, 114.1694], "中国台北": [25.0330, 121.5654],
  "东京": [35.6762, 139.6503], "纽约": [40.7128, -74.0060]
};

// 场合配置（通勤/休闲/气质），供「今日推荐」与「描述需求一键搭配」复用
var OUTFIT_OCCASION_CFG = {
  "通勤": { occasion: "通勤", style: "通勤", scene: "办公室 / 会议 / 通勤路", cats: ["上装", "下装"], outer: true, shoes: ["通勤", "休闲"], acc: ["配饰"] },
  "休闲": { occasion: "休闲", style: "休闲", scene: "逛街 / 咖啡 / 居家", cats: ["上装", "下装"], outer: true, shoes: ["休闲", "运动"], acc: ["配饰"] },
  "气质": { occasion: "气质", style: "气质", scene: "约会 / 晚餐 / 重要场合", cats: ["连衣裙", "上装", "下装"], outer: true, shoes: ["气质", "通勤"], acc: ["配饰"] }
};
// 动态类别 / 风格（默认 + 用户自定义）
function outfitCats() { return OUTFIT_CATEGORIES.concat((ensureOutfit().customCats || [])); }
function outfitStyles() { return OUTFIT_STYLES.concat((ensureOutfit().customStyles || [])); }

// ---------- 数据初始化 ----------
function ensureOutfit() {
  if (!DB.data.growth) DB.data.growth = {};
  if (!DB.data.growth.outfit) {
    DB.data.growth.outfit = {
      city: "上海", lat: 31.2304, lon: 121.4737,
      useGeo: true, geoLabel: "",
      weatherCache: null,
      wardrobe: [], outfits: [], plan: {}, trips: [],
      customCats: [], customStyles: [],
      settings: { idleDays: 30 }
    };
  }
  var o = DB.data.growth.outfit;
  if (!o.wardrobe) o.wardrobe = [];
  if (!o.outfits) o.outfits = [];
  if (!o.plan) o.plan = {};
  if (!o.settings) o.settings = { idleDays: 30 };
  if (o.useGeo == null) o.useGeo = true;
  // 老用户若从未设置坐标，默认开启手机定位，进入穿搭即自动取当地天气
  if (o.useGeo === false && o.lat == null && o.lon == null) o.useGeo = true;
  if (o.geoLabel == null) o.geoLabel = "";
  if (!o.customCats) o.customCats = [];
  if (!o.customStyles) o.customStyles = [];
  if (!o.trips) o.trips = [];
  if (!o.wearPhotos) o.wearPhotos = [];   // 实拍上身图 {id,date,image,ids,occasion,note,ts}
  return o;
}

// ---------- 入口 ----------
function renderOutfit() {
  ensureOutfit();
  var c = document.getElementById("app-content");
  var tabs = [
    { id: "today", label: "👗 今日穿搭" },
    { id: "wardrobe", label: "🚪 衣橱" },
    { id: "library", label: "🧩 搭配库" },
    { id: "schedule", label: "📅 日程" },
    { id: "travel", label: "✈️ 旅行" },
    { id: "report", label: "📊 复盘" }
  ];
  c.innerHTML = '<div class="outfit-tabs">' + tabs.map(function (t) {
    return '<div class="outfit-tab' + (outfitTab === t.id ? ' active' : '') + '" onclick="setOutfitTab(\'' + t.id + '\')">' + t.label + '</div>';
  }).join('') + '</div>';

  if (outfitTab === "today") renderOutfitToday(c);
  else if (outfitTab === "wardrobe") renderOutfitWardrobe(c);
  else if (outfitTab === "library") renderOutfitLibrary(c);
  else if (outfitTab === "schedule") renderOutfitSchedule(c);
  else if (outfitTab === "travel") renderOutfitTravel(c);
  else if (outfitTab === "report") renderOutfitReport(c);
}
function setOutfitTab(t) { outfitTab = t; render(); }

// ---------- 通用工具 ----------
function outfitSeasonNow() {
  var m = new Date().getMonth() + 1;
  return (m >= 3 && m <= 5) ? "春" : (m >= 6 && m <= 8) ? "夏" : (m >= 9 && m <= 11) ? "秋" : "冬";
}
function outfitTempBand(t) {
  if (t >= 28) return "炎热";
  if (t >= 22) return "温暖";
  if (t >= 15) return "凉爽";
  if (t >= 8) return "冷";
  return "寒冷";
}
function conditionFromCode(code) {
  var m = { 0: "晴", 1: "晴间多云", 2: "局部多云", 3: "阴", 45: "雾", 48: "雾凇", 51: "毛毛雨", 53: "毛毛雨", 55: "毛毛雨", 56: "冻毛雨", 57: "冻毛雨", 61: "小雨", 63: "中雨", 65: "大雨", 66: "冻雨", 67: "冻雨", 71: "小雪", 73: "中雪", 75: "大雪", 77: "雪粒", 80: "阵雨", 81: "阵雨", 82: "强阵雨", 85: "阵雪", 86: "强阵雪", 95: "雷阵雨", 96: "雷阵雨伴雹", 99: "强雷暴" };
  return m[code] || "多云";
}
function activeWeather(o) {
  return (o.weatherCache && o.weatherCache.temp != null) ? o.weatherCache : null;
}
function dateMinus(days) { var d = new Date(); d.setDate(d.getDate() - days); return d.toISOString().slice(0, 10); }
function wearsInRange(arr, days) {
  if (!arr) return 0;
  var c = dateMinus(days);
  return arr.filter(function (x) { return x >= c; }).length;
}
function ofEscAttr(s) { return String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, "&quot;"); }
function catEmoji(cat) { return ({ "上装": "👕", "下装": "👖", "连衣裙": "👗", "外套": "🧥", "鞋履": "👟", "配饰": "🧣" })[cat] || "👚"; }
function outfitItemThumb(it, size) {
  size = size || 56;
  if (it.image) return '<img src="' + it.image + '" style="width:' + size + 'px;height:' + size + 'px;object-fit:cover;border-radius:10px">';
  return '<div style="width:' + size + 'px;height:' + size + 'px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:' + (size * 0.5) + 'px;background:rgba(255,255,255,0.06)">' + catEmoji(it.category) + '</div>';
}
function findOutfitItem(id) {
  var o = ensureOutfit();
  return o.wardrobe.find(function (x) { return x.id === id; }) || null;
}
function findOutfit(id) {
  var o = ensureOutfit();
  return o.outfits.find(function (x) { return x.id === id; }) || null;
}

// ============================================================
// ① 今日智能穿搭面板
// ============================================================
async function loadWeather() {
  var o = ensureOutfit();
  if (outfitWeatherLoading) return;
  if (o.weatherCache && o.weatherCache.date === today() && o.weatherCache.temp != null) { render(); return; }
  outfitWeatherLoading = true;
  var ok = false;
  var lat = o.lat, lon = o.lon;
  try {
    // 联动手机定位：优先用 Geolocation 取当前真实位置
    if (o.useGeo && "geolocation" in navigator) {
      try {
        var pos = await getGeoPosition(8000);
        lat = pos.coords.latitude; lon = pos.coords.longitude;
        o.lat = lat; o.lon = lon;
        try { o.geoLabel = await reverseGeocode(lat, lon); } catch (e) { o.geoLabel = o.geoLabel || "我的位置"; }
        DB.save();
      } catch (e) { /* 定位失败，回退城市坐标 */ }
    }
    var url = "https://api.open-meteo.com/v1/forecast?latitude=" + lat + "&longitude=" + lon +
      "&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto";
    var r = await fetch(url);
    if (!r.ok) throw new Error("http " + r.status);
    var j = await r.json();
    var cc = j.current || {};
    o.weatherCache = {
      date: today(), temp: Math.round(cc.temperature_2m), code: cc.weather_code,
      condition: conditionFromCode(cc.weather_code), humidity: cc.relative_humidity_2m,
      wind: cc.wind_speed_10m, live: true, geo: !!o.useGeo
    };
    DB.save();
    ok = true;
  } catch (e) { ok = false; }
  outfitWeatherLoading = false;
  outfitWeatherTriedDate = today();
  if (ok) render();
}

// 包裹 Geolocation 为 Promise（带超时）
function getGeoPosition(timeoutMs) {
  return new Promise(function (resolve, reject) {
    if (!("geolocation" in navigator)) { reject(new Error("no geolocation")); return; }
    navigator.geolocation.getCurrentPosition(function (pos) { resolve(pos); }, function (err) { reject(err); },
      { enableHighAccuracy: false, timeout: timeoutMs || 8000, maximumAge: 10 * 60 * 1000 });
  });
}

// 反向地理编码（best-effort，免费免 key），失败回退“我的位置”
async function reverseGeocode(lat, lon) {
  try {
    var r = await fetch("https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=" + lat + "&longitude=" + lon + "&localityLanguage=zh");
    if (!r.ok) return "我的位置";
    var j = await r.json();
    return j.city || j.locality || j.principalSubdivision || "我的位置";
  } catch (e) { return "我的位置"; }
}

// 手动点击“用手机定位”：授权后联动手机天气
async function usePhoneLocation() {
  var o = ensureOutfit();
  if (!("geolocation" in navigator)) { showToast("当前环境不支持定位"); return; }
  showToast("正在获取手机定位…");
  try {
    var pos = await getGeoPosition(8000);
    o.useGeo = true;
    o.lat = pos.coords.latitude;
    o.lon = pos.coords.longitude;
    try { o.geoLabel = await reverseGeocode(o.lat, o.lon); } catch (e) { o.geoLabel = "我的位置"; }
    o.weatherCache = null;
    outfitWeatherTriedDate = "";
    DB.save();
    loadWeather();
  } catch (e) {
    o.useGeo = false; DB.save();
    showToast("定位未授权，已回退到城市天气");
  }
}

function renderOutfitToday(c) {
  var o = ensureOutfit();
  var w = activeWeather(o);
  // 天气获取（每天至多尝试一次）
  var needFetch = (!w || w.date !== today()) && outfitWeatherTriedDate !== today() && !outfitWeatherLoading;
  if (needFetch) loadWeather();

  var weatherHtml;
  if (w && w.temp != null) {
    var src = w.geo ? "📍 手机定位" : (w.live ? "🌐 实时天气" : "✋ 手动设置");
    var locLabel = (o.useGeo && o.geoLabel) ? o.geoLabel : o.city;
    weatherHtml =
      '<div class="outfit-weather">' +
      '<div class="ow-main"><div class="ow-temp">' + w.temp + '°</div><div class="ow-cond">' + (w.condition || "—") + '</div></div>' +
      '<div class="ow-meta">' +
      '<div>📍 ' + escapeHtml(locLabel) + (o.useGeo ? ' ·已联动' : '') + '</div>' +
      (w.humidity != null ? '<div>💧 湿度 ' + w.humidity + '%</div>' : '') +
      (w.wind != null ? '<div>💨 风速 ' + w.wind + ' km/h</div>' : '') +
      '<div style="color:var(--text-tertiary);font-size:11px">' + src + '</div>' +
      '</div>' +
      '<div class="ow-actions">' +
      '<button class="btn btn-secondary" style="padding:6px 10px;font-size:12px" onclick="usePhoneLocation()">📍 定位</button>' +
      '<button class="btn btn-secondary" style="padding:6px 10px;font-size:12px" onclick="refreshWeather()">🔄 刷新</button>' +
      '<button class="btn btn-secondary" style="padding:6px 10px;font-size:12px" onclick="showOutfitManualWeather()">✋ 手动</button>' +
      '<button class="btn btn-secondary" style="padding:6px 10px;font-size:12px" onclick="showOutfitSettings()">⚙️</button>' +
      '</div></div>';
  } else {
    weatherHtml =
      '<div class="outfit-weather ow-empty">' +
      '<div class="ow-main"><div class="ow-temp">' + (outfitWeatherLoading ? "…" : "?") + '°</div><div class="ow-cond">' + (outfitWeatherLoading ? "获取天气中" : "暂无天气") + '</div></div>' +
      '<div class="ow-actions">' +
      '<button class="btn btn-primary" style="padding:6px 12px;font-size:12px" onclick="usePhoneLocation()">📍 用手机定位</button>' +
      '<button class="btn btn-secondary" style="padding:6px 10px;font-size:12px" onclick="showOutfitManualWeather()">✋ 手动</button>' +
      '<button class="btn btn-secondary" style="padding:6px 10px;font-size:12px" onclick="showOutfitSettings()">⚙️ 城市</button>' +
      '</div></div>';
  }

  c.innerHTML += weatherHtml;
  c.innerHTML += describeBoxHtml(w);

  if (!w || w.temp == null) {
    c.innerHTML += '<div class="empty-state"><div class="empty-icon">🌤️</div><div class="empty-text">设置天气后，<br>自动为你推荐今日穿搭</div></div>';
    return;
  }

  var recs = recommendOutfits(w);
  if (!recs.length) {
    c.innerHTML += '<div class="empty-state"><div class="empty-icon">🚪</div><div class="empty-text">衣橱还空空如也<br>先去「衣橱」添加单品，<br>才能智能推荐</div><div style="margin-top:12px"><button class="btn btn-primary" onclick="setOutfitTab(\'wardrobe\')">去添加单品</button></div></div>';
    return;
  }

  recs.forEach(function (rec, i) {
    var itemsHtml = rec.items.map(function (it) {
      return '<div class="rec-item"><div class="ri-thumb">' + outfitItemThumb(it, 48) + '</div><div class="ri-name">' + escapeHtml(it.name) + '</div><div class="ri-cat">' + it.category + '</div></div>';
    }).join('');
    var ids = rec.items.map(function (it) { return it.id; }).join(',');
    var photo = outfitPhotoOfToday();
    var photoHtml = '';
    if (photo) {
      photoHtml =
        '<div class="wp-today" onclick="outfitPhotoView(\'' + photo.id + '\')">' +
        '<img src="' + photo.image + '" alt="">' +
        '<div class="wp-today-info"><div class="wp-today-t">📸 今日实拍已上传</div><div class="wp-today-s">' + (photo.occasion ? escapeHtml(photo.occasion) + ' · ' : '') + formatDateShort(photo.date) + ' · 点击查看大图</div></div>' +
        '<span class="wp-today-edit" onclick="event.stopPropagation();outfitPhotoPick(\'' + ids + '\',\'' + ofEscAttr(rec.occasion) + '\')">🔄 更换</span>' +
        '</div>';
    }
    c.innerHTML +=
      '<div class="outfit-rec">' +
      '<div class="or-head"><span class="or-occ">' + rec.occasion + '</span><span class="or-scene">' + rec.scene + '</span></div>' +
      '<div class="or-items">' + itemsHtml + '</div>' +
      '<div class="or-reason"><b>推荐理由：</b>' + escapeHtml(rec.reasoning) + '</div>' +
      '<div class="or-temp">🌡️ ' + escapeHtml(rec.tempNote) + '</div>' +
      '<div class="or-copy">“' + escapeHtml(rec.copy) + '”</div>' +
      (rec.missing && rec.missing.length ? '<div class="or-gap-tag">⚠️ 衣橱缺：' + rec.missing.join("、") + '</div>' : '') +
      purchaseBlockHtml(rec) +
      photoHtml +
      '<div class="or-actions">' +
      '<button class="btn btn-primary" style="flex:1;padding:8px;font-size:13px" onclick="logWearFromIds(\'' + ids + '\')">✅ 标记已穿</button>' +
      '<button class="btn btn-secondary" style="flex:1;padding:8px;font-size:13px" onclick="saveRecAsOutfit(\'' + ids + '\',\'' + rec.occasion + '\')">💾 存为搭配</button>' +
      '<button class="btn btn-secondary" style="flex:1;padding:8px;font-size:13px;color:var(--accent-blue)" onclick="outfitPhotoPick(\'' + ids + '\',\'' + ofEscAttr(rec.occasion) + '\')">📸 ' + (photo ? '更换实拍' : '上传实拍') + '</button>' +
      '</div></div>';
  });
}

function refreshWeather() {
  var o = ensureOutfit();
  o.weatherCache = null;
  outfitWeatherTriedDate = "";
  loadWeather();
}

// ---------- 📸 实拍上身图（今日上传 · 月度汇总） ----------
function outfitPhotoOfToday() {
  var o = ensureOutfit();
  var t = today();
  var list = (o.wearPhotos || []).filter(function (p) { return p.date === t; }).sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
  return list[0] || null;
}
function outfitPhotoInputEnsure() {
  if (_outfitPhotoInput) return _outfitPhotoInput;
  var inp = document.createElement("input");
  inp.type = "file";
  inp.accept = "image/*";
  inp.style.display = "none";
  inp.addEventListener("change", function () {
    var f = inp.files && inp.files[0];
    var ctx = _outfitPhotoCtx;
    inp.value = "";
    if (!f || !ctx) return;
    if (f.size > 8 * 1024 * 1024) { alert("图片请控制在 8MB 以内"); return; }
    if (typeof compressImage === "function") {
      compressImage(f).then(function (dataUrl) { outfitPhotoSave(ctx, dataUrl); })
        .catch(function () { alert("图片处理失败，请重试"); });
    } else {
      var rd = new FileReader();
      rd.onload = function () { outfitPhotoSave(ctx, rd.result); };
      rd.onerror = function () { alert("图片读取失败"); };
      rd.readAsDataURL(f);
    }
  });
  document.body.appendChild(inp);
  _outfitPhotoInput = inp;
  return inp;
}
function outfitPhotoPick(ids, occasion) {
  _outfitPhotoCtx = { ids: (ids || "").split(",").filter(Boolean), occasion: occasion || "" };
  outfitPhotoInputEnsure().click();
}
function outfitPhotoSave(ctx, dataUrl) {
  var o = ensureOutfit();
  if (!o.wearPhotos) o.wearPhotos = [];
  var t = today();
  // 同一天覆盖旧的（只保留当天最新一张），跨端以 ts 较新为准
  o.wearPhotos = o.wearPhotos.filter(function (p) { return p.date !== t; });
  o.wearPhotos.push({
    id: uid(), date: t, image: dataUrl,
    ids: ctx.ids || [], occasion: ctx.occasion || "",
    note: "", ts: Date.now()
  });
  DB.save();
  closeModal();
  showToast("今日实拍已保存 📸", "success");
  render();
}
function outfitPhotoView(id) {
  var o = ensureOutfit();
  var p = (o.wearPhotos || []).filter(function (x) { return x.id === id; })[0];
  if (!p) return;
  var idsName = (p.ids || []).map(function (x) { var it = findOutfitItem(x); return it ? it.name : ""; }).filter(Boolean).join("、");
  showModal(
    '<div class="modal-title">📸 实拍上身图</div>' +
    '<div style="padding:14px 16px">' +
    '<img src="' + p.image + '" style="width:100%;max-height:60vh;object-fit:contain;border-radius:12px;background:rgba(255,255,255,0.04)">' +
    '<div style="margin-top:10px;font-size:12px;color:var(--text-secondary);line-height:1.7">' +
      '📅 ' + formatDateShort(p.date) +
      (p.occasion ? '<br>🎯 场合：' + escapeHtml(p.occasion) : '') +
      (idsName ? '<br>👕 穿搭：' + escapeHtml(idsName) : '') +
    '</div>' +
    '</div>' +
    '<div class="btn-row" style="padding:0 16px 16px">' +
      '<button class="btn btn-secondary" style="color:var(--accent-red);flex:1" onclick="outfitPhotoDel(\'' + id + '\')">🗑 删除这张</button>' +
      '<button class="btn btn-primary" style="flex:1" onclick="closeModal()">关闭</button>' +
    '</div>'
  );
}
function outfitPhotoDel(id) {
  if (!confirm("确认删除这张实拍图？")) return;
  var o = ensureOutfit();
  o.wearPhotos = (o.wearPhotos || []).filter(function (p) { return p.id !== id; });
  DB.save();
  closeModal();
  showToast("已删除", "success");
  render();
}
// 月度实拍回顾（复盘-本月用）：返回当月实拍缩略图网格 HTML
function outfitPhotoMonthHtml(o, monthPrefix) {
  var list = (o.wearPhotos || []).filter(function (p) { return (p.date || "").indexOf(monthPrefix) === 0; })
    .sort(function (a, b) { return (a.date < b.date ? -1 : 1); });
  if (!list.length) {
    return '<div class="card"><div class="card-body" style="text-align:center;color:var(--text-secondary)">本月还没上传实拍<br><span style="font-size:11px;color:var(--text-tertiary)">在「今日穿搭」给每天搭配好的衣服拍张上身照，月底一键回顾</span></div></div>';
  }
  return '<div class="wp-grid">' + list.map(function (p) {
    var idsName = (p.ids || []).map(function (x) { var it = findOutfitItem(x); return it ? it.name : ""; }).filter(Boolean).join("、");
    return '<div class="wp-item" onclick="outfitPhotoView(\'' + p.id + '\')">' +
      '<img src="' + p.image + '" alt="">' +
      '<div class="wp-date">' + formatDateShort(p.date) + (p.occasion ? ' · ' + escapeHtml(p.occasion) : '') + '</div>' +
      (idsName ? '<div class="wp-sub">' + escapeHtml(idsName) + '</div>' : '') +
      '</div>';
  }).join('') + '</div>';
}

function recommendOutfits(w) {
  var o = ensureOutfit();
  if (!o.wardrobe.length) return [];
  var seed = parseInt((today() || "0").replace(/-/g, ""), 10) || 1;
  return Object.keys(OUTFIT_OCCASION_CFG).map(function (key, i) {
    return buildOutfit(OUTFIT_OCCASION_CFG[key], w, seed + i * 7);
  }).filter(function (r) { return r && r.items.length; });
}

function pickFrom(pool, stylePref, seed) {
  var season = outfitSeasonNow();
  var seasonMatch = pool.filter(function (it) { return (it.season || []).indexOf(season) >= 0 || (it.season || []).indexOf("全季") >= 0; });
  var base = seasonMatch.length ? seasonMatch : pool;
  var styled = base.filter(function (it) { return (it.style || []).indexOf(stylePref) >= 0; });
  var cand = styled.length ? styled : base;
  if (!cand.length) return null;
  return cand[seed % cand.length];
}

function buildOutfit(conf, w, seed) {
  var o = ensureOutfit();
  var band = outfitTempBand(w.temp);
  var needOuter = conf.outer && (band === "冷" || band === "寒冷" || band === "凉爽");
  var items = [];

  // 主件：气质优先连衣裙
  var dress = null, top = null, bottom = null, outer = null, shoes = null, acc = null;
  if (conf.occasion === "气质") {
    dress = pickFrom(o.wardrobe.filter(function (it) { return it.category === "连衣裙"; }), conf.style, seed);
  }
  if (!dress) {
    top = pickFrom(o.wardrobe.filter(function (it) { return it.category === "上装"; }), conf.style, seed);
    bottom = pickFrom(o.wardrobe.filter(function (it) { return it.category === "下装"; }), conf.style, seed + 1);
  }
  if (needOuter) outer = pickFrom(o.wardrobe.filter(function (it) { return it.category === "外套"; }), conf.style, seed + 2);
  shoes = pickFrom(o.wardrobe.filter(function (it) { return it.category === "鞋履"; }), conf.shoes[0], seed + 3) ||
    pickFrom(o.wardrobe.filter(function (it) { return it.category === "鞋履"; }), conf.shoes[1] || conf.shoes[0], seed + 3);
  acc = pickFrom(o.wardrobe.filter(function (it) { return it.category === "配饰"; }), conf.acc[0], seed + 4);

  if (dress) items.push(dress);
  if (top) items.push(top);
  if (bottom) items.push(bottom);
  if (outer) items.push(outer);
  if (shoes) items.push(shoes);
  if (acc) items.push(acc);

  if (!items.length) return null;
  var reasoning = outfitReasoning(conf.occasion, w, !!outer);
  var tempNote = outfitTempNote(band);
  var copy = generateOutfitCopy(conf.occasion, items);
  var missing = assessOutfitGaps(conf, w);
  return { occasion: conf.occasion, scene: conf.scene, items: items, reasoning: reasoning, tempNote: tempNote, copy: copy, missing: missing, _w: w };
}

// 评估某场景衣橱缺口（仅按类别存在性判断，季节/风格不符不误判为缺）
function assessOutfitGaps(conf, w) {
  var o = ensureOutfit();
  var band = outfitTempBand(w.temp);
  var needOuter = conf.outer && (band === "冷" || band === "寒冷" || band === "凉爽");
  var missing = [];
  function has(cat) { return (o.wardrobe || []).some(function (it) { return it.category === cat; }); }
  if (conf.occasion === "气质") {
    if (!has("连衣裙") && !has("上装")) missing.push("连衣裙 / 上装");
    if (!has("下装")) missing.push("下装");
  } else {
    if (!has("上装")) missing.push("上装");
    if (!has("下装")) missing.push("下装");
  }
  if (needOuter && !has("外套")) missing.push("外套");
  if (!has("鞋履")) missing.push("鞋履");
  if (!has("配饰")) missing.push("配饰");
  return missing;
}

// 把缺口转换为「推荐购入」建议（结合场景 / 风格 / 天气）
function buildPurchaseRecommendations(conf, w, missing) {
  if (!missing || !missing.length) return [];
  var band = outfitTempBand(w.temp);
  var style = conf.style || conf.occasion;
  var cond = (w.condition || "晴");
  var base = {
    "连衣裙 / 上装": "一条「" + style + "风 连衣裙」或质感「" + style + " 衬衫/针织衫」——气质场合核心单品，建议优先购入。",
    "上装": "一件「" + style + " 上装」（衬衫 / 针织 / T恤），是整套搭配的地基，建议先补。",
    "下装": "一条「" + style + " 下装」（西裤 / 半裙 / 牛仔裤），与现有上装组合能立刻多搭几套。",
    "外套": "一件「" + style + " 外套」（西装 / 风衣 / 大衣），当前 " + band + " 气温与空调房都适用，叠穿立刻提升层次。",
    "鞋履": "一双「" + style + " 鞋履」（乐福鞋 / 小白鞋 / 低跟鞋），决定整套的完整度。",
    "配饰": "一两组「配饰」（丝巾 / 耳饰 / 腰带），小预算撬动风格感，性价比最高。"
  };
  return missing.map(function (cat) {
    var text = base[cat] || ("补充一件「" + cat + "」即可完善该场景搭配。");
    if (cat === "鞋履" && cond.indexOf("雨") >= 0) text += "（有雨，优先选防滑鞋底）";
    if (cat === "外套" && (band === "寒冷" || band === "冷")) text += "（优先保暖材质，如羊毛/羽绒）";
    return { cat: cat, text: text };
  });
}

// 渲染「衣橱缺口 · 推荐购入」卡片
function purchaseBlockHtml(rec) {
  if (!rec || !rec.missing || !rec.missing.length) return "";
  var conf = OUTFIT_OCCASION_CFG[rec.occasion] || OUTFIT_OCCASION_CFG["休闲"];
  var w = rec._w || { temp: 20, condition: "晴" };
  var list = buildPurchaseRecommendations(conf, w, rec.missing);
  if (!list.length) return "";
  return '<div class="of-buy-tip"><div class="obt-head">🛍️ 衣橱缺口 · 推荐购入</div>' +
    list.map(function (r) {
      return '<div class="obt-row"><span class="obt-cat">' + escapeHtml(r.cat) + '</span><span class="obt-text">' + escapeHtml(r.text) + '</span></div>';
    }).join("") + '</div>';
}

function outfitReasoning(occasion, w, hasOuter) {
  var band = outfitTempBand(w.temp);
  var base = "今日 " + w.temp + "℃（" + band + "），" + (w.condition || "晴") + "。";
  var scene = occasion === "通勤" ? "通勤场合讲究干净利落" : occasion === "休闲" ? "休闲场合以舒适松弛为先" : "气质场合重在细节与氛围感";
  var layer = hasOuter ? "已叠加外套应对早晚温差与空调房。" : (band === "炎热" || band === "温暖") ? "单穿即可，注意透气清爽。" : "可视体感加一件薄衫。";
  if ((w.condition || "").indexOf("雨") >= 0) layer += "有雨，建议避开浅色易脏单品、选防滑鞋款。";
  if ((w.condition || "").indexOf("雪") >= 0) layer += "有雪，注意鞋底防滑。";
  if ((w.condition || "").indexOf("风") >= 0) layer += "有风，长裙与宽檐帽需谨慎。";
  return base + scene + "，" + layer;
}
function outfitTempNote(band) {
  return ({
    "炎热": "高温易出汗，优先透气、浅色、速干材质，并做防晒。",
    "温暖": "体感舒适，薄长袖或衬衫最稳妥，早晚备一件薄开衫。",
    "凉爽": "温差明显，采用叠穿：内薄外厚，方便随时穿脱。",
    "冷": "气温偏低，毛衣 / 厚外套护体，注意颈胸保暖。",
    "寒冷": "严寒预警，羽绒 / 大衣 + 围巾 + 厚靴，分层保暖不显臃肿。"
  })[band] || "";
}
function generateOutfitCopy(occasion, items) {
  var m = {};
  items.forEach(function (it) { m[it.category] = it.name; });
  var parts = [];
  if (m["连衣裙"]) parts.push("一袭「" + m["连衣裙"] + "」");
  if (m["上装"]) parts.push("「" + m["上装"] + "」");
  if (m["下装"]) parts.push("「" + m["下装"] + "」");
  if (m["外套"]) parts.push("外披「" + m["外套"] + "」");
  if (m["鞋履"]) parts.push("脚踩「" + m["鞋履"] + "」");
  if (m["配饰"]) parts.push("点缀「" + m["配饰"] + "」");
  var s = parts.join("，");
  var tail = occasion === "通勤" ? " 干净利落，气场全开。#OOTD #通勤穿搭 ✨"
    : occasion === "休闲" ? " 松弛自在，舒服又好拍。#OOTD #休闲穿搭 ✨"
      : " 细节见品味，温柔而有力量。#OOTD #气质穿搭 ✨";
  return s + "。" + tail;
}

function saveRecAsOutfit(ids, occasion) {
  var idArr = ids.split(',').filter(Boolean);
  var items = idArr.map(findOutfitItem).filter(Boolean);
  if (!items.length) return;
  var copy = generateOutfitCopy(occasion, items);
  var name = occasion + "·" + today();
  showModal(
    '<div class="modal-title">💾 存为搭配</div>' +
    '<form onsubmit="submitSaveRec(event,\'' + ids + '\',\'' + occasion + '\')">' +
    '<div class="form-group"><div class="form-label">搭配名称</div><input class="form-input" name="name" value="' + escapeHtml(name) + '"></div>' +
    '<div class="form-group"><div class="form-label">风格</div><select class="form-input" name="style">' + outfitStyles().map(function (s) { return '<option value="' + s + '"' + (s === occasion ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></div>' +
    '<div class="form-group"><div class="form-label">穿搭文案</div><textarea class="form-textarea" name="copy" rows="3">' + escapeHtml(copy) + '</textarea></div>' +
    '<div class="btn-row"><button type="button" class="btn btn-secondary" onclick="closeModal()">取消</button><button type="submit" class="btn btn-primary">保存</button></div>' +
    '</form>'
  );
}
function submitSaveRec(event, ids, occasion) {
  event.preventDefault();
  var fd = new FormData(event.target);
  var data = Object.fromEntries(fd);
  var idArr = ids.split(',').filter(Boolean);
  var o = ensureOutfit();
  o.outfits.unshift({
    id: uid(), name: data.name || (occasion + "·" + today()), occasion: occasion,
    style: data.style || occasion, itemIds: idArr, copy: data.copy || "",
    createdAt: today(), wearLog: []
  });
  DB.save();
  closeModal();
  showToast("已存入搭配库 👗");
  render();
}
function logWearFromIds(ids) {
  var idArr = ids.split(',').filter(Boolean);
  logWear(idArr, null);
  showToast("已记录今日穿搭 ✅");
  render();
}
function logWear(itemIds, outfitId) {
  var o = ensureOutfit();
  itemIds.forEach(function (id) {
    var it = findOutfitItem(id);
    if (!it) return;
    if (!it.wears) it.wears = [];
    it.wears.push(today());
    it.wearCount = (it.wearCount || 0) + 1;
    it.lastWorn = today();
  });
  if (outfitId) {
    var of = findOutfit(outfitId);
    if (of) { if (!of.wearLog) of.wearLog = []; of.wearLog.push(today()); }
  }
  DB.save();
}

function showOutfitManualWeather() {
  var o = ensureOutfit();
  var cur = activeWeather(o);
  showModal(
    '<div class="modal-title">✋ 手动设置天气</div>' +
    '<form onsubmit="submitManualWeather(event)">' +
    '<div class="form-group"><div class="form-label">当前温度 (℃)</div><input class="form-input" type="number" name="temp" value="' + (cur ? cur.temp : "") + '" required></div>' +
    '<div class="form-group"><div class="form-label">天气状况</div><select class="form-input" name="condition">' +
    ["晴", "晴间多云", "局部多云", "阴", "雾", "毛毛雨", "小雨", "中雨", "大雨", "阵雨", "雪", "雷阵雨"].map(function (s) {
      return '<option value="' + s + '"' + (cur && cur.condition === s ? ' selected' : '') + '>' + s + '</option>';
    }).join('') + '</select></div>' +
    '<div class="btn-row"><button type="button" class="btn btn-secondary" onclick="closeModal()">取消</button><button type="submit" class="btn btn-primary">确定</button></div>' +
    '</form>'
  );
}
function submitManualWeather(event) {
  event.preventDefault();
  var fd = new FormData(event.target);
  var data = Object.fromEntries(fd);
  var o = ensureOutfit();
  o.weatherCache = { date: today(), temp: parseInt(data.temp, 10), condition: data.condition, live: false, manual: true };
  DB.save();
  closeModal();
  render();
}
function showOutfitSettings() {
  var o = ensureOutfit();
  var cityOpts = Object.keys(OUTFIT_CITY).map(function (c) {
    return '<option value="' + c + '"' + (o.city === c ? ' selected' : '') + '>' + c + '</option>';
  }).join('');
  showModal(
    '<div class="modal-title">⚙️ 穿搭设置</div>' +
    '<form onsubmit="submitOutfitSettings(event)">' +
    '<div class="form-group"><label class="chk" style="display:flex;align-items:center;gap:8px"><input type="checkbox" name="useGeo"' + (o.useGeo ? ' checked' : '') + '> 📍 用手机定位（联动手机天气，自动取当地温度）</label></div>' +
    '<div class="form-group"><div class="form-label">所在城市（定位关闭时使用）</div><select class="form-input" name="city" id="of-city" onchange="onOutfitCityChange()">' +
    cityOpts + '<option value="__other__"' + (OUTFIT_CITY[o.city] ? '' : ' selected') + '>其它（手动经纬度）</option></select></div>' +
    '<div id="of-coords" style="' + (OUTFIT_CITY[o.city] ? 'display:none' : '') + '">' +
    '<div class="form-group"><div class="form-label">纬度 latitude</div><input class="form-input" type="number" step="0.0001" name="lat" value="' + o.lat + '"></div>' +
    '<div class="form-group"><div class="form-label">经度 longitude</div><input class="form-input" type="number" step="0.0001" name="lon" value="' + o.lon + '"></div>' +
    '</div>' +
    '<div class="form-group"><div class="form-label">闲置提醒天数（超过未穿判为闲置）</div><input class="form-input" type="number" name="idleDays" value="' + (o.settings.idleDays || 30) + '"></div>' +
    '<div class="form-group"><div class="form-label">自定义类别 / 风格</div>' + customCatsStylesHtml(o) + '</div>' +
    '<div class="btn-row"><button type="button" class="btn btn-secondary" onclick="closeModal()">取消</button><button type="submit" class="btn btn-primary">保存</button></div>' +
    '</form>'
  );
}
function onOutfitCityChange() {
  var sel = document.getElementById("of-city");
  var coords = document.getElementById("of-coords");
  if (sel && coords) coords.style.display = (sel.value === "__other__") ? "block" : "none";
}
function submitOutfitSettings(event) {
  event.preventDefault();
  var fd = new FormData(event.target);
  var data = Object.fromEntries(fd);
  var o = ensureOutfit();
  var wasGeo = o.useGeo;
  o.useGeo = fd.get("useGeo") === "on";
  o.city = data.city === "__other__" ? "自定义" : data.city;
  if (data.city === "__other__") { o.lat = parseFloat(data.lat); o.lon = parseFloat(data.lon); }
  else if (OUTFIT_CITY[data.city]) { o.lat = OUTFIT_CITY[data.city][0]; o.lon = OUTFIT_CITY[data.city][1]; }
  o.settings.idleDays = parseInt(data.idleDays, 10) || 30;
  // 刚开启手机定位：直接走授权 + 取天气
  if (o.useGeo && !wasGeo) {
    DB.save(); closeModal(); usePhoneLocation(); return;
  }
  // 关闭定位：回退到城市坐标
  if (!o.useGeo && wasGeo) {
    if (OUTFIT_CITY[o.city]) { o.lat = OUTFIT_CITY[o.city][0]; o.lon = OUTFIT_CITY[o.city][1]; }
    o.geoLabel = "";
  }
  o.weatherCache = null;
  outfitWeatherTriedDate = "";
  DB.save();
  closeModal();
  loadWeather();
}

// ============================================================
// ② 衣橱管理助手
// ============================================================
function renderOutfitWardrobe(c) {
  var o = ensureOutfit();
  var idleDays = o.settings.idleDays || 30;
  var list = o.wardrobe.slice();
  if (outfitFilter.cat !== "all") list = list.filter(function (it) { return it.category === outfitFilter.cat; });
  if (outfitFilter.season !== "all") list = list.filter(function (it) { return (it.season || []).indexOf(outfitFilter.season) >= 0; });
  if (outfitFilter.style !== "all") list = list.filter(function (it) { return (it.style || []).indexOf(outfitFilter.style) >= 0; });

  var idleItems = o.wardrobe.filter(function (it) { return wearsInRange(it.wears, idleDays) === 0; });

  var catChips = ['all'].concat(OUTFIT_CATEGORIES).map(function (k) {
    return '<div class="chip' + (outfitFilter.cat === k ? ' active' : '') + '" onclick="setOutfitFilter(\'cat\',\'' + k + '\')">' + (k === 'all' ? '全部' : k) + '</div>';
  }).join('');
  var seasonChips = ['all'].concat(OUTFIT_SEASONS).map(function (k) {
    return '<div class="chip' + (outfitFilter.season === k ? ' active' : '') + '" onclick="setOutfitFilter(\'season\',\'' + k + '\')">' + (k === 'all' ? '全季' : k) + '</div>';
  }).join('');
  var styleChips = ['all'].concat(OUTFIT_STYLES).map(function (k) {
    return '<div class="chip' + (outfitFilter.style === k ? ' active' : '') + '" onclick="setOutfitFilter(\'style\',\'' + k + '\')">' + (k === 'all' ? '全部' : k) + '</div>';
  }).join('');

  c.innerHTML +=
    '<div class="section-title"><span class="emoji">🚪</span> 衣橱 <span style="margin-left:auto;font-size:13px;color:var(--text-secondary)">' + list.length + ' 件</span></div>' +
    '<button class="btn btn-primary" style="width:100%;justify-content:center;gap:6px;margin-bottom:10px" onclick="showOutfitItemModal()">＋ 添加单品（可上传白底图）</button>' +
    '<div class="filter-bar">' + catChips + '</div>' +
    '<div class="filter-bar">' + seasonChips + '</div>' +
    '<div class="filter-bar">' + styleChips + '</div>';

  // 断舍离建议
  if (idleItems.length) {
    var idleHtml = idleItems.slice(0, 8).map(function (it) {
      var last = it.lastWorn ? ('上次穿 ' + formatDateShort(it.lastWorn)) : '从未穿过';
      return '<div class="idle-item"><div class="ii-thumb">' + outfitItemThumb(it, 36) + '</div><div class="ii-info"><div class="ii-name">' + escapeHtml(it.name) + '</div><div class="ii-sub">' + last + ' · 共穿 ' + (it.wearCount || 0) + ' 次</div></div></div>';
    }).join('');
    c.innerHTML +=
      '<div class="discard-box"><div class="discard-head" onclick="toggleOutfitDiscard()">🧹 断舍离建议（' + idleItems.length + ' 件长期闲置） <span id="od-arrow">▾</span></div>' +
      '<div id="od-list">' + idleHtml + '<div class="discard-tip">长期未穿的单品可优先考虑捐赠 / 转卖 / 回收，给衣橱腾出空间。</div></div></div>';
  }

  if (!list.length) {
    c.innerHTML += '<div class="empty-state"><div class="empty-icon">🚪</div><div class="empty-text">还没有符合条件的单品</div></div>';
    return;
  }
  c.innerHTML += '<div class="wardrobe-grid">' + list.map(function (it) {
    var idle = wearsInRange(it.wears, idleDays) === 0;
    return '<div class="wardrobe-item' + (idle ? ' idle' : '') + '" onclick="showOutfitItemModal(\'' + it.id + '\')">' +
      '<div class="wi-thumb">' + (it.image ? '<img src="' + it.image + '" alt="">' : catEmoji(it.category)) + (idle ? '<span class="wi-idle-tag">闲置</span>' : '') + '</div>' +
      '<div class="wi-name">' + escapeHtml(it.name) + '</div>' +
      '</div>';
  }).join('') + '</div>';
}
function setOutfitFilter(type, val) { outfitFilter[type] = val; render(); }
function toggleOutfitDiscard() {
  var el = document.getElementById("od-list");
  var ar = document.getElementById("od-arrow");
  if (!el) return;
  if (el.classList.contains("hidden")) { el.classList.remove("hidden"); if (ar) ar.textContent = "▾"; }
  else { el.classList.add("hidden"); if (ar) ar.textContent = "▸"; }
}
function showOutfitItemModal(id) {
  var o = ensureOutfit();
  var it = id ? findOutfitItem(id) : null;
  var name = it ? it.name : "";
  var category = it ? it.category : OUTFIT_CATEGORIES[0];
  var color = it ? (it.color || "") : "";
  var note = it ? (it.note || "") : "";
  var seasons = it ? (it.season || []) : ["全季"];
  var styles = it ? (it.style || []) : ["休闲"];
  var image = it ? (it.image || "") : "";

  var catOpts = outfitCats().map(function (c) { return '<option value="' + c + '"' + (c === category ? ' selected' : '') + '>' + c + '</option>'; }).join('') +
    '<option value="__addcat__">➕ 自定义类别…</option>';
  var seasonChecks = OUTFIT_SEASONS.map(function (s) {
    return '<label class="chk"><input type="checkbox" name="season" value="' + s + '"' + (seasons.indexOf(s) >= 0 ? ' checked' : '') + '>' + s + '</label>';
  }).join('');
  var styleChecks = outfitStyles().map(function (s) {
    return '<label class="chk"><input type="checkbox" name="style" value="' + s + '"' + (styles.indexOf(s) >= 0 ? ' checked' : '') + '>' + s + '</label>';
  }).join('') + '<button type="button" class="btn btn-secondary" style="font-size:11px;padding:3px 8px;margin-top:4px" onclick="addOutfitStyle()">➕ 自定义风格</button>';

  showModal(
    '<div class="modal-title">' + (it ? '✏️ 编辑单品' : '＋ 添加单品') + '</div>' +
    '<form onsubmit="submitOutfitItem(event,\'' + (id || '') + '\')">' +
    '<div class="form-group"><div class="form-label">名称</div><input class="form-input" name="name" value="' + escapeHtml(name) + '" placeholder="如：白色真丝衬衫" required></div>' +
    '<div class="form-group"><div class="form-label">类别</div><select class="form-input" id="of-category" name="category" onchange="onOutfitItemCatChange()">' + catOpts + '</select></div>' +
    '<div class="form-group"><div class="form-label">颜色 / 材质</div><input class="form-input" name="color" value="' + escapeHtml(color) + '" placeholder="如：米白 / 羊毛"></div>' +
    '<div class="form-group"><div class="form-label">适合季节</div><div class="chk-row">' + seasonChecks + '</div></div>' +
    '<div class="form-group"><div class="form-label">风格标签</div><div class="chk-row style-checks">' + styleChecks + '</div></div>' +
    '<div class="form-group"><div class="form-label">白底图（自动压缩）</div>' +
    '<input type="file" id="of-file" accept="image/*" style="display:none" onchange="handleOutfitItemImage(this)">' +
    '<div id="of-img-preview" onclick="document.getElementById(\'of-file\').click()" style="cursor:pointer">' +
    (image ? '<img src="' + image + '" style="max-width:100%;max-height:140px;border-radius:8px"><div style="font-size:11px;color:var(--text-secondary);margin-top:4px">点击更换</div>' : '<div class="of-img-drop">📷 点击上传白底图</div>') +
    '</div><input type="hidden" id="of-image" value="' + (image ? image : '') + '"></div>' +
    '<div class="form-group"><div class="form-label">备注</div><textarea class="form-textarea" name="note" rows="2" placeholder="版型、搭配建议…">' + escapeHtml(note) + '</textarea></div>' +
    '<div class="btn-row">' +
      (it ? '<button type="button" class="btn btn-secondary" style="color:var(--accent-red)" onclick="deleteOutfitItem(\'' + it.id + '\')">删除</button>' : '') +
      '<button type="button" class="btn btn-secondary" onclick="closeModal()">取消</button><button type="submit" class="btn btn-primary">保存</button></div>' +
    '</form>'
  );
}
function handleOutfitItemImage(input) {
  var file = input.files[0];
  if (!file) return;
  if (file.size > 4 * 1024 * 1024) { alert("图片请控制在 4MB 以内"); return; }
  compressImage(file).then(function (dataUrl) {
    var hidden = document.getElementById("of-image");
    var prev = document.getElementById("of-img-preview");
    if (hidden) hidden.value = dataUrl;
    if (prev) prev.innerHTML = '<img src="' + dataUrl + '" style="max-width:100%;max-height:140px;border-radius:8px"><div style="font-size:11px;color:var(--text-secondary);margin-top:4px">点击更换</div>';
  }).catch(function () { alert("图片处理失败"); });
}
function submitOutfitItem(event, id) {
  event.preventDefault();
  var fd = new FormData(event.target);
  var data = Object.fromEntries(fd);
  if (!data.name || !data.name.trim()) { alert("请填写单品名称"); return; }
  var seasons = fd.getAll("season");
  var styles = fd.getAll("style");
  var image = (document.getElementById("of-image") || {}).value || "";
  var o = ensureOutfit();
  var warn = [];
  if (!seasons.length) warn.push("未选季节");
  if (!styles.length) warn.push("未选风格");
  if (!image) warn.push("未传白底图");

  if (id) {
    var it = findOutfitItem(id);
    if (it) Object.assign(it, { name: data.name.trim(), category: data.category, color: data.color || "", season: seasons, style: styles, image: image, note: data.note || "" });
  } else {
    o.wardrobe.unshift({
      id: uid(), name: data.name.trim(), category: data.category, color: data.color || "",
      season: seasons, style: styles, image: image, note: data.note || "",
      wearCount: 1, wears: [today()], lastWorn: today(), addedDate: today()
    });
  }
  DB.save();
  closeModal();
  showToast(warn.length ? ("已保存（标签复核：" + warn.join("、") + "，建议后续补全）") : "单品已保存 👕");
  render();
}
var _outfitDeleteId = null;
function deleteOutfitItem(id) {
  var it = findOutfitItem(id);
  if (!it) return;
  _outfitDeleteId = id;
  showConfirmDialog(
    "🗑️",
    "删除单品",
    "确定删除「" + escapeHtml(it.name) + "」？相关搭配中的引用将保留但显示为缺失。",
    [
      { text: "取消", cls: "btn-secondary", action: function() { closeModal(); } },
      { text: "删除", cls: "btn-primary", style: "background:var(--accent-red);color:white", action: function() { closeModal(); confirmDeleteOutfitItem(); } }
    ]
  );
}
function confirmDeleteOutfitItem() {
  try {
    var o = ensureOutfit();
    var id = _outfitDeleteId;
    _outfitDeleteId = null;
    if (!id) return;
    o.wardrobe = (o.wardrobe || []).filter(function (x) { return x.id !== id; });
    addTomb("growth.outfit.wardrobe", id); // 记录墓碑，使删除能跨端生效（不被旧云端快照还原）
    // 同步清理搭配库 / 一衣多穿 / 旅行计划里对该单品的悬空引用
    (o.outfits || []).forEach(function (of) {
      if (of.itemIds) of.itemIds = of.itemIds.filter(function (x) { return x !== id; });
      if (of.items) of.items = of.items.filter(function (x) { return x !== id; });
    });
    (o.trips || []).forEach(function (t) {
      (t.plan || []).forEach(function (d) {
        if (d.items) d.items = d.items.filter(function (x) { return x !== id; });
      });
    });
    DB.save();
    render();
    showToast("已删除 👕");
  } catch (e) {
    console.error("[outfit] delete failed", e);
    showToast("删除失败：" + (e && e.message ? e.message : e), "error");
  }
}

// ============================================================
// ③ 成套搭配创作库
// ============================================================
function renderOutfitLibrary(c) {
  var o = ensureOutfit();
  c.innerHTML +=
    '<div class="section-title"><span class="emoji">🧩</span> 搭配创作库 <span style="margin-left:auto;font-size:13px;color:var(--text-secondary)">' + o.outfits.length + ' 套</span></div>' +
    '<div style="display:flex;gap:8px;margin-bottom:12px">' +
    '<button class="btn btn-primary" style="flex:1;justify-content:center;gap:6px" onclick="showOutfitComposeModal()">＋ 创建搭配</button>' +
    '<button class="btn btn-secondary" style="flex:1;justify-content:center;gap:6px" onclick="showOneItemWaysModal()">✨ 一衣多穿</button>' +
    '</div>';

  if (!o.outfits.length) {
    c.innerHTML += '<div class="empty-state"><div class="empty-icon">🧩</div><div class="empty-text">还没有保存的搭配<br>从今日推荐「存为搭配」，或手动创建</div></div>';
    return;
  }
  c.innerHTML += o.outfits.map(function (of) {
    var items = (of.itemIds || []).map(findOutfitItem).filter(Boolean);
    var miss = (of.itemIds || []).length - items.length;
    var thumbs = items.map(function (it) { return '<div class="lib-thumb">' + outfitItemThumb(it, 44) + '</div>'; }).join('');
    return '<div class="lib-card">' +
      '<div class="lib-head"><span class="badge badge-purple">' + escapeHtml(of.occasion) + '</span><span class="badge badge-blue">' + escapeHtml(of.style) + '</span>' +
      '<span style="margin-left:auto;font-size:12px;color:var(--text-secondary)">👕 ' + (of.wearLog ? of.wearLog.length : 0) + ' 次</span></div>' +
      '<div class="lib-name">' + escapeHtml(of.name) + '</div>' +
      '<div class="lib-thumbs">' + thumbs + (miss ? '<div class="lib-miss">+' + miss + ' 缺失</div>' : '') + '</div>' +
      (of.copy ? '<div class="lib-copy">“' + escapeHtml(of.copy) + '”</div>' : '') +
      '<div class="lib-actions">' +
      '<button class="btn btn-secondary" style="flex:1;padding:7px;font-size:12px" onclick="logWear(' + JSON.stringify(of.itemIds || []) + ',\'' + of.id + '\')">✅ 标记已穿</button>' +
      '<button class="btn btn-secondary" style="flex:1;padding:7px;font-size:12px" onclick="showOutfitComposeModal(\'' + of.id + '\')">✏️</button>' +
      '<button class="btn btn-secondary" style="flex:1;padding:7px;font-size:12px;color:var(--accent-red)" onclick="deleteOutfit(\'' + of.id + '\')">🗑</button>' +
      '</div></div>';
  }).join('');
}
function showOutfitComposeModal(id) {
  var o = ensureOutfit();
  var of = id ? findOutfit(id) : null;
  var name = of ? of.name : "";
  var occasion = of ? of.occasion : "通勤";
  var style = of ? of.style : "通勤";
  var copy = of ? of.copy : "";
  var selIds = of ? (of.itemIds || []) : [];

  var groups = OUTFIT_CATEGORIES.map(function (cat) {
    var items = o.wardrobe.filter(function (it) { return it.category === cat; });
    if (!items.length) return '';
    var checks = items.map(function (it) {
      var checked = selIds.indexOf(it.id) >= 0 ? ' checked' : '';
      return '<label class="chk"><input type="checkbox" name="item" value="' + it.id + '"' + checked + '>' + escapeHtml(it.name) + '</label>';
    }).join('');
    return '<div class="compose-group"><div class="cg-title">' + catEmoji(cat) + ' ' + cat + '</div><div class="chk-row">' + checks + '</div></div>';
  }).join('');

  showModal(
    '<div class="modal-title">' + (of ? '✏️ 编辑搭配' : '＋ 创建搭配') + '</div>' +
    '<form onsubmit="submitOutfitCompose(event,\'' + (id || '') + '\')">' +
    '<div class="form-group"><div class="form-label">搭配名称</div><input class="form-input" name="name" value="' + escapeHtml(name) + '" placeholder="如：周三通勤蓝调"></div>' +
    '<div class="form-group"><div class="form-label">场合</div><select class="form-input" name="occasion">' + ["通勤", "休闲", "气质"].map(function (s) { return '<option value="' + s + '"' + (s === occasion ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></div>' +
    '<div class="form-group"><div class="form-label">风格</div><select class="form-input" name="style">' + outfitStyles().map(function (s) { return '<option value="' + s + '"' + (s === style ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></div>' +
    '<div class="form-group"><div class="form-label">包含单品</div>' + (groups || '<div style="font-size:13px;color:var(--text-secondary)">衣橱暂无单品，请先去「衣橱」添加</div>') + '</div>' +
    '<div class="form-group"><div class="form-label">穿搭文案</div><textarea class="form-textarea" name="copy" rows="3" placeholder="高级穿搭文案，适合发朋友圈">' + escapeHtml(copy) + '</textarea></div>' +
    '<div class="btn-row">' +
    (groups ? '<button type="button" class="btn btn-secondary" onclick="autoGenComposeCopy()">✨ 生成文案</button>' : '') +
    '<button type="button" class="btn btn-secondary" onclick="closeModal()">取消</button>' +
    '<button type="submit" class="btn btn-primary">保存</button></div>' +
    '</form>'
  );
}
function autoGenComposeCopy() {
  var fd = new FormData(document.querySelector("#modal-overlay form"));
  var occasion = fd.get("occasion") || "通勤";
  var ids = fd.getAll("item");
  var items = ids.map(findOutfitItem).filter(Boolean);
  if (!items.length) { showToast("请先勾选单品"); return; }
  var copy = generateOutfitCopy(occasion, items);
  var ta = document.querySelector("#modal-overlay textarea[name=copy]");
  if (ta) ta.value = copy;
}
function submitOutfitCompose(event, id) {
  event.preventDefault();
  var fd = new FormData(event.target);
  var data = Object.fromEntries(fd);
  var itemIds = fd.getAll("item");
  if (!itemIds.length) { alert("请至少选择一件单品"); return; }
  var o = ensureOutfit();
  if (id) {
    var of = findOutfit(id);
    if (of) Object.assign(of, { name: data.name || "未命名搭配", occasion: data.occasion, style: data.style, itemIds: itemIds, copy: data.copy || "" });
  } else {
    o.outfits.unshift({
      id: uid(), name: data.name || "未命名搭配", occasion: data.occasion, style: data.style,
      itemIds: itemIds, copy: data.copy || "", createdAt: today(), wearLog: []
    });
  }
  DB.save();
  closeModal();
  showToast("搭配已保存 🧩");
  render();
}
function deleteOutfit(id) {
  if (!confirm("确定删除该搭配？")) return;
  var o = ensureOutfit();
  o.outfits = o.outfits.filter(function (x) { return x.id !== id; });
  // 清理日程中引用
  Object.keys(o.plan).forEach(function (d) { if (o.plan[d] === id) delete o.plan[d]; });
  DB.save();
  render();
}

// 一衣多穿
function showOneItemWaysModal() {
  var o = ensureOutfit();
  var bases = o.wardrobe.filter(function (it) { return ["上装", "连衣裙", "外套"].indexOf(it.category) >= 0; });
  if (!bases.length) { showToast("请先添加上装 / 连衣裙 / 外套"); return; }
  var opts = bases.map(function (it) { return '<option value="' + it.id + '">' + escapeHtml(it.name) + '（' + it.category + '）</option>'; }).join('');
  var def = bases[0].id;
  showModal(
    '<div class="modal-title">✨ 一衣多穿</div>' +
    '<div class="form-group"><div class="form-label">选择基础单品</div><select class="form-input" id="oiw-base" onchange="renderOneItemWays()">' + opts + '</select></div>' +
    '<div id="oiw-list"></div>'
  );
  renderOneItemWays();
}
function renderOneItemWays() {
  var sel = document.getElementById("oiw-base");
  if (!sel) return;
  var base = findOutfitItem(sel.value);
  var box = document.getElementById("oiw-list");
  if (!base || !box) return;
  var o = ensureOutfit();
  var styles = ["通勤", "休闲", "气质"];
  var w = activeWeather(o);
  var band = w ? outfitTempBand(w.temp) : "凉爽";
  var needOuter = (band === "冷" || band === "寒冷" || band === "凉爽");
  var html = '';
  styles.forEach(function (style) {
    var items = [base];
    var bottom = pickFrom(o.wardrobe.filter(function (it) { return it.category === "下装"; }), style, style.length + 3);
    var shoes = pickFrom(o.wardrobe.filter(function (it) { return it.category === "鞋履"; }), style, style.length + 5);
    var outer = needOuter ? pickFrom(o.wardrobe.filter(function (it) { return it.category === "外套"; }), style, style.length + 7) : null;
    var acc = pickFrom(o.wardrobe.filter(function (it) { return it.category === "配饰"; }), style, style.length + 9);
    if (bottom) items.push(bottom);
    if (outer) items.push(outer);
    if (shoes) items.push(shoes);
    if (acc) items.push(acc);
    var copy = generateOutfitCopy(style, items);
    var ids = items.map(function (it) { return it.id; }).join(',');
    html +=
      '<div class="oiw-card">' +
      '<div class="oiw-head">' + style + ' 穿法</div>' +
      '<div class="oiw-thumbs">' + items.map(function (it) { return outfitItemThumb(it, 40); }).join('') + '</div>' +
      '<div class="oiw-copy">“' + escapeHtml(copy) + '”</div>' +
      '<button class="btn btn-secondary" style="width:100%;padding:7px;font-size:12px" onclick="saveRecAsOutfit(\'' + ids + '\',\'' + style + '\')">💾 存为搭配</button>' +
      '</div>';
  });
  box.innerHTML = html;
}

// ============================================================
// ④ 穿搭日程规划
// ============================================================
function mondayOf(offsetWeeks) {
  var d = new Date();
  var day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day + (offsetWeeks || 0) * 7);
  return d.toISOString().slice(0, 10);
}
function shiftOutfitWeek(delta) { outfitWeekOffset += delta; render(); }
function renderOutfitSchedule(c) {
  var o = ensureOutfit();
  var mon = mondayOf(outfitWeekOffset);
  var days = [];
  for (var i = 0; i < 7; i++) {
    var d = new Date(mon); d.setDate(d.getDate() + i);
    days.push(d.toISOString().slice(0, 10));
  }
  var labels = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

  // 重复度检测
  var outfitUse = {}, itemUse = {};
  days.forEach(function (date) {
    var oid = o.plan[date];
    if (!oid) return;
    outfitUse[oid] = (outfitUse[oid] || 0) + 1;
    var of = findOutfit(oid);
    if (of) (of.itemIds || []).forEach(function (id) {
      var it = findOutfitItem(id);
      if (it && it.category !== "配饰") itemUse[id] = (itemUse[id] || 0) + 1;
    });
  });
  var warn = [];
  Object.keys(outfitUse).forEach(function (oid) {
    if (outfitUse[oid] > 1) { var of = findOutfit(oid); warn.push("「" + (of ? of.name : "搭配") + "」本周已排 " + outfitUse[oid] + " 次，建议错开"); }
  });
  Object.keys(itemUse).forEach(function (id) {
    if (itemUse[id] >= 4) { var it = findOutfitItem(id); warn.push("「" + (it ? it.name : "单品") + "」本周出现 " + itemUse[id] + " 次，建议轮换"); }
  });

  c.innerHTML +=
    '<div class="schedule-nav">' +
    '<div class="date-arrow" onclick="shiftOutfitWeek(-1)">◀</div>' +
    '<div class="date-display">本周（' + mon + ' 起）</div>' +
    '<div class="date-arrow" onclick="shiftOutfitWeek(1)">▶</div>' +
    '</div>' +
    (warn.length ? '<div class="schedule-warn">⚠️ ' + warn.join('；') + '</div>' : '');

  c.innerHTML += '<div class="schedule-grid">';
  days.forEach(function (date, i) {
    var oid = o.plan[date];
    var of = oid ? findOutfit(oid) : null;
    var weekend = i >= 5;
    var suggest = weekend ? "建议休闲 / 气质风" : "建议通勤风";
    var inner = of
      ? '<div class="sd-occ">' + escapeHtml(of.occasion) + '</div><div class="sd-thumbs">' + (of.itemIds || []).map(findOutfitItem).filter(Boolean).slice(0, 4).map(function (it) { return outfitItemThumb(it, 28); }).join('') + '</div><div class="sd-name">' + escapeHtml(of.name) + '</div>'
      : '<div class="sd-empty">＋<div class="sd-suggest">' + suggest + '</div></div>';
    c.innerHTML +=
      '<div class="sched-day' + (weekend ? ' weekend' : '') + (of ? ' filled' : '') + '" onclick="showSchedulePick(\'' + date + '\')">' +
      '<div class="sd-label">' + labels[i] + (date === today() ? ' ·今' : '') + '</div>' + inner + '</div>';
  });
  c.innerHTML += '</div>';

  if (!o.outfits.length) {
    c.innerHTML += '<div class="empty-state" style="margin-top:14px"><div class="empty-icon">📅</div><div class="empty-text">先在「搭配库」保存几套搭配，<br>才能排布每周穿搭</div></div>';
  }
}
function showSchedulePick(date) {
  var o = ensureOutfit();
  if (!o.outfits.length) { showToast("请先到搭配库保存搭配"); return; }
  var cur = o.plan[date];
  var opts = '<div class="sched-pick-none" onclick="setScheduleOutfit(\'' + date + '\',\'\')">🚫 不安排</div>' +
    o.outfits.map(function (of) {
      return '<div class="sched-pick' + (cur === of.id ? ' sel' : '') + '" onclick="setScheduleOutfit(\'' + date + '\',\'' + of.id + '\')"><span class="badge badge-purple">' + escapeHtml(of.occasion) + '</span> ' + escapeHtml(of.name) + '</div>';
    }).join('');
  showModal(
    '<div class="modal-title">📅 ' + date + ' 穿什么</div>' +
    '<div class="sched-pick-list">' + opts + '</div>' +
    '<div class="btn-row"><button class="btn btn-secondary" onclick="closeModal()">关闭</button></div>'
  );
}
function setScheduleOutfit(date, oid) {
  var o = ensureOutfit();
  if (oid) o.plan[date] = oid; else delete o.plan[date];
  DB.save();
  closeModal();
  render();
}

// ============================================================
// ⑤ 周 / 月穿搭复盘报告
// ============================================================
function renderOutfitReport(c) {
  var o = ensureOutfit();
  c.innerHTML +=
    '<div class="filter-bar" style="margin-bottom:12px">' +
    '<div class="chip' + (outfitReportRange === "week" ? ' active' : '') + '" onclick="setOutfitReportRange(\'week\')">本周</div>' +
    '<div class="chip' + (outfitReportRange === "month" ? ' active' : '') + '" onclick="setOutfitReportRange(\'month\')">本月</div>' +
    '</div>';

  if (outfitReportRange === "week") renderWeekReport(c, o);
  else renderMonthReport(c, o);
}
function setOutfitReportRange(r) { outfitReportRange = r; render(); }

function renderWeekReport(c, o) {
  var days = 7;
  var wore = o.wardrobe.map(function (it) { return { it: it, n: wearsInRange(it.wears, days) }; }).filter(function (x) { return x.n > 0; }).sort(function (a, b) { return b.n - a.n; });
  var wornOutfits = o.outfits.map(function (of) { return { of: of, n: wearsInRange(of.wearLog, days) }; }).filter(function (x) { return x.n > 0; }).sort(function (a, b) { return b.n - a.n; });
  var idle = o.wardrobe.filter(function (it) { return wearsInRange(it.wears, o.settings.idleDays || 30) === 0; });

  // 风格占比
  var styleCount = {};
  o.wardrobe.forEach(function (it) { if (wearsInRange(it.wears, days) > 0) (it.style || []).forEach(function (s) { styleCount[s] = (styleCount[s] || 0) + 1; }); });
  var total = Object.keys(styleCount).reduce(function (a, k) { return a + styleCount[k]; }, 0);
  var styleBars = Object.keys(styleCount).sort(function (a, b) { return styleCount[b] - styleCount[a]; }).map(function (s) {
    var pct = total ? Math.round(styleCount[s] / total * 100) : 0;
    return '<div class="report-bar"><span class="rb-label">' + s + '</span><div class="rb-track"><div class="rb-fill" style="width:' + pct + '%"></div></div><span class="rb-val">' + pct + '%</span></div>';
  }).join('') || '<div class="card-body" style="text-align:center;color:var(--text-secondary)">本周暂无穿着记录</div>';

  // 优化建议
  var tips = [];
  if (total) {
    var topStyle = Object.keys(styleCount).sort(function (a, b) { return styleCount[b] - styleCount[a]; })[0];
    var topPct = Math.round(styleCount[topStyle] / total * 100);
    if (topPct >= 60) tips.push("风格偏单一（" + topStyle + " 占 " + topPct + "%），建议本周加入「" + (OUTFIT_STYLES.filter(function (s) { return s !== topStyle; })[0] || "其它") + "」元素，提升层次感。");
    if (styleCount["气质"] == null) tips.push("本周未尝试「气质」风，可安排一次约会 / 晚餐造型。");
  }
  wore.forEach(function (x) { if (x.n >= 5) tips.push("「" + x.it.name + "」一周穿了 " + x.n + " 次，频率偏高，建议轮换其他单品。"); });
  if (!wore.length) tips.push("本周还没有穿搭记录，去「今日穿搭」标记已穿，数据会更准。");

  c.innerHTML +=
    '<div class="section-title"><span class="emoji">📊</span> 本周穿搭复盘</div>' +
    '<div class="report-cards">' +
    reportStatCard("👕", wore.length, "高频单品") +
    reportStatCard("🧩", wornOutfits.length, "使用搭配") +
    reportStatCard("🧹", idle.length, "闲置单品") +
    '</div>' +
    '<div class="section-title">🔥 高频穿搭</div>' +
    (wornOutfits.length ? '<div class="card">' + wornOutfits.slice(0, 5).map(function (x) {
      return '<div class="report-row"><span>' + escapeHtml(x.of.name) + '</span><span class="rb-val">' + x.n + ' 次</span></div>';
    }).join('') + '</div>' : '<div class="card"><div class="card-body" style="text-align:center;color:var(--text-secondary)">本周还没标记穿搭</div></div>') +
    '<div class="section-title">🎨 风格占比</div>' +
    '<div class="card">' + styleBars + '</div>' +
    '<div class="section-title">🧹 闲置提示</div>' +
    (idle.length ? '<div class="card">' + idle.slice(0, 6).map(function (it) {
      return '<div class="report-row"><span>' + escapeHtml(it.name) + '</span><span class="rb-val" style="color:var(--text-tertiary)">近' + (o.settings.idleDays || 30) + '天未穿</span></div>';
    }).join('') + '</div>' : '<div class="card"><div class="card-body" style="text-align:center;color:var(--text-secondary)">没有长期闲置单品，棒 👍</div></div>') +
    '<div class="section-title">💡 单调点优化</div>' +
    '<div class="card"><div class="card-body">' + (tips.length ? tips.map(function (t) { return '<div style="margin-bottom:6px">• ' + escapeHtml(t) + '</div>'; }).join('') : '搭配丰富，保持住 ✨') + '</div></div>';
}
function reportStatCard(icon, val, label) {
  return '<div class="report-stat"><div class="rs-icon">' + icon + '</div><div class="rs-val">' + val + '</div><div class="rs-label">' + label + '</div></div>';
}

function renderMonthReport(c, o) {
  var days = 30;
  var dNow = new Date();
  var monthPrefix = dNow.getFullYear() + "-" + ("0" + (dNow.getMonth() + 1)).slice(-2);
  var monthCount = (o.wearPhotos || []).filter(function (p) { return (p.date || "").indexOf(monthPrefix) === 0; }).length;
  var idle = o.wardrobe.filter(function (it) { return wearsInRange(it.wears, days) === 0; });
  // 添置建议：类别数量不足
  var catCount = {};
  o.wardrobe.forEach(function (it) { catCount[it.category] = (catCount[it.category] || 0) + 1; });
  var addSugg = OUTFIT_CATEGORIES.filter(function (cat) { return (catCount[cat] || 0) < 2; })
    .map(function (cat) { return "「" + cat + "」仅 " + (catCount[cat] || 0) + " 件，建议补充基础款 / 当季流行色"; });
  // 季节覆盖
  var seasonCount = {};
  o.wardrobe.forEach(function (it) { (it.season || []).forEach(function (s) { if (s !== "全季") seasonCount[s] = (seasonCount[s] || 0) + 1; }); });
  var seasonSugg = ["春", "夏", "秋", "冬"].filter(function (s) { return (seasonCount[s] || 0) < 3; })
    .map(function (s) { return s + "季单品偏少（" + (seasonCount[s] || 0) + " 件）"; });

  c.innerHTML +=
    '<div class="section-title"><span class="emoji">📈</span> 本月衣橱报告</div>' +
    '<div class="report-cards">' +
    reportStatCard("👕", o.wardrobe.length, "衣橱总数") +
    reportStatCard("🧩", o.outfits.length, "搭配数") +
    reportStatCard("🧹", idle.length, "待断舍离") +
    '</div>' +
    '<div class="section-title">🧹 衣橱精简（断舍离）</div>' +
    (idle.length ? '<div class="card">' + idle.slice(0, 10).map(function (it) {
      return '<div class="report-row"><span>' + outfitItemThumb(it, 30) + ' ' + escapeHtml(it.name) + '</span><span class="rb-val" style="color:var(--text-tertiary)">近30天 0 穿</span></div>';
    }).join('') + '<div class="discard-tip">可捐赠 / 转卖 / 回收，释放衣橱空间与决策精力。</div></div>'
      : '<div class="card"><div class="card-body" style="text-align:center;color:var(--text-secondary)">近 30 天单品都有穿着，衣橱很健康 👍</div></div>') +
    '<div class="section-title">📸 本月实拍回顾（' + monthCount + ' 张）</div>' +
    outfitPhotoMonthHtml(o, monthPrefix) +
    '<div class="section-title">🛍️ 添置建议</div>' +
    '<div class="card"><div class="card-body">' +
    (addSugg.concat(seasonSugg).length ? addSugg.concat(seasonSugg).map(function (t) { return '<div style="margin-bottom:6px">• ' + escapeHtml(t) + '</div>'; }).join('') : '各品类覆盖均衡，按需补当季流行款即可 ✨') +
    '</div></div>';
}

// ============================================================
// ⑥ 描述需求，一键自动搭配
// ============================================================
function describeBoxHtml(w) {
  var o = ensureOutfit();
  var hint = (!o.wardrobe.length) ? '<div style="font-size:12px;color:var(--text-tertiary);margin-top:6px">衣橱还空着，先去「衣橱」加几件单品，描述搭配才有效～</div>' : '';
  return '<div class="of-describe">' +
    '<div class="of-desc-title">💬 描述需求，一键搭配</div>' +
    '<div style="display:flex;gap:6px">' +
    '<input id="of-desc-input" class="form-input" placeholder="如：周末爬山想要舒服的运动风 / 明晚约会穿优雅一点" style="flex:1;min-width:0">' +
    '<button class="btn btn-primary" style="padding:8px 12px;white-space:nowrap" onclick="runDescribeMatch()">✨ 搭配</button>' +
    '</div>' + hint +
    '<div id="of-desc-result"></div>' +
    '</div>';
}
function runDescribeMatch() {
  var input = document.getElementById("of-desc-input");
  if (!input) return;
  var text = input.value.trim();
  if (!text) { showToast("先描述一下你的需求吧"); return; }
  var o = ensureOutfit();
  if (!o.wardrobe.length) { showToast("衣橱还是空的，先去加单品"); return; }
  var intent = parseDescribeIntent(text);
  var aw = activeWeather(o);
  var ww = {
    temp: intent.temp != null ? intent.temp : (aw ? aw.temp : 20),
    condition: intent.condition || (aw ? aw.condition : "晴"),
    date: today()
  };
  var results = buildDescribeOutfits(intent, ww);
  var box = document.getElementById("of-desc-result");
  if (!box) return;
  if (!results.length) {
    // 完全没凑齐：直接给该场景的购入清单
    var _oc = Object.assign({}, OUTFIT_OCCASION_CFG[intent.occasion] || OUTFIT_OCCASION_CFG["休闲"]);
    if (intent.style) _oc.style = intent.style;
    var _miss = assessOutfitGaps(_oc, ww);
    var _buy = buildPurchaseRecommendations(_oc, ww, _miss);
    box.innerHTML = '<div class="empty-state" style="padding:14px"><div class="empty-icon">🤔</div><div class="empty-text">衣橱里还没能凑齐「' + escapeHtml(intent.occasion) + '」场景的搭配，<br>建议优先购入以下单品：</div>' +
      (_buy.length ? '<div class="of-buy-tip" style="text-align:left">' + _buy.map(function (r) { return '<div class="obt-row"><span class="obt-cat">' + escapeHtml(r.cat) + '</span><span class="obt-text">' + escapeHtml(r.text) + '</span></div>'; }).join('') + '</div>' : '') +
      '<div style="margin-top:10px"><button class="btn btn-primary" onclick="setOutfitTab(\'wardrobe\')">➕ 去衣橱添加单品</button></div></div>';
    return;
  }
  box.innerHTML = results.map(function (rec) {
    var itemsHtml = rec.items.map(function (it) {
      return '<div class="rec-item"><div class="ri-thumb">' + outfitItemThumb(it, 48) + '</div><div class="ri-name">' + escapeHtml(it.name) + '</div><div class="ri-cat">' + it.category + '</div></div>';
    }).join('');
    var ids = rec.items.map(function (it) { return it.id; }).join(',');
    return '<div class="outfit-rec">' +
      '<div class="or-head"><span class="or-occ">' + rec.occasion + '</span><span class="or-scene">' + rec.scene + '</span></div>' +
      '<div class="or-items">' + itemsHtml + '</div>' +
      '<div class="or-reason"><b>推荐理由：</b>' + escapeHtml(rec.reasoning) + '</div>' +
      '<div class="or-copy">“' + escapeHtml(rec.copy) + '”</div>' +
      (rec.missing && rec.missing.length ? '<div class="or-gap-tag">⚠️ 衣橱缺：' + rec.missing.join("、") + '</div>' : '') +
      purchaseBlockHtml(rec) +
      '<div class="or-actions">' +
      '<button class="btn btn-primary" style="flex:1;padding:8px;font-size:13px" onclick="logWearFromIds(\'' + ids + '\')">✅ 标记已穿</button>' +
      '<button class="btn btn-secondary" style="flex:1;padding:8px;font-size:13px" onclick="saveRecAsOutfit(\'' + ids + '\',\'' + rec.occasion + '\')">💾 存为搭配</button>' +
      '</div></div>';
  }).join('');
}
function parseDescribeIntent(text) {
  var occasion = "休闲";
  if (/通勤|上班|开会|工作|会议|office|出差/.test(text)) occasion = "通勤";
  else if (/约会|聚会|晚餐|晚宴|正式|重要场合|见家长|面试/.test(text)) occasion = "气质";
  else if (/休闲|周末|逛街|在家|放松|旅游|旅行|度假/.test(text)) occasion = "休闲";
  var stylePref = null;
  if (/气质|优雅|温柔|知性|女神/.test(text)) stylePref = "气质";
  else if (/运动|爬山|跑步|健身|徒步|户外|瑜伽|打球/.test(text)) stylePref = "运动";
  else if (/甜美|可爱|少女|软妹/.test(text)) stylePref = "甜美";
  else if (/酷|帅气|中性|街头|工装/.test(text)) stylePref = "酷飒";
  else if (/复古|文艺|港风/.test(text)) stylePref = "复古";
  else if (/通勤|干练|职业/.test(text)) stylePref = "通勤";
  var band = null;
  if (/炎热|酷热|好热|超热|盛夏|夏天|夏日/.test(text)) band = "炎热";
  else if (/寒冷|严寒|好冷|超冷|寒冬|冰天|暴雪/.test(text)) band = "寒冷";
  else if (/冷|凉|深秋|初冬|降温/.test(text)) band = "冷";
  else if (/温暖|舒适|春天|初夏|不冷不热/.test(text)) band = "温暖";
  else if (/凉爽|秋天|秋季|微凉/.test(text)) band = "凉爽";
  var condition = null;
  if (/雨/.test(text)) condition = "小雨";
  else if (/雪/.test(text)) condition = "雪";
  else if (/风/.test(text)) condition = "阴";
  else if (/晴|太阳/.test(text)) condition = "晴";
  var bandTemp = { "炎热": 32, "温暖": 24, "凉爽": 17, "冷": 10, "寒冷": 2 }[band];
  return { occasion: occasion, style: stylePref, temp: bandTemp != null ? bandTemp : null, condition: condition };
}
function buildDescribeOutfits(intent, ww) {
  var o = ensureOutfit();
  if (!o.wardrobe.length) return [];
  var seed = (intent.occasion.length * 7 + (intent.style ? intent.style.length * 3 : 0) + (ww.temp || 20));
  var conf = Object.assign({}, OUTFIT_OCCASION_CFG[intent.occasion] || OUTFIT_OCCASION_CFG["休闲"]);
  if (intent.style) conf.style = intent.style;
  var main = buildOutfit(conf, ww, seed);
  var res = [];
  if (main && main.items.length) res.push(main);
  if (res.length) {
    var altStyle = outfitStyles().filter(function (s) { return s !== conf.style; })[0];
    if (altStyle) {
      var conf2 = Object.assign({}, OUTFIT_OCCASION_CFG[intent.occasion] || OUTFIT_OCCASION_CFG["休闲"]);
      conf2.style = altStyle;
      var alt = buildOutfit(conf2, ww, seed + 13);
      if (alt && alt.items.length && alt.items.map(function (x) { return x.id; }).join() !== main.items.map(function (x) { return x.id; }).join()) res.push(alt);
    }
  }
  return res;
}

// ============================================================
// ⑦ 旅行穿搭规划（按目的地天气生成多日穿搭）
// ============================================================
function renderOutfitTravel(c) {
  var o = ensureOutfit();
  var todayStr = today();
  c.innerHTML +=
    '<div class="section-title"><span class="emoji">✈️</span> 旅行穿搭规划</div>' +
    '<div class="travel-form">' +
    '<div class="form-group"><div class="form-label">目的地（自动识别天气）</div><input class="form-input" id="tr-dest" placeholder="如：东京 / 三亚 / 巴黎"></div>' +
    '<div style="display:flex;gap:8px">' +
    '<div class="form-group" style="flex:1"><div class="form-label">出发日期</div><input class="form-input" id="tr-start" type="date" value="' + todayStr + '"></div>' +
    '<div class="form-group" style="width:90px"><div class="form-label">天数</div><input class="form-input" id="tr-days" type="number" min="1" max="14" value="3"></div>' +
    '</div>' +
    '<div class="form-group"><div class="form-label">偏好风格</div><select class="form-input" id="tr-pref">' +
    ["休闲", "通勤", "气质", "运动"].map(function (s) { return '<option value="' + s + '">' + s + '</option>'; }).join('') +
    '</select></div>' +
    '<button class="btn btn-primary" style="width:100%;justify-content:center;gap:6px" onclick="generateTripOutfits()">✨ 按天气生成旅行穿搭</button>' +
    '</div>' +
    '<div id="tr-result"></div>';
  if (o.trips && o.trips.length) {
    c.innerHTML += '<div class="section-title" style="margin-top:16px">📁 我的旅行计划</div>' + o.trips.map(function (t) { return tripCardHtml(t, false); }).join('');
  }
}
async function generateTripOutfits() {
  var destEl = document.getElementById("tr-dest");
  var startEl = document.getElementById("tr-start");
  var daysEl = document.getElementById("tr-days");
  var prefEl = document.getElementById("tr-pref");
  if (!destEl || !destEl.value.trim()) { showToast("请填写目的地"); return; }
  var dest = destEl.value.trim();
  var start = startEl ? startEl.value : today();
  var days = Math.max(1, Math.min(14, parseInt(daysEl ? daysEl.value : "3", 10) || 3));
  var pref = prefEl ? prefEl.value : "休闲";
  var box = document.getElementById("tr-result");
  if (box) box.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:10px">🔄 正在识别目的地与天气…</div>';
  try {
    var geo = await geoCodeCity(dest);
    if (!geo) {
      if (box) box.innerHTML = '<div class="empty-state"><div class="empty-icon">🌍</div><div class="empty-text">没找到「' + escapeHtml(dest) + '」的天气，<br>换个写法试试（如：东京）</div></div>';
      return;
    }
    var daily = await fetchTripForecast(geo.lat, geo.lon, days);
    var o = ensureOutfit();
    var plan = [];
    for (var i = 0; i < days; i++) {
      var dateStr = outfitAddDays(start, i);
      var tmax = daily.temperature_2m_max ? daily.temperature_2m_max[i] : null;
      var tmin = daily.temperature_2m_min ? daily.temperature_2m_min[i] : null;
      var code = daily.weather_code ? daily.weather_code[i] : null;
      var temp = (tmax != null && tmin != null) ? Math.round((tmax + tmin) / 2) : (tmax != null ? Math.round(tmax) : 20);
      var condition = conditionFromCode(code);
      var w = { temp: temp, condition: condition, date: dateStr };
      var rec = buildOutfitForIntent(pref, w, (i + 1) * 7 + pref.length);
      plan.push({ date: dateStr, temp: temp, condition: condition, items: rec ? rec.items.map(function (x) { return x.id; }) : [], reason: rec ? rec.reasoning : "", copy: rec ? rec.copy : "" });
    }
    var trip = { id: uid(), destination: dest, label: geo.label, lat: geo.lat, lon: geo.lon, start: start, days: days, pref: pref, plan: plan, createdAt: today() };
    o.trips.unshift(trip);
    DB.save();
    if (box) box.innerHTML = tripCardHtml(trip, true);
    showToast("已生成 " + days + " 套旅行穿搭 ✈️");
  } catch (e) {
    if (box) box.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-text">天气获取失败，检查网络后重试</div></div>';
  }
}
function buildOutfitForIntent(occasion, w, seed) {
  var base = OUTFIT_OCCASION_CFG[occasion] || OUTFIT_OCCASION_CFG["休闲"];
  return buildOutfit(base, w, seed);
}
function tripCardHtml(t, fresh) {
  var dayHtml = (t.plan || []).map(function (d) {
    var items = d.items.map(findOutfitItem).filter(Boolean);
    var thumbs = items.length ? items.map(function (it) { return outfitItemThumb(it, 40); }).join('') : '<span style="color:var(--text-tertiary);font-size:12px">无匹配单品</span>';
    var ids = items.map(function (it) { return it.id; }).join(',');
    return '<div class="trip-day">' +
      '<div class="td-head"><b>' + escapeHtml(d.date) + '</b> · ' + d.temp + '° ' + escapeHtml(d.condition) + '</div>' +
      '<div class="td-thumbs">' + thumbs + '</div>' +
      (d.reason ? '<div class="td-reason">' + escapeHtml(d.reason) + '</div>' : '') +
      (d.copy ? '<div class="td-copy">“' + escapeHtml(d.copy) + '”</div>' : '') +
      (ids ? '<div class="td-acts"><button class="btn btn-secondary" style="padding:5px 9px;font-size:11px" onclick="logWearFromIds(\'' + ids + '\')">✅ 标记已穿</button><button class="btn btn-secondary" style="padding:5px 9px;font-size:11px" onclick="saveRecAsOutfit(\'' + ids + '\',\'' + t.pref + '\')">💾 存搭配</button></div>' : '') +
      '</div>';
  }).join('');
  return '<div class="trip-card' + (fresh ? ' fresh' : '') + '">' +
    '<div class="trip-head"><div><div class="trip-dest">✈️ ' + escapeHtml(t.destination) + (t.label && t.label !== t.destination ? (' <span style="font-size:11px;color:var(--text-tertiary)">' + escapeHtml(t.label) + '</span>') : '') + '</div><div class="trip-sub">' + escapeHtml(t.start) + ' 起 · ' + t.days + ' 天 · ' + escapeHtml(t.pref) + '风</div></div>' +
    '<button class="mini-btn danger" onclick="deleteTrip(\'' + t.id + '\')">删除</button></div>' +
    dayHtml +
    '<button class="btn btn-primary" style="width:100%;justify-content:center;gap:6px;margin-top:8px" onclick="saveTripAll(\'' + t.id + '\')">📥 整套存入搭配库</button>' +
    '</div>';
}
function saveTripAll(id) {
  var o = ensureOutfit();
  var t = (o.trips || []).find(function (x) { return x.id === id; });
  if (!t) return;
  var added = 0;
  (t.plan || []).forEach(function (d) {
    if (d.items && d.items.length) {
      o.outfits.unshift({ id: uid(), name: t.destination + " " + d.date, occasion: t.pref, style: t.pref, itemIds: d.items, copy: d.copy || "", createdAt: today(), wearLog: [] });
      added++;
    }
  });
  DB.save();
  showToast("已存入 " + added + " 套搭配 🧩");
  render();
}
function deleteTrip(id) {
  if (!confirm("删除该旅行计划？")) return;
  var o = ensureOutfit();
  o.trips = (o.trips || []).filter(function (x) { return x.id !== id; });
  DB.save();
  render();
}
async function geoCodeCity(name) {
  var r = await fetch("https://geocoding-api.open-meteo.com/v1/search?name=" + encodeURIComponent(name) + "&count=1&language=zh&format=json");
  if (!r.ok) return null;
  var j = await r.json();
  if (j.results && j.results.length) {
    var g = j.results[0];
    return { lat: g.latitude, lon: g.longitude, label: (g.name || name) + (g.country ? (" · " + g.country) : "") + (g.admin1 ? (" " + g.admin1) : "") };
  }
  return null;
}
async function fetchTripForecast(lat, lon, days) {
  var url = "https://api.open-meteo.com/v1/forecast?latitude=" + lat + "&longitude=" + lon +
    "&daily=temperature_2m_max,temperature_2m_min,weather_code&forecast_days=" + Math.min(days, 16) + "&timezone=auto";
  var r = await fetch(url);
  if (!r.ok) throw new Error("http " + r.status);
  return await r.json();
}
function outfitAddDays(dateStr, n) {
  var d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// ============================================================
// 自定义类别 / 风格
// ============================================================
function onOutfitItemCatChange() {
  var sel = document.getElementById("of-category");
  if (!sel) return;
  if (sel.value === "__addcat__") {
    var name = prompt("新类别名称：");
    if (!name || !name.trim()) { sel.value = OUTFIT_CATEGORIES[0]; return; }
    name = name.trim();
    var o = ensureOutfit();
    if (OUTFIT_CATEGORIES.indexOf(name) >= 0 || (o.customCats || []).indexOf(name) >= 0) { showToast("已存在"); sel.value = name; return; }
    o.customCats = o.customCats || [];
    o.customCats.push(name);
    DB.save();
    var opt = document.createElement("option");
    opt.value = name; opt.textContent = name; opt.selected = true;
    sel.insertBefore(opt, sel.querySelector('option[value="__addcat__"]'));
    showToast("已添加类别：" + name);
  }
}
function addOutfitStyle() {
  var name = prompt("新风格名称：");
  if (!name || !name.trim()) return;
  name = name.trim();
  var o = ensureOutfit();
  if (OUTFIT_STYLES.indexOf(name) >= 0 || (o.customStyles || []).indexOf(name) >= 0) { showToast("已存在"); return; }
  o.customStyles = o.customStyles || [];
  o.customStyles.push(name);
  DB.save();
  var row = document.querySelector("#modal-overlay .style-checks");
  if (row) {
    var label = document.createElement("label");
    label.className = "chk";
    label.innerHTML = '<input type="checkbox" name="style" value="' + escapeHtml(name) + '" checked>' + escapeHtml(name);
    row.appendChild(label);
  }
  showToast("已添加风格：" + name);
}
function addOutfitCustom(type) {
  var name = prompt(type === "cat" ? "新类别名称：" : "新风格名称：");
  if (!name || !name.trim()) return;
  name = name.trim();
  var o = ensureOutfit();
  if (type === "cat") {
    if (OUTFIT_CATEGORIES.indexOf(name) >= 0 || (o.customCats || []).indexOf(name) >= 0) { showToast("已存在"); return; }
    o.customCats = o.customCats || [];
    if (o.customCats.indexOf(name) < 0) o.customCats.push(name);
  } else {
    if (OUTFIT_STYLES.indexOf(name) >= 0 || (o.customStyles || []).indexOf(name) >= 0) { showToast("已存在"); return; }
    o.customStyles = o.customStyles || [];
    if (o.customStyles.indexOf(name) < 0) o.customStyles.push(name);
  }
  DB.save();
  showOutfitSettings();
}
function removeOutfitCustom(type, idx) {
  var o = ensureOutfit();
  if (type === "cat") {
    if (!o.customCats || !o.customCats[idx]) return;
    var v = o.customCats[idx];
    if (!confirm("删除自定义类别「" + v + "」？")) return;
    o.customCats.splice(idx, 1);
  } else {
    if (!o.customStyles || !o.customStyles[idx]) return;
    var v2 = o.customStyles[idx];
    if (!confirm("删除自定义风格「" + v2 + "」？")) return;
    o.customStyles.splice(idx, 1);
  }
  DB.save();
  showOutfitSettings();
}
function customCatsStylesHtml(o) {
  var cats = o.customCats || [];
  var styles = o.customStyles || [];
  var catHtml = cats.length ? cats.map(function (c, i) { return '<span class="od-chip" onclick="removeOutfitCustom(\'cat\',' + i + ')">' + escapeHtml(c) + ' ✕</span>'; }).join(" ") : '<span style="font-size:12px;color:var(--text-tertiary)">暂无</span>';
  var styleHtml = styles.length ? styles.map(function (s, i) { return '<span class="od-chip" onclick="removeOutfitCustom(\'style\',' + i + ')">' + escapeHtml(s) + ' ✕</span>'; }).join(" ") : '<span style="font-size:12px;color:var(--text-tertiary)">暂无</span>';
  return '<div style="margin-bottom:6px">类别：' + catHtml + ' <button type="button" class="mini-btn" onclick="addOutfitCustom(\'cat\')">＋</button></div>' +
    '<div>风格：' + styleHtml + ' <button type="button" class="mini-btn" onclick="addOutfitCustom(\'style\')">＋</button></div>';
}

