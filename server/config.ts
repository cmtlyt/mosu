import { config } from 'dotenv';
import { resolve } from 'node:path';
import { logger } from '@lib/logger';

const rootDir = process.cwd();

// 加载 .env 和 .env.local（后者覆盖前者）
config({ path: resolve(rootDir, '.env') });
config({ path: resolve(rootDir, '.env.local'), override: true });

export interface ServerConfig {
  port: number;
  host: string;
  aiBaseUrl: string;
  aiModel: string;
  aiApiKey: string;
  showVersion: boolean;
  showHelp: boolean;
  isCli: boolean;
  serveStatic: boolean;
}

export function resolveConfig(options: { isCli?: boolean; serveStatic?: boolean } = {}): ServerConfig {
  const { isCli = true, serveStatic = false } = options;

  const args = process.argv.slice(2);
  const { env } = process;

  const showVersion = args.includes('--version') || args.includes('-v');
  const showHelp = args.includes('--help') || args.includes('-h');

  const port = Number.parseInt(env.PORT || '3000', 10);
  const host = env.HOST || '0.0.0.0';
  const aiBaseUrl = env.AI_BASE_URL || '';
  const aiModel = env.AI_MODEL || 'qwen-max';
  const aiApiKey = env.AI_API_KEY || '';

  if (!aiBaseUrl) {
    logger.warn('server.config.warn', 'AI_BASE_URL not configured, chat functionality will be disabled');
  }

  return {
    port,
    host,
    aiBaseUrl,
    aiModel,
    aiApiKey,
    showVersion,
    showHelp,
    isCli,
    serveStatic,
  };
}
