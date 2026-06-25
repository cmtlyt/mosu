# Spec: Mosu CLI 化 — 一体化服务架构

## 概述

将 Mosu 从"纯前端 SPA + 可选后端代理"架构，改造为 **CLI 一体化服务**。核心变更：

1. **移除 WebLLM** — 不再支持浏览器端 LLM 推理，AI 能力完全通过后端 API 提供
2. **Hono 框架** — 服务端使用 Hono（轻量、高性能、TypeScript 优先）
3. **unplugin 集成** — 开发环境通过 Vite 插件自动启动 backend（全局唯一实例）
4. **多模块构建** — 单次 Vite 构建同时产出前端页面、CLI 服务、SDK
5. **对话面板条件显示** — 仅在配置了 backend URL 时显示
6. **Agent 能力体系** — 服务端提供统一的 Agent API（对话、工具调用等），前端通过能力检查接口动态适配
7. **Prompt 迁移** — 所有 AI prompt 从前端迁移到服务端 Agent 中
8. **Logger 统一** — 将 `src/libs/logger.ts` 升级为项目通用模块，前后端共享
9. **依赖优化** — 前端依赖移至 devDependencies，仅后端运行时依赖保留在 dependencies

---

## 1. 目标与非目标

### 目标

- 一条命令启动完整服务（前端 + AI API），零配置即可使用
- 支持通过 CLI 参数和环境变量配置端口、AI 模型、API Key 等
- 前端构建产物（`dist/`）和 CLI 服务（`dist-cli/`）分离
- Agent API 支持流式和非流式响应，兼容 OpenAI Chat Completions 格式
- 开发模式下通过 unplugin 自动启动 backend，API 请求自动转发
- 对话面板仅在配置了 backend URL 时显示，避免未配置时的错误提示
- 服务端提供统一的能力检查接口，前端据此动态适配功能
- 所有 AI prompt 由服务端管理，前端仅传递用户消息

### 非目标

- 不改变前端组件结构和样式方案
- 不做用户认证/多租户
- 不做数据库/持久化存储
- 不支持浏览器端 LLM 推理（移除 WebLLM）

---

## 2. 整体架构

```
┌─────────────────────────────────────────────────────┐
│                  mosu CLI (Node.js)                  │
│                                                     │
│  ┌─────────────────┐    ┌──────────────────────┐   │
│  │  Static Server   │    │     Agent API        │   │
│  │  (serve dist/)   │    │  /api/*              │   │
│  │                  │    │                      │   │
│  │  GET / → SPA     │    │  POST /api/chat      │   │
│  │  GET /assets/*   │    │  GET  /api/caps      │   │
│  │                  │    │  POST /api/tools/*    │   │
│  └─────────────────┘    └──────────────────────┘   │
│                                                     │
│  ┌───────────────────────────────────────────────┐ │
│  │         Configuration Layer                   │ │
│  │  CLI args > env vars > defaults               │ │
│  └───────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘

开发模式（pnpm dev）：
┌─────────────────────────────────────────────────────┐
│              Vite Dev Server (port 5173)             │
│                                                     │
│  ┌─────────────────┐    ┌──────────────────────┐   │
│  │  Frontend HMR   │    │  unplugin-mosu       │   │
│  │                 │    │  (启动 backend)      │   │
│  │  React + Router │    │                      │   │
│  └─────────────────┘    │  ┌────────────────┐  │   │
│                         │  │ Hono Server    │  │   │
│  /api/* → proxy ────────┼─▶│ (in-process)   │  │   │
│                         │  └────────────────┘  │   │
│                         └──────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

---

## 3. CLI 设计

### 3.1 命令格式

```bash
mosu [options]
```

### 3.2 CLI 参数

| 参数                  | 环境变量           | 默认值    | 说明                                       |
| --------------------- | ------------------ | --------- | ------------------------------------------ |
| `-p, --port <number>` | `MOSU_PORT`        | `3000`    | 服务监听端口                               |
| `--host <string>`     | `MOSU_HOST`        | `0.0.0.0` | 服务监听地址                               |
| `--ai-base-url <url>` | `MOSU_AI_BASE_URL` | —         | 上游 AI API 地址（必填，否则无法使用对话） |
| `--ai-model <string>` | `MOSU_AI_MODEL`    | —         | AI 模型名称                                |
| `--ai-api-key <key>`  | `MOSU_AI_API_KEY`  | —         | AI API Key                                 |
| `-v, --version`       | —                  | —         | 输出版本号                                 |
| `-h, --help`          | —                  | —         | 输出帮助信息                               |

### 3.3 使用示例

```bash
# 完整配置（必须配置 AI API）
mosu --port 8080 --ai-base-url https://api.openai.com/v1 --ai-model gpt-4o --ai-api-key sk-xxx

