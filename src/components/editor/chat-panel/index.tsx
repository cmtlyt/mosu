import { useRef } from 'react';
import type { ChatMessage } from '@/types/history';
import type { AnimationConfig } from '@lib/animation-sdk';
import type { ToggleGroupRef } from '../toggle-group';
import { ChatMessageList } from '@/components/chat/chat-message-list';
import { InputArea } from '@/components/chat/input-area';
import styles from './index.module.css';

export interface SendMessageOptions {
  includeFullDom: boolean;
  includeCss: boolean;
  includeAnimationConfig: boolean;
  includeFullContext: boolean;
}

interface ChatPanelProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  onSendMessage: (content: string, options: SendMessageOptions) => void;
  currentConfig: AnimationConfig;
}

export function ChatPanel({ messages, isStreaming, onSendMessage }: ChatPanelProps) {
  const toggleGroupRef = useRef<ToggleGroupRef>(null);

  const handleSend = (content: string) => {
    const options = toggleGroupRef.current?.getOptions() ?? {
      includeFullDom: false,
      includeCss: false,
      includeAnimationConfig: true,
      includeFullContext: false,
    };
    onSendMessage(content, options);
  };

  return (
    <div className={styles.chatPanel}>
      <ChatMessageList messages={messages} isStreaming={isStreaming} />
      <InputArea isStreaming={isStreaming} toggleGroupRef={toggleGroupRef} onSend={handleSend} />
    </div>
  );
}
