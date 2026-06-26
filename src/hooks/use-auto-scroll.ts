import { useRef, useEffect, useState, useCallback } from 'react';
import { debounce } from '@lib/debounce';
import type { ChatMessage } from '@/types/history';

interface BranchScrollState {
  scrollTop: number;
  autoScrollEnabled: boolean;
  isAtBottom: boolean;
}

export function useAutoScroll(messages: ChatMessage[], isStreaming: boolean, branchId = 'default') {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const branchScrollStatesRef = useRef<Map<string, BranchScrollState>>(new Map());
  const previousBranchIdRef = useRef(branchId);
  const [isAtBottom, setIsAtBottom] = useState(true);

  // 切换分支时：保存旧分支状态，恢复新分支状态
  useEffect(() => {
    const container = scrollContainerRef.current;
    const prevBranchId = previousBranchIdRef.current;

    if (prevBranchId !== branchId && container) {
      // 保存旧分支的滚动状态
      const prevState = branchScrollStatesRef.current.get(prevBranchId) ?? {
        scrollTop: 0,
        autoScrollEnabled: true,
        isAtBottom: true,
      };
      prevState.scrollTop = container.scrollTop;
      prevState.isAtBottom = isAtBottom;
      branchScrollStatesRef.current.set(prevBranchId, prevState);

      // 恢复新分支的滚动状态
      const newState = branchScrollStatesRef.current.get(branchId);
      if (newState) {
        container.scrollTop = newState.scrollTop;
        setIsAtBottom(newState.isAtBottom);
      } else {
        container.scrollTop = 0;
        setIsAtBottom(true);
      }

      previousBranchIdRef.current = branchId;
    }
  }, [branchId, isAtBottom]);

  // 每次新对话开始时重置当前分支的自动滚动
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === 'user') {
      const state = branchScrollStatesRef.current.get(branchId) ?? {
        scrollTop: 0,
        autoScrollEnabled: true,
        isAtBottom: true,
      };
      state.autoScrollEnabled = true;
      branchScrollStatesRef.current.set(branchId, state);
    }
  }, [messages, branchId]);

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
      if (currentScrollTop < previousScrollTop) {
        const state = branchScrollStatesRef.current.get(branchId) ?? {
          scrollTop: 0,
          autoScrollEnabled: true,
          isAtBottom: true,
        };
        state.autoScrollEnabled = false;
        branchScrollStatesRef.current.set(branchId, state);
        container.removeEventListener('scroll', handleScroll);
      }
      previousScrollTop = currentScrollTop;
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [isStreaming, branchId]);

  // 自动滚动到底部
  useEffect(() => {
    const state = branchScrollStatesRef.current.get(branchId);
    if (state && !state.autoScrollEnabled) {
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  const scrollToBottom = useCallback(() => {
    const state = branchScrollStatesRef.current.get(branchId) ?? {
      scrollTop: 0,
      autoScrollEnabled: true,
      isAtBottom: true,
    };
    branchScrollStatesRef.current.set(branchId, state);
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [branchId]);

  return { scrollContainerRef, messagesEndRef, scrollToBottom, isAtBottom };
}
