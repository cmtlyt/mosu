import type { ChatCompletionMessageParam } from '@/types/openai';
import { logger } from '@lib/logger';

const AI_BASE_URL_KEY = 'mosu_ai_base_url';

async function parseSSEStream(body: ReadableStream<Uint8Array>, onChunk: (text: string) => void): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let fullResponse = '';
  let buffer = '';

  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ') || trimmed === 'data: [DONE]') {
        continue;
      }

      try {
        const parsed = JSON.parse(trimmed.slice(6));
        const delta = parsed.choices?.[0]?.delta?.content ?? '';
        fullResponse += delta;
        onChunk(delta);
      } catch {
        // skip malformed SSE chunks
      }
    }
  }

  return fullResponse;
}

async function streamChatViaApi(
  baseUrl: string,
  messages: ChatCompletionMessageParam[],
  onChunk: (text: string) => void,
): Promise<string> {
  logger.info('libs.ai-engine.api', `Using API mode with base URL: ${baseUrl}`);

  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      stream: true,
      temperature: 0.7,
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`API responded with status ${response.status}`);
  }

  return parseSSEStream(response.body, onChunk);
}

export async function streamChat(
  messages: ChatCompletionMessageParam[],
  onChunk: (text: string) => void,
): Promise<string> {
  const baseUrl = localStorage.getItem(AI_BASE_URL_KEY) ?? '';

  if (!baseUrl) {
    throw new Error('AI base URL not configured. Please set it in settings.');
  }

  return streamChatViaApi(baseUrl, messages, onChunk);
}
