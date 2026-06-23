import { useState, useCallback, useEffect, useMemo } from 'react';
import { createFileRoute, getRouteApi, useNavigate } from '@tanstack/react-router';
import { useHistoryTree } from '@/hooks/use-history-tree';
import { useAIChat } from '@/hooks/use-ai-chat';
import { useEditorState } from '@/hooks/use-editor-state';
import { ChatPanel, type SendMessageOptions } from '@/components/editor/chat-panel';
import { PreviewPanel } from '@/components/editor/preview-panel';
import { CustomDomPanel } from '@/components/editor/custom-dom-panel';
import { BranchPanel } from '@/components/editor/branch-panel';
import { MessageToast } from '@/components/editor/message-toast';
import { EditorToolbar } from '@/components/editor/editor-toolbar';
import { createInitialConfig, DEFAULT_PREVIEW_DOM } from '@/constants/templates';
import { decodeConfigFromQuery } from '@/utils/editor/share-utils';
import { dispatchEditorEvent, EDITOR_EVENTS, onEditorEvent } from '@/utils/editor/event-bus';
import { logger } from '@lib/logger';
import { generateDomSummary } from '@/utils/editor/dom-summary';
import {
  processDomPatch,
  processStyle,
  processAnimationConfig,
  buildFullConfig,
  prepareMessagesForCommit,
  generateAnimationId,
  tryGetNodeData,
  computeStyles,
} from '@/utils/editor/ai-response-processor';
import type { AnimationConfig } from '@lib/animation-sdk';
import type { HistoryNodeData } from '@/types/history';
import styles from '@/styles/editor.module.css';

const routeApi = getRouteApi('/editor');

