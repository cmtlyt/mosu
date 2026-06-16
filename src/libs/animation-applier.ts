/**
 * @deprecated 请使用 `@/libs/animation-sdk` 中的 `AnimationPlayer` 替代
 * 此文件仅为向后兼容保留，后续版本将移除
 */
import { AnimationPlayer } from '@/libs/animation-sdk';
import type { AnimationConfig } from '@/types/animation';

export interface AnimationControl {
  play: () => void;
  pause: () => void;
  cancel: () => void;
}

export function applyAnimation(container: HTMLElement, config: AnimationConfig): AnimationControl[] {
  const player = new AnimationPlayer({ autoPlay: false });
  const handles = player.apply(container, config);
  return handles.map((handle) => ({
    play: () => handle.play(),
    pause: () => handle.pause(),
    cancel: () => {
      handle.cancel();
      player.destroy();
    },
  }));
}
