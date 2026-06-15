import { useState, useCallback, useRef } from 'react';
import type { AnimationConfig } from '@/types/animation';
import type { ChatMessage } from '@/types/history';
import { streamChat } from '@/libs/ai-engine';
import { logger } from '@/libs/logger';
import { dispatchEditorEvent, EDITOR_EVENTS } from '@/libs/event-bus';
import type { ChatCompletionMessageParam } from '@mlc-ai/web-llm';

interface UseAIChatReturn {
  messages: ChatMessage[];
  isStreaming: boolean;
  sendMessage: (
    content: string,
    currentConfig: AnimationConfig,
  ) => Promise<{ config: AnimationConfig | null; messages: ChatMessage[] }>;
}

const SYSTEM_PROMPT = `你是一个动画配置生成器。根据用户描述（支持中文和英文混合输入），输出符合以下 AnimationConfig Schema 的合法 JSON。

规则：
1. 仅输出合法 JSON，不包含 markdown 代码块标记，不包含解释文字。
2. "target" 字段使用 CSS 选择器。
3. 关键帧 "offset" 值必须在 [0, 1] 范围内。
4. "duration" 单位为毫秒。
5. 增量修改当前配置，保留未提及的轨道。
6. 如果用户要求全新动画，忽略当前配置。`;

function parseAnimationJSON(raw: string): AnimationConfig | null {
  try {
    return JSON.parse(raw) as AnimationConfig;
  } catch {
    const match = raw.match(/[[{][\s\S]*[\]}]/u);
    if (match) {
      try {
        return JSON.parse(match[0]) as AnimationConfig;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export function useAIChat(): UseAIChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const streamingRef = useRef(false);

  const sendMessage = useCallback(
    async (content: string, currentConfig: AnimationConfig) => {
      if (streamingRef.current) {
        logger.warn('hooks.use-ai-chat.send', 'Cannot send message while streaming');
        return { config: null, messages };
      }

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content,
        timestamp: Date.now(),
      };

      const assistantId = crypto.randomUUID();
      const assistantMessage: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setIsStreaming(true);
      streamingRef.current = true;
      dispatchEditorEvent(EDITOR_EVENTS.AI_STREAM_START);

      try {
        const chatMessages: ChatCompletionMessageParam[] = [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `当前动画配置：\n${JSON.stringify(currentConfig, null, 2)}\n\n用户需求：${content}`,
          },
        ];

        const fullResponse = await streamChat(chatMessages, (chunk) => {
          setMessages((prev) =>
            prev.map((msg) => (msg.id === assistantId ? { ...msg, content: msg.content + chunk } : msg)),
          );
        });

        const parsedConfig = parseAnimationJSON(fullResponse);

        let finalMessages: ChatMessage[] = [];
        setMessages((prev) => {
          finalMessages = prev.map((msg) => (msg.id === assistantId ? { ...msg, content: fullResponse } : msg));
          return finalMessages;
        });

        setIsStreaming(false);
        streamingRef.current = false;
        dispatchEditorEvent(EDITOR_EVENTS.AI_STREAM_END);

        if (!parsedConfig) {
          logger.warn('hooks.use-ai-chat.parse', 'AI returned invalid JSON');
          dispatchEditorEvent(EDITOR_EVENTS.AI_STREAM_ERROR, {
            message: 'AI 返回的内容无法解析为有效的动画配置',
          });
        }

        return { config: parsedConfig, messages: finalMessages };
      } catch (error) {
        logger.error('hooks.use-ai-chat.stream', 'AI chat failed', error);
        setIsStreaming(false);
        streamingRef.current = false;
        dispatchEditorEvent(EDITOR_EVENTS.AI_STREAM_ERROR, { message: 'AI 对话失败，请重试' });

        setMessages((prev) =>
          prev.map((msg) => (msg.id === assistantId ? { ...msg, content: '生成失败，请重试' } : msg)),
        );

        return { config: null, messages };
      }
    },
    [messages],
  );

  return { messages, isStreaming, sendMessage };
}
