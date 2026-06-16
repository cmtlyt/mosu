import type { AnimationConfig } from '@/types/animation';

export interface PresetTemplate {
  name: string;
  description: string;
  html: string;
  defaultConfig: AnimationConfig;
}

const DEFAULT_TARGET_HTML =
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

export const PRESET_TEMPLATES: PresetTemplate[] = [
  {
    name: '淡入',
    description: '简单的淡入动画',
    html: DEFAULT_TARGET_HTML,
    defaultConfig: {
      version: '1.0',
      id: '',
      name: '淡入',
      tracks: [
        {
          id: 'track-1',
          target: '.animate-target',
          keyframes: [
            { offset: 0, opacity: 0 },
            { offset: 1, opacity: 1 },
          ],
          options: { duration: 1000, easing: 'ease-out', fillMode: 'forwards' },
        },
      ],
    },
  },
  {
    name: '上滑',
    description: '向上滑动并淡入',
    html: DEFAULT_TARGET_HTML,
    defaultConfig: {
      version: '1.0',
      id: '',
      name: '上滑',
      tracks: [
        {
          id: 'track-1',
          target: '.animate-target',
          keyframes: [
            { offset: 0, opacity: 0, transform: 'translateY(20px)' },
            { offset: 1, opacity: 1, transform: 'translateY(0)' },
          ],
          options: { duration: 800, easing: 'ease-out', fillMode: 'forwards' },
        },
      ],
    },
  },
];
