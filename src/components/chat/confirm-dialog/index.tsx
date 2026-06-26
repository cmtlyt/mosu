import { memo } from 'react';
import styles from './index.module.css';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog = memo(
  ({ open, title, message, confirmText = '确认', cancelText = '取消', onConfirm, onCancel }: ConfirmDialogProps) => {
    if (!open) {
      return null;
    }

    return (
      <div className={styles.overlay} onClick={onCancel}>
        <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
          <h3 className={styles.title}>{title}</h3>
          <p className={styles.message}>{message}</p>
          <div className={styles.actions}>
            <button type="button" className={styles.cancelButton} onClick={onCancel}>
              {cancelText}
            </button>
            <button type="button" className={styles.confirmButton} onClick={onConfirm}>
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    );
  },
);
