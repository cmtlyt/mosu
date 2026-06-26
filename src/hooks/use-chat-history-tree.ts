import { useCallback, useEffectEvent, useRef } from 'react';
import { useHistoryTreeBase } from './use-history-tree-base';
import { saveToOPFS, loadFromOPFS } from '@/utils/opfs';
import { logger } from '@lib/logger';
import type { ChatHistoryNodeData } from '@/types/chat-history';
import type { ChatMessage } from '@/types/history';

const OPFS_FILENAME = 'chat-history-tree.json';

export interface UseChatHistoryTreeReturn {
  conversationHistory: ChatMessage[];
  commit: (data: Omit<ChatHistoryNodeData, 'timestamp'>) => string;
  checkout: (nodeId: string) => void;
  getSnapshot: () => ReturnType<ReturnType<typeof useHistoryTreeBase<ChatHistoryNodeData>>['getSnapshot']>;
  currentId: string;
  getLeafNodes: () => { id: string; label: string; timestamp: number }[];
  exportConversation: (nodeId: string) => void;
  exportTree: () => void;
  deleteConversation: (nodeId: string) => void;
  importConversations: (file: File) => Promise<boolean>;
  saveToOPFS: () => Promise<void>;
  loadFromOPFS: () => Promise<boolean>;
}

