# RikkaHub Kotlin 独立后端 — 架构设计文档 v3

> **目标**：根目录新建 `backend/` 作为完全独立的纯 JVM Gradle 项目，
> 替代 TypeScript `server/`，复刻 `ai/` + `common/` 核心逻辑。
>
> **核心原则**：**不修改、不移动、不删除**现有任何 Android 模块的一行代码。
>
> **上游约束**：本项目 fork 自 https://github.com/rikkahub/rikkahub ，需定期从上游 sync。
> `backend/` 必须完全独立，确保 `git merge upstream/main` 时零冲突。

---

## 1. 为什么独立项目而非模块拆分

v2 方案需要修改 `ai/`、`common/` 的 Gradle 配置和源码（拆 Composable、改 Context 参数等），
风险在于可能破坏 Android 编译。

v3 方案：`backend/` 是完全独立的 Gradle 项目，有自己的 `settings.gradle.kts`，
从 `ai/` 和 `common/` 复制需要的源文件到自己的模块中，做纯 JVM 适配。

```
rikkahub/                          ← 原有项目，零修改
├── ai/              不动
├── common/          不动
├── search/          不动
├── app/             不动
├── web/             不动
├── web-ui/          不动
├── server/          不动（后续删）
│
└── backend/         ← 新增，独立 Gradle 项目
    ├── settings.gradle.kts        ← 独立的 Gradle 配置
    ├── build.gradle.kts
    ├── Dockerfile
    ├── docker-compose.yml
    │
    ├── ai-core/                   ← 从 ../ai/ 复制源码 + 去 Android 适配
    │   ├── build.gradle.kts
    │   └── src/main/kotlin/
    │
    ├── common-core/               ← 从 ../common/ 复制源码
    │   ├── build.gradle.kts
    │   └── src/main/kotlin/
    │
    └── server-app/                ← 新写的服务器
        ├── build.gradle.kts
        └── src/main/kotlin/
```

**好处**：
- Android 端零风险，`./gradlew :app:assembleDebug` 不受任何影响
- `backend/` 可以独立开发、测试、构建
- 两个项目共享同一个 Git 仓库，方便对比源码差异
- 后续如果确认方向对，再把 `ai-core/` 的改动合回 `ai/`（可选）

**代价**：
- `ai-core/` 和 `ai/` 之间有源码重复（同一套 Provider 逻辑存两份）
- 上游更新时需要手动同步（见第 13 节同步策略）

---

## 2. backend/ 项目结构

```
backend/
├── settings.gradle.kts           # 独立 Gradle 项目配置
├── build.gradle.kts              # 根构建文件
├── gradle.properties             # Kotlin/JVM 配置
├── Dockerfile
├── docker-compose.yml
├── .env.example
│
├── ai-core/                      # ← 复刻自 ../ai/（去 Android 依赖）
│   ├── build.gradle.kts          # kotlin("jvm") + serialization
│   └── src/main/kotlin/me/rerere/ai/
│       ├── core/
│       │   ├── MessageRole.kt    # 原样复制
│       │   ├── Tool.kt           # 原样复制
│       │   ├── Usage.kt          # 原样复制
│       │   └── Reasoning.kt      # 原样复制
│       ├── ui/
│       │   ├── Message.kt        # 原样复制（757行）
│       │   └── Image.kt          # 原样复制
│       ├── provider/
│       │   ├── Provider.kt       # 原样复制
│       │   ├── Model.kt          # 原样复制
│       │   ├── ProviderSetting.kt # ★ 改造：去掉 @Composable
│       │   ├── ProviderManager.kt # ★ 改造：去掉 Context
│       │   └── providers/
│       │       ├── OpenAIProvider.kt  # ★ 改造
│       │       ├── GoogleProvider.kt  # ★ 改造
│       │       ├── ClaudeProvider.kt  # ★ 改造
│       │       ├── ProviderMessageUtils.kt # 原样复制
│       │       ├── openai/
│       │       │   ├── OpenAIImpl.kt       # 原样复制
│       │       │   ├── ChatCompletionsAPI.kt # ★ Log → j.u.l
│       │       │   └── ResponseAPI.kt        # ★ Log → j.u.l
│       │       └── vertex/
│       │           └── ServiceAccountTokenProvider.kt # 原样复制
│       ├── registry/
│       │   ├── ModelRegistry.kt  # 原样复制
│       │   └── ModelDsl.kt       # 原样复制
│       └── util/
│           ├── Json.kt           # 原样复制
│           ├── Serializer.kt     # 原样复制
│           ├── Request.kt        # 原样复制
│           ├── ErrorParser.kt    # 原样复制
│           ├── SSE.kt            # 原样复制
│           └── KeyRoulette.kt    # ★ 改造：Context → File
│
├── common-core/                  # ← 复刻自 ../common/http/ 和 ../common/cache/
│   ├── build.gradle.kts
│   └── src/main/kotlin/me/rerere/common/
│       ├── http/
│       │   ├── Request.kt        # 原样复制（OkHttp await）
│       │   ├── Json.kt           # 原样复制
│       │   ├── JsonExpression.kt # 原样复制
│       │   ├── SSE.kt            # 原样复制
│       │   └── AcceptLang.kt     # 原样复制
│       └── cache/
│           ├── CacheStore.kt     # 原样复制
│           ├── CacheEntry.kt     # 原样复制
│           ├── LruCache.kt       # 原样复制
│           ├── KeyCodec.kt       # 原样复制
│           ├── FileIO.kt         # 原样复制
│           ├── SingleFileCacheStore.kt    # 原样复制
│           └── PerKeyFileCacheStore.kt    # 原样复制
│
└── server-app/                   # ← 新写（移植自 ../app/ 的 Web 层）
    ├── build.gradle.kts
    └── src/main/kotlin/me/rerere/rikkahub/server/
        ├── ServerMain.kt
        ├── config/
        │   └── ServerConfig.kt
        ├── db/
        │   ├── DatabaseFactory.kt
        │   ├── tables/
        │   │   ├── Conversations.kt
        │   │   ├── MessageNodes.kt
        │   │   ├── ManagedFiles.kt
        │   │   └── Settings.kt
        │   └── dao/
        │       ├── ConversationDao.kt
        │       ├── MessageNodeDao.kt
        │       └── SettingsDao.kt
        ├── model/
        │   ├── Conversation.kt
        │   ├── MessageNode.kt
        │   └── Settings.kt
        ├── repository/
        │   ├── ConversationRepository.kt
        │   ├── SettingsRepository.kt
        │   └── MemoryRepository.kt
        ├── service/
        │   ├── GenerationHandler.kt    # 移植自 ../app/ + 去 Context
        │   ├── ChatService.kt          # 移植自 ../app/ (~800行)
        │   ├── SearchExecutor.kt       # 自实现搜索
        │   └── ToolExecutor.kt
        ├── auth/
        │   └── JwtAuth.kt
        ├── routes/
        │   ├── ConversationRoutes.kt   # 移植自 ../app/web/routes/
        │   ├── SettingsRoutes.kt
        │   ├── FilesRoutes.kt
        │   └── AuthRoutes.kt
        ├── dto/
        │   └── WebDto.kt               # 移植自 ../app/web/dto/
        └── sse/
            └── SseHelper.kt
```

