import type { AnimationConfig } from './animation';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface HistoryNodeData {
  config: AnimationConfig;
  label: string;
  source: 'manual' | 'ai';
  timestamp: number;
  messages: ChatMessage[];
}
