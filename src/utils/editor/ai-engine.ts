import { type InferRequest } from '@lib/api-client';
import { logger } from '@lib/logger';
import { EDITOR_SYSTEM_PROMPT, buildSystemDirectives } from '@lib/prompts/editor';
import { openAIChat } from '@lib/llm/chat-client';
import { parseSSEStream } from '@lib/llm/sse-parser';
import { loadAIConfigFromStorage } from '@/constants/api-config';
import { apiClient } from '@/utils/api-client';
import type { ChatCompletionMessageParam } from '@lib/types/openai';

export type EditorChatMessage = InferRequest<typeof apiClient.editor.chat.$post>['json']['messages'][number];

export interface EditorChatOptions {
  includeCss?: boolean;
  includeAnimationConfig?: boolean;
  includeFullDom?: boolean;
  includeFullContext?: boolean;
}

async function streamViaBackend(
  messages: EditorChatMessage[],
  onChunk: (text: string) => void,
  options?: EditorChatOptions,
): Promise<string> {
  const response = await apiClient.editor.chat.$post({
    json: { messages, stream: true, options },
  });

  if (!response.ok || !response.body) {
    throw new Error(`API responded with status ${response.status}`);
  }

  return parseSSEStream(response.body, onChunk);
}

async function streamViaDirectAPI(
  messages: EditorChatMessage[],
  onChunk: (text: string) => void,
  options?: EditorChatOptions,
): Promise<string> {
  const config = loadAIConfigFromStorage();

  const chatMessages: ChatCompletionMessageParam[] = [{ role: 'system', content: EDITOR_SYSTEM_PROMPT }];

  for (const directive of buildSystemDirectives(options)) {
    chatMessages.push({ role: 'user', content: directive });
  }

  for (const msg of messages) {
    chatMessages.push({ role: msg.role, content: msg.content });
  }

  return openAIChat(
    {
      baseUrl: config.aiBaseUrl,
      apiKey: config.aiApiKey,
      model: config.aiModel,
      messages: chatMessages,
      stream: true,
    },
    { onChunk },
  );
}

export async function streamChat(
  messages: EditorChatMessage[],
  onChunk: (text: string) => void,
  options?: EditorChatOptions,
): Promise<string> {
  const config = loadAIConfigFromStorage();

  if (config.aiMode === 'api') {
    logger.info('editor.ai-engine.direct', 'Calling AI API directly', { messageCount: messages.length, options });
    return streamViaDirectAPI(messages, onChunk, options);
  }

  logger.info('editor.ai-engine.backend', 'Calling editor chat via backend', {
    messageCount: messages.length,
    options,
  });
  return streamViaBackend(messages, onChunk, options);
}
