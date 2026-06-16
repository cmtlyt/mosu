import type { AnimationConfig } from '@/types/animation';
import { logger } from '@/libs/logger';

export interface AnimationControl {
  play: () => void;
  pause: () => void;
  cancel: () => void;
}

export function applyAnimation(container: HTMLElement, config: AnimationConfig): AnimationControl[] {
  const controls: AnimationControl[] = [];

  for (const track of config.tracks) {
    const element = container.querySelector(track.target);
    if (!element) {
      logger.warn('libs.animation-applier.apply', `Target not found: ${track.target}`);
      continue;
    }

    if (!track.options) {
      logger.warn('libs.animation-applier.apply', `Track "${track.id}" missing options, skipping`);
      continue;
    }

    // 构建标准 WAAPI keyframes 数组
    const keyframesArray = track.keyframes.map((keyframe) => {
      const { offset, ...properties } = keyframe;
      return { offset, ...properties } as Keyframe;
    });

    try {
      const animation = (element as HTMLElement).animate(keyframesArray, {
        duration: track.options.duration,
        delay: track.options.delay ?? 0,
        easing: track.options.easing ?? 'ease',
        iterations: track.options.iterations === 'Infinity' ? Infinity : (track.options.iterations ?? 1),
        direction: track.options.direction ?? 'normal',
        fill: track.options.fillMode ?? 'none',
      });

      controls.push({
        play: () => animation.play(),
        pause: () => animation.pause(),
        cancel: () => animation.cancel(),
      });
    } catch (error) {
      logger.error('libs.animation-applier.apply', `Failed to animate track "${track.id}"`, error);
    }
  }

  return controls;
}
