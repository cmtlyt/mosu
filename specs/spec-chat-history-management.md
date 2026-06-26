# Spec: Chat 页面历史管理能力

## 1. 概述

为 Chat 页面新增历史管理能力，复用 Editor 的历史树机制，让用户可以：

1. 在右侧查看完整的历史树结构
2. 在左侧通过叶子节点目录快速切换对话
3. checkout 到其他分支时完整替换对话消息
4. commit 时单纯追加新消息
5. 通过"创建新对话"按钮切换到根分支，开始新的对话

## 2. 技术方案

### 2.1 数据结构适配

Chat 页面不需要 Editor 的 `config`、`customDom`、`customStyle` 字段，需要为 Chat 场景创建简化的节点数据类型。

**新增文件**：`src/types/chat-history.ts`

```typescript
import type { ChatMessage } from '@/types/history';

export interface ChatHistoryNodeData {
  label: string;
  source: 'manual' | 'ai';
  timestamp: number;
  messages: ChatMessage[];
}
```

### 2.2 历史树 Hook 泛型化与复用

将现有 `useHistoryTree` 泛型化为基础 hook，Chat 基于它封装差异化 API。

#### 2.2.1 泛型化基础 Hook

**新建文件**：`src/hooks/use-history-tree-base.ts`

```typescript
import { useMemo, useCallback, useRef, useState, useSyncExternalStore } from 'react';
import {
  createHistoryTree,
  type HistoryTree,
  type HistoryNodeInfo,
  type HistoryTreeSnapshot,
} from '@cmtlyt/lingshu-toolkit/shared/history-tree';
import { logger } from '@lib/logger';

interface ExportedTreeData<T> {
  version: string;
  exportedAt: string;
  snapshot: HistoryTreeSnapshot<T>;
}

export interface UseHistoryTreeBaseReturn<T> {
  conversationHistory: T extends { messages: infer M } ? M[] : never;
  commit: (data: Omit<T, 'timestamp'>) => string;
  checkout: (nodeId: string) => void;
  getNode: (nodeId: string) => HistoryNodeInfo<T>;
  getSnapshot: () => ReturnType<HistoryTree<T>['getSnapshot']>;
  exportTree: () => void;
  importTree: (file: File) => Promise<boolean>;
  currentId: string;
  getLeafNodes: () => Array<{ id: string; label: string; timestamp: number }>;
}

export function useHistoryTreeBase<T extends { timestamp: number; label: string; messages: any[] }>(
  initialData: T,
): UseHistoryTreeBaseReturn<T> {
  const [tree, setTree] = useState(() => createHistoryTree<T>({ initialData }));

  const cachedSnapshotRef = useRef<ReturnType<HistoryTree<T>['getSnapshot']> | null>(null);

  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      tree.onChange(() => {
        cachedSnapshotRef.current = null;
        onStoreChange();
      }),
    [tree],
  );

  const getSnapshotFn = useCallback(() => {
    if (cachedSnapshotRef.current === null) {
      cachedSnapshotRef.current = tree.getSnapshot();
    }
    return cachedSnapshotRef.current;
  }, [tree]);

  const snapshot = useSyncExternalStore(subscribe, getSnapshotFn);
  const { currentId } = snapshot;

  const conversationHistory = useMemo(() => {
    const pathData = tree.getPathData();
    const orderedPath = [...pathData].reverse();
    return orderedPath.flatMap((nodeData) => nodeData.messages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot]);

  const commit = useCallback(
    (data: Omit<T, 'timestamp'>) => {
      const nodeData = { ...data, timestamp: Date.now() } as T;
      const nodeId = tree.commit(nodeData);
      logger.info('hooks.use-history-tree-base.commit', `Committed new history node: ${nodeId}`);
      return nodeId;
    },
    [tree],
  );

  const checkout = useCallback(
    (nodeId: string) => {
      tree.checkout(nodeId);
      logger.info('hooks.use-history-tree-base.checkout', `Checked out to node: ${nodeId}`);
    },
    [tree],
  );

  const getNode = useCallback((nodeId: string) => tree.getNode(nodeId), [tree]);
  const getSnapshot = useCallback(() => tree.getSnapshot(), [tree]);

  const exportTree = useCallback(() => {
    const snapshot = tree.getSnapshot();
    const exportData: ExportedTreeData<T> = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      snapshot,
    };
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `history-tree-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    logger.info('hooks.use-history-tree-base.exportTree', 'History tree exported successfully');
  }, [tree]);

  const importTree = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as ExportedTreeData<T>;

      if (!parsed.snapshot?.rootId || !parsed.snapshot?.nodes) {
        logger.warn('hooks.use-history-tree-base.importTree', 'Invalid history tree file: missing snapshot');
        return false;
      }

      const { snapshot } = parsed;
      const rootNode = snapshot.nodes[snapshot.rootId];
      if (!rootNode?.data) {
        logger.warn('hooks.use-history-tree-base.importTree', 'Invalid history tree file: missing root data');
        return false;
      }

      const newTree = createHistoryTree<T>({ initialData: rootNode.data });
      const idMapping = new Map<string, string>();
      idMapping.set(snapshot.rootId, newTree.currentId);

      const rebuildChildren = (originalParentId: string) => {
        const parentInfo = snapshot.nodes[originalParentId];
        if (!parentInfo) {
          return;
        }

        const mappedParentId = idMapping.get(originalParentId);
        if (!mappedParentId) {
          return;
        }

        for (const childId of parentInfo.childrenIds ?? []) {
          const childData = snapshot.nodes[childId]?.data;
          if (!childData) {
            continue;
          }

          newTree.checkout(mappedParentId);
          const newChildId = newTree.commit(childData);
          idMapping.set(childId, newChildId);
          rebuildChildren(childId);
        }
      };

      rebuildChildren(snapshot.rootId);

      const mappedCurrentId = idMapping.get(snapshot.currentId);
      if (mappedCurrentId) {
        newTree.checkout(mappedCurrentId);
      }

      setTree(newTree);
      logger.info(
        'hooks.use-history-tree-base.importTree',
        `Imported history tree with ${Object.keys(snapshot.nodes).length} nodes`,
      );
      return true;
    } catch (error) {
      logger.error('hooks.use-history-tree-base.importTree', 'Failed to import history tree', error);
      return false;
    }
  }, []);

  const getLeafNodes = useCallback(() => {
    const snap = tree.getSnapshot();
    const leafNodes: Array<{ id: string; label: string; timestamp: number }> = [];

    for (const [nodeId, nodeInfo] of Object.entries(snap.nodes)) {
      if (!nodeInfo.childrenIds || nodeInfo.childrenIds.length === 0) {
        leafNodes.push({
          id: nodeId,
          label: nodeInfo.data.label,
          timestamp: nodeInfo.data.timestamp,
        });
      }
    }

    return leafNodes.sort((a, b) => b.timestamp - a.timestamp);
  }, [tree]);

  return {
    conversationHistory,
    commit,
    checkout,
    getNode,
    getSnapshot,
    exportTree,
    importTree,
    currentId,
    getLeafNodes,
  };
}
```

#### 2.2.2 Editor 专用 Hook（保持兼容）

**修改文件**：`src/hooks/use-history-tree.ts`

改为从 `use-history-tree-base` 导入并封装 Editor 专属逻辑：

```typescript
import { useCallback } from 'react';
import type { HistoryTree, HistoryNodeInfo } from '@cmtlyt/lingshu-toolkit/shared/history-tree';
import { useHistoryTreeBase } from './use-history-tree-base';
import type { HistoryNodeData, ChatMessage } from '@/types/history';
import type { AnimationConfig } from '@lib/animation-sdk';

