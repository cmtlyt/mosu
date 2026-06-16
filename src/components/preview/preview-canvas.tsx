import { useRef, useLayoutEffect, useImperativeHandle, forwardRef } from 'react';
import type { AnimationConfig } from '@/types/animation';
import type { UseAnimationPlayerReturn } from '@/hooks/use-animation-player';
import { logger } from '@/libs/logger';
import styles from './preview-canvas.module.css';

export interface PreviewCanvasHandle {
  getContainer: () => HTMLDivElement | null;
}

interface PreviewCanvasProps {
  config: AnimationConfig;
  customDom: string | null;
  customStyle: string | null;
  player: UseAnimationPlayerReturn;
}

export const PreviewCanvas = forwardRef<PreviewCanvasHandle, PreviewCanvasProps>(
  ({ config, customDom, customStyle, player }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const styleTagRef = useRef<HTMLStyleElement | null>(null);
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

      if (customDom) {
        containerRef.current.innerHTML = customDom;
      } else {
        containerRef.current.innerHTML = '';
      }

      if (customStyle) {
        if (styleTagRef.current) {
          styleTagRef.current.remove();
        }
        const newStyleTag = document.createElement('style');
        newStyleTag.textContent = customStyle;
        containerRef.current.prepend(newStyleTag);
        styleTagRef.current = newStyleTag;
      } else if (styleTagRef.current) {
        styleTagRef.current.remove();
        styleTagRef.current = null;
      }

      logger.info('components.preview-canvas.effect', `DOM set, tracks: ${config.tracks.length}`);

      if (config.tracks.length > 0 && containerRef.current.children.length > 0) {
        const targetEl = containerRef.current.querySelector(config.tracks[0].target);
        logger.info('components.preview-canvas.effect', `Target element found: ${!!targetEl}`);
        playerRef.current.applyAndPlay(containerRef.current, config);
      }
    }, [config, customDom, customStyle]);

    return (
      <div className={styles.canvas}>
        <div ref={containerRef} className={styles.target}>
          {!customDom && config.tracks.length === 0 && <span className={styles.placeholder}>暂无预览内容</span>}
        </div>
      </div>
    );
  },
);
