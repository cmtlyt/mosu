import type { ChatCompletionMessageParam } from '@lib/types/openai';
import { parseSSEStream } from './sse-parser';

export interface OpenAIChatOptions {
  baseUrl: string;
  apiKey?: string;
  model: string;
  messages: ChatCompletionMessageParam[];
  stream?: boolean;
  temperature?: number;
}

export interface OpenAIStreamCallbacks {
  onChunk: (text: string) => void;
}

/**
 * 调用 OpenAI 兼容的 Chat Completions API。
 *
 * - 不传 callbacks：返回原始 Response（非流式）
 * - 传 callbacks：解析 SSE 流并逐 chunk 回调，返回完整文本
 */
export async function openAIChat(options: OpenAIChatOptions): Promise<Response>;
export async function openAIChat(
  options: OpenAIChatOptions & { stream: true },
  callbacks: OpenAIStreamCallbacks,
): Promise<string>;
export async function openAIChat(
  options: OpenAIChatOptions,
  callbacks?: OpenAIStreamCallbacks,
): Promise<Response | string> {
  const { baseUrl, apiKey, model, messages, stream = false, temperature = 0.7 } = options;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, messages, stream, temperature }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI service error: ${response.status} ${errorText}`);
  }

  if (stream && callbacks && response.body) {
    return parseSSEStream(response.body, callbacks.onChunk);
  }

  return response;
}
