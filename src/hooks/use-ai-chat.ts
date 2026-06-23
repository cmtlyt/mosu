import { useState, useCallback, useRef } from 'react';
import type { AnimationConfig } from '@lib/animation-sdk';
import type { AIEditorResponse } from '@/types/ai-response';
import type { ChatMessage } from '@/types/history';
import type { ChatCompletionMessageParam } from '@/types/openai';
import { streamChat } from '@/utils/editor/ai-engine';
import { logger } from '@lib/logger';
import { dispatchEditorEvent, EDITOR_EVENTS } from '@/utils/editor/event-bus';

export interface SendMessageOptions {
  domContent?: string;
  isFullDom?: boolean;
  includeCss?: boolean;
  includeAnimationConfig?: boolean;
  currentStyle?: string | null;
  includeFullContext?: boolean;
  conversationHistory?: ChatMessage[];
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

function parseJsonToResponse(parsed: unknown): AIEditorResponse | null {
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  if ('tracks' in parsed && !('config' in parsed)) {
    const { name, ...configData } = parsed as { name?: string } & Pick<AnimationConfig, 'tracks' | 'triggerGroups'>;
    return { name: name ?? '动画更新', config: configData };
  }

  return parsed as AIEditorResponse;
}

function parseAIResponse(raw: string): AIEditorResponse | null {
  // 优先：用正则从 <mosu-response> 标签中提取原始 JSON 文本（避免 DOMParser 解析内部 HTML 导致标签丢失）
  const tagMatch = raw.match(/<mosu-response>([\s\S]*?)<\/mosu-response>/u);
  if (tagMatch) {
    try {
      const parsed = JSON.parse(tagMatch[1].trim());
      const result = parseJsonToResponse(parsed);
      if (result) {
        return result;
      }
    } catch {
      /* fall through to fallback */
    }
  }

  // 降级：兼容旧格式（直接 JSON 或正则提取）
  logger.warn('hooks.use-ai-chat.parse', 'LLM did not wrap response in <mosu-response> tag, using fallback parser');

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
      const result = parseJsonToResponse(parsed);
      if (result) {
        return result;
      }
    } catch {
      /* ignore */
    }
  }

  return null;
}

function buildSystemDirectives(options?: SendMessageOptions): ChatCompletionMessageParam[] {
  const directives: ChatCompletionMessageParam[] = [];

  if (options?.includeCss) {
    directives.push({ role: 'user', content: '[系统指令] 已启用 CSS 携带模式' });
  }

  if (options?.includeAnimationConfig === false) {
    directives.push({ role: 'user', content: '[系统指令] 未启用动画配置携带模式' });
  }

  return directives;
}

function buildUserContent(content: string, currentConfig: AnimationConfig, options?: SendMessageOptions): string {
  const configInfo =
    options?.includeAnimationConfig === false ? '' : `\n当前动画配置：\n${JSON.stringify(currentConfig, null, 2)}`;

  const domInfo = options?.domContent
    ? options.isFullDom
      ? `\n\n当前预览区域的完整 DOM：\n${options.domContent}`
      : `\n\n当前预览区域的 DOM 结构摘要：\n${options.domContent}`
    : '';

  const cssInfo =
    options?.includeCss && options.currentStyle ? `\n\n当前预览区域的 CSS 样式：\n${options.currentStyle}` : '';

  return `${configInfo}${domInfo}${cssInfo}\n\n用户需求：${content}`;
}

export function useAIChat(): UseAIChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const streamingRef = useRef(false);

  const sendMessage = useCallback(
    async (content: string, currentConfig: AnimationConfig, options?: SendMessageOptions) => {
      if (streamingRef.current) {
        logger.warn('hooks.use-ai-chat.send', 'Cannot send message while stream');
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
        const chatMessages: ChatCompletionMessageParam[] = [...buildSystemDirectives(options)];

        if (options?.includeFullContext && options?.conversationHistory) {
          const historyMessages: ChatCompletionMessageParam[] = options.conversationHistory
            .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
            .map((msg) => ({
              role: msg.role,
              content: msg.content,
            }));
          chatMessages.push(...historyMessages);
        }

        chatMessages.push({ role: 'user', content: buildUserContent(content, currentConfig, options) });

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
