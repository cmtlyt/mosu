# Spec: AI 对话生成预览区 DOM

## 1. 背景与目标

当前预览区的 DOM 结构完全由 `PreviewTemplate.html` 静态定义，用户只能通过下拉菜单切换预设模板。AI 对话仅能生成 `AnimationConfig`（动画轨道配置），无法改变预览区本身的 DOM 结构。

**目标**：让用户通过自然语言对话描述想要的预览场景，AI 同时生成 **DOM 结构** 和 **动画配置**，使预览区能够呈现任意自定义 HTML 内容并配合动画播放。

## 2. 核心设计

### 2.1 扩展 AI 输出 Schema

将 AI 的输出从单一的 `AnimationConfig` 扩展为包含 DOM 结构和样式的复合结构：

```typescript
// src/types/ai-response.ts
export interface AIEditorResponse {
  /** 预览区 DOM 结构（合法 HTML 字符串） */
  dom?: string;
  /** 预览区样式（合法 CSS 字符串，禁止包含动画相关属性） */
  style?: string;
  /** 动画配置（仅包含 tracks，version/id/name 由系统自动生成） */
  config: Pick<AnimationConfig, 'tracks'> & { name?: string };
}
```

- **`dom` 为可选字段**：当用户仅描述动画效果时，AI 可省略 `dom`，沿用当前历史节点的 DOM；当用户描述了新的场景/元素时，AI 必须返回 `dom`。
- **`style` 为可选字段**：用于定义预览区的静态样式。**严禁包含任何动画相关属性**（见 3.4 节）。
- **`config` 精简**：AI 仅需输出 `tracks` 和可选的 `name`，`version`、`id` 由系统在 commit 时自动生成，避免 AI 生成冗余或冲突的标识符。
- **`config.tracks[].target`** 中的 CSS 选择器必须能在 `dom` 中匹配到对应元素。

### 2.2 System Prompt 调整

在现有 `SYSTEM_PROMPT` 基础上追加 DOM 生成规则：

```text
## DOM 生成规则（新增）

8. 当用户描述了新的预览场景、元素或布局时，必须在输出中包含 "dom" 字段，值为合法的 HTML 字符串。
9. "dom" 中的元素必须包含 class 或 id，以便 "tracks" 中的 "target" 选择器能够精确匹配。
10. "dom" 应为纯 HTML 片段（不含 <html>/<body>/<head>），可直接作为 innerHTML 使用。
11. "dom" 中允许使用内联 style，但禁止 <script> 标签和事件属性（onclick 等）。
12. 如果用户未提及 DOM 变更，则不输出 "dom" 字段，保持当前预览区不变。
13. 增量修改时：若用户仅调整动画，保留已有 dom；若用户要求更换场景，则替换 dom 并同步更新 tracks 的 target。

## Style 生成规则（新增）

14. 当需要为预览区元素定义静态样式时，可输出 "style" 字段，值为合法的 CSS 字符串。
15. "style" 中**严禁包含任何动画相关属性**，包括但不限于：animation、animation-name、animation-duration、animation-timing-function、animation-delay、animation-iteration-count、animation-direction、animation-fill-mode、animation-play-state、transition、@keyframes。这些属性由 AnimationConfig 的 tracks 统一管理。
16. "style" 仅用于布局、颜色、字体、尺寸等静态视觉样式。
```

### 2.3 DOM 摘要生成与传输

传给 AI 的 DOM 不应是完整 HTML，而应经过摘要处理，减少 token 消耗并聚焦结构信息。

新增 `src/libs/dom-summary.ts`：

```typescript
/**
 * 将完整 DOM HTML 转换为结构化摘要，供 AI 理解当前预览区结构
 * @param html - 完整的 HTML 字符串
 * @returns 精简的 DOM 摘要字符串
 */
export function generateDomSummary(html: string): string;
```

**摘要策略**：

1. 使用 `DOMParser` 解析 HTML
2. 递归遍历元素节点，仅保留：标签名、`class`、`id`、直接子元素数量
3. 移除所有文本内容、内联 style、data-\* 属性值（仅保留 key）
4. 输出为缩进树形文本，例如：
   ```text
   div.container
     div.card (x3)
       span.title
       p.desc
     button.action
   ```
5. 摘要总长度限制 2000 字符，超限则截断深层节点

