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
    domStructure?: string,
  ) => Promise<{ config: AnimationConfig | null; messages: ChatMessage[] }>;
}

const SYSTEM_PROMPT = `你是一个动画配置生成器。根据用户描述（支持中文和英文混合输入），输出符合以下 AnimationConfig Schema 的合法 JSON。

## 完整 Schema 示例（严格遵守此结构）

{
  "version": "1.0",
  "id": "anim-xxx",
  "name": "淡入上浮",
  "tracks": [
    {
      "id": "track-1",
      "target": ".my-element",
      "keyframes": [
        { "offset": 0, "opacity": 0, "transform": "translateY(20px)" },
        { "offset": 1, "opacity": 1, "transform": "translateY(0)" }
      ],
      "options": {
        "duration": 1000,
        "delay": 0,
        "easing": "ease-out",
        "iterations": 1,
        "direction": "normal",
        "fillMode": "forwards"
      }
    }
  ]
}

## 关键规则

1. 仅输出合法 JSON，不包含 markdown 代码块标记，不包含解释文字。
2. "name" 字段必须根据用户需求生成一个简短、有意义的中文动画名称（如"淡入上浮"、"旋转缩放"、"弹跳入场"等），不要使用通用名称。
3. 每个 track 必须包含 "id"、"target"、"keyframes"、"options" 四个字段。
4. "options" 是独立对象，"duration"（毫秒）必须放在 "options" 内部，不能放在 track 顶层。
5. keyframes 数组中每个元素必须包含 "offset"（0~1），其余属性以 CSS 属性名作为 key（如 "opacity"、"transform"），值直接写在该 key 下。禁止使用 "property"/"value" 这种键值对格式。
6. "target" 使用 CSS 选择器。
7. 增量修改当前配置时保留未提及的轨道；全新动画则忽略当前配置。`;

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
    async (content: string, currentConfig: AnimationConfig, domStructure?: string) => {
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
        const domInfo = domStructure ? `\n\n当前预览区域的 DOM 结构：\n${domStructure}` : '';
        const chatMessages: ChatCompletionMessageParam[] = [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `当前动画配置：\n${JSON.stringify(currentConfig, null, 2)}${domInfo}\n\n用户需求：${content}`,
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
          finalMessages = prev.map((msg) =>
            msg.id === assistantId ? { ...msg, content: fullResponse, animationName: parsedConfig?.name } : msg,
          );
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
