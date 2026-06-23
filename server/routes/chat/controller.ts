import { logger } from '@lib/logger';
import type { chatRoute } from './routes';
import type { RouteHandler } from '@mosu/types';

export const handleChatCompletion: RouteHandler<typeof chatRoute> = async (c) => {
  const { messages, stream } = c.req.valid('json');
  const config = c.get('config');

  if (!config.aiBaseUrl) {
    return c.json({ error: 'AI service not configured' }, 503);
  }

  logger.info('server.chat.request', 'Processing chat completion request', {
    messageCount: messages.length,
    stream,
  });

  try {
    const response = await fetch(`${config.aiBaseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.aiApiKey}`,
      },
      body: JSON.stringify({
        model: config.aiModel,
        messages,
        stream,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('server.chat.error', 'AI service error', errorText);
      return c.json({ error: 'AI service error', details: errorText }, response.status as any);
    }

    if (stream) {
      c.header('Content-Type', 'text/event-stream');
      c.header('Cache-Control', 'no-cache');
      c.header('Connection', 'keep-alive');

      return c.body(response.body as any);
    }

    const data = await response.json();
    return c.json(data);
  } catch (error) {
    logger.error('server.chat.error', 'Chat completion failed', error);
    return c.json({ error: 'Chat completion failed' }, 500);
  }
};
