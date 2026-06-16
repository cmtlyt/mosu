import { useState, useCallback, useEffect, useMemo } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useHistoryTree } from '@/hooks/use-history-tree';
import { useAIChat } from '@/hooks/use-ai-chat';
import { useModelLoader } from '@/hooks/use-model-loader';
import { useEditorState } from '@/hooks/use-editor-state';
import { ChatPanel } from '@/components/editor/chat-panel';
import { PreviewPanel } from '@/components/editor/preview-panel';
import { BranchPanel } from '@/components/editor/branch-panel';
import { createInitialConfig, DEFAULT_PREVIEW_DOM } from '@/constants/templates';
import { decodeConfigFromQuery } from '@/libs/share-utils';
import { dispatchEditorEvent, EDITOR_EVENTS, onEditorEvent } from '@/libs/event-bus';
import { logger } from '@/libs/logger';
import { sanitizeStyle } from '@/libs/dom-sanitizer';
import { generateDomSummary } from '@/libs/dom-summary';
import { mergeStyles } from '@/libs/style-merger';
import { applyDomPatch } from '@/libs/dom-patcher';
import type { HistoryNodeData } from '@/types/history';
import type { AnimationConfig } from '@/types/animation';
import styles from '@/styles/editor.module.css';

function generateAnimationId(): string {
  return `anim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function tryGetNodeData(
  getNode: (nodeId: string) => { data: HistoryNodeData },
  nodeId: string,
): HistoryNodeData | null {
  try {
    return getNode(nodeId).data;
  } catch {
    return null;
  }
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
      customDom: DEFAULT_PREVIEW_DOM,
      customStyle: null,
    };
  });

  const { isReady, selectedNodeId, setSelectedNodeId } = useEditorState(animationId);
  const [errorToast, setErrorToast] = useState<string | null>(null);

  const { currentConfig, conversationHistory, commit, checkout, getNode, getSnapshot, getInheritedDomStyle } =
    useHistoryTree(initialNodeData);

  const { messages, isStreaming, sendMessage } = useAIChat();
  const { isLoaded, error: modelError } = useModelLoader();

  const selectedNodeData = selectedNodeId ? tryGetNodeData(getNode, selectedNodeId) : null;

  const inherited = getInheritedDomStyle();
  const currentDom = selectedNodeData?.customDom ?? inherited.customDom ?? initialNodeData.customDom;
  const currentStyle = selectedNodeData?.customStyle ?? inherited.customStyle ?? initialNodeData.customStyle;

  const displayMessages = useMemo(() => {
    if (messages.length === 0) {
      return conversationHistory;
    }
    const historyIds = new Set(conversationHistory.map((msg) => msg.id));
    const streamingOnly = messages.filter((msg) => !historyIds.has(msg.id));
    return [...conversationHistory, ...streamingOnly];
  }, [conversationHistory, messages]);

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
        logger.warn('routes.editor.sendMessage', '模型尚未加载');
        setErrorToast(modelError ?? '模型加载中，请稍候...');
        return;
      }

      const domSummary = currentDom ? generateDomSummary(currentDom) : '';
      const result = await sendMessage(content, currentConfig, domSummary);

      if (result.response) {
        let patchedDom: string | null = null;
        let sanitizedStyle: string | null = null;

        if (result.response.domPatch && result.response.domPatch.length > 0) {
          const baseDom = currentDom ?? '';
          const { html, result: patchResult } = applyDomPatch(baseDom, result.response.domPatch);
          if (patchResult.skipped > 0) {
            logger.warn(
              'routes.editor.patch',
              `DOM patch partially applied: ${patchResult.applied} ok, ${patchResult.skipped} skipped`,
              patchResult.errors,
            );
            setErrorToast(`DOM 变更部分应用成功，${patchResult.skipped} 条指令因选择器无效被跳过`);
          }
          patchedDom = html;
        }

        if (result.response.style) {
          sanitizedStyle = sanitizeStyle(result.response.style);
          if (sanitizedStyle === null) {
            logger.warn('routes.editor.sanitize.style', 'AI generated style contains animation properties');
            setErrorToast('AI 生成的样式包含动画属性，已忽略样式更新');
          }
        }

        const hasUpdate = patchedDom !== null || !!sanitizedStyle;
        const newMessages = result.messages.map((msg) => ({
          ...msg,
          hasDomUpdate: msg.role === 'assistant' && hasUpdate,
        }));

        const messagesToCommit = newMessages.filter((msg) => !messages.some((existing) => existing.id === msg.id));

        const fullConfig: AnimationConfig = {
          version: '1.0',
          id: generateAnimationId(),
          name: result.response.config.name || content.slice(0, 20) + (content.length > 20 ? '...' : ''),
          tracks: result.response.config.tracks,
        };

        const finalDom = patchedDom === null ? currentDom : patchedDom;
        const finalStyle = mergeStyles(currentStyle, sanitizedStyle);

        const newNodeId = commit({
          config: fullConfig,
          label: fullConfig.name,
          source: 'ai',
          messages: messagesToCommit,
          customDom: finalDom,
          customStyle: finalStyle,
        });

        setSelectedNodeId(newNodeId);
        dispatchEditorEvent(EDITOR_EVENTS.CONFIG_COMMITTED);
      }
    },
    [currentConfig, sendMessage, commit, isLoaded, modelError, messages, currentDom, currentStyle, setSelectedNodeId],
  );

  const handleCustomChange = useCallback(
    (dom: string | null, style: string | null) => {
      const newNodeId = commit({
        config: currentConfig,
        label: '手动更新预览内容',
        source: 'manual',
        messages: [],
        customDom: dom,
        customStyle: style,
      });
      setSelectedNodeId(newNodeId);
    },
    [currentConfig, commit, setSelectedNodeId],
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

  const snapshot = getSnapshot();

  if (!isReady) {
    return (
      <div className={styles.editorPage} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p>编辑器初始化中...</p>
      </div>
    );
  }

  return (
    <div className={styles.editorPage}>
      <ChatPanel
        messages={displayMessages}
        isStreaming={isStreaming}
        onSendMessage={handleSendMessage}
        currentConfig={currentConfig}
      />
      <PreviewPanel
        config={currentConfig}
        customDom={currentDom}
        customStyle={currentStyle}
        onCustomChange={handleCustomChange}
      />
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
