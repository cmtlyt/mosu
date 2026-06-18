# Spec: Editor Header 重构与配置弹窗

## 需求概述

1. 补充编辑页面标题（`<title>` 标签）
2. Header 部分左右对齐：左边为标题，右边为操作按钮
3. 新增 AI 调用方式配置弹窗（HTML 原生 `<dialog>`），含两个 tab：AI 配置 / Localhost AI Server 模板
4. 新增"应用动画"弹窗（HTML 原生 `<dialog>`），展示基于当前配置生成的动画接入指南
5. 创建 npm 包打包的 Vite 配置，输出 `dist-npm`，打包目标为动画 SDK

---

## 需求 1：补充编辑页面标题

### 实现方式

在 `src/routes/editor.tsx` 的 `EditorPage` 组件中，使用 `useEffect` 设置 `document.title`：

```typescript
useEffect(() => {
  document.title = 'Mosu Editor';
  return () => {
    document.title = 'Mosu';
  };
}, []);
```

### 涉及文件

| 文件 | 改动 |
|------|------|
| `src/routes/editor.tsx` | 新增 `useEffect` 设置页面标题 |

---

## 需求 2：Header 左右对齐布局

### 视觉规范

- **左侧**：页面标题 "Mosu Editor"（字体大小 `16rem`，字重 `600`，颜色 `#1e293b`）
- **右侧**：操作按钮组（导入/导出/分享/AI 配置/应用动画），按钮间距 `8rem`
- **整体**：`justify-content: space-between`，保持现有 padding 和 border

### 布局结构

```tsx
<div className={styles.toolbar}>
  <h1 className={styles.toolbarTitle}>Mosu Editor</h1>
  <div className={styles.toolbarActions}>
    <button>导入</button>
    <button>导出</button>
    <button>分享</button>
    <button>AI 配置</button>
    <button>应用动画</button>
  </div>
</div>
```

### 样式改动

```css
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  /* 保留现有 padding 和 border */
}

.toolbarTitle {
  font-size: 16rem;
  font-weight: 600;
  color: #1e293b;
  margin: 0;
}

.toolbarActions {
  display: flex;
  align-items: center;
  gap: 8rem;
}
```

### 涉及文件

| 文件 | 改动 |
|------|------|
| `src/routes/editor.tsx` | 重构 toolbar 结构，新增标题和按钮 |
| `src/styles/editor.module.css` | 新增 `.toolbarTitle`、`.toolbarActions`，修改 `.toolbar` 布局 |

---

## 需求 3：AI 配置弹窗（含 Localhost Server 模板）

### 功能描述

点击 "AI 配置" 按钮，弹出 HTML 原生 `<dialog>`，包含两个 tab 页：

1. **AI 配置**：切换 AI 调用方式（WebLLM / API），配置 API Base URL
2. **Localhost AI Server**：纯 Node.js 实现模板（不依赖 Express）

配置写入 `localStorage`，页面加载时读取。保留现有 WebLLM 失败降级 localhost 的逻辑。

### 弹窗结构

```tsx
<dialog ref={aiConfigDialogRef} className={styles.aiConfigDialog}>
  <div className={styles.aiConfigHeader}>
    <h2>AI 配置</h2>
    <button onClick={() => aiConfigDialogRef.current?.close()}>×</button>
  </div>

  <div className={styles.aiConfigTabs}>
    <button
      className={`${styles.aiConfigTab} ${activeAiTab === 'config' ? styles.aiConfigTabActive : ''}`}
      onClick={() => setActiveAiTab('config')}
    >
      AI 配置
    </button>
    <button
      className={`${styles.aiConfigTab} ${activeAiTab === 'server' ? styles.aiConfigTabActive : ''}`}
      onClick={() => setActiveAiTab('server')}
    >
      Localhost AI Server
    </button>
  </div>

  <div className={styles.aiConfigContent}>
    {activeAiTab === 'config' ? (
      <form method="dialog" className={styles.aiConfigForm}>
        <fieldset>
          <legend>调用方式</legend>
          <label>
            <input type="radio" name="aiMode" value="webllm" checked={aiMode === 'webllm'} onChange={...} />
            WebLLM（浏览器端推理）
          </label>
          <label>
            <input type="radio" name="aiMode" value="api" checked={aiMode === 'api'} onChange={...} />
            API 调用（OpenAI 兼容格式）
          </label>
        </fieldset>

        {aiMode === 'api' && (
          <label>
            API Base URL
            <input type="url" value={apiBaseUrl} onChange={...} placeholder="https://api.openai.com/v1" />
          </label>
        )}

        <div className={styles.aiConfigActions}>
          <button value="cancel">取消</button>
          <button value="confirm" onClick={handleSaveAiConfig}>保存</button>
        </div>
      </form>
    ) : (
      <LocalhostServerTemplate />
    )}
  </div>
</dialog>
```

