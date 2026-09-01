// Worker 环境无 Node fs：生成器仅在 main()（本地）路径使用 fs，
// Worker 只调用 generate()（纯内存），这些 stub 只在误调用时报错，保证打包与加载安全。
module.exports = {
  readFileSync() { throw new Error("fs 不可用（Worker 环境）"); },
  writeFileSync() { throw new Error("fs 不可用（Worker 环境）"); },
  existsSync() { return false; },
  readFile() { throw new Error("fs 不可用（Worker 环境）"); },
  writeFile() { throw new Error("fs 不可用（Worker 环境）"); },
  mkdirSync() { throw new Error("fs 不可用（Worker 环境）"); },
  readdirSync() { return []; },
  statSync() { throw new Error("fs 不可用（Worker 环境）"); },
  createReadStream() { throw new Error("fs 不可用（Worker 环境）"); },
  createWriteStream() { throw new Error("fs 不可用（Worker 环境）"); },
  promises: {},
};