# 通过环境变量配置
MOSU_AI_BASE_URL=https://idealab.alibaba-inc.com/api/openai/v1 \
MOSU_AI_MODEL=qwen3-coder-plus \
MOSU_AI_API_KEY=xxx \
mosu

# npx 直接使用
npx @cmtlyt/mosu --ai-base-url https://api.openai.com/v1 --ai-api-key sk-xxx
```

---

## 4. Agent API 设计

### 4.1 API 路由设计

**对话能力**保持原有路径 `/v1/chat/completions`（兼容 OpenAI 格式），**Agent 扩展能力**使用 `/mosu/` 前缀：

| 路径                        | 方法 | 说明                        |
| --------------------------- | ---- | --------------------------- |
| `POST /v1/chat/completions` | POST | AI 对话（兼容 OpenAI 格式） |
| `GET /mosu/capabilities`    | GET  | 返回当前后端支持的能力列表  |
| `POST /mosu/tools/read`     | POST | 读取文件/资源（预留）       |
| `POST /mosu/tools/write`    | POST | 写入文件/资源（预留）       |
| `POST /mosu/tools/*`        | POST | 其他工具能力（预留扩展）    |

### 4.2 能力检查接口

`GET /mosu/capabilities` 返回当前后端支持的能力列表，前端据此动态显示/隐藏功能：

```json
{
  "version": "0.1.1",
  "capabilities": [
    {
      "name": "chat",
      "description": "AI 对话能力",
      "endpoint": "/v1/chat/completions",
      "enabled": true
    },
    {
      "name": "tools.read",
      "description": "文件读取工具",
      "endpoint": "/mosu/tools/read",
      "enabled": false
    },
    {
      "name": "tools.write",
      "description": "文件写入工具",
      "endpoint": "/mosu/tools/write",
      "enabled": false
    }
  ]
}
```

前端启动时调用此接口，根据返回的 `capabilities` 列表决定显示哪些功能面板。`enabled: false` 的能力表示后端已注册但当前未启用（如未配置 API Key 时 chat 为 disabled）。

### 4.3 OpenAPI Router 与同构 API Client

服务端使用 **OpenAPI Router** 模式实现接口，自动生成类型安全的同构 API Client：

1. **服务端**：通过 OpenAPI schema 定义路由，Hono 自动注册
2. **客户端**：从 OpenAPI schema 自动生成类型安全的 API client，前端直接调用
3. **类型共享**：前后端共享同一套类型定义，无需手动维护

示例结构：

```typescript
// server/openapi.ts
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';

const chatRoute = createRoute({
  method: 'post',
  path: '/v1/chat/completions',
  request: { body: { content: { 'application/json': { schema: ChatRequestSchema } } } },
  responses: { 200: { content: { 'application/json': { schema: ChatResponseSchema } } } },
});

// 自动生成类型安全的 client
export type ApiClient = typeof app;
```

前端使用：

```typescript
import { createClient } from '@/libs/api-client';
const client = createClient<ApiClient>(baseUrl);
const response = await client.v1.chat.completions.$post({ json: { messages, stream: true } });
```

---

## 5. 服务端实现

### 5.1 技术选型

- **HTTP 框架**: Hono（轻量、高性能、TypeScript 优先、边缘计算友好）
- **CLI 参数解析**: Node.js 内置 `util.parseArgs`（Node 22+ 原生支持）
- **静态文件服务**: `@hono/node-server` 的 `serveStatic`
- **构建工具**: Vite（复用现有配置，多入口构建）
- **日志**: 项目通用 `logger`（前后端共享，见第 8 节）

### 5.2 目录结构

```
mosu/
├── server/                    # 服务端代码（TypeScript）
│   ├── index.ts               # CLI 入口（#!/usr/bin/env node）
│   ├── config.ts              # 配置解析（CLI args + env vars）
│   ├── app.ts                 # Hono app 定义（OpenAPI Router）
│   ├── openapi.ts             # OpenAPI schema 定义
│   ├── capabilities.ts        # 能力注册表
│   ├── routes/
│   │   ├── chat.ts            # Chat API 路由（/v1/chat/completions）
│   │   ├── capabilities.ts   # 能力检查路由（/mosu/capabilities）
│   │   └── tools.ts           # 工具路由（/mosu/tools/*，预留）
│   └── prompts/
│       └── editor.ts          # 编辑器 AI system prompt（从前端迁移）
├── libs/                      # 项目通用库（前后端共享）
│   ├── logger.ts              # 通用 logger（同时注册 web 和 node adapter）
│   └── api-client.ts          # 同构 API client（从 OpenAPI schema 生成）
├── src/                       # 前端源码
│   └── ...
├── dist/                      # 前端构建产物（Vite 默认）
├── dist-cli/                  # CLI 服务构建产物
├── dist-npm/                  # SDK 构建产物（animation-sdk）
└── package.json
```

**删除**：

- `backend/` 目录（完全合并到 `server/`）
- `src/constants/ai.ts`（prompt 迁移到 `server/prompts/`，`MODEL_ID_MAP` 随 WebLLM 一起移除）
- `src/libs/logger.ts`（迁移到根目录 `libs/logger.ts`）

### 5.3 服务端代码结构

#### `server/config.ts` — 配置解析

```typescript
import { parseArgs } from 'node:util';

export interface ServerConfig {
  port: number;
  host: string;
  aiBaseUrl: string;
  aiModel: string;
  aiApiKey: string;
  showVersion: boolean;
  showHelp: boolean;
  isCli: boolean;
}

export function resolveConfig(isCli = true): ServerConfig {
  const { values } = parseArgs({
    options: {
      port: { type: 'string', short: 'p', default: '' },
      host: { type: 'string', default: '' },
      'ai-base-url': { type: 'string', default: '' },
      'ai-model': { type: 'string', default: '' },
      'ai-api-key': { type: 'string', default: '' },
      version: { type: 'boolean', short: 'v', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
  });

  return {
    port: Number(values.port || process.env.MOSU_PORT || 3000),
    host: values.host || process.env.MOSU_HOST || '0.0.0.0',
    aiBaseUrl: values['ai-base-url'] || process.env.MOSU_AI_BASE_URL || '',
    aiModel: values['ai-model'] || process.env.MOSU_AI_MODEL || '',
    aiApiKey: values['ai-api-key'] || process.env.MOSU_AI_API_KEY || '',
    showVersion: values.version,
    showHelp: values.help,
    isCli,
  };
}
```

#### `server/capabilities.ts` — 能力注册表

```typescript
import type { ServerConfig } from './config';

export interface Capability {
  name: string;
  description: string;
  endpoint: string;
  enabled: boolean;
}

export function getCapabilities(config: ServerConfig): Capability[] {
  return [
    {
      name: 'chat',
      description: 'AI 对话能力',
      endpoint: '/v1/chat/completions',
      enabled: Boolean(config.aiBaseUrl && config.aiApiKey),
    },
    {
      name: 'tools.read',
      description: '文件读取工具',
      endpoint: '/mosu/tools/read',
      enabled: false,
    },
    {
      name: 'tools.write',
      description: '文件写入工具',
      endpoint: '/mosu/tools/write',
      enabled: false,
    },
  ];
}
```

#### `server/prompts/editor.ts` — 编辑器 System Prompt

从 `src/constants/ai.ts` 迁移，内容保持不变：

```typescript
export const EDITOR_SYSTEM_PROMPT = `你是动画编辑器助手，根据用户需求输出合法 JSON（不含 markdown 标记）。

## 输出格式（强制规则）
你必须将响应 JSON 对象包裹在 <mosu-response> 标签中，标签外不得有任何其他内容。

示例：
<mosu-response>
{
  "name": "变更摘要",
  "domPatch": [...],
  "style": "...",
  "config": {...}
}
</mosu-response>

## 响应结构
{
  "name": "变更摘要",
  "domPatch": [...],
  "style": "...",
  "config": {...},
  "animationPatch": [...]
}

...（完整 prompt 内容从 src/constants/ai.ts 的 SYSTEM_PROMPT 原样迁移）
`;
```

#### `server/routes/capabilities.ts` — 能力检查路由

```typescript
import { Hono } from 'hono';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ServerConfig } from '../config';
import { getCapabilities } from '../capabilities';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getVersion(): string {
  const pkgPath = resolve(__dirname, '../../package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  return pkg.version;
}

export function createCapabilitiesRouter(config: ServerConfig) {
  const router = new Hono();

  router.get('/mosu/capabilities', (c) => {
    return c.json({
      version: getVersion(),
      capabilities: getCapabilities(config),
    });
  });

  return router;
}
```

#### `server/routes/chat.ts` — Chat API 路由

```typescript
import { Hono } from 'hono';
import type { ServerConfig } from '../config';
import { EDITOR_SYSTEM_PROMPT } from '../prompts/editor';
import { logger } from '../logger';

export function createChatRouter(config: ServerConfig) {
  const router = new Hono();

  router.post('/api/chat', async (c) => {
    if (!config.aiBaseUrl || !config.aiApiKey) {
      return c.json({ error: { message: 'AI not configured. Use --ai-base-url and --ai-api-key' } }, 503);
    }

    const body = await c.req.json();
    const isStream = body.stream === true;

    const messages = [{ role: 'system', content: EDITOR_SYSTEM_PROMPT }, ...body.messages];

    logger.info('server.chat.request', `Chat request: ${messages.length} messages, stream=${isStream}`);

    const upstreamResponse = await fetch(`${config.aiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.aiApiKey}`,
      },
      body: JSON.stringify({
        ...body,
        messages,
        model: config.aiModel || body.model,
      }),
    });

    if (!upstreamResponse.ok) {
      const errorBody = await upstreamResponse.text();
      logger.error('server.chat.upstream', `Upstream error ${upstreamResponse.status}`, errorBody);
      return c.json(
        { error: { message: `Upstream API error: ${upstreamResponse.status}` } },
        upstreamResponse.status as 500,
      );
    }

    if (isStream) {
      return new Response(upstreamResponse.body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    }

    const data = await upstreamResponse.json();
    return c.json(data);
  });

  return router;
}
```

#### `server/routes/tools.ts` — 工具路由（预留）

```typescript
import { Hono } from 'hono';

export function createToolsRouter() {
  const router = new Hono();

  router.post('/mosu/tools/read', async (c) => {
    return c.json({ error: { message: 'tools.read not implemented yet' } }, 501);
  });

  router.post('/mosu/tools/write', async (c) => {
    return c.json({ error: { message: 'tools.write not implemented yet' } }, 501);
  });

  return router;
}
```

#### `server/app.ts` — Hono App 定义

```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from '@hono/node-server';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ServerConfig } from './config';
import { createChatRouter } from './routes/chat';
import { createCapabilitiesRouter } from './routes/capabilities';
import { createToolsRouter } from './routes/tools';
import { logger } from '../libs/logger';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createApp(config: ServerConfig) {
  const app = new Hono();

  app.use('*', cors());

  app.route('/', createCapabilitiesRouter(config));
  app.route('/', createChatRouter(config));
  app.route('/', createToolsRouter());

  if (config.isCli) {
    const chatEnabled = Boolean(config.aiBaseUrl && config.aiApiKey);
    logger.info('server.app.init', `Agent API initialized (chat: ${chatEnabled ? 'enabled' : 'disabled'})`);

    const distPath = resolve(__dirname, '../dist');
    app.use('/*', serveStatic({ root: distPath }));
  }

  return app;
}
```

#### `libs/logger.ts` — 项目通用 Logger

前后端共享，同时注册 web 和 node 的 outputAdapter，根据运行环境自动选择：

```typescript
import { createLogger } from '@cmtlyt/logger';
import { webConsoleAdapter } from '@cmtlyt/logger/adapters/web';
import { nodeConsoleAdapter } from '@cmtlyt/logger/adapters/node';

interface ParsedData {
  type: string;
  pointer: string;
  message: string;
  otherMessage: unknown[];
}

type LoggerFn = (pointer: string, message: string, ...otherMessage: unknown[]) => void;

interface Logger {
  info: LoggerFn;
  warn: LoggerFn;
  error: (pointer: string, message: string, error: unknown, ...otherMessage: unknown[]) => void;
  debug: LoggerFn;
  appear: LoggerFn;
  event: LoggerFn;
}

const isNode = typeof process !== 'undefined' && process.versions?.node;

export const logger = createLogger<ParsedData>({
  enableOutput: true,
  transform(options) {
    const { type, messages } = options;
    const [pointer, message, ...otherMessage] = messages;
    return { type, pointer, message, otherMessage };
  },
  report() {},
  outputAdapters: [
    webConsoleAdapter({
      allowTypes: ['appear', 'event'],
      consoleLevel: 'debug',
      getSubTitle(options) {
        return options.transformData.pointer;
      },
      getMessages(options) {
        return options.messages.slice(1);
      },
    }),
    nodeConsoleAdapter({
      allowTypes: ['appear', 'event'],
      consoleLevel: 'debug',
      getSubTitle(options) {
        return options.transformData.pointer;
      },
      getMessages(options) {
        return options.messages.slice(1);
      },
    }),
  ],
}) as unknown as Logger;
```

**使用方式**：

前端：

```typescript
import { logger } from '@lib/logger';
logger.info('editor.ai.chat', 'Chat started');
```

后端：

```typescript
import { logger } from '../libs/logger';
logger.info('server.chat.request', 'Chat request received');
```

#### `server/index.ts` — CLI 入口

```typescript
#!/usr/bin/env node
import { serve } from '@hono/node-server';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveConfig } from './config';
import { createApp } from './app';
import { logger } from '../libs/logger';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getVersion(): string {
  const pkgPath = resolve(__dirname, '../package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  return pkg.version;
}

const config = resolveConfig(true);
const version = getVersion();

if (config.showVersion) {
  console.log(`mosu v${version}`);
  process.exit(0);
}

if (config.showHelp) {
  console.log(`
Usage: mosu [options]

Options:
  -p, --port <number>     Server port (default: 3000)
  --host <string>         Server host (default: 0.0.0.0)
  --ai-base-url <url>     Upstream AI API base URL (required for chat)
  --ai-model <string>     AI model name
  --ai-api-key <key>      AI API key
  -v, --version           Show version
  -h, --help              Show help
  `);
  process.exit(0);
}

const app = createApp(config);

serve({
  fetch: app.fetch,
  port: config.port,
  hostname: config.host,
});

const chatEnabled = Boolean(config.aiBaseUrl && config.aiApiKey);
logger.info('server.cli.start', `Mosu v${version} started`);
logger.info('server.cli.address', `Local: http://localhost:${config.port}`);
logger.info('server.cli.network', `Network: http://${config.host}:${config.port}`);
logger.info('server.cli.chat', `Chat: ${chatEnabled ? 'enabled' : 'disabled (use --ai-base-url and --ai-api-key)'}`);
```

---

## 6. 开发环境与 Vite 插件

### 6.1 开发环境（@hono/vite-dev-server）

使用 `@hono/vite-dev-server` 提供 Hono 的开发环境热更新。

**优势**：

- 官方支持，维护更稳定
- 自动处理 HMR（热模块替换）
- 与 Vite 深度集成

### 6.2 配置方式

在 `vite.config.ts` 的前端配置中注册：

```typescript
import { devServer } from '@hono/vite-dev-server';

function getFrontendConfig(): UserConfig {
  return {
    base: '/mosu/',
    plugins: [
      tanstackRouter({ ... }),
      react({}),
      devServer({
        entry: './server/app.ts',
        exclude: [/^\/(src|node_modules)\//],
      }),
    ],
    resolve: {
      tsconfigPaths: true,
    },
  };
}
```

### 6.3 工作原理

1. `@hono/vite-dev-server` 拦截所有非静态资源请求
2. 将请求转发到 Hono app（`server/app.ts`）
3. Hono app 处理 `/v1/*` 和 `/mosu/*` 路由
4. 静态资源（`/src/*`、`/node_modules/*`）由 Vite 正常处理

### 6.4 Vite 插件（生产环境集成）

保留 `server/vite-plugin.ts`，供**生产环境中其他开发服务器**（如 Storybook、Playwright 等）集成 Mosu 后端能力：

```typescript
import type { Plugin } from 'vite';
import { resolveConfig } from './config';
import { createApp } from './app';

let serverInstance: any = null;

function createProxyHandler(app: any) {
  return async (req: any, res: any, next: any) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    const bodyBuffer = Buffer.concat(chunks);

    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const request = new Request(url.toString(), {
      method: req.method,
      headers: req.headers as Record<string, string>,
      body: ['GET', 'HEAD'].includes(req.method ?? '') ? undefined : bodyBuffer,
    });

    try {
      const response = await app.fetch(request);
      res.statusCode = response.status;
      response.headers.forEach((value: string, key: string) => {
        res.setHeader(key, value);
      });

      if (response.body) {
        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
        res.end();
      } else {
        const body = await response.text();
        res.end(body);
      }
    } catch (error) {
      console.error('Mosu server error:', error);
      next(error);
    }
  };
}

export function mosuServerPlugin(): Plugin {
  return {
    name: 'vite-plugin-mosu-server',
    configureServer(server) {
      if (serverInstance) {
        return;
      }

      const config = resolveConfig(false);
      const app = createApp(config);
      const handler = createProxyHandler(app);

      server.middlewares.use('/v1', handler);
      server.middlewares.use('/mosu', handler);

      serverInstance = app;
    },
  };
}
```

**使用场景**：其他项目的 Vite 开发服务器可通过注册此插件获得 Mosu Agent API 能力。

---

## 7. 前端适配

### 7.1 移除 WebLLM

**变更文件**: `src/utils/editor/ai-engine.ts`

移除所有 WebLLM 相关代码，仅保留 API 调用模式。完整文件内容：

```typescript
import type { ChatCompletionMessageParam } from '@lib/types/openai';
import { logger } from '@lib/logger';

const AI_BASE_URL_KEY = 'mosu_ai_base_url';

async function parseSSEStream(body: ReadableStream<Uint8Array>, onChunk: (text: string) => void): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let fullResponse = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ') || trimmed === 'data: [DONE]') {
        continue;
      }

      try {
        const parsed = JSON.parse(trimmed.slice(6));
        const delta = parsed.choices?.[0]?.delta?.content ?? '';
        fullResponse += delta;
        onChunk(delta);
      } catch {
        // skip malformed SSE chunks
      }
    }
  }

  return fullResponse;
}

async function streamChatViaApi(
  baseUrl: string,
  messages: ChatCompletionMessageParam[],
  onChunk: (text: string) => void,
): Promise<string> {
  logger.info('libs.ai-engine.api', `Using API mode with base URL: ${baseUrl}`);

  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      stream: true,
      temperature: 0.7,
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`API responded with status ${response.status}`);
  }

  return parseSSEStream(response.body, onChunk);
}

export async function streamChat(
  messages: ChatCompletionMessageParam[],
  onChunk: (text: string) => void,
): Promise<string> {
  const baseUrl = localStorage.getItem(AI_BASE_URL_KEY) ?? '';

  if (!baseUrl) {
    throw new Error('AI base URL not configured. Please set it in settings.');
  }

  return streamChatViaApi(baseUrl, messages, onChunk);
}
```

**删除的内容**：

- `getAIEngine` 函数（WebLLM 引擎初始化）
- `streamChatViaProxy` 函数（localhost:3001 代理降级）
- `useFallback` 变量
- `CreateMLCEngine`、`MLCEngineInterface` 导入
- `MODEL_ID_MAP` 导入
- `detectModelTier` 导入
- `AI_MODE_KEY` 常量（不再需要模式切换）
- `LOCAL_AI_PROXY_URL` 常量

### 7.2 删除模型加载器

**删除文件**: `src/hooks/use-model-loader.ts`

该 hook 原本用于加载 WebLLM 模型。移除 WebLLM 后，editor.tsx 不再引用此 hook（见 7.3 节），直接删除整个文件。

### 7.3 对话面板条件显示

**变更文件**: `src/routes/editor.tsx`

在 `EditorPage` 组件中，根据 AI URL 配置控制对话面板显示。变更点：

1. 新增 `isAIConfigured` state（在现有 `useState` 声明区域之后）
2. 用 `{isAIConfigured && <ChatPanel ... />}` 包裹 `ChatPanel`
3. 移除 `useModelLoader` 的调用（不再需要模型加载状态）
4. `handleSendMessage` 中移除 `isLoaded` 检查（改为检查 `isAIConfigured`）

```typescript
const [isAIConfigured] = useState(() => {
  return Boolean(localStorage.getItem('mosu_ai_base_url'));
});

// 移除: const { isLoaded, error: modelError } = useModelLoader();

// handleSendMessage 中的变更：
if (!isAIConfigured) {
  dispatchEditorEvent(EDITOR_EVENTS.MESSAGE, { text: 'AI 未配置，请在设置中配置 AI API', type: 'error' });
  return;
}

// JSX 中的变更：
{isAIConfigured && (
  <ChatPanel
    messages={displayMessages}
    isStreaming={isStreaming}
    onSendMessage={handleSendMessage}
    currentConfig={currentConfig}
  />
)}
```

**同时需要移除的导入**：

```typescript
// 删除此行：
import { useModelLoader } from '@/hooks/use-model-loader';
```

### 7.4 删除 AI 常量文件

**删除文件**: `src/constants/ai.ts`

- `SYSTEM_PROMPT` 已迁移到 `server/prompts/editor.ts`
- `MODEL_ID_MAP` 随 WebLLM 一起移除

---

## 8. Logger 统一

### 8.1 升级 `libs/logger.ts` 为项目通用模块

将 `src/libs/logger.ts` 迁移到根目录 `libs/logger.ts`，前后端共享。同时注册 web 和 node 的 outputAdapter，根据运行环境自动选择（见第 5.3 节 `libs/logger.ts` 完整实现）。

### 8.2 使用方式

前端：

```typescript
import { logger } from '@lib/logger';
logger.info('editor.ai.chat', 'Chat started');
```

后端：

```typescript
import { logger } from '@lib/logger';
logger.info('server.chat.request', 'Chat request received');
```

**路径别名配置**：在 `tsconfig.json` 中添加 `@lib/logger` 到 `./libs/logger.ts` 的映射（Vite 8.x 通过 `tsconfigPaths` 自动读取，无需单独配置 alias）：

```json
// tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@lib/logger": ["./libs/logger.ts"]
    }
  }
}
```

---

## 9. 多模块构建

### 9.1 Vite 配置

修改 `vite.config.ts` 支持多入口构建。使用条件变量避免多个 `export default`：

```typescript
import { defineConfig, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react-oxc';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import { devServer } from '@hono/vite-dev-server';
import { resolve } from 'node:path';
import dts from 'vite-plugin-dts';

const buildTarget = process.env.MOSU_BUILD_TARGET;

function getFrontendConfig(): UserConfig {
  return {
    base: '/mosu/',
    plugins: [
      tanstackRouter({
        target: 'react',
        autoCodeSplitting: true,
        generatedRouteTree: './src/route-tree.gen.ts',
      }),
      react({}),
      devServer({
        entry: './server/app.ts',
        exclude: [/^\/(src|node_modules)\//],
      }),
    ],
    resolve: {
      tsconfigPaths: true,
    },
  };
}

function getCliConfig(): UserConfig {
  return {
    build: {
      outDir: 'dist-cli',
      lib: {
        entry: resolve(__dirname, 'server/index.ts'),
        formats: ['es'],
        fileName: () => 'index.js',
      },
    },
  };
}

function getSdkConfig(): UserConfig {
  return {
    build: {
      outDir: 'dist-npm',
      lib: {
        entry: resolve(__dirname, 'src/libs/animation-sdk/index.ts'),
        name: 'MosuAnimationSDK',
        formats: ['es', 'cjs'],
        fileName: (format) => `animation-sdk.${format === 'es' ? 'mjs' : 'cjs'}`,
      },
    },
    plugins: [
      dts({
        outDir: 'dist-npm',
        include: ['src/libs/animation-sdk/**/*', 'src/types/animation.ts'],
      }),
    ],
  };
}

