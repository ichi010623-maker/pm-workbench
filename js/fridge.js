// ============================================================
// 📦 物品管理系统（食品 / 美妆 / 药品 / 生活用品）
// 5 个固定子模块：物品库存 / 到期预警 / AI 配餐 / 家人同步 / 消耗复盘
// 分类为两级：一级品类（ITEM_GROUPS）→ 二级细分（ITEM_CATS_PRESET + 用户自定义）
// 储存位置（冰箱只是其中一种）与剩余量均可自定义。
// 数据：DB.data.growth.fridge（本地持久，键名沿用以兼容历史数据）；家人同步走 Supabase fridge_household 共享表。
// ============================================================

var fridgeTab = "inventory";
var fridgeGroup = "all";   // 一级品类筛选
var fridgeFilter = "all";  // 二级细分筛选
var fridgeQuery = "";      // 名称搜索关键字
var fridgeSyncTimer = null;
var fridgeClient = null;
var fridgeMealsCache = null;
var FRIDGE_DISH_IDX = {};
var FRIDGE_DISH_SEQ = 0;
var fridgeCustomResult = null;   // 按需配餐结果 {dishes, shopping, style, serves}
var frCm = { style: "家常", serves: 2, meal: "任意", struct: "auto", stir: 1, cold: 1, veg: 0, soup: 0 };
var fridgeRecipeResult = null;   // 直接点菜结果 {dishes, have, missing, name}

// ---------- 两级分类体系 ----------
var ITEM_GROUPS = ["食品", "美妆", "药品", "生活用品"];
var ITEM_GROUP_EMOJI = { "食品": "🍎", "美妆": "💄", "药品": "💊", "生活用品": "🧴" };
var ITEM_CATS_PRESET = {
  "食品": ["蔬菜", "水果", "肉类", "海鲜", "蛋奶", "主食", "熟食", "干货", "零食", "饮料", "调味料", "半成品"],
  "美妆": ["护肤", "彩妆", "面膜", "防晒", "香水", "美发", "身体护理", "美甲", "美妆工具"],
  "药品": ["感冒药", "退烧止痛", "肠胃药", "消炎药", "外用药", "过敏药", "维生素保健", "医疗耗材", "处方药"],
  "生活用品": ["清洁用品", "纸品", "洗护用品", "厨房用品", "收纳用品", "电池耗材", "宠物用品", "母婴用品", "工具五金"]
};
// 食品二级分类（配餐引擎按此匹配菜谱模板）
var FRIDGE_CATS = ITEM_CATS_PRESET["食品"];
var ITEM_LOCS_PRESET = ["冰箱冷藏", "冰箱冷冻", "冰箱门架", "果蔬抽屉", "常温橱柜", "厨房台面", "化妆台", "浴室", "药箱", "卧室衣柜", "储物柜", "阳台"];
var ITEM_AMOUNTS_PRESET = ["充足", "过半", "少量", "快用完"];
// 旧常量保留别名，避免历史调用报错
var FRIDGE_LOCS = ITEM_LOCS_PRESET;
var FRIDGE_AMOUNTS = ITEM_AMOUNTS_PRESET;

var FRIDGE_MEAL_STYLES = ["家常", "清淡", "减脂", "快手", "补钙", "祛火", "云南菜", "湖南菜", "粤菜"];
var FRIDGE_BASE_STYLES = ["家常", "清淡", "减脂", "快手"];
var FRIDGE_CAT_EMOJI = {
  "蔬菜": "🥬", "水果": "🍎", "肉类": "🥩", "海鲜": "🦐", "蛋奶": "🥚", "主食": "🍚", "熟食": "🍱",
  "干货": "🍜", "零食": "🍪", "饮料": "🥤", "调味料": "🧂", "半成品": "🧊",
  "护肤": "🧴", "彩妆": "💄", "面膜": "🎭", "防晒": "☀️", "香水": "🌸", "美发": "💇", "身体护理": "🛁", "美甲": "💅", "美妆工具": "🖌️",
  "感冒药": "🤧", "退烧止痛": "🌡️", "肠胃药": "💊", "消炎药": "💊", "外用药": "🩹", "过敏药": "🤒", "维生素保健": "🍊", "医疗耗材": "🩺", "处方药": "📋",
  "清洁用品": "🧽", "纸品": "🧻", "洗护用品": "🧼", "厨房用品": "🍳", "收纳用品": "📦", "电池耗材": "🔋", "宠物用品": "🐾", "母婴用品": "🍼", "工具五金": "🔧"
};
function categoryEmoji(c) { return FRIDGE_CAT_EMOJI[c] || "📦"; }
function groupEmoji(g) { return ITEM_GROUP_EMOJI[g] || "📦"; }

// 根据二级品类反查所属一级品类
function groupOfCat(cat) {
  if (!cat) return null;
  for (var i = 0; i < ITEM_GROUPS.length; i++) {
    var g = ITEM_GROUPS[i];
    if ((ITEM_CATS_PRESET[g] || []).indexOf(cat) >= 0) return g;
  }
  try {
    var cc = (DB.data.growth.fridge.settings || {}).customCats || {};
    for (var k in cc) { if (cc[k] && cc[k].indexOf(cat) >= 0) return k; }
  } catch (e) {}
  return null;
}
// 某一级品类下的全部二级选项（预设 + 自定义）
function catsOf(group) {
  var f = ensureFridge();
  var base = (ITEM_CATS_PRESET[group] || []).slice();
  var cus = (f.settings.customCats && f.settings.customCats[group]) || [];
  cus.forEach(function (c) { if (base.indexOf(c) < 0) base.push(c); });
  return base;
}
function locsOf() {
  var f = ensureFridge();
  var base = ITEM_LOCS_PRESET.slice();
  (f.settings.customLocs || []).forEach(function (c) { if (base.indexOf(c) < 0) base.push(c); });
  return base;
}
function amountsOf() {
  var f = ensureFridge();
  var base = ITEM_AMOUNTS_PRESET.slice();
  (f.settings.customAmounts || []).forEach(function (c) { if (base.indexOf(c) < 0) base.push(c); });
  return base;
}

// ---------- 数据初始化 ----------
function ensureFridge() {
  if (!DB.data.growth) DB.data.growth = {};
  if (!DB.data.growth.fridge) {
    DB.data.growth.fridge = {
      household: { id: "", settingsCode: "", joined: false },
      me: "我",
      items: [], logs: [], shopping: [], dishLinks: {},
      plan: { style: "家常", weekOffset: 0, rev: nowISO() },
      scanCache: {}, scanLog: [], pendingScans: [],
      settings: { redDays: 3, yellowDays: 7, settingsCode: "", reminderTime: "09:00", customStyles: [], customCats: {}, customLocs: [], customAmounts: [], barcodeApiKey: "", rev: nowISO() },
      lastReminder: "", lastDailyCard: ""
    };
  }
  var f = DB.data.growth.fridge;
  if (!f.household) f.household = { id: "", settingsCode: "", joined: false };
  if (!f.items) f.items = [];
  if (!f.logs) f.logs = [];
  if (!f.shopping) f.shopping = [];
  if (!f.dishLinks) f.dishLinks = {};
  if (!f.plan) f.plan = { style: "家常", weekOffset: 0, rev: nowISO() };
  if (!f.settings) f.settings = { redDays: 3, yellowDays: 7, settingsCode: "", reminderTime: "09:00", customStyles: [], rev: nowISO() };
  if (f.settings.customStyles == null) f.settings.customStyles = [];
  if (f.settings.customCats == null) f.settings.customCats = {};
  if (f.settings.customLocs == null) f.settings.customLocs = [];
  if (f.settings.customAmounts == null) f.settings.customAmounts = [];
  if (f.settings.reminderTime == null) f.settings.reminderTime = "09:00";
  if (!f.lastDailyCard) f.lastDailyCard = "";
  if (!f.scanCache) f.scanCache = {};
  if (!f.scanLog) f.scanLog = [];
  if (!f.pendingScans) f.pendingScans = [];
  if (!f.usedUpLogs) f.usedUpLogs = [];   // 用完记录 {id,itemId,name,date,ts,restocked,restockedAt}
  if (f.settings.barcodeApiKey == null) f.settings.barcodeApiKey = "";
  // 旧数据迁移：单级分类 → 补齐一级品类；旧位置/剩余量枚举映射到新体系
  var LEGACY_LOC = { "冷藏上层": "冰箱冷藏", "冷藏下层": "冰箱冷藏", "冷冻层": "冰箱冷冻", "门架": "冰箱门架" };
  var LEGACY_AMT = { "仅剩临期": "快用完" };
  f.items.forEach(function (it) {
    if (!it.group) it.group = groupOfCat(it.cat) || "食品";
    if (it.loc && LEGACY_LOC[it.loc]) it.loc = LEGACY_LOC[it.loc];
    if (it.amount && LEGACY_AMT[it.amount]) it.amount = LEGACY_AMT[it.amount];
    // 自定义值（不在预设中）自动登记，保证下拉框里能再次选到
    if (it.loc && ITEM_LOCS_PRESET.indexOf(it.loc) < 0 && f.settings.customLocs.indexOf(it.loc) < 0) f.settings.customLocs.push(it.loc);
    if (it.amount && ITEM_AMOUNTS_PRESET.indexOf(it.amount) < 0 && f.settings.customAmounts.indexOf(it.amount) < 0) f.settings.customAmounts.push(it.amount);
    if (it.cat && it.group && (ITEM_CATS_PRESET[it.group] || []).indexOf(it.cat) < 0) {
      if (!f.settings.customCats[it.group]) f.settings.customCats[it.group] = [];
      if (f.settings.customCats[it.group].indexOf(it.cat) < 0) f.settings.customCats[it.group].push(it.cat);
    }
  });
  return f;
}

// ---------- 通用工具 ----------
function nowISO() { return new Date().toISOString(); }
function parseDate(s) { if (!s) return null; var p = String(s).split("-"); if (p.length < 3) return null; return new Date(+p[0], +p[1] - 1, +p[2]); }
function itemDaysLeft(it) {
  if (!it.expire) return null;
  var e = parseDate(it.expire); if (!e) return null;
  var t = new Date(); var today0 = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  return Math.round((e - today0) / 86400000);
}
function itemStatus(it) {
  if (it.usedUp) return "已用完";
  if (it.discarded) return "已过期";
  var d = itemDaysLeft(it);
  if (d == null) return "正常";
  if (d < 0) return "已过期";
  var f = ensureFridge();
  if (d <= (f.settings.redDays || 3)) return "临期";
  return "正常";
}
function statusBadge(s) {
  var m = {
    "正常": ["badge-green", "🟢 正常"],
    "临期": ["badge-orange", "🟠 临期"],
    "已过期": ["badge-red", "🔴 已过期"],
    "已用完": ["badge-gray", "⚪ 已用完"]
  };
  var v = m[s] || m["正常"];
  return '<span class="badge ' + v[0] + '">' + v[1] + '</span>';
}
function sortItems(items) {
  var rank = { "已过期": 0, "临期": 1, "正常": 2, "已用完": 3 };
  return items.slice().sort(function (a, b) {
    var ra = rank[itemStatus(a)] != null ? rank[itemStatus(a)] : 2;
    var rb = rank[itemStatus(b)] != null ? rank[itemStatus(b)] : 2;
    if (ra !== rb) return ra - rb;
    var da = itemDaysLeft(a), db = itemDaysLeft(b);
    if (da == null) da = 9999; if (db == null) db = 9999;
    return da - db;
  });
}

// ---------- 路由入口 ----------
function renderFridge() {
  var f = ensureFridge();
  // 每日临期提醒（打开即检查）
  dailyFridgeReminder();
  fridgeDailyCardCheck();
  // 已加入家庭则拉取最新
  if (f.household && f.household.joined && f.household.id) fridgeSyncNow();

  var tabs = [
    { id: "inventory", icon: "📦", t: "物品" },
    { id: "alerts", icon: "⏰", t: "预警" },
    { id: "skincare", icon: "🧴", t: "护肤" },
    { id: "family", icon: "👨‍👩‍👧", t: "家人" },
    { id: "review", icon: "📊", t: "复盘" }
  ];
  var c = document.getElementById("app-content");
  c.innerHTML =
    '<div class="filter-bar" style="position:sticky;top:0;z-index:5;background:var(--bg);padding-top:4px">' +
    tabs.map(function (t) { return '<div class="chip' + (fridgeTab === t.id ? ' active' : '') + '" onclick="setFridgeTab(\'' + t.id + '\')">' + t.icon + ' ' + t.t + '</div>'; }).join("") +
    '</div>' +
    (     fridgeTab === "inventory" ? renderFridgeInventory() :
     fridgeTab === "alerts" ? renderFridgeAlerts() :
     fridgeTab === "diet" ? renderFridgeDiet() :
     fridgeTab === "skincare" ? renderFridgeSkincare() :
     fridgeTab === "family" ? renderFridgeFamily() :
     renderFridgeReview());
  bindFridgeEvents();
}

// 饮食作为冰箱的子模块（复用成长区饮食数据）
function renderFridgeDiet() {
  if (typeof renderDietContent === "function") return renderDietContent();
  return '<div class="empty-state"><div class="empty-text">饮食模块加载中…</div></div>';
}

function setFridgeTab(id) { fridgeTab = id; renderFridge(); }
function bindFridgeEvents() {}

// ============================================================
// 模块1：物品数字库存（两级分类 + 名称搜索）
// ============================================================
function fridgeItemCard(it) {
  var imgHtml = it.img ? '<img class="fr-card-img" src="' + it.img + '" alt="">' : '<div class="fr-card-img">' + categoryEmoji(it.cat) + '</div>';
  // 一级卡片只展示：图片 + 名称 + 剩余量；其余信息（分类/位置/保质期/状态）点进详情查看
  return '<div class="fr-card fr-card-simple" onclick="showFridgeItemDetail(\'' + it.id + '\')">' +
    imgHtml +
    '<div class="fr-card-body">' +
    '<div class="fr-card-name">' + escapeHtml(it.name) + '</div>' +
    '<div class="fr-card-qty">' + escapeHtml(it.amount || "—") + (it.qty && +it.qty > 1 ? ' ·×' + it.qty : '') + '</div>' +
    '</div></div>';
}

// 按当前筛选条件（一级 / 二级 / 搜索词）取物品
function fridgeFilteredItems() {
  var f = ensureFridge();
  var items = sortItems(f.items);
  if (fridgeGroup !== "all") items = items.filter(function (it) { return (it.group || "食品") === fridgeGroup; });
  if (fridgeFilter !== "all") items = items.filter(function (it) { return it.cat === fridgeFilter; });
  var q = (fridgeQuery || "").trim().toLowerCase();
  if (q) {
    items = items.filter(function (it) {
      return [it.name, it.cat, it.group, it.loc, it.actor].some(function (s) {
        return s && String(s).toLowerCase().indexOf(q) >= 0;
      });
    });
  }
  return items;
}

// 列表主体（搜索时只重绘这一块，输入框不重建、焦点不丢）
function fridgeListHtml() {
  var items = fridgeFilteredItems();
  if (items.length === 0) {
    var q = (fridgeQuery || "").trim();
    if (q) return '<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-text">没有匹配「' + escapeHtml(q) + '」的物品</div></div>';
    return '<div class="empty-state"><div class="empty-icon">📦</div><div class="empty-text">这里还是空的<br>点「新增物品」建立第一份档案</div></div>';
  }
  // 已选定二级品类：直接平铺网格
  if (fridgeFilter !== "all") return '<div class="fr-grid">' + items.map(fridgeItemCard).join("") + '</div>';

  var html = "";
  // 已选定一级品类：按二级细分分区
  if (fridgeGroup !== "all") {
    html += fridgeCatSections(items, fridgeGroup);
    return html;
  }
  // 全部：一级品类分组 → 组内按二级细分分区
  var byGroup = {};
  items.forEach(function (it) {
    var g = ITEM_GROUPS.indexOf(it.group) >= 0 ? it.group : "食品";
    (byGroup[g] = byGroup[g] || []).push(it);
  });
  ITEM_GROUPS.forEach(function (g) {
    var list = byGroup[g];
    if (!list || !list.length) return;
    html += '<div class="fr-group">' +
      '<div class="fr-group-title"><span class="fr-grp-emoji">' + groupEmoji(g) + '</span>' + g +
      '<span class="count">' + list.length + '</span></div>' +
      fridgeCatSections(list, g) +
      '</div>';
  });
  return html;
}

// 组内按二级细分分区
function fridgeCatSections(list, group) {
  var byCat = {};
  list.forEach(function (it) { (byCat[it.cat || "未分类"] = byCat[it.cat || "未分类"] || []).push(it); });
  var order = catsOf(group).concat(["未分类"]);
  Object.keys(byCat).forEach(function (k) { if (order.indexOf(k) < 0) order.push(k); });
  var html = "";
  order.forEach(function (cat) {
    var sub = byCat[cat];
    if (!sub || !sub.length) return;
    html += '<div class="fr-section">' +
      '<div class="fr-section-title"><span class="fr-sec-emoji">' + categoryEmoji(cat) + '</span>' + escapeHtml(cat) +
      '<span class="count">' + sub.length + '</span></div>' +
      '<div class="fr-grid">' + sub.map(fridgeItemCard).join("") + '</div>' +
      '</div>';
  });
  return html;
}

