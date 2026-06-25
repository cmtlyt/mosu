import type { InferRequestType } from 'hono/client';
import { hc } from 'hono/client';
import type { AppType } from '@mosu/app';

export function createApiClient(baseUrl = 'http://localhost:3000') {
  return hc<AppType>(baseUrl).mosu.api;
}

export type InferRequest<T> = InferRequestType<T>;