let config: UserConfig;
if (buildTarget === 'cli') {
  config = getCliConfig();
} else if (buildTarget === 'sdk') {
  config = getSdkConfig();
} else {
  config = getFrontendConfig();
}

export default defineConfig(config);
```

### 9.2 package.json scripts

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "build:cli": "MOSU_BUILD_TARGET=cli vite build",
    "build:sdk": "MOSU_BUILD_TARGET=sdk vite build",
    "build:all": "pnpm build && pnpm build:cli && pnpm build:sdk",
    "preview": "vite preview",
    "start": "node dist-cli/index.js"
  }
}
```

---

## 10. 依赖优化

### 10.1 依赖分类原则

**生产依赖（dependencies）**：仅包含后端运行时必需的依赖

- `hono` — HTTP 框架
- `@hono/node-server` — Hono Node.js 适配器
- `@cmtlyt/logger` — 日志库（前后端共享）

**开发依赖（devDependencies）**：包含所有前端依赖和构建工具

- `react`、`react-dom` — 前端框架（打包进 dist/）
- `@tanstack/react-router` — 前端路由（打包进 dist/）
- `motion` — 前端动画库（打包进 dist/）
- `@cmtlyt/lingshu-toolkit` — 前端工具库（打包进 dist/）
- 所有构建工具、类型定义、代码规范工具

