import { OpenAPIHono } from '@hono/zod-openapi';
import * as routes from './routes';
import * as controller from './controller';
import type { Env } from '@mosu/types';

const router = new OpenAPIHono<Env>().openapi(routes.capabilitiesRoute, controller.handleGetCapabilities);

export default router;
