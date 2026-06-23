import type { PlayerEventMap, EventHandler, Unsubscribe } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyHandler = (...args: any[]) => void;

/**
 * 轻量级发布-订阅事件系统
 * 纯对象 + Set 实现，零依赖
 */
export class EventEmitter {
  private listeners = new Map<string, Set<AnyHandler>>();

  public on<K extends keyof PlayerEventMap>(event: K, handler: EventHandler<PlayerEventMap[K]>): Unsubscribe {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const handlers = this.listeners.get(event)!;
    handlers.add(handler as AnyHandler);

    return () => {
      handlers.delete(handler as AnyHandler);
      if (handlers.size === 0) {
        this.listeners.delete(event);
      }
    };
  }

  public emit<K extends keyof PlayerEventMap>(
    event: K,
    ...args: PlayerEventMap[K] extends undefined ? [] : [PlayerEventMap[K]]
  ): void {
    const handlers = this.listeners.get(event);
    if (!handlers || handlers.size === 0) {
      return;
    }
    for (const handler of handlers) {
      handler(...args);
    }
  }

  public destroy(): void {
    this.listeners.clear();
  }
}
