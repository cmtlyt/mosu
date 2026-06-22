import type { AnimationConfig } from '@/types/animation';

/** Animation SDK 使用的 Logger 接口（兼容 @cmtlyt/logger） */
export interface AnimationLogger {
  info(pointer: string, message: string, ...otherMessage: unknown[]): void;
  warn(pointer: string, message: string, ...otherMessage: unknown[]): void;
  error(pointer: string, message: string, error: unknown, ...otherMessage: unknown[]): void;
  debug(pointer: string, message: string, ...otherMessage: unknown[]): void;
}

/** 单个动画轨道的控制句柄 */
export interface AnimationHandle {
  /** 动画轨道 ID */
  readonly id: string;
  /** 目标元素选择器 */
  readonly target: string;
  /** 播放 */
  play(): void;
  /** 暂停 */
  pause(): void;
  /** 取消并重置 */
  cancel(): void;
  /** 是否正在播放 */
  readonly isPlaying: boolean;
  /** 动画完成 Promise */
  readonly finished: Promise<void>;
  /** 获取 WAAPI Animation 的播放状态 */
  getPlayState(): AnimationPlayState;
}

/** 播放器事件映射 */
export interface PlayerEventMap {
  /** 所有动画播放完成 */
  complete: undefined;
  /** 单个轨道动画完成 */
  'track-complete': { trackId: string };
  /** 应用动画时目标元素未找到 */
  'target-missing': { selector: string; trackId: string };
  /** 应用动画失败 */
  error: { trackId: string; error: Error };
  /** 进度更新（每帧触发，节流至 ~60fps） */
  progress: { currentTime: number; duration: number; percent: number };
  /** 事件触发器已绑定到目标元素 */
  'trigger-bound': { groupId: string; type: string; target: string };
  /** 事件触发器已触发，动画开始播放 */
  'trigger-fired': { trackId: string; type: string };
}

/** 播放器配置选项 */
export interface PlayerOptions {
  /** 是否在 apply 后自动播放，默认 true */
  autoPlay?: boolean;
  /** 全局速度倍率，默认 1 */
  playbackRate?: number;
  /** 可选的 Logger 实例，用于打印 SDK 内部日志 */
  logger?: AnimationLogger;
}

/** 事件处理器 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EventHandler<T> = T extends undefined ? () => void : (payload: T) => void;

/** 取消订阅函数 */
export type Unsubscribe = () => void;

/** 内部使用的动画控制接口（不对外暴露） */
export interface InternalAnimationControl {
  play(): void;
  pause(): void;
  cancel(): void;
  readonly finished: Promise<void>;
}

export type { AnimationConfig };
