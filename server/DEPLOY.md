# RikkaHub Server 部署指南

## 架构概览

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   前端 (Vercel)  │────▶│  后端 (Vercel)  │────▶│  PostgreSQL     │
│   web-ui/       │     │   server/       │     │  (Neon/Supabase)│
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## 部署步骤

### 1. 准备 PostgreSQL 数据库

推荐使用免费的云数据库服务：

| 服务 | 免费额度 | 连接方式 |
|------|---------|---------|
| [Neon](https://neon.tech) | 0.5GB 存储 | `postgres://...neon.tech/...` |
| [Supabase](https://supabase.com) | 500MB 存储 | `postgres://...supabase.co/...` |
| [Railway](https://railway.app) | $5/月额度 | `postgres://...railway.app/...` |
| [PlanetScale](https://planetscale.com) | 1GB 存储 | 需适配 |

**Neon 推荐配置**：
1. 注册 Neon 账号
2. 创建项目，选择区域（建议选离用户近的）
3. 复制连接字符串：`postgres://username:password@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require`

### 2. 部署后端到 Vercel

```bash
cd server

# 安装 Vercel CLI
bun i -g vercel

# 登录
vercel login

# 部署
vercel --prod
```

**设置环境变量**（在 Vercel Dashboard 或 CLI）：

```bash
vercel env add DATABASE_URL
vercel env add JWT_SECRET
vercel env add WEB_PASSWORD
vercel env add CORS_ORIGIN
```

| 变量 | 说明 | 示例 |
|------|------|------|
| `DATABASE_URL` | PostgreSQL 连接字符串 | `postgres://user:pass@host/db` |
| `JWT_SECRET` | JWT 签名密钥 | 随机字符串，至少32字符 |
| `WEB_PASSWORD` | Web 访问密码 | `your-password` |
| `CORS_ORIGIN` | 允许的前端域名 | `https://your-app.vercel.app` |

### 3. 部署前端到 Vercel

```bash
cd web-ui

# 设置后端 API 地址
vercel env add VITE_API_BASE_URL
# 输入你的后端地址，如：https://rikkahub-server.vercel.app

# 部署
vercel --prod
```

### 4. 数据库迁移

首次部署后，运行数据库迁移：

```bash
cd server

# 本地设置环境变量
export DATABASE_URL="postgres://..."

# 生成迁移文件（如果需要）
bun run db:generate

# 运行迁移
bun run db:migrate
```

或者使用 Drizzle Studio 查看数据库：

```bash
bun run db:studio
```

## 环境变量完整列表

```env
# 必需
DATABASE_URL=postgres://user:password@host:5432/database
JWT_SECRET=your-secure-random-string-at-least-32-chars

# 可选
WEB_PASSWORD=rikkahub              # Web 访问密码
PORT=3001                          # 服务端口（Vercel 忽略）
CORS_ORIGIN=*                     # CORS 允许来源
DATA_DIR=/app/data                # 数据目录
BLOB_READ_WRITE_TOKEN=            # Vercel Blob Token（可选）
```

## 本地开发

```bash
# 启动 PostgreSQL（Docker）
docker run -d --name postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=rikkahub \
  -p 5432:5432 \
  postgres:16-alpine

# 设置环境变量
export DATABASE_URL="postgres://postgres:postgres@localhost:5432/rikkahub"
export JWT_SECRET="dev-secret-change-in-production"
export WEB_PASSWORD="rikkahub"

# 启动后端
cd server
bun install
bun run db:migrate  # 首次运行
bun run dev

# 启动前端（另一个终端）
cd web-ui
bun install
bun run dev
```

## 常见问题

### Q: 前端无法连接后端？

检查：
1. `CORS_ORIGIN` 是否正确设置
2. 前端 `VITE_API_BASE_URL` 是否正确
3. 后端是否成功部署（访问 `/api/health`）

### Q: 数据库连接失败？

检查：
1. `DATABASE_URL` 格式是否正确
2. 数据库服务是否允许外部连接
3. SSL 模式是否正确（Neon 需要 `?sslmode=require`）

### Q: JWT 认证失败？

检查：
1. `JWT_SECRET` 是否设置
2. 前端是否正确获取并存储 token