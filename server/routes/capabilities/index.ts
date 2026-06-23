import { OpenAPIHono } from '@hono/zod-openapi';
import * as routes from './routes';
import { handleGetCapabilities } from './controller';
import type { Env } from '@mosu/types';

const router = new OpenAPIHono<Env>().openapi(routes.capabilitiesRoute, handleGetCapabilities);

export default router;
