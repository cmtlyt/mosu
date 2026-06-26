import type { HistoryTreeSnapshot } from '@cmtlyt/lingshu-toolkit/shared/history-tree';
import type { ChatHistoryNodeData } from '@/types/chat-history';
import { BranchSvg } from '@/components/editor/branch-svg';
import styles from './index.module.css';

interface ChatHistoryPanelProps {
  snapshot: HistoryTreeSnapshot<ChatHistoryNodeData>;
  currentId: string;
  onNodeDoubleClick: (nodeId: string) => void;
  onExportTree: () => void;
}

export function ChatHistoryPanel({ snapshot, currentId, onNodeDoubleClick, onExportTree }: ChatHistoryPanelProps) {
  return (
    <div className={styles.chatHistoryPanel}>
      <div className={styles.header}>
        <span>历史树</span>
        <button type="button" className={styles.exportButton} onClick={onExportTree} aria-label="导出历史树">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path
              d="M7 2V9M7 9L4 6M7 9L10 6M2 11H12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      <div className={styles.treeContainer}>
        <BranchSvg snapshot={snapshot} selectedNodeId={currentId} onNodeDoubleClick={onNodeDoubleClick} />
      </div>
    </div>
  );
}