---

## 3. Gradle 配置

### 3.1 backend/settings.gradle.kts

```kotlin
rootProject.name = "rikkahub-backend"

include(":common-core")
include(":ai-core")
include(":server-app")
```

### 3.2 backend/build.gradle.kts（根）

```kotlin
plugins {
    kotlin("jvm") version "2.1.21" apply false
    kotlin("plugin.serialization") version "2.1.21" apply false
}
```

### 3.3 backend/common-core/build.gradle.kts

```kotlin
plugins {
    kotlin("jvm")
    kotlin("plugin.serialization")
}

dependencies {
    api("com.squareup.okhttp3:okhttp:4.12.0")
    api("com.squareup.okhttp3:okhttp-sse:4.12.0")
    api("com.squareup.okhttp3:logging-interceptor:4.12.0")
    api("org.jetbrains.kotlinx:kotlinx-serialization-json:1.8.1")
    api("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.10.2")
    api("org.jetbrains.kotlinx:kotlinx-datetime:0.6.2")
    api("org.apache.commons:commons-text:1.13.0")

    testImplementation(kotlin("test"))
}
```

### 3.4 backend/ai-core/build.gradle.kts

```kotlin
plugins {
    kotlin("jvm")
    kotlin("plugin.serialization")
}

dependencies {
    api(project(":common-core"))

    api("org.jetbrains.kotlinx:kotlinx-serialization-json:1.8.1")
    api("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.10.2")
    api("org.jetbrains.kotlinx:kotlinx-datetime:0.6.2")

    implementation("org.slf4j:slf4j-api:2.0.16")
    implementation("org.apache.commons:commons-text:1.13.0")

    testImplementation(kotlin("test"))
}
```

### 3.5 backend/server-app/build.gradle.kts

```kotlin
plugins {
    kotlin("jvm")
    kotlin("plugin.serialization")
    application
    id("com.github.johnrengelman.shadow") version "8.1.1"
}

application {
    mainClass.set("me.rerere.rikkahub.server.ServerMainKt")
}

val ktorVersion = "3.1.3"
val exposedVersion = "0.61.0"

dependencies {
    implementation(project(":ai-core"))

    // Ktor
    implementation("io.ktor:ktor-server-core:$ktorVersion")
    implementation("io.ktor:ktor-server-cio:$ktorVersion")
    implementation("io.ktor:ktor-server-content-negotiation:$ktorVersion")
    implementation("io.ktor:ktor-server-sse:$ktorVersion")
    implementation("io.ktor:ktor-server-status-pages:$ktorVersion")
    implementation("io.ktor:ktor-server-auth:$ktorVersion")
    implementation("io.ktor:ktor-server-auth-jwt:$ktorVersion")
    implementation("io.ktor:ktor-serialization-kotlinx-json:$ktorVersion")

    // Exposed + SQLite
    implementation("org.jetbrains.exposed:exposed-core:$exposedVersion")
    implementation("org.jetbrains.exposed:exposed-dao:$exposedVersion")
    implementation("org.jetbrains.exposed:exposed-jdbc:$exposedVersion")
    implementation("org.xerial:sqlite-jdbc:3.49.1.0")

    // JWT
    implementation("com.auth0:java-jwt:4.5.0")

    // Log
    implementation("ch.qos.logback:logback-classic:1.5.18")

    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.8.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.10.2")
    implementation("org.jetbrains.kotlinx:kotlinx-datetime:0.6.2")
}

tasks {
    val shadowJar by getting(com.github.johnrengelman.shadow.tasks.ShadowJar::class) {
        archiveClassifier.set("all")
        mergeServiceFiles()
    }
    build {
        dependsOn(shadowJar)
    }
}
```

---

## 4. 从原项目复制的文件清单

### 4.1 common-core/ — 10 个文件，全部原样复制

```
../common/src/main/java/me/rerere/common/http/Request.kt
../common/src/main/java/me/rerere/common/http/Json.kt
../common/src/main/java/me/rerere/common/http/JsonExpression.kt
../common/src/main/java/me/rerere/common/http/SSE.kt
../common/src/main/java/me/rerere/common/http/AcceptLang.kt
../common/src/main/java/me/rerere/common/cache/CacheStore.kt
../common/src/main/java/me/rerere/common/cache/CacheEntry.kt
../common/src/main/java/me/rerere/common/cache/LruCache.kt
../common/src/main/java/me/rerere/common/cache/KeyCodec.kt
../common/src/main/java/me/rerere/common/cache/FileIO.kt
../common/src/main/java/me/rerere/common/cache/SingleFileCacheStore.kt
../common/src/main/java/me/rerere/common/cache/PerKeyFileCacheStore.kt
```

### 4.2 ai-core/ — 18 个原样 + 9 个需改造

**原样复制（18 个）**：
```
../ai/src/main/java/me/rerere/ai/core/MessageRole.kt
../ai/src/main/java/me/rerere/ai/core/Tool.kt
../ai/src/main/java/me/rerere/ai/core/Usage.kt
../ai/src/main/java/me/rerere/ai/core/Reasoning.kt
../ai/src/main/java/me/rerere/ai/ui/Message.kt
../ai/src/main/java/me/rerere/ai/ui/Image.kt
../ai/src/main/java/me/rerere/ai/util/Serializer.kt
../ai/src/main/java/me/rerere/ai/util/Json.kt
../ai/src/main/java/me/rerere/ai/util/Request.kt
../ai/src/main/java/me/rerere/ai/util/ErrorParser.kt
../ai/src/main/java/me/rerere/ai/util/SSE.kt
../ai/src/main/java/me/rerere/ai/registry/ModelRegistry.kt
../ai/src/main/java/me/rerere/ai/registry/ModelDsl.kt
../ai/src/main/java/me/rerere/ai/provider/Provider.kt
../ai/src/main/java/me/rerere/ai/provider/Model.kt
../ai/src/main/java/me/rerere/ai/provider/providers/openai/OpenAIImpl.kt
../ai/src/main/java/me/rerere/ai/provider/providers/ProviderMessageUtils.kt
../ai/src/main/java/me/rerere/ai/provider/providers/vertex/ServiceAccountTokenProvider.kt
```