function renderFridgeInventory() {
  var f = ensureFridge();
  var expiringCount = f.items.filter(function (it) { return itemStatus(it) === "临期" || itemStatus(it) === "已过期"; }).length;
  var total = f.items.length;

  var html =
    '<div style="display:flex;gap:8px;margin:10px 0 8px">' +
    '<button class="btn btn-primary" style="flex:2;padding:9px;font-size:13px" onclick="showFridgeItemModal()">➕ 手动新增</button>' +
    '<button class="btn btn-secondary" style="padding:9px 12px;font-size:13px" onclick="setFridgeTab(\'alerts\')">⏰ 临期 ' + expiringCount + '</button>' +
    '</div>' +
    // 名称搜索
    '<div class="fr-search-wrap">' +
    '<span class="fr-search-icon">🔍</span>' +
    '<input id="fr-search" class="fr-search-input" type="search" placeholder="搜索名称 / 品类 / 位置…" value="' + escapeHtml(fridgeQuery) + '" oninput="fridgeSearchInput(this.value)">' +
    (fridgeQuery ? '<span class="fr-search-clear" onclick="fridgeClearSearch()">✕</span>' : '') +
    '</div>' +
    // 一级品类
    '<div class="filter-bar" style="flex-wrap:wrap">' +
    '<div class="chip' + (fridgeGroup === "all" ? " active" : "") + '" onclick="setFridgeGroup(\'all\')">全部 ' + total + '</div>' +
    ITEM_GROUPS.map(function (g) {
      var n = f.items.filter(function (it) { return (it.group || "食品") === g; }).length;
      return '<div class="chip' + (fridgeGroup === g ? " active" : "") + '" onclick="setFridgeGroup(\'' + g + '\')">' + groupEmoji(g) + ' ' + g + (n ? ' ' + n : '') + '</div>';
    }).join("") +
    '</div>';

  // 二级细分（选定一级后展开）
  if (fridgeGroup !== "all") {
    var subCats = catsOf(fridgeGroup);
    html += '<div class="filter-bar fr-subbar" style="flex-wrap:wrap">' +
      '<div class="chip sm' + (fridgeFilter === "all" ? " active" : "") + '" onclick="setFridgeFilter(\'all\')">全部</div>' +
      subCats.map(function (cat) {
        var n = f.items.filter(function (it) { return it.cat === cat && (it.group || "食品") === fridgeGroup; }).length;
        return '<div class="chip sm' + (fridgeFilter === cat ? " active" : "") + '" onclick="setFridgeFilter(\'' + cat + '\')">' + escapeHtml(cat) + (n ? ' ' + n : '') + '</div>';
      }).join("") +
      '<div class="chip sm ghost" onclick="showFridgeTaxonomy(\'' + fridgeGroup + '\')">＋ 品类</div>' +
      '</div>';
  }

  html += '<div id="fr-list">' + fridgeListHtml() + '</div>';
  html += fridgeUsedUpHtml();   // 底部「用完记录」（待补充 + 历史）
  return html;
}

// 一级筛选切换时重置二级
function setFridgeGroup(g) { fridgeGroup = g; fridgeFilter = "all"; renderFridge(); }
function setFridgeFilter(cat) { fridgeFilter = cat; renderFridge(); }

// 搜索：只重绘列表容器，保住输入框焦点
function fridgeSearchInput(v) {
  fridgeQuery = v || "";
  var box = document.getElementById("fr-list");
  if (box) box.innerHTML = fridgeListHtml();
}
function fridgeClearSearch() {
  fridgeQuery = "";
  var el = document.getElementById("fr-search");
  if (el) el.value = "";
  renderFridge();
}

// 下拉框 + 内联「＋自定义」输入（原生 prompt 在手机 PWA 常失效，故用内联输入框）
function frOptionsHtml(opts, cur) {
  var html = opts.map(function (o) {
    return '<option value="' + escapeHtml(o) + '"' + (cur === o ? " selected" : "") + '>' + escapeHtml(o) + '</option>';
  }).join("");
  return html + '<option value="__custom__">＋ 自定义…</option>';
}
function frSelectField(label, name, opts, cur, onchange) {
  return '<div class="form-group"><div class="form-label">' + label + '</div>' +
    '<select class="form-input" name="' + name + '" id="fr-sel-' + name + '" onchange="' + (onchange || ("frToggleCustom('" + name + "')")) + '">' +
    frOptionsHtml(opts, cur) + '</select>' +
    '<input class="form-input" name="' + name + 'Custom" id="fr-cus-' + name + '" style="display:none;margin-top:6px" placeholder="输入新的' + label + '，保存后自动加入选项">' +
    '</div>';
}
function frToggleCustom(name) {
  var sel = document.getElementById("fr-sel-" + name);
  var box = document.getElementById("fr-cus-" + name);
  if (!sel || !box) return;
  var on = sel.value === "__custom__";
  box.style.display = on ? "" : "none";
  if (on) { try { box.focus(); } catch (e) {} }
}
// 一级品类切换 → 重建二级品类选项
function frOnGroupChange() {
  var g = document.getElementById("fr-sel-group");
  var sel = document.getElementById("fr-sel-cat");
  if (!g || !sel) return;
  if (g.value === "__custom__") { frToggleCustom("group"); return; }
  frToggleCustom("group");
  var opts = catsOf(g.value);
  sel.innerHTML = frOptionsHtml(opts, opts[0]);
  frToggleCustom("cat");
}

function showFridgeItemModal(id, prefill) {
  var f = ensureFridge();
  var it = id ? f.items.find(function (x) { return x.id === id; }) : null;
  var v = it || (prefill || {});
  var grp = v.group || (fridgeGroup !== "all" ? fridgeGroup : "食品");
  var curCat = v.cat || (fridgeFilter !== "all" ? fridgeFilter : catsOf(grp)[0]);
  window.__fridgeItemImg = v.img || null;
  var modalTitle = it ? "✎ 编辑物品" : (prefill && prefill.barcode ? "📷 扫码新建物品（可修改）" : "➕ 新增物品");
  window.__scanBarcode = v.barcode || "";
  showModal(
    '<div class="modal-title">' + modalTitle + '</div>' +
    '<form onsubmit="submitFridgeItem(event,\'' + (id || "") + '\')">' +
    '<div class="form-group"><div class="form-label">物品名称 *</div><input class="form-input" name="name" value="' + escapeHtml(v.name || "") + '" placeholder="如：西红柿 / 卸妆水 / 布洛芬" required></div>' +
    '<div style="display:flex;gap:10px"><div class="form-group" style="flex:1"><div class="form-label">品牌</div><input class="form-input" name="brand" value="' + escapeHtml(v.brand || "") + '" placeholder="如：伊利 / 欧莱雅"></div>' +
    '<div class="form-group" style="flex:1"><div class="form-label">规格</div><input class="form-input" name="spec" value="' + escapeHtml(v.spec || "") + '" placeholder="如：500g / 1L / 30片"></div></div>' +
    (v.barcode ? '<div class="scan-hint">🔖 条码：' + escapeHtml(v.barcode) + '（识别来源，可保留）</div>' : '') +
    '<div class="form-group"><div class="form-label">图片（可选，让卡片更醒目）</div>' +
    '<input type="file" accept="image/*" class="form-input" onchange="fridgePickImage(event)" style="padding:6px">' +
    '<div id="fr-img-prev" style="margin-top:6px">' + (v.img ? '<img src="' + v.img + '" style="width:100%;height:120px;object-fit:cover;border-radius:8px">' : '') + '</div></div>' +
    '<div class="form-group"><div class="form-label">一级品类 *</div>' +
    '<select class="form-input" name="group" id="fr-sel-group" onchange="frOnGroupChange()">' +
    ITEM_GROUPS.map(function (g) { return '<option value="' + g + '"' + (grp === g ? " selected" : "") + '>' + groupEmoji(g) + ' ' + g + '</option>'; }).join("") +
    '</select></div>' +
    frSelectField("二级品类 *", "cat", catsOf(grp), curCat) +
    frSelectField("储存位置", "loc", locsOf(), v.loc || "冰箱冷藏") +
    frSelectField("剩余量", "amount", amountsOf(), v.amount || "充足") +
    '<div style="display:flex;gap:10px"><div class="form-group" style="flex:1"><div class="form-label">入库日期</div><input class="form-input" type="date" name="inDate" value="' + (v.inDate || today()) + '"></div>' +
    '<div class="form-group" style="flex:1"><div class="form-label">到期日期（可选）</div><input class="form-input" type="date" name="expire" value="' + (v.expire || "") + '"></div>' +
    '<div class="form-group" style="flex:0 0 92px"><div class="form-label">库存数量</div><input class="form-input" type="number" min="1" name="qty" value="' + (v.qty ? (+v.qty) : 1) + '"></div></div>' +
    '<div class="form-group"><div class="form-label">录入人</div><input class="form-input" name="actor" value="' + escapeHtml(v.actor || f.me || "我") + '" placeholder="谁放入的"></div>' +
    '<div class="form-group"><div class="form-label">备注（可选）</div><input class="form-input" name="note" value="' + escapeHtml(v.note || "") + '" placeholder="如：开封后 3 个月内用完"></div>' +
    '<div class="btn-row">' +
      (it ? '<button type="button" class="btn btn-secondary" onclick="fridgeConsume(\'' + id + '\')">✅ 核销用完</button>' : '') +
      (it ? '<button type="button" class="btn btn-secondary" style="color:var(--accent-red)" onclick="fridgeDeleteItem(\'' + id + '\')">🗑 删除</button>' : '') +
      '<button type="button" class="btn btn-secondary" onclick="closeModal()">取消</button><button type="submit" class="btn btn-primary">保存</button>' +
    '</div>' +
    '</form>'
  );
}

function fridgeCompressImage(file, cb) {
  if (!file) { cb(null); return; }
  var reader = new FileReader();
  reader.onload = function (e) {
    var img = new Image();
    img.onload = function () {
      // 640px + 0.82 质量：方形缩略图下更清晰，同时控制体积
      var max = 640, w = img.width, h = img.height;
      var scale = Math.min(1, max / Math.max(w, h));
      var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
      var cv = document.createElement("canvas"); cv.width = cw; cv.height = ch;
      try { cv.getContext("2d").drawImage(img, 0, 0, cw, ch); cb(cv.toDataURL("image/jpeg", 0.82)); }
      catch (err) { cb(e.target.result); }
    };
    img.onerror = function () { cb(e.target.result); };
    img.src = e.target.result;
  };
  reader.onerror = function () { cb(null); };
  reader.readAsDataURL(file);
}

function fridgePickImage(ev) {
  var file = ev.target.files && ev.target.files[0];
  var prev = document.getElementById("fr-img-prev");
  window.__fridgeItemImg = null;
  fridgeCompressImage(file, function (b64) {
    window.__fridgeItemImg = b64;
    if (prev) prev.innerHTML = b64 ? '<img src="' + b64 + '" style="width:100%;height:120px;object-fit:cover;border-radius:8px">' : "";
  });
}

// 读取下拉值，选了「＋自定义」则取旁边输入框的内容
function frReadSel(fd, name, fallback) {
  var v = fd.get(name);
  if (v === "__custom__") v = String(fd.get(name + "Custom") || "").trim();
  return v || fallback || "";
}
// 把自定义值登记进设置，下次下拉框直接可选
function frRegisterCustom(f, group, cat, loc, amount) {
  if (cat && group && (ITEM_CATS_PRESET[group] || []).indexOf(cat) < 0) {
    if (!f.settings.customCats[group]) f.settings.customCats[group] = [];
    if (f.settings.customCats[group].indexOf(cat) < 0) f.settings.customCats[group].push(cat);
  }
  if (loc && ITEM_LOCS_PRESET.indexOf(loc) < 0 && f.settings.customLocs.indexOf(loc) < 0) f.settings.customLocs.push(loc);
  if (amount && ITEM_AMOUNTS_PRESET.indexOf(amount) < 0 && f.settings.customAmounts.indexOf(amount) < 0) f.settings.customAmounts.push(amount);
}

function submitFridgeItem(event, id) {
  event.preventDefault();
  var fd = new FormData(event.target);
  var f = ensureFridge();
  var group = frReadSel(fd, "group", "食品");
  if (ITEM_GROUPS.indexOf(group) < 0) group = "食品";
  var cat = frReadSel(fd, "cat", catsOf(group)[0] || "未分类");
  var loc = frReadSel(fd, "loc", "冰箱冷藏");
  var amount = frReadSel(fd, "amount", "充足");
  frRegisterCustom(f, group, cat, loc, amount);

  if (id) {
    var it = f.items.find(function (x) { return x.id === id; });
    if (it) {
      it.name = fd.get("name"); it.group = group; it.cat = cat;
      it.inDate = fd.get("inDate"); it.expire = fd.get("expire");
      it.amount = amount; it.loc = loc; it.actor = fd.get("actor"); it.note = fd.get("note") || "";
      it.brand = fd.get("brand") || ""; it.spec = fd.get("spec") || "";
      it.qty = Math.max(1, parseInt(fd.get("qty") || "1", 10) || 1);
      it.img = (window.__fridgeItemImg != null ? window.__fridgeItemImg : it.img);
      it.updatedAt = nowISO();
    }
    pushFridgeLog("edit", it ? it.name : "", "编辑了物品");
  } else {
    var nw = {
      id: uid(), name: fd.get("name"), group: group, cat: cat,
      inDate: fd.get("inDate"), expire: fd.get("expire"), amount: amount, loc: loc,
      brand: fd.get("brand") || "", spec: fd.get("spec") || "",
      qty: Math.max(1, parseInt(fd.get("qty") || "1", 10) || 1),
      barcode: window.__scanBarcode || "",
      actor: fd.get("actor") || (f.me || "我"), note: fd.get("note") || "",
      img: window.__fridgeItemImg || "", usedUp: false, discarded: false, updatedAt: nowISO()
    };
    f.items.push(nw);
    pushFridgeLog("add", nw.name, "新增物品：" + nw.name);
  }
  window.__fridgeItemImg = null;
  DB.save(); closeModal(); fridgeScheduleSync(); render();
}

