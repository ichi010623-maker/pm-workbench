// 根入口（SCF 要求入口文件必须在代码根目录）。
// 实际逻辑在 cloud/scf_handler.js，此处仅做委托。
module.exports = require("./cloud/scf_handler");