**集成点**：在 `use-ai-chat.ts` 的 `sendMessage` 中，将 `domStructure` 参数替换为 `generateDomSummary(domStructure)` 的输出。

### 2.4 解析逻辑升级

修改 `use-ai-chat.ts` 中的解析函数：

```typescript
function parseAIResponse(raw: string): AIEditorResponse | null {
  // 尝试直接解析
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && 'config' in parsed) {
      return parsed as AIEditorResponse;
    }
  } catch {
    /* fall through */
  }

  // 兜底：提取 JSON 块
  const match = raw.match(/[[{][\s\S]*[\]}]/u);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (parsed && typeof parsed === 'object') {
        // 兼容旧格式：如果顶层就是 AnimationConfig，包装为 AIEditorResponse
        if ('tracks' in parsed && !('config' in parsed)) {
          return { config: parsed as AnimationConfig };
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

### 2.5 状态管理扩展

**移除 templateSelect 逻辑**：不再维护 `templateIndex` 和 `PRESET_TEMPLATES` 下拉选择器。预览区的 DOM 和 Style 完全由 history tree 的节点数据管理，每个历史节点独立存储自己的 `customDom` 和 `customStyle`。

在 `src/routes/editor.tsx` 页面组件中，`customDom` 和 `customStyle` 不再是独立的 useState，而是从当前选中的 history node 中派生：

```typescript
// 从当前 history node 派生，无需独立 state
const currentDom = selectedNodeData?.customDom ?? initialNodeData.customDom ?? null;
const currentStyle = selectedNodeData?.customStyle ?? initialNodeData.customStyle ?? null;
```

| 字段           | 来源            | 说明                                              |
| -------------- | --------------- | ------------------------------------------------- |
| `currentDom`   | HistoryNodeData | 当前节点的 DOM 快照，为 `null` 时使用初始默认 DOM |
| `currentStyle` | HistoryNodeData | 当前节点的 CSS 快照，为 `null` 时无额外样式       |

**数据流**：

```text
AI 返回 AIEditorResponse
  ├── response.dom 存在 → sanitizeDom() → commit({ customDom })
  ├── response.style 存在 → sanitizeStyle() → commit({ customStyle })
  └── 均不存在 → 仅 commit({ config })，DOM/Style 继承上一节点

用户手动输入 DOM/Style
  → sanitizeDom()/sanitizeStyle() → commit({ customDom, customStyle, source: 'manual' })

checkout(nodeId)
  → 自动恢复该节点的 customDom + customStyle + config
