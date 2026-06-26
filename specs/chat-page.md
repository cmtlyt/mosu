# Chat 页面规格说明

## 功能概述

创建一个独立的 AI 对话页面，提供简洁的聊天界面，用户可以与 AI 进行实时对话。

## 技术实现方案

### 1. 路由结构

- **新增路由**：`/chat`
- **文件位置**：`src/routes/chat.tsx`
- **路由树**：自动生成到 `src/route-tree.gen.ts`

### 2. 页面组件结构

```
src/
├── routes/
│   └── chat.tsx                          # 路由页面组件
├── components/
│   └── chat/
│       ├── chat-container/               # 主容器
│       │   ├── index.tsx
│       │   └── index.module.css
│       ├── chat-message/                 # 消息项（从 editor 迁移）
│       │   ├── index.tsx
│       │   └── index.module.css
│       ├── chat-message-list/            # 消息列表（从 editor 迁移）
│       │   ├── index.tsx
│       │   └── index.module.css
│       └── input-area/                   # 输入区域（从 editor 迁移）
│           ├── index.tsx
│           └── index.module.css
└── hooks/
    ├── use-simple-chat.ts                # 简化版聊天 hook
    └── use-auto-scroll.ts                # 自动滚动管理 hook
```

**组件复用策略**：将 editor 的通用聊天组件迁移到 `src/components/chat/` 目录，editor 的 `chat-panel` 通过绝对路径引用这些组件，实现真正的代码复用。

#### 2.1 ChatMessageItem

**位置**：`src/components/chat/chat-message/index.tsx`

**Props**：

```typescript
interface ChatMessageProps {
  message: ChatMessage;
  isStreaming?: boolean;
  enableCollapse?: boolean; // 默认 true
}
```

- `enableCollapse = true`：Editor 场景，AI 回复完成后可折叠为标签按钮
- `enableCollapse = false`：Chat 场景，始终显示完整内容，不折叠

#### 2.2 InputArea

**位置**：`src/components/chat/input-area/index.tsx`

**Props**：

```typescript
interface InputAreaProps {
  isStreaming: boolean;
  toggleGroupRef?: React.RefObject<ToggleGroupRef | null>;
  onSend: (content: string) => void;
  showToggleGroup?: boolean; // 默认 true
  placeholder?: string;
}
```

- `showToggleGroup = true`：Editor 场景，显示 ToggleGroup 开关
- `showToggleGroup = false`：Chat 场景，隐藏 ToggleGroup
- `toggleGroupRef` 引用 `@/components/editor/toggle-group`（ToggleGroup 仍属于 editor 专属组件）

#### 2.3 ChatMessageList

**位置**：`src/components/chat/chat-message-list/index.tsx`

**Props**：

```typescript
interface ChatMessageListProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  enableCollapse?: boolean; // 默认 true，透传给 ChatMessageItem
}
```

使用 `useAutoScroll` hook 管理滚动逻辑，内置滚动到底部按钮。Chat 页面传入 `enableCollapse={false}`。

#### 2.4 ChatContainer

**位置**：`src/components/chat/chat-container/index.tsx`

Chat 页面的主容器，组合 `ChatMessageList` 和 `InputArea`：

```typescript
export const ChatContainer = memo(() => {
  const { messages, isStreaming, sendMessage, clearMessages } = useSimpleChat();

  return (
    <div className={styles.chatContainer}>
      <header className={styles.header}>
        <h1 className={styles.title}>AI 对话</h1>
        {messages.length > 0 && (
          <button type="button" className={styles.clearButton} onClick={clearMessages}>清空对话</button>
        )}
      </header>
      {messages.length === 0 ? (
        <div className={styles.emptyState}>开始新的对话，输入你的问题吧</div>
      ) : (
        <ChatMessageList messages={messages} isStreaming={isStreaming} />
      )}
      <InputArea isStreaming={isStreaming} onSend={sendMessage} showToggleGroup={false} placeholder="输入你的问题..." />
    </div>
  );
});
```

#### 2.5 Editor ChatPanel 引用

**位置**：`src/components/editor/chat-panel/index.tsx`

Editor 的 `ChatPanel` 通过绝对路径引用迁移后的 chat 组件：

```typescript
import { ChatMessageList } from '@/components/chat/chat-message-list';
import { InputArea } from '@/components/chat/input-area';
```

### 3. 核心功能

#### 3.1 消息管理

- **数据结构**：复用 `src/types/history.ts` 中的 `ChatMessage` 类型
  ```typescript
  interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    animationName?: string;
    hasDomUpdate?: boolean;
  }
  ```
- **状态存储**：`useState<ChatMessage[]>` 管理消息数组
- **消息生成**：使用 `crypto.randomUUID()` 生成唯一 ID，`Date.now()` 生成时间戳

#### 3.2 流式响应

- **API 调用**：通过 `@/utils/api-client` 的 `apiClient.v1.chat.completions.$post` 发送请求
- **SSE 解析**：复用 `@lib/llm/sse-parser` 的 `parseSSEStream(body, onChunk)` 函数
- **消息追加策略**：先追加 user 消息，发起请求并收到响应后，再追加 assistant 占位消息
- **实时更新**：通过 `useEffectEvent` 的 `updateMessage` 触发 re-render，直接修改 assistant 消息对象的 content 属性

#### 3.3 自动滚动（use-auto-scroll Hook）

**位置**：`src/hooks/use-auto-scroll.ts`

**接口**：

```typescript
function useAutoScroll(
  messages: ChatMessage[],
  isStreaming: boolean,
): {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  scrollToBottom: () => void;
};
```

**行为**：

