import { z } from '@hono/zod-openapi';

export const CapabilitySchema = z.object({
  name: z.string(),
  description: z.string(),
  endpoint: z.string(),
  enabled: z.boolean(),
});

export const CapabilitiesResponseSchema = z.object({
  capabilities: z.array(CapabilitySchema),
});