// ============================================================
// 🧴 护肤使用记录 + 物品详情卡片（使用扣库存 / 修改 / 删除）
// ============================================================
// 判定是否为护肤/美妆类产品（美妆整组 + 名称关键词兜底）
function fridgeIsSkincare(it) {
  if (!it) return false;
  if ((it.group || "食品") === "美妆") return true;
  return /护肤|精华|面霜|水乳|乳液|眼霜|面膜|防晒|洁面|洗面|爽肤|化妆水|喷雾|身体乳|护手霜|唇膏|口红|粉底|眼影/.test((it.name || "") + (it.cat || ""));
}
function frDayAgo(n) {
  var d = new Date(); d.setDate(d.getDate() - n);
  return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
}
// 使用扣除库存：qty>1 扣数量；qty=1 按 剩余量档位 充足→过半→少量→快用完→已用完 逐级降
function fridgeUseItem(id) {
  var f = ensureFridge();
  var it = f.items.find(function (x) { return x.id === id; }); if (!it) return;
  if (it.usedUp) { showToast("已用完：可点「🛒 已补充购买」恢复", "warning"); return; }
  var AMTS = ["充足", "过半", "少量", "快用完"];
  var qty = +it.qty || 1;
  if (qty > 1) {
    it.qty = qty - 1;
    var ai = AMTS.indexOf(it.amount);
    if (ai >= 0 && ai < AMTS.length - 1) it.amount = AMTS[ai + 1];
  } else {
    var ai2 = AMTS.indexOf(it.amount);
    if (ai2 >= 0 && ai2 < AMTS.length - 1) it.amount = AMTS[ai2 + 1];
    else { it.amount = "已用完"; it.usedUp = true; it.qty = 0; }
  }
  it.updatedAt = nowISO();
  if (!it.useDates) it.useDates = [];
  it.useDates.push(today());   // 记录使用日期（护肤 tab 按日汇总）
  if (it.usedUp) {             // 用完保存记录，方便补充购买后继续
    if (!f.usedUpLogs) f.usedUpLogs = [];
    f.usedUpLogs.push({ id: uid(), itemId: it.id, name: it.name, date: today(), ts: Date.now(), restocked: false, restockedAt: null });
    pushFridgeLog("used-up", it.name, "物品用完：" + it.name);
  } else {
    pushFridgeLog("use", it.name, "使用扣除：" + it.name);
  }
  DB.save(); fridgeScheduleSync();
  showToast("✅ 已使用 1 次" + (it.usedUp ? "（已用完，可在「用完记录」补充）" : "，剩 " + (it.amount || ("×" + it.qty))), "success");
  if (document.getElementById("fr-detail")) showFridgeItemDetail(id); else render();
}
// 物品详情卡片：点卡片进入 → 修改信息 / 使用扣库存 / 删除
function showFridgeItemDetail(id) {
  var f = ensureFridge();
  var it = f.items.find(function (x) { return x.id === id; }); if (!it) return;
  var d = itemDaysLeft(it);
  var expireTxt = it.expire
    ? (d == null ? "已过期" : d < 0 ? "已过期 " + Math.abs(d) + " 天" : "剩 " + d + " 天")
    : "未设置";
  var status = itemStatus(it);
  var imgHtml = it.img
    ? '<img src="' + it.img + '" style="width:100%;max-height:220px;object-fit:cover;border-radius:12px;background:rgba(255,255,255,0.05)">'
    : '<div style="height:120px;display:flex;align-items:center;justify-content:center;font-size:52px;background:rgba(255,255,255,0.04);border-radius:12px">' + categoryEmoji(it.cat) + '</div>';
  var useDates = it.useDates || [];
  var skincareTag = fridgeIsSkincare(it) ? ' <span class="badge badge-blue" style="font-size:10px">🧴 护肤</span>' : "";
  var useHtml = "";
  if (useDates.length) {
    var last5 = useDates.slice(-5).map(function (x) { return formatDateShort(x); }).join(" · ");
    useHtml = '<div class="fr-detail-row"><span class="fr-detail-label">使用记录</span><span class="fr-detail-val">共 ' + useDates.length + ' 次' + (fridgeIsSkincare(it) ? ' · 今日' + ((useDates[useDates.length - 1] === today()) ? ' ✅' : ' 未用') : '') + '<br><span style="font-size:11px;color:var(--text-tertiary)">最近：' + last5 + '</span></span></div>';
  }
  showModal(
    '<div class="modal-title" id="fr-detail">📋 物品详情</div>' +
    '<div style="padding:12px 16px">' +
      imgHtml +
      '<div style="display:flex;align-items:center;gap:6px;margin-top:10px"><div style="font-size:17px;font-weight:800;flex:1;min-width:0">' + escapeHtml(it.name) + '</div>' + statusBadge(status) + skincareTag + '</div>' +
      '<div class="fr-detail-grid">' +
        ((it.brand) ? '<div class="fr-detail-row"><span class="fr-detail-label">品牌</span><span class="fr-detail-val">' + escapeHtml(it.brand) + '</span></div>' : '') +
        ((it.spec) ? '<div class="fr-detail-row"><span class="fr-detail-label">规格</span><span class="fr-detail-val">' + escapeHtml(it.spec) + '</span></div>' : '') +
        (it.barcode ? '<div class="fr-detail-row"><span class="fr-detail-label">条码</span><span class="fr-detail-val">' + escapeHtml(it.barcode) + '</span></div>' : '') +
        '<div class="fr-detail-row"><span class="fr-detail-label">分类</span><span class="fr-detail-val">' + groupEmoji(it.group) + ' ' + escapeHtml(it.group) + (it.cat ? ' › ' + escapeHtml(it.cat) : '') + '</span></div>' +
        '<div class="fr-detail-row"><span class="fr-detail-label">位置</span><span class="fr-detail-val">' + escapeHtml(it.loc || "—") + '</span></div>' +
        '<div class="fr-detail-row"><span class="fr-detail-label">剩余</span><span class="fr-detail-val">' + escapeHtml(it.amount || "—") + (it.qty && +it.qty > 1 ? ' ×' + it.qty : '') + '</span></div>' +
        '<div class="fr-detail-row"><span class="fr-detail-label">入库</span><span class="fr-detail-val">' + formatDateShort(it.inDate) + '</span></div>' +
        '<div class="fr-detail-row"><span class="fr-detail-label">到期</span><span class="fr-detail-val" style="' + (status === "已过期" ? "color:var(--accent-red)" : status === "临期" ? "color:var(--accent-orange)" : "") + '">' + (it.expire ? formatDateShort(it.expire) + '（' + expireTxt + '）' : '未设置') + '</span></div>' +
        (it.actor ? '<div class="fr-detail-row"><span class="fr-detail-label">录入人</span><span class="fr-detail-val">' + escapeHtml(it.actor) + '</span></div>' : '') +
        (it.note ? '<div class="fr-detail-row"><span class="fr-detail-label">备注</span><span class="fr-detail-val">' + escapeHtml(it.note) + '</span></div>' : '') +
        useHtml +
      '</div>' +
    '</div>' +
    '<div class="btn-row" style="padding:0 16px 16px">' +
      (it.usedUp
        ? '<button class="btn btn-primary" style="flex:1" onclick="fridgeRestock(\'' + id + '\')">🛒 已补充购买</button>'
        : '<button class="btn btn-primary" style="flex:1" onclick="fridgeUseItem(\'' + id + '\')">✅ 使用扣库存</button>') +
      '<button class="btn btn-secondary" style="flex:1" onclick="closeModal();showFridgeItemModal(\'' + id + '\')">✏️ 修改信息</button>' +
      '<button class="btn btn-secondary" style="flex:1;color:var(--accent-red)" onclick="fridgeDeleteItem(\'' + id + '\')">🗑 删除</button>' +
    '</div>' +
    '<div style="text-align:center;padding:0 16px 14px"><button class="btn btn-secondary" style="width:100%" onclick="closeModal()">关闭</button></div>'
  );
}
// 🛒 补充购买：恢复已用完物品继续使用，并标记用完记录已补充
function fridgeRestock(id) {
  var f = ensureFridge();
  var it = f.items.find(function (x) { return x.id === id; }); if (!it) return;
  it.usedUp = false; it.discarded = false;
  it.qty = Math.max(1, +it.qty || 1); it.amount = "充足"; it.updatedAt = nowISO();
  (f.usedUpLogs || []).forEach(function (l) {
    if (l.itemId === id && !l.restocked) { l.restocked = true; l.restockedAt = nowISO(); }
  });
  pushFridgeLog("restock", it.name, "补充购买：" + it.name);
  DB.save(); fridgeScheduleSync();
  showToast("🛒 已补充购买，「" + it.name + "」可继续使用", "success");
  if (document.getElementById("fr-detail")) showFridgeItemDetail(id); else render();
}
// 物品 tab 底部「🧺 用完记录」区：待补充列表 + 已补充历史
function fridgeUsedUpHtml() {
  var f = ensureFridge();
  var logs = (f.usedUpLogs || []).slice().sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
  if (!logs.length) return "";
  var pending = logs.filter(function (l) { return !l.restocked; });
  var done = logs.filter(function (l) { return l.restocked; });
  var html = '<div class="section-title"><span class="emoji">🧺</span> 用完记录 <span style="margin-left:auto;font-size:13px;color:var(--text-secondary);font-weight:400">' + (pending.length ? pending.length + ' 待补充' : '') + '</span></div>';
  if (pending.length) {
    html += '<div class="fr-used-list">' + pending.map(function (l) {
      var it = f.items.find(function (x) { return x.id === l.itemId; });
      return '<div class="fr-used-item">' +
        '<div class="fr-used-img">' + (it && it.img ? '<img src="' + it.img + '" alt="">' : categoryEmoji(it ? it.cat : "")) + '</div>' +
        '<div class="fr-used-info"><div class="fr-used-name">' + escapeHtml(l.name) + '</div>' +
        '<div class="fr-used-sub">用完 ' + formatDateShort(l.date) + (it && it.brand ? ' · ' + escapeHtml(it.brand) : '') + '</div></div>' +
        '<button class="fr-used-btn" onclick="fridgeRestock(\'' + l.itemId + '\')">🛒 已补充购买</button>' +
        '</div>';
    }).join("") + '</div>';
  }
  if (done.length) {
    html += '<div class="fr-used-done"><div class="fr-used-done-label" onclick="toggleFridgeUsedHist()">📦 已补充历史（' + done.length + '）<span id="fr-used-arrow">▸</span></div>' +
      '<div id="fr-used-hist" class="hidden">' + done.slice(0, 20).map(function (l) {
        return '<div class="fr-used-hist-row">' + escapeHtml(l.name) + ' · 用完 ' + formatDateShort(l.date) + ' → 补充 ' + formatDateShort(String(l.restockedAt || "").slice(0, 10)) + '</div>';
      }).join("") + '</div></div>';
  }
  return html;
}
function toggleFridgeUsedHist() {
  var el = document.getElementById("fr-used-hist");
  var ar = document.getElementById("fr-used-arrow");
  if (!el) return;
  if (el.classList.contains("hidden")) { el.classList.remove("hidden"); if (ar) ar.textContent = "▾"; }
  else { el.classList.add("hidden"); if (ar) ar.textContent = "▸"; }
}

// 护肤使用记录 tab：今日已用 / 待用列表 / 近 7 天历史
function renderFridgeSkincare() {
  var f = ensureFridge();
  var t = today();
  var items = f.items.filter(fridgeIsSkincare);
  var usedToday = items.filter(function (it) { return (it.useDates || []).indexOf(t) >= 0; });
  var unused = items.filter(function (it) { return (it.useDates || []).indexOf(t) < 0; });
  var usedUpList = items.filter(function (it) { return it.usedUp; });

  function card(it) {
    var used = (it.useDates || []).indexOf(t) >= 0;
    var img = it.img ? '<img class="fr-sk-img" src="' + it.img + '" alt="">' : '<div class="fr-sk-img">' + categoryEmoji(it.cat) + '</div>';
    return '<div class="fr-sk-item' + (used ? " used" : "") + '">' +
      img +
      '<div class="fr-sk-info" onclick="showFridgeItemDetail(\'' + it.id + '\')">' +
      '<div class="fr-sk-name">' + escapeHtml(it.name) + (used ? ' <span class="fr-sk-tag">今日已用</span>' : '') + '</div>' +
      '<div class="fr-sk-meta">' + escapeHtml([it.brand, it.spec, it.amount].filter(Boolean).join(" · ")) + '</div>' +
      '</div>' +
      (it.usedUp
        ? '<button class="fr-sk-btn" onclick="fridgeRestock(\'' + it.id + '\')">🛒 已补充</button>'
        : '<button class="fr-sk-btn' + (used ? " on" : "") + '" onclick="fridgeUseItem(\'' + it.id + '\')">' + (used ? "✅ 再用一次" : "✅ 用了") + '</button>') +
      '</div>';
  }

  var html =
    '<div class="section-title"><span class="emoji">🧴</span> 今日护肤 <span style="margin-left:auto;font-size:13px;color:var(--text-secondary);font-weight:400">' + usedToday.length + '/' + items.length + ' 款</span></div>';
  if (!items.length) {
    html += '<div class="empty-state"><div class="empty-icon">🧴</div><div class="empty-text">还没有护肤/美妆类产品<br>去「物品」新增（美妆类自动归入本页）</div></div>';
    return html;
  }
  if (usedToday.length) {
    html += '<div class="fr-sk-used"><div class="fr-sk-used-label">今日已用：</div>' +
      usedToday.map(function (it) { return '<span class="fr-sk-chip">' + (it.img ? '' : '') + escapeHtml(it.name) + '</span>'; }).join("") + '</div>';
  } else {
    html += '<div class="fr-sk-empty">今天还没记录使用，从下方点「✅ 用了」开始</div>';
  }
  html += '<div class="fr-sk-list">' + unused.filter(function (it) { return !it.usedUp; }).map(card).join("") + usedToday.map(card).join("") + '</div>';

  // 近 7 天历史
  var hist = [];
  for (var i = 1; i <= 7; i++) {
    var d = frDayAgo(i);
    var used = items.filter(function (it) { return (it.useDates || []).indexOf(d) >= 0; });
    if (used.length) hist.push('<div class="fr-sk-hist-row"><span class="fr-sk-hist-date">' + formatDateShort(d) + '</span>' + used.map(function (it) { return '<span class="fr-sk-chip">' + escapeHtml(it.name) + '</span>'; }).join("") + '</div>');
  }
  html += '<div class="section-title"><span class="emoji">📅</span> 近 7 天使用回顾</div>' +
    (hist.length ? hist.join("") : '<div class="card"><div class="card-body" style="text-align:center;color:var(--text-secondary)">近 7 天还没有护肤使用记录</div></div>') +
    (usedUpList.length ? '<div class="section-title">🗑 已用完</div><div class="fr-sk-list">' + usedUpList.map(card).join("") + '</div>' : '');
  return html;
}

