#!/usr/bin/env bash
# 打包 SCF 函数代码：完整站点 + cloud 脚本（排除 .git / node_modules / .workbuddy）
# 注: 云端不再内嵌 edgeone CLI(依赖354MB超限)，部署改由 EdgeOne Makers Git 集成自动完成
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/scf_bundle.zip"
cd "$ROOT"
# 普通 zip -r：对已存在 archive 会就地更新变更条目，无需 rm 删除文件
zip -q -r "$OUT" . \
  -x '*.git*' \
  -x 'node_modules/*' \
  -x '.workbuddy/*' \
  -x 'scf_bundle.zip' \
  -x 'scripts/gen_knowledge_daily.py' \
  -x 'scripts/gen_knowledge_50_20260824.py' \
  -x 'scripts/gen_news_20260824.js'
echo "打包完成: $OUT ($(du -h "$OUT" | cut -f1))"
