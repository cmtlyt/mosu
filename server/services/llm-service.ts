import { logger } from '@lib/logger';
import type { ServerConfig } from '@mosu/config';
import type { ChatCompletionMessageParam } from '@lib/types/openai';

export interface LLMStreamCallbacks {
  onChunk: (text: string) => void;
}

export interface LLMRequestOptions {
  messages: ChatCompletionMessageParam[];
  stream?: boolean;
  temperature?: number;
}

let serverConfig: ServerConfig | null = null;

export function setupLLMService(config: ServerConfig): void {
  serverConfig = config;
}

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

export async function chat(options: LLMRequestOptions): Promise<Response>;
export async function chat(
  options: LLMRequestOptions & { stream: true },
  callbacks: LLMStreamCallbacks,
): Promise<string>;
export async function chat(options: LLMRequestOptions, callbacks?: LLMStreamCallbacks): Promise<Response | string> {
  if (!serverConfig) {
    throw new Error('LLM service not initialized. Call setupLLMService first.');
  }

  const { messages, stream = false, temperature = 0.7 } = options;

  if (!serverConfig.aiBaseUrl) {
    throw new Error('AI service not configured');
  }

  logger.info('server.llm.request', 'Sending chat completion request', {
    messageCount: messages.length,
    stream,
  });

  const response = await fetch(`${serverConfig.aiBaseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serverConfig.aiApiKey}`,
    },
    body: JSON.stringify({
      model: serverConfig.aiModel,
      messages,
      stream,
      temperature,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('server.llm.error', 'AI service error', errorText);
    throw new Error(`AI service error: ${response.status} ${errorText}`);
  }

  if (stream && callbacks && response.body) {
    return parseSSEStream(response.body, callbacks.onChunk);
  }

  return response;
}

export async function chatStream(
  messages: ChatCompletionMessageParam[],
  onChunk: (text: string) => void,
): Promise<string> {
  return chat({ messages, stream: true }, { onChunk });
}

export async function chatCompletion(messages: ChatCompletionMessageParam[]): Promise<unknown> {
  const response = await chat({ messages, stream: false });
  return response.json();
}
