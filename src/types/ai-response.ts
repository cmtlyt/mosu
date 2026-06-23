import type { AnimationConfig } from '@lib/animation-sdk';
import type { AnimationPatchInstruction } from './animation-patch';
import type { DomPatchInstruction } from './dom-patch';

export interface AIEditorResponse {
  /** 动画名称/变更摘要（必填） */
  name: string;
  /** DOM 增量变更指令，未提供时保持当前 DOM 不变 */
  domPatch?: DomPatchInstruction[];
  style?: string;
  /** 动画增量变更指令，与 config 互斥 */
  animationPatch?: AnimationPatchInstruction[];
  /** 动画全量配置（仅在全新场景时使用，与 animationPatch 互斥） */
  config?: Pick<AnimationConfig, 'tracks' | 'triggerGroups'>;
}
