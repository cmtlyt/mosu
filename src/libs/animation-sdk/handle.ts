import type { AnimationHandle } from './types';

/**
 * 封装 WAAPI Animation 的句柄实现
 * 提供统一的播放控制和状态查询
 */
export class AnimationHandleImpl implements AnimationHandle {
  public readonly id: string;
  public readonly target: string;
  private animation: globalThis.Animation;
  private _isPlaying = false;

  public constructor(id: string, target: string, animation: globalThis.Animation) {
    this.id = id;
    this.target = target;
    this.animation = animation;
    this._isPlaying = animation.playState === 'running';
  }

  public get isPlaying(): boolean {
    return this._isPlaying;
  }

  public get finished(): Promise<void> {
    return this.animation.finished.then(() => undefined);
  }

  public play(): void {
    this.animation.play();
    this._isPlaying = true;
  }

  public pause(): void {
    this.animation.pause();
    this._isPlaying = false;
  }

  public cancel(): void {
    try {
      this.animation.cancel();
    } catch {
      // 元素已从 DOM 移除时 cancel 可能抛出 InvalidStateError，静默忽略
    }
    this._isPlaying = false;
  }

  /** 跳转到指定时间（毫秒），保持 seek 前的播放/暂停状态 */
  public seek(time: number): void {
    const wasRunning = this.animation.playState === 'running';
    try {
      this.animation.currentTime = time;
    } catch {
      // 动画未激活或已取消时赋值可能抛错，静默忽略
      return;
    }
    // WAAPI 缺陷：finished 状态下设置 currentTime < duration 会自动变为 running
    // 如果 seek 前不是 running，seek 后需要暂停以保持状态一致
    if (!wasRunning && this.animation.playState === 'running') {
      this.animation.pause();
    }
  }

  /** 设置播放速度倍率 */
  public setPlaybackRate(rate: number): void {
    try {
      this.animation.playbackRate = rate;
    } catch {
      // 动画未激活时赋值可能抛错，静默忽略
    }
  }

  /** 获取当前播放时间（毫秒） */
  public getCurrentTime(): number {
    const { currentTime } = this.animation;
    return typeof currentTime === 'number' ? currentTime : 0;
  }

  /** 获取动画总时长（毫秒） */
  public getDuration(): number {
    const { effect } = this.animation;
    if (!effect) {
      return 0;
    }
    const timing = effect.getComputedTiming();
    const { duration } = timing;
    return typeof duration === 'number' ? duration : 0;
  }

  /** 获取 WAAPI Animation 的播放状态 */
  public getPlayState(): AnimationPlayState {
    return this.animation.playState;
  }
}
