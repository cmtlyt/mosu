import type { HistoryTreeSnapshot } from '@cmtlyt/lingshu-toolkit/shared/history-tree';
import type { HistoryNodeData } from '@/types/history';
import { BranchSvg } from '../branch-svg';
import { NodeDetail } from '../node-detail';
import styles from './index.module.css';

interface BranchPanelProps {
  snapshot: HistoryTreeSnapshot<HistoryNodeData>;
  selectedNodeId: string | null;
  selectedNodeData: HistoryNodeData | null;
  onNodeClick: (nodeId: string) => void;
  onNodeDoubleClick: (nodeId: string) => void;
  onCommitEdit: (editedData: Omit<HistoryNodeData, 'timestamp'>) => void;
}

export function BranchPanel({
  snapshot,
  selectedNodeId,
  selectedNodeData,
  onNodeClick,
  onNodeDoubleClick,
  onCommitEdit,
}: BranchPanelProps) {
  return (
    <div className={styles.branchPanel}>
      <div className={styles.treeSection}>
        <div className={styles.header}>历史树</div>
        <BranchSvg
          snapshot={snapshot}
          selectedNodeId={selectedNodeId}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
        />
      </div>
      <div className={styles.detailSection}>
        <div className={styles.header}>节点详情</div>
        <NodeDetail data={selectedNodeData} onCommitEdit={onCommitEdit} />
      </div>
    </div>
  );
}
