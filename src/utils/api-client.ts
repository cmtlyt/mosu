import { createApiClient } from '@lib/api-client';
import { getServerBaseUrl } from '@/constants/api-config';

let cachedBaseUrl = getServerBaseUrl();
let cachedClient = cachedBaseUrl ? createApiClient(cachedBaseUrl) : null;

function getApiBaseUrl(): string {
  return getServerBaseUrl();
}

/**
 * 动态 apiClient，每次属性访问时检查 localStorage 中的 base URL 是否变更，
 * 若变更则重新创建客户端实例，确保始终使用最新配置。
 */
export const apiClient = new Proxy({} as ReturnType<typeof createApiClient>, {
  get(_target, prop, receiver) {
    const currentBaseUrl = getApiBaseUrl();
    if (currentBaseUrl !== cachedBaseUrl) {
      cachedBaseUrl = currentBaseUrl;
      cachedClient = currentBaseUrl ? createApiClient(currentBaseUrl) : null;
    }
    if (!cachedClient) {
      return undefined;
    }
    return Reflect.get(cachedClient, prop, receiver);
  },
});