```

**初始默认 DOM**：在 `initialNodeData` 中设置默认的 `customDom`（原 `DEFAULT_TARGET_HTML`）和 `customStyle: null`，作为所有未指定 DOM 的节点的兜底值。

**历史记录扩展**：在 `src/types/history.ts` 的 `HistoryNodeData` 中增加字段：

```typescript
export interface HistoryNodeData {
  config: AnimationConfig;
  label: string;
  source: 'manual' | 'ai';
  timestamp: number;
  messages: ChatMessage[];
  customDom: string | null; // 必填：该节点的 DOM 快照，null 表示使用父节点或初始默认值
  customStyle: string | null; // 必填：该节点的 CSS 快照，null 表示无额外样式
}
```

- `commit()` 时必须写入 `customDom` 和 `customStyle`（若未变更则继承当前值）
- `checkout()` 时直接从节点数据读取，无需额外恢复逻辑

### 2.6 PreviewCanvas 与 PreviewPanel 适配

**移除 templateSelect**：`PreviewPanel` 不再接收 `template`、`templates`、`onTemplateChange` props。预览区内容完全由 `customDom` + `customStyle` 驱动。

**PreviewPanel Props**：

```typescript
interface PreviewPanelProps {
  config: AnimationConfig;
  customDom: string | null;
  customStyle: string | null;
  onCustomDomChange: (dom: string | null) => void;
  onCustomStyleChange: (style: string | null) => void;
}
```

**PreviewCanvas 渲染逻辑**：修改 `src/components/preview/preview-canvas.tsx`，在 `useLayoutEffect` 中：

1. 若 `customDom` 存在，设置 innerHTML 为 `customDom`；否则显示占位提示
2. 若 `customStyle` 存在，动态创建 `<style>` 标签注入容器；否则移除已有自定义 style 标签
3. 当 `customDom`、`customStyle` 或 `config` 变化时，重新设置并应用动画

### 2.7 ChatMessage 类型扩展

在 `src/types/history.ts` 的 `ChatMessage` 接口中增加可选字段：

```typescript
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  animationName?: string;
  hasDomUpdate?: boolean; // 标记该消息是否触发了预览区 DOM/Style 更新
}
```

- 当 AI 返回的 `AIEditorResponse.dom` 或 `style` 存在且通过校验时，将对应 assistant 消息的 `hasDomUpdate` 设为 `true`
- `ChatMessageItem` 组件根据 `hasDomUpdate` 渲染"已更新预览场景"标签

### 2.8 用户手动输入 DOM 与 Style

在 `PreviewPanel` 头部区域新增两个可折叠输入框，允许用户直接编辑预览区 DOM 和 CSS：

**UI 布局**：在预览区顶部增加"自定义 DOM/Style"折叠面板，展开后显示：

- **DOM 输入框**：`<textarea>`，placeholder="输入自定义 HTML 结构..."，行数 6，初始值为当前 `customDom`
- **Style 输入框**：`<textarea>`，placeholder="输入自定义 CSS 样式（禁止动画属性）..."，行数 4，初始值为当前 `customStyle`
- **应用按钮**：点击后对输入内容执行 `sanitizeDom()` / `sanitizeStyle()`，校验通过后调用 `onCustomDomChange()` / `onCustomStyleChange()` 并触发 `commit({ source: 'manual' })`
- **重置按钮**：点击后将输入框内容恢复为当前历史节点的值（不触发 commit）

**Props**：`PreviewPanel` 接收 `customDom`、`customStyle`、`onCustomDomChange`、`onCustomStyleChange`，由 `editor.tsx` 传入。

**交互约束**：

- 输入框仅在非 streaming 状态下可编辑
- 输入内容实时保存为草稿（localStorage），避免意外丢失
- sanitize 失败时在输入框下方显示红色错误提示，不应用
- 每次应用都会创建新的 history node，确保版本可追溯

### 2.9 ChatPanel 交互增强

- AI 返回包含 `dom` 或 `style` 的消息时，在消息气泡中标注 **"已更新预览场景"** 标签（基于 `hasDomUpdate` 字段）
- 移除"恢复默认模板"按钮（templateSelect 已移除，无需此操作）
- 用户可通过 checkout 到任意历史节点来恢复之前的 DOM/Style 状态

### 2.10 handleSendMessage 完整处理逻辑

修改 `src/routes/editor.tsx` 中的 `handleSendMessage`，完整处理 `AIEditorResponse`：

```typescript
const handleSendMessage = useCallback(
  async (content: string) => {
    if (!isLoaded) {
      logger.warn('routes.editor.sendMessage', '模型尚未加载');
      setErrorToast(modelError ?? '模型加载中，请稍候...');
      return;
    }

    // 传给 AI 的 DOM 使用摘要而非完整内容
    const domSummary = currentDom ? generateDomSummary(currentDom) : '';
    const result = await sendMessage(content, currentConfig, domSummary);

    if (result.config) {
      let sanitizedDom: string | null = null;
      let sanitizedStyle: string | null = null;

      // 处理 DOM 更新
      if (result.dom) {
        sanitizedDom = sanitizeDom(result.dom);
        if (!sanitizedDom) {
          logger.warn('routes.editor.sanitize.dom', 'AI generated DOM failed sanitization');
          setErrorToast('AI 生成的预览内容包含不安全元素，已忽略 DOM 更新');
        }
      }

      // 处理 Style 更新
      if (result.style) {
        sanitizedStyle = sanitizeStyle(result.style);
        if (!sanitizedStyle) {
          logger.warn('routes.editor.sanitize.style', 'AI generated style contains animation properties');
          setErrorToast('AI 生成的样式包含动画属性，已忽略样式更新');
        }
      }

      // 标记消息的 hasDomUpdate
      const hasUpdate = !!sanitizedDom || !!sanitizedStyle;
      const newMessages = result.messages.map((msg) => ({
        ...msg,
        hasDomUpdate: msg.role === 'assistant' && hasUpdate,
      }));

      const messagesToCommit = newMessages.filter((msg) => !messages.some((existing) => existing.id === msg.id));

      // 构建完整的 AnimationConfig（系统自动生成 version/id）
      const fullConfig: AnimationConfig = {
        version: '1.0',
        id: generateAnimationId(),
        name: result.config.name || content.slice(0, 20) + (content.length > 20 ? '...' : ''),
        tracks: result.config.tracks,
      };

      commit({
        config: fullConfig,
        label: fullConfig.name,
        source: 'ai',
        messages: messagesToCommit,
        customDom: sanitizedDom !== null ? sanitizedDom : currentDom,
        customStyle: sanitizedStyle !== null ? sanitizedStyle : currentStyle,
      });

      dispatchEditorEvent(EDITOR_EVENTS.CONFIG_COMMITTED);
    }
  },
  [currentConfig, sendMessage, commit, isLoaded, modelError, messages, currentDom, currentStyle],
);
```

## 3. 安全约束与 Sanitizer 实现

### 3.1 DOM Sanitizer API

新增 `src/libs/dom-sanitizer.ts`，导出以下函数：

```typescript
/**
 * 对 AI 生成或用户输入的 HTML 字符串进行安全过滤
 * @param rawHtml - 原始 HTML 字符串
 * @returns 过滤后的安全 HTML 字符串，若校验失败返回 null
 */
