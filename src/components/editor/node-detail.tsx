import { useState, useEffect } from 'react';
import type { HistoryNodeData } from '@/types/history';
import type { AnimationConfig } from '@/types/animation';
import styles from './node-detail.module.css';

interface NodeDetailProps {
  data: HistoryNodeData | null;
  onCommitEdit: (editedData: Omit<HistoryNodeData, 'timestamp'>) => void;
}

function validateConfig(jsonStr: string): { valid: boolean; error?: string; config?: AnimationConfig } {
  try {
    const parsed = JSON.parse(jsonStr);
    if (!parsed || typeof parsed !== 'object') {
      return { valid: false, error: '配置必须是 JSON 对象' };
    }
    if (!Array.isArray(parsed.tracks)) {
      return { valid: false, error: '配置必须包含 tracks 数组' };
    }
    return { valid: true, config: parsed as AnimationConfig };
  } catch (e) {
    return { valid: false, error: `JSON 解析失败: ${(e as Error).message}` };
  }
}

export function NodeDetail({ data, onCommitEdit }: NodeDetailProps) {
  const [editState, setEditState] = useState({
    config: '',
    label: '',
    error: null as string | null,
  });

  useEffect(() => {
    if (data) {
      setEditState({
        config: JSON.stringify(data.config, null, 2),
        label: data.label,
        error: null,
      });
    }
  }, [data]);

  if (!data) {
    return <div className={styles.empty}>Select a node to view details</div>;
  }

  const handleSave = () => {
    const validation = validateConfig(editState.config);
    if (!validation.valid || !validation.config) {
      setEditState((prev) => ({ ...prev, error: validation.error ?? '校验失败' }));
      return;
    }
    setEditState((prev) => ({ ...prev, error: null }));
    onCommitEdit({
      config: validation.config,
      label: editState.label,
      source: 'manual',
      messages: [],
      customDom: data.customDom ?? null,
      customStyle: data.customStyle ?? null,
    });
  };

  const handleRestore = () => {
    setEditState({
      config: JSON.stringify(data.config, null, 2),
      label: data.label,
      error: null,
    });
  };

  return (
    <div className={styles.detail}>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="node-label">
          Label
        </label>
        <input
          id="node-label"
          className={styles.input}
          value={editState.label}
          onChange={(e) => setEditState((prev) => ({ ...prev, label: e.target.value }))}
          aria-label="节点标签"
        />
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="node-config">
          Config
        </label>
        <textarea
          id="node-config"
          className={styles.textarea}
          rows={12}
          value={editState.config}
          onChange={(e) => setEditState((prev) => ({ ...prev, config: e.target.value }))}
          aria-label="节点配置 JSON"
        />
      </div>

      {editState.error && <div className={styles.error}>{editState.error}</div>}

      <div className={styles.actions}>
        <button type="button" className={styles.button} onClick={handleSave}>
          保存
        </button>
        <button type="button" className={styles.buttonSecondary} onClick={handleRestore}>
          恢复
        </button>
      </div>

      <div className={styles.meta}>
        <span>Source: {data.source}</span>
        <span>Time: {new Date(data.timestamp).toLocaleTimeString()}</span>
      </div>

      <details className={styles.collapsibleSection}>
        <summary className={styles.collapsibleHeader}>DOM</summary>
        {data.customDom && <pre className={styles.codeBlock}>{data.customDom}</pre>}
      </details>

      <details className={styles.collapsibleSection}>
        <summary className={styles.collapsibleHeader}>Style</summary>
        {data.customStyle && <pre className={styles.codeBlock}>{data.customStyle}</pre>}
      </details>
    </div>
  );
}
