import { capabilityRegistry } from '@mosu/capabilities';
import type { capabilitiesRoute } from './routes';
import type { RouteHandler } from '@mosu/types';

export const handleGetCapabilities: RouteHandler<typeof capabilitiesRoute> = (c) => {
  const capabilities = capabilityRegistry.getAll();
  return c.json({ capabilities });
};