### 10.2 package.json 变更

```json
{
  "name": "@cmtlyt/mosu",
  "version": "0.1.1",
  "type": "module",
  "bin": {
    "mosu": "./dist-cli/index.js"
  },
  "files": ["dist", "dist-cli", "dist-npm"],
  "exports": {
    "./animation-sdk": {
      "import": "./dist-npm/animation-sdk.mjs",
      "require": "./dist-npm/animation-sdk.cjs",
      "types": "./dist-npm/index.d.ts"
    }
  },
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "build:cli": "MOSU_BUILD_TARGET=cli vite build",
    "build:sdk": "MOSU_BUILD_TARGET=sdk vite build",
    "build:all": "pnpm build && pnpm build:cli && pnpm build:sdk",
    "preview": "vite preview",
    "start": "node dist-cli/index.js",
    "prepublishOnly": "pnpm build:all",
    "lint": "oxlint",
    "lint:github": "oxlint --format=github",
    "lint:fix": "oxlint --fix",
    "fmt": "oxfmt --no-error-on-unmatched-pattern",
    "fmt:check": "oxfmt --no-error-on-unmatched-pattern --check",
    "prepare": "husky"
  },
  "dependencies": {
    "@cmtlyt/logger": "^0.6.1",
    "@hono/node-server": "^2.0.5",
    "@hono/zod-openapi": "^1.4.0",
    "hono": "^4.12.26",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@cmtlyt/lingshu-toolkit": "^0.10.0",
    "@commitlint/cli": "^21.0.2",
    "@commitlint/config-conventional": "^21.0.2",
    "@hono/vite-dev-server": "^0.26.0",
    "@mlc-ai/web-llm": "^0.2.84",
    "@tanstack/react-router": "^1.170.15",
    "@tanstack/router-plugin": "^1.168.18",
    "@types/react": "^19.2.17",
    "@types/react-dom": "^19.2.3",
    "@typescript/native-preview": "7.0.0-dev.20260612.1",
    "@vitejs/plugin-react-oxc": "^0.4.3",
    "changelogithub": "^14.0.0",
    "husky": "^9.1.7",
    "lint-staged": "^17.0.7",
    "oxfmt": "^0.54.0",
    "oxlint": "^1.69.0",
    "react": "^19.2.7",
    "react-dom": "^19.2.7",
    "vite": "^8.0.16",
    "vite-plugin-dts": "^4.5.4"
  }
}
```

**移除的依赖**：

- `motion`（已不再使用）

**新增的依赖**：

- `hono@^4.12.26` — 生产依赖
- `@hono/node-server@^2.0.5` — 生产依赖
- `@hono/zod-openapi@^1.4.0` — 生产依赖（OpenAPI Router）
- `zod@^4.4.3` — 生产依赖（schema 验证）
- `@hono/vite-dev-server@^0.26.0` — 开发依赖（开发环境热更新）

**移动的依赖**（从 dependencies 移到 devDependencies）：

- `@cmtlyt/lingshu-toolkit`
- `@tanstack/react-router`
- `react`
- `react-dom`

---

## 11. 启动日志示例

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

---

## 12. 实施步骤

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

---

## 13. 类型定义迁移

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
import type { ChatCompletionMessageParam } from '@lib/types/openai';
```

**`src/hooks/use-ai-chat.ts`**：

```typescript
import type { ChatCompletionMessageParam } from '@lib/types/openai';
```

---

## 14. 涉及文件清单（完整版）

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
