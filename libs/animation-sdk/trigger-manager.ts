import type { AnimationTrack } from './types';
import { classifyGroupsByType, computeTotalDelay } from './trigger-resolver';
import type { ResolvedTriggerGroup } from './trigger-resolver';
import type { AnimationHandleImpl } from './handle';
import type { EventEmitter } from './events';
import type { AnimationLogger } from './types';

/**
 * 触发器管理器
 *
 * 负责事件委托绑定、触发器动画创建和清理。
 * 从 AnimationPlayer 中抽离，避免类逻辑膨胀。
 */
export class TriggerManager {
  private triggerHandles: AnimationHandleImpl[] = [];
  private delegatedHandlers = new Map<string, (event: Event) => void>();
  private firedTrackIds = new Set<string>();
  private container: HTMLElement | null = null;
  private emitter: EventEmitter;
  private applyTrack: (container: HTMLElement, track: AnimationTrack) => AnimationHandleImpl[];
  private isDestroyed: () => boolean;
  private logger: AnimationLogger;

  public constructor(
    emitter: EventEmitter,
    applyTrack: (container: HTMLElement, track: AnimationTrack) => AnimationHandleImpl[],
    isDestroyed: () => boolean,
    logger: AnimationLogger,
  ) {
    this.emitter = emitter;
    this.applyTrack = applyTrack;
    this.isDestroyed = isDestroyed;
    this.logger = logger;
  }

  /** 绑定触发器分组事件（事件委托模式） */
  public bindGroups(container: HTMLElement, resolvedGroups: Map<string, ResolvedTriggerGroup>): void {
    if (resolvedGroups.size === 0) {
      return;
    }

    this.container = container;
    const { clickGroups, hoverGroups, mouseenterGroups, mouseleaveGroups } = classifyGroupsByType(resolvedGroups);

    this.logger.debug(
      'sdk.animation.trigger.bind',
      `Binding triggers: click=${clickGroups.length}, hover=${hoverGroups.length}, mouseenter=${mouseenterGroups.length}, mouseleave=${mouseleaveGroups.length}`,
    );

    this.bindClickTriggers(container, clickGroups);
    this.bindMouseTriggers(container, hoverGroups, mouseenterGroups, mouseleaveGroups);

    for (const [groupId, group] of resolvedGroups) {
      this.emitter.emit('trigger-bound', { groupId, type: group.def.type, target: group.def.target });
    }
  }

  /** 清理所有触发器相关资源 */
  public cleanup(): void {
    if (this.container) {
      for (const [eventType, handler] of this.delegatedHandlers) {
        this.container.removeEventListener(eventType, handler);
      }
    }
    this.delegatedHandlers.clear();

    for (const handle of this.triggerHandles) {
      handle.cancel();
    }
    this.triggerHandles = [];
    this.firedTrackIds.clear();
    this.container = null;
  }

  private bindClickTriggers(container: HTMLElement, groups: ResolvedTriggerGroup[]): void {
    if (groups.length === 0) {
      return;
    }
    const handler = (event: Event): void => {
      for (const group of groups) {
        if ((event.target as Element)?.closest?.(group.def.target)) {
          this.fireGroup(container, group);
        }
      }
    };
    container.addEventListener('click', handler);
    this.delegatedHandlers.set('click', handler);
  }