export interface UseHistoryTreeReturn {
  currentConfig: AnimationConfig;
  conversationHistory: ChatMessage[];
  commit: (data: Omit<HistoryNodeData, 'timestamp'>) => string;
  checkout: (nodeId: string) => void;
  getNode: (nodeId: string) => HistoryNodeInfo<HistoryNodeData>;
  getSnapshot: () => ReturnType<HistoryTree<HistoryNodeData>['getSnapshot']>;
  getInheritedDomStyle: () => { customDom: string | null; customStyle: string | null };
  exportTree: () => void;
  importTree: (file: File) => Promise<boolean>;
  currentId: string;
  getLeafNodes: () => Array<{ id: string; label: string; timestamp: number }>;
}

export function useHistoryTree(initialData: HistoryNodeData): UseHistoryTreeReturn {
  const base = useHistoryTreeBase<HistoryNodeData>(initialData);
  const snapshot = base.getSnapshot();

  const currentConfig = snapshot.nodes[snapshot.currentId]?.data?.config ?? initialData.config;

  const getInheritedDomStyle = useCallback((): { customDom: string | null; customStyle: string | null } => {
    const pathData = base.getNode(base.currentId);
    let customDom: string | null = null;
    let customStyle: string | null = null;

    let currentNode: HistoryNodeInfo<HistoryNodeData> | null = pathData;
    while (currentNode) {
      if (customDom === null && currentNode.data.customDom !== null) {
        customDom = currentNode.data.customDom;
      }
      if (customStyle === null && currentNode.data.customStyle !== null) {
        customStyle = currentNode.data.customStyle;
      }
      if (customDom !== null && customStyle !== null) {
        break;
      }
      currentNode = currentNode.parentId ? base.getNode(currentNode.parentId) : null;
    }

    return { customDom, customStyle };
  }, [base]);

  return {
    currentConfig,
    conversationHistory: base.conversationHistory,
    commit: base.commit,
    checkout: base.checkout,
    getNode: base.getNode,
    getSnapshot: base.getSnapshot,
    getInheritedDomStyle,
    exportTree: base.exportTree,
    importTree: base.importTree,
    currentId: base.currentId,
    getLeafNodes: base.getLeafNodes,
  };
}
```

#### 2.2.3 Chat 专用 Hook

**新建文件**：`src/hooks/use-chat-history-tree.ts`

```typescript
import { useHistoryTreeBase } from './use-history-tree-base';
import type { ChatHistoryNodeData } from '@/types/chat-history';
import type { ChatMessage } from '@/types/history';

