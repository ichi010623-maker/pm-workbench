// ============================================================
// 行业情报 · fav（收藏 CRUD + 分类管理 + 收藏内搜索）
// 依赖：core（INTEL_FAV_CATS_DEFAULT），外部 today()
// ============================================================
(function (root) {
  "use strict";

  // 稳定的收藏 key：日期 + 条目 id（或标题）。live 资讯 id 如 n1 会跨天重复，故必须带日期
  function intelFavKey(item, dateStr) {
    var base = (item && (item.id || item.title)) ? String(item.id || item.title) : "x";
    var d = dateStr || (item && item.date) || "nodate";
    return String(d) + "|" + base;
  }

  // 构建一条收藏记录（含可选分类 catId）
  function intelMakeFavRec(item, dateStr, catId) {
    return {
      key: intelFavKey(item, dateStr),
      date: dateStr || (item && item.date) || (typeof today === "function" ? today() : "nodate"),
      favAt: new Date().toISOString(),
      title: item ? (item.title || "") : "",
      summary: item ? (item.summary || "") : "",
      source: item ? (item.source || "") : "",
      url: item ? (item.url || "") : "",
      category: item ? (item.category || "") : "",
      tags: item && Array.isArray(item.tags) ? item.tags : [],
      origin: item && item.origin ? item.origin : "news",
      catId: catId || null
    };
  }

  // 加入收藏（假定尚未收藏），返回新数组
  function intelAddFav(favArr, item, dateStr, catId) {
    favArr = favArr || [];
    return favArr.concat([intelMakeFavRec(item, dateStr, catId)]);
  }

  // 切换收藏：已收藏则移除，未收藏则加入。返回 { fav, added, key }
  function intelToggleFav(favArr, item, dateStr, catId) {
    favArr = favArr || [];
    var key = intelFavKey(item, dateStr);
    var existing = null;
    for (var i = 0; i < favArr.length; i++) { if (favArr[i].key === key) { existing = favArr[i]; break; } }
    if (existing) {
      return { fav: favArr.filter(function (f) { return f.key !== key; }), added: false, key: key };
    }
    return { fav: intelAddFav(favArr, item, dateStr, catId), added: true, key: key };
  }

  function intelIsFav(favArr, key) {
    if (!favArr || !key) return false;
    for (var i = 0; i < favArr.length; i++) { if (favArr[i].key === key) return true; }
    return false;
  }

  function intelRemoveFav(favArr, key) {
    if (!favArr) return [];
    return favArr.filter(function (f) { return f.key !== key; });
  }

  // 收藏分类内搜索：匹配 标题/摘要/来源/标签 + 该收藏下所有评论文本（不区分大小写）
  function intelSearchFav(favArr, keyword, comments) {
    favArr = favArr || [];
    keyword = String(keyword || "").trim().toLowerCase();
    if (!keyword) return favArr.slice();
    comments = comments || {};
    return favArr.filter(function (f) {
      var hay = [f.title, f.summary, f.source, (f.tags || []).join(" ")].join(" ").toLowerCase();
      if (hay.indexOf(keyword) >= 0) return true;
      var arr = (f.key && comments[f.key]) || [];
      for (var i = 0; i < arr.length; i++) {
        if (arr[i].text && arr[i].text.toLowerCase().indexOf(keyword) >= 0) return true;
      }
      return false;
    });
  }

  // ---------- 收藏分类管理 ----------
  // 返回分类名称；未匹配时回退「未分类」
  function intelFavCatName(cats, catId) {
    if (!cats || !catId) return "未分类";
    for (var i = 0; i < cats.length; i++) { if (cats[i].id === catId) return cats[i].name; }
    return "未分类";
  }
  // 新增分类（名称自定义），返回 { cats, id }
  function intelAddFavCat(cats, name) {
    cats = cats || [];
    name = String(name || "").trim();
    if (!name) throw new Error("分类名称不能为空");
    var id = "cat_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6);
    return { cats: cats.concat([{ id: id, name: name }]), id: id };
  }
  // 重命名分类，返回新 cats
  function intelRenameFavCat(cats, id, name) {
    cats = cats || [];
    name = String(name || "").trim();
    if (!name) throw new Error("分类名称不能为空");
    return cats.map(function (c) { if (c.id === id) return { id: c.id, name: name }; return c; });
  }
  // 删除分类（分类永不空：删空则回退默认集），返回 { cats, reassignTo }
  function intelRemoveFavCat(cats, id) {
    cats = cats || [];
    var remaining = cats.filter(function (c) { return c.id !== id; });
    if (!remaining.length) remaining = root.INTEL_FAV_CATS_DEFAULT.map(function (c) { return { id: c.id, name: c.name }; });
    return { cats: remaining, reassignTo: remaining[0].id };
  }

  root.intelFavKey = intelFavKey;
  root.intelMakeFavRec = intelMakeFavRec;
  root.intelAddFav = intelAddFav;
  root.intelToggleFav = intelToggleFav;
  root.intelIsFav = intelIsFav;
  root.intelRemoveFav = intelRemoveFav;
  root.intelSearchFav = intelSearchFav;
  root.intelFavCatName = intelFavCatName;
  root.intelAddFavCat = intelAddFavCat;
  root.intelRenameFavCat = intelRenameFavCat;
  root.intelRemoveFavCat = intelRemoveFavCat;
})(typeof globalThis !== "undefined" ? globalThis : this);