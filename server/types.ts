import type { RouteConfig, RouteHandler as ZodRouteHandler } from '@hono/zod-openapi';
import type { ServerConfig } from './config';

export interface Env {
  Variables: {
    config: ServerConfig;
  };
}

export type RouteHandler<T extends RouteConfig> = ZodRouteHandler<T, Env>;
