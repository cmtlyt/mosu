import { useState, useCallback, useRef } from 'react';
import type { AnimationConfig } from '@/types/animation';
import type { AIEditorResponse } from '@/types/ai-response';
import type { ChatMessage } from '@/types/history';
import { streamChat } from '@/utils/editor/ai-engine';
import { logger } from '@/libs/logger';
import { dispatchEditorEvent, EDITOR_EVENTS } from '@/utils/editor/event-bus';
import { SYSTEM_PROMPT } from '@/constants/ai';
import type { ChatCompletionMessageParam } from '@mlc-ai/web-llm';

export interface SendMessageOptions {
  domContent?: string;
  isFullDom?: boolean;
  includeCss?: boolean;
  currentStyle?: string | null;
}

interface UseAIChatReturn {
  messages: ChatMessage[];
  isStreaming: boolean;
  sendMessage: (
    content: string,
    currentConfig: AnimationConfig,
    options?: SendMessageOptions,
  ) => Promise<{ response: AIEditorResponse | null; messages: ChatMessage[] }>;
}

function parseAIResponse(raw: string): AIEditorResponse | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && 'config' in parsed) {
      return parsed as AIEditorResponse;
    }
  } catch {
    /* fall through */
  }

  const match = raw.match(/[[{][\s\S]*[\]}]/u);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (parsed && typeof parsed === 'object') {
        if ('tracks' in parsed && !('config' in parsed)) {
          const { name, ...configData } = parsed as { name?: string } & Pick<
            AnimationConfig,
            'tracks' | 'triggerGroups'
          >;
          return { name: name ?? '动画更新', config: configData };
        }
        return parsed as AIEditorResponse;
      }
    } catch {
      /* ignore */
    }
  }

  return null;
}

export function useAIChat(): UseAIChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const streamingRef = useRef(false);

  const sendMessage = useCallback(
    async (content: string, currentConfig: AnimationConfig, options?: SendMessageOptions) => {
      if (streamingRef.current) {
        logger.warn('hooks.use-ai-chat.send', 'Cannot send message while streaming');
        return { response: null, messages };
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
        const chatMessages: ChatCompletionMessageParam[] = [{ role: 'system', content: SYSTEM_PROMPT }];

        // 如果启用 CSS 携带模式，追加独立的 user prompt 激活
        if (options?.includeCss) {
          chatMessages.push({
            role: 'user',
            content: '[系统指令] 已启用 CSS 携带模式，请按照 system prompt 中的"CSS 携带模式规则"返回全量 CSS。',
          });
        }

        // 构建 DOM 信息
        const domInfo = options?.domContent
          ? options.isFullDom
            ? `\n\n当前预览区域的完整 DOM：\n${options.domContent}`
            : `\n\n当前预览区域的 DOM 结构摘要：\n${options.domContent}`
          : '';

        // 构建 CSS 信息
        const cssInfo =
          options?.includeCss && options.currentStyle ? `\n\n当前预览区域的 CSS 样式：\n${options.currentStyle}` : '';

        chatMessages.push({
          role: 'user',
          content: `当前动画配置：\n${JSON.stringify(currentConfig, null, 2)}${domInfo}${cssInfo}\n\n用户需求：${content}`,
        });

        const fullResponse = await streamChat(chatMessages, (chunk) => {
          setMessages((prev) =>
            prev.map((msg) => (msg.id === assistantId ? { ...msg, content: msg.content + chunk } : msg)),
          );
        });

        const parsedResponse = parseAIResponse(fullResponse);

        let finalMessages: ChatMessage[] = [];
        setMessages((prev) => {
          finalMessages = prev.map((msg) =>
            msg.id === assistantId
              ? {
                  ...msg,
                  content: fullResponse,
                  animationName: parsedResponse?.name ?? (parsedResponse ? '动画更新' : undefined),
                }
              : msg,
          );
          return finalMessages;
        });

        setIsStreaming(false);
        streamingRef.current = false;
        dispatchEditorEvent(EDITOR_EVENTS.AI_STREAM_END);

        if (!parsedResponse) {
          logger.warn('hooks.use-ai-chat.parse', 'AI returned invalid JSON');
          dispatchEditorEvent(EDITOR_EVENTS.AI_STREAM_ERROR, {
            message: 'AI 返回的内容无法解析为有效的响应',
          });
        }

        return { response: parsedResponse, messages: finalMessages };
      } catch (error) {
        logger.error('hooks.use-ai-chat.stream', 'AI chat failed', error);
        setIsStreaming(false);
        streamingRef.current = false;
        dispatchEditorEvent(EDITOR_EVENTS.AI_STREAM_ERROR, { message: 'AI 对话失败，请重试' });

        setMessages((prev) =>
          prev.map((msg) => (msg.id === assistantId ? { ...msg, content: '生成失败，请重试' } : msg)),
        );

        return { response: null, messages };
      }
    },
    [messages],
  );

  return { messages, isStreaming, sendMessage };
}
