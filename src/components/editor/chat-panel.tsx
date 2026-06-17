import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import type { ChatMessage } from '@/types/history';
import type { AnimationConfig } from '@/types/animation';
import { ChatMessageItem } from './chat-message';
import styles from './chat-panel.module.css';

export interface SendMessageOptions {
  includeFullDom: boolean;
  includeCss: boolean;
}

interface ChatPanelProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  onSendMessage: (content: string, options: SendMessageOptions) => void;
  currentConfig: AnimationConfig;
}

export function ChatPanel({ messages, isStreaming, onSendMessage }: ChatPanelProps) {
  const [inputValue, setInputValue] = useState('');
  const [includeFullDom, setIncludeFullDom] = useState(false);
  const [includeCss, setIncludeCss] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const doSend = () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isStreaming) {
      return;
    }
    onSendMessage(trimmed, { includeFullDom, includeCss });
    setInputValue('');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      doSend();
    }
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
      <div className={styles.inputArea}>
        <div className={styles.inputBox}>
          <div className={styles.inputWrapper}>
            <div className={styles.inputMirror} aria-hidden="true">
              {inputValue}
              <br />
            </div>
            <textarea
              className={styles.input}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isStreaming ? 'AI 正在回复...' : '描述动画效果或预览场景，如"创建三个卡片布局"...'}
              aria-label="动画描述输入框"
            />
          </div>
          <div className={styles.inputFooter}>
            <div className={styles.options}>
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={includeFullDom}
                  onChange={(e) => setIncludeFullDom(e.target.checked)}
                  aria-label="携带全量 DOM"
                />
                携带全量 DOM
              </label>
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={includeCss}
                  onChange={(e) => setIncludeCss(e.target.checked)}
                  aria-label="携带 CSS 样式"
                />
                携带 CSS 样式
              </label>
            </div>
            <button
              className={styles.sendButton}
              type="button"
              onClick={doSend}
              disabled={!inputValue.trim() || isStreaming}
              aria-label="发送"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M8 12V4M8 4L4 8M8 4L12 8"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
