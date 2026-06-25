import { logger } from '@lib/logger';
import { llmService } from '@mosu/services';
import { EDITOR_SYSTEM_PROMPT, buildSystemDirectives } from '@lib/prompts/editor';
import type { ChatCompletionMessageParam } from '@lib/types/openai';
import type { editorChatRoute } from './routes';
import type { RouteHandler } from '@mosu/types';

export const handleEditorChat: RouteHandler<typeof editorChatRoute> = async (c) => {
  const { messages, stream, options } = c.req.valid('json');

  logger.info('server.editor-chat.request', 'Processing editor chat request', {
    messageCount: messages.length,
    stream,
    options,
  });

  try {
    const chatMessages: ChatCompletionMessageParam[] = [{ role: 'system', content: EDITOR_SYSTEM_PROMPT }];

    const directives = buildSystemDirectives(options);
    for (const directive of directives) {
      chatMessages.push({ role: 'user', content: directive });
    }

    for (const msg of messages) {
      chatMessages.push({ role: msg.role, content: msg.content });
    }

    if (stream) {
      c.header('Content-Type', 'text/event-stream');
      c.header('Cache-Control', 'no-cache');
      c.header('Connection', 'keep-alive');

      const response = await llmService.chat({ messages: chatMessages, stream: true });
      return c.body(response.body as any);
    }

    const data = await llmService.chatCompletion(chatMessages);
    return c.json(data);
  } catch (error) {
    logger.error('server.editor-chat.error', 'Editor chat failed', error);
    return c.json({ error: 'Editor chat failed' }, 500);
  }
};