function EditorPage() {
  const navigate = useNavigate();
  const { config: queryConfig } = routeApi.useSearch();
  const [initialProjectData] = useState(() => decodeConfigFromQuery(queryConfig));

  useEffect(() => {
    if (queryConfig) {
      navigate({ to: '/editor', search: {}, replace: true });
    }
  }, [navigate, queryConfig]);

  useEffect(() => {
    document.title = 'Mosu Editor';
    return () => {
      document.title = 'Mosu';
    };
  }, []);
  const [animationId] = useState(() => initialProjectData?.config?.id ?? generateAnimationId());

  const [initialNodeData] = useState<HistoryNodeData>(() => {
    const config = initialProjectData?.config ?? createInitialConfig(animationId);
    return {
      config,
      label: initialProjectData ? '导入的配置' : '初始版本',
      source: 'manual',
      timestamp: Date.now(),
      messages: [],
      customDom: initialProjectData?.customDom ?? DEFAULT_PREVIEW_DOM,
      customStyle: initialProjectData?.customStyle ?? null,
    };
  });

  const { isReady, selectedNodeId, setSelectedNodeId } = useEditorState(animationId);

  const { currentConfig, conversationHistory, commit, checkout, getNode, getSnapshot, getInheritedDomStyle } =
    useHistoryTree(initialNodeData);

  const { messages, isStreaming, sendMessage } = useAIChat();
  const [isAIConfigured] = useState(() => Boolean(localStorage.getItem('mosu_ai_base_url')));

  const selectedNodeData = selectedNodeId ? tryGetNodeData(getNode, selectedNodeId) : null;

  const inherited = getInheritedDomStyle();
  const currentDom = selectedNodeData?.customDom ?? inherited.customDom ?? initialNodeData.customDom;
  const currentStyle = selectedNodeData?.customStyle ?? inherited.customStyle ?? initialNodeData.customStyle;

  const commitAndSelect = useCallback(
    (data: Omit<HistoryNodeData, 'timestamp'>) => {
      const nodeId = commit(data);
      setSelectedNodeId(nodeId);
      return nodeId;
    },
    [commit, setSelectedNodeId],
  );

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
      dispatchEditorEvent(EDITOR_EVENTS.MESSAGE, { text: message, type: 'error' });
    });

    return () => {
      unsubStreamError();
    };
  }, []);

  const handleSendMessage = useCallback(
    async (content: string, options: SendMessageOptions) => {
      if (!isAIConfigured) {
        logger.warn('routes.editor.sendMessage', 'AI not configured');
        dispatchEditorEvent(EDITOR_EVENTS.MESSAGE, { text: 'AI 未配置，请在设置中配置 AI API', type: 'error' });
        return;
      }

      const domContent = currentDom
        ? options.includeFullDom
          ? currentDom
          : generateDomSummary(currentDom)
        : undefined;

      const result = await sendMessage(content, currentConfig, {
        domContent,
        isFullDom: options.includeFullDom,
        includeCss: options.includeCss,
        includeAnimationConfig: options.includeAnimationConfig,
        currentStyle,
        includeFullContext: options.includeFullContext,
        conversationHistory,
      });

      if (!result.response) {
        return;
      }

      const patchedDom = processDomPatch(result.response, currentDom);
      const sanitizedStyle = processStyle(result.response);
      const mergedConfig = processAnimationConfig(result.response, currentConfig);
      const fullConfig = buildFullConfig(mergedConfig, content);

      const hasUpdate = patchedDom !== null || !!sanitizedStyle;
      const messagesToCommit = prepareMessagesForCommit(result.messages, messages, hasUpdate);

      const finalDom = patchedDom === null ? currentDom : patchedDom;
      const finalStyle = computeStyles(currentStyle, sanitizedStyle, options.includeCss);

      commitAndSelect({
        config: fullConfig,
        label: fullConfig.name,
        source: 'ai',
        messages: messagesToCommit,
        customDom: finalDom,
        customStyle: finalStyle,
      });

      dispatchEditorEvent(EDITOR_EVENTS.CONFIG_COMMITTED);
      dispatchEditorEvent(EDITOR_EVENTS.MESSAGE, { text: '动画配置已更新', type: 'success' });
    },
    [
      currentConfig,
      sendMessage,
      commitAndSelect,
      isAIConfigured,
      messages,
      currentDom,
      currentStyle,
      conversationHistory,
    ],
  );

  const handleCustomChange = useCallback(
    (dom: string | null, style: string | null) => {
      commitAndSelect({
        config: currentConfig,
        label: '手动更新预览内容',
        source: 'manual',
        messages: [],
        customDom: dom,
        customStyle: style,
      });
    },
    [currentConfig, commitAndSelect],
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

  const handleImport = useCallback(
    (config: AnimationConfig, customDom: string | null, customStyle: string | null) => {
      commitAndSelect({
        config,
        label: `导入: ${config.name}`,
        source: 'manual',
        messages: [],
        customDom,
        customStyle,
      });
    },
    [commitAndSelect],
  );

  const handleNodeEditCommit = useCallback(
    (editedData: Omit<HistoryNodeData, 'timestamp'>) => {
      commitAndSelect(editedData);
      dispatchEditorEvent(EDITOR_EVENTS.MESSAGE, { text: '已从编辑创建新节点', type: 'success' });
    },
    [commitAndSelect],
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
      <EditorToolbar
        currentConfig={currentConfig}
        currentDom={currentDom}
        currentStyle={currentStyle}
        onImport={handleImport}
      />
      {isAIConfigured && (
        <ChatPanel
          messages={displayMessages}
          isStreaming={isStreaming}
          onSendMessage={handleSendMessage}
          currentConfig={currentConfig}
        />
      )}
      <div className={styles.previewColumn}>
        <CustomDomPanel customDom={currentDom} customStyle={currentStyle} onApply={handleCustomChange} />
        <PreviewPanel config={currentConfig} customDom={currentDom} customStyle={currentStyle} />
      </div>
      <BranchPanel
        snapshot={snapshot}
        selectedNodeId={selectedNodeId}
        selectedNodeData={selectedNodeData}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onCommitEdit={handleNodeEditCommit}
      />
      <MessageToast />
    </div>
  );
}

export const Route = createFileRoute('/editor')({
  validateSearch(search) {
    return { config: search.config } as { config?: string };
  },
  component: EditorPage,
});
