import type { AnimationTrack, AnimationTriggerGroup } from '@lib/animation-sdk';

export type AnimationPatchOp =
  | 'addTrack'
  | 'removeTrack'
  | 'updateTrack'
  | 'addTriggerGroup'
  | 'removeTriggerGroup'
  | 'updateTriggerGroup';

export interface AnimationPatchInstruction {
  /** 操作类型 */
  op: AnimationPatchOp;

  // --- addTrack / updateTrack ---
  /** addTrack 时的完整轨道定义 */
  track?: AnimationTrack;
  /** updateTrack 时的轨道 ID（必填） */
  trackId?: string;
  /** updateTrack 时的部分更新字段（与 track 互斥） */
  trackUpdate?: Partial<Omit<AnimationTrack, 'id'>>;

  // --- removeTrack ---
  /** removeTrack 时的轨道 ID */
  // 复用 trackId

  // --- addTriggerGroup / updateTriggerGroup ---
  /** 触发器分组 ID */
  groupId?: string;
  /** addTriggerGroup 时的完整分组定义 */
  group?: AnimationTriggerGroup;
  /** updateTriggerGroup 时的部分更新字段 */
  groupUpdate?: Partial<AnimationTriggerGroup>;

  // --- removeTriggerGroup ---
  /** removeTriggerGroup 时的分组 ID */
  // 复用 groupId
}
