import type { SubmitEvent } from 'react';
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

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
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
        {messages.map((msg, index) => {
          const isLastAssistant = msg.role === 'assistant' && index === messages.length - 1;
          return <ChatMessageItem key={msg.id} message={msg} isStreaming={isLastAssistant && isStreaming} />;
        })}
        <div ref={messagesEndRef} />
      </div>
      <form className={styles.inputArea} onSubmit={handleSubmit}>
        <input
          className={styles.input}
          type="text"
          value={inputValue}
          onInput={(e) => setInputValue((e.target as HTMLInputElement).value)}
          placeholder={isStreaming ? 'AI 正在回复...' : '描述动画效果或预览场景，如"创建三个卡片布局"...'}
          aria-label="动画描述输入框"
          disabled={false}
        />
        <button className={styles.sendButton} type="submit" disabled={!inputValue.trim() || isStreaming}>
          发送
        </button>
      </form>
    </div>
  );
}
