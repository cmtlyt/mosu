export { AnimationPlayer } from './player';
export type {
  AnimationHandle,
  AnimationLogger,
  PlayerEventMap,
  PlayerOptions,
  EventHandler,
  Unsubscribe,
  AnimationConfig,
} from './types';
export type { AnimationTrigger, AnimationTriggerType, AnimationTriggerGroup, AnimationTrack } from './types';
export type { ResolvedTriggerGroup } from './trigger-resolver';
export { resolveTriggerGroups, classifyGroupsByType, computeTotalDelay } from './trigger-resolver';
