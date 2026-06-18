import type { AnimationConfig, AnimationTrack } from '@/types/animation';
import { EventEmitter } from './events';
import type { AnimationHandleImpl } from './handle';
import type { AnimationHandle, PlayerOptions, PlayerEventMap, EventHandler, Unsubscribe } from './types';
import { resolveTriggerGroups, resolveTrackGroupId } from './trigger-resolver';
import { TriggerManager } from './trigger-manager';
import { createTrackAnimation, trackAllCompletion, observeContainer, startProgressTracking } from './player-utils';

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
  private triggerManager: TriggerManager;

  public constructor(options?: PlayerOptions) {
    this.options = {
      autoPlay: options?.autoPlay ?? true,
      playbackRate: options?.playbackRate ?? 1,
    };
    this.triggerManager = new TriggerManager(
      this.emitter,
      (container, track) => this.applyTrack(container, track),
      () => this.destroyed,
    );
  }

  private applyTrack(container: HTMLElement, track: AnimationTrack): AnimationHandleImpl | null {
    return createTrackAnimation(container, track, this.emitter, this.missingTargets);
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
      return [];
    }

    // 先清理旧动画和旧触发器
    this.removeAll();
    this.triggerManager.cleanup();
    this.missingTargets.clear();

    // 解析触发器分组
    const resolvedGroups = resolveTriggerGroups(config.tracks, config.triggerGroups);

    const autoPlayHandles: AnimationHandleImpl[] = [];

    for (const track of config.tracks) {
      // 检查轨道是否属于某个触发器分组
      const groupId = resolveTrackGroupId(track);
      if (groupId && resolvedGroups.has(groupId)) {
        // 事件触发型轨道：不立即创建动画
        continue;
      }

      // 自动播放型轨道：立即创建动画
      const handle = this.applyTrack(container, track);
      if (handle) {
        autoPlayHandles.push(handle);
      }
    }

    this.handles = autoPlayHandles;
    this.completionTracked = false;

    // 绑定触发器事件
    this.triggerManager.bindGroups(container, resolvedGroups);

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
    this.triggerManager.cleanup();
    this.disconnectObservers();
    this.destroyed = true;
  }

  private startProgressTracking(): void {
    this.stopProgressTracking();
    this.progressRafId = startProgressTracking(
      () => this.getCurrentTime(),
      () => this.getDuration(),
      () => this.isPlaying,
      () => this.destroyed,
      (data) => this.emitter.emit('progress', data),
    );
  }

  private stopProgressTracking(): void {
    if (this.progressRafId !== null) {
      cancelAnimationFrame(this.progressRafId);
      this.progressRafId = null;
    }
  }

  private trackCompletion(): void {
    if (this.handles.length === 0 || this.completionTracked) {
      return;
    }
    this.completionTracked = true;
    trackAllCompletion(
      this.handles,
      this.emitter,
      () => this.destroyed,
      () => this.stopProgressTracking(),
    );
  }

  private observeContainer(container: HTMLElement): void {
    observeContainer(
      container,
      this.observers,
      () => this.handles,
      (handles) => {
        this.handles = handles;
      },
      this.emitter,
      () => this.destroyed,
    );
  }

  private disconnectObservers(): void {
    for (const [, observer] of this.observers) {
      observer.disconnect();
    }
    this.observers.clear();
  }
}