export function useChatHistoryTree(initialData: ChatHistoryNodeData): UseChatHistoryTreeReturn {
  const base = useHistoryTreeBase<ChatHistoryNodeData>(initialData);
  const loadedRef = useRef(false);

  const checkoutRoot = useEffectEvent(() => {
    setTimeout(() => base.checkout(base.getSnapshot().rootId));
  });

  // 导出单个对话（从指定节点到根节点的路径）
  const exportConversation = useCallback(
    (nodeId: string) => {
      const snapshot = base.getSnapshot();
      const node = snapshot.nodes[nodeId];
      if (!node) {
        logger.warn('hooks.use-chat-history-tree.exportConversation', `Node not found: ${nodeId}`);
        return;
      }

      // 收集从当前节点到根节点的路径
      const path: string[] = [];
      let current: string | null = nodeId;
      while (current) {
        path.unshift(current);
        current = snapshot.nodes[current]?.parentId ?? null;
      }

      // 导出路径上的所有节点
      const exportData = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        type: 'conversation',
        nodes: path.map((id) => ({
          id,
          data: snapshot.nodes[id]?.data,
          parentId: snapshot.nodes[id]?.parentId,
        })),
      };

      const json = JSON.stringify(exportData, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `conversation-${node.data.label}-${Date.now()}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      logger.info('hooks.use-chat-history-tree.exportConversation', `Exported conversation: ${node.data.label}`);
    },
    [base],
  );

  // 删除对话（剪枝逻辑：从叶子节点向上找到分叉点为止）
  const deleteConversation = useCallback(
    (nodeId: string) => {
      const snapshot = base.getSnapshot();
      const node = snapshot.nodes[nodeId];
      if (!node) {
        logger.warn('hooks.use-chat-history-tree.deleteConversation', `Node not found: ${nodeId}`);
        return;
      }

      // 剪枝逻辑：从目标节点向上收集所有"独占"祖先（只有一个子节点的祖先）
      const nodesToDelete: string[] = [];
      let current: string | null = nodeId;

      while (current) {
        nodesToDelete.push(current);
        const currentNode: any = snapshot.nodes[current];
        const parentId = currentNode?.parentId;

        // 如果没有父节点（到达根节点）或父节点有多个子节点（分叉点），停止
        if (!parentId) {
          break;
        }

        const parentNode = snapshot.nodes[parentId];
        if (!parentNode || !parentNode.childrenIds || parentNode.childrenIds.length > 1) {
          // 父节点有多个子节点，这是分叉点，不删除父节点
          break;
        }

        // 父节点只有一个子节点，继续向上
        current = parentId;
      }

      // 从历史树中删除节点
      const newSnapshot = {
        ...snapshot,
        nodes: Object.fromEntries(Object.entries(snapshot.nodes).filter(([id]) => !nodesToDelete.includes(id))),
      };

      // 重新创建历史树
      const exportData = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        snapshot: newSnapshot,
      };

      const json = JSON.stringify(exportData);
      const blob = new Blob([json], { type: 'application/json' });
      const file = new File([blob], 'temp.json', { type: 'application/json' });
      base.importTree(file).then((success) => {
        if (success) {
          // 如果删除的是当前节点，切换到根节点
          if (nodesToDelete.includes(snapshot.currentId)) {
            setTimeout(checkoutRoot);
          }
          logger.info(
            'hooks.use-chat-history-tree.deleteConversation',
            `Pruned ${nodesToDelete.length} nodes from leaf to branch point`,
          );
        }
      });
    },
    [base],
  );

  // 导入聊天记录
  const importConversations = useCallback(
    async (file: File): Promise<boolean> => {
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);

        // 检查是否是单个对话导出格式
        if (parsed.type === 'conversation' && Array.isArray(parsed.nodes)) {
          // 导入单个对话
          const snapshot = base.getSnapshot();
          const { rootId } = snapshot;

          // 从根节点开始创建新的分支
          base.checkout(rootId);

          // 按顺序创建节点（跳过根节点，因为它已经存在）
          for (const node of parsed.nodes) {
            if (node.parentId === null) {
              // 这是根节点，跳过
              continue;
            }
            base.commit(node.data);
          }

          logger.info(
            'hooks.use-chat-history-tree.importConversations',
            `Imported conversation with ${parsed.nodes.length} nodes`,
          );
          return true;
        }

        // 检查是否是完整历史树导出格式
        if (parsed.snapshot?.rootId && parsed.snapshot?.nodes) {
          return await base.importTree(file);
        }

        logger.warn('hooks.use-chat-history-tree.importConversations', 'Invalid file format');
        return false;
      } catch (error) {
        logger.error('hooks.use-chat-history-tree.importConversations', 'Failed to import conversations', error);
        return false;
      }
    },
    [base],
  );

  // 保存到 OPFS
  const saveToOPFSCallback = useCallback(async () => {
    try {
      const snapshot = base.getSnapshot();
      const exportData = {
        version: '1.0',
        savedAt: new Date().toISOString(),
        snapshot,
      };
      await saveToOPFS(OPFS_FILENAME, exportData);
      logger.info('hooks.use-chat-history-tree.saveToOPFS', 'Saved history tree to OPFS');
    } catch (error) {
      logger.error('hooks.use-chat-history-tree.saveToOPFS', 'Failed to save to OPFS', error);
      throw error;
    }
  }, [base]);

  // 从 OPFS 加载
  const loadFromOPFSCallback = useCallback(async (): Promise<boolean> => {
    if (loadedRef.current) {
      return true;
    }
    try {
      const data = await loadFromOPFS<{ snapshot: any }>(OPFS_FILENAME);
      if (!data?.snapshot) {
        logger.info('hooks.use-chat-history-tree.loadFromOPFS', 'No saved history tree found in OPFS');
        return false;
      }

      const json = JSON.stringify(data);
      const blob = new Blob([json], { type: 'application/json' });
      const file = new File([blob], 'temp.json', { type: 'application/json' });
      const success = await base.importTree(file);

      if (success) {
        loadedRef.current = true;
        logger.info('hooks.use-chat-history-tree.loadFromOPFS', 'Loaded history tree from OPFS');
      }
      return success;
    } catch (error) {
      logger.error('hooks.use-chat-history-tree.loadFromOPFS', 'Failed to load from OPFS', error);
      return false;
    }
  }, [base]);

  return {
    conversationHistory: base.conversationHistory,
    commit: base.commit,
    checkout: base.checkout,
    getSnapshot: base.getSnapshot,
    currentId: base.currentId,
    getLeafNodes: base.getLeafNodes,
    exportConversation,
    exportTree: base.exportTree,
    deleteConversation,
    importConversations,
    saveToOPFS: saveToOPFSCallback,
    loadFromOPFS: loadFromOPFSCallback,
  };
}
