// Worker 环境无 Node path：仅提供打包/加载所需的最小实现（generate() 路径不使用）。
module.exports = {
  join: (...a) => a.filter((x) => x != null && x !== "").join("/"),
  resolve: (...a) => a.filter((x) => x != null && x !== "").join("/"),
  dirname: () => "/",
  basename: (p) => String(p || "").split("/").pop(),
  extname: (p) => { const b = String(p || "").split("/").pop() || ""; const i = b.lastIndexOf("."); return i > 0 ? b.slice(i) : ""; },
  sep: "/",
  isAbsolute: () => true,
  relative: (a, b) => b,
};