**需改造后复制（9 个）**：

| 源文件 | 改造内容 |
|--------|---------|
| `provider/ProviderSetting.kt` | 去掉 `@Composable` 属性（`description` / `shortDescription`），去掉 `builtIn`，`copyProvider` 去掉 Composable 参数 |
| `provider/ProviderManager.kt` | 去掉 `Context` 参数，改为 `File?` |
| `provider/providers/OpenAIProvider.kt` | `Context?` → `File?`，去掉 Context import |
| `provider/providers/GoogleProvider.kt` | `Context?` → `File?`，`Log` → `java.util.logging.Logger` |
| `provider/providers/ClaudeProvider.kt` | `Context?` → `File?`，`Log` → `java.util.logging.Logger` |
| `provider/providers/openai/ChatCompletionsAPI.kt` | `Log` → `java.util.logging.Logger` |
| `provider/providers/openai/ResponseAPI.kt` | `Log` → `java.util.logging.Logger` |
| `util/KeyRoulette.kt` | `LruKeyRoulette(context: Context)` → `LruKeyRoulette(cacheDir: File)` |
| `util/FileEncoder.kt` | **不复制**（Android Bitmap 依赖，服务器不需要） |

---

## 5. 关键改造细节

### 5.1 ProviderSetting — 去 Composable

```kotlin
// ai-core/ 版本（纯 JVM）
@Serializable
sealed class ProviderSetting {
    abstract val id: Uuid
    abstract val enabled: Boolean
    abstract val name: String
    abstract val models: List<Model>
    abstract val balanceOption: BalanceOption

    // ❌ 去掉：abstract val description: @Composable () -> Unit
    // ❌ 去掉：abstract val shortDescription: @Composable () -> Unit
    // ❌ 去掉：abstract val builtIn: Boolean

    abstract fun addModel(model: Model): ProviderSetting
    abstract fun editModel(model: Model): ProviderSetting
    abstract fun delModel(model: Model): ProviderSetting
    abstract fun moveMove(from: Int, to: Int): ProviderSetting

    // copyProvider 去掉 Composable / builtIn 参数
}
```

各子类（OpenAI、Google、Claude）相应去掉 `builtIn`、`description`、`shortDescription` 属性，
`copyProvider` 方法签名简化。

### 5.2 Provider 构造函数 — Context → File

```kotlin
// 原版 (Android)
class GoogleProvider(client: OkHttpClient, context: Context? = null)

// backend 版本 (纯 JVM)
class GoogleProvider(client: OkHttpClient, cacheDir: File? = null) {
    private val keyRoulette = if (cacheDir != null)
        KeyRoulette.lru(cacheDir) else KeyRoulette.default()
}
```

OpenAI、Claude 同理。`ProviderManager` 改为：

```kotlin
class ProviderManager(client: OkHttpClient, cacheDir: File? = null) {
    init {
        registerProvider("openai", OpenAIProvider(client, cacheDir))
        registerProvider("google", GoogleProvider(client, cacheDir))
        registerProvider("claude", ClaudeProvider(client, cacheDir))
    }
}
```

### 5.3 KeyRoulette — File 替代 Context

```kotlin
interface KeyRoulette {
    fun next(keys: String, providerId: String = ""): String

    companion object {
        fun default(): KeyRoulette = DefaultKeyRoulette()
        fun lru(cacheDir: File): KeyRoulette = LruKeyRoulette(cacheDir)
    }
}

private class LruKeyRoulette(
    private val cacheDir: File,  // ← 改动：File 替代 Context
) : KeyRoulette {
    // loadCache: File(cacheDir, "lru_key_roulette.json")
    // 其余逻辑不变
}
```

### 5.4 android.util.Log → java.util.logging.Logger

```kotlin
// 替换所有 Provider 中的：
// private const val TAG = "GoogleProvider"
// Log.i(TAG, "...")

// 改为：
private val logger = java.util.logging.Logger.getLogger("GoogleProvider")
logger.info("...")
```

全局替换规则：
- `Log.i(TAG, x)` → `logger.info(x)`
- `Log.w(TAG, x)` → `logger.warning(x)`
- `Log.e(TAG, x)` → `logger.severe(x)`
- `Log.d(TAG, x)` → `logger.fine(x)`

---

## 6. server-app/ 核心组件

### 6.1 ChatService 移植（★ 最大工作量）

源码 `app/service/ChatService.kt`（1230 行）移植分析：

| 功能 | 代码行 | 处理方式 |
|------|-------|---------|
| 对话内存缓存 | ~80 | 直接复用 |
| 生成任务管理 | ~120 | 直接复用 |
| 消息发送 + GenerationHandler 调用 | ~150 | 复用，去掉 OCR |
| 对话分叉/编辑/重新生成 | ~200 | 直接复用 |
| 工具执行（Search、Memory、MCP） | ~250 | 核心复用，Search 自实现 |
| 标题/建议生成 | ~100 | 直接复用 |
| 引用计数/SSE 管理 | ~80 | 直接复用 |
| 错误处理 | ~100 | 直接复用 |
| Android 通知 | ~100 | **删除** |
| Android 生命周期 | ~50 | **删除** |

**实际移植**：~800 行有效代码。

### 6.2 GenerationHandler 移植

源码 `app/data/ai/GenerationHandler.kt`（513 行），改动点：

- 去掉 `Context` 构造参数
- `MemoryRepository` → Exposed DAO
- `ConversationRepository` → Exposed DAO
- `AILoggingManager` → `java.util.logging`

**支持的 Transformer**（纯 Kotlin，直接复用）：
Template、ThinkTag、RegexOutput、Placeholder、TimeReminder、PromptInjection、DocumentAsPrompt

**不支持的**（跳过）：
Ocr、Base64ImageToLocalFile

### 6.3 SearchExecutor（自实现，不走 search/ 模块）

`search/` 模块每个文件都包含 `@Composable` UI 代码，无法复用。
服务器端直接用 OkHttp 调用搜索 API（~50-80 行/服务）。

### 6.4 路由移植

