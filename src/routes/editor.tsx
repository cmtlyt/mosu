import { useState, useCallback, useEffect } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useHistoryTree } from '@/hooks/use-history-tree';
import { useAIChat } from '@/hooks/use-ai-chat';
import { useModelLoader } from '@/hooks/use-model-loader';
import { useEditorState } from '@/hooks/use-editor-state';
import { ChatPanel } from '@/components/editor/chat-panel';
import { PreviewPanel } from '@/components/editor/preview-panel';
import { BranchPanel } from '@/components/editor/branch-panel';
import { createInitialConfig, PRESET_TEMPLATES } from '@/constants/templates';
import { decodeConfigFromQuery } from '@/libs/share-utils';
import { dispatchEditorEvent, EDITOR_EVENTS, onEditorEvent } from '@/libs/event-bus';
import { logger } from '@/libs/logger';
import type { HistoryNodeData } from '@/types/history';
import styles from '@/styles/editor.module.css';

function generateAnimationId(): string {
  return `anim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function EditorPage() {
  const [animationId] = useState(() => {
    const queryConfigFromUrl = decodeConfigFromQuery(globalThis.location.search);
    return queryConfigFromUrl?.id ?? generateAnimationId();
  });

  const [initialNodeData] = useState<HistoryNodeData>(() => {
    const queryConfigFromInit = decodeConfigFromQuery(globalThis.location.search);
    const config = queryConfigFromInit ?? createInitialConfig(animationId);
    return {
      config,
      label: queryConfigFromInit ? '导入的配置' : '初始版本',
      source: 'manual',
      timestamp: Date.now(),
      messages: [],
    };
  });

  const { isReady, selectedNodeId, setSelectedNodeId } = useEditorState(animationId);
  const [errorToast, setErrorToast] = useState<string | null>(null);

  const { currentConfig, conversationHistory, commit, checkout, getNode, getSnapshot } =
    useHistoryTree(initialNodeData);

  const { messages, isStreaming, sendMessage } = useAIChat();
  const { isLoaded, error: modelError } = useModelLoader();

  useEffect(() => {
    const unsubStreamError = onEditorEvent(EDITOR_EVENTS.AI_STREAM_ERROR, (detail) => {
      const message = (detail as { message?: string })?.message ?? '未知错误';
      setErrorToast(message);
      setTimeout(() => setErrorToast(null), 5000);
    });

    const unsubImportError = onEditorEvent(EDITOR_EVENTS.IMPORT_ERROR, (detail) => {
      const message = (detail as { message?: string })?.message ?? '导入失败';
      setErrorToast(message);
      setTimeout(() => setErrorToast(null), 5000);
    });

    return () => {
      unsubStreamError();
      unsubImportError();
    };
  }, []);

  const handleSendMessage = useCallback(
    async (content: string) => {
      if (!isLoaded) {
        logger.warn('routes.editor.sendMessage', 'Model not loaded yet');
        setErrorToast(modelError ?? '模型加载中，请稍候...');
        return;
      }

      const result = await sendMessage(content, currentConfig);

      if (result.config) {
        const newMessages = result.messages.filter((msg) => !messages.some((existing) => existing.id === msg.id));

        commit({
          config: result.config,
          label: content.slice(0, 20) + (content.length > 20 ? '...' : ''),
          source: 'ai',
          messages: newMessages,
        });

        dispatchEditorEvent(EDITOR_EVENTS.CONFIG_COMMITTED);
      }
    },
    [currentConfig, sendMessage, commit, isLoaded, modelError, messages],
  );

  const handleNodeClick = useCallback(
    (nodeId: string) => {
      setSelectedNodeId(nodeId);
    },
    [setSelectedNodeId],
  );

  const handleNodeDoubleClick = useCallback(
    (nodeId: string) => {
      checkout(nodeId);
      setSelectedNodeId(nodeId);
      dispatchEditorEvent(EDITOR_EVENTS.NODE_CHECKOUT, { nodeId });
    },
    [checkout, setSelectedNodeId],
  );

  const selectedNodeData = selectedNodeId
    ? (() => {
        try {
          return getNode(selectedNodeId).data;
        } catch {
          return null;
        }
      })()
    : null;

  const snapshot = getSnapshot();
  const [template] = PRESET_TEMPLATES;

  if (!isReady) {
    return (
      <div className={styles.editorPage} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p>Initializing editor state...</p>
      </div>
    );
  }

  return (
    <div className={styles.editorPage}>
      <ChatPanel
        messages={conversationHistory}
        isStreaming={isStreaming}
        onSendMessage={handleSendMessage}
        currentConfig={currentConfig}
      />
      <PreviewPanel config={currentConfig} template={template} />
      <BranchPanel
        snapshot={snapshot}
        selectedNodeId={selectedNodeId}
        selectedNodeData={selectedNodeData}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
      />
      {errorToast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#ef4444',
            color: '#fff',
            padding: '10px 20px',
            borderRadius: 8,
            fontSize: 14,
            zIndex: 1000,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          {errorToast}
        </div>
      )}
    </div>
  );
}

export const Route = createFileRoute('/editor')({
  component: EditorPage,
});
