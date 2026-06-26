import { useCallback, useRef } from 'react';
import { apiClient } from '@/utils/api-client';
import { parseSSEStream } from '@lib/llm/sse-parser';
import { logger } from '@lib/logger';
import { useForceUpdate } from '@cmtlyt/lingshu-toolkit/react/use-force-update';
import { dispatchEditorEvent, EDITOR_EVENTS } from '@/utils/editor/event-bus';
import type { ChatMessage } from '@/types/history';
import { CHAT_SYSTEM_PROMPT } from '@lib/prompts/chat';
import { useChatHistoryTree } from './use-chat-history-tree';
import type { ChatHistoryNodeData } from '@/types/chat-history';

const initialChatNodeData: ChatHistoryNodeData = {
  label: '初始对话',
  source: 'manual',
  timestamp: Date.now(),
  messages: [],
};

interface BranchStreamState {
  isStreaming: boolean;
  messages: ChatMessage[];
  abortController: AbortController | null;
}

export function useSimpleChat() {
  const {
    conversationHistory,
    commit,
    checkout,
    getSnapshot,
    currentId,
    getLeafNodes,
    exportConversation,
    exportTree,
    deleteConversation,
    importConversations,
    saveToOPFS,
    loadFromOPFS,
  } = useChatHistoryTree(initialChatNodeData);

  // per-branch streaming state：每个分支独立追踪流式响应
  const branchStreamsRef = useRef<Map<string, BranchStreamState>>(new Map());
  const forceUpdate = useForceUpdate();

  // 当前分支的流式消息
  const currentBranchState = branchStreamsRef.current.get(currentId);
  const currentRoundMessages = currentBranchState?.messages ?? [];
  const isStreaming = currentBranchState?.isStreaming ?? false;

  const messages = [...conversationHistory, ...currentRoundMessages];

  const sendMessage = useCallback(
    async (content: string) => {
      const snapshot = getSnapshot();
      const branchId = snapshot.currentId;

      // 检查当前分支是否正在流式响应
      const existingState = branchStreamsRef.current.get(branchId);
      if (existingState?.isStreaming || !content.trim()) {
        return;
      }

      const userMessage: ChatMessage = { id: crypto.randomUUID(), role: 'user', content, timestamp: Date.now() };
      const abortController = new AbortController();

      // 初始化当前分支的流式状态
      branchStreamsRef.current.set(branchId, {
        isStreaming: true,
        messages: [userMessage],
        abortController,
      });
      forceUpdate();

      const historyForRequest = [...conversationHistory, userMessage];
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
            init: { signal: abortController.signal },
          },
        );

        if (!response.body) {
          throw new Error('No response body');
        }

        // 追加 assistant 占位消息到当前分支
        const branchState = branchStreamsRef.current.get(branchId);
        if (branchState) {
          branchState.messages = [
            ...branchState.messages,
            { id: assistantId, role: 'assistant' as const, content: '', timestamp: Date.now() },
          ];
          forceUpdate();
        }

        let assistantContent = '';
        const fullResponse = await parseSSEStream(response.body, (chunk) => {
          assistantContent += chunk;
          const state = branchStreamsRef.current.get(branchId);
          if (state) {
            state.messages = state.messages.map((msg) =>
              msg.id === assistantId ? { ...msg, content: assistantContent } : msg,
            );
            forceUpdate();
          }
        });

        if (fullResponse) {
          const state = branchStreamsRef.current.get(branchId);
          if (state) {
            state.messages = state.messages.map((msg) =>
              msg.id === assistantId ? { ...msg, content: fullResponse } : msg,
            );
          }
        }

        // 流式响应完成，commit 到锁定的目标节点
        const finalContent = fullResponse || assistantContent;
        const newMessages: ChatMessage[] = [
          userMessage,
          { id: assistantId, role: 'assistant', content: finalContent, timestamp: Date.now() },
        ];

        // 解析 <mosu-title> 标签作为 commit label
        const titleMatch = finalContent.match(/<mosu-title>(.*?)<\/mosu-title>/su);
        const commitLabel = titleMatch?.[1]?.trim() || `对话 ${new Date().toLocaleTimeString()}`;

        // 记录用户当前所在的分支，commit 后恢复
        const userCurrentBranch = getSnapshot().currentId;

        // checkout 到目标节点再 commit
        checkout(branchId);
        commit({
          label: commitLabel,
          source: 'ai',
          messages: newMessages,
        });

        // 清除当前分支的流式状态
        branchStreamsRef.current.delete(branchId);

        // 如果用户仍在目标分支，直接更新；否则恢复到用户所在的分支并通知
        if (userCurrentBranch !== branchId) {
          checkout(userCurrentBranch);
          dispatchEditorEvent(EDITOR_EVENTS.MESSAGE, {
            text: '对话已保存到历史节点，当前查看的是其他分支',
            type: 'info',
          });
        }
        forceUpdate();
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          logger.info('chat.simple.stream', 'Stream aborted');
        } else {
          logger.error('chat.simple.stream', 'Stream error', error);
          const state = branchStreamsRef.current.get(branchId);
          if (state) {
            state.messages = state.messages.map((msg) =>
              msg.id === assistantId ? { ...msg, content: '抱歉，发生了错误，请重试。' } : msg,
            );
            forceUpdate();
          }
        }
      } finally {
        const state = branchStreamsRef.current.get(branchId);
        if (state) {
          state.isStreaming = false;
          state.abortController = null;
          forceUpdate();
        }
      }
    },
    [conversationHistory, commit, checkout, getSnapshot, forceUpdate],
  );

  const stopStreaming = useCallback(() => {
    const state = branchStreamsRef.current.get(currentId);
    state?.abortController?.abort();
  }, [currentId]);

  // 创建新对话：单纯切换到根分支，不清空消息，不中断流式响应
  const createNewConversation = useCallback(() => {
    const snapshot = getSnapshot();
    checkout(snapshot.rootId);
  }, [checkout, getSnapshot]);

  return {
    messages,
    isStreaming,
    sendMessage,
    stopStreaming,
    createNewConversation,
    getSnapshot,
    currentId,
    checkout,
    getLeafNodes,
    exportConversation,
    exportTree,
    deleteConversation,
    importConversations,
    saveToOPFS,
    loadFromOPFS,
  };
}