直接从 `app/web/routes/` 移植，去掉对 `ChatService` 的 Android 依赖，
API 端点保持一致。

---

## 7. 数据库设计

Schema 与 Android Room 完全兼容，SQLite 文件可直接互迁。

> `message_node` 表是权威数据源，`conversations.nodes` 列为历史遗留（服务器端置空）。

```sql
CREATE TABLE IF NOT EXISTS conversations (
    id          TEXT PRIMARY KEY,
    assistant_id TEXT NOT NULL DEFAULT '0950e2dc-9bd5-4801-afa3-aa887aa36b4e',
    title       TEXT NOT NULL DEFAULT '',
    nodes       TEXT NOT NULL DEFAULT '[]',
    create_at   INTEGER NOT NULL,
    update_at   INTEGER NOT NULL,
    suggestions TEXT NOT NULL DEFAULT '[]',
    is_pinned   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_conversations_assistant ON conversations(assistant_id);

CREATE TABLE IF NOT EXISTS message_node (
    id              TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    node_index      INTEGER NOT NULL,
    messages        TEXT NOT NULL DEFAULT '[]',
    select_index    INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_message_node_conv_idx ON message_node(conversation_id, node_index);
CREATE INDEX IF NOT EXISTS idx_message_node_conv ON message_node(conversation_id);

CREATE TABLE IF NOT EXISTS managed_files (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    folder      TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    display_name TEXT NOT NULL,
    mime_type    TEXT NOT NULL DEFAULT 'application/octet-stream',
    size_bytes   INTEGER NOT NULL DEFAULT 0,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_managed_files_path ON managed_files(relative_path);

CREATE TABLE IF NOT EXISTS settings (
    id   INTEGER PRIMARY KEY DEFAULT 1,
    data TEXT NOT NULL DEFAULT '{}'
);
```

---

## 8. API 接口（与 Android WebApiModule 完全一致）

### Auth
- `POST /api/auth/token` → `{ password }` → `{ token, expiresAt }`

### Settings
- `SSE /api/settings/stream` → event: `update` → Settings JSON
- `POST /api/settings/assistant` → `{ assistantId }`
- `POST /api/settings/assistant/model` → `{ assistantId, modelId }`
- `POST /api/settings/assistant/thinking-budget` → `{ assistantId, thinkingBudget }`
- `POST /api/settings/assistant/mcp` → `{ assistantId, mcpServerIds }`
- `POST /api/settings/assistant/injections` → `{ assistantId, modeInjectionIds, lorebookIds, quickMessageIds }`
- `POST /api/settings/search/enabled` → `{ enabled }`
- `POST /api/settings/search/service` → `{ index }`
- `POST /api/settings/model/built-in-tool` → `{ modelId, tool, enabled }`
- `POST /api/settings/favorite-models` → `{ modelIds }`

### Conversations
- `GET /api/conversations` → `List<ConversationListDto>`
- `GET /api/conversations/paged?offset=&limit=&query=` → `PagedResult`
- `GET /api/conversations/search?query=` → 搜索结果
- `SSE /api/conversations/stream` → event: `invalidate`
- `GET /api/conversations/{id}` → `ConversationDto`
- `DELETE /api/conversations/{id}` → 204
- `POST /api/conversations/{id}/pin`
- `POST /api/conversations/{id}/regenerate-title`
- `POST /api/conversations/{id}/title` → `{ title }`
- `POST /api/conversations/{id}/move` → `{ assistantId }`
- `POST /api/conversations/{id}/messages` → `SendMessageRequest`
- `POST /api/conversations/{id}/messages/{messageId}/edit` → `EditMessageRequest`
- `POST /api/conversations/{id}/fork` → `ForkConversationRequest`
- `DELETE /api/conversations/{id}/messages/{messageId}`
- `POST /api/conversations/{id}/nodes/{nodeId}/select` → `{ selectIndex }`
- `POST /api/conversations/{id}/regenerate` → `{ messageId }`
- `POST /api/conversations/{id}/stop`
- `POST /api/conversations/{id}/tool-approval` → `ToolApprovalRequest`
- `SSE /api/conversations/{id}/stream` → events: `snapshot`, `node_update`, `error`

### Files
- `POST /api/files/upload` → multipart
- `GET /api/files/path/{...}` → 文件内容

### SSE 事件
```
settings:   event=update,     data=Settings JSON
conv list:  event=invalidate,  data={assistantId, timestamp}
conv detail: event=snapshot,   data={seq, conversation, serverTime}
conv detail: event=node_update, data={seq, conversationId, nodeId, nodeIndex, node, updateAt, isGenerating, serverTime}
conv detail: event=error,      data={message}
```

---

## 9. 部署架构：Vercel 前端 + Docker 后端

### 9.1 整体架构

```
┌─────────────────────┐       ┌──────────────────────────┐
│   Vercel (前端)      │       │   Docker (后端)           │
│                     │       │                          │
│  web-ui/ SPA        │──────→│  backend/ Ktor Server    │
│  React Router 7     │ HTTPS │  ├─ REST API + SSE       │
│  Tailwind + shadcn  │       │  ├─ Exposed + SQLite     │
│                     │       │  ├─ ai-core/ Providers   │
│  环境变量:           │       │  └─ managed_files        │
│  VITE_API_URL ──────┘       │                          │
│                             │  VOLUME /app/data        │
│  自定义域名:                 │  ├─ rikkahub.db          │
│  rikka.example.com          │  ├─ files/               │
│                             │  └─ cache/               │
└─────────────────────────────┘──────────────────────────┘
```

**核心原则**：
- 前端部署到 **Vercel**，享受 CDN + Edge + 自动 HTTPS
- 后端打包成 **Docker 镜像**，部署到任意主机（云服务器 / Railway / Fly.io）
- 前后端通过 HTTPS 通信，后端负责 CORS 放行 Vercel 域名

### 9.2 前端构建与部署（Vercel）

#### web-ui 构建配置

`web-ui/` 构建 SPA 后部署到 Vercel。需新增环境变量支持：

```typescript
// web-ui/vite.config.ts — 新增
export default defineConfig({
  // ...
  define: {
    // 构建时注入后端地址，未设置时走相对路径（同源部署兜底）
    __RIKKA_API_URL__: JSON.stringify(process.env.VITE_API_URL || ""),
  },
});
```

```typescript
// web-ui/app/services/api.ts — 修改 ky 前缀
const API_BASE = typeof __RIKKA_API_URL__ !== "undefined" && __RIKKA_API_URL__
  ? __RIKKA_API_URL__   // 生产环境: https://api.example.com
  : "/api";             // 开发环境: 走 Vite proxy

export const api = ky.create({ prefixUrl: API_BASE, timeout: 30_000 });
```