export function sanitizeDom(rawHtml: string): string | null;

/**
 * 对 AI 生成或用户输入的 CSS 字符串进行安全过滤
 * 移除所有动画相关属性和 @keyframes 规则
 * @param rawCss - 原始 CSS 字符串
 * @returns 过滤后的安全 CSS 字符串，若全部被移除则返回 null
 */
export function sanitizeStyle(rawCss: string): string | null;
```

### 3.2 DOM 白名单策略

使用 `DOMParser` 解析后遍历节点，仅保留以下白名单标签：

| 类别         | 允许标签                                                                                                 |
| ------------ | -------------------------------------------------------------------------------------------------------- |
| 结构         | `div`, `span`, `p`, `h1`-`h6`, `ul`, `ol`, `li`, `section`, `article`, `header`, `footer`, `main`, `nav` |
| 文本         | `strong`, `em`, `b`, `i`, `u`, `small`, `sub`, `sup`, `br`, `hr`                                         |
| 媒体         | `img`（仅允许 `data:` 或相对路径 `src`）                                                                 |
| 表格         | `table`, `thead`, `tbody`, `tr`, `th`, `td`                                                              |
| 表单（只读） | `input`（仅 `type="text"/"checkbox"/"radio"`，强制 `disabled`）、`label`                                 |

**属性白名单**：仅保留 `class`, `id`, `style`, `data-*`, `aria-*`, `role`。**移除所有事件属性（`on*`）**、`href`（除 `a` 标签外）、`src`（除 `img` 外且需校验协议）。

### 3.3 DOM 过滤流程

```text
1. 检查 rawHtml.length <= 51200（50KB），超限直接返回 null
2. 使用 DOMParser.parseFromString(rawHtml, 'text/html') 解析
3. 递归遍历 body.childNodes：
   a. 非元素节点（文本/注释）→ 保留文本，移除注释
   b. 元素节点不在白名单 → 移除该节点及其子树
   c. 元素在白名单 → 遍历 attributes，移除非白名单属性
   d. img 标签 → 校验 src 协议，仅允许 data: 或相对路径
