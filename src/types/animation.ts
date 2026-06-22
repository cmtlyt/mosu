export interface AnimationTrackKeyframe {
  offset: number;
  [property: string]: unknown;
}

export interface AnimationTrackOptions {
  duration: number;
  delay?: number;
  easing?: string;
  iterations?: number | 'Infinity';
  direction?: 'normal' | 'reverse' | 'alternate' | 'alternate-reverse';
  fillMode?: 'none' | 'forwards' | 'backwards' | 'both';
}

/** 事件触发器类型 */
export type AnimationTriggerType = 'auto' | 'click' | 'hover' | 'mouseenter' | 'mouseleave';

/** 触发器分组定义（与 tracks 同级，key 为分组 ID） */
export interface AnimationTriggerGroup {
  /** 触发类型 */
  type: AnimationTriggerType;
  /** 触发目标选择器 */
  target: string;
  /** 触发延迟（毫秒），组级别延迟，在轨道自身 delay 之前生效 */
  delay?: number;
}

/** 事件触发器配置 */
export interface AnimationTrigger {
  /** 触发类型（无 group 时必填） */
  type?: AnimationTriggerType;
  /** 触发目标选择器，未指定时使用 track.target（无 group 时生效） */
  target?: string;
  /** 是否只触发一次，默认 false */
  once?: boolean;
  /** 触发延迟（毫秒），轨道级别延迟 */
  delay?: number;
  /** 引用 triggerGroups 中的分组 ID，配置后 type/target 从分组继承 */
  group?: string;
}

export interface AnimationTrack {
  id: string;
  target: string;
  keyframes: AnimationTrackKeyframe[];
  options: AnimationTrackOptions;
  /** 事件触发器，未指定时默认为 auto（自动播放） */
  trigger?: AnimationTrigger;
}

export interface AnimationConfig {
  version: string;
  id: string;
  name: string;
  tracks: AnimationTrack[];
  /** 触发器分组定义，key 为分组 ID，tracks 通过 trigger.group 引用 */
  triggerGroups?: Record<string, AnimationTriggerGroup>;
}
