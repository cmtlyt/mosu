import { useState, useCallback, useRef } from 'react';
import { apiClient } from '@/utils/api-client';
import { parseSSEStream } from '@lib/llm/sse-parser';
import { logger } from '@lib/logger';
import type { ChatMessage } from '@/types/history';
import { CHAT_SYSTEM_PROMPT } from '@lib/prompts/chat';

export function useSimpleChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isStreaming) {
        return;
      }

      const userMessage: ChatMessage = { id: crypto.randomUUID(), role: 'user', content, timestamp: Date.now() };
      let historyForRequest: ChatMessage[] = [];
      setMessages((prev) => {
        historyForRequest = [...prev, userMessage];
        return historyForRequest;
      });
      setIsStreaming(true);

      abortControllerRef.current = new AbortController();

      const assistantId = crypto.randomUUID();

      try {
        const response = await apiClient.v1.chat.completions.$post(
          {
            json: {
              messages: [
                { role: 'system', content: CHAT_SYSTEM_PROMPT },
                ...historyForRequest.map((msg) => ({ role: msg.role, content: msg.content })),
              ],
              stream: true,
            },
          },
          {
            init: { signal: abortControllerRef.current.signal },
          },
        );

        if (!response.body) {
          throw new Error('No response body');
        }

        setMessages((prev) => [
          ...prev,
          { id: assistantId, role: 'assistant' as const, content: '', timestamp: Date.now() },
        ]);

        let assistantContent = '';
        const fullResponse = await parseSSEStream(response.body, (chunk) => {
          assistantContent += chunk;
          setMessages((prev) =>
            prev.map((msg) => (msg.id === assistantId ? { ...msg, content: assistantContent } : msg)),
          );
        });

        if (fullResponse) {
          setMessages((prev) => prev.map((msg) => (msg.id === assistantId ? { ...msg, content: fullResponse } : msg)));
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          logger.info('chat.simple.stream', 'Stream aborted');
        } else {
          logger.error('chat.simple.stream', 'Stream error', error);
          setMessages((prev) =>
            prev.map((msg) => (msg.id === assistantId ? { ...msg, content: '抱歉，发生了错误，请重试。' } : msg)),
          );
        }
      } finally {
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [isStreaming],
  );

  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return { messages, isStreaming, sendMessage, stopStreaming, clearMessages };
}