#### vercel.json（前端）

```json
{
  "buildCommand": "cd web-ui && bun install && bun run build",
  "outputDirectory": "web-ui/build/client",
  "framework": null,
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "headers": [
    {
      "source": "/assets/(.*)",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
    }
  ]
}
```

#### Vercel 环境变量

| 变量 | 值 | 说明 |
|------|-----|------|
| `VITE_API_URL` | `https://api.your-domain.com` | Docker 后端的公网地址 |

### 9.3 后端构建与部署（Docker）

#### 多阶段 Dockerfile

```dockerfile
# ── Stage 1: Build ──
FROM eclipse-temurin:21-jdk-alpine AS builder

WORKDIR /build

# Gradle wrapper + 配置优先复制（利用 Docker layer cache）
COPY backend/gradle ./gradle
COPY backend/gradlew .
COPY backend/gradle.properties .
COPY backend/settings.gradle.kts .
COPY backend/build.gradle.kts .

# 子模块 build.gradle.kts
COPY backend/ai-core/build.gradle.kts ./ai-core/
COPY backend/common-core/build.gradle.kts ./common-core/
COPY backend/server-app/build.gradle.kts ./server-app/

# 下载依赖（layer cache: 只在依赖变更时重跑）
RUN chmod +x gradlew && ./gradlew dependencies --no-daemon || true

# 复制源码
COPY backend/ai-core/src ./ai-core/src
COPY backend/common-core/src ./common-core/src
COPY backend/server-app/src ./server-app/src

# 构建 Shadow JAR
RUN ./gradlew :server-app:shadowJar --no-daemon

# ── Stage 2: Runtime ──
FROM eclipse-temurin:21-jre-alpine

RUN apk add --no-cache curl

WORKDIR /app

COPY --from=builder /build/server-app/build/libs/server-app-*-all.jar app.jar

VOLUME /app/data

ENV RIKKA_PORT=8080
ENV RIKKA_HOST=0.0.0.0
ENV RIKKA_DB_PATH=/app/data/rikkahub.db
ENV RIKKA_FILES_DIR=/app/data/files
ENV RIKKA_CACHE_DIR=/app/data/cache
ENV RIKKA_JWT_ENABLED=true
ENV RIKKA_JWT_SECRET=change-me-in-production
ENV RIKKA_CORS_ALLOWED_ORIGINS=""

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8080/api/health || exit 1

ENTRYPOINT ["java", \
  "-XX:+UseG1GC", \
  "-XX:MaxRAMPercentage=75.0", \
  "-jar", "app.jar"]
```

**注意**：
- Docker build context 必须是**项目根目录**，不是 `backend/`，这样才能引用 `backend/` 内的所有文件
- 不复制 `web-ui/` 静态文件 — 前端由 Vercel 独立托管
- 多阶段构建减小镜像体积（builder ~400MB → runtime ~170MB）
- `HEALTHCHECK` 用 curl 探测 `/api/health`

#### docker-compose.yml

```yaml
services:
  rikkahub-backend:
    build:
      context: .           # 项目根目录
      dockerfile: backend/Dockerfile
    container_name: rikkahub-backend
    restart: unless-stopped
    ports:
      - "8080:8080"
    volumes:
      - ./data:/app/data
    environment:
      - RIKKA_PORT=8080
      - RIKKA_HOST=0.0.0.0
      - RIKKA_DB_PATH=/app/data/rikkahub.db
      - RIKKA_FILES_DIR=/app/data/files
      - RIKKA_CACHE_DIR=/app/data/cache
      - RIKKA_JWT_ENABLED=true
      - RIKKA_JWT_SECRET=${JWT_SECRET:-change-me-in-production}
      - RIKKA_ACCESS_PASSWORD=${ACCESS_PASSWORD:-rikkahub}
      - RIKKA_CORS_ALLOWED_ORIGINS=${CORS_ORIGINS:-}
      # SSE 配置
      - RIKKA_SSE_MAX_CONNECTIONS=1000
      - RIKKA_SSE_HEARTBEAT_INTERVAL_SEC=30
      - RIKKA_SSE_IDLE_TIMEOUT_SEC=300
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
```

### 9.4 完整环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `RIKKA_PORT` | `8080` | 监听端口 |
| `RIKKA_HOST` | `0.0.0.0` | 监听地址 |
| `RIKKA_DB_PATH` | `./data/rikkahub.db` | SQLite 数据库路径 |
| `RIKKA_FILES_DIR` | `./data/files` | 上传文件存储目录 |
| `RIKKA_CACHE_DIR` | `./data/cache` | AI Provider 缓存目录 |
| `RIKKA_JWT_SECRET` | (必填) | JWT 签名密钥 |
| `RIKKA_JWT_ENABLED` | `true` | 是否启用 JWT 认证 |
| `RIKKA_ACCESS_PASSWORD` | (必填) | 访问密码 |
| `RIKKA_CORS_ALLOWED_ORIGINS` | (空) | CORS 允许的源，多个用逗号分隔 |
| `RIKKA_SSE_MAX_CONNECTIONS` | `1000` | 最大 SSE 并发连接数 |
| `RIKKA_SSE_HEARTBEAT_INTERVAL_SEC` | `30` | SSE 心跳间隔（秒） |
| `RIKKA_SSE_IDLE_TIMEOUT_SEC` | `300` | SSE 空闲超时（秒，超时自动断开） |

### 9.5 开发环境

```bash
# 终端 1: 启动 Kotlin 后端
cd backend && ../gradlew :server-app:run

# 终端 2: 启动前端 dev server (自动代理 /api → localhost:8080)
cd web-ui && bun run dev
```

开发时不需要 Docker，Vite proxy 自动转发 `/api` 请求到本地 Ktor 后端。

### 9.6 SQLite 数据库管理

SQLite 文件存储在 `VOLUME /app/data` 中，通过 Docker volume 持久化。

```bash
# 备份
docker exec rikkahub-backend sqlite3 /app/data/rikkahub.db ".backup /app/data/backup.db"
docker cp rikkahub-backend:/app/data/backup.db ./rikkahub-$(date +%Y%m%d).db

# 恢复
docker cp ./rikkahub-backup.db rikkahub-backend:/app/data/rikkahub.db
docker restart rikkahub-backend
```

