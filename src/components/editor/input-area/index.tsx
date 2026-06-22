import { memo, useState, type KeyboardEvent } from 'react';
import type { ToggleGroupRef } from '../toggle-group';
import { ToggleGroup } from '../toggle-group';
import styles from '../chat-panel/index.module.css';

interface InputAreaProps {
  isStreaming: boolean;
  toggleGroupRef: React.RefObject<ToggleGroupRef | null>;
  onSend: (content: string) => void;
}

export const InputArea = memo(({ isStreaming, toggleGroupRef, onSend }: InputAreaProps) => {
  const [inputValue, setInputValue] = useState('');
  const [isComposing, setIsComposing] = useState(false);

  const doSend = () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isStreaming) {
      return;
    }
    onSend(trimmed);
    setInputValue('');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !isComposing) {
      event.preventDefault();
      doSend();
    }
  };

  return (
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
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            placeholder={isStreaming ? 'AI 正在回复...' : '描述动画效果或预览场景，如"创建三个卡片布局"...'}
            aria-label="动画描述输入框"
          />
        </div>
        <div className={styles.inputFooter}>
          <ToggleGroup ref={toggleGroupRef} />
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
  );
});
