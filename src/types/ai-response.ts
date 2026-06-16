import type { AnimationConfig } from './animation';
import type { DomPatchInstruction } from './dom-patch';

export interface AIEditorResponse {
  /** DOM 增量变更指令，未提供时保持当前 DOM 不变 */
  domPatch?: DomPatchInstruction[];
  style?: string;
  config: Pick<AnimationConfig, 'tracks'> & { name?: string };
}
