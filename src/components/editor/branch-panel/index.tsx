import { useRef } from 'react';
import type { HistoryTreeSnapshot } from '@cmtlyt/lingshu-toolkit/shared/history-tree';
import type { HistoryNodeData } from '@/types/history';
import { dispatchEditorEvent, EDITOR_EVENTS } from '@/utils/editor/event-bus';
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
  onExportTree: () => void;
  onImportTree: (file: File) => void;
  onCopyContext?: (data: HistoryNodeData) => void;
}

export function BranchPanel({
  snapshot,
  selectedNodeId,
  selectedNodeData,
  onNodeClick,
  onNodeDoubleClick,
  onCommitEdit,
  onExportTree,
  onImportTree,
  onCopyContext,
}: BranchPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onImportTree(file);
    }
    event.target.value = '';
  };

  const handleCopyDetail = async () => {
    if (!selectedNodeData) {
      return;
    }
    const detail = {
      config: selectedNodeData.config,
      dom: selectedNodeData.customDom ?? null,
      style: selectedNodeData.customStyle ?? null,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(detail));
      dispatchEditorEvent(EDITOR_EVENTS.MESSAGE, { text: '详情已复制到剪贴板', type: 'success' });
    } catch (error) {
      dispatchEditorEvent(EDITOR_EVENTS.MESSAGE, { text: `复制失败: ${(error as Error).message}`, type: 'error' });
    }
  };

  const handleCopyContext = () => {
    if (selectedNodeData && onCopyContext) {
      onCopyContext(selectedNodeData);
    }
  };

  return (
    <div className={styles.branchPanel}>
      <div className={styles.treeSection}>
        <div className={styles.header}>
          <span>历史树</span>
          <div className={styles.headerActions}>
            <button type="button" className={styles.headerButton} onClick={handleImportClick}>
              导入
            </button>
            <button type="button" className={styles.headerButton} onClick={onExportTree}>
              导出
            </button>
          </div>
        </div>
        <BranchSvg
          snapshot={snapshot}
          selectedNodeId={selectedNodeId}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className={styles.hiddenInput}
          onChange={handleFileChange}
          aria-label="导入历史树文件"
        />
      </div>
      <div className={styles.detailSection}>
        <div className={styles.header}>
          <span>节点详情</span>
          {selectedNodeData && (
            <div className={styles.headerActions}>
              <button type="button" className={styles.headerButton} onClick={handleCopyDetail}>
                复制详情
              </button>
              {onCopyContext && (
                <button type="button" className={styles.headerButton} onClick={handleCopyContext}>
                  复制上下文
                </button>
              )}
            </div>
          )}
        </div>
        <NodeDetail data={selectedNodeData} onCommitEdit={onCommitEdit} />
      </div>
    </div>
  );
}
