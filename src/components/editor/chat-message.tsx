import type { ChatMessage } from '@/types/history';
import styles from './chat-message.module.css';

interface ChatMessageProps {
  message: ChatMessage;
}

export function ChatMessageItem({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`${styles.message} ${isUser ? styles.user : styles.assistant}`}>
      <div className={styles.role}>{isUser ? 'You' : 'AI Assistant'}</div>
      <div className={styles.content}>{message.content}</div>
    </div>
  );
}
