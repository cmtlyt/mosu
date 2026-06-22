# Spec: 全量上下文 & XML 标签包裹 & 节点往返消息展示

## 概述

本次需求包含 5 个变更点，围绕 AI 对话的上下文传递、响应解析可靠性、以及历史节点的往返消息可视化展开。

---

## 1. 新增"携带全量上下文"开关

### 现状

当前 `useAIChat` 每次 `sendMessage` 只发送 **单条用户消息**（+ system prompt + 系统指令），不携带历史对话。LLM 无法感知之前的对话内容。

### 变更

在 `ToggleGroup` 中新增一个开关 `includeFullContext`（默认 **关闭**），控制是否将历史对话消息作为上下文传递给 LLM。

#### 涉及文件

| 文件                                                                | 变更内容                                                                            |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `src/components/editor/toggle-group/index.tsx`                      | 新增 `includeFullContext` state 和对应的 toggle UI（图标用聊天气泡/历史记录类 SVG） |
| `src/components/editor/toggle-group/index.tsx` → `ToggleOptions`    | 新增 `includeFullContext: boolean` 字段                                             |
| `src/components/editor/chat-panel/index.tsx` → `SendMessageOptions` | 新增 `includeFullContext: boolean` 字段                                             |
| `src/hooks/use-ai-chat.ts` → `SendMessageOptions`                   | 新增 `includeFullContext?: boolean` 字段                                            |
| `src/routes/editor.tsx`                                             | 将 `includeFullContext` 透传给 `sendMessage`                                        |

#### `ToggleOptions` 接口完整定义

```typescript
export interface ToggleOptions {
  includeFullDom: boolean;
  includeCss: boolean;
  includeAnimationConfig: boolean;
  includeFullContext: boolean; // 新增
}
```

#### `ToggleGroup` 组件新增 state 和 UI

```typescript
const [includeFullContext, setIncludeFullContext] = useState(false);

useImperativeHandle(ref, () => ({
  getOptions: () => ({ includeFullDom, includeCss, includeAnimationConfig, includeFullContext }),
}));

// 在 JSX 中新增（放在现有三个 toggle 之后）：
<label className={styles.toggle} title="携带全量上下文">
  <input
    type="checkbox"
    className={styles.toggleInput}
    checked={includeFullContext}
    onChange={(e) => setIncludeFullContext(e.target.checked)}
    aria-label="携带全量上下文"
  />
  <span className={styles.toggleIcon}>
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 3V13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M6 4H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M6 8H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M6 12H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  </span>
</label>
```

---

## 2. 上下文包括用户消息和 LLM 返回消息

### 现状

`useAIChat` 的 `sendMessage` 构建 `chatMessages` 时只有：

```
[system prompt] + [system directives] + [当前用户消息]
```

### 变更

当 `includeFullContext === true` 时，将 `conversationHistory`（来自 `useHistoryTree`）中的 **user + assistant** 消息插入到 system prompt 之后、当前用户消息之前。

#### 涉及文件

| 文件                       | 变更内容                                                                                                                                                                         |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/hooks/use-ai-chat.ts` | `SendMessageOptions` 新增 `conversationHistory?: ChatMessage[]` 字段；`sendMessage` 内部当 `includeFullContext` 为 true 时，将历史消息映射为 `ChatCompletionMessageParam[]` 插入 |
| `src/routes/editor.tsx`    | 调用 `sendMessage` 时将 `conversationHistory` 传入 options                                                                                                                       |

#### `SendMessageOptions` 接口完整定义

**`src/components/editor/chat-panel/index.tsx`**：

```typescript
export interface SendMessageOptions {
  includeFullDom: boolean;
  includeCss: boolean;
  includeAnimationConfig: boolean;
  includeFullContext: boolean; // 新增
}
```

**`src/hooks/use-ai-chat.ts`**：

```typescript
export interface SendMessageOptions {
  domContent?: string;
  isFullDom?: boolean;
  includeCss?: boolean;
  includeAnimationConfig?: boolean;
  currentStyle?: string | null;
  includeFullContext?: boolean; // 新增
  conversationHistory?: ChatMessage[]; // 新增
}
```

#### `useAIChat` 的 `sendMessage` 实现变更

在 `src/hooks/use-ai-chat.ts` 的 `sendMessage` 函数中，构建 `chatMessages` 的逻辑修改如下：

```typescript
const chatMessages: ChatCompletionMessageParam[] = [
  { role: "system", content: SYSTEM_PROMPT },
  ...buildSystemDirectives(options),
];

