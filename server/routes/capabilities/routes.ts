import { createRoute } from '@hono/zod-openapi';
import * as schema from './schema';

export const capabilitiesRoute = createRoute({
  method: 'get',
  path: '/capabilities',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: schema.CapabilitiesResponseSchema,
        },
      },
      description: 'List all capabilities',
    },
  },
});