// ============================================================
// ---------- 自定义品类 / 位置 / 剩余量 管理 ----------
function showFridgeTaxonomy(group) {
  var f = ensureFridge();
  var g = ITEM_GROUPS.indexOf(group) >= 0 ? group : (fridgeGroup !== "all" ? fridgeGroup : "食品");
  function chipList(kind, arr, presetArr) {
    if (!arr.length) return '<div class="fr-tax-empty">暂无自定义项</div>';
    return '<div class="fr-tax-chips">' + arr.map(function (v) {
      return '<span class="fr-tax-chip">' + escapeHtml(v) +
        '<b onclick="fridgeRemoveCustom(\'' + kind + '\',\'' + escapeHtml(v).replace(/'/g, "\\'") + '\',\'' + g + '\')">✕</b></span>';
    }).join("") + '</div>';
  }
  var cusCats = (f.settings.customCats && f.settings.customCats[g]) || [];
  showModal(
    '<div class="modal-title">🏷️ 自定义选项管理</div>' +
    '<div class="form-group"><div class="form-label">一级品类</div>' +
    '<select class="form-input" onchange="showFridgeTaxonomy(this.value)">' +
    ITEM_GROUPS.map(function (x) { return '<option value="' + x + '"' + (x === g ? " selected" : "") + '>' + groupEmoji(x) + ' ' + x + '</option>'; }).join("") +
    '</select></div>' +
    '<div class="fr-tax-sec"><div class="form-label">「' + g + '」下的二级品类（自定义）</div>' +
    chipList("cat", cusCats) +
    '<div style="display:flex;gap:6px;margin-top:6px"><input class="form-input" id="fr-tax-cat" placeholder="新增二级品类" style="flex:1">' +
    '<button type="button" class="btn btn-secondary" style="padding:8px 12px" onclick="fridgeAddCustom(\'cat\',\'' + g + '\')">添加</button></div>' +
    '<div class="fr-tax-hint">预设：' + escapeHtml((ITEM_CATS_PRESET[g] || []).join("、")) + '</div></div>' +
    '<div class="fr-tax-sec"><div class="form-label">储存位置（自定义）</div>' +
    chipList("loc", f.settings.customLocs || []) +
    '<div style="display:flex;gap:6px;margin-top:6px"><input class="form-input" id="fr-tax-loc" placeholder="如：书房抽屉" style="flex:1">' +
    '<button type="button" class="btn btn-secondary" style="padding:8px 12px" onclick="fridgeAddCustom(\'loc\',\'' + g + '\')">添加</button></div>' +
    '<div class="fr-tax-hint">预设：' + ITEM_LOCS_PRESET.join("、") + '</div></div>' +
    '<div class="fr-tax-sec"><div class="form-label">剩余量（自定义）</div>' +
    chipList("amount", f.settings.customAmounts || []) +
    '<div style="display:flex;gap:6px;margin-top:6px"><input class="form-input" id="fr-tax-amount" placeholder="如：还剩 2 瓶" style="flex:1">' +
    '<button type="button" class="btn btn-secondary" style="padding:8px 12px" onclick="fridgeAddCustom(\'amount\',\'' + g + '\')">添加</button></div>' +
    '<div class="fr-tax-hint">预设：' + ITEM_AMOUNTS_PRESET.join("、") + '</div></div>' +
    '<div class="btn-row"><button type="button" class="btn btn-primary" onclick="closeModal();renderFridge()">完成</button></div>'
  );
}

function fridgeAddCustom(kind, group) {
  var f = ensureFridge();
  var el = document.getElementById("fr-tax-" + kind);
  var v = el ? String(el.value || "").trim() : "";
  if (!v) { showToast("请输入名称"); return; }
  if (kind === "cat") {
    if (catsOf(group).indexOf(v) >= 0) { showToast("该品类已存在"); return; }
    if (!f.settings.customCats[group]) f.settings.customCats[group] = [];
    f.settings.customCats[group].push(v);
  } else if (kind === "loc") {
    if (locsOf().indexOf(v) >= 0) { showToast("该位置已存在"); return; }
    f.settings.customLocs.push(v);
  } else {
    if (amountsOf().indexOf(v) >= 0) { showToast("该选项已存在"); return; }
    f.settings.customAmounts.push(v);
  }
  f.settings.rev = nowISO();
  DB.save(); fridgeScheduleSync();
  showToast("已添加「" + v + "」");
  showFridgeTaxonomy(group);
}

function fridgeRemoveCustom(kind, value, group) {
  var f = ensureFridge();
  var used = f.items.filter(function (it) {
    return kind === "cat" ? (it.cat === value) : kind === "loc" ? (it.loc === value) : (it.amount === value);
  }).length;
  if (used) { showToast("还有 " + used + " 件物品在用「" + value + "」，请先改掉"); return; }
  if (kind === "cat") {
    f.settings.customCats[group] = (f.settings.customCats[group] || []).filter(function (x) { return x !== value; });
  } else if (kind === "loc") {
    f.settings.customLocs = (f.settings.customLocs || []).filter(function (x) { return x !== value; });
  } else {
    f.settings.customAmounts = (f.settings.customAmounts || []).filter(function (x) { return x !== value; });
  }
  f.settings.rev = nowISO();
  DB.save(); fridgeScheduleSync();
  showFridgeTaxonomy(group);
}

function fridgeConsume(id) {
  var f = ensureFridge();
  var it = f.items.find(function (x) { return x.id === id; }); if (!it) return;
  it.usedUp = true; it.updatedAt = nowISO();
  if (!f.usedUpLogs) f.usedUpLogs = [];
  f.usedUpLogs.push({ id: uid(), itemId: it.id, name: it.name, date: today(), ts: Date.now(), restocked: false, restockedAt: null });
  pushFridgeLog("consume", it.name, "用完核销：" + it.name);
  DB.save(); fridgeScheduleSync(); render();
}

function fridgeDeleteItem(id) {
  var f = ensureFridge();
  var it = f.items.find(function (x) { return x.id === id; });
  if (!it) return;
  showConfirmDialog(
    "🗑️",
    "删除物品",
    "确定删除「" + escapeHtml(it.name) + "」？删除后将从物品库移除，并从其它设备同步清除。",
    [
      { text: "取消", cls: "btn-secondary", action: function () { closeModal(); } },
      { text: "删除", cls: "btn-primary", style: "background:var(--accent-red);color:white", action: function () {
        closeModal();
        f.items = f.items.filter(function (x) { return x.id !== id; });
        addTomb("growth.fridge.items", id); // 墓碑：确保删除跨端生效，不被旧云端快照还原
        pushFridgeLog("delete", it.name, "删除物品：" + it.name);
        DB.save(); fridgeScheduleSync(); render();
        showToast("已删除 📦");
      } }
    ]
  );
}

// ============================================================
// 模块2：保质期倒计时 & 智能预警
// ============================================================
function renderFridgeAlerts() {
  var f = ensureFridge();
  var expiring = sortItems(f.items.filter(function (it) { return itemStatus(it) === "临期" || itemStatus(it) === "已过期"; }));
  var red = f.items.filter(function (it) { var d = itemDaysLeft(it); return d != null && d >= 0 && d <= (f.settings.redDays || 3); }).length;
  var yellow = f.items.filter(function (it) { var d = itemDaysLeft(it); return d != null && d > (f.settings.redDays || 3) && d <= (f.settings.yellowDays || 7); }).length;
  var green = f.items.filter(function (it) { var d = itemDaysLeft(it); return d == null || d > (f.settings.yellowDays || 7); }).length;

  var todayList = expiring.map(function (it) {
    var d = itemDaysLeft(it);
    return '<div class="fr-alert-row">' +
      '<span class="fr-alert-dot ' + (itemStatus(it) === "已过期" ? "dot-red" : "dot-orange") + '"></span>' +
      '<span class="fr-alert-name">' + escapeHtml(it.name) + '</span>' +
      '<span class="fr-alert-days">' + (d < 0 ? "已过期" + Math.abs(d) + "天" : "剩" + d + "天") + '</span>' +
      '<button class="mini-btn" onclick="fridgeConsume(\'' + it.id + '\')">用掉</button>' +
      '</div>';
  }).join("") || '<div class="empty-state"><div class="empty-icon">✅</div><div class="empty-text">今天没有临期物品，棒！</div></div>';

  var html =
    '<div class="fr-stat-row">' +
    '<div class="fr-stat red"><div class="fr-stat-n">' + red + '</div><div class="fr-stat-l">紧急 0–' + (f.settings.redDays || 3) + '天</div></div>' +
    '<div class="fr-stat yellow"><div class="fr-stat-n">' + yellow + '</div><div class="fr-stat-l">优先 ' + ((f.settings.redDays || 3) + 1) + '–' + (f.settings.yellowDays || 7) + '天</div></div>' +
    '<div class="fr-stat green"><div class="fr-stat-n">' + green + '</div><div class="fr-stat-l">状态良好</div></div>' +
    '</div>' +
    '<div class="section-title"><span class="emoji">⏰</span> 今日临期物品清单</div>' +
    '<div class="card">' + todayList + '</div>' +
    '<div style="margin:10px 0 4px"><button class="btn btn-secondary" style="width:100%;padding:9px;font-size:13px" onclick="fridgeToggleReminder()">' + (f.reminderOn ? "🔔 每日提醒已开启（点此关闭）" : "🔕 开启每日临期提醒（浏览器通知）") + '</button></div>' +
    '<div style="margin:8px 0 4px"><button class="btn btn-secondary" style="width:100%;padding:8px;font-size:12px" onclick="fridgeDailyCardCheck(true)">📅 预览今日临期卡片（弹窗）</button></div>' +
    '<div class="section-title"><span class="emoji">📋</span> 全部预警（临期/过期置顶）</div>' +
    (expiring.length === 0 ? '<div class="empty-state"><div class="empty-icon">🟢</div><div class="empty-text">暂无临期物品</div></div>' :
      expiring.map(function (it) {
        var d = itemDaysLeft(it);
        return '<div class="fr-item"><div class="fr-item-main"><div class="fr-item-name">' + escapeHtml(it.name) + '</div>' +
          '<div class="fr-item-meta">' + escapeHtml(it.cat || "") + ' · 截止 ' + (it.expire || "—") + ' · ' + (d < 0 ? "已过期" + Math.abs(d) + "天" : "剩" + d + "天") + '</div></div>' +
          '<div class="fr-item-side">' + statusBadge(itemStatus(it)) + '<button class="mini-btn" onclick="fridgeConsume(\'' + it.id + '\')">核销</button></div></div>';
      }).join(""));
  return html;
}

function fridgeToggleReminder() {
  var f = ensureFridge();
  if (!f.reminderOn) {
    if (!("Notification" in window)) { showToast("当前浏览器不支持通知"); return; }
    Notification.requestPermission().then(function (p) {
      if (p === "granted") { f.reminderOn = true; DB.save(); renderFridge(); dailyFridgeReminder(true); showToast("已开启每日临期提醒"); }
      else showToast("未授权通知权限");
    });
  } else { f.reminderOn = false; DB.save(); renderFridge(); showToast("已关闭提醒"); }
}

function dailyFridgeReminder(force) {
  var f = ensureFridge();
  var expiring = f.items.filter(function (it) { return itemStatus(it) === "临期" || itemStatus(it) === "已过期"; });
  if (!expiring.length) return;
  if (!force && f.lastReminder === today()) return;
  f.lastReminder = today(); DB.save();
  if (f.reminderOn && "Notification" in window && Notification.permission === "granted") {
    var names = expiring.slice(0, 5).map(function (it) { return it.name; }).join("、");
    try { new Notification("📦 物品临期提醒", { body: "今日临期/过期：" + names + (expiring.length > 5 ? " 等" + expiring.length + "样" : "") }); } catch (e) {}
  }
}

// 每天固定时间弹一次「临期前 5 天」食材卡片
function fridgeDailyCardCheck(force) {
  try {
    var f = ensureFridge();
    var rt = f.settings.reminderTime || "09:00";
    var pp = String(rt).split(":");
    var rh = parseInt(pp[0], 10) || 9, rm = parseInt(pp[1], 10) || 0;
    var now = new Date();
    var passed = now.getHours() > rh || (now.getHours() === rh && now.getMinutes() >= rm);
    if (!passed && !force) return;
    if (f.lastDailyCard === today() && !force) return;
    var expiring = f.items.filter(function (it) {
      var d = itemDaysLeft(it);
      return d != null && d <= 5 && itemStatus(it) !== "已用完";
    }).sort(function (a, b) { return itemDaysLeft(a) - itemDaysLeft(b); });
    f.lastDailyCard = today(); DB.save();
    if (!expiring.length) return;
    showFridgeDailyCard(expiring);
  } catch (e) {}
}

function showFridgeDailyCard(list) {
  var rows = list.map(function (it) {
    var d = itemDaysLeft(it);
    var color = d < 0 ? "var(--accent-red)" : (d <= 3 ? "var(--accent-orange)" : "var(--accent-green)");
    var dl = d < 0 ? "已过期" + Math.abs(d) + "天" : "剩" + d + "天";
    return '<div class="fr-daily-row">' +
      '<div class="fr-daily-emoji">' + categoryEmoji(it.cat) + '</div>' +
      '<div class="fr-daily-main"><div class="fr-daily-name">' + escapeHtml(it.name) + '</div>' +
      '<div class="fr-daily-meta">' + escapeHtml(it.cat || "") + ' · ' + escapeHtml(it.loc || "") + ' · 截止 ' + (it.expire || "—") + '</div></div>' +
      '<div class="fr-daily-days" style="color:' + color + '">' + dl + '</div>' +
      '<button class="mini-btn" onclick="closeModal();fridgeConsume(\'' + it.id + '\')">用掉</button>' +
      '</div>';
  }).join("");
  showModal(
    '<div class="modal-title">📦 今日临期提醒（' + list.length + ' 样）</div>' +
    '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px">这些物品将在 5 天内到期，优先用掉别浪费 💡</div>' +
    '<div class="fr-daily-list">' + rows + '</div>' +
    '<div class="btn-row" style="margin-top:12px"><button class="btn btn-secondary" onclick="closeModal();setFridgeTab(\'alerts\')">查看全部预警</button><button class="btn btn-primary" onclick="closeModal()">知道了</button></div>'
  );
}

// ============================================================
// 模块3：AI 智能配餐
// ============================================================
var FRIDGE_TEMPLATES = [
  // ---- 蔬菜 ----
  { mainCat: "蔬菜", styles: ["通用", "家常", "清淡", "快手"], time: 6, serves: 2, helpers: ["调料"], name: function (m) { return "蒜蓉炒" + m; }, steps: function (m) { return ["热锅冷油下蒜末爆香", "放入" + m + "大火快炒2分钟", "加盐出锅"]; } },
  { mainCat: "蔬菜", styles: ["家常"], time: 8, serves: 2, helpers: ["蛋奶"], name: function (m, h) { return m + "炒蛋"; }, steps: function (m, h) { return ["" + m + "切段，" + (h[0] || "鸡蛋") + "打散", m + "焯水备用", "热油炒蛋盛出，再炒" + m + "，混合调味"]; } },
  { mainCat: "蔬菜", styles: ["清淡", "粤菜"], time: 5, serves: 2, helpers: [], name: function (m) { return "白灼" + m; }, steps: function (m) { return ["水开加少许油盐", m + "焯1分钟捞出", "淋生抽+蒸鱼豉油即可"]; } },
  { mainCat: "蔬菜", styles: ["减脂", "清淡", "云南菜"], time: 10, serves: 2, helpers: [], name: function (m) { return "凉拌" + m; }, steps: function (m) { return [m + "切丝焯熟过凉", "加醋、生抽、少许辣拌匀", "零油低卡"]; } },
  { mainCat: "蔬菜", styles: ["湖南菜", "减脂"], time: 8, serves: 2, helpers: [], name: function (m) { return "辣椒拌" + m; }, steps: function (m) { return [m + "焯熟过凉切段", "蒜末+辣椒粉淋热油", "加生抽醋拌匀"]; } },
  // ---- 肉类 ----
  { mainCat: "肉类", styles: ["家常", "湖南菜"], time: 25, serves: 3, helpers: ["蔬菜"], name: function (m, h) { return (h[0] || "青椒") + "炒" + m; }, steps: function (m, h) { return [m + "切片腌制，" + (h[0] || "青椒") + "切块", "热油滑炒" + m + "至变色", "下" + (h[0] || "青椒") + "翻炒调味"]; } },
  { mainCat: "肉类", styles: ["通用", "家常"], time: 35, serves: 3, helpers: ["蔬菜"], name: function (m, h) { return m + "炖" + (h[0] || "土豆"); }, steps: function (m, h) { return [m + "焯水，" + (h[0] || "土豆") + "切块", "同入锅加生抽老抽炖30分钟", "收汁即可"]; } },
  { mainCat: "肉类", styles: ["快手"], time: 12, serves: 2, helpers: [], name: function (m) { return "香煎" + m; }, steps: function (m) { return [m + "用盐胡椒腌5分钟", "平底锅少油中火煎两面", "出锅撒孜然"]; } },
  { mainCat: "肉类", styles: ["湖南菜", "家常"], time: 15, serves: 3, helpers: ["蔬菜"], name: function (m) { return "辣椒炒" + m; }, steps: function (m) { return [m + "切片，" + (h[0] || "青红椒") + "切圈", "热油爆香辣椒，下" + m + "大火炒", "生抽+少许酱油调味"]; } },
  { mainCat: "肉类", styles: ["祛火", "粤菜", "通用"], time: 40, serves: 3, helpers: ["蔬菜"], name: function (m, h) { return (h[0] || "冬瓜") + m + "汤"; }, steps: function (m, h) { return [m + "焯水，" + (h[0] || "冬瓜") + "切块", "同入锅加水炖35分钟", "加盐撒葱花，清润祛火"]; } },
  // ---- 海鲜 ----
  { mainCat: "海鲜", styles: ["清淡", "粤菜"], time: 12, serves: 2, helpers: [], name: function (m) { return "清蒸" + m; }, steps: function (m) { return [m + "洗净铺盘", "水开后蒸8分钟", "淋蒸鱼豉油撒葱丝"]; } },
  { mainCat: "海鲜", styles: ["家常", "清淡", "补钙"], time: 8, serves: 2, helpers: ["蛋奶"], name: function (m, h) { return m + "蒸蛋"; }, steps: function (m, h) { return [m + "处理干净，" + (h[0] || "鸡蛋") + "打散加1.5倍温水", "同蒸10分钟"]; } },
  { mainCat: "海鲜", styles: ["快手", "湖南菜"], time: 6, serves: 2, helpers: ["调料"], name: function (m) { return "蒜蓉" + m; }, steps: function (m) { return ["蒜末爆香", "下" + m + "快炒3分钟", "料酒生抽调味"]; } },
  { mainCat: "海鲜", styles: ["湖南菜"], time: 14, serves: 2, helpers: [], name: function (m) { return "剁椒" + m; }, steps: function (m) { return [m + "处理干净铺盘", "铺剁椒蒜末", "蒸10分钟淋热油"]; } },
  // ---- 蛋奶 ----
  { mainCat: "蛋奶", styles: ["通用", "家常", "快手"], time: 6, serves: 2, helpers: ["蔬菜"], name: function (m, h) { return (h[0] || "番茄") + "炒蛋"; }, steps: function (m, h) { return [(h[0] || "番茄") + "切块炒出汁", m + "打散炒熟", "混合加盐糖"]; } },
  { mainCat: "蛋奶", styles: ["快手", "通用"], time: 4, serves: 1, helpers: [], name: function (m) { return "煎" + m; }, steps: function (m) { return ["小火少油", m + "打入煎至定型", "撒黑胡椒"]; } },
  { mainCat: "蛋奶", styles: ["补钙", "清淡"], time: 12, serves: 2, helpers: [], name: function (m) { return "牛奶炖蛋"; }, steps: function (m) { return ["鸡蛋打散加等量温牛奶", "加盐少许蒸10分钟", "补钙首选"]; } },
  { mainCat: "蛋奶", styles: ["补钙", "清淡"], time: 15, serves: 2, helpers: ["蔬菜"], name: function (m, h) { return "豆腐" + (h[0] || "青菜") + "汤"; }, steps: function (m, h) { return ["豆腐切块，" + (h[0] || "青菜") + "切段", "加水煮开加盐", "补钙清淡"]; } },
  // ---- 熟食 ----
  { mainCat: "熟食", styles: ["通用"], time: 2, serves: 1, helpers: [], name: function (m) { return m + "（即食）"; }, steps: function (m) { return [m + "切片装盘", "配酱料直接吃"]; } },
  // ---- 半成品 ----
  { mainCat: "半成品", styles: ["快手"], time: 15, serves: 2, helpers: [], name: function (m) { return "空气炸" + m; }, steps: function (m) { return [m + "表面刷油", "空气炸锅180度12分钟", "中途翻面"]; } },
  { mainCat: "半成品", styles: ["通用"], time: 5, serves: 2, helpers: [], name: function (m) { return "微波" + m; }, steps: function (m) { return [m + "装盘覆保鲜膜扎孔", "微波炉中高火3分钟", "静置1分钟"]; } },
  // ---- 干货 ----
  { mainCat: "干货", styles: ["家常"], time: 20, serves: 2, helpers: ["蔬菜"], name: function (m, h) { return m + "烧" + (h[0] || "白菜"); }, steps: function (m, h) { return [m + "泡发，" + (h[0] || "白菜") + "切段", "同炒加生抽糖", "小火焖5分钟"]; } },
  { mainCat: "干货", styles: ["补钙", "粤菜", "祛火"], time: 25, serves: 2, helpers: [], name: function (m) { return "海带豆腐汤"; }, steps: function (m) { return ["海带泡发、豆腐切块", "同入锅加水煮20分钟", "补钙祛火"]; } },
  { mainCat: "干货", styles: ["祛火", "清淡"], time: 30, serves: 2, helpers: [], name: function (m) { return "银耳羹"; }, steps: function (m) { return ["银耳泡发撕小朵", "加水小火炖25分钟出胶", "加冰糖，润肺祛火"]; } },
  // ---- 水果 ----
  { mainCat: "水果", styles: ["祛火", "清淡"], time: 20, serves: 2, helpers: [], name: function (m) { return "冰糖雪" + m; }, steps: function (m) { return [m + "去核切块", "加冰糖和水炖15分钟", "润肺祛火"]; } },
  { mainCat: "水果", styles: ["通用"], time: 1, serves: 1, helpers: [], name: function (m) { return m + "（即食）"; }, steps: function (m) { return ["洗净", "直接吃"]; } },
  // ---- 饮料 ----
  { mainCat: "饮料", styles: ["通用"], time: 1, serves: 1, helpers: [], name: function (m) { return m + "（直接饮用）"; }, steps: function (m) { return ["冷藏取出", "倒杯即饮"]; } }
];

/* 家常菜谱库（直接点菜用）：name / 用时 / 人数 / 食材[名称,品类] / 步骤 */
var FRIDGE_RECIPES = [
  { name: "番茄炒蛋", time: 8, serves: 2, ingredients: [["番茄", "蔬菜"], ["鸡蛋", "蛋奶"]], steps: ["番茄切块，鸡蛋打散加少许盐", "热油炒蛋盛出", "下番茄炒出汁，倒回鸡蛋，加糖盐调味"] },
  { name: "青椒炒肉", time: 15, serves: 3, ingredients: [["青椒", "蔬菜"], ["猪肉", "肉类"]], steps: ["青椒切丝，肉切片用生抽淀粉腌 5 分钟", "热油滑炒肉片至变色盛出", "下青椒炒断生，倒回肉片调味"] },
  { name: "红烧肉", time: 60, serves: 3, ingredients: [["五花肉", "肉类"]], steps: ["五花肉切块焯水", "小火炒糖色，下肉块上色", "加生抽老抽料酒，加水没过炖 40 分钟，收汁"] },
  { name: "紫菜蛋花汤", time: 10, serves: 2, ingredients: [["紫菜", "干货"], ["鸡蛋", "蛋奶"]], steps: ["紫菜撕小块泡开", "水开淋入打散的蛋液成蛋花", "加盐香油，撒葱花"] },
  { name: "清蒸鲈鱼", time: 15, serves: 2, ingredients: [["鲈鱼", "海鲜"]], steps: ["鱼处理干净铺姜丝", "水开蒸 8 分钟", "倒掉汁水淋蒸鱼豉油，热油浇葱丝"] },
  { name: "蒜蓉西兰花", time: 8, serves: 2, ingredients: [["西兰花", "蔬菜"], ["大蒜", "蔬菜"]], steps: ["西兰花掰小朵焯水 1 分钟", "热油爆香蒜末", "下西兰花快炒，加盐出锅"] },
  { name: "土豆炖牛肉", time: 70, serves: 3, ingredients: [["土豆", "蔬菜"], ["牛肉", "肉类"]], steps: ["牛肉切块焯水，土豆切滚刀块", "牛肉加水姜片炖 50 分钟", "下土豆再炖 15 分钟，调味收汁"] },
  { name: "麻婆豆腐", time: 15, serves: 2, ingredients: [["豆腐", "蛋奶"], ["肉末", "肉类"]], steps: ["豆腐切块焯水去腥", "炒香肉末和豆瓣酱", "下豆腐加水淀粉勾芡，撒花椒粉"] },
  { name: "凉拌黄瓜", time: 5, serves: 2, ingredients: [["黄瓜", "蔬菜"], ["大蒜", "蔬菜"]], steps: ["黄瓜拍碎切段", "蒜末+生抽+醋+香油调汁", "淋上拌匀"] },
  { name: "可乐鸡翅", time: 30, serves: 2, ingredients: [["鸡翅", "肉类"]], steps: ["鸡翅两面煎金黄", "倒入可乐没过鸡翅", "中小火收汁至浓稠"] },
  { name: "冬瓜排骨汤", time: 60, serves: 3, ingredients: [["冬瓜", "蔬菜"], ["排骨", "肉类"]], steps: ["排骨焯水，冬瓜切块", "排骨加水姜片炖 40 分钟", "下冬瓜再炖 15 分钟，加盐"] },
  { name: "清炒时蔬", time: 5, serves: 2, ingredients: [["青菜", "蔬菜"]], steps: ["青菜洗净沥干", "热油大火快炒 1 分钟", "加盐出锅"] },
  { name: "香菇滑鸡", time: 30, serves: 3, ingredients: [["香菇", "蔬菜"], ["鸡肉", "肉类"]], steps: ["鸡块用生抽淀粉腌 10 分钟，香菇切片", "热油炒鸡块至变色", "下香菇同炒，加水焖 8 分钟"] },
  { name: "韭菜炒蛋", time: 8, serves: 2, ingredients: [["韭菜", "蔬菜"], ["鸡蛋", "蛋奶"]], steps: ["韭菜切段，鸡蛋打散", "热油炒蛋盛出", "下韭菜快炒，倒回鸡蛋调味"] },
  { name: "酸辣土豆丝", time: 10, serves: 2, ingredients: [["土豆", "蔬菜"], ["青椒", "蔬菜"]], steps: ["土豆切丝泡水去淀粉", "热油下干辣椒蒜末爆香", "大火快炒，加醋和盐"] },
  { name: "西红柿蛋汤", time: 10, serves: 2, ingredients: [["番茄", "蔬菜"], ["鸡蛋", "蛋奶"]], steps: ["番茄切块炒出汁", "加水烧开", "淋蛋液成花，加盐香油"] }
];
/* 纯调料（默认家家都有，不计入缺料清单） */
var FRIDGE_CONDIMENT = ["盐", "糖", "油", "食用油", "酱油", "生抽", "老抽", "醋", "料酒", "蚝油", "淀粉", "花椒", "八角", "桂皮", "香叶", "豆瓣酱", "甜面酱", "胡椒粉", "鸡精", "香油", "蒸鱼豉油", "可乐"];

function fridgeGenMeals() {
  var f = ensureFridge();
  var style = f.plan.style || "家常";
  // 配餐只取「食品」一级品类下的物品
  var avail = f.items.filter(function (it) {
    if ((it.group || "食品") !== "食品") return false;
    var s = itemStatus(it); return s !== "已用完" && s !== "已过期";
  });
  var byCat = {}; avail.forEach(function (it) { (byCat[it.cat] = byCat[it.cat] || []).push(it); });
  var expiring = avail.filter(function (it) { return itemStatus(it) === "临期"; }).sort(function (a, b) { return itemDaysLeft(a) - itemDaysLeft(b); });
  var others = avail.filter(function (it) { return itemStatus(it) !== "临期"; });
  var order = expiring.concat(others);

  function styleOk(t, st) {
    var styles = t.styles || [t.style || "通用"];
    if (styles.indexOf("通用") >= 0) return true;
    return styles.indexOf(st) >= 0;
  }
  function buildDish(pool, isBf) {
    for (var i = 0; i < pool.length; i++) {
      var main = pool[i];
      var cands = FRIDGE_TEMPLATES.filter(function (t) { return t.mainCat === main.cat && styleOk(t, style); });
      var matched = true;
      if (!cands.length) { cands = FRIDGE_TEMPLATES.filter(function (t) { return t.mainCat === main.cat; }); matched = false; }
      if (!cands.length) continue;
      // 早餐：只接受蒸/煮/煎/即食/炖等清淡做法，避免重口炒菜/凉拌
      if (isBf) {
        var bfCands = cands.filter(function (t) { return ["蒸", "煮", "煎", "即食", "炖"].indexOf(frTemplateMethod(t, main.name)) >= 0; });
        if (bfCands.length) cands = bfCands;
      }
      var t = cands[0];
      var helpers = (t.helpers || []).map(function (hc) { return (byCat[hc] && byCat[hc][0]) ? byCat[hc][0].name : null; });
      var needBuy = (t.helpers || []).filter(function (hc, idx) { return !helpers[idx]; });
      var baseName = t.name(main.name, helpers);
      var steps = t.steps(main.name, helpers).slice();
      var advanced = FRIDGE_BASE_STYLES.indexOf(style) < 0;
      var carries = (t.styles || []).indexOf(style) >= 0;
      if (advanced && !carries) {
        baseName = baseName + "（" + style + "风味）";
        steps.push("💡 按「" + style + "」手法调味（如加盐 / 辣 / 汤底 / 蘸水）");
      }
      return { name: baseName, time: t.time, serves: t.serves, steps: steps, consume: [main.name].concat(helpers.filter(Boolean)), needBuy: needBuy, mainCat: main.cat, style: style };
    }
    // 兜底：凉拌（早餐兜底则用清淡做法）
    if (pool[0]) return { name: (isBf ? "清炒" : "凉拌") + pool[0].name + (FRIDGE_BASE_STYLES.indexOf(style) < 0 ? "（" + style + "风味）" : ""), time: 5, serves: 2, steps: isBf ? ["洗净切好", "少油快炒/蒸熟", "少盐清淡调味"] : ["切好焯熟", "加生抽醋拌匀", "按「" + style + "」口味调味"], consume: [pool[0].name], needBuy: [], mainCat: pool[0].cat, style: style };
    return null;
  }

  function meal(pool, isBf) {
    var mains = pool.length ? pool : order;
    var d = buildDish(mains, isBf);
    return d;
  }

  // 早餐：蛋奶/主食/水果/饮料/半成品（排除熟食重口卤味，如无骨鸡爪）
  var breakfastPool = order.filter(function (it) { return ["蛋奶", "主食", "水果", "饮料", "半成品"].indexOf(it.cat) >= 0; }).concat(order);
  var bf = meal(breakfastPool, true);
  var lunch = meal(order);
  var dinner = meal(order.filter(function (it) { return it.cat !== "饮料"; }).concat(order));
  return { breakfast: bf, lunch: lunch, dinner: dinner, style: style, usedExpiring: expiring.map(function (it) { return it.name; }) };
}

/* ============================================================
 * 以下 renderFridgeMeals / 按需配餐 / 直接点菜 等函数为旧「配餐」tab 代码，
 * 自 v5.8.64 起已由独立「菜谱」模块（js/recipes.js）取代，本块已不可达，保留作历史参考。
 * ============================================================
 */
function renderFridgeMeals() {
  var f = ensureFridge();
  if (!fridgeMealsCache) fridgeMealsCache = fridgeGenMeals();
  var m = fridgeMealsCache;
  FRIDGE_DISH_SEQ = 0; FRIDGE_DISH_IDX = {};
  var custom = f.settings.customStyles || [];
  var stylesAll = FRIDGE_MEAL_STYLES.concat(custom);
  var styleSel = stylesAll.map(function (s) { return '<div class="chip' + (f.plan.style === s ? " active" : "") + '" onclick="setFridgeMealStyle(\'' + s + '\')">' + s + '</div>'; }).join("") +
    '<div class="chip" onclick="fridgeAddCustomStyle()">➕ 自定义菜系</div>';

  function idxFor(d) { var i = ++FRIDGE_DISH_SEQ; FRIDGE_DISH_IDX[i] = d.name; return i; }

  function dishCard(title, d) {
    if (!d) return '<div class="card"><div class="card-title">' + title + '</div><div class="card-body">暂无可用食材，先去「物品」里添加「食品」类物品吧～</div></div>';
    var di = idxFor(d);
    var link = (f.dishLinks && f.dishLinks[d.name]) || null;
    var consumeTags = d.consume.map(function (n) { return '<span class="badge badge-green">' + escapeHtml(n) + '</span>'; }).join(" ");
    var needTags = (d.needBuy && d.needBuy.length) ? d.needBuy.map(function (n) { return '<span class="badge badge-orange">需自备：' + n + '</span>'; }).join(" ") : "";
    var tut = "";
    if (link && link.img) tut += '<div style="margin-top:6px"><img class="dish-thumb" src="' + link.img + '" alt="效果图"></div>';
    tut += '<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">' +
      (link && link.url ? '<button class="btn btn-secondary" style="padding:5px 9px;font-size:12px" onclick="fridgeOpenDish(' + di + ')">▶ 看教程</button>' : "") +
      '<button class="btn btn-secondary" style="padding:5px 9px;font-size:12px" onclick="showFridgeTutorialModal(' + di + ')">' + (link && link.url ? "🔗 改教程" : "🔗 加教程") + '</button>' +
      '</div>' + (link && link.img ? '<div style="font-size:11px;color:var(--text-tertiary);margin-top:3px">🖼️ 已关联效果图，一键直达教程</div>' : "");
    return '<div class="card"><div class="flex-between"><div class="card-title">' + title + ' · ' + escapeHtml(d.name) + '</div><span class="badge badge-gray">' + d.time + '分钟 · ' + d.serves + '人</span></div>' +
      '<div class="card-body" style="line-height:1.7">' + d.steps.map(function (s, i) { return (i + 1) + '. ' + escapeHtml(s); }).join("<br>") + '</div>' +
      '<div style="margin-top:6px">消耗：' + consumeTags + '</div>' + (needTags ? '<div style="margin-top:4px">' + needTags + '</div>' : '') + tut + '</div>';
  }

  var expiringNote = (m.usedExpiring && m.usedExpiring.length) ? '<div class="fr-expire-note">🧠 已优先安排临期食材：' + m.usedExpiring.map(function (n) { return escapeHtml(n); }).join("、") + '</div>' : '';

  var customHtml = fridgeCustomResultHtml() + fridgeRecipeResultHtml();
  var historyHtml = fridgeMealHistoryHtml();

  return '<div class="filter-bar" style="flex-wrap:wrap">' + styleSel + '</div>' +
    '<div style="margin:6px 0;display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="btn btn-secondary" style="flex:1;min-width:110px;padding:9px;font-size:13px" onclick="fridgeRecipeForm()">🍽 直接点菜</button>' +
      '<button class="btn btn-secondary" style="flex:1;min-width:110px;padding:9px;font-size:13px" onclick="fridgeCustomMealForm()">✨ 按需求配餐</button>' +
      '<button class="btn btn-primary" style="flex:1;min-width:110px;padding:9px;font-size:13px" onclick="fridgeRegenerateMeals()">🔄 重新生成三餐</button>' +
    '</div>' +
    expiringNote +
    customHtml +
    '<div class="section-title"><span class="emoji">🌅</span> 早餐</div>' + dishCard("🍳", m.breakfast) +
    '<div class="section-title"><span class="emoji">☀️</span> 午餐</div>' + dishCard("🍲", m.lunch) +
    '<div class="section-title"><span class="emoji">🌙</span> 晚餐</div>' + dishCard("🍛", m.dinner) +
    historyHtml +
    '<div class="card" style="margin-top:10px;font-size:12px;color:var(--text-secondary)">💡 每道菜可「🔗 加教程」粘贴视频平台链接与效果图，下次直接一键跳转，不用再翻找。</div>';
}

/* ---------- 按需求一键配餐（口味 / 人数 / 指定食材 → 一餐 + 购买清单） ---------- */
function fridgeCustomMealForm() {
  var f = ensureFridge();
  var stylesAll = FRIDGE_MEAL_STYLES.concat(f.settings.customStyles || []);
  var chips = stylesAll.map(function (s) {
    return '<span class="chip' + (frCm.style === s ? " active" : "") + '" data-st="' + s + '" onclick="frCmStyle(this,\'' + frEscAttr(s) + '\')">' + escapeHtml(s) + '</span>';
  }).join("");
  var structModes = [
    { k: "auto", t: "均衡搭配" }, { k: "meat", t: "🥩 肉食为主" }, { k: "veg", t: "🥬 素食清淡" },
    { k: "cold", t: "🥗 凉拌为主" }, { k: "soup", t: "🍲 有汤" }, { k: "custom", t: "自定义" }
  ];
  var numRow = function (key, label) {
    return '<div class="fr-num" style="margin-right:14px"><span style="font-size:12px;color:var(--text-secondary);min-width:52px">' + label + '</span>' +
      '<button type="button" onclick="frCmStructNum(\'' + key + '\',-1)">−</button><span id="fr-cm-' + key + '">' + frCm[key] + '</span><button type="button" onclick="frCmStructNum(\'' + key + '\',1)">＋</button></div>';
  };
  showModal(
    '<div class="modal-title">✨ 按需求一键配餐</div>' +
    '<div class="lg-form" style="padding:14px 16px">' +
      '<div class="fr-fld"><span class="fr-lbl">🍜 口味 / 菜系</span><div class="fr-chipwrap" id="fr-cm-style">' + chips +
        '<span class="chip" data-st="custom" onclick="frCmStyle(this,\'\')">＋自定义</span></div>' +
        '<input class="form-input" id="fr-cm-style-custom" placeholder="自定义口味（如：日料 / 低GI）" style="display:none;margin-top:6px"></div>' +
      '<div class="fr-fld"><span class="fr-lbl">🍽 餐次</span><div class="fr-chipwrap">' +
        ["任意", "早餐", "午餐", "晚餐"].map(function (mt) {
          return '<span class="chip' + (frCm.meal === mt ? " active" : "") + '" data-mt="' + mt + '" onclick="frCmMeal(this,\'' + mt + '\')">' + mt + '</span>';
        }).join("") + '</div></div>' +
      '<div class="fr-fld"><span class="fr-lbl">👥 人数</span><div class="fr-num"><button type="button" onclick="frCmNum(-1)">−</button><span id="fr-cm-num">' + frCm.serves + '</span><button type="button" onclick="frCmNum(1)">＋</button></div></div>' +
      '<div class="fr-fld"><span class="fr-lbl">😋 想吃的大概菜（可选，如：鱼 / 番茄 / 辣的 / 鸡翅）</span><input class="form-input" id="fr-cm-wish" placeholder="没有具体食材要求可留空，自动用库存配"></div>' +
      '<div class="fr-fld"><span class="fr-lbl">🥬 指定已有食材（可选，逗号分隔）</span><input class="form-input" id="fr-cm-prefer" placeholder="如：鸡蛋, 西红柿"></div>' +
      '<div class="fr-fld"><span class="fr-lbl">🍳 菜品结构（几个炒菜 / 凉拌 / 素菜 / 汤）</span><div class="fr-chipwrap" id="fr-cm-struct">' +
        structModes.map(function (m) {
          return '<span class="chip' + (frCm.struct === m.k ? " active" : "") + '" data-st="' + m.k + '" onclick="frCmStruct(this,\'' + m.k + '\')">' + m.t + '</span>';
        }).join("") + '</div>' +
        '<div id="fr-cm-struct-num" style="display:' + (frCm.struct === "custom" ? "flex" : "none") + ';gap:6px;flex-wrap:wrap;margin-top:8px">' +
          numRow("stir", "炒菜") + numRow("cold", "凉拌") + numRow("veg", "素菜") + numRow("soup", "汤") +
        '</div></div>' +
      '<div class="fr-hint" style="font-size:11px;color:var(--text-tertiary)">早餐自动清淡搭配（蛋奶/主食/水果，蒸煮煎即食），不会出现重口凉菜；生成优先用库存（临期优先），缺的食材自动汇总成购买清单。</div>' +
    '</div>' +
    '<div class="btn-row" style="padding:0 16px 16px">' +
      '<button class="btn btn-primary" style="flex:1" onclick="fridgeCustomMealGenerate()">🍳 一键生成</button>' +
      '<button class="btn btn-secondary" style="flex:1" onclick="closeModal()">取消</button>' +
    '</div>'
  );
}
function frCmStyle(el, s) {
  frCm.style = s || "家常";
  var wrap = document.getElementById("fr-cm-style");
  if (wrap) wrap.querySelectorAll(".chip").forEach(function (c) { c.classList.remove("active"); });
  if (el) el.classList.add("active");
  var inp = document.getElementById("fr-cm-style-custom");
  if (inp) inp.style.display = (s === "" ? "" : "none");
}
function frCmNum(d) {
  frCm.serves = Math.max(1, Math.min(10, frCm.serves + d));
  var el = document.getElementById("fr-cm-num");
  if (el) el.textContent = frCm.serves;
}
function frCmMeal(el, mt) {
  frCm.meal = mt;
  el.parentNode.querySelectorAll(".chip").forEach(function (c) { c.classList.remove("active"); });
  el.classList.add("active");
}
function frCmStruct(el, k) {
  frCm.struct = k;
  var wrap = document.getElementById("fr-cm-struct");
  if (wrap) wrap.querySelectorAll(".chip").forEach(function (c) { c.classList.remove("active"); });
  if (el) el.classList.add("active");
  var num = document.getElementById("fr-cm-struct-num");
  if (num) num.style.display = (k === "custom" ? "flex" : "none");
}
function frCmStructNum(key, d) {
  frCm[key] = Math.max(0, Math.min(3, (frCm[key] || 0) + d));
  var el = document.getElementById("fr-cm-" + key);
  if (el) el.textContent = frCm[key];
}
function fridgeCustomMealGenerate() {
  var style = frCm.style;
  var custom = document.getElementById("fr-cm-style-custom");
  if (custom && custom.value.trim()) style = custom.value.trim();
  var wish = ((document.getElementById("fr-cm-wish") || {}).value || "").trim();
  var prefer = ((document.getElementById("fr-cm-prefer") || {}).value || "").split(/[,，]/).map(function (s) { return s.trim(); }).filter(Boolean);
  var r = fridgeBuildMeal({ style: style, serves: frCm.serves, prefer: prefer, wish: wish, meal: frCm.meal });
  fridgeCustomResult = r;
  closeModal();
  fridgeTab = "meals";
  renderFridge();
  showToast("已生成 " + r.dishes.length + " 道菜" + (r.shopping.length ? " · 缺 " + r.shopping.length + " 样食材" : " · 食材齐全"), r.shopping.length ? "warning" : "success");
}
/* ---------- 配餐工具 ---------- */
function frTemplateMethod(t, mainName) {
  var n = String(t.name(mainName, []) || "");
  if (n.indexOf("凉拌") >= 0 || n.indexOf("拌") >= 0) return "凉拌";
  if (n.indexOf("汤") >= 0 || n.indexOf("羹") >= 0) return "汤";
  if (n.indexOf("蒸") >= 0) return "蒸";
  if (n.indexOf("煎") >= 0) return "煎";
  if (n.indexOf("炸") >= 0) return "炸";
  if (n.indexOf("炖") >= 0) return "炖";
  if (n.indexOf("烤") >= 0) return "烤";
  if (n.indexOf("即食") >= 0) return "即食";
  return "炒";
}
/* 解析"想吃的大概菜"：名称子串 / 品类映射匹配库存 */
function frParseWish(wish, avail) {
  var out = [];
  if (!wish) return out;
  var keys = String(wish).split(/[,，、\s/]+/).map(function (s) { return s.trim(); }).filter(Boolean);
  var catMap = { "鱼": "海鲜", "虾": "海鲜", "蟹": "海鲜", "贝": "海鲜", "鸡": "肉类", "鸭": "肉类", "猪": "肉类", "牛": "肉类", "羊": "肉类", "肉": "肉类", "蛋": "蛋奶", "奶": "蛋奶", "豆腐": "蛋奶", "豆": "蛋奶", "番茄": "蔬菜", "土豆": "蔬菜", "青菜": "蔬菜", "黄瓜": "蔬菜", "白菜": "蔬菜", "萝卜": "蔬菜", "青椒": "蔬菜", "辣椒": "蔬菜", "菇": "蔬菜", "水果": "水果", "苹果": "水果", "西瓜": "水果" };
  keys.forEach(function (k) {
    if (k === "辣" || k === "辣的" || k === "酸" || k === "甜") return;   // 口味词交给菜系/风格
    var found = null;
    for (var i = 0; i < avail.length; i++) if (avail[i].name.indexOf(k) !== -1) { found = avail[i]; break; }
    if (found) { if (out.indexOf(found) === -1) out.push(found); return; }
    var cat = catMap[k];
    if (cat) {
      for (var j = 0; j < avail.length; j++) if (avail[j].cat === cat) { if (out.indexOf(avail[j]) === -1) out.push(avail[j]); break; }
    }
  });
  return out;
}
/* 结构计划：{method, veg}[]；早餐单菜清淡模式 */
function frStructPlan(mode, st, serves, isBreakfast) {
  var plan = [];
  function add(method, veg, n) { for (var i = 0; i < n; i++) plan.push({ method: method, veg: veg }); }
  if (isBreakfast) { add("早餐", false, 1); return plan; }
  if (mode === "custom") {
    add("炒", false, st.stir || 0); add("凉拌", true, st.cold || 0); add("炒", true, st.veg || 0); add("汤", true, st.soup || 0);
    return plan.slice(0, 4);
  }
  if (mode === "meat") { add("炒", false, 2); add("炒", true, 1); return plan; }
  if (mode === "veg") { add("炒", true, 1); add("凉拌", true, 1); add("汤", true, 1); return plan; }
  if (mode === "cold") { add("凉拌", true, 2); add("炒", true, 1); return plan; }
  if (mode === "soup") { add("汤", true, 1); add("炒", false, 1); add("炒", true, 1); return plan; }
  if (serves >= 4) { add("炒", false, 1); add("炒", true, 1); add("凉拌", true, 1); }
  else { add("炒", false, 1); add("炒", true, 1); }
  return plan;
}
/* 生成一道菜：按方法/荤素找食材+模板，返回 dish 或 null */
function frBuildOneDish(pool, plan, style, byCat, usedNames, serves) {
  var method = plan.method, veg = plan.veg;
  var isBf = method === "早餐";
  var catOk = isBf ? function (c) { return ["蛋奶", "主食", "水果", "饮料", "半成品"].indexOf(c) >= 0; } : null;
  var main = null;
  function pick(pred) {
    for (var i = 0; i < pool.length; i++) { var it = pool[i]; if (usedNames[it.name]) continue; if (pred(it)) return it; }
    return null;
  }
  main = pick(function (it) {
    if (isBf) return catOk(it.cat);
    if (veg) return it.cat === "蔬菜" || it.cat === "蛋奶" || it.cat === "水果" || it.cat === "干货";
    return it.cat === "肉类" || it.cat === "海鲜";
  });
  if (!main) main = pick(function () { return true; });
  if (!main) return null;
  function styleOk(t, st) { var styles = t.styles || [t.style || "通用"]; if (styles.indexOf("通用") >= 0) return true; return styles.indexOf(st) >= 0; }
  var cands = FRIDGE_TEMPLATES.filter(function (t) { return t.mainCat === main.cat && styleOk(t, style); });
  if (!cands.length) cands = FRIDGE_TEMPLATES.filter(function (t) { return t.mainCat === main.cat; });
  var wants = isBf ? ["蒸", "煮", "煎", "即食", "炖"] : [method, "炒", "炖", "蒸"];
  var picked = null;
  for (var m = 0; m < wants.length && !picked; m++) {
    for (var t2 = 0; t2 < cands.length; t2++) if (frTemplateMethod(cands[t2], main.name) === wants[m]) { picked = cands[t2]; break; }
  }
  if (!picked && cands.length) picked = cands[0];
  if (!picked) return null;
  var t = picked;
  var helpers = (t.helpers || []).map(function (hc) { return (byCat[hc] && byCat[hc][0]) ? byCat[hc][0].name : null; });
  var needBuy = (t.helpers || []).filter(function (hc, idx) { return !helpers[idx]; });
  var baseName = t.name(main.name, helpers);
  var steps = t.steps(main.name, helpers).slice();
  var advanced = FRIDGE_BASE_STYLES.indexOf(style) < 0;
  var carries = (t.styles || []).indexOf(style) >= 0;
  if (advanced && !carries) { baseName += "（" + style + "风味）"; steps.push("💡 按「" + style + "」手法调味（如加盐/辣/汤底/蘸水）"); }
  var ratio = Math.max(1, Math.round(serves / (t.serves || 2)));
  if (ratio > 1) steps.push("👥 " + serves + " 人份：食材量约 ×" + ratio);
  usedNames[main.name] = true;
  return { name: baseName, time: t.time, serves: serves, steps: steps, consume: [main.name].concat(helpers.filter(Boolean)), needBuy: needBuy, mainCat: main.cat, style: style, method: frTemplateMethod(t, main.name) };
}
/* 核心生成：口味/人数/想吃的大概菜/指定食材/结构 → 一餐（缺料汇总购买清单） */
function fridgeBuildMeal(opts) {
  var f = ensureFridge();
  var style = opts.style || f.plan.style || "家常";
  var serves = opts.serves || 2;
  var prefer = (opts.prefer || []).filter(Boolean);
  var wish = opts.wish || "";
  var meal = opts.meal || "任意";
  var isBreakfast = meal === "早餐";
  var avail = f.items.filter(function (it) {
    if ((it.group || "食品") !== "食品") return false;
    var s = itemStatus(it); return s !== "已用完" && s !== "已过期";
  });
  avail.sort(function (a, b) {
    var sa = itemStatus(a) === "临期" ? 0 : 1, sb = itemStatus(b) === "临期" ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return (itemDaysLeft(a) || 999) - (itemDaysLeft(b) || 999);
  });
  var pool = [];
  function addIt(it) { if (it && pool.indexOf(it) === -1) pool.push(it); }
  prefer.forEach(function (p) { for (var i = 0; i < avail.length; i++) if (avail[i].name === p) { addIt(avail[i]); break; } });
  frParseWish(wish, avail).forEach(addIt);
  avail.forEach(addIt);
  var byCat = {}; pool.forEach(function (it) { (byCat[it.cat] = byCat[it.cat] || []).push(it); });

  var plan = frStructPlan(frCm.struct, { stir: frCm.stir, cold: frCm.cold, veg: frCm.veg, soup: frCm.soup }, serves, isBreakfast);
  var dishes = []; var usedNames = {};
  plan.forEach(function (p) {
    var d = frBuildOneDish(pool, p, style, byCat, usedNames, serves);
    if (d) dishes.push(d);
  });
  // 结构计划未满时补菜（食材充足则补到计划数，上限 3）
  if (dishes.length < plan.length && dishes.length < 3) {
    for (var i = 0; i < pool.length && dishes.length < Math.min(plan.length, 3); i++) {
      var it = pool[i];
      if (usedNames[it.name]) continue;
      var isVeg = it.cat === "蔬菜" || it.cat === "蛋奶" || it.cat === "水果" || it.cat === "干货";
      var d2 = frBuildOneDish(pool, { method: "炒", veg: isVeg }, style, byCat, usedNames, serves);
      if (d2 && dishes.indexOf(d2) === -1) dishes.push(d2);
    }
  }
  if (!dishes.length && pool.length) {
    var m0 = pool[0];
    dishes.push({ name: "凉拌" + m0.name + (FRIDGE_BASE_STYLES.indexOf(style) < 0 ? "（" + style + "风味）" : ""), time: 5, serves: serves, steps: ["切好焯熟", "加生抽醋拌匀", "按「" + style + "」口味调味"], consume: [m0.name], needBuy: [], mainCat: m0.cat, style: style });
  }
  var needMap = {};
  dishes.forEach(function (d) { (d.needBuy || []).forEach(function (n) { needMap[n] = (needMap[n] || 0) + 1; }); });
  return { dishes: dishes, shopping: Object.keys(needMap), style: style, serves: serves, meal: meal, fromStock: pool.length };
}
function fridgeCustomResultHtml() {
  if (!fridgeCustomResult) return "";
  var cr = fridgeCustomResult;
  var h = '<div class="section-title"><span class="emoji">✨</span> 按需配餐（' + escapeHtml(cr.style) + ' · ' + cr.serves + ' 人）</div>';
  if (!cr.dishes.length) {
    h += '<div class="card"><div class="card-body">库存里没有可用食材，先去「物品」添加「食品」类物品吧～</div></div>';
  } else {
    cr.dishes.forEach(function (d) {
      var consumeTags = d.consume.map(function (n) { return '<span class="badge badge-green">' + escapeHtml(n) + '</span>'; }).join(" ");
      var needTags = (d.needBuy && d.needBuy.length) ? d.needBuy.map(function (n) { return '<span class="badge badge-orange">需自备：' + escapeHtml(n) + '</span>'; }).join(" ") : "";
      h += '<div class="card"><div class="flex-between"><div class="card-title">🍽 ' + escapeHtml(d.name) + '</div><span class="badge badge-gray">' + d.time + '分钟 · ' + d.serves + '人</span></div>' +
        '<div class="card-body" style="line-height:1.7">' + d.steps.map(function (s, i) { return (i + 1) + '. ' + escapeHtml(s); }).join("<br>") + '</div>' +
        '<div style="margin-top:6px">消耗：' + consumeTags + '</div>' + (needTags ? '<div style="margin-top:4px">' + needTags + '</div>' : '') + '</div>';
    });
  }
  if (cr.shopping.length) {
    h += '<div class="card fr-shop">' +
      '<div class="card-title">🛒 购买清单（缺 ' + cr.shopping.length + ' 样）</div>' +
      '<div class="fr-shop-list">' + cr.shopping.map(function (n) {
        return '<div class="fr-shop-item"><span>' + escapeHtml(n) + '</span>' +
          '<button class="btn btn-secondary" style="padding:4px 10px;font-size:12px" onclick="fridgeAddShoppingItem(\'' + frEscAttr(n) + '\')">➕ 添加到物品</button></div>';
      }).join("") + '</div>' +
      '<button class="btn btn-secondary" style="width:100%;margin-top:8px;padding:8px;font-size:13px" onclick="fridgeCopyShoppingList()">📋 复制购买清单</button>' +
      '</div>';
  }
  h += '<div style="text-align:center;margin:4px 0 10px;display:flex;gap:8px;justify-content:center">' +
    '<button class="btn btn-secondary" style="padding:6px 14px;font-size:12px" onclick="fridgeCustomResult=null;renderFridge()">收起</button>' +
    '<button class="btn btn-secondary" style="padding:6px 14px;font-size:12px" onclick="fridgeCustomMealForm()">✨ 重新配餐</button>' +
    '</div>';
  return h;
}
function fridgeAddShoppingItem(name) {
  showFridgeItemModal(null, { name: name, group: "食品" });
}
function fridgeCopyShoppingList() {
  if (!fridgeCustomResult || !fridgeCustomResult.shopping.length) return;
  var txt = "🛒 购买清单：" + fridgeCustomResult.shopping.join("、");
  try {
    var ta = document.createElement("textarea");
    ta.value = txt; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  } catch (e) {}
  showToast("已复制购买清单", "success");
}
function frEscAttr(s) { return String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, "&quot;"); }

