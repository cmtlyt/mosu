import { useState, useRef, useCallback, useEffect } from 'react';
import type { AnimationPlaybackControls } from 'motion';
import type { AnimationConfig } from '@/types/animation';
import { applyAnimation } from '@/libs/animation-applier';

interface UseAnimationPlayerReturn {
  play: () => void;
  pause: () => void;
  isPlaying: boolean;
  applyAndPlay: (container: HTMLElement, config: AnimationConfig) => void;
}

export function useAnimationPlayer(): UseAnimationPlayerReturn {
  const animationsRef = useRef<AnimationPlaybackControls[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);

  const stopAll = useCallback(() => {
    for (const animation of animationsRef.current) {
      animation.cancel();
    }
    animationsRef.current = [];
    setIsPlaying(false);
  }, []);

  const play = useCallback(() => {
    for (const animation of animationsRef.current) {
      animation.play();
    }
    setIsPlaying(true);
  }, []);

  const pause = useCallback(() => {
    for (const animation of animationsRef.current) {
      animation.pause();
    }
    setIsPlaying(false);
  }, []);

  const applyAndPlay = useCallback(
    (container: HTMLElement, config: AnimationConfig) => {
      stopAll();
      const animations = applyAnimation(container, config);
      animationsRef.current = animations;
      setIsPlaying(true);
    },
    [stopAll],
  );

  useEffect(() => () => stopAll(), [stopAll]);

  return { play, pause, isPlaying, applyAndPlay };
}
