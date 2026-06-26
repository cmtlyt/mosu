import { useMemo, useCallback, useRef, useState, useSyncExternalStore, useEffect } from 'react';
import {
  createHistoryTree,
  type HistoryTree,
  type HistoryNodeInfo,
  type HistoryTreeSnapshot,
} from '@cmtlyt/lingshu-toolkit/shared/history-tree';
import { logger } from '@lib/logger';
import { useForceUpdate } from '@cmtlyt/lingshu-toolkit/react/use-force-update';

interface ExportedTreeData<T> {
  version: string;
  exportedAt: string;
  snapshot: HistoryTreeSnapshot<T>;
}

export interface UseHistoryTreeBaseReturn<T> {
  conversationHistory: T extends { messages: infer M } ? M : never;
  commit: (data: Omit<T, 'timestamp'>) => string;
  checkout: (nodeId: string) => void;
  getNode: (nodeId: string) => HistoryNodeInfo<T>;
  getSnapshot: () => ReturnType<HistoryTree<T>['getSnapshot']>;
  exportTree: () => void;
  importTree: (file: File) => Promise<boolean>;
  currentId: string;
  getLeafNodes: () => { id: string; label: string; timestamp: number }[];
}

export function useHistoryTreeBase<T extends { timestamp: number; label: string; messages: any[] }>(
  initialData: T,
): UseHistoryTreeBaseReturn<T> {
  const [tree, setTree] = useState(() => createHistoryTree<T>({ initialData }));
  const forceUpdate = useForceUpdate();

  const cachedSnapshotRef = useRef<ReturnType<HistoryTree<T>['getSnapshot']> | null>(null);

  // tree 被替换时，清空缓存并强制重新渲染，确保 useSyncExternalStore 获取新 snapshot
  const prevTreeRef = useRef(tree);
  useEffect(() => {
    if (prevTreeRef.current !== tree) {
      prevTreeRef.current = tree;
      cachedSnapshotRef.current = null;
      forceUpdate();
    }
  }, [tree, forceUpdate]);

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
    return orderedPath.flatMap((nodeData) => nodeData.messages) as any;
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
    const leafNodes: { id: string; label: string; timestamp: number }[] = [];

    for (const [nodeId, nodeInfo] of Object.entries(snapshot.nodes)) {
      if (!nodeInfo.childrenIds || nodeInfo.childrenIds.length === 0) {
        leafNodes.push({
          id: nodeId,
          label: nodeInfo.data.label,
          timestamp: nodeInfo.data.timestamp,
        });
      }
    }

    return leafNodes.sort((a, b) => b.timestamp - a.timestamp);
  }, [snapshot]);

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
