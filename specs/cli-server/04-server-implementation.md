# 服务端实现

## 技术选型

- **HTTP 框架**: Hono（轻量、高性能、TypeScript 优先、边缘计算友好）
- **OpenAPI Router**: `@hono/zod-openapi`（类型安全的路由定义）
- **CLI 参数解析**: Node.js 内置 `util.parseArgs`（Node 22+ 原生支持）
- **静态文件服务**: `@hono/node-server` 的 `serveStatic`
- **构建工具**: Vite（复用现有配置，多入口构建）
- **日志**: 项目通用 `logger`（前后端共享，见 07-logger.md）

## 服务端代码结构

### `server/types.ts` — 类型定义

```typescript
import type { RouteHandler as ZodRouteHandler } from '@hono/zod-openapi';
import type { ServerConfig } from './config';

export interface Env {
  Variables: {
    config: ServerConfig;
  };
}

export type RouteHandler<T> = ZodRouteHandler<T, Env>;
```

### `server/config.ts` — 配置解析

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
  serveStatic: boolean;
}

export function resolveConfig(options: { isCli?: boolean; serveStatic?: boolean } = {}): ServerConfig {
  const { isCli = true, serveStatic = false } = options;
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
    serveStatic,
  };
}
```

### `server/capabilities.ts` — 能力注册表

```typescript
export interface Capability {
  name: string;
  description: string;
  endpoint: string;
  enabled: boolean;
}

export class CapabilityRegistry {
  private capabilities: Map<string, Capability> = new Map();

  public register(capability: Capability): void {
    this.capabilities.set(capability.name, capability);
  }

  public get(name: string): Capability | undefined {
    return this.capabilities.get(name);
  }

  public getAll(): Capability[] {
    return Array.from(this.capabilities.values());
  }

  public isEnabled(name: string): boolean {
    const capability = this.capabilities.get(name);
    return capability?.enabled ?? false;
  }
}

export const capabilityRegistry = new CapabilityRegistry();
```

### `server/prompts/editor.ts` — 编辑器 System Prompt

从 `src/constants/ai.ts` 迁移，内容保持不变：

```typescript
export const EDITOR_SYSTEM_PROMPT = `你是动画编辑器助手，根据用户需求输出合法 JSON（不含 markdown 标记）。

## 输出格式（强制规则）
你必须将响应 JSON 对象包裹在 <mosu-response> 标签中，标签外不得有任何其他内容。

示例：
<mosu-response>
{
  "type": "add",
  "data": { ... }
}
</mosu-response>

## 响应结构
...（保持原有完整内容）
`;
```

### `server/routes/chat/schema.ts` — Chat API Schema

```typescript
import { z } from '@hono/zod-openapi';

export const ChatCompletionRequestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['system', 'user', 'assistant']),
      content: z.string(),
    }),
  ),
  stream: z.boolean().optional().default(false),
});

export const ChatCompletionResponseSchema = z.object({
  id: z.string(),
  object: z.literal('chat.completion'),
  created: z.number(),
  model: z.string(),
  choices: z.array(
    z.object({
      index: z.number(),
      message: z.object({
        role: z.literal('assistant'),
        content: z.string(),
      }),
      finish_reason: z.enum(['stop', 'length']),
    }),
  ),
  usage: z.object({
    prompt_tokens: z.number(),
    completion_tokens: z.number(),
    total_tokens: z.number(),
  }),
});

export const ChatCompletionChunkSchema = z.object({
  id: z.string(),
  object: z.literal('chat.completion.chunk'),
  created: z.number(),
  model: z.string(),
  choices: z.array(
    z.object({
      index: z.number(),
      delta: z.object({
        role: z.literal('assistant').optional(),
        content: z.string().optional(),
      }),
      finish_reason: z.enum(['stop', 'length']).nullable(),
    }),
  ),
});
```

### `server/routes/chat/routes.ts` — Chat API Route 定义

```typescript
import { createRoute } from '@hono/zod-openapi';
import { ChatCompletionRequestSchema, ChatCompletionResponseSchema, ChatCompletionChunkSchema } from './schema';

export const chatRoute = createRoute({
  method: 'post',
  path: '/v1/chat/completions',
  request: {
    body: {
      content: {
        'application/json': {
          schema: ChatCompletionRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ChatCompletionResponseSchema,
        },
        'text/event-stream': {
          schema: ChatCompletionChunkSchema,
        },
      },
      description: 'Chat completion response',
    },
  },
});
```

### `server/routes/chat/controller.ts` — Chat API 业务逻辑

```typescript
import { logger } from '@lib/logger';
import { chatRoute } from './routes';
import type { RouteHandler } from '@mosu/types';

