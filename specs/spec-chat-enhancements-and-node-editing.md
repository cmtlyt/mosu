# Spec: 对话框增强与历史节点编辑

> 状态：**等待评审**
> 创建时间：2026-06-17

## 1. 概述

本次变更包含四项功能增强：

1. **对话框多行输入**：将单行 `<input>` 改为 `<textarea>`，支持 Shift+Enter 换行、Enter 直接发送
2. **DOM/CSS 携带开关**：提供"携带全量 DOM"和"携带 CSS 样式"两个独立开关，控制发送给 AI 的上下文内容
3. **CSS 替换模式**：启用"携带 CSS 样式"后，AI 返回的 CSS 采用替换策略（而非追加），并在 system prompt 中追加强制要求"必须返回全量 CSS"
4. **历史节点配置编辑**：在节点详情面板中支持编辑 config，提交后创建新的历史记录节点

## 2. 详细设计

### 2.1 对话框多行输入

**变更文件**：`src/components/editor/chat-panel.tsx`、`src/components/editor/chat-panel.module.css`

**UI 变更**：

- 将 `<input type="text">` 替换为 `<textarea>`
- 默认显示 1 行，随内容自动增长，最大高度 120px（约 5 行）
- 保留原有的发送按钮

**交互逻辑**：

| 按键组合       | 行为           |
| -------------- | -------------- |
| `Enter`        | 发送消息       |
| `Shift + Enter`| 插入换行       |

**高度自适应方案（纯 CSS，无 JS）**：

使用一个隐藏的 `<div>` 与 `<textarea>` 叠加，通过 div 撑开容器高度：

```tsx
<div className={styles.inputWrapper}>
  <div className={styles.inputMirror} aria-hidden="true">
    {inputValue}
    {/* 末尾追加换行符，确保空行也能撑开高度 */}
    <br />
  </div>
  <textarea
    className={styles.input}
    value={inputValue}
    onChange={(e) => setInputValue(e.target.value)}
    onKeyDown={handleKeyDown}
  />
</div>
```

**关键约束**：`.inputMirror` 和 `.input` 必须共享完全一致的文本渲染属性，否则高度会错位：

```css
.inputWrapper {
  position: relative;
  flex: 1;
  min-height: 2.25em; /* 约 36px，基于 font-size */
  max-height: 12.5em; /* 约 200px，8 行高度，使用 em 单位更灵活 */
}

/* 共享的文本渲染属性，mirror 和 textarea 必须完全一致 */
.inputMirror,
.input {
  font-family: inherit;
  font-size: 14px;
  line-height: 1.5;
  padding: 8px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  box-sizing: border-box;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.inputMirror {
  visibility: hidden;
  overflow: hidden;
  /* 使用 -webkit-line-clamp 限制最大行数 */
  display: -webkit-box;
  -webkit-line-clamp: 8;
  -webkit-box-orient: vertical;
  /* 占位但不可见，撑开 wrapper 高度 */
}

.input {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  resize: none;
  overflow-y: auto;
  outline: none;
}
```

- 发送后清空 `inputValue`，mirror 内容同步清空，wrapper 自动回到最小高度
- streaming 期间 placeholder 保持 "AI 正在回复..."，输入框不禁用（允许用户提前编辑）

### 2.2 DOM/CSS 携带开关

**变更文件**：`src/components/editor/chat-panel.tsx`、`src/components/editor/chat-panel.module.css`、`src/hooks/use-ai-chat.ts`、`src/routes/editor.tsx`

**UI 设计**：

在输入框上方增加一行开关区域，包含两个 toggle 开关：

```text
┌─────────────────────────────────────────┐
│ [✓] 携带全量 DOM    [✓] 携带 CSS 样式   │  ← 开关区域
├─────────────────────────────────────────┤
│                                         │
│  textarea 输入区                        │
│                                         │
├─────────────────────────────────────────┤
│                              [发送]     │
└─────────────────────────────────────────┘
```

**状态管理**：

开关状态由 `ChatPanel` 内部管理（`useState`），作为 UI 偏好不影响 history node 数据：

```typescript
const [includeFullDom, setIncludeFullDom] = useState(true);
const [includeCss, setIncludeCss] = useState(true);
```

**数据流**：

1. `ChatPanel` 将开关状态通过 `onSendMessage` 回调传递给 `editor.tsx`：

