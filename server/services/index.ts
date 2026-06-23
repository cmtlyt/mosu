import type { ServerConfig } from '@mosu/config';
import { setupLLMService } from './llm-service';

export * as llmService from './llm-service';

export function setupServices(config: ServerConfig): void {
  setupLLMService(config);
}