/* ============================================================
 * 直接点菜配餐：描述想吃的菜 → 拆食材 → 对照库存 → 购物清单 → 保存这顿饭
 * ============================================================ */
function fridgeRecipeForm() {
  var chips = FRIDGE_RECIPES.map(function (r, i) {
    return '<span class="chip" data-ri="' + i + '" onclick="frRecipePick(' + i + ')">' + escapeHtml(r.name) + '</span>';
  }).join("");
  showModal(
    '<div class="modal-title">🍽 直接点菜配餐</div>' +
    '<div class="lg-form" style="padding:14px 16px">' +
      '<div class="fr-fld"><span class="fr-lbl">😋 想吃的菜（可多个，用逗号/顿号/换行分隔；或直接点下方菜谱）</span>' +
        '<textarea class="lg-input lg-textarea" id="fr-recipe-input" placeholder="如：番茄炒蛋、红烧肉、紫菜蛋花汤" style="min-height:56px"></textarea></div>' +
      '<div class="fr-fld"><span class="fr-lbl">📖 内置家常菜谱（点击加入）</span><div class="fr-chipwrap">' + chips + '</div></div>' +
      '<div class="fr-hint" style="font-size:11px;color:var(--text-tertiary)">生成后自动对照库存：已有食材标 ✓，缺的汇总成购物清单；可一键「保存这顿饭」留档。</div>' +
    '</div>' +
    '<div class="btn-row" style="padding:0 16px 16px">' +
      '<button class="btn btn-primary" style="flex:1" onclick="fridgeRecipeGenerate()">🍳 生成 + 购物清单</button>' +
      '<button class="btn btn-secondary" style="flex:1" onclick="closeModal()">取消</button>' +
    '</div>'
  );
}
function frRecipePick(i) {
  var r = FRIDGE_RECIPES[i];
  if (!r) return;
  var inp = document.getElementById("fr-recipe-input");
  if (!inp) return;
  var cur = inp.value.trim();
  inp.value = cur ? cur + "、" + r.name : r.name;
}
function fridgeRecipeGenerate() {
  var input = ((document.getElementById("fr-recipe-input") || {}).value || "").trim();
  if (!input) { showToast("请先输入想吃的菜", "warning"); return; }
  var r = fridgeRecipePlan(input);
  fridgeRecipeResult = r;
  closeModal();
  fridgeTab = "meals";
  renderFridge();
  showToast("已解析 " + r.dishes.length + " 道菜 · 缺 " + r.missing.length + " 样食材", r.missing.length ? "warning" : "success");
}
/* 核心：解析菜名 → 菜谱 → 拆食材 → 对照库存 → 缺料清单 */
function fridgeRecipePlan(inputText) {
  var f = ensureFridge();
  var names = String(inputText || "").split(/[,，、\n]+/).map(function (s) { return s.trim(); }).filter(Boolean);
  var dishes = [];
  names.forEach(function (n) {
    var r = null;
    for (var i = 0; i < FRIDGE_RECIPES.length; i++) {
      if (FRIDGE_RECIPES[i].name === n || FRIDGE_RECIPES[i].name.indexOf(n) !== -1 || n.indexOf(FRIDGE_RECIPES[i].name) !== -1) { r = FRIDGE_RECIPES[i]; break; }
    }
    if (r) { if (dishes.indexOf(r) === -1) dishes.push(r); }
    else dishes.push({ name: n, time: 0, serves: 2, ingredients: [], steps: ["（「" + n + "」不在内置菜谱，可在下方手动补充所需食材）"], custom: true });
  });
  // 拆食材（去重；纯调料不算缺）
  var ingMap = {};
  dishes.forEach(function (d) {
    (d.ingredients || []).forEach(function (ing) {
      var k = ing[0];
      if (FRIDGE_CONDIMENT.indexOf(k) >= 0) return;
      if (!ingMap[k]) ingMap[k] = { cat: ing[1] || "", cnt: 0 };
      ingMap[k].cnt++;
    });
  });
  var stock = f.items.filter(function (it) {
    if ((it.group || "食品") !== "食品") return false;
    var s = itemStatus(it); return s !== "已用完" && s !== "已过期";
  });
  var have = [], missing = [];
  Object.keys(ingMap).forEach(function (k) {
    var found = null;
    for (var i = 0; i < stock.length; i++) if (stock[i].name === k || stock[i].name.indexOf(k) !== -1 || k.indexOf(stock[i].name) !== -1) { found = stock[i]; break; }
    if (found) have.push({ name: k, stock: found.name });
    else missing.push(k);
  });
  return { dishes: dishes, have: have, missing: missing, name: dishes.map(function (d) { return d.name; }).join(" + ") };
}
function fridgeRecipeResultHtml() {
  if (!fridgeRecipeResult) return "";
  var r = fridgeRecipeResult;
  var h = '<div class="section-title"><span class="emoji">🍽</span> 这顿饭 · ' + escapeHtml(r.name) + '</div>';
  r.dishes.forEach(function (d) {
    var ing = (d.ingredients || []).map(function (x) { return '<span class="badge badge-gray">' + escapeHtml(x[0]) + '</span>'; }).join(" ");
    h += '<div class="card"><div class="flex-between"><div class="card-title">🥘 ' + escapeHtml(d.name) + '</div>' +
      (d.time ? '<span class="badge badge-gray">' + d.time + '分钟 · ' + d.serves + '人</span>' : '') + '</div>' +
      '<div class="card-body" style="line-height:1.7">' + (d.steps || []).map(function (s, i) { return (i + 1) + '. ' + escapeHtml(s); }).join("<br>") + '</div>' +
      (ing ? '<div style="margin-top:6px">食材：' + ing + '</div>' : '') + '</div>';
  });
  h += '<div class="card"><div class="card-title">📦 库存对照</div>' +
    '<div style="font-size:13px;line-height:2">' +
      (r.have.length ? '✅ 已有：' + r.have.map(function (x) { return '<span class="badge badge-green">' + escapeHtml(x.stock) + '</span>'; }).join(" ") : '<span class="lg-hint">（没有匹配到库存）</span>') +
      '<br>🛒 缺：' + (r.missing.length ? r.missing.map(function (n) { return '<span class="badge badge-orange">' + escapeHtml(n) + '</span>'; }).join(" ") : '<span class="badge badge-green">无缺料，食材齐全！</span>') +
    '</div></div>';
  if (r.missing.length) {
    h += '<div class="card fr-shop"><div class="card-title">🛒 购物清单（缺 ' + r.missing.length + ' 样）</div>' +
      '<div class="fr-shop-list">' + r.missing.map(function (n) {
        return '<div class="fr-shop-item"><span>' + escapeHtml(n) + '</span>' +
          '<button class="btn btn-secondary" style="padding:4px 10px;font-size:12px" onclick="fridgeAddShoppingItem(\'' + frEscAttr(n) + '\')">➕ 添加到物品</button></div>';
      }).join("") + '</div>' +
      '<button class="btn btn-secondary" style="width:100%;margin-top:8px;padding:8px;font-size:13px" onclick="fridgeCopyRecipeShopping()">📋 复制购物清单</button></div>';
  }
  h += '<div style="text-align:center;margin:4px 0 10px;display:flex;gap:8px;justify-content:center">' +
    '<button class="btn btn-primary" style="padding:6px 14px;font-size:12px" onclick="fridgeSaveMeal()">💾 保存这顿饭</button>' +
    '<button class="btn btn-secondary" style="padding:6px 14px;font-size:12px" onclick="fridgeRecipeResult=null;renderFridge()">收起</button>' +
    '<button class="btn btn-secondary" style="padding:6px 14px;font-size:12px" onclick="fridgeRecipeForm()">🍽 再点一餐</button>' +
    '</div>';
  return h;
}
function fridgeCopyRecipeShopping() {
  if (!fridgeRecipeResult || !fridgeRecipeResult.missing.length) return;
  var txt = "🛒 购物清单（" + fridgeRecipeResult.name + "）：" + fridgeRecipeResult.missing.join("、");
  try {
    var ta = document.createElement("textarea");
    ta.value = txt; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  } catch (e) {}
  showToast("已复制购物清单", "success");
}
/* 保存这顿饭 → 历史记录 */
function fridgeSaveMeal() {
  if (!fridgeRecipeResult) return;
  var f = ensureFridge();
  f.settings.mealsHistory = f.settings.mealsHistory || [];
  f.settings.mealsHistory.unshift({
    id: uid(),
    date: new Date().toISOString(),
    name: fridgeRecipeResult.name,
    dishes: fridgeRecipeResult.dishes,
    have: fridgeRecipeResult.have,
    missing: fridgeRecipeResult.missing
  });
  if (f.settings.mealsHistory.length > 20) f.settings.mealsHistory.pop();
  DB.save(); renderFridge();
  showToast("已保存这顿饭 📝", "success");
}
/* 历史配餐记录区（配餐 tab 底部） */
function fridgeMealHistoryHtml() {
  var f = ensureFridge();
  var list = f.settings.mealsHistory || [];
  if (!list.length) return "";
  var h = '<div class="section-title"><span class="emoji">📚</span> 这顿饭记录（' + list.length + '）</div>';
  list.slice(0, 8).forEach(function (m) {
    var d = (m.date || "").slice(5, 10).replace("-", "/");
    h += '<div class="lg-mat" style="margin-bottom:8px" onclick="fridgeShowMealRecord(\'' + m.id + '\')">' +
      '<div class="lg-mat-title">🍽 ' + escapeHtml(m.name) + '</div>' +
      '<div class="lg-mat-meta">' + d + ' · 缺 ' + (m.missing || []).length + ' 样</div></div>';
  });
  return h;
}
function fridgeShowMealRecord(id) {
  var f = ensureFridge();
  var m = null;
  (f.settings.mealsHistory || []).forEach(function (x) { if (x.id === id) m = x; });
  if (!m) return;
  var dishesHtml = (m.dishes || []).map(function (d) {
    return '<div style="padding:8px 0;border-bottom:1px solid var(--border-color)"><b>🥘 ' + escapeHtml(d.name) + '</b>' +
      (d.ingredients && d.ingredients.length ? '<div style="font-size:12px;color:var(--text-tertiary);margin-top:3px">食材：' + d.ingredients.map(function (x) { return escapeHtml(x[0]); }).join("、") + '</div>' : '') +
      (d.steps && d.steps.length ? '<div style="font-size:12px;color:var(--text-secondary);margin-top:3px;line-height:1.7">' + d.steps.map(function (s, i) { return (i + 1) + '. ' + escapeHtml(s); }).join("<br>") + '</div>' : '') +
      '</div>';
  }).join("");
  var missingHtml = (m.missing && m.missing.length)
    ? '<div style="margin-top:8px">🛒 当时缺：' + m.missing.map(function (n) { return '<span class="badge badge-orange">' + escapeHtml(n) + '</span>'; }).join(" ") + '</div>' : '';
  showModal(
    '<div class="modal-title">📝 ' + escapeHtml(m.name) + '</div>' +
    '<div style="padding:8px 16px;max-height:55vh;overflow-y:auto">' + dishesHtml + missingHtml + '</div>' +
    '<div class="btn-row" style="padding:0 16px 16px">' +
      '<button class="btn btn-primary" style="flex:1" onclick="fridgeMealAgain(\'' + m.id + '\')">🍽 再次点这顿</button>' +
      '<button class="btn btn-secondary" style="flex:1" onclick="fridgeDelMealRecord(\'' + m.id + '\');closeModal()">🗑 删除</button>' +
    '</div>'
  );
}
function fridgeMealAgain(id) {
  var f = ensureFridge();
  var m = null;
  (f.settings.mealsHistory || []).forEach(function (x) { if (x.id === id) m = x; });
  if (!m) return;
  fridgeRecipeResult = { dishes: m.dishes || [], have: m.have || [], missing: m.missing || [], name: m.name };
  closeModal();
  fridgeTab = "meals";
  renderFridge();
}
function fridgeDelMealRecord(id) {
  var f = ensureFridge();
  f.settings.mealsHistory = (f.settings.mealsHistory || []).filter(function (x) { return x.id !== id; });
  DB.save(); renderFridge();
}

