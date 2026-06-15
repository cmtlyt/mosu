import { useRef, useEffect } from 'react';
import type { AnimationConfig } from '@/types/animation';
import type { PresetTemplate } from '@/constants/templates';
import { useAnimationPlayer } from '@/hooks/use-animation-player';
import styles from './preview-canvas.module.css';

interface PreviewCanvasProps {
  config: AnimationConfig;
  template: PresetTemplate;
}

export function PreviewCanvas({ config, template }: PreviewCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { applyAndPlay } = useAnimationPlayer();

  useEffect(() => {
    if (containerRef.current && config.tracks.length > 0) {
      // 重置 HTML 内容以重新应用动画
      containerRef.current.innerHTML =
        template.defaultConfig.tracks.length > 0
          ? '<div className="animate-target" style="width:100px;height:100px;background:#4f86f7;border-radius:8px;"></div>'
          : '';
      applyAndPlay(containerRef.current, config);
    }
  }, [config, template, applyAndPlay]);

  return (
    <div className={styles.canvas}>
      <div ref={containerRef} className={styles.target}>
        {config.tracks.length === 0 && <span className={styles.placeholder}>No animation tracks</span>}
      </div>
    </div>
  );
}
