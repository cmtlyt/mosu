import { useRef, useState } from 'react';
import type { AnimationConfig } from '@/types/animation';
import { useAnimationPlayer } from '@/hooks/use-animation-player';
import { PreviewCanvas, type PreviewCanvasHandle } from '@/components/preview/preview-canvas';
import { CustomDomPanel } from './custom-dom-panel';
import styles from './preview-panel.module.css';

interface PreviewPanelProps {
  config: AnimationConfig;
  customDom: string | null;
  customStyle: string | null;
  onCustomChange: (dom: string | null, style: string | null) => void;
}

export function PreviewPanel({ config, customDom, customStyle, onCustomChange }: PreviewPanelProps) {
  const player = useAnimationPlayer();
  const canvasRef = useRef<PreviewCanvasHandle>(null);
  const [showCustomPanel, setShowCustomPanel] = useState(false);

  const handleReplay = () => {
    const container = canvasRef.current?.getContainer();
    if (container) {
      player.applyAndPlay(container, config);
    }
  };

  return (
    <div className={styles.previewPanel}>
      <div className={styles.header}>
        <span>预览</span>
        <button type="button" className={styles.toggleButton} onClick={() => setShowCustomPanel((prev) => !prev)}>
          {showCustomPanel ? '收起自定义' : '自定义 DOM/Style'}
        </button>
      </div>
      {showCustomPanel && <CustomDomPanel customDom={customDom} customStyle={customStyle} onApply={onCustomChange} />}
      <div className={styles.canvasWrapper}>
        <PreviewCanvas
          ref={canvasRef}
          config={config}
          customDom={customDom}
          customStyle={customStyle}
          player={player}
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
