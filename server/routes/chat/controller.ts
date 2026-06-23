import { logger } from '@lib/logger';
import { llmService } from '@mosu/services';
import type { chatRoute } from './routes';
import type { RouteHandler } from '@mosu/types';

export const handleChatCompletion: RouteHandler<typeof chatRoute> = async (c) => {
  const { messages, stream } = c.req.valid('json');

  logger.info('server.chat.request', 'Processing chat completion request', {
    messageCount: messages.length,
    stream,
  });

  try {
    if (stream) {
      c.header('Content-Type', 'text/event-stream');
      c.header('Cache-Control', 'no-cache');
      c.header('Connection', 'keep-alive');

      const response = await llmService.chat({ messages, stream: true });
      return c.body(response.body as any);
    }

    const data = await llmService.chatCompletion(messages);
    return c.json(data);
  } catch (error) {
    logger.error('server.chat.error', 'Chat completion failed', error);
    return c.json({ error: 'Chat completion failed' }, 500);
  }
};
