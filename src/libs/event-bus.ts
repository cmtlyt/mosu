import { logger } from '@/libs/logger';

/** 编辑器事件类型 */
export const EDITOR_EVENTS = {
  AI_STREAM_START: 'editor:ai-stream-start',
  AI_STREAM_END: 'editor:ai-stream-end',
  AI_STREAM_ERROR: 'editor:ai-stream-error',
  NODE_CHECKOUT: 'editor:node-checkout',
  CONFIG_COMMITTED: 'editor:config-committed',
  IMPORT_SUCCESS: 'editor:import-success',
  IMPORT_ERROR: 'editor:import-error',
} as const;

/** 事件类型联合，从 EDITOR_EVENTS 值自动推断 */
export type EditorEventType = (typeof EDITOR_EVENTS)[keyof typeof EDITOR_EVENTS];

/** 派发编辑器事件（type 受 EditorEventType 约束），同时记录日志 */
export function dispatchEditorEvent(type: EditorEventType, detail?: unknown): void {
  logger.event('libs.event-bus.dispatch', `Dispatching editor event: ${type}`, detail);
  globalThis.dispatchEvent(new CustomEvent(type, { detail }));
}

/** 监听编辑器事件（type 受 EditorEventType 约束） */
export function onEditorEvent(type: EditorEventType, handler: (detail: unknown) => void): () => void {
  const listener = (event: Event) => handler((event as CustomEvent).detail);
  globalThis.addEventListener(type, listener);
  return () => globalThis.removeEventListener(type, listener);
}
