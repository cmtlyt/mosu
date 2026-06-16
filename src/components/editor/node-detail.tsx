import type { HistoryNodeData } from '@/types/history';
import styles from './node-detail.module.css';

interface NodeDetailProps {
  data: HistoryNodeData | null;
}

export function NodeDetail({ data }: NodeDetailProps) {
  if (!data) {
    return <div className={styles.empty}>Select a node to view details</div>;
  }

  return (
    <div className={styles.detail}>
      <h3 className={styles.label}>{data.label}</h3>
      <div className={styles.meta}>
        <span>Source: {data.source}</span>
        <span>Time: {new Date(data.timestamp).toLocaleTimeString()}</span>
      </div>
      <div className={styles.detailPreview}>
        <h4>Config</h4>
        <pre>{JSON.stringify(data.config, null, 2)}</pre>
        {data.customDom && (
          <>
            <h4>DOM</h4>
            <pre className={styles.codeBlock}>{data.customDom}</pre>
          </>
        )}
        {data.customStyle && (
          <>
            <h4>Style</h4>
            <pre className={styles.codeBlock}>{data.customStyle}</pre>
          </>
        )}
      </div>
    </div>
  );
}