### 存储逻辑

```typescript
const AI_MODE_KEY = 'mosu_ai_mode';
const AI_BASE_URL_KEY = 'mosu_ai_base_url';

// 读取
const savedMode = localStorage.getItem(AI_MODE_KEY) ?? 'webllm';
const savedBaseUrl = localStorage.getItem(AI_BASE_URL_KEY) ?? '';

// 写入
localStorage.setItem(AI_MODE_KEY, aiMode);
if (aiMode === 'api') {
  localStorage.setItem(AI_BASE_URL_KEY, apiBaseUrl);
}
```

### AI 引擎改造

修改 `src/utils/editor/ai-engine.ts`，新增 API 调用分支：

```typescript
export async function streamChat(
  messages: ChatCompletionMessageParam[],
  onChunk: (text: string) => void,
): Promise<string> {
  const mode = localStorage.getItem('mosu_ai_mode') ?? 'webllm';
  const baseUrl = localStorage.getItem('mosu_ai_base_url') ?? '';

  if (mode === 'api' && baseUrl) {
    return streamChatViaApi(baseUrl, messages, onChunk);
  }

  if (useFallback) {
    return streamChatViaProxy(messages, onChunk);
  }

  try {
    const engine = await getAIEngine();
    // ... 现有 WebLLM 逻辑
  } catch (error) {
    logger.warn('libs.ai-engine.fallback', 'WebLLM failed, switching to local AI proxy', error);
    useFallback = true;
    return streamChatViaProxy(messages, onChunk);
  }
}

async function streamChatViaApi(
  baseUrl: string,
  messages: ChatCompletionMessageParam[],
  onChunk: (text: string) => void,
): Promise<string> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      stream: true,
      temperature: 0.7,
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`API responded with status ${response.status}`);
  }

  // 复用现有 SSE 解析逻辑
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullResponse = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ') || trimmed === 'data: [DONE]') continue;

      try {
        const parsed = JSON.parse(trimmed.slice(6));
        const delta = parsed.choices?.[0]?.delta?.content ?? '';
        fullResponse += delta;
        onChunk(delta);
      } catch {
        // skip malformed SSE chunks
      }
    }
  }

  return fullResponse;
}
```

### 涉及文件

| 文件 | 改动 |
|------|------|
| `src/routes/editor.tsx` | 新增 AI 配置弹窗 state、ref、handler、tab 切换逻辑，新增 "AI 配置" 按钮 |
| `src/styles/editor.module.css` | 新增 `.aiConfigDialog`、`.aiConfigHeader`、`.aiConfigTabs`、`.aiConfigTab`、`.aiConfigTabActive`、`.aiConfigContent`、`.aiConfigForm`、`.aiConfigActions` 样式 |
| `src/utils/editor/ai-engine.ts` | 新增 `streamChatViaApi` 函数，修改 `streamChat` 支持 API 模式 |
| `src/components/editor/localhost-server-template/index.tsx` | 新建组件，展示 Localhost Server 模板 |
| `src/components/editor/localhost-server-template/index.module.css` | 新建组件样式 |

---

## 需求 4：应用动画弹窗

### 功能描述

点击 "应用动画" 按钮，弹出 HTML 原生 `<dialog>`，展示基于当前 `AnimationConfig` 动态生成的动画接入指南。

### 弹窗结构

```tsx
<dialog ref={animationGuideDialogRef} className={styles.animationGuideDialog}>
  <div className={styles.animationGuideHeader}>
    <h2>应用动画</h2>
    <button onClick={() => animationGuideDialogRef.current?.close()}>×</button>
  </div>

  <div className={styles.animationGuideContent}>
    <AnimationGuide config={currentConfig} />
  </div>
</dialog>
```

### 生成逻辑

```typescript
function generateAnimationGuide(config: AnimationConfig): string {
  return `
## 动画接入指南