```typescript
interface ChatPanelProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  onSendMessage: (content: string, options: SendMessageOptions) => void;
  currentConfig: AnimationConfig;
}

interface SendMessageOptions {
  includeFullDom: boolean;
  includeCss: boolean;
}
```

2. `editor.tsx` 的 `handleSendMessage` 根据开关状态决定传给 AI 的内容：

| 开关状态                          | 传给 AI 的内容                                             |
| --------------------------------- | ---------------------------------------------------------- |
| `includeFullDom=true`             | 传入完整的 `currentDom` HTML 字符串                        |
| `includeFullDom=false`            | 传入 `generateDomSummary(currentDom)` 的摘要               |
| `includeCss=true`                 | 通过独立的 user prompt 启用 CSS 携带模式（见下方说明）     |
| `includeCss=false`                | 不传 CSS 相关 prompt                                       |

3. `use-ai-chat.ts` 的 `sendMessage` 签名扩展：

```typescript
sendMessage: (
  content: string,
  currentConfig: AnimationConfig,
  options?: {
    domContent?: string;        // 完整 DOM 或摘要
    includeCss?: boolean;       // 是否启用 CSS 携带模式
    currentStyle?: string | null; // 当前 CSS 内容
  },
) => Promise<{ response: AIEditorResponse | null; messages: ChatMessage[] }>;
```

**System Prompt 与 User Prompt 分离设计（利用 Token 缓存）**：

CSS 携带模式的规则**写入 `SYSTEM_PROMPT` 常量**（`src/constants/ai.ts`），作为固定规则的一部分，这样 LLM 可以缓存 system prompt 的 token：

```typescript
// src/constants/ai.ts 新增常量
export const CSS_CARRY_MODE_RULE = `
## CSS 携带模式规则
当用户启用"携带 CSS 样式"模式时（通过独立的 user prompt 标识），你返回的 style 字段将**替换**（而非追加到）现有样式。因此你**必须返回全量 CSS**，包含所有需要保留的样式规则，不能仅输出增量变更。
`;
```

**启用 CSS 携带模式**通过一条**独立的 user prompt** 传递，而非动态拼接 system prompt：

```typescript
// use-ai-chat.ts 中构建 chatMessages
const chatMessages: ChatCompletionMessageParam[] = [
  { role: 'system', content: SYSTEM_PROMPT },  // 固定，可被缓存
];

// 如果启用 CSS 携带模式，追加一条独立的 user prompt
if (includeCss) {
  chatMessages.push({
    role: 'user',
    content: '[系统指令] 已启用 CSS 携带模式，请按照 system prompt 中的"CSS 携带模式规则"返回全量 CSS。',
  });
}

// 构建 DOM 信息：includeFullDom=true 传完整 HTML，false 传摘要
const domInfo = domContent
  ? (includeFullDom
      ? `\n\n当前预览区域的完整 DOM：\n${domContent}`
      : `\n\n当前预览区域的 DOM 结构摘要：\n${domContent}`)
  : '';

// 构建 CSS 信息：仅在 includeCss=true 时传入当前样式
const cssInfo = (includeCss && currentStyle)
  ? `\n\n当前预览区域的 CSS 样式：\n${currentStyle}`
  : '';

// 主 user prompt
chatMessages.push({
  role: 'user',
  content: `当前动画配置：\n${JSON.stringify(currentConfig, null, 2)}${domInfo}${cssInfo}\n\n用户需求：${content}`,
});
```

**设计优势**：
- `SYSTEM_PROMPT` 保持不变，LLM 可缓存其 token，降低推理成本
- CSS 携带模式规则作为 system prompt 的一部分，始终存在，只是通过 user prompt 激活
- 避免每次请求都动态拼接 system prompt，减少 token 浪费
- `domInfo` 和 `cssInfo` 根据开关状态动态生成，逻辑清晰

### 2.3 CSS 计算逻辑封装

**变更文件**：`src/utils/editor/ai-response-processor.ts`

**设计原则**：将 CSS 替换/合并的行为分流逻辑封装在 `computeStyles` 函数内部，外部调用方无需关心 `includeCss` 开关的判断逻辑，降低外层复杂度。

**新增函数**：