function setFridgeMealStyle(s) { var f = ensureFridge(); f.plan.style = s; f.plan.rev = nowISO(); DB.save(); fridgeMealsCache = null; renderFridge(); }
function fridgeRegenerateMeals() { fridgeMealsCache = fridgeGenMeals(); renderFridge(); }

function fridgeAddCustomStyle() {
  var s = prompt("添加自定义菜系 / 做法，如：日料、低GI、川菜、宝宝辅食");
  if (!s) return; s = s.trim(); if (!s) return;
  var f = ensureFridge();
  f.settings.customStyles = f.settings.customStyles || [];
  if (f.settings.customStyles.indexOf(s) < 0) f.settings.customStyles.push(s);
  f.plan.style = s; f.plan.rev = nowISO();
  DB.save(); fridgeMealsCache = null; renderFridge(); showToast("已添加自定义菜系：" + s);
}

function fridgeOpenDish(di) {
  var name = FRIDGE_DISH_IDX[di]; if (!name) return;
  var f = ensureFridge();
  var link = (f.dishLinks && f.dishLinks[name]) || {};
  if (link.url) { try { window.open(link.url, "_blank"); } catch (e) {} }
  else showToast("「" + name + "」还没有关联教程链接");
}

function showFridgeTutorialModal(di) {
  var name = FRIDGE_DISH_IDX[di]; if (!name) return;
  var f = ensureFridge();
  var existing = (f.dishLinks && f.dishLinks[name]) || {};
  showModal(
    '<div class="modal-title">🔗 关联教程：' + escapeHtml(name) + '</div>' +
    '<form onsubmit="submitFridgeTutorial(event,\'' + di + '\')">' +
    '<div class="form-group"><div class="form-label">教程链接（视频平台 / B站 / 抖音 / YouTube 等）</div><input class="form-input" name="url" value="' + escapeHtml(existing.url || "") + '" placeholder="https://..."></div>' +
    '<div class="form-group"><div class="form-label">效果图图片链接（可选，粘贴图片 URL）</div><input class="form-input" name="img" value="' + escapeHtml(existing.img || "") + '" placeholder="https://.../dish.jpg"></div>' +
    '<div class="btn-row"><button type="button" class="btn btn-secondary" onclick="closeModal()">取消</button><button type="submit" class="btn btn-primary">保存</button></div>' +
    '</form>'
  );
}

