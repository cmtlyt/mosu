import type { Plugin, ViteDevServer } from 'vite';
import { Readable } from 'node:stream';
import type { OpenAPIHono } from '@hono/zod-openapi';

export interface MosuServerPluginOptions {
  serveStatic?: boolean;
}

export function mosuPlugin(options: MosuServerPluginOptions = {}): Plugin {
  const { serveStatic = true } = options;
  let app: OpenAPIHono;

  async function recreateApp(server: ViteDevServer) {
    const configModule = await server.ssrLoadModule('./server/config.ts');
    const appModule = await server.ssrLoadModule('./server/app.ts');
    const config = configModule.resolveConfig({ isCli: false, serveStatic });
    app = appModule.createApp(config);
  }

  return {
    name: 'mosu-server',
    async configureServer(server: ViteDevServer) {
      await recreateApp(server);

      server.middlewares.use(async (req, res, next) => {
        const url = req.url || '/';

        // 只处理 API 请求（/mosu/api/ 前缀）
        if (!url.startsWith('/mosu/api/')) {
          return next();
        }

        try {
          const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
          const requestInit: RequestInit = {
            method: req.method,
            headers: req.headers as any,
          };

          if (hasBody) {
            requestInit.body = Readable.toWeb(req) as any;
            (requestInit as any).duplex = 'half';
          }

          const response = await app.fetch(new Request(`http://localhost${url}`, requestInit));

          res.statusCode = response.status;
          response.headers.forEach((value, key) => {
            res.setHeader(key, value);
          });

          if (response.body) {
            const nodeStream = Readable.fromWeb(response.body as any);
            nodeStream.pipe(res);
          } else {
            res.end();
          }
        } catch (error) {
          console.error('[mosu-server] Plugin middleware error:', error);
          next(error);
        }
      });
    },
    async handleHotUpdate({ file, server }: { file: string; server: ViteDevServer }) {
      // 当 server 目录下的文件变更时，重新创建 app 实例并触发全页刷新
      if (file.includes('/server/')) {
        await recreateApp(server);
        return [];
      }
    },
  };
}