### 1. 安装依赖

\`\`\`bash
npm install @cmtlyt/mosu
\`\`\`

### 2. 初始化 AnimationPlayer

\`\`\`typescript
import { AnimationPlayer } from '@cmtlyt/mosu/animation-sdk';

const player = new AnimationPlayer({
  autoPlay: true,
  playbackRate: 1,
});
\`\`\`

### 3. 应用动画配置

\`\`\`typescript
const config = ${JSON.stringify(config, null, 2)};

const container = document.querySelector('.animation-container');
const handles = player.apply(container, config);
\`\`\`

### 4. 事件监听

\`\`\`typescript
player.on('complete', () => {
  console.log('所有动画播放完成');
});

player.on('track-complete', ({ trackId }) => {
  console.log(\`轨道 \${trackId} 播放完成\`);
});

player.on('error', ({ trackId, error }) => {
  console.error(\`轨道 \${trackId} 播放失败:\`, error);
});
\`\`\`

### 5. 播放控制

\`\`\`typescript
player.playAll();      // 播放所有动画
player.pauseAll();     // 暂停所有动画
player.cancelAll();    // 取消并重置
player.replay();       // 重播
player.seek(500);      // 跳转到 500ms
\`\`\`

### 6. 销毁播放器

\`\`\`typescript
player.destroy();
\`\`\`
`;
}
```

### 组件拆分

将动画接入指南拆分为独立组件：

- `src/components/editor/animation-guide/index.tsx`：动画接入指南组件

### 涉及文件

| 文件 | 改动 |
|------|------|
| `src/routes/editor.tsx` | 新增应用动画弹窗 state、ref、handler，新增 "应用动画" 按钮 |
| `src/styles/editor.module.css` | 新增 `.animationGuideDialog`、`.animationGuideHeader`、`.animationGuideContent` 样式 |
| `src/components/editor/animation-guide/index.tsx` | 新建组件，生成动画接入指南 |
| `src/components/editor/animation-guide/index.module.css` | 新建组件样式 |

---

## 样式规范

### 弹窗通用样式

```css
/* 弹窗基础样式 */
.aiConfigDialog,
.animationGuideDialog {
  border: none;
  border-radius: 12rem;
  padding: 24rem;
  max-width: 600rem;
  width: 90vw;
  box-shadow: 0 10rem 40rem rgba(0, 0, 0, 0.15);
}

.aiConfigDialog::backdrop,
.animationGuideDialog::backdrop {
  background: rgba(0, 0, 0, 0.5);
}

/* AI 配置弹窗 Header */
.aiConfigHeader {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16rem;
}

.aiConfigHeader h2 {
  margin: 0;
  font-size: 18rem;
  font-weight: 600;
}

.aiConfigHeader button {
  background: none;
  border: none;
  font-size: 24rem;
  cursor: pointer;
  color: #64748b;
}

/* AI 配置弹窗 Tabs */
.aiConfigTabs {
  display: flex;
  border-bottom: 1px solid #e2e8f0;
  margin-bottom: 16rem;
}

.aiConfigTab {
  padding: 8rem 16rem;
  background: none;
  border: none;
  border-bottom: 2rem solid transparent;
  cursor: pointer;
  font-size: 14rem;
  color: #64748b;
}

.aiConfigTabActive {
  color: #4f86f7;
  border-bottom-color: #4f86f7;
}

.aiConfigContent {
  max-height: 60vh;
  overflow-y: auto;
}

/* 表单元素 */
.aiConfigForm h2 {
  margin: 0 0 16rem 0;
  font-size: 18rem;
  font-weight: 600;
}

.aiConfigForm fieldset {
  border: 1px solid #e2e8f0;
  border-radius: 8rem;
  padding: 12rem;
  margin: 0 0 16rem 0;
}

.aiConfigForm legend {
  font-weight: 500;
  padding: 0 8rem;
}

.aiConfigForm label {
  display: flex;
  align-items: center;
  gap: 8rem;
  margin: 8rem 0;
  cursor: pointer;
}

.aiConfigForm input[type='url'] {
  width: 100%;
  padding: 8rem 12rem;
  border: 1px solid #cbd5e1;
  border-radius: 6rem;
  font-size: 14rem;
}

.aiConfigActions {
  display: flex;
  justify-content: flex-end;
  gap: 8rem;
  margin-top: 24rem;
}

