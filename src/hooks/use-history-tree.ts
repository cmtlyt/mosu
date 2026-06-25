import { useMemo, useCallback, useRef, useState, useSyncExternalStore } from 'react';
import {
  createHistoryTree,
  type HistoryTree,
  type HistoryNodeInfo,
  type HistoryTreeSnapshot,
} from '@cmtlyt/lingshu-toolkit/shared/history-tree';
import type { HistoryNodeData, ChatMessage } from '@/types/history';
import type { AnimationConfig } from '@lib/animation-sdk';
import { logger } from '@lib/logger';

interface ExportedTreeData {
  version: string;
  exportedAt: string;
  snapshot: HistoryTreeSnapshot<HistoryNodeData>;
}

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
}

export function useHistoryTree(initialData: HistoryNodeData): UseHistoryTreeReturn {
  const [tree, setTree] = useState(() => createHistoryTree<HistoryNodeData>({ initialData }));

  const cachedSnapshotRef = useRef<ReturnType<HistoryTree<HistoryNodeData>['getSnapshot']> | null>(null);

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

  const currentConfig = snapshot.nodes[snapshot.currentId]?.data?.config ?? initialData.config;
  const { currentId } = snapshot;

  const conversationHistory = useMemo(() => {
    const pathData = tree.getPathData();
    const orderedPath = [...pathData].reverse();
    return orderedPath.flatMap((nodeData) => nodeData.messages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot]);

  const commit = useCallback(
    (data: Omit<HistoryNodeData, 'timestamp'>) => {
      const nodeData: HistoryNodeData = { ...data, timestamp: Date.now() };
      const nodeId = tree.commit(nodeData);
      logger.info('hooks.use-history-tree.commit', `Committed new history node: ${nodeId}`);
      return nodeId;
    },
    [tree],
  );

  const checkout = useCallback(
    (nodeId: string) => {
      tree.checkout(nodeId);
      logger.info('hooks.use-history-tree.checkout', `Checked out to node: ${nodeId}`);
    },
    [tree],
  );

  const getNode = useCallback((nodeId: string) => tree.getNode(nodeId), [tree]);
  const getSnapshot = useCallback(() => tree.getSnapshot(), [tree]);

  const getInheritedDomStyle = useCallback((): { customDom: string | null; customStyle: string | null } => {
    // getPathData returns [current, parent, ..., root] for the checked-out path.
    const pathData = tree.getPathData();
    let customDom: string | null = null;
    let customStyle: string | null = null;

    for (const { customDom: nodeDom, customStyle: nodeStyle } of pathData) {
      if (customDom === null && nodeDom !== null) {
        customDom = nodeDom;
      }
      if (customStyle === null && nodeStyle !== null) {
        customStyle = nodeStyle;
      }
      if (customDom !== null && customStyle !== null) {
        break;
      }
    }

    return { customDom, customStyle };
  }, [tree]);

  const exportTree = useCallback(() => {
    const snapshot = tree.getSnapshot();
    const exportData: ExportedTreeData = {
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
    logger.info('hooks.use-history-tree.exportTree', 'History tree exported successfully');
  }, [tree]);

  const importTree = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as ExportedTreeData;

      if (!parsed.snapshot?.rootId || !parsed.snapshot?.nodes) {
        logger.warn('hooks.use-history-tree.importTree', 'Invalid history tree file: missing snapshot');
        return false;
      }

      const { snapshot } = parsed;
      const rootNode = snapshot.nodes[snapshot.rootId];
      if (!rootNode?.data) {
        logger.warn('hooks.use-history-tree.importTree', 'Invalid history tree file: missing root data');
        return false;
      }

      const newTree = createHistoryTree<HistoryNodeData>({ initialData: rootNode.data });
      const idMapping = new Map<string, string>();
      idMapping.set(snapshot.rootId, newTree.currentId);

      // 递归 DFS 重建树，每次 commit 前 checkout 到正确的父节点
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

          // 每次 commit 前必须 checkout 回父节点，否则指针会停留在上一个子节点
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
        'hooks.use-history-tree.importTree',
        `Imported history tree with ${Object.keys(snapshot.nodes).length} nodes`,
      );
      return true;
    } catch (error) {
      logger.error('hooks.use-history-tree.importTree', 'Failed to import history tree', error);
      return false;
    }
  }, []);

  return {
    currentConfig,
    conversationHistory,
    commit,
    checkout,
    getNode,
    getSnapshot,
    getInheritedDomStyle,
    exportTree,
    importTree,
    currentId,
  };
}
