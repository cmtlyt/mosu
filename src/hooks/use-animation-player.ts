import { useRef, useState, useCallback, useEffect } from 'react';
import { AnimationPlayer } from '@/libs/animation-sdk';
import type { AnimationConfig } from '@/types/animation';

export interface UseAnimationPlayerReturn {
  play: () => void;
  pause: () => void;
  isPlaying: boolean;
  applyAndPlay: (container: HTMLElement, config: AnimationConfig) => void;
}

export function useAnimationPlayer(): UseAnimationPlayerReturn {
  const playerRef = useRef<AnimationPlayer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // 懒初始化，避免 SSR 问题
  if (!playerRef.current) {
    playerRef.current = new AnimationPlayer({ autoPlay: false });
  }

  const player = playerRef.current;

  const play = useCallback(() => {
    player.playAll();
    setIsPlaying(true);
  }, [player]);

  const pause = useCallback(() => {
    player.pauseAll();
    setIsPlaying(false);
  }, [player]);

  const applyAndPlay = useCallback(
    (container: HTMLElement, config: AnimationConfig) => {
      player.cancelAll();
      player.apply(container, config);
      player.playAll();
      setIsPlaying(true);
    },
    [player],
  );

  // 监听 SDK 的 complete 事件同步状态
  useEffect(() => {
    const unsub = player.on('complete', () => setIsPlaying(false));
    return unsub;
  }, [player]);

  // 卸载时销毁
  useEffect(() => () => player.destroy(), [player]);

  return { play, pause, isPlaying, applyAndPlay };
}
