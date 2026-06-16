import type { AnimationConfig, AnimationTrack } from '@/types/animation';
import { logger } from '@/libs/logger';
import { EventEmitter } from './events';
import { AnimationHandleImpl } from './handle';
import type { AnimationHandle, PlayerOptions, PlayerEventMap, EventHandler, Unsubscribe } from './types';

/**
 * 框架无关的动画播放器
 *
 * 仅依赖 Web Animations API，可在任何浏览器环境中使用。
 * 不依赖任何 UI 框架，可单独打包移植。
 */
export class AnimationPlayer {
  private options: Required<PlayerOptions>;
  private emitter = new EventEmitter();
  private handles: AnimationHandleImpl[] = [];
  private observers = new Map<HTMLElement, MutationObserver>();
  private destroyed = false;
  private progressRafId: number | null = null;
  private completionTracked = false;

  private missingTargets = new Set<string>();

  public constructor(options?: PlayerOptions) {
    this.options = {
      autoPlay: options?.autoPlay ?? true,
      playbackRate: options?.playbackRate ?? 1,
    };
  }

  /** 是否正在播放（从 handles 实时推导） */
  public get isPlaying(): boolean {
    return this.handles.some((handle) => handle.getPlayState() === 'running');
  }

  /**
   * 将动画配置应用到容器元素
   * @returns 所有成功创建的动画句柄
   */
  public apply(container: HTMLElement, config: AnimationConfig): AnimationHandle[] {
    if (this.destroyed) {
      logger.warn('libs.animation-sdk.player.apply', 'Player is destroyed, skipping apply');
      return [];
    }

    // 先清理旧动画
    this.removeAll();
    this.missingTargets.clear();

    const newHandles: AnimationHandleImpl[] = [];

    for (const track of config.tracks) {
      const handle = this.applyTrack(container, track);
      if (handle) {
        newHandles.push(handle);
      }
    }

    this.handles = newHandles;
    this.completionTracked = false;

    // 自动播放
    if (this.options.autoPlay && this.handles.length > 0) {
      this.playAll();
    }

    // 监听 DOM 变化
    this.observeContainer(container);

    return [...this.handles];
  }

  /** 播放所有当前动画 */
  public playAll(): void {
    if (this.destroyed || this.handles.length === 0) {
      return;
    }

    for (const handle of this.handles) {
      handle.play();
    }
    this.startProgressTracking();
    this.completionTracked = false;
    this.trackCompletion();
  }

  /** 暂停所有当前动画 */
  public pauseAll(): void {
    if (this.destroyed) {
      return;
    }
    for (const handle of this.handles) {
      handle.pause();
    }
    this.stopProgressTracking();
  }

  /** 取消本次播放（暂停并重置到起点），保留 handles 以便重播 */
  public cancelAll(): void {
    for (const handle of this.handles) {
      handle.cancel();
    }
    this.stopProgressTracking();
    // cancel 后 WAAPI Animation 被重置，finished Promise 失效，需要重新 track
    this.completionTracked = false;
  }

  /** 彻底移除所有动画，清空 handles 并释放 WAAPI 资源，不可重播 */
  public removeAll(): void {
    for (const handle of this.handles) {
      handle.cancel();
    }
    this.handles = [];
    this.stopProgressTracking();
    this.completionTracked = false;
  }

  /** 重播：seek 到起点并播放 */
  public replay(): void {
    if (this.destroyed || this.handles.length === 0) {
      return;
    }
    this.seek(0);
    this.completionTracked = false;
    this.playAll();
  }

  /** 跳转到指定时间（毫秒），仅在 apply 后有效 */
  public seek(time: number): void {
    if (this.destroyed || this.handles.length === 0) {
      return;
    }
    const duration = this.getDuration();
    const clampedTime = Math.max(0, Math.min(time, duration));
    for (const handle of this.handles) {
      handle.seek(clampedTime);
    }
  }

  /** 设置播放速度倍率（0.5 = 半速，2 = 双倍速） */
  public setPlaybackRate(rate: number): void {
    if (this.destroyed) {
      return;
    }
    this.options.playbackRate = rate;
    for (const handle of this.handles) {
      handle.setPlaybackRate(rate);
    }
    if (rate <= 0 && this.isPlaying) {
      this.pauseAll();
    }
  }

  /** 获取当前播放时间（毫秒），返回所有轨道中最长的当前时间 */
  public getCurrentTime(): number {
    if (this.handles.length === 0) {
      return 0;
    }
    let maxTime = 0;
    for (const handle of this.handles) {
      const currentTime = handle.getCurrentTime();
      if (currentTime > maxTime) {
        maxTime = currentTime;
      }
    }
    return maxTime;
  }

  /** 获取总时长（毫秒），返回所有轨道中最长的持续时间 */
  public getDuration(): number {
    if (this.handles.length === 0) {
      return 0;
    }
    let maxDuration = 0;
    for (const handle of this.handles) {
      const duration = handle.getDuration();
      if (duration > maxDuration) {
        maxDuration = duration;
      }
    }
    return maxDuration;
  }

