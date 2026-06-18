import { memo, useRef, useEffect } from 'react';
import type { ChatMessage } from '@/types/history';
import { ChatMessageItem } from '../chat-message';
import styles from '../chat-panel/index.module.css';

interface ChatMessageListProps {
  messages: ChatMessage[];
  isStreaming: boolean;
}

export const ChatMessageList = memo(({ messages, isStreaming }: ChatMessageListProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className={styles.messages}>
      {messages.map((msg, index) => {
        const isLastAssistant = msg.role === 'assistant' && index === messages.length - 1;
        return <ChatMessageItem key={msg.id} message={msg} isStreaming={isLastAssistant && isStreaming} />;
      })}
      <div ref={messagesEndRef} />
    </div>
  );
});
