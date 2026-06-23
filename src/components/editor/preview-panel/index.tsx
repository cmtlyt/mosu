import { useRef, useEffect, useCallback, useState } from 'react';
import type { AnimationConfig } from '@lib/animation-sdk';
import { createParentBridge } from '@/utils/iframe-bridge';
import { dispatchEditorEvent, EDITOR_EVENTS } from '@/utils/editor/event-bus';
import { logger } from '@lib/logger';
import styles from './index.module.css';

interface PreviewPanelProps {
  config: AnimationConfig;
  customDom: string | null;
  customStyle: string | null;
}

/** 缓存的最新状态，用于 iframe 未就绪时暂存 */
interface PendingState {
  config: AnimationConfig;
  customDom: string | null;
  customStyle: string | null;
}

export function PreviewPanel({ config, customDom, customStyle }: PreviewPanelProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const bridgeRef = useRef<ReturnType<typeof createParentBridge> | null>(null);
  const isReadyRef = useRef(false);
  const pendingStateRef = useRef<PendingState | null>(null);
  const [iframeError, setIframeError] = useState(false);

  // 始终更新缓存，确保 ready 时能同步最新状态
  useEffect(() => {
    pendingStateRef.current = { config, customDom, customStyle };
  }, [config, customDom, customStyle]);

  // 初始化 bridge
  useEffect(() => {
    if (!iframeRef.current) {
      return;
    }
    const bridge = createParentBridge(iframeRef.current);
    bridgeRef.current = bridge;

    const unsubReady = bridge.on('preview', 'ready', () => {
      isReadyRef.current = true;
      logger.info('components.preview-panel.ready', 'Preview iframe is ready');
      // 使用缓存的最新状态同步，避免闭包过期
      const pending = pendingStateRef.current;
      if (pending) {
        bridge.emit('preview', 'update-config', { config: pending.config });
        bridge.emit('preview', 'update-dom', { customDom: pending.customDom, customStyle: pending.customStyle });
      }
    });

    const unsubError = bridge.on<{ message: string }>('preview', 'error', (payload) => {
      logger.error('components.preview-panel.error', payload.message, new Error(payload.message));
      dispatchEditorEvent(EDITOR_EVENTS.MESSAGE, { text: payload.message, type: 'error' });
    });

    const unsubAnimComplete = bridge.on('preview', 'animation-complete', () => {
      logger.debug('components.preview-panel.anim-complete', 'Animation completed');
    });

    return () => {
      unsubReady();
      unsubError();
      unsubAnimComplete();
      bridge.destroy();
      bridgeRef.current = null;
    };
  }, []);

  // 当 props 变化且 iframe 已就绪时，通过 bridge 推送
  useEffect(() => {
    const bridge = bridgeRef.current;
    if (!bridge || !isReadyRef.current) {
      return;
    }
    bridge.emit('preview', 'update-config', { config });
    bridge.emit('preview', 'update-dom', { customDom, customStyle });
  }, [config, customDom, customStyle]);

  const handleReload = useCallback(() => {
    setIframeError(false);
    isReadyRef.current = false;
    if (iframeRef.current) {
      iframeRef.current.src = '#/preview';
    }
  }, []);

  const handleIframeError = useCallback(() => {
    logger.error(
      'components.preview-panel.iframe-error',
      'Failed to load preview iframe',
      new Error('iframe load failed'),
    );
    setIframeError(true);
  }, []);

  if (iframeError) {
    return (
      <div className={styles.previewPanel}>
        <div className={styles.errorFallback}>
          <p>预览加载失败</p>
          <button type="button" className={styles.reloadButton} onClick={handleReload}>
            重新加载
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.previewPanel}>
      <div className={styles.canvasWrapper}>
        <iframe
          ref={iframeRef}
          src="#/preview"
          className={styles.iframe}
          title="动画预览"
          sandbox="allow-scripts allow-same-origin"
          onError={handleIframeError}
        />
      </div>
    </div>
  );
}
