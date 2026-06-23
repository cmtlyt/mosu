import { OpenAPIHono } from '@hono/zod-openapi';
import * as routes from './routes';
import * as controller from './controller';
import { capabilityRegistry } from '@mosu/capabilities';
import type { Env } from '@mosu/types';

const router = new OpenAPIHono<Env>().openapi(routes.editorChatRoute, controller.handleEditorChat);

capabilityRegistry.register({
  name: 'editor-chat',
  description: 'Editor AI chat with system directives',
  endpoint: '/mosu/api/editor/chat',
  enabled: true,
});

export default router;
