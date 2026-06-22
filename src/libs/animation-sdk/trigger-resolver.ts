import type { AnimationTrack, AnimationTriggerGroup } from '@/types/animation';

/** 解析后的触发器分组 */
export interface ResolvedTriggerGroup {
  def: AnimationTriggerGroup;
  tracks: AnimationTrack[];
}

/**
 * 解析轨道的触发器分组 ID
 *
 * @param track 动画轨道
 * @returns 分组 ID，若轨道不属于任何触发器分组则返回 null
 */
export function resolveTrackGroupId(track: AnimationTrack): string | null {
  if (!track.trigger || track.trigger.type === 'auto') {
    return null;
  }

  if (track.trigger.group) {
    return track.trigger.group;
  }

  return `__implicit_${track.id}`;
}

/**
 * 解析 triggerGroups 配置，将轨道分配到对应分组
 * 无 group 的独立触发轨道自动创建隐式分组
 *
 * @param tracks 动画轨道列表
 * @param triggerGroups 触发器分组定义（可选）
 * @returns 解析后的分组映射，key 为分组 ID
 */
export function resolveTriggerGroups(
  tracks: AnimationTrack[],
  triggerGroups?: Record<string, AnimationTriggerGroup>,
): Map<string, ResolvedTriggerGroup> {
  const resolvedGroups = new Map<string, ResolvedTriggerGroup>();
  const groupDefs = triggerGroups ?? {};

  for (const track of tracks) {
    const groupId = resolveTrackGroupId(track);
    if (!groupId) {
      continue;
    }

    if (!resolvedGroups.has(groupId)) {
      // 优先从 groupDefs 获取定义，否则从 track 自身构造隐式定义
      const groupDef =
        track.trigger?.group && groupDefs[track.trigger.group]
          ? groupDefs[track.trigger.group]
          : {
              type: track.trigger!.type!,
              target: track.trigger!.target ?? track.target,
            };
      resolvedGroups.set(groupId, { def: groupDef, tracks: [] });
    }

    resolvedGroups.get(groupId)!.tracks.push(track);
  }

  return resolvedGroups;
}
/**
 * 按事件类型对已解析的分组进行分类
 *
 * @param resolvedGroups 解析后的触发器分组
 * @returns 按事件类型分类的分组列表
 */
export function classifyGroupsByType(resolvedGroups: Map<string, ResolvedTriggerGroup>): {
  clickGroups: ResolvedTriggerGroup[];
  hoverGroups: ResolvedTriggerGroup[];
  mouseenterGroups: ResolvedTriggerGroup[];
  mouseleaveGroups: ResolvedTriggerGroup[];
} {
  const clickGroups: ResolvedTriggerGroup[] = [];
  const hoverGroups: ResolvedTriggerGroup[] = [];
  const mouseenterGroups: ResolvedTriggerGroup[] = [];
  const mouseleaveGroups: ResolvedTriggerGroup[] = [];

  for (const group of resolvedGroups.values()) {
    switch (group.def.type) {
      case 'click':
        clickGroups.push(group);
        break;
      case 'hover':
        hoverGroups.push(group);
        break;
      case 'mouseenter':
        mouseenterGroups.push(group);
        break;
      case 'mouseleave':
        mouseleaveGroups.push(group);
        break;
      default:
        break;
    }
  }

  return { clickGroups, hoverGroups, mouseenterGroups, mouseleaveGroups };
}

/**
 * 计算轨道的总触发延迟（组级 + 轨道级）
 *
 * @param groupDef 分组定义
 * @param track 动画轨道
 * @returns 总延迟（毫秒）
 */
export function computeTotalDelay(groupDef: AnimationTriggerGroup, track: AnimationTrack): number {
  return (groupDef.delay ?? 0) + (track.trigger?.delay ?? 0);
}
