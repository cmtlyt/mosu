import { z } from '@hono/zod-openapi';

export const EditorChatRequestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string(),
    }),
  ),
  stream: z.boolean().optional().default(true),
  options: z
    .object({
      includeCss: z.boolean().optional(),
      includeAnimationConfig: z.boolean().optional(),
    })
    .optional(),
});

export const EditorChatChunkSchema = z.object({
  id: z.string(),
  object: z.literal('chat.completion.chunk'),
  created: z.number(),
  model: z.string(),
  choices: z.array(
    z.object({
      index: z.number(),
      delta: z.object({
        role: z.literal('assistant').optional(),
        content: z.string().optional(),
      }),
      finish_reason: z.enum(['stop', 'length']).nullable(),
    }),
  ),
});
