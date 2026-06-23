# 实施步骤与文件清单

## 启动日志示例

### CLI 模式（`mosu` 命令）

```
[server.cli.start] Mosu v0.1.1 started
[server.cli.address] Local: http://localhost:3000
[server.cli.network] Network: http://0.0.0.0:3000
[server.cli.chat] Chat: enabled
```

### 开发模式（`pnpm dev`）

不显示额外日志，仅 Vite 默认输出：

```
  VITE v8.0.16  ready in 234 ms

  ➜  Local:   http://localhost:5173/mosu/
  ➜  Network: use --host to expose
```

## 实施步骤

1. **新建 `server/` 目录**，实现 TypeScript 服务端代码：
   - `config.ts` → `capabilities.ts` → `routes/*.ts` → `app.ts` → `index.ts`
   - `prompts/editor.ts`（从 `src/constants/ai.ts` 迁移）

2. **修改 `vite.config.ts`**：
   - 支持多入口构建（前端/CLI/SDK）
   - 注册 `@hono/vite-dev-server`
   - 添加 `@lib/logger` 路径别名

3. **修改 `tsconfig.json`**：
   - 添加 `@lib/logger` 到 `./libs/logger.ts` 的路径映射

4. **修改 `package.json`**：
   - 新增 `bin`、`files`、scripts
   - 移除 `@mlc-ai/web-llm` 从 dependencies
   - 新增 `hono`、`@hono/node-server`、`@hono/zod-openapi`、`zod` 到 dependencies
   - 新增 `@hono/vite-dev-server` 到 devDependencies
   - 移动前端依赖到 devDependencies

5. **修改前端代码**：
   - `src/utils/editor/ai-engine.ts` — 移除 WebLLM，修改 API 路径为 `/v1/chat/completions`
   - `src/hooks/use-model-loader.ts` — 删除文件
   - `src/hooks/use-ai-chat.ts` — 修改类型导入
   - `src/routes/editor.tsx` — 对话面板条件显示，移除 useModelLoader
   - `src/constants/ai.ts` — 删除文件

6. **新增类型定义**：
   - `src/types/openai.ts` — `ChatCompletionMessageParam` 类型

7. **删除 `backend/` 目录**

8. **验证**：
   - `pnpm dev` — 开发模式正常启动，API 请求转发正常
   - `pnpm build:all` — 三个模块构建成功
   - `node dist-cli/index.js` — CLI 模式正常启动
   - `GET /mosu/capabilities` — 返回能力列表
   - `POST /v1/chat/completions` — AI 对话正常

## 类型定义迁移

移除 `@mlc-ai/web-llm` 后，需要自定义 `ChatCompletionMessageParam` 类型。

### 新增类型文件

新建 `src/types/openai.ts`：

```typescript
export interface ChatCompletionMessageParam {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
```

### 修改导入

**`src/utils/editor/ai-engine.ts`**：

```typescript
import type { ChatCompletionMessageParam } from '@/types/openai';
```

**`src/hooks/use-ai-chat.ts`**：

```typescript
import type { ChatCompletionMessageParam } from '@/types/openai';
```

## 涉及文件清单（完整版）

| 文件                            | 操作 | 说明                                                                            |
| ------------------------------- | ---- | ------------------------------------------------------------------------------- |
| `server/index.ts`               | 新增 | CLI 入口（#!/usr/bin/env node）                                                 |
| `server/config.ts`              | 新增 | 配置解析（CLI args + env vars）                                                 |
| `server/app.ts`                 | 新增 | Hono app 定义（OpenAPI Router）                                                 |
| `server/openapi.ts`             | 新增 | OpenAPI schema 定义                                                             |
| `server/capabilities.ts`        | 新增 | 能力注册表                                                                      |
| `server/routes/chat.ts`         | 新增 | Chat API 路由                                                                   |
| `server/routes/capabilities.ts` | 新增 | 能力检查路由                                                                    |
| `server/routes/tools.ts`        | 新增 | 工具路由（预留）                                                                |
| `server/prompts/editor.ts`      | 新增 | 编辑器 system prompt（从前端迁移）                                              |
| `server/vite-plugin.ts`         | 新增 | Vite 插件（供生产环境其他开发服务器集成）                                       |
| `libs/logger.ts`                | 新增 | 项目通用 logger（前后端共享，同时注册 web 和 node adapter）                     |
| `libs/api-client.ts`            | 新增 | 同构 API client（从 OpenAPI schema 生成）                                       |
| `src/types/openai.ts`           | 新增 | OpenAI 兼容类型定义                                                             |
| `vite.config.ts`                | 修改 | 多入口构建 + @hono/vite-dev-server                                              |
| `tsconfig.json`                 | 修改 | 添加 `@lib/logger` 到 `./libs/logger.ts` 的路径映射                             |
| `package.json`                  | 修改 | 新增 `bin`、`files`、scripts，优化依赖分类，新增 Hono 相关依赖                  |
| `src/utils/editor/ai-engine.ts` | 修改 | 移除 WebLLM，仅保留 API 模式，修改类型导入，API 路径改为 `/v1/chat/completions` |
| `src/hooks/use-ai-chat.ts`      | 修改 | 修改类型导入                                                                    |
| `src/routes/editor.tsx`         | 修改 | 对话面板条件显示，移除 useModelLoader                                           |
| `src/hooks/use-model-loader.ts` | 删除 | 不再需要模型加载器                                                              |
| `src/constants/ai.ts`           | 删除 | prompt 迁移到服务端，MODEL_ID_MAP 移除                                          |
| `src/libs/logger.ts`            | 删除 | 迁移到根目录 `libs/logger.ts`                                                   |
| `backend/`                      | 删除 | 完全合并到 `server/`                                                            |
