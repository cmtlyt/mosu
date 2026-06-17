import { useState, useCallback, useRef } from 'react';
import type { AnimationConfig } from '@/types/animation';
import type { AIEditorResponse } from '@/types/ai-response';
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
    domSummary?: string,
  ) => Promise<{ response: AIEditorResponse | null; messages: ChatMessage[] }>;
}

const SYSTEM_PROMPT = `你是一个动画编辑器助手。根据用户描述（支持中文和英文混合输入），输出符合以下 AIEditorResponse Schema 的合法 JSON。

## 完整 Schema 示例（严格遵守此结构）

{
  "domPatch": [
    { "op": "add", "selector": ".container", "html": "<div class='card'><span class='title'>Hello</span></div>", "position": "append" }
  ],
  "style": ".card { padding: 16px; background: #fff; border-radius: 8px; }",
  "config": {
    "name": "淡入上浮",
    "triggerGroups": {
      "btn-click": { "type": "click", "target": ".btn" }
    },
    "tracks": [
      {
        "id": "track-1",
        "target": ".card",
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
      },
      {
        "id": "track-2",
        "target": ".btn",
        "keyframes": [
          { "offset": 0, "transform": "scale(1)" },
          { "offset": 0.5, "transform": "scale(1.1)" },
          { "offset": 1, "transform": "scale(1)" }
        ],
        "options": { "duration": 300 },
        "trigger": { "group": "btn-click", "once": true }
      }
    ]
  }
}

## 关键规则

1. 仅输出合法 JSON，不包含 markdown 代码块标记，不包含解释文字。
2. "config.name" 字段必须根据用户需求生成一个简短、有意义的中文动画名称。
3. 每个 track 必须包含 "id"、"target"、"keyframes"、"options" 四个字段。
4. "options" 是独立对象，"duration"（毫秒）必须放在 "options" 内部。
5. keyframes 数组中每个元素必须包含 "offset"（0~1），其余属性以 CSS 属性名作为 key。
6. "target" 使用 CSS 选择器，必须能在当前 DOM 中匹配到对应元素。
7. 增量修改当前配置时保留未提及的轨道；全新动画则忽略当前配置。

## 触发器规则

8. "triggerGroups" 为可选对象，key 为分组 ID，值为 { "type", "target", "delay?" }。
9. 支持的触发类型："auto"（默认，apply 时自动播放）、"click"（点击触发）、"hover"（悬停触发，离开时取消动画）、"mouseenter"（鼠标移入触发，动画独立播放不中断）、"mouseleave"（鼠标移出触发，动画独立播放不中断）、"scroll"（滚动触发）、"viewport"（进入视口触发）。
10. track 的 "trigger" 为可选字段。配置 "group" 引用分组 ID 时，"type" 和 "target" 从分组继承，无需重复配置。
11. "trigger.once"（布尔值）控制是否只触发一次，默认 false。
12. "trigger.delay"（毫秒）控制轨道级延迟，与分组的 "delay" 叠加生效。
13. 无 "trigger" 或 "trigger.type" 为 "auto" 的轨道在 apply 时自动播放。
14. 同一分组内的多个轨道在事件触发时同时播放，各自的 "once" 和 "delay" 独立生效。

## DOM Patch 规则

15. DOM 变更通过 "domPatch" 字段表达，值为指令数组。未提供时保持当前 DOM 不变。
16. 每条指令包含 "op"（操作类型）、"selector"（CSS 选择器）及操作所需参数。
17. 支持的操作类型：
    - "add": 向 selector 指定的父容器中添加子元素。需 "html" 字段，可选 "position"（append/prepend/before/after，默认 append）。
    - "remove": 移除 selector 匹配的元素。
    - "replace": 用 "html" 内容替换 selector 匹配的元素。
    - "attr": 设置或移除属性。需 "attrName"，"attrValue" 为 null 时移除属性。
    - "text": 设置元素的文本内容。需 "text" 字段。
18. "html" 内容必须是纯 HTML 片段（不含 <html>/<body>/<head>），禁止 <script> 标签和事件属性（onclick 等）。
19. "selector" 必须基于当前预览区 DOM 摘要中存在的 class 或 id，确保可定位。
20. 首次创建场景时，使用 "add" 操作向 DOM 摘要中的第一个顶层元素（即根容器）添加完整结构，selector 使用该元素的 CSS 选择器（如 ".container" 或 "#root"）。
21. 完全重建 DOM 时，用 "replace" 直接替换根容器（selector 为根容器的 CSS 选择器），html 内容为全新的完整结构。这是最简洁可靠的方式。
22. 增量修改时仅输出变更部分的 patch 指令，不要重复未变更的内容。

## Style 规则

23. 当需要为预览区元素定义静态样式时，可输出 "style" 字段，值为合法的 CSS 字符串。
24. "style" 中严禁包含任何动画相关属性，包括但不限于：animation、animation-name、animation-duration、animation-timing-function、animation-delay、animation-iteration-count、animation-direction、animation-fill-mode、animation-play-state、transition、@keyframes。这些属性由 config.tracks 统一管理。
25. "style" 仅用于布局、颜色、字体、尺寸等静态视觉样式。`;

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
          return { config: parsed as Pick<AnimationConfig, 'tracks' | 'triggerGroups'> & { name?: string } };
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
    async (content: string, currentConfig: AnimationConfig, domSummary?: string) => {
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
        const domInfo = domSummary ? `\n\n当前预览区域的 DOM 结构摘要：\n${domSummary}` : '';
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

        const parsedResponse = parseAIResponse(fullResponse);

        let finalMessages: ChatMessage[] = [];
        setMessages((prev) => {
          finalMessages = prev.map((msg) =>
            msg.id === assistantId
              ? { ...msg, content: fullResponse, animationName: parsedResponse?.config?.name }
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