4. 序列化 body.innerHTML 作为返回值
5. 若解析抛出异常或结果为空字符串，返回 null
```

### 3.4 Style 动画属性过滤

`sanitizeStyle()` 必须移除以下 CSS 属性和规则：

**禁止的属性**（正则匹配，不区分大小写）：

- `animation`, `animation-name`, `animation-duration`, `animation-timing-function`, `animation-delay`, `animation-iteration-count`, `animation-direction`, `animation-fill-mode`, `animation-play-state`
- `transition`, `transition-property`, `transition-duration`, `transition-timing-function`, `transition-delay`

**禁止的规则**：

- `@keyframes` 规则块（整个块移除）

**实现方式**：

1. 使用 CSS 解析器（如 `css-tree` 或简易正则）解析 CSS 文本
2. 遍历所有声明，移除匹配上述属性的声明
3. 移除所有 `@keyframes` at-rule
4. 序列化剩余 CSS 作为返回值
5. 若结果为空或仅含空白，返回 null

### 3.5 集成点

- 在 `handleSendMessage` 中分别调用 `sanitizeDom(result.dom)` 和 `sanitizeStyle(result.style)`
- 在用户手动输入应用时，同样调用对应的 sanitize 函数
- 在 `checkout()` 恢复历史节点时，对存储的 `customDom` 和 `customStyle` 执行 sanitize（防御性校验）

## 4. 文件变更清单

| 文件                                        | 变更类型 | 说明                                                                                                                                                            |
| ------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/types/ai-response.ts`                  | 新增     | `AIEditorResponse` 类型定义（dom、style、精简 config）                                                                                                          |
| `src/types/history.ts`                      | 修改     | `ChatMessage` 增加 `hasDomUpdate?`；`HistoryNodeData` 增加必填 `customDom`、`customStyle`                                                                       |
| `src/constants/templates.ts`                | 修改     | 移除 `PresetTemplate` 及 `PRESET_TEMPLATES`，保留 `createInitialConfig` 和默认 DOM 常量                                                                         |
| `src/hooks/use-ai-chat.ts`                  | 修改     | 更新 SYSTEM_PROMPT（追加规则 8-16）、替换解析函数为 `parseAIResponse`、返回值改为 `AIEditorResponse`、传入 DOM 摘要                                             |
| `src/routes/editor.tsx`                     | 修改     | 移除 `templateIndex`/`handleTemplateChange`；从 history node 派生 currentDom/currentStyle；`handleSendMessage` 处理 dom/style/sanitize/摘要/自动生成 version+id |
| `src/components/preview/preview-canvas.tsx` | 修改     | Props 移除 `template`，改为 `customDom`/`customStyle`；useLayoutEffect 按新逻辑渲染                                                                             |
| `src/components/editor/preview-panel.tsx`   | 修改     | 移除 templateSelect；Props 改为 `customDom`/`customStyle`/回调；新增 DOM/Style 手动输入面板                                                                     |
| `src/components/editor/chat-panel.tsx`      | 修改     | 移除"恢复默认模板"按钮                                                                                                                                          |
| `src/components/editor/chat-message.tsx`    | 修改     | 根据 `hasDomUpdate` 渲染"已更新预览场景"标签                                                                                                                    |
| `src/libs/dom-sanitizer.ts`                 | 新增     | `sanitizeDom()` + `sanitizeStyle()` 函数                                                                                                                        |
| `src/libs/dom-summary.ts`                   | 新增     | `generateDomSummary()` 函数，将完整 DOM 转为结构化摘要                                                                                                          |

## 5. 边界情况处理

- **AI 返回的 dom 中 target 选择器无匹配**：校验失败，保留旧 DOM，提示用户"AI 生成的 DOM 与动画目标不匹配，请重新描述"
- **AI 仅返回 dom 未返回 config**：视为无效响应，提示重试
- **连续多次生成 dom**：每次创建新的 history node，DOM/Style 快照独立存储，可通过 checkout 回溯任意版本
- **初始节点无 customDom**：使用 `initialNodeData.customDom` 作为兜底默认值
- **checkout 到无 customDom 的历史节点**：该节点 `customDom` 为 `null`，预览区显示占位提示或继承父节点（由业务决定）

## 6. 验收标准

1. 用户输入"创建一个包含三个卡片的布局，卡片依次弹入"，AI 返回包含三卡片 HTML 的 dom + 三条 track 的 config，预览区正确渲染
2. 用户输入"把动画改成旋转"，AI 仅返回 config（tracks），预览区 DOM/Style 继承上一节点不变
3. 恶意输入 `<script>alert(1)</script>` 被 DOMParser 解析后移除，不执行
4. AI 返回的 style 中包含 `animation: spin 1s` 或 `@keyframes` 规则时，被 `sanitizeStyle()` 过滤，不注入
5. 用户在手动输入框中输入自定义 DOM 和 CSS，点击应用后预览区正确渲染，且创建新的 history node
6. checkout 到任意历史节点时，customDom 和 customStyle 自动恢复为该节点保存的值
7. 传给 AI 的 DOM 为摘要格式（树形结构文本），而非完整 HTML，token 消耗显著降低
8. AI 输出的 config 不包含 version/id 字段，由系统在 commit 时自动生成
9. 所有日志使用 `logger`，pointer 格式符合规范（如 `'editor.sanitize.dom'`、`'editor.preview.style'`）
10. 全局搜索无 `PresetTemplate`、`templateSelect`、`templateIndex` 残留引用
