import type { InferRequestType } from 'hono/client';
import { hc } from 'hono/client';
import type { AppType } from '@mosu/app';

export const apiClient = hc<AppType>('http://localhost:3000').mosu.api;

export type InferRequest<T> = InferRequestType<T>;
