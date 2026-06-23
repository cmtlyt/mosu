# 开发环境与 Vite 插件

## 开发环境（@hono/vite-dev-server）

使用 `@hono/vite-dev-server` 提供 Hono 的开发环境热更新。

**优势**：

- 官方支持，维护更稳定
- 自动处理 HMR（热模块替换）
- 与 Vite 深度集成

## 配置方式

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

## 工作原理

1. `@hono/vite-dev-server` 拦截所有非静态资源请求
2. 将请求转发到 Hono app（`server/app.ts`）
3. Hono app 处理 `/v1/*` 和 `/mosu/*` 路由
4. 静态资源（`/src/*`、`/node_modules/*`）由 Vite 正常处理

## Vite 插件（生产环境集成）

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

      const config = resolveConfig({ isCli: false, serveStatic: true });
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
