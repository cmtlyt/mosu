import type { Plugin } from 'vite';
import { resolveConfig } from './config';
import { createApp } from './app';
import { logger } from '@lib/logger';

export function mosuServerPlugin(): Plugin {
  return {
    name: 'mosu-server',
    configureServer(server) {
      const config = resolveConfig({ isCli: false, serveStatic: true });
      const app = createApp(config);

      server.middlewares.use(async (req, res, next) => {
        const url = req.url || '/';

        // 只处理 API 请求（/mosu/api/ 前缀）
        if (!url.startsWith('/mosu/api/')) {
          return next();
        }

        try {
          const response = await app.fetch(
            new Request(`http://localhost${url}`, {
              method: req.method,
              headers: req.headers as any,
            }),
          );

          res.statusCode = response.status;
          response.headers.forEach((value, key) => {
            res.setHeader(key, value);
          });

          const body = await response.text();
          res.end(body);
        } catch (error) {
          logger.error('server.plugin.error', 'Plugin middleware error', error);
          next(error);
        }
      });

      logger.info('server.plugin.loaded', 'Mosu server plugin loaded for dev environment');
    },
  };
}