Exposed 在启动时通过 `CREATE TABLE IF NOT EXISTS` 自动建表，无需额外 migration 工具。
Schema 变更时使用 `ALTER TABLE` 手动迁移（SQLite 不支持所有 ALTER 操作，重大变更需要重建）。

---

## 10. 迁移计划

### Phase 1: 搭建骨架 + common-core/ + ai-core/

| # | 任务 | 预计量 |
|---|------|-------|
| 1.1 | 创建 `backend/` 目录结构 + `settings.gradle.kts` + 根 `build.gradle.kts` | 配置 |
| 1.2 | 创建 `backend/common-core/`，复制 10 个纯 JVM 文件 | 10 个文件 |
| 1.3 | 创建 `backend/ai-core/`，原样复制 18 个纯 Kotlin 文件 | 18 个文件 |
| 1.4 | 改造复制 9 个有 Android 依赖的文件（见第 4.2 节表格） | 9 个文件 |
| 1.5 | 验证 `./gradlew :ai-core:build` 编译通过 | 测试 |

**风险**：无。原项目完全不动。

### Phase 2: server-app/ 核心层

| # | 任务 | 预计代码量 |
|---|------|----------|
| 2.1 | 创建 `server-app/` 模块 + Shadow JAR | 配置 |
| 2.2 | Exposed 数据库层（tables + dao + factory） | ~300 行 |
| 2.3 | DTO（从 `app/web/dto/WebDto.kt` 移植） | ~300 行 |
| 2.4 | 路由（从 `app/web/routes/` 移植） | ~600 行 |
| 2.5 | GenerationHandler（去 Context） | ~500 行 |
| 2.6 | **ChatService**（★ 最大工作量） | ~800 行 |
| 2.7 | SettingsRepository + SSE | ~200 行 |
| 2.8 | SearchExecutor | ~400 行 |
| 2.9 | JWT + 文件上传 | ~200 行 |
| 2.10 | Dockerfile + docker-compose | 配置 |

### Phase 3: 集成验证

1. `./gradlew :server-app:run` 启动
2. web-ui 连接测试
3. Docker 构建测试
4. 数据库兼容性测试

### Phase 4: 清理

1. 删除 `server/`（TypeScript 版本）
2. 更新 `.gitignore`、文档

---

## 11. 与 v2 方案的对比

| | v2（模块拆分） | v3（独立项目） |
|---|---|---|
| 修改原项目 | ✅ 需要改 ai/、common/ | ❌ 完全不动 |
| Android 编译风险 | 🟡 中等 | 🟢 零 |
| 代码重复 | 无 | ai-core ↔ ai 约 27 个文件重复 |
| Bug fix 同步 | 自动 | 手动（但比 Kt↔TS 好得多） |
| 开发独立性 | 与 Android 耦合 | 完全独立 |
| 复杂度 | Phase 1 步骤多 | 结构清晰 |

---

## 12. 上游同步脚本（ai-core ↔ ai）

由于 `backend/ai-core/` 是从 `ai/` 复制 + 改造的，上游更新时需要同步变更。
以下脚本自动化这个过程。

### 12.1 sync-ai-core.sh

```bash
#!/usr/bin/env bash
# backend/scripts/sync-ai-core.sh
# 用法: ./scripts/sync-ai-core.sh [--dry-run] [--diff]
#
# 功能:
#   1. 对比 ai/ 和 ai-core/ 的文件差异
#   2. 将原样复制的文件从 ai/ 同步到 ai-core/
#   3. 列出需要手动检查的"改造文件"
#
# 注意: 改造文件（Context → File 等）不会自动覆盖，只提示 diff

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

BACKEND_AI="backend/ai-core/src/main/kotlin/me/rerere/ai"
UPSTREAM_AI="ai/src/main/java/me/rerere/ai"

# 颜色
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

DRY_RUN=false
DIFF_MODE=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true
[[ "${1:-}" == "--diff" ]] && DIFF_MODE=true

# 需要原样复制的文件（相对 ai/src/main/java/me/rerere/ai/ 路径）
COPY_FILES=(
  "core/MessageRole.kt"
  "core/Tool.kt"
  "core/Usage.kt"
  "core/Reasoning.kt"
  "ui/Message.kt"
  "ui/Image.kt"
  "util/Serializer.kt"
  "util/Json.kt"
  "util/Request.kt"
  "util/ErrorParser.kt"
  "util/SSE.kt"
  "registry/ModelRegistry.kt"
  "registry/ModelDsl.kt"
  "provider/Provider.kt"
  "provider/Model.kt"
  "provider/providers/openai/OpenAIImpl.kt"
  "provider/providers/ProviderMessageUtils.kt"
  "provider/providers/vertex/ServiceAccountTokenProvider.kt"
)

# 需要手动审查的改造文件
PATCH_FILES=(
  "provider/ProviderSetting.kt"
  "provider/ProviderManager.kt"
  "provider/providers/OpenAIProvider.kt"
  "provider/providers/GoogleProvider.kt"
  "provider/providers/ClaudeProvider.kt"
  "provider/providers/openai/ChatCompletionsAPI.kt"
  "provider/providers/openai/ResponseAPI.kt"
  "util/KeyRoulette.kt"
)

sync_count=0
diff_count=0

echo "========================================="
echo "  ai-core ↔ ai  上游同步工具"
echo "========================================="
echo ""

# ── Step 1: 同步原样复制文件 ──
echo "📦 [Step 1] 检查原样复制文件..."
echo ""

for file in "${COPY_FILES[@]}"; do
  src="$UPSTREAM_AI/$file"
  dst="$BACKEND_AI/$file"

  if [[ ! -f "$src" ]]; then
    echo -e "  ${RED}✗ 上游文件不存在: $file${NC}"
    continue
  fi

  if [[ ! -f "$dst" ]]; then
    echo -e "  ${YELLOW}+ 新文件: $file${NC}"
    if ! $DRY_RUN; then
      mkdir -p "$(dirname "$dst")"
      cp "$src" "$dst"
    fi
    ((sync_count++))
    continue
  fi

  if ! diff -q "$src" "$dst" > /dev/null 2>&1; then
    echo -e "  ${YELLOW}↻ 已变更: $file${NC}"
    if $DIFF_MODE; then
      diff --color=always -u "$dst" "$src" | head -30
      echo ""
    fi
    if ! $DRY_RUN; then
      cp "$src" "$dst"
    fi
    ((sync_count++))
  fi
done

# ── Step 2: 提示改造文件差异 ──
echo ""
echo "⚠️  [Step 2] 需要手动审查的改造文件..."
echo ""

for file in "${PATCH_FILES[@]}"; do
  src="$UPSTREAM_AI/$file"
  dst="$BACKEND_AI/$file"

  if [[ ! -f "$src" ]] || [[ ! -f "$dst" ]]; then
    echo -e "  ${RED}? 缺失: $file${NC}"
    continue
  fi

  if ! diff -q "$src" "$dst" > /dev/null 2>&1; then
    echo -e "  ${YELLOW}⚡ 上游已变更，需手动合并: $file${NC}"
    echo -e "    改造要点: Context→File, Log→j.u.l, @Composable→移除"
    if $DIFF_MODE; then
      echo "    --- diff ---"
      diff --color=always -u "$dst" "$src" | head -50
      echo "    --- end ---"
      echo ""
    fi
    ((diff_count++))
  fi
done

# ── Step 3: 同步 common-core ──
echo ""
echo "📦 [Step 3] 检查 common-core 文件..."
echo ""

BACKEND_COMMON="backend/common-core/src/main/kotlin/me/rerere/common"
UPSTREAM_COMMON="common/src/main/java/me/rerere/common"

COMMON_FILES=(
  "http/Request.kt"
  "http/Json.kt"
  "http/JsonExpression.kt"
  "http/SSE.kt"
  "http/AcceptLang.kt"
  "cache/CacheStore.kt"
  "cache/CacheEntry.kt"
  "cache/LruCache.kt"
  "cache/KeyCodec.kt"
  "cache/FileIO.kt"
  "cache/SingleFileCacheStore.kt"
  "cache/PerKeyFileCacheStore.kt"
)

for file in "${COMMON_FILES[@]}"; do
  src="$UPSTREAM_COMMON/$file"
  dst="$BACKEND_COMMON/$file"

  if [[ ! -f "$src" ]]; then continue; fi
  if [[ ! -f "$dst" ]]; then
    echo -e "  ${YELLOW}+ 新文件: $file${NC}"
    if ! $DRY_RUN; then
      mkdir -p "$(dirname "$dst")"
      cp "$src" "$dst"
    fi
    ((sync_count++))
    continue
  fi

  if ! diff -q "$src" "$dst" > /dev/null 2>&1; then
    echo -e "  ${YELLOW}↻ 已变更: $file${NC}"
    if ! $DRY_RUN; then
      cp "$src" "$dst"
    fi
    ((sync_count++))
  fi
done

# ── Summary ──
echo ""
echo "========================================="
echo "  同步完成"
echo "  自动同步: ${sync_count} 个文件"
echo "  需手动处理: ${diff_count} 个改造文件"
echo "========================================="

if [[ $diff_count -gt 0 ]]; then
  echo ""
  echo -e "${YELLOW}⚠️  有 ${diff_count} 个改造文件需要手动合并。${NC}"
  echo "   重新运行时加 --diff 查看具体差异。"
  echo "   改造清单: Context→File, Log→j.u.l, @Composable→移除, builtIn→移除"
fi
```

