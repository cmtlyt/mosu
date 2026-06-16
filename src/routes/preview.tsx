import { useEffect, useRef, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { PreviewCanvas, type PreviewCanvasHandle } from '@/components/preview/preview-canvas';
import { AnimationPlayer } from '@/libs/animation-sdk';
import { createChildBridge } from '@/libs/iframe-bridge';
import { logger } from '@/libs/logger';
import type { AnimationConfig } from '@/types/animation';
import styles from '@/styles/preview.module.css';

interface UpdateConfigPayload {
  config: AnimationConfig;
}

interface UpdateDomPayload {
  customDom: string | null;
  customStyle: string | null;
}

function PreviewPage() {
  const playerRef = useRef<AnimationPlayer | null>(null);
  const canvasRef = useRef<PreviewCanvasHandle>(null);
  const [config, setConfig] = useState<AnimationConfig | null>(null);
  const [customDom, setCustomDom] = useState<string | null>(null);
  const [customStyle, setCustomStyle] = useState<string | null>(null);

  // 初始化 SDK player 和 bridge
  useEffect(() => {
    const player = new AnimationPlayer({ autoPlay: true });
    playerRef.current = player;

    // 初始化 bridge 并注册事件
    const bridge = createChildBridge();

    // 监听完成事件通知父窗口
    const unsubComplete = player.on('complete', () => {
      bridge.emit('preview', 'animation-complete');
      logger.debug('routes.preview.anim-complete', 'Animation completed');
    });

    const unsubConfig = bridge.on<UpdateConfigPayload>('preview', 'update-config', (payload) => {
      setConfig(payload.config);
    });

    const unsubDom = bridge.on<UpdateDomPayload>('preview', 'update-dom', (payload) => {
      setCustomDom(payload.customDom);
      setCustomStyle(payload.customStyle);
    });

    // 通知父窗口预览页已就绪
    bridge.emit('preview', 'ready');
    logger.info('routes.preview.init', 'Preview page ready');

    return () => {
      unsubComplete();
      unsubConfig();
      unsubDom();
      bridge.destroy();
      player.destroy();
      playerRef.current = null;
    };
  }, []);

  const handleReplay = () => {
    const container = canvasRef.current?.getContainer();
    const player = playerRef.current;
    if (container && config && player) {
      player.cancelAll();
      player.apply(container, config);
    }
  };

  if (!config) {
    return <div className={styles.placeholder}>等待编辑器连接...</div>;
  }

  return (
    <div className={styles.previewPage}>
      <div className={styles.canvasWrapper}>
        <PreviewCanvas
          ref={canvasRef}
          config={config}
          customDom={customDom}
          customStyle={customStyle}
          playerRef={playerRef}
        />
      </div>
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.controlButton}
          onClick={handleReplay}
          disabled={config.tracks.length === 0}
        >
          重播
        </button>
      </div>
    </div>
  );
}

export const Route = createFileRoute('/preview')({
  component: PreviewPage,
});
