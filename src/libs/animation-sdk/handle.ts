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
}
