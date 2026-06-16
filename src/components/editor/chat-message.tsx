import { useState } from 'react';
import type { ChatMessage } from '@/types/history';
import styles from './chat-message.module.css';

interface ChatMessageProps {
  message: ChatMessage;
  isStreaming?: boolean;
}

export function ChatMessageItem({ message, isStreaming }: ChatMessageProps) {
  const [expanded, setExpanded] = useState(false);
  const isUser = message.role === 'user';
  const isAssistantDone = !isUser && !isStreaming && !!message.animationName;

  if (isAssistantDone && !expanded) {
    return (
      <div className={`${styles.message} ${styles.assistant}`}>
        <button type="button" className={styles.tagButton} onClick={() => setExpanded(true)}>
          🎬 {message.animationName}
          {message.hasDomUpdate && <span className={styles.domUpdateTag}>已更新预览场景</span>}
        </button>
      </div>
    );
  }

  return (
    <div className={`${styles.message} ${isUser ? styles.user : styles.assistant}`}>
      <div className={styles.role}>
        {isUser ? '你' : 'AI 助手'}
        {message.hasDomUpdate && <span className={styles.domUpdateTag}>已更新预览场景</span>}
        {isAssistantDone && expanded && (
          <button type="button" className={styles.collapseButton} onClick={() => setExpanded(false)}>
            收起
          </button>
        )}
      </div>
      <div className={styles.content}>{message.content}</div>
    </div>
  );
}
