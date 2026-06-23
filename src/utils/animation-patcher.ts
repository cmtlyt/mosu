import type { AnimationConfig } from '@lib/animation-sdk';
import type { AnimationPatchInstruction } from '@/types/animation-patch';
import { logger } from '@lib/logger';

interface PatchResult {
  applied: number;
  skipped: number;
  errors: string[];
}

function applyAddTrack(config: AnimationConfig, patch: AnimationPatchInstruction): void {
  if (!patch.track) {
    throw new Error('addTrack: missing track definition');
  }
  if (!patch.track.id) {
    throw new Error('addTrack: track.id is required');
  }
  if (config.tracks.some((track) => track.id === patch.track!.id)) {
    throw new Error(`addTrack: track "${patch.track.id}" already exists`);
  }
  config.tracks.push(patch.track);
}

function applyRemoveTrack(config: AnimationConfig, patch: AnimationPatchInstruction): void {
  if (!patch.trackId) {
    throw new Error('removeTrack: missing trackId');
  }
  const index = config.tracks.findIndex((track) => track.id === patch.trackId);
  if (index === -1) {
    throw new Error(`removeTrack: track "${patch.trackId}" not found`);
  }
  config.tracks.splice(index, 1);
}

function applyUpdateTrack(config: AnimationConfig, patch: AnimationPatchInstruction): void {
  if (!patch.trackId) {
    throw new Error('updateTrack: missing trackId');
  }
  if (!patch.trackUpdate) {
    throw new Error('updateTrack: missing trackUpdate');
  }
  const index = config.tracks.findIndex((track) => track.id === patch.trackId);
  if (index === -1) {
    throw new Error(`updateTrack: track "${patch.trackId}" not found`);
  }
  config.tracks[index] = {
    ...config.tracks[index],
    ...patch.trackUpdate,
  };
}

function applyAddTriggerGroup(config: AnimationConfig, patch: AnimationPatchInstruction): void {
  if (!patch.groupId) {
    throw new Error('addTriggerGroup: missing groupId');
  }
  if (!patch.group) {
    throw new Error('addTriggerGroup: missing group definition');
  }
  if (!config.triggerGroups) {
    config.triggerGroups = {};
  }
  if (config.triggerGroups[patch.groupId]) {
    throw new Error(`addTriggerGroup: group "${patch.groupId}" already exists`);
  }
  config.triggerGroups[patch.groupId] = patch.group;
}

function applyRemoveTriggerGroup(config: AnimationConfig, patch: AnimationPatchInstruction): void {
  if (!patch.groupId) {
    throw new Error('removeTriggerGroup: missing groupId');
  }
  if (!config.triggerGroups || !config.triggerGroups[patch.groupId]) {
    throw new Error(`removeTriggerGroup: group "${patch.groupId}" not found`);
  }
  // 重建对象避免动态 delete
  const { [patch.groupId]: _, ...rest } = config.triggerGroups;
  config.triggerGroups = rest;
}

function applyUpdateTriggerGroup(config: AnimationConfig, patch: AnimationPatchInstruction): void {
  if (!patch.groupId) {
    throw new Error('updateTriggerGroup: missing groupId');
  }
  if (!patch.groupUpdate) {
    throw new Error('updateTriggerGroup: missing groupUpdate');
  }
  if (!config.triggerGroups || !config.triggerGroups[patch.groupId]) {
    throw new Error(`updateTriggerGroup: group "${patch.groupId}" not found`);
  }
  config.triggerGroups[patch.groupId] = {
    ...config.triggerGroups[patch.groupId],
    ...patch.groupUpdate,
  };
}

function applySinglePatch(config: AnimationConfig, patch: AnimationPatchInstruction): void {
  switch (patch.op) {
    case 'addTrack':
      applyAddTrack(config, patch);
      break;
    case 'removeTrack':
      applyRemoveTrack(config, patch);
      break;
    case 'updateTrack':
      applyUpdateTrack(config, patch);
      break;
    case 'addTriggerGroup':
      applyAddTriggerGroup(config, patch);
      break;
    case 'removeTriggerGroup':
      applyRemoveTriggerGroup(config, patch);
      break;
    case 'updateTriggerGroup':
      applyUpdateTriggerGroup(config, patch);
      break;
    default:
      throw new Error(`Unknown patch op: ${patch.op}`);
  }
}

/**
 * 将 animationPatch 指令合并到基础配置上，返回更新后的配置
 */
export function applyAnimationPatch(
  baseConfig: AnimationConfig,
  patches: AnimationPatchInstruction[],
): { config: AnimationConfig; result: PatchResult } {
  const result: PatchResult = { applied: 0, skipped: 0, errors: [] };

  // 深拷贝基础配置，避免直接修改原对象
  const config: AnimationConfig = structuredClone(baseConfig);

  for (const patch of patches) {
    try {
      applySinglePatch(config, patch);
      result.applied++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('libs.animation-patcher.skip', `Patch skipped: ${message}`, patch);
      result.skipped++;
      result.errors.push(message);
    }
  }

  return { config, result };
}
