import { useState, useCallback, useEffect } from 'react';
import { createFileRoute, getRouteApi, useNavigate } from '@tanstack/react-router';
import { useHistoryTree } from '@/hooks/use-history-tree';
import { useAIChat } from '@/hooks/use-ai-chat';
import { useEditorState } from '@/hooks/use-editor-state';
import { ChatPanel, type SendMessageOptions } from '@/components/editor/chat-panel';
import { PreviewPanel } from '@/components/editor/preview-panel';
import { CustomDomPanel } from '@/components/editor/custom-dom-panel';
import { BranchPanel } from '@/components/editor/branch-panel';
import { EditorToolbar } from '@/components/editor/editor-toolbar';
import { AppSetupDialog } from '@/components/app-setup-dialog';
import { isAIConfigured } from '@/constants/api-config';
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
import type { HistoryNodeInfo } from '@cmtlyt/lingshu-toolkit/shared/history-tree';
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

  const {
    currentConfig,
    conversationHistory,
    commit,
    checkout,
    getNode,
    getSnapshot,
    getInheritedDomStyle,
    exportTree,
    importTree,
  } = useHistoryTree(initialNodeData);

  const { messages, isStreaming, sendMessage } = useAIChat();
  const [configured, setConfigured] = useState(() => isAIConfigured());

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
      if (!configured) {
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
        includeFullDom: options.includeFullDom,
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
      const messagesToCommit = prepareMessagesForCommit(result.newMessages, hasUpdate);

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
    [currentConfig, sendMessage, commitAndSelect, configured, currentDom, currentStyle, conversationHistory],
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

  const handleCopyContext = useCallback(
    async (nodeData: HistoryNodeData) => {
      // 构建从根节点到当前节点的完整路径
      const snapshot = getSnapshot();
      const path: HistoryNodeData[] = [];

      // 找到当前节点的 ID
      let currentId: string | null = null;
      for (const [id, entry] of Object.entries(snapshot.nodes) as [string, HistoryNodeInfo<HistoryNodeData>][]) {
        if (entry.data === nodeData) {
          currentId = id;
          break;
        }
      }

      if (!currentId) {
        dispatchEditorEvent(EDITOR_EVENTS.MESSAGE, { text: '无法找到节点路径', type: 'error' });
        return;
      }

      // 从当前节点向上遍历到根节点
      let nodeId: string | null = currentId;
      while (nodeId) {
        const nodeEntry: HistoryNodeInfo<HistoryNodeData> | undefined = snapshot.nodes[nodeId];
        if (nodeEntry) {
          path.unshift(nodeEntry.data);
          nodeId = nodeEntry.parentId;
        } else {
          break;
        }
      }

      // 构建上下文：合并所有对话记录，最终状态取最后一个节点
      const allMessages = path.flatMap((node) => node.messages);
      const finalNode = path[path.length - 1];

      const context = {
        path: path.map((node, index) => ({
          step: index + 1,
          label: node.label,
          source: node.source,
          timestamp: node.timestamp,
          messageCount: node.messages.length,
        })),
        conversationHistory: allMessages,
        finalState: {
          config: finalNode.config,
          customDom: finalNode.customDom,
          customStyle: finalNode.customStyle,
        },
      };

      try {
        await navigator.clipboard.writeText(JSON.stringify(context, null, 2));
        dispatchEditorEvent(EDITOR_EVENTS.MESSAGE, {
          text: `上下文已复制（${path.length} 个节点，${allMessages.length} 条对话）`,
          type: 'success',
        });
      } catch (error) {
        dispatchEditorEvent(EDITOR_EVENTS.MESSAGE, { text: `复制失败: ${(error as Error).message}`, type: 'error' });
      }
    },
    [getSnapshot],
  );

  const handleImportTree = useCallback(
    async (file: File) => {
      const success = await importTree(file);
      if (success) {
        dispatchEditorEvent(EDITOR_EVENTS.MESSAGE, { text: '历史树导入成功', type: 'success' });
      } else {
        dispatchEditorEvent(EDITOR_EVENTS.MESSAGE, { text: '历史树导入失败', type: 'error' });
      }
    },
    [importTree],
  );

  const snapshot = getSnapshot();

  if (!isReady) {
    return (
      <div className={styles.editorPage} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p>编辑器初始化中...</p>
      </div>
    );
  }

  if (!configured) {
    return (
      <AppSetupDialog
        onComplete={() => {
          setConfigured(true);
        }}
      />
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
      <ChatPanel
        messages={messages}
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
        onExportTree={exportTree}
        onImportTree={handleImportTree}
        onCopyContext={handleCopyContext}
      />
    </div>
  );
}

export const Route = createFileRoute('/editor')({
  validateSearch(search) {
    return { config: search.config } as { config?: string };
  },
  component: EditorPage,
});