export interface UseChatHistoryTreeReturn {
  conversationHistory: ChatMessage[];
  commit: (data: Omit<ChatHistoryNodeData, 'timestamp'>) => string;
  checkout: (nodeId: string) => void;
  getSnapshot: () => ReturnType<ReturnType<typeof useHistoryTreeBase<ChatHistoryNodeData>>['getSnapshot']>;
  currentId: string;
  getLeafNodes: () => Array<{ id: string; label: string; timestamp: number }>;
}

export function useChatHistoryTree(initialData: ChatHistoryNodeData): UseChatHistoryTreeReturn {
  const base = useHistoryTreeBase<ChatHistoryNodeData>(initialData);

  return {
    conversationHistory: base.conversationHistory,
    commit: base.commit,
    checkout: base.checkout,
    getSnapshot: base.getSnapshot,
    currentId: base.currentId,
    getLeafNodes: base.getLeafNodes,
  };
}
```

### 2.3 Chat Hook 改造（per-branch streaming + 全局通知）

改造 `useSimpleChat`，集成历史树能力，实现 per-branch 消息锁和全局通知。

**核心设计**：

- 每个分支独立追踪流式响应状态（per-branch streaming lock），不同分支可以同时发送消息
- 发送消息时锁定目标节点 ID（`targetNodeId`），流式响应完成后自动 commit 到该节点
- 切换分支不影响流式响应，响应继续传输
- 传输结束后，如果当前节点不是目标节点，通过 `dispatchEditorEvent(EDITOR_EVENTS.MESSAGE)` 通知用户
- 创建新对话 = 单纯 `checkout(rootId)`，不清空任何消息，不中断流式响应

**修改文件**：`src/hooks/use-simple-chat.ts`

```typescript
import { useState, useCallback, useRef } from 'react';
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
  const { conversationHistory, commit, checkout, getSnapshot, currentId, getLeafNodes } =
    useChatHistoryTree(initialChatNodeData);

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
        const newMessages: ChatMessage[] = [
          userMessage,
          { id: assistantId, role: 'assistant', content: fullResponse || assistantContent, timestamp: Date.now() },
        ];

        // checkout 到目标节点再 commit
        checkout(branchId);
        commit({
          label: `对话 ${new Date().toLocaleTimeString()}`,
          source: 'ai',
          messages: newMessages,
        });

        // 清除当前分支的流式状态
        branchStreamsRef.current.delete(branchId);
        forceUpdate();

        // 如果当前查看的节点不是新创建的节点，通知用户
        const currentSnapshot = getSnapshot();
        if (currentSnapshot.currentId !== branchId) {
          dispatchEditorEvent(EDITOR_EVENTS.MESSAGE, {
            text: '对话已保存到历史节点，当前查看的是其他分支',
            type: 'info',
          });
        }
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
    [conversationHistory, commit, checkout, getSnapshot],
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
  };
}
```

### 2.4 BranchSvg 泛型化改造

`BranchSvg` 当前硬编码了 `HistoryNodeData` 类型，需要泛型化。同时 `onNodeClick` 改为可选，Chat 场景不传。

**修改文件**：`src/components/editor/branch-svg/index.tsx`

关键变更：

1. 所有 `HistoryNodeData` 替换为泛型参数 `T`
2. `onNodeClick` 改为可选（`onNodeClick?: (nodeId: string) => void`）
3. 节点 label 通过 `(nodeInfo.data as { label?: string })?.label` 访问

```typescript
interface BranchSvgProps<T> {
  snapshot: HistoryTreeSnapshot<T>;
  selectedNodeId: string | null;
  onNodeClick?: (nodeId: string) => void;
  onNodeDoubleClick: (nodeId: string) => void;
}
```

节点点击处理：

```typescript
<g
  key={node.id}
  className={styles.branchNode}
  onClick={() => onNodeClick?.(node.id)}
  onDoubleClick={() => onNodeDoubleClick(node.id)}
