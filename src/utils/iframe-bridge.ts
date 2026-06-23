import type { IframeMessageEnvelope, IframeEventHandler } from '@/types/iframe-message';
import { logger } from '@lib/logger';

const BRIDGE_SOURCE = 'mosu-bridge' as const;

/**
 * 创建父窗口 bridge，用于向 iframe 子窗口发送消息并接收回复。
 * @param iframe - 目标 iframe 元素引用
 */
export function createParentBridge(iframe: HTMLIFrameElement) {
  const handlers = new Map<string, Map<string, Set<IframeEventHandler>>>();

  /** 向 iframe 子窗口发送事件 */
  function emit(namespace: string, event: string, payload?: unknown): void {
    const { contentWindow } = iframe;
    if (!contentWindow) {
      logger.warn('libs.iframe-bridge.parent.emit', 'iframe contentWindow is null');
      return;
    }
    const envelope: IframeMessageEnvelope = {
      source: BRIDGE_SOURCE,
      namespace,
      event,
      payload,
      timestamp: Date.now(),
    };
    contentWindow.postMessage(envelope, globalThis.location.origin);
    logger.debug('libs.iframe-bridge.parent.emit', `Emitted: ${namespace}:${event}`, payload);
  }

  /** 注册事件监听，返回取消订阅函数 */
  function on<T = unknown>(namespace: string, event: string, handler: IframeEventHandler<T>): () => void {
    if (!handlers.has(namespace)) {
      handlers.set(namespace, new Map());
    }
    const nsMap = handlers.get(namespace)!;
    if (!nsMap.has(event)) {
      nsMap.set(event, new Set());
    }
    const wrappedHandler = handler as IframeEventHandler;
    nsMap.get(event)!.add(wrappedHandler);

    return () => {
      nsMap.get(event)?.delete(wrappedHandler);
      if (nsMap.get(event)?.size === 0) {
        nsMap.delete(event);
      }
      if (nsMap.size === 0) {
        handlers.delete(namespace);
      }
    };
  }

  /** 全局 message 监听器，按 namespace + event 二级分发 */
  const listener = (messageEvent: MessageEvent) => {
    if (messageEvent.origin !== globalThis.location.origin) {
      return;
    }
    const data = messageEvent.data as IframeMessageEnvelope | undefined;
    if (!data || data.source !== BRIDGE_SOURCE) {
      return;
    }
    const nsMap = handlers.get(data.namespace);
    if (!nsMap) {
      return;
    }
    const eventHandlers = nsMap.get(data.event);
    if (!eventHandlers || eventHandlers.size === 0) {
      return;
    }
    logger.debug('libs.iframe-bridge.parent.receive', `Received: ${data.namespace}:${data.event}`, data.payload);
    for (const handler of eventHandlers) {
      handler(data.payload);
    }
  };

  globalThis.addEventListener('message', listener);

  /** 销毁 bridge，移除全局监听 */
  function destroy(): void {
    globalThis.removeEventListener('message', listener);
    handlers.clear();
  }

  return { emit, on, destroy };
}

/**
 * 创建子窗口（iframe 内）bridge，用于向父窗口发送消息并接收指令。
 */
export function createChildBridge() {
  const handlers = new Map<string, Map<string, Set<IframeEventHandler>>>();

  /** 向父窗口发送事件 */
  function emit(namespace: string, event: string, payload?: unknown): void {
    // @ts-expect-error
    if (!globalThis.parent || globalThis.parent === globalThis) {
      logger.warn('libs.iframe-bridge.child.emit', 'Not running in iframe or parent is same window');
      return;
    }
    const envelope: IframeMessageEnvelope = {
      source: BRIDGE_SOURCE,
      namespace,
      event,
      payload,
      timestamp: Date.now(),
    };
    globalThis.parent.postMessage(envelope, globalThis.location.origin);
    logger.debug('libs.iframe-bridge.child.emit', `Emitted: ${namespace}:${event}`, payload);
  }

  /** 注册事件监听，返回取消订阅函数 */
  function on<T = unknown>(namespace: string, event: string, handler: IframeEventHandler<T>): () => void {
    if (!handlers.has(namespace)) {
      handlers.set(namespace, new Map());
    }
    const nsMap = handlers.get(namespace)!;
    if (!nsMap.has(event)) {
      nsMap.set(event, new Set());
    }
    const wrappedHandler = handler as IframeEventHandler;
    nsMap.get(event)!.add(wrappedHandler);

    return () => {
      nsMap.get(event)?.delete(wrappedHandler);
      if (nsMap.get(event)?.size === 0) {
        nsMap.delete(event);
      }
      if (nsMap.size === 0) {
        handlers.delete(namespace);
      }
    };
  }

  /** 全局 message 监听器，按 namespace + event 二级分发 */
  const listener = (messageEvent: MessageEvent) => {
    if (messageEvent.origin !== globalThis.location.origin) {
      return;
    }
    const data = messageEvent.data as IframeMessageEnvelope | undefined;
    if (!data || data.source !== BRIDGE_SOURCE) {
      return;
    }
    const nsMap = handlers.get(data.namespace);
    if (!nsMap) {
      return;
    }
    const eventHandlers = nsMap.get(data.event);
    if (!eventHandlers || eventHandlers.size === 0) {
      return;
    }
    logger.debug('libs.iframe-bridge.child.receive', `Received: ${data.namespace}:${data.event}`, data.payload);
    for (const handler of eventHandlers) {
      handler(data.payload);
    }
  };

  globalThis.addEventListener('message', listener);

  /** 销毁 bridge，移除全局监听 */
  function destroy(): void {
    globalThis.removeEventListener('message', listener);
    handlers.clear();
  }

  return { emit, on, destroy };
}
