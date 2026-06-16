import { useRef, useLayoutEffect, useImperativeHandle, forwardRef } from 'react';
import type { AnimationConfig } from '@/types/animation';
import type { PresetTemplate } from '@/constants/templates';
import type { UseAnimationPlayerReturn } from '@/hooks/use-animation-player';
import { logger } from '@/libs/logger';
import styles from './preview-canvas.module.css';

export interface PreviewCanvasHandle {
  getContainer: () => HTMLDivElement | null;
}

interface PreviewCanvasProps {
  config: AnimationConfig;
  template: PresetTemplate;
  player: UseAnimationPlayerReturn;
}

export const PreviewCanvas = forwardRef<PreviewCanvasHandle, PreviewCanvasProps>(
  ({ config, template, player }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef(player);
    playerRef.current = player;

    useImperativeHandle(ref, () => ({
      getContainer: () => containerRef.current,
    }));

    useLayoutEffect(() => {
      if (!containerRef.current) {
        logger.warn('components.preview-canvas.effect', 'Container ref is null');
        return;
      }

      containerRef.current.innerHTML = template.html;
      logger.info('components.preview-canvas.effect', `DOM set, tracks: ${config.tracks.length}`);

      if (config.tracks.length > 0) {
        const targetEl = containerRef.current.querySelector(config.tracks[0].target);
        logger.info('components.preview-canvas.effect', `Target element found: ${!!targetEl}`);
        playerRef.current.applyAndPlay(containerRef.current, config);
      }
    }, [config, template]);

    return (
      <div className={styles.canvas}>
        <div ref={containerRef} className={styles.target}>
          {config.tracks.length === 0 && <span className={styles.placeholder}>暂无动画轨道</span>}
        </div>
      </div>
    );
  },
);
