import { logger } from '@lib/logger';
import { openAIChat } from '@lib/llm/chat-client';
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

export async function chat(options: LLMRequestOptions): Promise<Response>;
export async function chat(
  options: LLMRequestOptions & { stream: true },
  callbacks: LLMStreamCallbacks,
): Promise<string>;
export async function chat(options: LLMRequestOptions, callbacks?: LLMStreamCallbacks): Promise<Response | string> {
  if (!serverConfig) {
    throw new Error('LLM service not initialized. Call setupLLMService first.');
  }

  if (!serverConfig.aiBaseUrl) {
    throw new Error('AI service not configured');
  }

  logger.info('server.llm.request', 'Sending chat completion request', {
    messageCount: options.messages.length,
    stream: options.stream,
  });

  return openAIChat(
    {
      baseUrl: serverConfig.aiBaseUrl,
      apiKey: serverConfig.aiApiKey,
      model: serverConfig.aiModel,
      messages: options.messages,
      stream: options.stream || (false as any),
      temperature: options.temperature,
    },
    callbacks as any,
  );
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
