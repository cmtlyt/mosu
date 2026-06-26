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
  getLeafNodes: () => { id: string; label: string; timestamp: number }[];
}

export function useHistoryTree(initialData: HistoryNodeData): UseHistoryTreeReturn {
  const base = useHistoryTreeBase<HistoryNodeData>(initialData);
  const snapshot = base.getSnapshot();

  const currentConfig = snapshot.nodes[snapshot.currentId]?.data?.config ?? initialData.config;

  const { getNode, currentId } = base;
  const getInheritedDomStyle = useCallback((): { customDom: string | null; customStyle: string | null } => {
    const pathData = getNode(currentId);
    let customDom: string | null = null;
    let customStyle: string | null = null;

    let currentNode: HistoryNodeInfo<HistoryNodeData> | null = pathData;
    while (currentNode) {
      if (customDom === null && currentNode.data.customDom !== null) {
        ({ customDom } = currentNode.data);
      }
      if (customStyle === null && currentNode.data.customStyle !== null) {
        ({ customStyle } = currentNode.data);
      }
      if (customDom !== null && customStyle !== null) {
        break;
      }
      currentNode = currentNode.parentId ? getNode(currentNode.parentId) : null;
    }

    return { customDom, customStyle };
  }, [getNode, currentId]);

  return {
    currentConfig,
    conversationHistory: base.conversationHistory,
    commit: base.commit,
    checkout: base.checkout,
    getNode,
    getSnapshot: base.getSnapshot,
    getInheritedDomStyle,
    exportTree: base.exportTree,
    importTree: base.importTree,
    currentId,
    getLeafNodes: base.getLeafNodes,
  };
}