```typescript
// src/utils/editor/ai-response-processor.ts

/**
 * 根据 CSS 携带模式计算最终的样式值
 * @param currentStyle - 当前样式
 * @param sanitizedStyle - AI 返回并经过 sanitize 的样式
 * @param includeCss - 是否启用 CSS 携带模式
 * @returns 最终应用的样式值
 */
export function computeStyles(
  currentStyle: string | null,
  sanitizedStyle: string | null,
  includeCss: boolean,
): string | null {
  if (includeCss) {
    // 替换模式：AI 返回的全量 CSS 直接替换，未返回则保持原值
    return sanitizedStyle ?? currentStyle;
  }
  // 追加模式：通过 mergeStyles 合并
  return mergeStyles(currentStyle, sanitizedStyle);
}
```

**调用方简化**（`editor.tsx`）：

```typescript
// 无需在 editor.tsx 中判断 includeCss，直接调用 computeStyles
const finalStyle = computeStyles(currentStyle, sanitizedStyle, includeCss);
```

**优势**：
- 行为分流逻辑集中在一个函数内，易于维护和测试
- `editor.tsx` 的 `handleSendMessage` 无需关心 CSS 模式的具体实现
- 未来如需调整替换/合并策略，只需修改 `computeStyles` 一处

### 2.4 历史节点配置编辑

**变更文件**：`src/components/editor/node-detail.tsx`、`src/components/editor/node-detail.module.css`、`src/components/editor/branch-panel.tsx`、`src/routes/editor.tsx`

**交互流程**：

```text
用户点击节点 → 右侧 NodeDetail 显示节点详情
  → Label 和 Config 直接以 textarea/input 渲染（可编辑）
  → DOM 和 Style 默认折叠展示（只读，因其他地方已有编辑入口）
  → 用户修改 Label/Config → 点击"保存"
    → 校验 JSON 合法性（符合 AnimationConfig 结构）
    → 校验通过 → commitAndSelect() 创建新节点并自动选中
    → 校验失败 → 显示错误提示，不创建节点
  → 点击"恢复" → 将 Label/Config 恢复为当前选中节点的原始数据
  → 点击 DOM/Style 折叠标题 → 展开/折叠查看详情
```

**NodeDetail 组件改造**：

```typescript
interface NodeDetailProps {
  data: HistoryNodeData | null;
  onCommitEdit: (editedData: Omit<HistoryNodeData, 'timestamp'>) => void;
}
```

**状态管理**（Label/Config 可编辑，DOM/Style 只读折叠）：

```typescript
// 合并为单一状态对象，避免 hook 链过长
const [editState, setEditState] = useState({
  config: '',
  label: '',
  error: null as string | null,
});

// 当 data 变化时，同步初始化编辑区内容
useEffect(() => {
  if (data) {
    setEditState({
      config: JSON.stringify(data.config, null, 2),
      label: data.label,
      error: null,
    });
  }
}, [data]);
```

**UI 布局**：

- **Label 输入框**：`<input>` 绑定 `editState.label`（可编辑）
- **Config 编辑区**：`<textarea>` 绑定 `editState.config`，行数 12（可编辑）
- **DOM 展示区**：使用 `<details>` + `<summary>` 原生折叠（只读，无需 JS 状态）
- **Style 展示区**：使用 `<details>` + `<summary>` 原生折叠（只读，无需 JS 状态）
- **保存按钮**：校验 Config JSON → 调用 `onCommitEdit`
- **恢复按钮**：将 Label/Config 恢复为 `data` 的原始值

**折叠面板实现**（HTML 原生，无 JS 状态）：

```tsx
<details className={styles.collapsibleSection}>
  <summary className={styles.collapsibleHeader}>DOM</summary>
  {data?.customDom && (
    <pre className={styles.codeBlock}>{data.customDom}</pre>
  )}
</details>

<details className={styles.collapsibleSection}>
  <summary className={styles.collapsibleHeader}>Style</summary>
  {data?.customStyle && (
    <pre className={styles.codeBlock}>{data.customStyle}</pre>
  )}
</details>
```

**优势**：
- 使用 HTML5 `<details>` 和 `<summary>` 标签，浏览器原生支持展开/折叠
- 无需 `useState` 管理展开状态，减少组件状态复杂度
- 语义化标签，对无障碍访问（a11y）更友好

