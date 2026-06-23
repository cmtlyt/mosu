import { createRoute } from '@hono/zod-openapi';
import * as schema from './schema';

export const editorChatRoute = createRoute({
  method: 'post',
  path: '/editor/chat',
  request: {
    body: {
      content: {
        'application/json': {
          schema: schema.EditorChatRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'text/event-stream': {
          schema: schema.EditorChatChunkSchema,
        },
      },
      description: 'Editor chat completion stream',
    },
  },
});
