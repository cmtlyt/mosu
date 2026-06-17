import type { AnimationTrack } from '@/types/animation';
import { logger } from '@/libs/logger';
import type { AnimationHandleImpl } from './handle';
import { AnimationHandleImpl as HandleImpl } from './handle';
import type { EventEmitter } from './events';

/**
 * 创建单个轨道的 WAAPI 动画
 *
 * @param container DOM 容器
 * @param track 动画轨道配置
 * @param emitter 事件发射器
 * @param missingTargets 已报告过的缺失目标集合（避免重复日志）
 * @returns 动画句柄，失败返回 null
 */
export function createTrackAnimation(
  container: HTMLElement,
  track: AnimationTrack,
  emitter: EventEmitter,
  missingTargets: Set<string>,
): AnimationHandleImpl | null {
  if (!track.keyframes || track.keyframes.length === 0) {
    logger.warn('libs.animation-sdk.player.apply-track', `Track "${track.id}" has empty keyframes, skipping`);
    emitter.emit('error', { trackId: track.id, error: new Error('Empty keyframes') });
    return null;
  }

  if (!track.options || typeof track.options.duration !== 'number' || track.options.duration < 0) {
    logger.warn('libs.animation-sdk.player.apply-track', `Track "${track.id}" has invalid duration, skipping`);
    emitter.emit('error', { trackId: track.id, error: new Error('Invalid duration') });
    return null;
  }

  const element = container.querySelector(track.target);
  if (!element) {
    if (!missingTargets.has(track.target)) {
      logger.warn('libs.animation-sdk.player.apply-track', `Target not found: ${track.target} for track "${track.id}"`);
      emitter.emit('target-missing', { selector: track.target, trackId: track.id });
      missingTargets.add(track.target);
    }
    return null;
  }

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

    return new HandleImpl(track.id, track.target, animation);
  } catch (error) {
    logger.error('libs.animation-sdk.player.apply-track', `Failed to animate track "${track.id}"`, error);
    emitter.emit('error', {
      trackId: track.id,
      error: error instanceof Error ? error : new Error(String(error)),
    });
    return null;
  }
}

/**
 * 监听所有 handle 的完成状态，全部完成后触发 complete 事件
 *
 * @param handles 动画句柄列表
 * @param emitter 事件发射器
 * @param isDestroyed 是否已销毁
 * @param onComplete 完成后的回调（停止进度追踪等）
 */
export function trackAllCompletion(
  handles: readonly AnimationHandleImpl[],
  emitter: EventEmitter,
  isDestroyed: () => boolean,
  onComplete: () => void,
): void {
  const finishedPromises = handles.map((handle) =>
    handle.finished.catch(() => {
      // 动画被取消时 finished 会 reject，视为完成
    }),
  );

  Promise.allSettled(finishedPromises).then(() => {
    if (isDestroyed()) {
      return;
    }
    onComplete();
    emitter.emit('complete');
  });
}

/**
 * 监听容器 DOM 变化，自动取消被移除元素的动画
 *
 * @param container DOM 容器
 * @param observerMap 已有的 observer 映射（避免重复创建）
 * @param getHandles 获取当前 handles
 * @param setHandles 更新 handles
 * @param emitter 事件发射器
 * @param isDestroyed 是否已销毁
 */
export function observeContainer(
  container: HTMLElement,
  observerMap: Map<HTMLElement, MutationObserver>,
  getHandles: () => AnimationHandleImpl[],
  setHandles: (handles: AnimationHandleImpl[]) => void,
  emitter: EventEmitter,
  isDestroyed: () => boolean,
): void {
  if (observerMap.has(container)) {
    return;
  }

  const observer = new MutationObserver((mutations) => {
    if (isDestroyed()) {
      return;
    }

    let changed = false;
    for (const mutation of mutations) {
      for (const removedNode of mutation.removedNodes) {
        if (!(removedNode instanceof HTMLElement)) {
          continue;
        }

        const affectedHandles = getHandles().filter((handle) => {
          const element = container.querySelector(handle.target);
          return !element || removedNode === element || removedNode.contains(element);
        });

        for (const handle of affectedHandles) {
          handle.cancel();
          emitter.emit('track-complete', { trackId: handle.id });
          changed = true;
        }
      }
    }

    if (changed) {
      const remainingHandles = getHandles().filter((handle) => {
        const element = container.querySelector(handle.target);
        return element !== null;
      });
      setHandles(remainingHandles);

      if (remainingHandles.length === 0) {
        emitter.emit('complete');
      }
    }
  });

  observer.observe(container, { childList: true, subtree: true });
  observerMap.set(container, observer);
}

/**
 * 启动进度追踪（requestAnimationFrame 循环）
 *
 * @param getCurrentTime 获取当前播放时间
 * @param getDuration 获取总时长
 * @param isPlaying 是否正在播放
 * @param isDestroyed 是否已销毁
 * @param onProgress 进度回调
 * @returns RAF ID，用于后续取消
 */
export function startProgressTracking(
  getCurrentTime: () => number,
  getDuration: () => number,
  isPlaying: () => boolean,
  isDestroyed: () => boolean,
  onProgress: (data: { currentTime: number; duration: number; percent: number }) => void,
): number {
  let rafId = -1;
  const tick = (): void => {
    if (!isPlaying() || isDestroyed()) {
      return;
    }
    const currentTime = getCurrentTime();
    const duration = getDuration();
    const percent = duration > 0 ? currentTime / duration : 0;
    onProgress({ currentTime, duration, percent });
    if (currentTime < duration) {
      rafId = requestAnimationFrame(tick);
    } else {
      rafId = -1;
    }
  };
  rafId = requestAnimationFrame(tick);
  return rafId;
}
