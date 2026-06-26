# Spec: 对话修复三件套 — 历史记录完整性 / 开关透传 / 节点对话展示

## 1. 概述

修复编辑器 AI 对话流程中的三个缺陷：

1. **历史记录不完整**：开启"携带全量上下文"时，发送给后端的对话记录缺少当前轮次已产生的消息
2. **开关透传冗余**：前端在 `ai-engine.ts` 中手动挑选 options 字段传给后端，应直接透传所有开关
3. **节点对话丢失**：节点详情中"对话记录"始终为空，`prepareMessagesForCommit` 过滤逻辑导致 commit 的 messages 为空数组

## 2. 问题详析与修复方案

### 2.1 携带历史记录模式下未发送完整对话记录

**根因**：

`editor.tsx` 中 `handleSendMessage` 传给 `sendMessage` 的 `conversationHistory` 来自 `useHistoryTree`，是历史树当前路径上各节点存储的消息（经过树结构过滤后的有序记录），不包含当前轮次 `useAIChat` 内部 state 中已产生但尚未 commit 到历史树的消息。

```
历史树路径消息: [A1, A2]     ← conversationHistory（history-tree 过滤后的路径消息，只有这些被发送）
当前轮次未提交消息: [B1, B2] ← useAIChat state（尚未 commit 到历史树，被遗漏）
用户期望发送: [A1, A2, B1, B2]
```

`displayMessages` 已经做了合并（`conversationHistory` + 当前轮次新增消息），但没有被用作 `conversationHistory` 参数。

**修复方案**：

在 `editor.tsx` 的 `handleSendMessage` 中，将 `displayMessages` 作为 `conversationHistory` 传给 `sendMessage`，替代原来的 `conversationHistory`。

**变更文件**：`src/routes/editor.tsx`

仅修改 `conversationHistory` 参数（字段名 `isFullDom` → `includeFullDom` 的变更在 2.2 节中处理）：

```diff
   includeFullContext: options.includeFullContext,
-  conversationHistory,
+  conversationHistory: displayMessages,
 });
```

同时更新 `handleSendMessage` 的依赖数组，将 `conversationHistory` 替换为 `displayMessages`。

### 2.2 直接将所有开关传递给后端

**根因**：

前端在 `ai-engine.ts` 中定义了 `EditorChatOptions`（只有 `includeCss` 和 `includeAnimationConfig`），然后在 `use-ai-chat.ts` 中手动从 `SendMessageOptions` 挑选字段传给 `streamChat`。这个中间挑选层是多余的——后端 schema 已经通过 zod 只消费需要的字段。

**修复方案**：

1. **`src/utils/editor/ai-engine.ts`**：`EditorChatOptions` 扩展为包含所有 4 个开关字段（与 `ChatPanel` 的 `SendMessageOptions` 对齐），`streamViaBackend` 直接透传
2. **`src/hooks/use-ai-chat.ts`**：
   - `SendMessageOptions` 中的 `isFullDom` 重命名为 `includeFullDom`，与 `EditorChatOptions` 对齐
   - `buildUserContent` 中读取 `options.includeFullDom`（替代 `options.isFullDom`）
   - `streamChat` 调用时直接透传 options，不再手动挑选字段
3. **`src/routes/editor.tsx`**：传参处 `isFullDom: options.includeFullDom` 改为 `includeFullDom: options.includeFullDom`
4. **后端 schema 不变**：zod 默认 strip 未定义的字段，`includeFullDom` 和 `includeFullContext` 会被自动忽略

**变更文件**：

#### `src/utils/editor/ai-engine.ts`

```diff
 export interface EditorChatOptions {
   includeCss?: boolean;
   includeAnimationConfig?: boolean;
+  includeFullDom?: boolean;
+  includeFullContext?: boolean;
 }
```

#### `src/hooks/use-ai-chat.ts`

`SendMessageOptions` 字段重命名：

```diff
 export interface SendMessageOptions {
   domContent?: string;
-  isFullDom?: boolean;
+  includeFullDom?: boolean;
   includeCss?: boolean;
   includeAnimationConfig?: boolean;
   currentStyle?: string | null;
   includeFullContext?: boolean;
   conversationHistory?: ChatMessage[];
 }
```

`buildUserContent` 中读取字段名同步更新：

```diff
 const domInfo = options?.domContent
-  ? options.isFullDom
+  ? options.includeFullDom
     ? `\n\n当前预览区域的完整 DOM：\n${options.domContent}`
     : `\n\n当前预览区域的 DOM 结构摘要：\n${options.domContent}`
   : '';
```

`streamChat` 调用处，将手动挑选改为直接透传：

```diff
 const fullResponse = await streamChat(
   chatMessages,
   (chunk) => { ... },
-  {
-    includeCss: options?.includeCss,
-    includeAnimationConfig: options?.includeAnimationConfig,
-  },
+  options,
 );
```

#### `src/routes/editor.tsx`

传参处字段名同步更新：

```diff
 const result = await sendMessage(content, currentConfig, {
   domContent,
-  isFullDom: options.includeFullDom,
+  includeFullDom: options.includeFullDom,
   includeCss: options.includeCss,
   includeAnimationConfig: options.includeAnimationConfig,
   currentStyle,
   includeFullContext: options.includeFullContext,
   conversationHistory: displayMessages,
 });
```

### 2.3 节点详情下不显示对话的往返消息

**根因**：

`prepareMessagesForCommit` 的过滤逻辑：

```typescript
return newMessages.filter((msg) => !existingMessages.some((existing) => existing.id === msg.id));
```