**校验逻辑**：

```typescript
function validateConfig(jsonStr: string): { valid: boolean; error?: string; config?: AnimationConfig } {
  try {
    const parsed = JSON.parse(jsonStr);
    if (!parsed || typeof parsed !== 'object') {
      return { valid: false, error: '配置必须是 JSON 对象' };
    }
    if (!Array.isArray(parsed.tracks)) {
      return { valid: false, error: '配置必须包含 tracks 数组' };
    }
    return { valid: true, config: parsed as AnimationConfig };
  } catch (e) {
    return { valid: false, error: `JSON 解析失败: ${(e as Error).message}` };
  }
}
```

**保存处理**：

```typescript
const handleSave = () => {
  const validation = validateConfig(editState.config);
  if (!validation.valid || !validation.config) {
    setEditState((prev) => ({ ...prev, error: validation.error ?? '校验失败' }));
    return;
  }
  setEditState((prev) => ({ ...prev, error: null }));
  onCommitEdit({
    config: validation.config,
    label: editState.label,
    source: 'manual',
    messages: [],
    customDom: data?.customDom ?? null,  // 保持原值，不支持编辑
    customStyle: data?.customStyle ?? null,  // 保持原值，不支持编辑
  });
};
```

**恢复处理**：

```typescript
const handleRestore = () => {
  if (!data) return;
  setEditState({
    config: JSON.stringify(data.config, null, 2),
    label: data.label,
    error: null,
  });
};
```

**提交处理**（`editor.tsx`）：

使用聚合方法 `commitAndSelect`（见 2.5 节）：

```typescript
const handleNodeEditCommit = useCallback(
  (editedData: Omit<HistoryNodeData, 'timestamp'>) => {
    commitAndSelect(editedData);
    dispatchEditorEvent(EDITOR_EVENTS.MESSAGE, { text: '已从编辑创建新节点', type: 'success' });
  },
  [commitAndSelect],
);
```

**BranchPanel 透传**：

`BranchPanel` 需要接收 `onCommitEdit` 并传递给 `NodeDetail`：

```typescript
interface BranchPanelProps {
  snapshot: HistoryTreeSnapshot<HistoryNodeData>;
  selectedNodeId: string | null;
  selectedNodeData: HistoryNodeData | null;
  onNodeClick: (nodeId: string) => void;
  onNodeDoubleClick: (nodeId: string) => void;
  onCommitEdit: (editedData: Omit<HistoryNodeData, 'timestamp'>) => void;
}
```

### 2.5 commit 与 setSelectedNodeId 聚合方法

**变更文件**：`src/routes/editor.tsx`

**设计原则**：`commit` 和 `setSelectedNodeId` 在多数场景下联合调用，在 `editor.tsx` 中封装聚合方法 `commitAndSelect` 减少重复代码，同时保留原子方法供需要精细控制的场景使用。

**实现位置**：在 `editor.tsx` 中封装（而非修改 `useHistoryTree` hook 签名），避免侵入通用 hook：

```typescript
// src/routes/editor.tsx

const commitAndSelect = useCallback(
  (data: Omit<HistoryNodeData, 'timestamp'>) => {
    const nodeId = commit(data);
    setSelectedNodeId(nodeId);
    return nodeId;
  },
  [commit, setSelectedNodeId],
);
```

**调用方简化**：

```typescript
// 原有分散调用
const newNodeId = commit({
  config: fullConfig,
  label: fullConfig.name,
  source: 'ai',
  messages: messagesToCommit,
  customDom: finalDom,
  customStyle: finalStyle,
});
setSelectedNodeId(newNodeId);

// 简化为聚合调用
commitAndSelect({
  config: fullConfig,
  label: fullConfig.name,
  source: 'ai',
  messages: messagesToCommit,
  customDom: finalDom,
  customStyle: finalStyle,
});
```

**适用场景**：
- `handleSendMessage`：AI 响应后创建新节点
- `handleCustomChange`：手动更新 DOM/Style
- `handleNodeEditCommit`：编辑节点配置后提交
- `handleImportFile`：导入配置文件

**不适用场景**（仍需原子方法）：
- 需要在校验 `nodeId` 后再决定是否选中的场景
- 需要批量 commit 多个节点但只选中最后一个的场景

## 3. 文件变更清单

