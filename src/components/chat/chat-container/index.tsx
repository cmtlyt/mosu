import { memo } from 'react';
import { useSimpleChat } from '@/hooks/use-simple-chat';
import { ChatMessageList } from '@/components/chat/chat-message-list';
import { InputArea } from '@/components/chat/input-area';
import styles from './index.module.css';

export const ChatContainer = memo(() => {
  const { messages, isStreaming, sendMessage, clearMessages } = useSimpleChat();

  return (
    <div className={styles.chatContainer}>
      <header className={styles.header}>
        <h1 className={styles.title}>AI 对话</h1>
        {messages.length > 0 && (
          <button type="button" className={styles.clearButton} onClick={clearMessages}>
            清空对话
          </button>
        )}
      </header>
      {messages.length === 0 ? (
        <div className={styles.emptyState}>开始新的对话，输入你的问题吧</div>
      ) : (
        <ChatMessageList messages={messages} isStreaming={isStreaming} enableCollapse={false} />
      )}
      <InputArea isStreaming={isStreaming} onSend={sendMessage} showToggleGroup={false} placeholder="输入你的问题..." />
    </div>
  );
});
