# Spec: Chat Panel 开关优化

## 需求概述

1. 新增"携带动画配置"开关，默认打开
2. 开关 UI 从 checkbox + 文本 改为圆角方形图标按钮
3. System Prompt 联动：未携带动画配置时，禁止 AI 返回动画相关字段

## 需求 1：增加"携带动画配置"开关

- `SendMessageOptions`（`chat-panel.tsx`）新增 `includeAnimationConfig: boolean`
- `ChatPanel` 新增 state `includeAnimationConfig`，**默认 `true`**
- `editor.tsx` 的 `handleSendMessage` 中，根据 `options.includeAnimationConfig` 决定是否将 `currentConfig` 传给 `sendMessage`（关闭时传空对象 `{ tracks: [], triggerGroups: {} }`）
- `use-ai-chat.ts` 的 `sendMessage` 中，当未携带动画配置时，不将 `currentConfig` 拼入 user prompt

## 需求 2：开关 UI 改为圆角方形图标

将现有的 `checkbox + 文本` 替换为**圆角方形图标按钮**，三个开关并排：

| 开关          | 图标（SVG）    | Tooltip（title） |
| ------------- | -------------- | ---------------- |
| 携带全量 DOM  | 代码括号 `</>` | `携带全量 DOM`   |
| 携带 CSS 样式 | 调色板         | `携带 CSS 样式`  |
| 携带动画配置  | 齿轮           | `携带动画配置`   |

### 视觉规范

- **尺寸**：`28rem × 28rem`，圆角 `6rem`，与发送按钮视觉协调
- **选中态**：浅蓝色背景（`#dbeafe`）+ 蓝色图标（`#4f86f7`）
- **未选中态**：透明背景 + 灰色图标（`#94a3b8`），hover 时浅灰背景（`#f1f5f9`）

### 实现方式

- 保留 `<label>` + `<input type="checkbox">` 结构
- `<input>` 通过 CSS 隐藏（`appearance: none; position: absolute; opacity: 0; width: 0; height: 0`）
- `<label>` 承载图标样式，内联 SVG（`16rem × 16rem`），通过 `title` 属性提供 hover tooltip
- **选中态通过 CSS `:checked` 伪类实现**，避免 JS 操作 DOM：
  ```css
  .toggleInput:checked + .toggleIcon {
    /* 选中态样式 */
  }
  ```

## 需求 3：System Prompt 联动

统一采用"识别指令 → 行为"模式：system prompt 只描述指令与行为的映射，运行时按需追加 user prompt 指令。

### System Prompt 改动（`src/constants/ai.ts`）

**修改** `CSS 携带模式规则` 段落，改为指令识别模式：

```
## CSS 携带模式规则
当收到"[系统指令] 已启用 CSS 携带模式"时，返回的 style 字段将**替换**（而非追加到）现有样式。因此你**必须返回全量 CSS**，包含所有需要保留的样式规则，不能仅输出增量变更。
```

**新增** `动画配置携带模式规则` 段落：

```
## 动画配置携带模式规则
当收到"[系统指令] 未启用动画配置携带模式"时，**禁止**返回 config 和 animationPatch 字段，仅允许返回 name、domPatch、style。
```

### 运行时指令追加（`src/hooks/use-ai-chat.ts`）

- 当 `includeCss` 为 `true` 时：追加 `[系统指令] 已启用 CSS 携带模式`（**需修改现有指令文本**，当前代码中为 `[系统指令] 已启用 CSS 携带模式，请按照 system prompt 中的"CSS 携带模式规则"返回全量 CSS。`，需精简为统一格式）
- 当 `includeAnimationConfig` 为 `false` 时：
  - 不将 `当前动画配置：...` 拼入 user prompt
  - 追加 `[系统指令] 未启用动画配置携带模式`

## 涉及文件

| 文件                                          | 改动                                                                        |
| --------------------------------------------- | --------------------------------------------------------------------------- |
| `src/components/editor/chat-panel.tsx`        | 新增 state、改 UI 为隐藏 input + label 图标、更新 `SendMessageOptions` 类型 |
| `src/components/editor/chat-panel.module.css` | 隐藏 input 样式、label 图标样式、`:checked` 伪类选中态                      |
| `src/routes/editor.tsx`                       | `handleSendMessage` 中处理 `includeAnimationConfig`                         |
| `src/hooks/use-ai-chat.ts`                    | 根据 `includeAnimationConfig` 控制 user prompt 中是否包含动画配置           |
| `src/constants/ai.ts`                         | `SYSTEM_PROMPT` 新增动画配置携带模式规则                                    |
