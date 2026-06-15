import type { AnimationConfig } from '@/types/animation';

export interface PresetTemplate {
  name: string;
  description: string;
  defaultConfig: AnimationConfig;
}

export function createInitialConfig(animationId: string): AnimationConfig {
  return {
    version: '1.0',
    id: animationId,
    name: 'Untitled Animation',
    tracks: [],
  };
}

export const PRESET_TEMPLATES: PresetTemplate[] = [
  {
    name: 'Fade In',
    description: 'Simple fade-in animation',
    defaultConfig: {
      version: '1.0',
      id: '',
      name: 'Fade In',
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
    name: 'Slide Up',
    description: 'Slide up with fade-in',
    defaultConfig: {
      version: '1.0',
      id: '',
      name: 'Slide Up',
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
