import { CreateMLCEngine, type MLCEngineInterface, type ChatCompletionMessageParam } from '@mlc-ai/web-llm';
import { MODEL_ID_MAP } from '@/constants/ai';
import { logger } from '@/libs/logger';
import { detectModelTier } from './model-detect';

let engineInstance: MLCEngineInterface | null = null;
let currentModelId: string | null = null;

export async function getAIEngine(): Promise<MLCEngineInterface> {
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
}

export async function streamChat(
  messages: ChatCompletionMessageParam[],
  onChunk: (text: string) => void,
): Promise<string> {
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
}
