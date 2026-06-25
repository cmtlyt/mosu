import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '@mosu/types';

const router = new OpenAPIHono<Env>();

// TODO: 预留工具路由，后续扩展

export default router;