- **默认**：每次 messages 变化时自动滚动到底部
- **用户主动上滚**：streaming 中检测用户离开底部（阈值 50rem），暂停自动滚动并移除 scroll 监听器（性能优化）
- **重新启用**：下一次发送消息时（末尾为 user 消息），重置自动滚动并重新添加监听器
- **滚动到底部按钮**：始终显示，`position: sticky; bottom: 16rem`，点击后重置自动滚动

#### 3.4 加载状态

- **状态标识**：`isStreaming` 布尔值
- **UI 表现**：输入框 placeholder 显示 "AI 正在回复..."，发送按钮禁用

#### 3.5 错误处理

- **网络错误**：捕获异常，将 assistant 消息内容设置为 "抱歉，发生了错误，请重试。"
- **中断处理**：`AbortError` 仅记录 info 日志，不显示错误消息

### 4. API 调用

#### 4.1 请求格式

```typescript
apiClient.v1.chat.completions.$post(
  {
    json: {
      messages: [
        { role: 'system', content: CHAT_SYSTEM_PROMPT },
        ...historyMessages.map((msg) => ({ role: msg.role, content: msg.content })),
      ],
      stream: true,
    },
  },
  {
    init: { signal: abortControllerRef.current.signal },
  },
);
```

#### 4.2 系统提示词

**位置**：`libs/prompts/chat.ts`

```typescript
export const CHAT_SYSTEM_PROMPT = `你是一个友好的 AI 助手，帮助用户解答问题、提供建议和支持。...`;
```

### 5. UI 设计

#### 5.1 布局结构

```
+------------------------------------------+
|  AI 对话                      [清空对话]  |
+------------------------------------------+
|                                          |
|          消息列表区域（可滚动）            |
|                                          |
|  [AI 消息]                               |
|  [用户消息]                              |
|  [AI 消息]                               |
|                                          |
|          [↓ 滚动到底部]                  |
+------------------------------------------+
|  [输入框]                    [发送按钮]  |
+------------------------------------------+
```

#### 5.2 样式规范

- **容器**：全屏高度，居中，最大宽度 800rem
- **消息列表**：flex: 1，overflow-y: auto，独立样式文件 `chat-message-list/index.module.css`
- **输入区域**：独立样式文件 `input-area/index.module.css`，复用 editor 的 mirror 布局实现自动高度
- **消息项**：独立样式文件 `chat-message/index.module.css`
  - 用户消息：右对齐，蓝色背景 (#4f86f7)
  - AI 消息：左对齐，灰色背景 (#f1f5f9)
- **滚动到底部按钮**：圆形 sticky 按钮，36rem × 36rem，带阴影

### 6. 状态管理

#### 6.1 use-simple-chat Hook

**位置**：`src/hooks/use-simple-chat.ts`

**接口**：

```typescript
function useSimpleChat(): {
  messages: ChatMessage[];
  isStreaming: boolean;
  sendMessage: (content: string) => Promise<void>;
  stopStreaming: () => void;
  clearMessages: () => void;
};
```

**关键实现**：

- 使用 `useEffectEvent` 的 `updateMessage` 避免 stale closure
- 通过 `AbortController` 支持中断流式响应
- `sendMessage` 的依赖仅为 `[isStreaming]`，通过 `setMessages` 的回调获取最新历史

### 7. 文件清单

| 文件路径                                                   | 说明                                    |
| ---------------------------------------------------------- | --------------------------------------- |
| `libs/prompts/chat.ts`                                     | 系统提示词（新建）                      |
| `src/hooks/use-simple-chat.ts`                             | 聊天逻辑 Hook（新建）                   |
| `src/hooks/use-auto-scroll.ts`                             | 自动滚动管理 Hook（新建）               |
| `src/components/chat/chat-container/index.tsx` + `.css`    | 主容器组件（新建）                      |
| `src/components/chat/chat-message/index.tsx` + `.css`      | 消息项组件（从 editor 迁移）            |
| `src/components/chat/chat-message-list/index.tsx` + `.css` | 消息列表组件（从 editor 迁移）          |
| `src/components/chat/input-area/index.tsx` + `.css`        | 输入区域组件（从 editor 迁移）          |
| `src/components/editor/chat-panel/index.tsx`               | 修改：导入路径指向 `@/components/chat/` |
| `src/components/editor/chat-panel/index.module.css`        | 修改：仅保留 `.chatPanel` 样式          |
| `src/routes/chat.tsx`                                      | 路由页面（新建）                        |

### 8. 与 Editor 页面的区别

| 特性        | Editor Chat                 | Simple Chat                  |
| ----------- | --------------------------- | ---------------------------- |
| 上下文      | 包含动画配置、DOM 等        | 纯对话                       |
| 系统提示    | 复杂的编辑器指令            | 简单的助手角色               |
| 响应处理    | 解析 JSON 并更新配置        | 直接显示文本                 |
| 历史管理    | 集成历史树                  | 简单的消息列表               |
| API 路径    | `/editor/chat`              | `/v1/chat/completions`       |
| 消息折叠    | 启用（enableCollapse=true） | 禁用（enableCollapse=false） |
| ToggleGroup | 显示                        | 隐藏                         |

## 验收标准

- [x] 页面可通过 `/chat` 路由访问
- [x] 用户可以发送消息并接收 AI 回复
- [x] 支持流式输出，实时显示回复内容
- [x] 消息列表自动滚动到底部，用户上滚时暂停
- [x] 滚动到底部按钮始终显示
- [x] 代码通过 lint 和格式检查
- [x] 输入框支持 Shift+Enter 换行
- [x] 中文输入法组合输入时不会误触发发送
- [x] 组件从 editor 迁移到 chat 目录，editor 通过绝对路径引用
