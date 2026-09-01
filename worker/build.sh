#!/bin/bash
# 打包 Worker：esbuild bundle，alias Node 内置模块到 stubs（generate() 路径不使用它们）
set -e
cd "$(dirname "$0")"

# 使用托管 node/npm
export PATH="/Users/ichi/.workbuddy/binaries/node/versions/22.22.2/bin:$PATH"

if [ ! -d node_modules/esbuild ]; then
  echo "[build] 安装 esbuild ..."
  npm install --no-audit --no-fund esbuild@^0.25.0 >/dev/null 2>&1
fi

echo "[build] esbuild bundle ..."
./node_modules/.bin/esbuild src/index.js \
  --bundle \
  --format=esm \
  --platform=browser \
  --target=es2022 \
  --minify \
  --external:cloudflare:workers \
  --alias:fs=./src/stubs/fs.js \
  --alias:path=./src/stubs/path.js \
  --alias:child_process=./src/stubs/child_process.js \
  --alias:process=./src/stubs/process.js \
  --outfile=dist/index.mjs

echo "[build] 完成 -> dist/index.mjs ($(wc -c < dist/index.mjs) bytes)"
