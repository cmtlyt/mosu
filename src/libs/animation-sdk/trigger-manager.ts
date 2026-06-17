import type { AnimationTrack } from '@/types/animation';
import { logger } from '@/libs/logger';
import { classifyGroupsByType, computeTotalDelay } from './trigger-resolver';
import type { ResolvedTriggerGroup } from './trigger-resolver';
import type { AnimationHandleImpl } from './handle';
import type { EventEmitter } from './events';

/**
 * 触发器管理器
 *
 * 负责事件委托绑定、触发器动画创建和清理。
 * 从 AnimationPlayer 中抽离，避免类逻辑膨胀。
 */
export class TriggerManager {
  private triggerHandles: AnimationHandleImpl[] = [];
  private delegatedHandlers = new Map<string, (event: Event) => void>();
  private intersectionObservers: IntersectionObserver[] = [];
  private firedTrackIds = new Set<string>();
  private container: HTMLElement | null = null;
  private emitter: EventEmitter;
  private applyTrack: (container: HTMLElement, track: AnimationTrack) => AnimationHandleImpl | null;
  private isDestroyed: () => boolean;

  public constructor(
    emitter: EventEmitter,
    applyTrack: (container: HTMLElement, track: AnimationTrack) => AnimationHandleImpl | null,
    isDestroyed: () => boolean,
  ) {
    this.emitter = emitter;
    this.applyTrack = applyTrack;
    this.isDestroyed = isDestroyed;
  }

  /** 绑定触发器分组事件（事件委托模式） */
  public bindGroups(container: HTMLElement, resolvedGroups: Map<string, ResolvedTriggerGroup>): void {
    if (resolvedGroups.size === 0) {
      return;
    }

    this.container = container;
    const { clickGroups, hoverGroups, mouseenterGroups, mouseleaveGroups, scrollGroups, viewportGroups } =
      classifyGroupsByType(resolvedGroups);

    this.bindClickTriggers(container, clickGroups);
    this.bindMouseTriggers(container, hoverGroups, mouseenterGroups, mouseleaveGroups);
    this.bindScrollTriggers(container, scrollGroups);
    this.bindViewportTriggers(container, viewportGroups);

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

    for (const observer of this.intersectionObservers) {
      observer.disconnect();
    }
    this.intersectionObservers = [];

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
    logger.debug('libs.animation-sdk.trigger.bind', `Bound click trigger for ${groups.length} group(s)`);
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

    const overHandler = (event: Event): void => {
      for (const group of allEnterGroups) {
        if ((event.target as Element)?.closest?.(group.def.target)) {
          this.fireGroup(container, group);
        }
      }
    };

    const outHandler = (event: Event): void => {
      // hover 离开时取消动画
      for (const group of hoverGroups) {
        if ((event.target as Element)?.closest?.(group.def.target)) {
          this.cancelGroupTracks(group);
        }
      }
      // mouseleave 离开时触发动画
      for (const group of mouseleaveGroups) {
        if ((event.target as Element)?.closest?.(group.def.target)) {
          this.fireGroup(container, group);
        }
      }
    };

    container.addEventListener('mouseover', overHandler);
    container.addEventListener('mouseout', outHandler);
    this.delegatedHandlers.set('mouseover', overHandler);
    this.delegatedHandlers.set('mouseout', outHandler);

    const counts = [
      hoverGroups.length > 0 ? `hover(${hoverGroups.length})` : '',
      mouseenterGroups.length > 0 ? `mouseenter(${mouseenterGroups.length})` : '',
      mouseleaveGroups.length > 0 ? `mouseleave(${mouseleaveGroups.length})` : '',
    ]
      .filter(Boolean)
      .join(', ');
    logger.debug('libs.animation-sdk.trigger.bind', `Bound mouse triggers: ${counts}`);
  }

  private bindScrollTriggers(container: HTMLElement, groups: ResolvedTriggerGroup[]): void {
    if (groups.length === 0) {
      return;
    }
    const handler = (): void => {
      for (const group of groups) {
        this.fireGroup(container, group);
      }
    };
    container.addEventListener('scroll', handler, { passive: true });
    this.delegatedHandlers.set('scroll', handler);
    logger.debug('libs.animation-sdk.trigger.bind', `Bound scroll trigger for ${groups.length} group(s)`);
  }

  private bindViewportTriggers(container: HTMLElement, groups: ResolvedTriggerGroup[]): void {
    for (const group of groups) {
      const element = container.querySelector(group.def.target);
      if (!element) {
        for (const track of group.tracks) {
          logger.warn(
            'libs.animation-sdk.trigger.bind',
            `Trigger target not found: ${group.def.target} for track "${track.id}"`,
          );
          this.emitter.emit('target-missing', { selector: group.def.target, trackId: track.id });
        }
        continue;
      }
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              this.fireGroup(container, group);
            }
          }
        },
        { threshold: 0.1 },
      );
      observer.observe(element);
      this.intersectionObservers.push(observer);
      logger.debug('libs.animation-sdk.trigger.bind', 'Bound viewport trigger for group');
    }
  }

  /** 触发一组动画：组内所有轨道按各自的 delay 独立创建并播放 */
  private fireGroup(container: HTMLElement, group: ResolvedTriggerGroup): void {
    if (this.isDestroyed()) {
      return;
    }

    for (const track of group.tracks) {
      if (track.trigger?.once && this.firedTrackIds.has(track.id)) {
        continue;
      }

      const totalDelay = computeTotalDelay(group.def, track);

      const fireTrack = (): void => {
        if (this.isDestroyed()) {
          return;
        }
        const existingHandle = this.triggerHandles.find((handle) => handle.id === track.id);
        if (existingHandle) {
          existingHandle.cancel();
        }
        const handle = this.applyTrack(container, track);
        if (handle) {
          this.triggerHandles = this.triggerHandles.filter((handle) => handle.id !== track.id);
          this.triggerHandles.push(handle);
          handle.play();
          this.firedTrackIds.add(track.id);
          this.emitter.emit('trigger-fired', { trackId: track.id, type: group.def.type });
          logger.debug('libs.animation-sdk.trigger.fired', `Track "${track.id}" triggered by ${group.def.type}`);
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
      const handle = this.triggerHandles.find((handle) => handle.id === track.id);
      if (handle) {
        handle.cancel();
        this.triggerHandles = this.triggerHandles.filter((handle) => handle.id !== track.id);
      }
    }
  }
}
