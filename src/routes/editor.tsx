import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useHistoryTree } from '@/hooks/use-history-tree';
import { useAIChat } from '@/hooks/use-ai-chat';
import { useModelLoader } from '@/hooks/use-model-loader';
import { useEditorState } from '@/hooks/use-editor-state';
import { ChatPanel, type SendMessageOptions } from '@/components/editor/chat-panel';
import { PreviewPanel } from '@/components/editor/preview-panel';
import { CustomDomPanel } from '@/components/editor/custom-dom-panel';
import { BranchPanel } from '@/components/editor/branch-panel';
import { MessageToast } from '@/components/editor/message-toast';
import { createInitialConfig, DEFAULT_PREVIEW_DOM } from '@/constants/templates';
import {
  decodeConfigFromQuery,
  clearAnimationQuery,
  exportProjectToFile,
  importProjectFromFile,
  encodeConfigToQuery,
} from '@/utils/editor/share-utils';
import { dispatchEditorEvent, EDITOR_EVENTS, onEditorEvent } from '@/utils/editor/event-bus';
import { logger } from '@/libs/logger';
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
import type { HistoryNodeData } from '@/types/history';
import styles from '@/styles/editor.module.css';

function EditorPage() {
  const [animationId] = useState(() => {
    const projectData = decodeConfigFromQuery(globalThis.location.search);
    return projectData?.config?.id ?? generateAnimationId();
  });

  const [initialNodeData] = useState<HistoryNodeData>(() => {
    const projectData = decodeConfigFromQuery(globalThis.location.search);
    if (projectData) {
      clearAnimationQuery();
    }
    const config = projectData?.config ?? createInitialConfig(animationId);
    return {
      config,
      label: projectData ? '导入的配置' : '初始版本',
      source: 'manual',
      timestamp: Date.now(),
      messages: [],
      customDom: projectData?.customDom ?? DEFAULT_PREVIEW_DOM,
      customStyle: projectData?.customStyle ?? null,
    };
  });

  const { isReady, selectedNodeId, setSelectedNodeId } = useEditorState(animationId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { currentConfig, conversationHistory, commit, checkout, getNode, getSnapshot, getInheritedDomStyle } =
    useHistoryTree(initialNodeData);

  const { messages, isStreaming, sendMessage } = useAIChat();
  const { isLoaded, error: modelError } = useModelLoader();

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
      if (!isLoaded) {
        logger.warn('routes.editor.sendMessage', '模型尚未加载');
        dispatchEditorEvent(EDITOR_EVENTS.MESSAGE, { text: modelError ?? '模型加载中，请稍候...', type: 'info' });
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
        currentStyle,
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
    [currentConfig, sendMessage, commitAndSelect, isLoaded, modelError, messages, currentDom, currentStyle],
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

  const handleExport = useCallback(() => {
    exportProjectToFile({
      config: currentConfig,
      customDom: currentDom,
      customStyle: currentStyle,
    });
  }, [currentConfig, currentDom, currentStyle]);

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleImportFile = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      const projectData = await importProjectFromFile(file);
      if (projectData) {
        commitAndSelect({
          config: projectData.config,
          label: `导入: ${projectData.config.name}`,
          source: 'manual',
          messages: [],
          customDom: projectData.customDom,
          customStyle: projectData.customStyle,
        });
      }
      // Reset input so the same file can be used again
      event.target.value = '';
    },
    [commitAndSelect],
  );

  const handleShare = useCallback(() => {
    const query = encodeConfigToQuery({
      config: currentConfig,
      customDom: currentDom,
      customStyle: currentStyle,
    });
    if (!query) {
      dispatchEditorEvent(EDITOR_EVENTS.MESSAGE, { text: '生成分享链接失败', type: 'error' });
      return;
    }
    const shareUrl = `${globalThis.location.origin}${globalThis.location.pathname}?${query}`;
    navigator.clipboard.writeText(shareUrl).then(
      () => {
        logger.info('routes.editor.share', 'Share URL copied to clipboard');
        dispatchEditorEvent(EDITOR_EVENTS.MESSAGE, { text: '分享链接已复制到剪贴板', type: 'success' });
      },
      () => {
        dispatchEditorEvent(EDITOR_EVENTS.MESSAGE, { text: '复制链接失败，请手动复制地址栏链接', type: 'error' });
      },
    );
  }, [currentConfig, currentDom, currentStyle]);

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
      <div className={styles.toolbar}>
        <button type="button" className={styles.toolbarButton} onClick={handleImportClick}>
          导入
        </button>
        <button type="button" className={styles.toolbarButton} onClick={handleExport}>
          导出
        </button>
        <button type="button" className={styles.toolbarButton} onClick={handleShare}>
          分享
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className={styles.hiddenInput}
          onChange={handleImportFile}
          aria-label="导入动画配置文件"
        />
      </div>
      <ChatPanel
        messages={displayMessages}
        isStreaming={isStreaming}
        onSendMessage={handleSendMessage}
        currentConfig={currentConfig}
      />
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
  component: EditorPage,
});
