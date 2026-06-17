import { lockData } from '@cmtlyt/lingshu-toolkit/shared/lock-data';
import type { HistoryTreeSnapshot } from '@cmtlyt/lingshu-toolkit/shared/history-tree';
import type { HistoryNodeData } from '@/types/history';

export interface EditorState {
  treeSnapshot: HistoryTreeSnapshot<HistoryNodeData>;
  selectedNodeId: string | null;
  isStreaming: boolean;
}

export function createEditorState(animationId: string) {
  return lockData({
    id: `animation-editor-${animationId}`,
    syncMode: 'storage-authority' as const,
    getValue: () =>
      ({
        treeSnapshot: null as unknown as HistoryTreeSnapshot<HistoryNodeData>,
        selectedNodeId: null,
        isStreaming: false,
      }) as EditorState,
  });
}
