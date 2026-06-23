import { useState, useCallback, useRef } from 'react';
import { Link } from '@tanstack/react-router';
import type { AnimationConfig } from '@lib/animation-sdk';
import { LocalhostServerTemplate } from '@/components/editor/localhost-server-template';
import { AnimationGuide } from '@/components/editor/animation-guide';
import { exportProjectToFile, importProjectFromFile, encodeConfigToQuery } from '@/utils/editor/share-utils';
import { dispatchEditorEvent, EDITOR_EVENTS } from '@/utils/editor/event-bus';
import { logger } from '@lib/logger';
import styles from './index.module.css';

const AI_MODE_KEY = 'mosu_ai_mode';
const AI_BASE_URL_KEY = 'mosu_ai_base_url';

type AiMode = 'webllm' | 'api';
type AiConfigTab = 'config' | 'server';

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

  const [activeAiTab, setActiveAiTab] = useState<AiConfigTab>('config');
  const [aiMode, setAiMode] = useState<AiMode>(() => (localStorage.getItem(AI_MODE_KEY) as AiMode) ?? 'webllm');
  const [apiBaseUrl, setApiBaseUrl] = useState(() => localStorage.getItem(AI_BASE_URL_KEY) ?? '');

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

  const handleSaveAiConfig = useCallback(() => {
    localStorage.setItem(AI_MODE_KEY, aiMode);
    if (aiMode === 'api') {
      localStorage.setItem(AI_BASE_URL_KEY, apiBaseUrl);
    }
    logger.info('editor.toolbar.aiConfig', `AI mode saved: ${aiMode}`);
    dispatchEditorEvent(EDITOR_EVENTS.MESSAGE, { text: 'AI 配置已保存', type: 'success' });
  }, [aiMode, apiBaseUrl]);

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
            AI 配置
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
          <h2>AI 配置</h2>
          <button type="button" onClick={() => aiConfigDialogRef.current?.close()}>
            ×
          </button>
        </div>

        <div className={styles.aiConfigTabs}>
          <button
            type="button"
            className={`${styles.aiConfigTab} ${activeAiTab === 'config' ? styles.aiConfigTabActive : ''}`}
            onClick={() => setActiveAiTab('config')}
          >
            AI 配置
          </button>
          <button
            type="button"
            className={`${styles.aiConfigTab} ${activeAiTab === 'server' ? styles.aiConfigTabActive : ''}`}
            onClick={() => setActiveAiTab('server')}
          >
            Localhost AI Server
          </button>
        </div>

        <div className={styles.aiConfigContent}>
          {activeAiTab === 'config' ? (
            <form
              method="dialog"
              className={styles.aiConfigForm}
              onSubmit={(event) => {
                const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
                if (submitter?.value === 'confirm') {
                  handleSaveAiConfig();
                }
              }}
            >
              <fieldset>
                <legend>调用方式</legend>
                <label>
                  <input
                    type="radio"
                    name="aiMode"
                    value="webllm"
                    checked={aiMode === 'webllm'}
                    onChange={() => setAiMode('webllm')}
                    aria-label="WebLLM 浏览器端推理"
                  />
                  WebLLM（浏览器端推理）
                </label>
                <label>
                  <input
                    type="radio"
                    name="aiMode"
                    value="api"
                    checked={aiMode === 'api'}
                    onChange={() => setAiMode('api')}
                    aria-label="API 调用 OpenAI 兼容格式"
                  />
                  API 调用（OpenAI 兼容格式）
                </label>
              </fieldset>

              {aiMode === 'api' && (
                <>
                  <label className={styles.aiConfigUrlLabel}>
                    API Base URL
                    <input
                      type="url"
                      value={apiBaseUrl}
                      onChange={(event) => setApiBaseUrl(event.target.value)}
                      placeholder="http://localhost:3001/v1"
                      aria-label="API Base URL"
                    />
                  </label>
                  <p className={styles.aiConfigHint}>
                    请勿直接填写官方 API 地址（如 OpenAI），因为需要在前端暴露 API Key，存在安全风险。建议使用
                    "Localhost AI Server" 标签页中的模板搭建本地代理，通过代理转发请求以保护密钥安全。
                  </p>
                </>
              )}

              <div className={styles.aiConfigActions}>
                <button type="submit" value="cancel">
                  取消
                </button>
                <button type="submit" value="confirm">
                  保存
                </button>
              </div>
            </form>
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
