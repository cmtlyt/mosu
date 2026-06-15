import { useState, useRef, useEffect } from 'react';
import type { ChatMessage } from '@/types/history';
import type { AnimationConfig } from '@/types/animation';
import { ChatMessageItem } from './chat-message';
import styles from './chat-panel.module.css';

interface ChatPanelProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  onSendMessage: (content: string) => void;
  currentConfig: AnimationConfig;
}

export function ChatPanel({ messages, isStreaming, onSendMessage }: ChatPanelProps) {
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (event: Event) => {
    event.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed || isStreaming) {
      return;
    }
    onSendMessage(trimmed);
    setInputValue('');
  };

  return (
    <div className={styles.chatPanel}>
      <div className={styles.messages}>
        {messages.map((msg) => (
          <ChatMessageItem key={msg.id} message={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>
      <form className={styles.inputArea} onSubmit={handleSubmit}>
        <input
          className={styles.input}
          type="text"
          value={inputValue}
          onInput={(e) => setInputValue((e.target as HTMLInputElement).value)}
          placeholder={isStreaming ? 'AI is responding...' : 'Describe your animation...'}
          disabled={false}
        />
        <button className={styles.sendButton} type="submit" disabled={!inputValue.trim() || isStreaming}>
          Send
        </button>
      </form>
    </div>
  );
}
