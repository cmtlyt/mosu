import { apiClient, type InferRequest } from '@lib/api-client';
import { logger } from '@lib/logger';

export type EditorChatMessage = InferRequest<typeof apiClient.editor.chat.$post>['json']['messages'][number];

export interface EditorChatOptions {
  includeCss?: boolean;
  includeAnimationConfig?: boolean;
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

export async function streamChat(
  messages: EditorChatMessage[],
  onChunk: (text: string) => void,
  options?: EditorChatOptions,
): Promise<string> {
  logger.info('libs.ai-engine.editor-chat', 'Calling editor chat API', { messageCount: messages.length, options });

  const response = await apiClient.editor.chat.$post({
    json: {
      messages,
      stream: true,
      options,
    },
  });

  if (!response.ok || !response.body) {
    throw new Error(`API responded with status ${response.status}`);
  }

  return parseSSEStream(response.body, onChunk);
}