export const handleChatCompletion: RouteHandler<typeof chatRoute> = async (c) => {
  const { messages, stream } = c.req.valid('json');
  const config = c.get('config');

  if (!config.aiBaseUrl) {
    return c.json({ error: 'AI service not configured' }, 503);
  }

  logger.info('server.chat.request', 'Processing chat completion request', {
    messageCount: messages.length,
    stream,
  });

  try {
    const response = await fetch(`${config.aiBaseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.aiApiKey}`,
      },
      body: JSON.stringify({
        model: config.aiModel,
        messages,
        stream,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('server.chat.error', 'AI service error', errorText);
      return c.json({ error: 'AI service error', details: errorText }, response.status as any);
    }

    if (stream) {
      c.header('Content-Type', 'text/event-stream');
      c.header('Cache-Control', 'no-cache');
      c.header('Connection', 'keep-alive');

      return c.body(response.body as any);
    }

    const data = await response.json();
    return c.json(data);
  } catch (error) {
    logger.error('server.chat.error', 'Chat completion failed', error);
    return c.json({ error: 'Chat completion failed' }, 500);
  }
};
```

### `server/routes/chat/index.ts` — Chat 路由注册

```typescript
import { OpenAPIHono } from '@hono/zod-openapi';
import * as routes from './routes';
import { handleChatCompletion } from './controller';
import { capabilityRegistry } from '@mosu/capabilities';
import type { Env } from '@mosu/types';

const router = new OpenAPIHono<Env>().openapi(routes.chatRoute, handleChatCompletion);

capabilityRegistry.register({
  name: 'chat',
  description: 'AI chat completion',
  endpoint: '/mosu/api/v1/chat/completions',
  enabled: true,
});

export default router;
```

### `server/routes/capabilities/schema.ts` — Capabilities Schema

```typescript
import { z } from '@hono/zod-openapi';

export const CapabilitySchema = z.object({
  name: z.string(),
  description: z.string(),
  endpoint: z.string(),
  enabled: z.boolean(),
});

export const CapabilitiesResponseSchema = z.object({
  capabilities: z.array(CapabilitySchema),
});
```

### `server/routes/capabilities/routes.ts` — Capabilities Route 定义

```typescript
import { createRoute } from '@hono/zod-openapi';
import { CapabilitiesResponseSchema } from './schema';

export const capabilitiesRoute = createRoute({
  method: 'get',
  path: '/capabilities',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: CapabilitiesResponseSchema,
        },
      },
      description: 'List all capabilities',
    },
  },
});
```

### `server/routes/capabilities/controller.ts` — Capabilities 业务逻辑

```typescript
import { capabilityRegistry } from '@mosu/capabilities';
import type { capabilitiesRoute } from './routes';
import type { RouteHandler } from '@mosu/types';

export const handleGetCapabilities: RouteHandler<typeof capabilitiesRoute> = (c) => {
  const capabilities = capabilityRegistry.getAll();
  return c.json({ capabilities });
};
```

### `server/routes/capabilities/index.ts` — Capabilities 路由注册

```typescript
import { OpenAPIHono } from '@hono/zod-openapi';
import * as routes from './routes';
import { handleGetCapabilities } from './controller';
import type { Env } from '@mosu/types';

const router = new OpenAPIHono<Env>().openapi(routes.capabilitiesRoute, handleGetCapabilities);

export default router;
```

### `server/routes/tools/index.ts` — 工具路由（预留）

```typescript
import { OpenAPIHono } from '@hono/zod-openapi';
import { logger } from '@lib/logger';
import type { Env } from '@mosu/types';

const router = new OpenAPIHono<Env>();

// 预留工具路由，后续扩展
logger.info('server.tools.init', 'Tool routes registered (placeholder)');

export default router;
```

### `server/app.ts` — Hono App 定义

```typescript
import { OpenAPIHono } from '@hono/zod-openapi';
import { serveStatic } from '@hono/node-server/serve-static';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import chatRouter from './routes/chat';
import capabilitiesRouter from './routes/capabilities';
import toolsRouter from './routes/tools';
import { resolveConfig, type ServerConfig } from './config';
import { logger } from '@lib/logger';
import type { Env } from './types';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createApp(config: ServerConfig) {
  const app = new OpenAPIHono<Env>().basePath('/mosu/api');

  // 将 config 注入 context，所有子路由可通过 c.get('config') 获取
  app.use('*', async (c, next) => {
    c.set('config', config);
    await next();
  });

  // 注册路由（统一前缀 /mosu/api）
  const finalApp = app.route('/', chatRouter).route('/', capabilitiesRouter).route('/', toolsRouter);

  // serveStatic=true 时代理前端静态资源（CLI 启动、其他开发服务器集成插件）
  // serveStatic=false 时不代理（开发环境由 Vite 自行处理）
  if (config.serveStatic) {
    const distPath = resolve(__dirname, '../dist');
    app.use('/*', serveStatic({ root: distPath }));
    logger.info('server.static.enabled', 'Static file serving enabled', { path: distPath });
  }

  return finalApp;
}

export type AppType = ReturnType<typeof createApp>;

let appInstance: OpenAPIHono<Env> | null = null;

if (process.env.MOSU_CLI !== 'true') {
  const config = resolveConfig({ isCli: false, serveStatic: false });
  appInstance = createApp(config);
}

export default appInstance;
```

### `server/index.ts` — CLI 入口

```typescript
#!/usr/bin/env node

process.env.MOSU_CLI = 'true';
import { serve } from '@hono/node-server';
import { resolveConfig } from './config';
import { createApp } from './app';
import { logger } from '@lib/logger';

const config = resolveConfig({ isCli: true, serveStatic: true });

if (config.showVersion) {
  console.log('Mosu v0.1.1');
  process.exit(0);
}

if (config.showHelp) {
  console.log(`
Mosu - CLI Server

Usage:
  mosu [options]

Options:
  -p, --port <port>     Server port (default: 3000)
  -h, --host <host>     Server host (default: 0.0.0.0)
  -v, --version         Show version
  --help                Show help

Environment Variables:
  PORT                  Server port
  HOST                  Server host
  AI_BASE_URL           AI service base URL
  AI_MODEL              AI model name (default: qwen-max)
  AI_API_KEY            AI API key
`);
  process.exit(0);
}

const app = createApp(config);

serve({
  fetch: app.fetch,
  port: config.port,
  hostname: config.host,
});

logger.info('server.cli.start', 'Mosu started', { version: '0.1.1' });
logger.info('server.cli.address', 'Local address', { url: `http://localhost:${config.port}` });
logger.info('server.cli.network', 'Network address', { url: `http://${config.host}:${config.port}` });
logger.info('server.cli.chat', 'Chat status', { enabled: !!config.aiBaseUrl });
```
