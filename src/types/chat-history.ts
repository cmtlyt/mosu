import type { ChatMessage } from '@/types/history';

export interface ChatHistoryNodeData {
  label: string;
  source: 'manual' | 'ai';
  timestamp: number;
  messages: ChatMessage[];
}
