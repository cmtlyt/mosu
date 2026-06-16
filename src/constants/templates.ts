import type { AnimationConfig } from '@/types/animation';

export const DEFAULT_PREVIEW_DOM =
  '<div class="animate-target" style="width:100px;height:100px;background:#4f86f7;border-radius:8px;"></div>';

export function createInitialConfig(animationId: string): AnimationConfig {
  return {
    version: '1.0',
    id: animationId,
    name: '未命名动画',
    tracks: [
      {
        id: 'track-1',
        target: '.animate-target',
        keyframes: [
          { offset: 0, opacity: 0, transform: 'scale(0.8)' },
          { offset: 1, opacity: 1, transform: 'scale(1)' },
        ],
        options: { duration: 1000, easing: 'ease-out', fillMode: 'forwards' },
      },
    ],
  };
}
