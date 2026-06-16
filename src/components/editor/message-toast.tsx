import { useState, useEffect, useCallback } from 'react';
import { onEditorEvent, EDITOR_EVENTS } from '@/libs/event-bus';
import styles from './message-toast.module.css';

interface MessageItem {
  id: number;
  text: string;
  type: 'success' | 'error' | 'info';
}

let messageIdCounter = 0;

export function MessageToast() {
  const [messages, setMessages] = useState<MessageItem[]>([]);

  const addMessage = useCallback((text: string, type: MessageItem['type']) => {
    const id = ++messageIdCounter;
    setMessages((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setMessages((prev) => prev.filter((msg) => msg.id !== id));
    }, 3000);
  }, []);

  useEffect(() => {
    const unsubscribe = onEditorEvent(EDITOR_EVENTS.MESSAGE, (detail) => {
      const { text, type } = detail as { text: string; type?: MessageItem['type'] };
      addMessage(text, type ?? 'info');
    });
    return unsubscribe;
  }, [addMessage]);

  if (messages.length === 0) {
    return null;
  }

  return (
    <div className={styles.messageToast}>
      {messages.map((msg) => (
        <div key={msg.id} className={`${styles.messageItem} ${styles[msg.type]}`}>
          {msg.text}
        </div>
      ))}
    </div>
  );
}
