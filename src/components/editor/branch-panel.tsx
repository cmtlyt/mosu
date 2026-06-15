import type { HistoryTreeSnapshot } from '@cmtlyt/lingshu-toolkit/shared/history-tree';
import type { HistoryNodeData } from '@/types/history';
import { BranchSvg } from './branch-svg';
import { NodeDetail } from './node-detail';
import styles from './branch-panel.module.css';

interface BranchPanelProps {
  snapshot: HistoryTreeSnapshot<HistoryNodeData>;
  selectedNodeId: string | null;
  selectedNodeData: HistoryNodeData | null;
  onNodeClick: (nodeId: string) => void;
  onNodeDoubleClick: (nodeId: string) => void;
}

export function BranchPanel({
  snapshot,
  selectedNodeId,
  selectedNodeData,
  onNodeClick,
  onNodeDoubleClick,
}: BranchPanelProps) {
  return (
    <div className={styles.branchPanel}>
      <div className={styles.treeSection}>
        <div className={styles.header}>History Tree</div>
        <BranchSvg
          snapshot={snapshot}
          selectedNodeId={selectedNodeId}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
        />
      </div>
      <div className={styles.detailSection}>
        <div className={styles.header}>Node Detail</div>
        <NodeDetail data={selectedNodeData} />
      </div>
    </div>
  );
}