function submitFridgeTutorial(event, di) {
  event.preventDefault();
  var name = FRIDGE_DISH_IDX[di]; if (!name) { closeModal(); return; }
  var fd = new FormData(event.target);
  var f = ensureFridge();
  f.dishLinks = f.dishLinks || {};
  var url = (fd.get("url") || "").trim();
  var img = (fd.get("img") || "").trim();
  if (!url && !img) { delete f.dishLinks[name]; }
  else f.dishLinks[name] = { url: url, img: img };
  DB.save(); closeModal(); renderFridge(); showToast("教程已关联，下次一键直达 ✅");
}

// ============================================================
// 模块4：家人实时同步（Supabase 共享表）
// ============================================================
function getFridgeClient() {
  if (!window.supabase || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  if (!fridgeClient) { try { fridgeClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); } catch (e) { return null; } }
  return fridgeClient;
}

function mergeArr(a, b, key, ts) {
  var map = {};
  a.concat(b).forEach(function (x) { var k = x[key]; var ex = map[k]; if (!ex || (x[ts] || "") >= (ex[ts] || "")) map[k] = x; });
  return Object.keys(map).map(function (k) { return map[k]; });
}
function mergeLogs(a, b) {
  var seen = {}, out = [];
  a.concat(b).forEach(function (l) { var k = (l.date || "") + (l.actor || "") + (l.action || "") + (l.item || ""); if (!seen[k]) { seen[k] = 1; out.push(l); } });
  return out;
}
function mergeStrArr(a, b) {
  var out = (a || []).slice();
  (b || []).forEach(function (x) { if (out.indexOf(x) < 0) out.push(x); });
  return out;
}
function mergeObj(a, b) {
  var m = Object.assign({}, a);
  Object.keys(b || {}).forEach(function (k) { if (b[k]) m[k] = b[k]; });
  return m;
}
function mergeFridgeState(local, remote) {
  if (!remote) return local;
  var m = Object.assign({}, local);
  m.items = mergeArr(local.items || [], remote.items || [], "id", "updatedAt");
  m.logs = mergeLogs(local.logs || [], remote.logs || []);
  m.shopping = mergeArr(local.shopping || [], remote.shopping || [], "id", "addedAt");
  // 扫码缓存/记录/暂存：全家庭实时同步（缓存取并集，记录按 id 保留较新，暂存取并集）
  m.scanCache = mergeObj(local.scanCache || {}, remote.scanCache || {});
  m.scanLog = mergeArr(local.scanLog || [], remote.scanLog || [], "id", "time");
  m.pendingScans = mergeStrArr(local.pendingScans || [], remote.pendingScans || []);
  // 阈值等标量取 rev 较新的一方；自定义选项取并集，避免一方新增的品类被另一方覆盖丢失
  var ls = local.settings || {}, rs = remote.settings || {};
  var base = Object.assign({}, ((rs.rev || "") >= (ls.rev || "")) ? rs : ls);
  base.customStyles = mergeStrArr(ls.customStyles, rs.customStyles);
  base.customLocs = mergeStrArr(ls.customLocs, rs.customLocs);
  base.customAmounts = mergeStrArr(ls.customAmounts, rs.customAmounts);
  var cc = {}, lc = ls.customCats || {}, rc = rs.customCats || {};
  Object.keys(lc).concat(Object.keys(rc)).forEach(function (g) {
    if (cc[g]) return;
    var merged = mergeStrArr(lc[g], rc[g]);
    if (merged.length) cc[g] = merged;
  });
  base.customCats = cc;
  m.settings = base;
  return m;
}