>
```

其余布局逻辑（`computeLevelCounts`、`computeNodeLayouts`、`computeEdges`、`layoutTree`）全部泛型化，逻辑不变。

**影响范围**：`BranchPanel` 中的 `BranchSvg` 调用无需修改，TypeScript 会自动推断泛型参数为 `HistoryNodeData`。

### 2.5 左侧叶子节点列表组件

**新增文件**：`src/components/chat/conversation-list/index.tsx`

```typescript
import { memo } from 'react';
import styles from './index.module.css';

interface ConversationListProps {
  leafNodes: Array<{ id: string; label: string; timestamp: number }>;
  currentId: string;
  onNodeClick: (nodeId: string) => void;
}

export const ConversationList = memo(({ leafNodes, currentId, onNodeClick }: ConversationListProps) => {
  return (
    <div className={styles.conversationList}>
      <div className={styles.header}>对话列表</div>
      <div className={styles.list}>
        {leafNodes.map((node) => (
          <button
            key={node.id}
            type="button"
            className={`${styles.item} ${node.id === currentId ? styles.active : ''}`}
            onClick={() => onNodeClick(node.id)}
          >
            <span className={styles.label}>{node.label}</span>
            <span className={styles.time}>{new Date(node.timestamp).toLocaleTimeString()}</span>
          </button>
        ))}
      </div>
    </div>
  );
});
```

**新增文件**：`src/components/chat/conversation-list/index.module.css`

```css
.conversationList {
  width: 240rem;
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.header {
  padding: 16rem;
  font-weight: 600;
  border-bottom: 1px solid #e2e8f0;
}

.list {
  flex: 1;
  overflow-y: auto;
  padding: 8rem;
}

.item {
  width: 100%;
  padding: 12rem;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  border-radius: 6rem;
  display: flex;
  flex-direction: column;
  gap: 4rem;
  transition: background-color 0.2s;
}

.item:hover {
  background-color: #f1f5f9;
}

.item.active {
  background-color: #e0e7ff;
}

.label {
  font-size: 14rem;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.time {
  font-size: 12rem;
  color: #64748b;
}
```

### 2.6 右侧历史树组件

**新增文件**：`src/components/chat/chat-history-panel/index.tsx`

```typescript
import type { HistoryTreeSnapshot } from '@cmtlyt/lingshu-toolkit/shared/history-tree';
import type { ChatHistoryNodeData } from '@/types/chat-history';
import { BranchSvg } from '@/components/editor/branch-svg';
import styles from './index.module.css';

interface ChatHistoryPanelProps {
  snapshot: HistoryTreeSnapshot<ChatHistoryNodeData>;
  currentId: string;
  onNodeDoubleClick: (nodeId: string) => void;
}

export function ChatHistoryPanel({ snapshot, currentId, onNodeDoubleClick }: ChatHistoryPanelProps) {
  return (
    <div className={styles.chatHistoryPanel}>
      <div className={styles.header}>历史树</div>
      <div className={styles.treeContainer}>
        <BranchSvg
          snapshot={snapshot}
          selectedNodeId={currentId}
          onNodeDoubleClick={onNodeDoubleClick}
        />
      </div>
    </div>
  );
}
```

**新增文件**：`src/components/chat/chat-history-panel/index.module.css`

```css
.chatHistoryPanel {
  width: 280rem;
  border-left: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.header {
  padding: 16rem;
  font-weight: 600;
  border-bottom: 1px solid #e2e8f0;
}

.treeContainer {
  flex: 1;
  overflow: auto;
  padding: 16rem;
}
```

### 2.7 ChatContainer 改造

**修改文件**：`src/components/chat/chat-container/index.tsx`

```typescript
import { memo, useCallback, useMemo } from 'react';
import { useSimpleChat } from '@/hooks/use-simple-chat';
import { ChatMessageList } from '@/components/chat/chat-message-list';
import { InputArea } from '@/components/chat/input-area';
import { ConversationList } from '@/components/chat/conversation-list';
import { ChatHistoryPanel } from '@/components/chat/chat-history-panel';
import styles from './index.module.css';

export const ChatContainer = memo(() => {
  const {
    messages,
    isStreaming,
    sendMessage,
    createNewConversation,
    getSnapshot,
    currentId,
    checkout,
    getLeafNodes,
  } = useSimpleChat();

  const leafNodes = useMemo(() => getLeafNodes(), [getLeafNodes, currentId]);
  const snapshot = getSnapshot();

  // 左侧列表单击 checkout
  const handleListCheckout = useCallback(
    (nodeId: string) => {
      checkout(nodeId);
    },
    [checkout],
  );

  // 右侧历史树双击 checkout
  const handleTreeCheckout = useCallback(
    (nodeId: string) => {
      checkout(nodeId);
    },
    [checkout],
  );

  return (
    <div className={styles.chatContainer}>
      {/* 左侧：叶子节点列表（单击 checkout） */}
      <ConversationList leafNodes={leafNodes} currentId={currentId} onNodeClick={handleListCheckout} />

      {/* 中间：对话区域 */}
      <div className={styles.chatMain}>
        <header className={styles.header}>
          <h1 className={styles.title}>AI 对话</h1>
          <button type="button" className={styles.newConversationButton} onClick={createNewConversation}>
            创建新对话
          </button>
        </header>
        {messages.length === 0 ? (
          <div className={styles.emptyState}>开始新的对话，输入你的问题吧</div>
        ) : (
          <ChatMessageList messages={messages} isStreaming={isStreaming} enableCollapse={false} />
        )}
        <InputArea isStreaming={isStreaming} onSend={sendMessage} showToggleGroup={false} placeholder="输入你的问题..." />
      </div>

      {/* 右侧：历史树（双击 checkout） */}
      <ChatHistoryPanel snapshot={snapshot} currentId={currentId} onNodeDoubleClick={handleTreeCheckout} />
    </div>
  );
});
```

**修改文件**：`src/components/chat/chat-container/index.module.css`

```css
.chatContainer {
  display: flex;
  height: 100vh;
  width: 100%;
}

.chatMain {
  flex: 1;
  display: flex;
  flex-direction: column;
  max-width: 800rem;
  margin: 0 auto;
  padding: 0 24rem;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rem 0;
  border-bottom: 1px solid #e2e8f0;
}

.title {
  font-size: 24rem;
  font-weight: 700;
  margin: 0;
}

.newConversationButton {
  padding: 8rem 16rem;
  background-color: #4f86f7;
  color: white;
  border: none;
  border-radius: 6rem;
  cursor: pointer;
  font-size: 14rem;
  font-weight: 500;
  transition: background-color 0.2s;
}

.newConversationButton:hover {
  background-color: #3b76e7;
}

.emptyState {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  font-size: 16rem;
}
```

### 2.8 全局 MessageToast 注册

将 `MessageToast` 从各页面移除，统一注册到 `__root.tsx`，实现全局通知。

**修改文件**：`src/routes/__root.tsx`

```typescript
import { Outlet, createRootRoute } from '@tanstack/react-router';
import { MessageToast } from '@/components/editor/message-toast';

function RootComponent() {
  return (
    <>
      <Outlet />
      <MessageToast />
    </>
  );
}

export const Route = createRootRoute({
  component: RootComponent,
});
```

**修改文件**：`src/routes/editor.tsx`

移除页面内的 `<MessageToast />` 组件（已改为全局注册）。

## 3. 文件变更清单

| 文件路径                                                    | 变更类型 | 说明                                                                                                 |
| ----------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `src/types/chat-history.ts`                                 | 新建     | Chat 历史节点数据类型                                                                                |
| `src/hooks/use-history-tree-base.ts`                        | 新建     | 泛型化基础历史树 Hook `useHistoryTreeBase<T>`                                                        |
| `src/hooks/use-history-tree.ts`                             | 修改     | 改为从 `use-history-tree-base` 导入，封装 Editor 专属逻辑（`getInheritedDomStyle`、`currentConfig`） |
| `src/hooks/use-chat-history-tree.ts`                        | 新建     | Chat 专用历史树 Hook，基于 `useHistoryTreeBase` 封装                                                 |
| `src/hooks/use-simple-chat.ts`                              | 修改     | 集成历史树，per-branch streaming，全局通知                                                           |
| `src/components/editor/branch-svg/index.tsx`                | 修改     | 泛型化改造，`onNodeClick` 改为可选                                                                   |
| `src/components/chat/conversation-list/index.tsx` + `.css`  | 新建     | 左侧叶子节点列表组件（单击 checkout）                                                                |
| `src/components/chat/chat-history-panel/index.tsx` + `.css` | 新建     | 右侧历史树面板组件（双击 checkout，不传 onNodeClick）                                                |
| `src/components/chat/chat-container/index.tsx` + `.css`     | 修改     | 三栏布局，集成历史管理，移除 `MessageToast`（改为全局注册）                                          |
| `src/routes/__root.tsx`                                     | 修改     | 注册全局 `<MessageToast />` 组件                                                                     |
| `src/routes/editor.tsx`                                     | 修改     | 移除页面内的 `<MessageToast />`（已改为全局注册）                                                    |

## 4. 核心行为说明

### 4.1 checkout 行为（分支切换）

**左侧叶子节点列表**：

- 用户单击叶子节点时，调用 `checkout(nodeId)` 切换到目标节点
- `conversationHistory` 自动更新为当前路径的所有消息
- 如果目标分支有正在进行的流式响应，显示该分支的流式消息

**右侧历史树**：

- 用户双击节点时，调用 `checkout(nodeId)`，行为与左侧一致
- 单击无任何交互（`BranchSvg` 的 `onNodeClick` 不传）

**流式响应中的处理**：

- 切换分支**不会中断**任何分支的流式响应
- 每个分支独立追踪流式状态（per-branch streaming lock）
- 流式响应继续传输，完成后自动 commit 到发送时锁定的目标节点

### 4.2 commit 行为（消息提交）

- 发送消息时，锁定当前分支 ID 作为 `branchId`
- 流式消息存储在 `branchStreamsRef` 中，按分支 ID 隔离
- 流式响应完成后：
  1. `checkout(branchId)` 切换到目标分支
  2. `commit()` 创建新节点
  3. 清除该分支的流式状态
  4. 如果当前查看的节点不是目标分支，通过 `dispatchEditorEvent(EDITOR_EVENTS.MESSAGE)` 通知用户
- 通知由全局 `MessageToast` 组件展示，3 秒后自动消失

### 4.3 创建新对话

- 点击"创建新对话"按钮，调用 `createNewConversation()`
- 该函数**仅执行** `checkout(rootId)`，切换到根分支
- **不清空任何消息**，**不中断任何流式响应**
- 正在进行的流式响应继续传输，完成后仍 commit 到原目标分支
- 用户可以从根节点开始新的对话分支

## 5. 边界情况处理

| 场景                                    | 处理方式                                                                                       |
| --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 首次进入 Chat 页面                      | 历史树只有一个根节点，叶子节点列表显示根节点                                                   |
| 在叶子节点继续对话                      | commit 后创建新的子节点，该节点成为新的叶子节点                                                |
| 在中间节点继续对话                      | commit 后创建新的分支，原叶子节点不再是叶子                                                    |
| 流式响应中切换分支                      | 不中断流式响应，切换到目标分支后显示该分支的消息（历史 + 流式），原分支的流式响应继续传输      |
| 多个分支同时流式响应                    | per-branch streaming lock 允许不同分支同时发送消息，互不影响                                   |
| 流式响应中创建新对话                    | 不中断流式响应，单纯切换到根分支，响应完成后仍 commit 到原目标分支                             |
| 流式响应完成后当前节点不是目标分支      | 通过 `dispatchEditorEvent(EDITOR_EVENTS.MESSAGE)` 通知用户，`MessageToast` 展示 3 秒后自动消失 |
| 历史树为空                              | 显示初始的根节点                                                                               |
| 流式响应被用户主动中断（stopStreaming） | 仅中断当前分支的流式响应，捕获 `AbortError` 记录日志，不执行 commit                            |
| 流式响应出错                            | 显示错误消息到 assistant 消息中，不执行 commit                                                 |

## 6. 验收标准

- [ ] Chat 页面呈现三栏布局：左侧叶子节点列表、中间对话区域、右侧历史树
- [ ] 单击左侧叶子节点，对话消息完整替换为该节点路径的所有消息
- [ ] 双击右侧历史树节点，行为同左侧单击
- [ ] 单击右侧历史树节点无任何交互
- [ ] 每次对话完成后，历史树自动创建新节点
- [ ] 流式响应中切换分支，不中断响应，切换到目标分支后显示该分支的消息
- [ ] 不同分支可以同时发送消息（per-branch streaming lock）
- [ ] 流式响应完成后，如果当前节点不是目标分支，通过全局 `MessageToast` 通知用户
- [ ] "创建新对话"按钮单纯切换到根分支，不清空消息，不中断流式响应
- [ ] 叶子节点列表按时间戳降序排列
- [ ] 当前选中的节点在左侧列表中高亮显示
- [ ] Hook 拆分为 3 个文件：`use-history-tree-base.ts`、`use-history-tree.ts`、`use-chat-history-tree.ts`
- [ ] TypeScript 类型检查通过，无 any 类型
- [ ] 执行 `pnpm fmt:check` 和 `pnpm lint:fix` 无报错
