#!/usr/bin/env node

process.env.MOSU_CLI = 'true';
import { serve } from '@hono/node-server';
import { resolveConfig } from './config';
import { createApp } from './app';
import { logger } from '@lib/logger';

const config = resolveConfig({ isCli: true, serveStatic: true });

if (config.showVersion) {
  console.log('Mosu v0.1.1');
  process.exit(0);
}

if (config.showHelp) {
  console.log(`
Mosu - CLI Server

Usage:
  mosu [options]

Options:
  -p, --port <port>     Server port (default: 3000)
  -h, --host <host>     Server host (default: 0.0.0.0)
  -v, --version         Show version
  --help                Show help

Environment Variables:
  PORT                  Server port
  HOST                  Server host
  AI_BASE_URL           AI service base URL
  AI_MODEL              AI model name (default: qwen-max)
  AI_API_KEY            AI API key
`);
  process.exit(0);
}

const app = createApp(config);

serve({
  fetch: app.fetch,
  port: config.port,
  hostname: config.host,
});

logger.info('server.cli.start', 'Mosu started', { version: '0.1.1' });
logger.info('server.cli.address', 'Local address', { url: `http://localhost:${config.port}` });
logger.info('server.cli.network', 'Network address', { url: `http://${config.host}:${config.port}` });
logger.info('server.cli.chat', 'Chat status', { enabled: !!config.aiBaseUrl });
