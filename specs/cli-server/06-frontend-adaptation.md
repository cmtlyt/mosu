# 前端适配

## 移除 WebLLM

**变更文件**: `src/utils/editor/ai-engine.ts`

移除所有 WebLLM 相关代码，仅保留 API 调用模式。完整文件内容：

```typescript
import type { ChatCompletionMessageParam } from '@lib/types/openai';
import { logger } from '@lib/logger';

const AI_BASE_URL_KEY = 'mosu_ai_base_url';

async function parseSSEStream(body: ReadableStream<Uint8Array>, onChunk: (text: string) => void): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let fullResponse = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ') || trimmed === 'data: [DONE]') {
        continue;
      }

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

async function streamChatViaApi(
  baseUrl: string,
  messages: ChatCompletionMessageParam[],
  onChunk: (text: string) => void,
): Promise<string> {
  logger.info('libs.ai-engine.api', `Using API mode with base URL: ${baseUrl}`);

  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
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

  return parseSSEStream(response.body, onChunk);
}

export async function streamChat(
  messages: ChatCompletionMessageParam[],
  onChunk: (text: string) => void,
): Promise<string> {
  const baseUrl = localStorage.getItem(AI_BASE_URL_KEY) ?? '';

  if (!baseUrl) {
    throw new Error('AI base URL not configured. Please set it in settings.');
  }

  return streamChatViaApi(baseUrl, messages, onChunk);
}
```

**删除的内容**：

- `getAIEngine` 函数（WebLLM 引擎初始化）
- `streamChatViaProxy` 函数（localhost:3001 代理降级）
- `useFallback` 变量
- `CreateMLCEngine`、`MLCEngineInterface` 导入
- `MODEL_ID_MAP` 导入
- `detectModelTier` 导入
- `AI_MODE_KEY` 常量（不再需要模式切换）
- `LOCAL_AI_PROXY_URL` 常量

## 删除模型加载器

**删除文件**: `src/hooks/use-model-loader.ts`

该 hook 原本用于加载 WebLLM 模型。移除 WebLLM 后，editor.tsx 不再引用此 hook（见下节），直接删除整个文件。

## 对话面板条件显示

**变更文件**: `src/routes/editor.tsx`

在 `EditorPage` 组件中，根据 AI URL 配置控制对话面板显示。变更点：

1. 新增 `isAIConfigured` state（在现有 `useState` 声明区域之后）
2. 用 `{isAIConfigured && <ChatPanel ... />}` 包裹 `ChatPanel`
3. 移除 `useModelLoader` 的调用（不再需要模型加载状态）
4. `handleSendMessage` 中移除 `isLoaded` 检查（改为检查 `isAIConfigured`）

```typescript
const [isAIConfigured] = useState(() => {
  return Boolean(localStorage.getItem('mosu_ai_base_url'));
});

// 移除: const { isLoaded, error: modelError } = useModelLoader();

// handleSendMessage 中的变更：
if (!isAIConfigured) {
  dispatchEditorEvent(EDITOR_EVENTS.MESSAGE, { text: 'AI 未配置，请在设置中配置 AI API', type: 'error' });
  return;
}

// JSX 中的变更：
{isAIConfigured && (
  <ChatPanel
    messages={displayMessages}
    isStreaming={isStreaming}
    onSendMessage={handleSendMessage}
    currentConfig={currentConfig}
  />
)}
```

**同时需要移除的导入**：

```typescript
// 删除此行：
import { useModelLoader } from '@/hooks/use-model-loader';
```

## 删除 AI 常量文件

**删除文件**: `src/constants/ai.ts`

- `SYSTEM_PROMPT` 已迁移到 `server/prompts/editor.ts`
- `MODEL_ID_MAP` 随 WebLLM 一起移除
