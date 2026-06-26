import { useRef, useEffect, useState, useCallback } from 'react';
import { debounce } from '@lib/debounce';
import type { ChatMessage } from '@/types/history';

export function useAutoScroll(messages: ChatMessage[], isStreaming: boolean) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const autoScrollEnabledRef = useRef(true);
  const [isAtBottom, setIsAtBottom] = useState(true);

  // 每次新对话开始时重置自动滚动
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === 'user') {
      autoScrollEnabledRef.current = true;
    }
  }, [messages]);

  // IntersectionObserver 监听 end 元素是否在视口内（带防抖）
  useEffect(() => {
    const endElement = messagesEndRef.current;
    const container = scrollContainerRef.current;
    if (!endElement || !container) {
      return;
    }

    const debouncedSetIsAtBottom = debounce(setIsAtBottom, 100);

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries[0]?.isIntersecting ?? false;
        debouncedSetIsAtBottom(visible);
      },
      { root: container, threshold: 0, scrollMargin: '25px' },
    );

    observer.observe(endElement);
    return () => observer.disconnect();
  }, []);

  // 动态管理 scroll 事件监听器（仅在 autoScrollEnabled 时监听）
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !isStreaming) {
      return;
    }

    let previousScrollTop = container.scrollTop;

    const handleScroll = () => {
      if (!isStreaming) {
        return;
      }
      const currentScrollTop = container.scrollTop;
      // 用户主动上滚：scrollTop 比之前小
      if (currentScrollTop < previousScrollTop) {
        autoScrollEnabledRef.current = false;
        container.removeEventListener('scroll', handleScroll);
      }
      previousScrollTop = currentScrollTop;
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [isStreaming]);

  // 自动滚动到底部
  useEffect(() => {
    if (!autoScrollEnabledRef.current) {
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  return { scrollContainerRef, messagesEndRef, scrollToBottom, isAtBottom };
}