### 12.2 同步工作流

```bash
# 从上游 sync 后
git merge upstream/main

# 1. 检查差异（不修改文件）
./backend/scripts/sync-ai-core.sh --dry-run

# 2. 查看具体 diff
./backend/scripts/sync-ai-core.sh --diff

# 3. 执行同步（自动覆盖原样文件，改造文件只提示）
./backend/scripts/sync-ai-core.sh

# 4. 手动处理改造文件（根据提示逐个合并）

# 5. 验证编译
cd backend && ./gradlew build
```

### 12.3 CI 集成（可选）

在 GitHub Actions 中添加上游变更检测：

```yaml
# .github/workflows/check-upstream-sync.yml
name: Check Upstream Sync
on:
  schedule:
    - cron: '0 6 * * 1'  # 每周一检查
  workflow_dispatch:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Check ai-core drift
        run: |
          chmod +x backend/scripts/sync-ai-core.sh
          ./backend/scripts/sync-ai-core.sh --dry-run
          # 如果有改造文件变更，输出警告
```

---

## 13. SSE 连接管理

### 13.1 连接管理器

```kotlin
// server-app/src/main/kotlin/.../sse/SseConnectionManager.kt

import kotlinx.coroutines.*
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

class SseConnectionManager(
    private val maxConnections: Int = 1000,
    private val heartbeatIntervalSec: Long = 30,
    private val idleTimeoutSec: Long = 300,
) {
    private val connections = ConcurrentHashMap<String, SseConnection>()
    private val activeCount = AtomicInteger(0)

    data class SseConnection(
        val id: String,
        val conversationId: String?,  // null = settings/list stream
        val createdAt: Long,
        var lastActivityAt: Long,
    )

    fun tryAcquire(id: String, conversationId: String?): Boolean {
        while (true) {
            val current = activeCount.get()
            if (current >= maxConnections) return false
            if (activeCount.compareAndSet(current, current + 1)) {
                val now = System.currentTimeMillis()
                connections[id] = SseConnection(id, conversationId, now, now)
                return true
            }
        }
    }

    fun release(id: String) {
        connections.remove(id)
        activeCount.decrementAndGet()
    }

    fun touch(id: String) {
        connections[id]?.let { connections[id] = it.copy(lastActivityAt = System.currentTimeMillis()) }
    }

    fun isIdle(connection: SseConnection): Boolean {
        return (System.currentTimeMillis() - connection.lastActivityAt) > idleTimeoutSec * 1000
    }

    fun getStats(): SseStats = SseStats(
        activeConnections = activeCount.get(),
        maxConnections = maxConnections,
        connectionsByType = connections.values.groupBy { if (it.conversationId != null) "conversation" else "settings" }
            .mapValues { it.value.size }
    )

    data class SseStats(
        val activeConnections: Int,
        val maxConnections: Int,
        val connectionsByType: Map<String, Int>,
    )
}
```

### 13.2 Ktor SSE 集成

