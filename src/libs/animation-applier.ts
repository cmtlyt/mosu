import { animate, type AnimationPlaybackControls } from 'motion';
import type { AnimationConfig } from '@/types/animation';
import { logger } from '@/libs/logger';

export function applyAnimation(container: HTMLElement, config: AnimationConfig): AnimationPlaybackControls[] {
  const controls: AnimationPlaybackControls[] = [];

  for (const track of config.tracks) {
    const element = container.querySelector(track.target);
    if (!element) {
      logger.warn('libs.animation-applier.apply', `Target not found: ${track.target}`);
      continue;
    }

    const keyframeProperties: Record<string, unknown[]> = {};
    for (const keyframe of track.keyframes) {
      const { offset: _offset, ...properties } = keyframe;
      for (const [key, value] of Object.entries(properties)) {
        if (!keyframeProperties[key]) {
          keyframeProperties[key] = [];
        }
        keyframeProperties[key].push(value);
      }
    }

    const control = animate(element as HTMLElement, keyframeProperties, {
      duration: track.options.duration / 1000,
      delay: track.options.delay ? track.options.delay / 1000 : undefined,
      easing: track.options.easing,
      repeat: track.options.iterations === 'Infinity' ? Infinity : (track.options.iterations ?? 1) - 1,
      direction: track.options.direction,
      fillMode: track.options.fillMode,
    } as Parameters<typeof animate>[2]);

    controls.push(control);
  }

  return controls;
}
