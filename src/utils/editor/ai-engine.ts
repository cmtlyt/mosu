import { CreateMLCEngine, type MLCEngineInterface, type ChatCompletionMessageParam } from '@mlc-ai/web-llm';
import { tryCallFunc } from '@cmtlyt/lingshu-toolkit/shared/try-call';
import { MODEL_ID_MAP } from '@/constants/ai';
import { logger } from '@/libs/logger';
import { detectModelTier } from './model-detect';

const LOCAL_AI_PROXY_URL = 'http://localhost:3001/v1/chat/completions';
const AI_MODE_KEY = 'mosu_ai_mode';
const AI_BASE_URL_KEY = 'mosu_ai_base_url';

let engineInstance: MLCEngineInterface | null = null;
let currentModelId: string | null = null;
let useFallback = false;

export const getAIEngine = tryCallFunc(
  async () => {
    if (engineInstance && currentModelId) {
      return engineInstance;
    }

    const tier = await detectModelTier();
    const modelId = MODEL_ID_MAP[tier];
    logger.info('libs.ai-engine.load', `Loading AI model: ${modelId} (tier: ${tier})`);

    engineInstance = await CreateMLCEngine(modelId, {
      initProgressCallback: (report) => {
        logger.debug('libs.ai-engine.progress', `Model loading: ${report.progress}%`);
      },
    });
    currentModelId = modelId;

    return engineInstance;
  },
  async (error) => {
    useFallback = true;
    throw error;
  },
);

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

  const response = await fetch(`${baseUrl}/chat/completions`, {
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

async function streamChatViaProxy(
  messages: ChatCompletionMessageParam[],
  onChunk: (text: string) => void,
): Promise<string> {
  logger.info('libs.ai-engine.proxy', 'Using local AI proxy fallback');

  const response = await fetch(LOCAL_AI_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      stream: true,
      temperature: 0.7,
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`AI proxy responded with status ${response.status}`);
  }

  return parseSSEStream(response.body, onChunk);
}

export async function streamChat(
  messages: ChatCompletionMessageParam[],
  onChunk: (text: string) => void,
): Promise<string> {
  const mode = localStorage.getItem(AI_MODE_KEY) ?? 'webllm';
  const baseUrl = localStorage.getItem(AI_BASE_URL_KEY) ?? '';

  if (mode === 'api' && baseUrl) {
    return streamChatViaApi(baseUrl, messages, onChunk);
  }

  if (useFallback) {
    return streamChatViaProxy(messages, onChunk);
  }

  try {
    const engine = await getAIEngine();
    let fullResponse = '';

    const completion = await engine.chat.completions.create({
      messages,
      stream: true,
      temperature: 0.7,
    });

    for await (const chunk of completion) {
      const delta = chunk.choices[0]?.delta?.content ?? '';
      fullResponse += delta;
      onChunk(delta);
    }

    return fullResponse;
  } catch (error) {
    logger.warn('libs.ai-engine.fallback', 'WebLLM failed, switching to local AI proxy', error);
    useFallback = true;
    return streamChatViaProxy(messages, onChunk);
  }
}
