import { createRoute } from '@hono/zod-openapi';
import * as schema from './schema';

export const chatRoute = createRoute({
  method: 'post',
  path: '/v1/chat/completions',
  request: {
    body: {
      content: {
        'application/json': {
          schema: schema.ChatCompletionRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: schema.ChatCompletionResponseSchema,
        },
        'text/event-stream': {
          schema: schema.ChatCompletionChunkSchema,
        },
      },
      description: 'Chat completion response',
    },
  },
});
