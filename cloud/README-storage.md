# PM 工作台 · 免费云端同步操作指南（v5.9.140+）

Supabase 2026 年 9 月起 402 配额耗尽，本文档给出**两个 0 元替代方案**的具体操作步骤。

---

## 方案 A · GitHub Gist 同步（推荐 · 5 分钟）

### 优点
- **0 元**、**0 服务器**、**0 配置**（不需 Cloudflare 账号）
- 数据存在你自己 GitHub 账号的**私有 Gist**，跨设备、跨浏览器可访问
- 单 Gist 100 MB（工作台全量 < 5 MB）

### 缺点
- 大陆访问 github.com 需代理（无代理走方案 B 坚果云）

### 5 步配置

| 步骤 | 操作 | 时间 |
|---|---|---|
| 1️⃣ | 浏览器打开 https://github.com/settings/tokens → 点 **Generate new token (classic)** | 30s |
| 2️⃣ | Note 填「工作台同步」；Expiration 下拉选 **No expiration**；Scopes 列表里**只勾 `gist`**（其它不勾）→ 滚到底点 **Generate token** | 30s |
| 3️⃣ | 立刻复制 `ghp_xxxxxxxxxxxx` 这串字符（**页面关闭就再也看不到了**）| 10s |
| 4️⃣ | 打开 PM 工作台 PWA（[线上主站](https://ichi010623-maker.github.io/pm-workbench-site/)）→ 首页 → 右下角 **⚙️ 设置** 按钮 → 滚到底找 **🐙 GitHub Gist 同步** 卡片 | 30s |
| 5️⃣ | 粘贴 Token → 勾选「启用自动同步」 → 点 **💾 保存** → 点 **🔌 测试连接** → 看到 `✅ 连接成功 · 你的 GitHub ID` 即生效 | 30s |

### 验证生效

1. PWA 里改任意一处数据（比如想法库加一条）
2. 8 秒后等防抖推送
3. 设置页 GitHub Gist 卡片下方状态栏应显示「上次同步：刚刚」
4. 浏览器开 https://gist.github.com/<你的 GitHub ID> 看到名为「硬件PM工作台 备份」的私有 Gist

### 跨设备使用

| 设备 | 操作 |
|---|---|
| 新手机/电脑首次访问 | PWA → 设置 → 🐙 GitHub Gist → 填**同一 Token** → **⬇️ 从云端恢复** → 弹窗 confirm → 全量数据 + 图片回流 |
| Token 泄露 | 立刻去 https://github.com/settings/tokens → Revoke 旧 Token → 重新生成 |

---

## 方案 B · 坚果云 WebDAV 同步（国内直连 · 5 分钟）

### 优点
- **0 元**（坚果云 1 GB/月免费 · Cloudflare 10 万次/天免费）
- **国内直连**，不需代理
- 数据存你自己坚果云账号（隐私可控）

### 缺点
- 需 Cloudflare 账号（部署 Worker 代理）
- 多一步：WebDAV 不能直连（无 CORS）需 Cloudflare Worker 中转

### 5 步配置

#### 第 1 步 · 部署 Cloudflare Worker（约 3 分钟）

1. 浏览器打开 https://dash.cloudflare.com → 注册/登录（GitHub 账号一键登录）
2. 左侧栏 **Workers & Pages** → 点 **Create** → 选 **Create Worker**
3. 起名（如 `pm-workbench-webdav`）→ 点 **Deploy**（先用默认代码）
4. 点 **Edit code** → 全选删除默认代码 → 打开 [Worker 模板](https://ichi010623-maker.github.io/pm-workbench-site/cloud/webdav-proxy-template.js) → Ctrl+A 复制 → 粘贴到 Cloudflare 编辑器 → 点右上 **Save and Deploy**
5. 顶部点 **Settings** → 左侧 **Variables** → **Add** 两个变量：
   - `NUTSTORE_USER` = 你登录坚果云的**邮箱或手机号**
   - `NUTSTORE_APP_PASS` = 见第 2 步的「应用密码」（**先做第 2 步再来填**）
6. 顶部 **Deployments** → 复制 Worker URL（形如 `https://pm-workbench-webdav.你的子域名.workers.dev`）

#### 第 2 步 · 生成坚果云应用授权密码（约 1 分钟）

1. 浏览器打开 https://www.jianguoyun.com → 登录
2. 右上角**头像** → **账户信息**（弹窗）
3. 左侧栏 **安全** → 滚到 **第三方应用授权密码**（旧版叫"应用授权密码"）→ 点 **添加**
4. 名称填 `工作台`（任意）→ 提交 → 复制生成的密码（**只显示一次，丢则撤销重发**）

#### 第 3 步 · 回到 Cloudflare，把第 2 步的密码填到 `NUTSTORE_APP_PASS` 变量 → 自动部署

#### 第 4 步 · 在 PWA 里配置

1. 打开 PWA → 设置 → ☁️ **坚果云 WebDAV** 卡片
2. 填表：
   - **Cloudflare Worker 代理地址** = 第 1 步的 Worker URL
   - **坚果云账号** = 登录邮箱/手机
   - **应用密码** = 第 2 步生成的密码
   - **备份目录名** = 留空（默认 `PM工作台备份`）
3. 勾选「启用自动同步」 → **💾 保存** → **🔌 测试连接** → `✅ 连接成功`

### 验证生效

1. PWA 改一处数据 → 等 8 秒
2. 登录 https://www.jianguoyun.com → 看到「PM工作台备份」目录 → 里有 `pm-backup.json` 文件

### 跨设备使用

| 设备 | 操作 |
|---|---|
| 新手机首次 | PWA → 设置 → ☁️ 坚果云 → 填**同一份 Worker URL + 账号 + 应用密码** → ⬇️ 从云端恢复 |
| 改密码 | Cloudflare → Worker → Variables 改 `NUTSTORE_APP_PASS`；PWA 设置里也更新 |

---

## 选哪个？

| 场景 | 推荐方案 |
|---|---|
| 海外访问 / 有代理 / 想 3 分钟搞定 | **🐙 GitHub Gist** |
| 大陆访问 / 不稳定代理 / 想要完全自主可控 | **☁️ 坚果云 WebDAV** |
| 两个都想要（冗余兜底） | 都开，互不冲突 |

两个方案可同时启用，数据都往各自的云端写一份，从任一云端拉取都行。

---

## 排错速查

| 症状 | 方案 A 原因 | 方案 B 原因 |
|---|---|---|
| `Bad credentials` | Token 错 / 失效 / 没勾 `gist` scope | 应用密码错 / 用了登录密码 |
| `Empty reply from server` | 网络问题 | Worker URL 不可达 |
| `404` | 无 | 目录未创建（自动 MKCOL 应能修复）|
| `Worker 未配置 NUTSTORE_USER` | — | Cloudflare 变量没设置或名字打错 |
| 测试连接 200 但推送失败 | Token 失效 | Worker 变量改了没保存 / 应用密码被撤销 |
| 状态栏一直「未启用」 | 没勾选「启用」| 同上 |
| 重复创建 Gist | 描述被改 | — |

---

## 紧急恢复

如果两个云端都不可用，本机还有：
- **IndexedDB 自动备份**（每 10 分钟一次，最新 50 个快照）
- **设置 → 📦 本地历史备份恢复** → 选最新快照 → 合并上云

导出兜底：设置 → **📥 下载完整备份**（含图片 JSON）→ 微信/网盘/邮箱存一份
