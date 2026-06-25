export const SERVER_BASE_URL_KEY = 'mosu_server_base_url';
export const AI_MODE_KEY = 'mosu_ai_mode';
export const AI_BASE_URL_KEY = 'mosu_ai_base_url';
export const AI_API_KEY_KEY = 'mosu_ai_api_key';
export const AI_MODEL_KEY = 'mosu_ai_model';

export type AiMode = 'mosu' | 'api';

export interface AIConfig {
  aiMode: AiMode;
  serverBaseUrl: string;
  aiBaseUrl: string;
  aiApiKey: string;
  aiModel: string;
}

/**
 * 获取 Mosu 后端地址，优先级：localStorage 用户配置 > 当前页面 origin
 */
export function getServerBaseUrl(): string {
  return localStorage.getItem(SERVER_BASE_URL_KEY) || globalThis.location.origin;
}

/**
 * 检查当前 AI 配置是否已完成。
 * Mosu 模式下需要后端地址，自定义 API 模式下需要 AI Base URL。
 */
export function isAIConfigured(): boolean {
  const aiMode = (localStorage.getItem(AI_MODE_KEY) as AiMode) ?? 'mosu';
  if (aiMode === 'mosu') {
    return Boolean(getServerBaseUrl());
  }
  return Boolean(localStorage.getItem(AI_BASE_URL_KEY));
}

export function loadAIConfigFromStorage(): AIConfig {
  return {
    aiMode: (localStorage.getItem(AI_MODE_KEY) as AiMode) ?? 'mosu',
    serverBaseUrl: getServerBaseUrl(),
    aiBaseUrl: localStorage.getItem(AI_BASE_URL_KEY) ?? '',
    aiApiKey: localStorage.getItem(AI_API_KEY_KEY) ?? '',
    aiModel: localStorage.getItem(AI_MODEL_KEY) ?? 'qwen-max',
  };
}
