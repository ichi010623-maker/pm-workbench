// Worker 环境无 child_process：generate() 路径不使用，仅保证打包/加载安全。
module.exports = {
  execSync() { throw new Error("child_process 不可用（Worker 环境）"); },
  spawnSync() { throw new Error("child_process 不可用（Worker 环境）"); },
  spawn() { throw new Error("child_process 不可用（Worker 环境）"); },
  exec() { throw new Error("child_process 不可用（Worker 环境）"); },
};
