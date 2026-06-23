import { createRoute } from '@hono/zod-openapi';
import { ChatCompletionRequestSchema, ChatCompletionResponseSchema, ChatCompletionChunkSchema } from './schema';

export const chatRoute = createRoute({
  method: 'post',
  path: '/v1/chat/completions',
  request: {
    body: {
      content: {
        'application/json': {
          schema: ChatCompletionRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ChatCompletionResponseSchema,
        },
        'text/event-stream': {
          schema: ChatCompletionChunkSchema,
        },
      },
      description: 'Chat completion response',
    },
  },
});
