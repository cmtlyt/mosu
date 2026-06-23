# Agent API 设计

## API 路由设计

所有 API 路由统一使用 `/mosu/api` 前缀。**对话能力**保持 `/v1/chat/completions` 路径（兼容 OpenAI 格式），**Agent 扩展能力**使用 `/mosu/api/` 前缀：

| 路径                                 | 方法 | 说明                        |
| ------------------------------------ | ---- | --------------------------- |
| `POST /mosu/api/v1/chat/completions` | POST | AI 对话（兼容 OpenAI 格式） |
| `GET /mosu/api/capabilities`         | GET  | 返回当前后端支持的能力列表  |
| `POST /mosu/api/tools/read`          | POST | 读取文件/资源（预留）       |
| `POST /mosu/api/tools/write`         | POST | 写入文件/资源（预留）       |
| `POST /mosu/api/tools/*`             | POST | 其他工具能力（预留扩展）    |

## 能力检查接口

`GET /mosu/api/capabilities` 返回当前后端支持的能力列表，前端据此动态显示/隐藏功能：

```json
{
  "capabilities": [
    {
      "name": "chat",
      "description": "AI 对话能力",
      "endpoint": "/mosu/api/v1/chat/completions",
      "enabled": true
    },
    {
      "name": "tools.read",
      "description": "文件读取工具",
      "endpoint": "/mosu/api/tools/read",
      "enabled": false
    },
    {
      "name": "tools.write",
      "description": "文件写入工具",
      "endpoint": "/mosu/api/tools/write",
      "enabled": false
    }
  ]
}
```

前端启动时调用此接口，根据返回的 `capabilities` 列表决定显示哪些功能面板。`enabled: false` 的能力表示后端已注册但当前未启用（如未配置 API Key 时 chat 为 disabled）。

## OpenAPI Router 与同构 API Client

服务端使用 **OpenAPI Router** 模式（`@hono/zod-openapi`）实现接口，自动生成类型安全的同构 API Client：

1. **服务端**：通过 OpenAPI schema 定义路由，Hono 自动注册
2. **客户端**：从 OpenAPI schema 自动生成类型安全的 API client，前端直接调用
3. **类型共享**：前后端共享同一套类型定义，无需手动维护

### 路由模块化组织

每个路由模块采用目录形式组织，包含以下文件：

- `schema.ts` — Zod schema 定义（请求/响应数据结构）
- `routes.ts` — OpenAPI route 定义（使用 `createRoute`）
- `controller.ts` — 业务逻辑处理函数（使用 `RouteHandler` 类型）
- `index.ts` — 路由注册与导出（使用命名空间导入 `import * as routes from './routes'`）

示例结构：

```typescript
// server/routes/chat/schema.ts
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

// server/routes/chat/routes.ts
import { createRoute } from '@hono/zod-openapi';
import { ChatCompletionRequestSchema, ChatCompletionResponseSchema } from './schema';

export const chatRoute = createRoute({
  method: 'post',
  path: '/v1/chat/completions',
  request: { body: { content: { 'application/json': { schema: ChatCompletionRequestSchema } } } },
  responses: { 200: { content: { 'application/json': { schema: ChatCompletionResponseSchema } } } },
});

// server/routes/chat/controller.ts
import { chatRoute } from './routes';
import type { RouteHandler } from '@mosu/types';

export const handleChatCompletion: RouteHandler<typeof chatRoute> = async (c) => {
  const { messages, stream } = c.req.valid('json');
  const config = c.get('config');
  // ... 业务逻辑
};

// server/routes/chat/index.ts
import { OpenAPIHono } from '@hono/zod-openapi';
import * as routes from './routes';
import { handleChatCompletion } from './controller';
import type { Env } from '@mosu/types';

const router = new OpenAPIHono<Env>().openapi(routes.chatRoute, handleChatCompletion);

export default router;
```

前端使用：

```typescript
import { createClient } from '@/libs/api-client';
const client = createClient<ApiClient>(baseUrl);
const response = await client.v1.chat.completions.$post({ json: { messages, stream: true } });
```
