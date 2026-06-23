import { OpenAPIHono } from '@hono/zod-openapi';
import { logger } from '@lib/logger';
import type { Env } from '@mosu/types';

const router = new OpenAPIHono<Env>();

// 预留工具路由，后续扩展
logger.info('server.tools.init', 'Tool routes registered (placeholder)');

export default router;
