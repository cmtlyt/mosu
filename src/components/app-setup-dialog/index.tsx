import { useRef, useCallback, useEffect } from 'react';
import { ApiConfigForm, saveApiConfigToStorage } from '@/components/api-config-form';
import styles from './index.module.css';

interface AppSetupDialogProps {
  onComplete: () => void;
}

export function AppSetupDialog({ onComplete }: AppSetupDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const handleSave = useCallback(() => {
    dialogRef.current?.close();
    onComplete();
  }, [onComplete]);

  return (
    <dialog ref={dialogRef} className={styles.dialog}>
      <div className={styles.header}>
        <h2>欢迎使用 Mosu</h2>
        <p>请先完成 API 配置，以便应用正常使用 AI 功能。</p>
      </div>

      <ApiConfigForm
        onSave={(config) => {
          saveApiConfigToStorage(config);
          handleSave();
        }}
        submitButtonText="确认并进入"
      />
    </dialog>
  );
}