```kotlin
// 在 ServerMain.kt 中注册

val sseManager = SseConnectionManager(
    maxConnections = config.sseMaxConnections,       // 默认 1000
    heartbeatIntervalSec = config.sseHeartbeatSec,    // 默认 30
    idleTimeoutSec = config.sseIdleTimeoutSec,        // 默认 300
)

install(SSE)

routing {
    sse("/api/conversations/{id}/stream") {
        val connId = UUID.randomUUID().toString()
        val convId = call.parameters["id"]!!

        // 连接数检查
        if (!sseManager.tryAcquire(connId, convId)) {
            close(CloseReason(CloseReason.Codes.TRY_AGAIN_LATER, "Max SSE connections reached"))
            return@sse
        }

        try {
            // 发送初始快照
            val dto = conversationDao.getConversationDto(convId)
            send(ServerSentEvent(data = Json.encodeToString(dto), event = "snapshot"))

            // 订阅事件 + 心跳 + 超时检测
            val heartbeatJob = launch {
                while (isActive) {
                    delay(sseManager.heartbeatIntervalSec * 1000)
                    send(ServerSentEvent(event = "ping", data = """{"type":"ping","ts":${System.currentTimeMillis()}}"""))
                }
            }

            val timeoutJob = launch {
                while (isActive) {
                    delay(10_000) // 每 10s 检查一次
                    val conn = sseManager.connections[connId]
                    if (conn != null && sseManager.isIdle(conn)) {
                        close(CloseReason(CloseReason.Codes.NORMAL, "Idle timeout"))
                        cancel()
                    }
                }
            }

            // 事件订阅...
            eventBus.on(ConversationEvents.NODE_UPDATE) { event ->
                if (event.conversationId == convId) {
                    sseManager.touch(connId)
                    val nodeDto = messageNodeDao.getNodeDto(event.nodeId)
                    send(ServerSentEvent(data = Json.encodeToString(nodeDto), event = "node_update"))
                }
            }

            // 保持连接直到客户端断开
            awaitCancellation()
        } finally {
            sseManager.release(connId)
        }
    }
}
```

### 13.3 健康端点暴露 SSE 统计

```kotlin
get("/api/health") {
    val stats = sseManager.getStats()
    call.respond(mapOf(
        "status" to "ok",
        "sse" to stats,
        "uptime" to managementFactory.runtimeMXBean.uptime,
    ))
}
```

### 13.4 Graceful Shutdown

```kotlin
// ServerMain.kt

val server = embeddedServer(CIO, port = config.port, host = config.host) {
    // ...
}.start(wait = false)

// 注册 shutdown hook
Runtime.getRuntime().addShutdownHook(Thread {
    logger.info("Shutting down gracefully...")
    
    // 1. 停止接收新请求
    server.stop(5000, 10000)  // 5s graceful, 10s force
    
    // 2. 等待正在进行的 generation 完成（最多 30s）
    generationHandler.shutdown(timeoutSeconds = 30)
    
    logger.info("Shutdown complete")
})
```

---

## 14. CORS 配置

### 14.1 Ktor CORS 插件配置

```kotlin
// server-app/src/main/kotlin/.../config/CorsConfig.kt

import io.ktor.server.plugins.cors.routing.*
import io.ktor.http.*

fun CORSConfig.installCORS(allowedOrigins: String) {
    install(CORS) {
        if (allowedOrigins.isBlank()) {
            // 开发模式：允许所有来源
            anyHost()
        } else {
            // 生产模式：只允许指定的 Vercel 域名
            allowedOrigins.split(",").map { it.trim() }.forEach { origin ->
                allowHost(origin, schemes = listOf("https"))
            }
        }

        // 允许的 HTTP 方法
        allowMethod(HttpMethod.Get)
        allowMethod(HttpMethod.Post)
        allowMethod(HttpMethod.Put)
        allowMethod(HttpMethod.Delete)
        allowMethod(HttpMethod.Patch)
        allowMethod(HttpMethod.Options)

        // 允许的请求头
        allowHeader(HttpHeaders.ContentType)
        allowHeader(HttpHeaders.Authorization)

        // SSE 需要的自定义头
        allowHeader("Cache-Control")
        allowHeader("Last-Event-ID")

        // 允许携带凭证（JWT cookie）
        allowCredentials = true

        // 预检请求缓存时间（秒）
        maxAgeInSeconds = 3600
    }
}
```

### 14.2 ServerConfig 读取 CORS 配置

```kotlin
// server-app/src/main/kotlin/.../config/ServerConfig.kt

data class ServerConfig(
    val port: Int = env("RIKKA_PORT", "8080").toInt(),
    val host: String = env("RIKKA_HOST", "0.0.0.0"),
    val dbPath: String = env("RIKKA_DB_PATH", "./data/rikkahub.db"),
    val filesDir: String = env("RIKKA_FILES_DIR", "./data/files"),
    val cacheDir: String = env("RIKKA_CACHE_DIR", "./data/cache"),
    val jwtEnabled: Boolean = env("RIKKA_JWT_ENABLED", "true").toBoolean(),
    val jwtSecret: String = env("RIKKA_JWT_SECRET", ""),
    val accessPassword: String = env("RIKKA_ACCESS_PASSWORD", ""),
    val corsAllowedOrigins: String = env("RIKKA_CORS_ALLOWED_ORIGINS", ""),
    // SSE
    val sseMaxConnections: Int = env("RIKKA_SSE_MAX_CONNECTIONS", "1000").toInt(),
    val sseHeartbeatSec: Long = env("RIKKA_SSE_HEARTBEAT_INTERVAL_SEC", "30").toLong(),
    val sseIdleTimeoutSec: Long = env("RIKKA_SSE_IDLE_TIMEOUT_SEC", "300").toLong(),
) {
    companion object {
        private fun env(key: String, default: String): String =
            System.getenv(key) ?: default
    }
}
```

### 14.3 SSE 与 CORS 的特殊交互

SSE 连接使用 `GET` 请求，浏览器在跨域时会先发 `OPTIONS` 预检。需要确保：

1. `OPTIONS` 请求返回 `200` + 正确的 CORS 头
2. SSE 响应头包含 `Cache-Control: no-cache` 和 `Connection: keep-alive`
3. `Access-Control-Allow-Origin` 不能是 `*`（如果 `allowCredentials = true`）

### 14.4 典型部署配置

```bash
# 生产环境: Vercel 自定义域名 + Docker 后端
RIKKA_CORS_ALLOWED_ORIGINS=rikka.your-domain.com,www.your-domain.com

# 开发环境: 留空 = 允许所有来源（仅用于 localhost）
RIKKA_CORS_ALLOWED_ORIGINS=
```

---

## 15. 不在范围内

- Android 项目任何文件 — 零修改
- web-ui 前端 — API 兼容无需改动（仅需新增 `VITE_API_URL` 环境变量）
- search/ 模块 — 服务器端自实现
- TTS 模块 — 暂不涉及
- MCP 客户端 — 暂不涉及（Phase 2 后考虑）
- 多用户 / 权限系统 — 当前仅单用户密码认证

