// Worker 环境 process 最小 stub：generate() 路径不读取 process.env，
// 仅 lib_llm.getKey()（Worker 不调用）会用到。
module.exports = {
  env: {},
  argv: [],
  cwd: () => "/",
  platform: "worker",
};
