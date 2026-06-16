import { useRef, useLayoutEffect, useEffect, useImperativeHandle, forwardRef } from 'react';
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

    // DOM and style updates should only happen when customDom/customStyle change,
    // NOT when config changes (e.g. viewing different node details).
    useLayoutEffect(() => {
      if (!containerRef.current) {
        logger.warn('components.preview-canvas.dom-effect', 'Container ref is null');
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

      logger.info('components.preview-canvas.dom-effect', 'DOM updated');
    }, [customDom, customStyle]);

    // Animation replay should happen when config changes.
    useEffect(() => {
      if (!containerRef.current || config.tracks.length === 0 || containerRef.current.children.length === 0) {
        return;
      }
      logger.info('components.preview-canvas.anim-effect', `Playing animation, tracks: ${config.tracks.length}`);
      playerRef.current.applyAndPlay(containerRef.current, config);
    }, [config]);

    return (
      <div className={styles.canvas}>
        <div ref={containerRef} className={styles.target}>
          {!customDom && config.tracks.length === 0 && <span className={styles.placeholder}>暂无预览内容</span>}
        </div>
      </div>
    );
  },
);