  /** 获取当前所有动画句柄 */
  public getHandles(): readonly AnimationHandle[] {
    return this.handles;
  }

  /** 注册事件监听 */
  public on<K extends keyof PlayerEventMap>(event: K, handler: EventHandler<PlayerEventMap[K]>): Unsubscribe {
    return this.emitter.on(event, handler);
  }

  /** 销毁播放器，移除所有动画并清理事件监听 */
  public destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.removeAll();
    this.disconnectObservers();
    this.stopProgressTracking();
    this.emitter.destroy();
    this.missingTargets.clear();
    this.destroyed = true;
  }

  private startProgressTracking(): void {
    this.stopProgressTracking();
    const tick = (): void => {
      if (!this.isPlaying || this.destroyed) {
        return;
      }
      const currentTime = this.getCurrentTime();
      const duration = this.getDuration();
      const percent = duration > 0 ? currentTime / duration : 0;
      this.emitter.emit('progress', { currentTime, duration, percent });
      if (currentTime < duration) {
        this.progressRafId = requestAnimationFrame(tick);
      } else {
        this.progressRafId = null;
      }
    };
    this.progressRafId = requestAnimationFrame(tick);
  }

  private stopProgressTracking(): void {
    if (this.progressRafId !== null) {
      cancelAnimationFrame(this.progressRafId);
      this.progressRafId = null;
    }
  }

  private applyTrack(container: HTMLElement, track: AnimationTrack): AnimationHandleImpl | null {
    // 校验必要字段
    if (!track.keyframes || track.keyframes.length === 0) {
      logger.warn('libs.animation-sdk.player.apply-track', `Track "${track.id}" has empty keyframes, skipping`);
      this.emitter.emit('error', { trackId: track.id, error: new Error('Empty keyframes') });
      return null;
    }

    if (!track.options || typeof track.options.duration !== 'number' || track.options.duration < 0) {
      logger.warn('libs.animation-sdk.player.apply-track', `Track "${track.id}" has invalid duration, skipping`);
      this.emitter.emit('error', { trackId: track.id, error: new Error('Invalid duration') });
      return null;
    }

    // 查找目标元素
    const element = container.querySelector(track.target);
    if (!element) {
      if (!this.missingTargets.has(track.target)) {
        logger.warn(
          'libs.animation-sdk.player.apply-track',
          `Target not found: ${track.target} for track "${track.id}"`,
        );
        this.emitter.emit('target-missing', { selector: track.target, trackId: track.id });
        this.missingTargets.add(track.target);
      }
      return null;
    }

    // 构建 WAAPI keyframes
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

      return new AnimationHandleImpl(track.id, track.target, animation);
    } catch (error) {
      logger.error('libs.animation-sdk.player.apply-track', `Failed to animate track "${track.id}"`, error);
      this.emitter.emit('error', {
        trackId: track.id,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      return null;
    }
  }

  private trackCompletion(): void {
    if (this.handles.length === 0 || this.completionTracked) {
      return;
    }
    this.completionTracked = true;

    const finishedPromises = this.handles.map((handle) =>
      handle.finished.catch(() => {
        // 动画被取消时 finished 会 reject，视为完成
      }),
    );

    Promise.allSettled(finishedPromises).then(() => {
      if (this.destroyed) {
        return;
      }
      // Promise.allSettled 已确认所有 finished promise 都已 settled
      this.stopProgressTracking();
      this.emitter.emit('complete');
    });
  }

  private observeContainer(container: HTMLElement): void {
    // 同一 container 只创建一次 observer，后续复用
    if (this.observers.has(container)) {
      return;
    }

    const observer = new MutationObserver((mutations) => {
      if (this.destroyed) {
        return;
      }

      let changed = false;
      for (const mutation of mutations) {
        for (const removedNode of mutation.removedNodes) {
          if (!(removedNode instanceof HTMLElement)) {
            continue;
          }

          const affectedHandles = this.handles.filter((handle) => {
            // 通过 target 选择器重新查找，如果找不到说明元素已被移除
            const element = container.querySelector(handle.target);
            return !element || removedNode === element || removedNode.contains(element);
          });

          for (const handle of affectedHandles) {
            handle.cancel();
            this.emitter.emit('track-complete', { trackId: handle.id });
            changed = true;
          }
        }
      }

      if (changed) {
        // 过滤掉已失效的 handle
        this.handles = this.handles.filter((handle) => {
          const element = container.querySelector(handle.target);
          return element !== null;
        });

        // 所有 handle 都被移除时触发 complete
        if (this.handles.length === 0) {
          this.emitter.emit('complete');
        }
      }
    });

    observer.observe(container, { childList: true, subtree: true });
    this.observers.set(container, observer);
  }

  private disconnectObservers(): void {
    for (const [, observer] of this.observers) {
      observer.disconnect();
    }
    this.observers.clear();
  }
}
