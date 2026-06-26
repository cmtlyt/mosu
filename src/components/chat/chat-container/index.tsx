import { memo, useCallback, useMemo, useRef, useEffect } from 'react';
import { useSimpleChat } from '@/hooks/use-simple-chat';
import { ChatMessageList } from '@/components/chat/chat-message-list';
import { InputArea } from '@/components/chat/input-area';
import { ConversationList } from '@/components/chat/conversation-list';
import { ChatHistoryPanel } from '@/components/chat/chat-history-panel';
import styles from './index.module.css';

export const ChatContainer = memo(() => {
  const {
    messages,
    isStreaming,
    sendMessage,
    createNewConversation,
    getSnapshot,
    currentId,
    checkout,
    getLeafNodes,
    exportConversation,
    exportTree,
    deleteConversation,
    importConversations,
    saveToOPFS,
    loadFromOPFS,
  } = useSimpleChat();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const leafNodes = useMemo(() => getLeafNodes(), [getLeafNodes]);
  const snapshot = getSnapshot();

  // 组件挂载时从 OPFS 加载历史树
  useEffect(() => {
    loadFromOPFS();
  }, [loadFromOPFS]);

  // 历史树变化时保存到 OPFS（防抖 1 秒）
  useEffect(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveToOPFS();
    }, 1000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [snapshot, saveToOPFS]);

  // 左侧列表单击 checkout
  const handleListCheckout = useCallback(
    (nodeId: string) => {
      checkout(nodeId);
    },
    [checkout],
  );

  // 右侧历史树双击 checkout
  const handleTreeCheckout = useCallback(
    (nodeId: string) => {
      checkout(nodeId);
    },
    [checkout],
  );

  // 导出对话
  const handleExport = useCallback(
    (nodeId: string) => {
      exportConversation(nodeId);
    },
    [exportConversation],
  );

  // 删除对话
  const handleDelete = useCallback(
    (nodeId: string) => {
      deleteConversation(nodeId);
    },
    [deleteConversation],
  );

  // 导入对话
  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        const success = await importConversations(file);
        if (success) {
          // 导入成功后重置 file input
          event.target.value = '';
        }
      }
    },
    [importConversations],
  );

  return (
    <div className={styles.chatContainer}>
      {/* 左侧：叶子节点列表（单击 checkout） */}
      <ConversationList
        leafNodes={leafNodes}
        currentId={currentId}
        onNodeClick={handleListCheckout}
        onExport={handleExport}
        onDelete={handleDelete}
      />

      {/* 中间：对话区域 */}
      <div className={styles.chatMain}>
        <header className={styles.header}>
          <h1 className={styles.title}>AI 对话</h1>
          <div className={styles.headerActions}>
            <button type="button" className={styles.importButton} onClick={handleImportClick}>
              导入对话
            </button>
            <button type="button" className={styles.newConversationButton} onClick={createNewConversation}>
              创建新对话
            </button>
          </div>
        </header>
        {messages.length === 0 ? (
          <div className={styles.emptyState}>开始新的对话，输入你的问题吧</div>
        ) : (
          <ChatMessageList messages={messages} isStreaming={isStreaming} enableCollapse={false} branchId={currentId} />
        )}
        <InputArea
          isStreaming={isStreaming}
          onSend={sendMessage}
          showToggleGroup={false}
          placeholder="输入你的问题..."
        />
      </div>

      {/* 右侧：历史树（双击 checkout） */}
      <ChatHistoryPanel
        snapshot={snapshot}
        currentId={currentId}
        onNodeDoubleClick={handleTreeCheckout}
        onExportTree={exportTree}
      />

      {/* 隐藏的文件输入框 */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileChange}
        style={{ display: 'none' }}
        aria-label="导入对话文件"
      />
    </div>
  );
});
