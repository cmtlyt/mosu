import { useMemo, useCallback, useRef, useSyncExternalStore } from 'react';
import { createHistoryTree, type HistoryTree, type HistoryNodeInfo } from '@cmtlyt/lingshu-toolkit/shared/history-tree';
import type { HistoryNodeData, ChatMessage } from '@/types/history';
import type { AnimationConfig } from '@/types/animation';
import { logger } from '@/libs/logger';

export interface UseHistoryTreeReturn {
  currentConfig: AnimationConfig;
  conversationHistory: ChatMessage[];
  commit: (data: Omit<HistoryNodeData, 'timestamp'>) => string;
  checkout: (nodeId: string) => void;
  getNode: (nodeId: string) => HistoryNodeInfo<HistoryNodeData>;
  getSnapshot: () => ReturnType<HistoryTree<HistoryNodeData>['getSnapshot']>;
  getInheritedDomStyle: () => { customDom: string | null; customStyle: string | null };
  currentId: string;
}

export function useHistoryTree(initialData: HistoryNodeData): UseHistoryTreeReturn {
  const tree = useMemo(
    () =>
      createHistoryTree<HistoryNodeData>({
        initialData,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const cachedSnapshotRef = useRef<ReturnType<HistoryTree<HistoryNodeData>['getSnapshot']> | null>(null);

  const subscribe = useMemo(
    () => (onStoreChange: () => void) =>
      tree.onChange(() => {
        cachedSnapshotRef.current = null;
        onStoreChange();
      }),
    [tree],
  );

  const getSnapshotFn = useMemo(
    () => () => {
      if (cachedSnapshotRef.current === null) {
        cachedSnapshotRef.current = tree.getSnapshot();
      }
      return cachedSnapshotRef.current;
    },
    [tree],
  );

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
  return {
    currentConfig,
    conversationHistory,
    commit,
    checkout,
    getNode,
    getSnapshot,
    getInheritedDomStyle,
    currentId,
  };
}
