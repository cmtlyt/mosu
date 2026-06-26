import { memo } from 'react';
import type { ChatMessage } from '@/types/history';
import { ChatMessageItem } from '../chat-message';
import { useAutoScroll } from '@/hooks/use-auto-scroll';
import styles from './index.module.css';

interface ChatMessageListProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  enableCollapse?: boolean;
}

export const ChatMessageList = memo(({ messages, isStreaming, enableCollapse = true }: ChatMessageListProps) => {
  const { scrollContainerRef, messagesEndRef, scrollToBottom, isAtBottom } = useAutoScroll(messages, isStreaming);

  return (
    <div className={styles.messages} ref={scrollContainerRef}>
      {messages.map((msg, index) => {
        const isLastAssistant = msg.role === 'assistant' && index === messages.length - 1;
        return (
          <ChatMessageItem
            key={msg.id}
            message={msg}
            isStreaming={isLastAssistant && isStreaming}
            enableCollapse={enableCollapse}
          />
        );
      })}
      <div ref={messagesEndRef} />
      <div className={styles.scrollToBottomWrapper}>
        {!isAtBottom && (
          <button
            type="button"
            className={styles.scrollToBottomButton}
            onClick={scrollToBottom}
            aria-label="滚动到底部"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M8 4V12M8 12L4 8M8 12L12 8"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
});