  /**
   * 统一绑定鼠标进出相关触发器（hover / mouseenter / mouseleave）
   *
   * 使用 mouseover / mouseout 事件委托，在一个监听器内按分组类型分别处理：
   * - hover: 进入触发，离开取消
   * - mouseenter: 进入触发，离开不取消
   * - mouseleave: 离开触发，进入不触发
   */
  private bindMouseTriggers(
    container: HTMLElement,
    hoverGroups: ResolvedTriggerGroup[],
    mouseenterGroups: ResolvedTriggerGroup[],
    mouseleaveGroups: ResolvedTriggerGroup[],
  ): void {
    if (hoverGroups.length === 0 && mouseenterGroups.length === 0 && mouseleaveGroups.length === 0) {
      return;
    }

    const allEnterGroups = [...hoverGroups, ...mouseenterGroups];

    /** 判断 relatedTarget 是否仍在 targetElement 内部（含自身） */
    const isStillInside = (targetElement: Element, relatedTarget: Element | null): boolean => {
      if (!relatedTarget) {
        return false;
      }
      return relatedTarget === targetElement || targetElement.contains(relatedTarget);
    };

    const overHandler = (event: Event): void => {
      const mouseEvent = event as MouseEvent;
      const relatedTarget = mouseEvent.relatedTarget as Element | null;

      for (const group of allEnterGroups) {
        const targetElement = (event.target as Element)?.closest?.(group.def.target);
        if (targetElement) {
          // 如果 relatedTarget 已在 target 内部，说明鼠标只是在内部移动，不重新触发
          if (isStillInside(targetElement, relatedTarget)) {
            continue;
          }
          this.fireGroup(container, group);
        }
      }
    };

    const outHandler = (event: Event): void => {
      const mouseEvent = event as MouseEvent;
      const relatedTarget = mouseEvent.relatedTarget as Element | null;

      // hover 离开时取消动画（需要判断是否真正离开了 target）
      for (const group of hoverGroups) {
        const targetElement = (event.target as Element)?.closest?.(group.def.target);
        if (targetElement) {
          // 如果 relatedTarget 仍在 target 内部，说明鼠标没有真正离开
          if (isStillInside(targetElement, relatedTarget)) {
            continue;
          }
          this.cancelGroupTracks(group);
        }
      }
      // mouseleave 离开时触发动画（同样需要判断是否真正离开）
      for (const group of mouseleaveGroups) {
        const targetElement = (event.target as Element)?.closest?.(group.def.target);
        if (targetElement) {
          if (isStillInside(targetElement, relatedTarget)) {
            continue;
          }
          this.fireGroup(container, group);
        }
      }
    };

    container.addEventListener('mouseover', overHandler);
    container.addEventListener('mouseout', outHandler);
    this.delegatedHandlers.set('mouseover', overHandler);
    this.delegatedHandlers.set('mouseout', outHandler);
  }

  /** 触发一组动画：组内所有轨道按各自的 delay 独立创建并播放 */
  private fireGroup(container: HTMLElement, group: ResolvedTriggerGroup): void {
    if (this.isDestroyed()) {
      return;
    }

    this.logger.debug(
      'sdk.animation.trigger.fire',
      `Firing trigger group "${group.def.type}" with ${group.tracks.length} tracks`,
    );

    for (const track of group.tracks) {
      if (track.trigger?.once && this.firedTrackIds.has(track.id)) {
        this.logger.debug('sdk.animation.trigger.skip', `Track "${track.id}" skipped (once=true, already fired)`);
        continue;
      }

      const totalDelay = computeTotalDelay(group.def, track);

      const fireTrack = (): void => {
        if (this.isDestroyed()) {
          return;
        }
        // 取消该 track 的所有旧 handles
        const oldHandles = this.triggerHandles.filter((handle) => handle.id.startsWith(track.id));
        for (const oldHandle of oldHandles) {
          oldHandle.cancel();
        }
        this.triggerHandles = this.triggerHandles.filter((handle) => !handle.id.startsWith(track.id));

        const handles = this.applyTrack(container, track);
        if (handles.length > 0) {
          this.triggerHandles.push(...handles);
          for (const handle of handles) {
            handle.play();
          }
          this.firedTrackIds.add(track.id);
          this.logger.info(
            'sdk.animation.trigger.fired',
            `Track "${track.id}" triggered by "${group.def.type}" (${handles.length} elements)`,
          );
          this.emitter.emit('trigger-fired', { trackId: track.id, type: group.def.type });
        } else {
          this.logger.warn('sdk.animation.trigger.failed', `Failed to create animation for track "${track.id}"`);
        }
      };

      if (totalDelay > 0) {
        setTimeout(fireTrack, totalDelay);
      } else {
        fireTrack();
      }
    }
  }

  /** hover 离开时取消组内所有动画（重置到起点） */
  private cancelGroupTracks(group: ResolvedTriggerGroup): void {
    for (const track of group.tracks) {
      const handles = this.triggerHandles.filter((handle) => handle.id.startsWith(track.id));
      for (const handle of handles) {
        handle.cancel();
      }
      this.triggerHandles = this.triggerHandles.filter((handle) => !handle.id.startsWith(track.id));
    }
  }
}
