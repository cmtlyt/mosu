import { useState, useCallback } from 'react';

interface UseEditorStateReturn {
  isReady: boolean;
  selectedNodeId: string | null;
  isStreaming: boolean;
  setSelectedNodeId: (nodeId: string | null) => void;
  setIsStreaming: (streaming: boolean) => void;
}

/**
 * 编辑器全局状态 hook（本地状态版本）
 * 后续接入 lockData 实现多端协同时，只需替换内部实现，外部 API 保持不变
 */
export function useEditorState(_animationId: string): UseEditorStateReturn {
  const [selectedNodeId, setSelectedNodeIdState] = useState<string | null>(null);
  const [isStreaming, setIsStreamingState] = useState(false);

  const setSelectedNodeId = useCallback((nodeId: string | null) => {
    setSelectedNodeIdState(nodeId);
  }, []);

  const setIsStreaming = useCallback((streaming: boolean) => {
    setIsStreamingState(streaming);
  }, []);

  return {
    isReady: true,
    selectedNodeId,
    isStreaming,
    setSelectedNodeId,
    setIsStreaming,
  };
}