`result.messages`（`finalMessages`）是 `useAIChat` 内部 `setMessages` 回调中捕获的完整消息列表，`messages` 是 `useAIChat()` 返回的 state。由于 `sendMessage` 是 async 函数，返回时 React 已经 flush 了所有 `setMessages` 更新，导致 `messages` state 与 `finalMessages` 的 id 完全相同，过滤后为空数组。

**修复方案**：

改变 `useAIChat` 的 `sendMessage` 返回值，新增 `newMessages` 字段，仅包含本次对话新增的 user + assistant 消息对。`editor.tsx` 使用 `newMessages` 进行 commit，不再依赖 `prepareMessagesForCommit` 的过滤逻辑。

**变更文件**：

#### `src/hooks/use-ai-chat.ts`

1. 在 `sendMessage` 内部记录本次新增的消息 id
2. 返回值新增 `newMessages` 字段
3. **错误路径也返回 `newMessages`**（保持类型一致）

```diff
 interface UseAIChatReturn {
   messages: ChatMessage[];
   isStreaming: boolean;
   sendMessage: (
     content: string,
     currentConfig: AnimationConfig,
     options?: SendMessageOptions,
   ) => Promise<{
     response: AIEditorResponse | null;
     messages: ChatMessage[];
+    newMessages: ChatMessage[];
   }>;
 }
```

实现：

```typescript
// sendMessage 内部
const userMessageId = userMessage.id;
const assistantMessageId = assistantMessage.id;

// ... 流式处理 ...

// 成功返回时
const newMessages = finalMessages.filter((msg) => msg.id === userMessageId || msg.id === assistantMessageId);

return { response: parsedResponse, messages: finalMessages, newMessages };
```

**错误路径**（catch 分支）：

```typescript
// catch 分支也需要返回 newMessages，保持类型一致
return {
  response: null,
  messages,
  newMessages: messages.filter((msg) => msg.id === userMessageId || msg.id === assistantMessageId),
};
```

#### `src/utils/editor/ai-response-processor.ts`

简化 `prepareMessagesForCommit`，不再做 id 过滤，直接为传入的消息标记 `hasDomUpdate`：

```diff
 export function prepareMessagesForCommit(
-  messages: ChatMessage[],
-  existingMessages: ChatMessage[],
+  newMessages: ChatMessage[],
   hasUpdate: boolean,
 ): ChatMessage[] {
-  const newMessages = messages.map((msg) => ({
+  return newMessages.map((msg) => ({
     ...msg,
     hasDomUpdate: msg.role === 'assistant' && hasUpdate,
   }));
-
-  return newMessages.filter(
-    (msg) => !existingMessages.some((existing) => existing.id === msg.id)
-  );
 }
```

#### `src/routes/editor.tsx`

调用处适配新签名：

```diff
-const messagesToCommit = prepareMessagesForCommit(result.messages, messages, hasUpdate);
+const messagesToCommit = prepareMessagesForCommit(result.newMessages, hasUpdate);
```

同时从 `handleSendMessage` 的依赖数组中移除 `messages`（不再需要）。

## 3. 文件变更清单

| 文件                                        | 变更类型 | 说明                                                                                                       |
| ------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `src/routes/editor.tsx`                     | 修改     | `conversationHistory` → `displayMessages`；`prepareMessagesForCommit` 调用适配新签名；移除 `messages` 依赖 |
| `src/hooks/use-ai-chat.ts`                  | 修改     | `sendMessage` 返回值新增 `newMessages`；`streamChat` 调用直接透传 options                                  |
| `src/utils/editor/ai-engine.ts`             | 修改     | `EditorChatOptions` 扩展 `includeFullDom`、`includeFullContext` 字段                                       |
| `src/utils/editor/ai-response-processor.ts` | 修改     | `prepareMessagesForCommit` 简化，移除 id 过滤逻辑，参数从 3 个减为 2 个                                    |

## 4. 边界情况处理

| 场景                                           | 处理方式                                                         |
| ---------------------------------------------- | ---------------------------------------------------------------- |
| 当前轮次无历史消息时开启"携带全量上下文"       | `displayMessages` 退化为 `conversationHistory`，行为与修复前一致 |
| 当前轮次有多轮对话后开启"携带全量上下文"       | `displayMessages` 包含历史树 + 当前轮次所有消息，完整发送        |
| 后端收到 `includeFullDom`/`includeFullContext` | zod schema 未定义这两个字段，自动 strip，不影响后端逻辑          |
| AI 返回失败（`response` 为 null）              | `newMessages` 仍包含 user + assistant（错误提示），正常 commit   |
| 首次对话（无历史树消息）                       | `newMessages` 仅包含本次 user + assistant，正常 commit           |

## 5. 验收标准

1. 开启"携带全量上下文"后，发送给后端的消息列表包含历史树路径消息 + 当前轮次已产生的所有消息
2. 前端 `ai-engine.ts` 的 `EditorChatOptions` 包含所有 4 个开关字段
3. `use-ai-chat.ts` 中 `streamChat` 调用直接透传 options，不再手动挑选字段
4. 后端 schema 不变，zod 自动忽略不需要的字段
5. AI 对话成功后，对应节点的"对话记录"折叠面板显示本次 user + assistant 消息
6. `prepareMessagesForCommit` 签名为 `(newMessages, hasUpdate)`，不再做 id 过滤
7. `sendMessage` 返回值包含 `newMessages` 字段，仅含本次新增的 2 条消息
8. TypeScript 类型检查通过，无 any 类型
9. 执行 `pnpm fmt:check` 和 `pnpm lint:fix` 无报错
