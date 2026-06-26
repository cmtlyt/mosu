import { memo, useState, useCallback } from 'react';
import { ConfirmDialog } from '../confirm-dialog';
import styles from './index.module.css';

interface ConversationListProps {
  leafNodes: { id: string; label: string; timestamp: number }[];
  currentId: string;
  onNodeClick: (nodeId: string) => void;
  onExport: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
}

export const ConversationList = memo(
  ({ leafNodes, currentId, onNodeClick, onExport, onDelete }: ConversationListProps) => {
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [nodeToDelete, setNodeToDelete] = useState<{ id: string; label: string } | null>(null);

    const handleDeleteClick = useCallback((nodeId: string, label: string) => {
      setNodeToDelete({ id: nodeId, label });
      setDeleteDialogOpen(true);
    }, []);

    const handleConfirmDelete = useCallback(() => {
      if (nodeToDelete) {
        onDelete(nodeToDelete.id);
        setDeleteDialogOpen(false);
        setNodeToDelete(null);
      }
    }, [nodeToDelete, onDelete]);

    const handleCancelDelete = useCallback(() => {
      setDeleteDialogOpen(false);
      setNodeToDelete(null);
    }, []);

    return (
      <div className={styles.conversationList}>
        <div className={styles.header}>对话列表</div>
        <div className={styles.list}>
          {leafNodes.map((node) => (
            <div
              key={node.id}
              className={`${styles.item} ${node.id === currentId ? styles.active : ''}`}
              onClick={() => onNodeClick(node.id)}
            >
              <span className={styles.label}>{node.label}</span>
              <div className={styles.bottomRow}>
                <span className={styles.time}>{new Date(node.timestamp).toLocaleString()}</span>
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.actionButton}
                    onClick={(e) => {
                      e.stopPropagation();
                      onExport(node.id);
                    }}
                    aria-label="导出对话"
                  >
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
                  <button
                    type="button"
                    className={styles.actionButton}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteClick(node.id, node.label);
                    }}
                    aria-label="删除对话"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                      <path
                        d="M2 4H12M5 4V3C5 2.44772 5.44772 2 6 2H8C8.55228 2 9 2.44772 9 3V4M11 4V11C11 11.5523 10.5523 12 10 12H4C3.44772 12 3 11.5523 3 11V4"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <ConfirmDialog
          open={deleteDialogOpen}
          title="删除对话"
          message={`确定要删除"${nodeToDelete?.label}"吗？此操作不可恢复。`}
          confirmText="删除"
          cancelText="取消"
          onConfirm={handleConfirmDelete}
          onCancel={handleCancelDelete}
        />
      </div>
    );
  },
);
