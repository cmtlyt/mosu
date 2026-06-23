import { OpenAPIHono } from '@hono/zod-openapi';
import { serveStatic } from '@hono/node-server/serve-static';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import chatRouter from './routes/chat';
import editorChatRouter from './routes/editor-chat';
import capabilitiesRouter from './routes/capabilities';
import toolsRouter from './routes/tools';
import { resolveConfig, type ServerConfig } from './config';
import { setupServices } from './services';
import { logger } from '@lib/logger';
import type { Env } from './types';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createApp(config: ServerConfig) {
  setupServices(config);

  const app = new OpenAPIHono<Env>().basePath('/mosu/api');

  // 将 config 注入 context，所有子路由可通过 c.get('config') 获取
  app.use('*', async (c, next) => {
    c.set('config', config);
    await next();
  });

  // 注册路由（统一前缀 /mosu/api）
  const finalApp = app
    .route('/', chatRouter)
    .route('/', editorChatRouter)
    .route('/', capabilitiesRouter)
    .route('/', toolsRouter);

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