async function fridgeSyncNow() {
  var f = ensureFridge();
  if (!f.household || !f.household.joined || !f.household.id) return;
  var cl = getFridgeClient(); if (!cl) return;
  try {
    var r = await cl.from("fridge_household").select("data").eq("household_id", f.household.id).single();
    var remote = (r.data && r.data.data) ? r.data.data : null;
    var merged = mergeFridgeState(f, remote);
    merged.me = f.me; merged.household = f.household;
    DB.data.growth.fridge = merged; DB.save();
    var up = await cl.from("fridge_household").upsert({ household_id: f.household.id, data: merged, updated_at: nowISO(), updated_by: f.me || "我" });
    if (up.error) console.warn("[FridgeSync] push", up.error);
    if (typeof render === "function") render();
  } catch (e) { console.warn("[FridgeSync]", e); }
}
function fridgeScheduleSync() {
  var f = ensureFridge();
  if (!f.household || !f.household.joined) return;
  if (fridgeSyncTimer) clearTimeout(fridgeSyncTimer);
  fridgeSyncTimer = setTimeout(fridgeSyncNow, 1000);
}
function pushFridgeLog(action, item, text) {
  var f = ensureFridge();
  f.logs.push({ id: uid(), date: today(), actor: f.me || "我", action: action, item: item, text: text });
}

function fridgeCreateHousehold() {
  var f = ensureFridge();
  var id = "FR" + Math.random().toString(36).slice(2, 8).toUpperCase();
  var code = Math.random().toString(36).slice(2, 6).toUpperCase();
  f.household = { id: id, settingsCode: code, joined: true };
  if (!f.me) f.me = "我";
  DB.save();
  fridgeSyncNow().then(function () { renderFridge(); });
  showModal('<div class="modal-title">🎉 家庭冰箱已创建</div>' +
    '<div class="card"><div class="form-label">共享码（发给家人加入）</div><div style="font-size:20px;font-weight:700;letter-spacing:2px;color:var(--accent-blue)">' + id + '</div></div>' +
    '<div class="card"><div class="form-label">设置码（仅你保管，改设置用）</div><div style="font-size:18px;font-weight:700;letter-spacing:2px;color:var(--accent-red)">' + code + '</div></div>' +
    '<div class="btn-row"><button class="btn btn-primary" onclick="closeModal()">知道了</button></div>');
  renderFridge();
}
function fridgeJoinHousehold() {
  var code = prompt("输入家庭共享码（创建者提供的 FRxxxx）：");
  if (!code) return;
  var f = ensureFridge();
  f.household = { id: code.trim().toUpperCase(), settingsCode: "", joined: true };
  if (!f.me) f.me = "我";
  DB.save();
  fridgeSyncNow().then(function () { renderFridge(); showToast("已加入家庭冰箱"); });
}

function renderFridgeFamily() {
  var f = ensureFridge();
  if (!f.household.joined) {
    return '<div class="empty-state"><div class="empty-icon">👨‍👩‍👧</div><div class="empty-text">把冰箱变成全家共享</div></div>' +
      '<div style="display:flex;flex-direction:column;gap:10px;margin-top:8px">' +
      '<button class="btn btn-primary" style="padding:12px;font-size:14px" onclick="fridgeCreateHousehold()">➕ 创建家庭冰箱（你当家）</button>' +
      '<button class="btn btn-secondary" style="padding:12px;font-size:14px" onclick="fridgeJoinHousehold()">🔑 加入家人的冰箱</button>' +
      '</div>';
  }
  var logs = f.logs.slice().sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); }).slice(0, 40);
  var logHtml = logs.length ? logs.map(function (l) {
    return '<div class="activity-item"><div class="activity-icon" style="background:rgba(90,200,250,0.18)">👤</div><div><div class="activity-text">' + escapeHtml(l.actor || "某人") + ' ' + escapeHtml(l.text || l.action) + '</div><div class="activity-time">' + (l.date || "") + '</div></div></div>';
  }).join("") : '<div class="empty-state"><div class="empty-text">还没有操作记录</div></div>';

  var sl = (f.scanLog || []).slice().sort(function (a, b) { return (b.time || "").localeCompare(a.time || ""); }).slice(0, 20);
  var scanLogHtml = sl.length ? sl.map(function (s) {
    var t = (s.time || "").replace("T", " ").slice(0, 16);
    return '<div class="activity-item"><div class="activity-icon" style="background:rgba(10,132,255,0.18)">📷</div><div><div class="activity-text">' + escapeHtml(s.operator || "某人") + ' 扫码 ' + escapeHtml(s.barcode || "") + '</div><div class="activity-time">' + escapeHtml(t) + '</div></div></div>';
  }).join("") : '<div class="empty-state"><div class="empty-text">还没有扫码记录</div></div>';

  return '<div class="card"><div class="flex-between"><div><div class="form-label">家庭共享码</div><div style="font-size:18px;font-weight:700;letter-spacing:2px;color:var(--accent-blue)">' + f.household.id + '</div></div>' +
    '<button class="btn btn-secondary" style="padding:7px 10px;font-size:12px" onclick="fridgeSyncNow();showToast(\'已同步\')">↻ 同步</button></div>' +
    '<div class="form-group" style="margin-top:10px"><div class="form-label">我的昵称（操作溯源显示）</div><input class="form-input" id="fr-me" value="' + escapeHtml(f.me) + '" placeholder="如：妈妈 / 我"></div>' +
    '<button class="btn btn-secondary" style="width:100%;padding:8px;font-size:12px" onclick="fridgeSaveMe()">保存昵称</button>' +
    '</div>' +
    '<div style="margin:10px 0 4px"><button class="btn btn-secondary" style="width:100%;padding:9px;font-size:13px" onclick="showFridgeSettings()">⚙️ 系统设置（修改需设置码）</button></div>' +
    '<div class="section-title"><span class="emoji">📜</span> 操作记录溯源</div>' +
    '<div class="card">' + logHtml + '</div>' +
    '<div class="section-title"><span class="emoji">📷</span> 扫码录入记录</div>' +
    '<div class="card">' + scanLogHtml + '</div>';
}

function fridgeSaveMe() {
  var f = ensureFridge();
  var v = document.getElementById("fr-me"); if (!v) return;
  f.me = v.value.trim() || "我"; DB.save(); showToast("昵称已保存"); fridgeScheduleSync();
}

function showFridgeSettings() {
  var f = ensureFridge();
  showModal('<div class="modal-title">⚙️ 系统设置</div>' +
    '<form onsubmit="submitFridgeSettings(event)">' +
    '<div class="form-group"><div class="form-label">紧急预警阈值（天，红）</div><input class="form-input" type="number" name="redDays" value="' + (f.settings.redDays || 3) + '"></div>' +
    '<div class="form-group"><div class="form-label">优先预警阈值（天，黄）</div><input class="form-input" type="number" name="yellowDays" value="' + (f.settings.yellowDays || 7) + '"></div>' +
    '<div class="form-group"><div class="form-label">每日临期卡片弹出时间（到点自动弹一次）</div><input class="form-input" type="time" name="reminderTime" value="' + (f.settings.reminderTime || "09:00") + '"></div>' +
    '<div class="form-group"><div class="form-label">国内条码接口 key（可选）</div><input class="form-input" name="barcodeApiKey" value="' + escapeHtml(f.settings.barcodeApiKey || "") + '" placeholder="mxnzp 免费 key，格式 app_id:app_secret（留空仅用 Open Food Facts）"></div>' +
    '<div class="form-group"><div class="form-label">设置码（创建者专有，改设置需输入）</div><input class="form-input" name="code" placeholder="不知道就问创建者"></div>' +
    '<div class="form-group"><button type="button" class="btn btn-secondary" style="width:100%;padding:9px;font-size:13px" onclick="showFridgeTaxonomy(\'食品\')">🏷️ 管理自定义品类 / 位置 / 剩余量</button></div>' +
    '<div class="btn-row"><button type="button" class="btn btn-secondary" onclick="closeModal()">取消</button><button type="submit" class="btn btn-primary">保存设置</button></div>' +
    '</form>');
}
function submitFridgeSettings(event) {
  event.preventDefault();
  var f = ensureFridge();
  var fd = new FormData(event.target);
  if ((f.settings.settingsCode || "") && fd.get("code") !== f.settings.settingsCode) {
    showToast("设置码不正确，无法修改（仅创建者可改）"); return;
  }
  f.settings.redDays = parseInt(fd.get("redDays"), 10) || 3;
  f.settings.yellowDays = parseInt(fd.get("yellowDays"), 10) || 7;
  if (fd.get("reminderTime")) f.settings.reminderTime = fd.get("reminderTime");
  if (fd.get("barcodeApiKey") != null) f.settings.barcodeApiKey = fd.get("barcodeApiKey").trim();
  if (fd.get("code")) f.settings.settingsCode = fd.get("code");
  f.settings.rev = nowISO();
  DB.save(); closeModal(); fridgeScheduleSync(); renderFridge(); showToast("设置已保存");
}

// ============================================================
// 模块5：食材消耗 & 采购复盘
// ============================================================
function renderFridgeReview() {
  var f = ensureFridge();
  var weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  var weekLogs = f.logs.filter(function (l) { var d = parseDate(l.date); return d && d >= weekAgo; });
  var consumed = weekLogs.filter(function (l) { return l.action === "consume" || l.action === "add"; }).length;
  var wasted = weekLogs.filter(function (l) { return l.action === "delete" || l.action === "discard"; }).length;
  var currentExpired = f.items.filter(function (it) { return itemStatus(it) === "已过期"; }).length;

  // 补货清单（自动）：已用完 + 少量 + 快用完
  var needBuy = f.items.filter(function (it) { return it.usedUp || it.amount === "少量" || it.amount === "快用完" || it.amount === "仅剩临期"; });
  var autoList = needBuy.map(function (it) { return { id: "auto_" + it.id, name: it.name, cat: it.cat, group: it.group, checked: false, auto: true }; });
  var manualList = (f.shopping || []).map(function (s) { return { id: s.id, name: s.name, cat: s.cat, group: s.group, checked: s.checked, auto: false }; });
  var shoppingAll = autoList.concat(manualList);

  // 建议：按类别统计消耗 vs 浪费
  var catStat = {};
  weekLogs.forEach(function (l) {
    var it = f.items.find(function (x) { return x.name === l.item; });
    var cat = it ? it.cat : "其它";
    catStat[cat] = catStat[cat] || { eat: 0, waste: 0 };
    if (l.action === "consume" || l.action === "add") catStat[cat].eat++;
    else catStat[cat].waste++;
  });
  var suggest = Object.keys(catStat).map(function (cat) {
    var s = catStat[cat];
    if (s.waste >= 2) return { cat: cat, text: "「" + cat + "」本周浪费 " + s.waste + " 次，建议少囤、随吃随买" };
    if (s.eat >= 3) return { cat: cat, text: "「" + cat + "」消耗快（" + s.eat + " 次），适合常备" };
    return null;
  }).filter(Boolean);

  var html =
    '<div class="fr-stat-row">' +
    '<div class="fr-stat green"><div class="fr-stat-n">' + consumed + '</div><div class="fr-stat-l">本周处理</div></div>' +
    '<div class="fr-stat red"><div class="fr-stat-n">' + (wasted + currentExpired) + '</div><div class="fr-stat-l">浪费/过期</div></div>' +
    '<div class="fr-stat yellow"><div class="fr-stat-n">' + shoppingAll.length + '</div><div class="fr-stat-l">待购</div></div>' +
    '</div>' +
    '<div class="section-title"><span class="emoji">🛒</span> 补货清单</div>' +
    '<div style="margin-bottom:8px"><button class="btn btn-secondary" style="width:100%;padding:8px;font-size:12px" onclick="showFridgeShopModal()">➕ 手动添加采购项</button></div>' +
    (shoppingAll.length === 0 ? '<div class="empty-state"><div class="empty-text">暂时不用买，库存充足 🎉</div></div>' :
      shoppingAll.map(function (s) {
        return '<div class="fr-item"><div class="fr-item-main"><div class="fr-item-name">' + (s.checked ? '✅ ' : '⬜ ') + escapeHtml(s.name) + (s.auto ? ' <span class="badge badge-green" style="font-size:10px">自动</span>' : '') + '</div><div class="fr-item-meta">' + escapeHtml([s.group, s.cat].filter(Boolean).join(" · ")) + '</div></div>' +
          '<div class="fr-item-side"><button class="mini-btn" onclick="fridgeToggleShop(\'' + s.id + '\',' + !!s.auto + ')">' + (s.checked ? "撤销" : "购") + '</button>' +
          (s.auto ? '' : '<button class="mini-btn danger" onclick="fridgeDelShop(\'' + s.id + '\')">🗑</button>') + '</div></div>';
      }).join("")) +
    '<div class="section-title"><span class="emoji">💡</span> 囤货建议</div>' +
    (suggest.length ? '<div class="card">' + suggest.map(function (s) { return '<div style="padding:6px 0;border-bottom:1px solid var(--border)">' + s.text + '</div>'; }).join("") + '</div>' :
      '<div class="empty-state"><div class="empty-text">数据不足，多用几天就有建议啦</div></div>');
  return html;
}

function showFridgeShopModal() {
  var g = fridgeGroup !== "all" ? fridgeGroup : "食品";
  showModal('<div class="modal-title">➕ 添加采购项</div><form onsubmit="submitFridgeShop(event)">' +
    '<div class="form-group"><div class="form-label">名称</div><input class="form-input" name="name" required placeholder="如：牛奶 / 洗手液"></div>' +
    '<div class="form-group"><div class="form-label">一级品类</div>' +
    '<select class="form-input" name="group" id="fr-sel-group" onchange="frOnGroupChange()">' +
    ITEM_GROUPS.map(function (x) { return '<option value="' + x + '"' + (x === g ? " selected" : "") + '>' + groupEmoji(x) + ' ' + x + '</option>'; }).join("") +
    '</select></div>' +
    frSelectField("二级品类", "cat", catsOf(g), catsOf(g)[0]) +
    '<div class="btn-row"><button type="button" class="btn btn-secondary" onclick="closeModal()">取消</button><button type="submit" class="btn btn-primary">添加</button></div></form>');
}
function submitFridgeShop(event) {
  event.preventDefault();
  var fd = new FormData(event.target); var f = ensureFridge();
  var group = frReadSel(fd, "group", "食品");
  if (ITEM_GROUPS.indexOf(group) < 0) group = "食品";
  var cat = frReadSel(fd, "cat", catsOf(group)[0] || "未分类");
  frRegisterCustom(f, group, cat, "", "");
  f.shopping = f.shopping || [];
  f.shopping.push({ id: uid(), name: fd.get("name"), group: group, cat: cat, checked: false, addedAt: nowISO() });
  DB.save(); closeModal(); fridgeScheduleSync(); renderFridge();
}
function fridgeToggleShop(id, isAuto) {
  var f = ensureFridge();
  if (isAuto) {
    // 自动项：勾选后从库存移除该食材（视为已买/已处理）
    var aid = id.replace("auto_", "");
    var it = f.items.find(function (x) { return x.id === aid; });
    if (it) { it.usedUp = false; it.amount = "充足"; it.updatedAt = nowISO(); pushFridgeLog("buy", it.name, "已采购补充：" + it.name); }
  } else {
    var s = (f.shopping || []).find(function (x) { return x.id === id; }); if (s) s.checked = !s.checked;
  }
  DB.save(); fridgeScheduleSync(); renderFridge();
}
function fridgeDelShop(id) {
  var f = ensureFridge();
  f.shopping = (f.shopping || []).filter(function (x) { return x.id !== id; });
  DB.save(); fridgeScheduleSync(); renderFridge();
}

// 全局定时器：每天固定时间自动弹一次临期卡片（即使不在冰箱页也会弹）
(function () {
  if (window.__fridgeDailyTimer) return;
  window.__fridgeDailyTimer = setInterval(function () {
    try { if (typeof fridgeDailyCardCheck === "function") fridgeDailyCardCheck(); } catch (e) {}
  }, 5 * 60 * 1000);
})();

// 断网暂存条码：联网后自动补全（监听 online 事件 + 启动后尝试一次）
(function () {
  if (typeof window.addEventListener !== "function") return;
  window.addEventListener("online", function () {
  });
  if (navigator && navigator.onLine) {
  }
})();
