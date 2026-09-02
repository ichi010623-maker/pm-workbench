// ============================================================
// 行业情报 · comments（评论 CRUD + 编辑）
// 依赖：外部 uid()（沙箱注入）
// ============================================================
(function (root) {
  "use strict";

  // 新增评论，返回 { comments, comment }
  function intelAddComment(comments, key, text) {
    comments = comments || {};
    text = String(text || "").trim();
    if (!text) throw new Error("评论不能为空");
    if (!key) throw new Error("缺少条目标识");
    var arr = comments[key] ? comments[key].slice() : [];
    var cmt = { id: (typeof uid === "function" ? uid() : "c" + Math.random().toString(36).slice(2, 9)), text: text, createdAt: new Date().toISOString() };
    arr.push(cmt);
    var copy = {}; for (var k in comments) if (comments.hasOwnProperty(k)) copy[k] = comments[k];
    copy[key] = arr;
    return { comments: copy, comment: cmt };
  }
  function intelListComments(comments, key) {
    if (!comments || !key) return [];
    return (comments[key] || []).slice();
  }
  function intelRemoveComment(comments, key, cmtId) {
    comments = comments || {};
    if (!comments[key]) return comments;
    var copy = {}; for (var k in comments) if (comments.hasOwnProperty(k)) copy[k] = comments[k];
    copy[key] = (comments[key] || []).filter(function (c) { return c.id !== cmtId; });
    if (!copy[key].length) delete copy[key];
    return copy;
  }
  // 编辑评论，返回 { comments, comment }；保留原 createdAt，新增 updatedAt
  function intelUpdateComment(comments, key, cmtId, text) {
    comments = comments || {};
    text = String(text || "").trim();
    if (!text) throw new Error("评论不能为空");
    if (!key || !cmtId) throw new Error("缺少条目标识");
    if (!comments[key]) return { comments: comments, comment: null };
    var copy = {}; for (var k in comments) if (comments.hasOwnProperty(k)) copy[k] = comments[k];
    var updated = null;
    copy[key] = (comments[key] || []).map(function (c) {
      if (c.id === cmtId) { updated = { id: c.id, text: text, createdAt: c.createdAt, updatedAt: new Date().toISOString() }; return updated; }
      return c;
    });
    return { comments: copy, comment: updated };
  }

  root.intelAddComment = intelAddComment;
  root.intelListComments = intelListComments;
  root.intelRemoveComment = intelRemoveComment;
  root.intelUpdateComment = intelUpdateComment;
})(typeof globalThis !== "undefined" ? globalThis : this);