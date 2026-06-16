import type { AnimationConfig } from './animation';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  animationName?: string;
  hasDomUpdate?: boolean;
}

export interface HistoryNodeData {
  config: AnimationConfig;
  label: string;
  source: 'manual' | 'ai';
  timestamp: number;
  messages: ChatMessage[];
  customDom: string | null;
  customStyle: string | null;
}
