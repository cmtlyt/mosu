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
