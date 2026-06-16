/** 跨窗口消息信封，所有 bridge 通信均使用此格式 */
export interface IframeMessageEnvelope {
  source: 'mosu-bridge';
  namespace: string;
  event: string;
  payload?: unknown;
  timestamp: number;
}

/** 事件处理器类型 */
export type IframeEventHandler<T = unknown> = (payload: T) => void;