// 新增：当 includeFullContext 为 true 时，插入历史对话消息
if (options?.includeFullContext && options?.conversationHistory) {
  const historyMessages: ChatCompletionMessageParam[] =
    options.conversationHistory
      .filter((msg) => msg.role === "user" || msg.role === "assistant")
      .map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));
  chatMessages.push(...historyMessages);
}

chatMessages.push({
  role: "user",
  content: buildUserContent(content, currentConfig, options),
});
```

#### `editor.tsx` 调用代码变更

在 `src/routes/editor.tsx` 的 `handleSendMessage` 函数中，调用 `sendMessage` 时透传参数：

```typescript
const result = await sendMessage(content, currentConfig, {
  domContent,
  isFullDom: options.includeFullDom,
  includeCss: options.includeCss,
  includeAnimationConfig: options.includeAnimationConfig,
  currentStyle,
  includeFullContext: options.includeFullContext, // 新增
  conversationHistory, // 新增（来自 useHistoryTree）
});
```

#### 消息映射规则

- `role: 'user'` → `{ role: 'user', content: msg.content }`
- `role: 'assistant'` → `{ role: 'assistant', content: msg.content }`（使用原始完整内容，即 LLM 返回的原始文本）
- `role: 'system'` → 跳过（system prompt 已有）

#### 构建顺序

```
[system prompt]
+ [system directives (CSS/动画配置指令)]
+ [历史 user/assistant 消息...]  // 仅 includeFullContext 时
+ [当前用户消息 (含 DOM/CSS/config 信息)]
```

---

## 3. 每个记录节点保存本次对话的往返信息

### 现状

`HistoryNodeData.messages` 已经存储了 `ChatMessage[]`，但当前只存储了 **本轮** 的 user + assistant 消息（通过 `prepareMessagesForCommit` 过滤掉已有消息）。

### 变更

保持现有行为不变——每个节点已经正确保存了"本次对话"的往返消息（一条 user + 一条 assistant）。`prepareMessagesForCommit` 的过滤逻辑确保不会重复存储历史消息。

**无需代码变更**，这是对现有行为的确认。

> 注：`conversationHistory`（通过 `getPathData` 聚合）已经能从根节点到当前节点还原完整对话链，每个节点各自持有自己的那一对往返消息。

---

## 4. 修改 System Prompt 使用 XML 标签包裹 JSON + 调整解析

### 现状

- System Prompt 要求 LLM "仅输出 JSON，无解释"
- `parseAIResponse` 先尝试直接 `JSON.parse`，失败后用正则 `/[[{][\s\S]*[\]}]/u` 提取

### 变更

#### 4.1 System Prompt 修改

在 `src/constants/ai.ts` 的 `SYSTEM_PROMPT` 中进行以下精确修改：

**删除**（位于 `## 关键约束` 部分的第一行）：

```
- 仅输出 JSON，无解释
```

**新增**（在 `## 响应结构` 部分之后、`## config 结构` 部分之前插入）：

```
## 输出格式（强制规则）
你必须将响应 JSON 对象包裹在 <mosu-response> 标签中，标签外不得有任何其他内容。

示例：
<mosu-response>
{
  "name": "变更摘要",
  "domPatch": [...],
  "style": "...",
  "config": {...}
}
</mosu-response>
```

#### 4.2 解析逻辑修改

修改 `src/hooks/use-ai-chat.ts` 中的 `parseAIResponse` 函数，完整实现如下：

```typescript
function parseAIResponse(raw: string): AIEditorResponse | null {
  // 优先：从 <mosu-response> 标签中提取 JSON
  const xmlMatch = raw.match(/<mosu-response>([\s\S]*?)<\/mosu-response>/u);
  if (xmlMatch) {
    try {
      const parsed = JSON.parse(xmlMatch[1].trim());
      if (parsed && typeof parsed === "object") {
        if ("tracks" in parsed && !("config" in parsed)) {
          const { name, ...configData } = parsed as { name?: string } & Pick<
            AnimationConfig,
            "tracks" | "triggerGroups"
          >;
          return { name: name ?? "动画更新", config: configData };
        }
        return parsed as AIEditorResponse;
      }
    } catch {
      /* fall through to fallback */
    }
  }

  // 降级：兼容旧格式（直接 JSON 或正则提取）
  logger.warn(
    "hooks.use-ai-chat.parse",
    "LLM did not wrap response in <mosu-response> tag, using fallback parser",
  );

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "config" in parsed) {
      return parsed as AIEditorResponse;
    }
  } catch {
    /* fall through */
  }

  const match = raw.match(/[[{][\s\S]*[\]}]/u);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (parsed && typeof parsed === "object") {
        if ("tracks" in parsed && !("config" in parsed)) {
          const { name, ...configData } = parsed as { name?: string } & Pick<
            AnimationConfig,
            "tracks" | "triggerGroups"
          >;
          return { name: name ?? "动画更新", config: configData };
        }
        return parsed as AIEditorResponse;
      }
    } catch {
      /* ignore */
    }
  }

  return null;
}
```

