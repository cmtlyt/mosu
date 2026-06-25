import { useState, useCallback, useRef } from 'react';
import { Link } from '@tanstack/react-router';
import type { AnimationConfig } from '@lib/animation-sdk';
import { LocalhostServerTemplate } from '@/components/editor/localhost-server-template';
import { AnimationGuide } from '@/components/editor/animation-guide';
import { ApiConfigForm, saveApiConfigToStorage } from '@/components/api-config-form';
import { exportProjectToFile, importProjectFromFile, encodeConfigToQuery } from '@/utils/editor/share-utils';
import { dispatchEditorEvent, EDITOR_EVENTS } from '@/utils/editor/event-bus';
import { logger } from '@lib/logger';
import styles from './index.module.css';

type ConfigTab = 'config' | 'localhost';

interface EditorToolbarProps {
  currentConfig: AnimationConfig;
  currentDom: string | null;
  currentStyle: string | null;
  onImport: (config: AnimationConfig, customDom: string | null, customStyle: string | null) => void;
}

export function EditorToolbar({ currentConfig, currentDom, currentStyle, onImport }: EditorToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const aiConfigDialogRef = useRef<HTMLDialogElement>(null);
  const animationGuideDialogRef = useRef<HTMLDialogElement>(null);

  const [activeTab, setActiveTab] = useState<ConfigTab>('config');

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleImportFile = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      const projectData = await importProjectFromFile(file);
      if (projectData) {
        onImport(projectData.config, projectData.customDom, projectData.customStyle);
      }
      event.target.value = '';
    },
    [onImport],
  );

  const handleExport = useCallback(() => {
    exportProjectToFile({ config: currentConfig, customDom: currentDom, customStyle: currentStyle });
  }, [currentConfig, currentDom, currentStyle]);

  const handleShare = useCallback(() => {
    const query = encodeConfigToQuery({ config: currentConfig, customDom: currentDom, customStyle: currentStyle });
    if (!query) {
      dispatchEditorEvent(EDITOR_EVENTS.MESSAGE, { text: '生成分享链接失败', type: 'error' });
      return;
    }
    const shareUrl = `${globalThis.location.origin}${import.meta.env.BASE_URL}#/preview?${query}`;
    navigator.clipboard.writeText(shareUrl).then(
      () => {
        logger.info('editor.toolbar.share', 'Share URL copied to clipboard');
        dispatchEditorEvent(EDITOR_EVENTS.MESSAGE, { text: '分享链接已复制到剪贴板', type: 'success' });
      },
      () => {
        dispatchEditorEvent(EDITOR_EVENTS.MESSAGE, { text: '复制链接失败，请手动复制地址栏链接', type: 'error' });
      },
    );
  }, [currentConfig, currentDom, currentStyle]);

  const handleOpenAiConfig = useCallback(() => {
    aiConfigDialogRef.current?.showModal();
  }, []);

  const handleSaveConfig = useCallback(
    (config: { aiMode: 'mosu' | 'api'; serverBaseUrl: string; aiBaseUrl: string; aiApiKey: string }) => {
      saveApiConfigToStorage(config);
      logger.info('editor.toolbar.config', `Config saved: aiMode=${config.aiMode}`);
      dispatchEditorEvent(EDITOR_EVENTS.MESSAGE, { text: '配置已保存', type: 'success' });
      aiConfigDialogRef.current?.close();
    },
    [],
  );

  const handleOpenAnimationGuide = useCallback(() => {
    animationGuideDialogRef.current?.showModal();
  }, []);

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <h1 className={styles.toolbarTitle}>Mosu Editor</h1>
          <nav className={styles.toolbarNav}>
            <Link to="/" className={styles.navLink}>
              首页
            </Link>
            <Link to="/editor" className={styles.navLink} activeProps={{ className: styles.navLinkActive }}>
              编辑器
            </Link>
          </nav>
        </div>
        <div className={styles.toolbarActions}>
          <button type="button" className={styles.toolbarButton} onClick={handleImportClick}>
            导入
          </button>
          <button type="button" className={styles.toolbarButton} onClick={handleExport}>
            导出
          </button>
          <button type="button" className={styles.toolbarButton} onClick={handleShare}>
            分享
          </button>
          <button type="button" className={styles.toolbarButton} onClick={handleOpenAiConfig}>
            API 配置
          </button>
          <button type="button" className={styles.toolbarButton} onClick={handleOpenAnimationGuide}>
            应用动画
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className={styles.hiddenInput}
            onChange={handleImportFile}
            aria-label="导入动画配置文件"
          />
        </div>
      </div>

      <dialog ref={aiConfigDialogRef} className={styles.aiConfigDialog}>
        <div className={styles.aiConfigHeader}>
          <h2>API 配置</h2>
          <button type="button" onClick={() => aiConfigDialogRef.current?.close()}>
            ×
          </button>
        </div>

        <div className={styles.aiConfigTabs}>
          <button
            type="button"
            className={`${styles.aiConfigTab} ${activeTab === 'config' ? styles.aiConfigTabActive : ''}`}
            onClick={() => setActiveTab('config')}
          >
            API 配置
          </button>
          <button
            type="button"
            className={`${styles.aiConfigTab} ${activeTab === 'localhost' ? styles.aiConfigTabActive : ''}`}
            onClick={() => setActiveTab('localhost')}
          >
            Localhost AI Server
          </button>
        </div>

        <div className={styles.aiConfigContent}>
          {activeTab === 'config' ? (
            <ApiConfigForm
              onSave={handleSaveConfig}
              submitButtonText="保存"
              showCancelButton
              onCancel={() => aiConfigDialogRef.current?.close()}
            />
          ) : (
            <LocalhostServerTemplate />
          )}
        </div>
      </dialog>

      <dialog ref={animationGuideDialogRef} className={styles.animationGuideDialog}>
        <div className={styles.animationGuideHeader}>
          <h2>应用动画</h2>
          <button type="button" onClick={() => animationGuideDialogRef.current?.close()}>
            ×
          </button>
        </div>

        <div className={styles.animationGuideContent}>
          <AnimationGuide config={currentConfig} />
        </div>
      </dialog>
    </>
  );
}