.aiConfigActions button {
  padding: 8rem 16rem;
  border-radius: 6rem;
  font-size: 14rem;
  cursor: pointer;
}

.aiConfigActions button[value='cancel'] {
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
}

.aiConfigActions button[value='confirm'] {
  background: #4f86f7;
  border: 1px solid #4f86f7;
  color: #fff;
}

/* 应用动画弹窗 */
.animationGuideHeader {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16rem;
}

.animationGuideHeader h2 {
  margin: 0;
  font-size: 18rem;
  font-weight: 600;
}

.animationGuideHeader button {
  background: none;
  border: none;
  font-size: 24rem;
  cursor: pointer;
  color: #64748b;
}

.animationGuideContent {
  max-height: 60vh;
  overflow-y: auto;
  padding: 16rem;
  background: #f8fafc;
  border-radius: 8rem;
}
```

---

## 实施顺序

1. **需求 1**：补充页面标题（最简单，先完成）
2. **需求 2**：Header 左右对齐布局（为后续按钮做准备）
3. **需求 3**：AI 配置弹窗（核心功能，涉及 AI 引擎改造和 Localhost Server 模板）
4. **需求 4**：应用动画弹窗（独立功能）
5. **需求 5**：npm 包打包配置（独立于 UI，最后完成）

---

## 需求 5：npm 包打包配置

### 功能描述

创建独立的 Vite 配置文件，将动画 SDK（`src/libs/animation-sdk/`）打包为 npm 包，输出到 `dist-npm` 目录。

### 打包目标

- **入口**：`src/libs/animation-sdk/index.ts`
- **输出目录**：`dist-npm`
- **输出格式**：ESM（`.mjs`）+ CJS（`.cjs`）+ 类型声明（`.d.ts`）
- **外部依赖**：`@cmtlyt/logger` 等运行时依赖标记为 external
- **包名**：`@cmtlyt/mosu`
- **子路径导出**：`@cmtlyt/mosu/animation-sdk`

### Vite 配置文件

创建 `vite.config.npm.ts`：

```typescript
import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    outDir: 'dist-npm',
    lib: {
      entry: resolve(__dirname, 'src/libs/animation-sdk/index.ts'),
      name: 'MosuAnimationSDK',
      formats: ['es', 'cjs'],
      fileName: (format) => `animation-sdk.${format === 'es' ? 'mjs' : 'cjs'}`,
    },
    rollupOptions: {
      external: ['@cmtlyt/logger'],
    },
  },
  plugins: [
    dts({
      outDir: 'dist-npm',
      entryRoot: 'src/libs/animation-sdk',
    }),
  ],
});
```

### package.json 配置

在 `package.json` 中新增 `exports` 字段和打包脚本：

```json
{
  "scripts": {
    "build:npm": "vite build --config vite.config.npm.ts"
  },
  "exports": {
    "./animation-sdk": {
      "import": "./dist-npm/animation-sdk.mjs",
      "require": "./dist-npm/animation-sdk.cjs",
      "types": "./dist-npm/index.d.ts"
    }
  },
  "files": ["dist-npm"]
}
```

### 依赖

- **新增 devDependency**：`vite-plugin-dts`（用于生成 `.d.ts` 类型声明）

### 涉及文件

| 文件 | 改动 |
|------|------|
| `vite.config.npm.ts` | 新建，npm 包打包专用 Vite 配置 |
| `package.json` | 新增 `build:npm` 脚本、`exports` 字段、`files` 字段；新增 `vite-plugin-dts` devDependency |

---

## 测试要点

- [ ] 页面标题正确显示为 "Mosu Editor"
- [ ] Header 左右对齐，标题在左，按钮在右
- [ ] AI 配置弹窗可正常打开/关闭
- [ ] AI 配置弹窗 Tab 切换正常工作
- [ ] 切换 AI 模式后配置正确保存到 localStorage
- [ ] API 模式下 AI 调用正常工作
- [ ] WebLLM 模式下保留降级 localhost 逻辑
- [ ] Localhost Server 模板代码可复制使用
- [ ] 应用动画弹窗可正常打开/关闭
- [ ] 动画接入指南基于当前配置正确生成，包名和导入路径正确
- [ ] `pnpm build:npm` 成功输出到 `dist-npm` 目录
- [ ] `dist-npm` 包含 `.mjs`、`.cjs`、`.d.ts` 文件