| 文件                                          | 变更类型 | 说明                                                                 |
| --------------------------------------------- | -------- | -------------------------------------------------------------------- |
| `src/components/editor/chat-panel.tsx`        | 修改     | input → textarea 多行输入；新增 DOM/CSS 携带开关；`onSendMessage` 签名变更 |
| `src/components/editor/chat-panel.module.css` | 修改     | textarea 样式、开关区域样式                                          |
| `src/hooks/use-ai-chat.ts`                    | 修改     | `sendMessage` 签名扩展，支持传入 CSS 上下文和开关选项；动态拼接 system prompt |
| `src/constants/ai.ts`                         | 修改     | 新增 CSS 替换模式和增量模式的 prompt 常量                             |
| `src/routes/editor.tsx`                       | 修改     | `handleSendMessage` 适配开关状态和 CSS 替换逻辑；新增 `handleNodeEditCommit` |
| `src/components/editor/node-detail.tsx`       | 修改     | 新增编辑模式，支持 config/label/dom/style 编辑与校验提交              |
| `src/components/editor/node-detail.module.css`| 修改     | 编辑模式相关样式                                                     |
| `src/components/editor/branch-panel.tsx`      | 修改     | 透传 `onCommitEdit` 给 `NodeDetail`                                  |

## 4. 边界情况处理

| 场景                                        | 处理方式                                                             |
| ------------------------------------------- | -------------------------------------------------------------------- |
| textarea 输入纯空白内容                     | trim 后为空则不发送，与现有行为一致                                  |
| 快速连续按 Enter                            | `isStreaming` 期间禁止发送，与现有行为一致                           |
| 两个开关都关闭                              | 仅传 `currentConfig` 和用户需求文本，AI 仍可正常返回 config          |
| `includeCss=true` 但 AI 未返回 style        | `finalStyle` 保持 `currentStyle` 不变（`sanitizedStyle ?? currentStyle`） |
| 编辑节点 config 时 JSON 格式错误            | textarea 下方显示红色错误提示，提交按钮仍可点击但校验不通过不创建节点 |
| 编辑节点时清空 config textarea              | 校验失败，提示"配置不能为空"                                         |
| 编辑节点提交后原节点                        | 原节点保持不变，新节点作为子节点创建                                 |
| 未选中任何节点时 NodeDetail                   | 显示空状态提示，不显示编辑按钮                                       |

## 5. 验收标准

1. 对话框输入区为 textarea，按 Enter 发送消息，按 Shift+Enter 插入换行
2. textarea 随内容自动增长高度，最大不超过 8 行（约 200px），超出后可滚动
3. 发送后 textarea 重置为最小高度
4. 输入框上方显示"携带全量 DOM"和"携带 CSS 样式"两个开关，默认为开启状态
5. 开启"携带全量 DOM"后，发送给 AI 的 prompt 中包含完整的 DOM HTML
6. 关闭"携带全量 DOM"后，发送给 AI 的 prompt 中包含 DOM 摘要（而非完整 HTML）
7. 关闭"携带 CSS 样式"后，发送给 AI 的 prompt 中不包含当前 CSS 内容
8. 开启"携带 CSS 样式"时，AI 返回的 style 直接替换现有样式（通过 `computeStyles` 封装）
9. 开启"携带 CSS 样式"时，system prompt 中包含"必须返回全量 CSS"的强制要求，并通过独立 user prompt 激活
10. 关闭"携带 CSS 样式"时，AI 返回的 style 仍通过 mergeStyles 追加（通过 `computeStyles` 封装）
11. 节点详情面板中 Label 和 Config 直接以 input/textarea 渲染，可编辑
12. 节点详情面板中 DOM 和 Style 默认折叠展示（只读），点击标题可展开/折叠
13. 点击"保存"按钮时校验 config JSON 合法性，校验失败显示错误提示，不创建新节点
14. 保存成功后创建新的 history node 并自动选中（通过 `commitAndSelect` 聚合方法），DOM 和 Style 保持原节点值
15. 点击"恢复"按钮将 Label 和 Config 恢复为当前选中节点的原始数据
16. 所有日志使用 `logger`，pointer 格式符合规范
17. TypeScript 类型检查通过，无 any 类型
18. 执行 `pnpm fmt:check` 和 `pnpm lint:fix` 无报错
