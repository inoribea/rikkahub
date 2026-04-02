# RikkaHub Backend

纯 JVM 后端服务，基于 Ktor + Exposed + SQLite，可独立部署为 Docker 容器。

## 项目结构

```
backend/
├── ai-core/           # AI SDK 层（从 ai/ 移植，去除 Android 依赖）
├── common-core/       # 通用工具层（从 common/ 移植）
├── server-app/        # Ktor 服务器应用
│   ├── db/           # Exposed 数据库层
│   ├── dto/          # Web DTO
│   ├── model/        # 数据模型
│   ├── routes/       # API 路由
│   └── sse/          # SSE 管理
├── scripts/           # 同步脚本
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## 快速开始

### 本地运行

```bash
cd backend
./gradlew build
java -jar server-app/build/libs/server-app-*-all.jar
```

服务将在 `http://localhost:8080` 启动。

### Docker 部署

```bash
cd backend
docker-compose up -d
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| PORT | 8080 | 服务端口 |
| DB_PATH | data/rikkahub.db | SQLite 数据库路径 |

## API 端点

- `GET /health` - 健康检查
- `GET /api/conversations` - 获取对话列表
- `GET /api/conversations/{id}` - 获取单个对话
- `POST /api/conversations/{id}/messages` - 发送消息
- `GET /api/conversations/{id}/stream` - SSE 实时更新
- `GET /api/settings` - 获取设置
- `POST /api/settings/assistant` - 切换助手

## 从上游同步

```bash
cd backend
./scripts/sync-from-upstream.sh
```

## 技术栈

- Kotlin 2.1.21
- Ktor 3.1.3
- Exposed 0.61.0
- SQLite
- kotlinx-serialization
- kotlinx-datetime