#### 涉及文件

| 文件                       | 变更内容                                                         |
| -------------------------- | ---------------------------------------------------------------- |
| `src/constants/ai.ts`      | 修改 `SYSTEM_PROMPT`，新增 XML 标签输出格式规则                  |
| `src/hooks/use-ai-chat.ts` | 修改 `parseAIResponse`，优先从 `<mosu-response>` 标签中提取 JSON |

---

## 5. 节点详情中展示往返消息（折叠）

### 现状

`NodeDetail` 组件底部已有 DOM 和 Style 的折叠展示（使用 `<details>` + `<summary>`）。

### 变更

在 `NodeDetail` 的 DOM/Style 折叠区域**之前**，新增一个"对话记录"折叠区域，展示该节点的 `messages` 往返信息。

#### 展示规则

- 使用与 DOM/Style 相同的 `<details>` + `<summary>` 折叠样式
- `<summary>` 文本为 `"对话记录 (N 条)"`，N 为 messages 长度
- 当 `messages` 为空时不渲染该折叠区域
- 每条消息按时间顺序展示：
  - **user 消息**：显示角色标签 `"你"` + 消息内容
  - **assistant 消息**：显示角色标签 `"AI 助手"` + 消息内容（原始完整内容）
- 消息样式参考 `ChatMessageItem` 的视觉风格（user 蓝色靠右、assistant 灰色靠左），但简化为纯展示（无交互）

#### 涉及文件

| 文件                                                 | 变更内容                                                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `src/components/editor/node-detail/index.tsx`        | 新增对话记录折叠区域                                                                              |
| `src/components/editor/node-detail/index.module.css` | 新增对话记录相关样式（`.conversationSection`、`.messageItem`、`.messageRole`、`.messageContent`） |

#### 样式设计

```css
/* 对话记录区域 - 复用 collapsibleSection 样式 */
.conversationMessages {
  padding: 8rem 12rem;
  display: flex;
  flex-direction: column;
  gap: 8rem;
  background: #fff;
}

.messageItem {
  padding: 6rem 10rem;
  border-radius: 6rem;
  max-width: 85%;
}

.messageItemUser {
  align-self: flex-end;
  background: #4f86f7;
  color: #fff;
}

.messageItemAssistant {
  align-self: flex-start;
  background: #f1f5f9;
  color: #334155;
}

.messageRole {
  font-size: 11rem;
  opacity: 0.7;
  margin-bottom: 2rem;
}

.messageContent {
  font-size: 12rem;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
}
```

#### `NodeDetail` JSX 实现

在 `src/components/editor/node-detail/index.tsx` 中，在现有的 DOM/Style 折叠区域**之前**插入以下 JSX：

```tsx
{
  data.messages.length > 0 && (
    <details className={styles.collapsibleSection}>
      <summary className={styles.collapsibleHeader}>
        对话记录 ({data.messages.length} 条)
      </summary>
      <div className={styles.conversationMessages}>
        {data.messages.map((msg) => (
          <div
            key={msg.id}
            className={`${styles.messageItem} ${
              msg.role === "user"
                ? styles.messageItemUser
                : styles.messageItemAssistant
            }`}
          >
            <div className={styles.messageRole}>
              {msg.role === "user" ? "你" : "AI 助手"}
            </div>
            <div className={styles.messageContent}>{msg.content}</div>
          </div>
        ))}
      </div>
    </details>
  );
}
```

**插入位置**：在现有的 `<details className={styles.collapsibleSection}>` (DOM 折叠区域) 之前。

---

## 变更文件汇总

| 文件                                                 | 变更类型                                                    |
| ---------------------------------------------------- | ----------------------------------------------------------- |
| `src/constants/ai.ts`                                | 修改 SYSTEM_PROMPT                                          |
| `src/hooks/use-ai-chat.ts`                           | 修改 parseAIResponse + sendMessage 支持 conversationHistory |
| `src/components/editor/toggle-group/index.tsx`       | 新增 includeFullContext toggle                              |
| `src/components/editor/chat-panel/index.tsx`         | SendMessageOptions 新增字段                                 |
| `src/routes/editor.tsx`                              | 透传 includeFullContext + conversationHistory               |
| `src/components/editor/node-detail/index.tsx`        | 新增对话记录折叠区域                                        |
| `src/components/editor/node-detail/index.module.css` | 新增对话记录样式                                            |
