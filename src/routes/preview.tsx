import { useEffect, useRef, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { PreviewCanvas, type PreviewCanvasHandle } from '@/components/preview/preview-canvas';
import { AnimationPlayer } from '@/libs/animation-sdk';
import { createChildBridge } from '@/utils/iframe-bridge';
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
  const [progressMs, setProgressMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    const player = new AnimationPlayer({ autoPlay: true });
    playerRef.current = player;

    const bridge = createChildBridge();

    const unsubComplete = player.on('complete', () => {
      bridge.emit('preview', 'animation-complete');
      setProgressMs(player.getDuration());
      setIsPlaying(false);
      logger.debug('routes.preview.anim-complete', 'Animation completed');
    });

    const unsubProgress = player.on('progress', ({ currentTime, duration }) => {
      if (!isDraggingRef.current) {
        setProgressMs(currentTime);
      }
      setDurationMs(duration);
      setIsPlaying(player.isPlaying);
    });

    const unsubConfig = bridge.on<UpdateConfigPayload>('preview', 'update-config', (payload) => {
      setConfig(payload.config);
    });

    const unsubDom = bridge.on<UpdateDomPayload>('preview', 'update-dom', (payload) => {
      setCustomDom(payload.customDom);
      setCustomStyle(payload.customStyle);
    });

    bridge.emit('preview', 'ready');
    logger.info('routes.preview.init', 'Preview page ready');

    return () => {
      unsubComplete();
      unsubProgress();
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
      setProgressMs(0);
      setIsPlaying(true);
    }
  };

  const handlePlayPause = () => {
    const player = playerRef.current;
    if (!player) {
      return;
    }
    if (player.isPlaying) {
      player.pauseAll();
      setIsPlaying(false);
    } else {
      player.playAll();
      setIsPlaying(true);
    }
  };

  const handleStepBackward = () => {
    const player = playerRef.current;
    if (!player) {
      return;
    }
    const currentTime = player.getCurrentTime();
    const newTime = Math.max(0, currentTime - 10);
    player.seek(newTime);
    setProgressMs(newTime);
  };

  const handleStepForward = () => {
    const player = playerRef.current;
    if (!player) {
      return;
    }
    const currentTime = player.getCurrentTime();
    const duration = player.getDuration();
    const newTime = Math.min(duration, currentTime + 10);
    player.seek(newTime);
    setProgressMs(newTime);
  };

  const handleProgressChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number.parseFloat(event.target.value);
    setProgressMs(value);
    const player = playerRef.current;
    if (player) {
      player.seek(value);
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
      <div className={styles.progressSection}>
        <span className={styles.timeDisplay}>{Math.round(progressMs)}ms</span>
        <input
          type="range"
          className={styles.progressBar}
          min={0}
          max={durationMs}
          step={1}
          value={progressMs}
          aria-label="动画进度"
          onMouseDown={() => {
            isDraggingRef.current = true;
          }}
          onChange={handleProgressChange}
          onMouseUp={() => {
            isDraggingRef.current = false;
          }}
        />
        <span className={styles.timeDisplay}>{Math.round(durationMs)}ms</span>
      </div>
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.controlButton}
          onClick={handlePlayPause}
          disabled={config.tracks.length === 0}
        >
          {isPlaying ? '暂停' : '播放'}
        </button>
        <button
          type="button"
          className={styles.controlButton}
          onClick={handleReplay}
          disabled={config.tracks.length === 0}
        >
          重播
        </button>
        <button
          type="button"
          className={styles.controlButton}
          onClick={handleStepBackward}
          disabled={config.tracks.length === 0}
          aria-label="后退10ms"
        >
          -10ms
        </button>
        <button
          type="button"
          className={styles.controlButton}
          onClick={handleStepForward}
          disabled={config.tracks.length === 0}
          aria-label="前进10ms"
        >
          +10ms
        </button>
      </div>
    </div>
  );
}

export const Route = createFileRoute('/preview')({
  component: PreviewPage,
});
