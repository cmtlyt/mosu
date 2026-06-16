import { useRef } from 'react';
import type { AnimationConfig } from '@/types/animation';
import type { PresetTemplate } from '@/constants/templates';
import { useAnimationPlayer } from '@/hooks/use-animation-player';
import { PreviewCanvas, type PreviewCanvasHandle } from '@/components/preview/preview-canvas';
import styles from './preview-panel.module.css';

interface PreviewPanelProps {
  config: AnimationConfig;
  template: PresetTemplate;
  templates: PresetTemplate[];
  onTemplateChange: (template: PresetTemplate) => void;
}

export function PreviewPanel({ config, template, templates, onTemplateChange }: PreviewPanelProps) {
  const player = useAnimationPlayer();
  const canvasRef = useRef<PreviewCanvasHandle>(null);

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
        <select
          className={styles.templateSelect}
          value={template.name}
          onChange={(event) => {
            const selected = templates.find((tpl) => tpl.name === event.target.value);
            if (selected) {
              onTemplateChange(selected);
            }
          }}
        >
          {templates.map((tpl) => (
            <option key={tpl.name} value={tpl.name}>
              {tpl.name}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.canvasWrapper}>
        <PreviewCanvas ref={canvasRef} config={config} template={template} player={player} />
      </div>
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.controlButton}
          onClick={player.isPlaying ? player.pause : player.play}
          disabled={config.tracks.length === 0}
        >
          {player.isPlaying ? '暂停' : '播放'}
        </button>
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
