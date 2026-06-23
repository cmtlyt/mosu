# Spec: 预览逻辑抽离为独立页面 + iframe 通信

## 1. 背景与目标

### 1.1 现状问题

当前 `PreviewPanel` 组件直接嵌入在 `editor.tsx` 页面中，与编辑器主逻辑紧密耦合：

- **性能瓶颈**：预览区的 DOM 操作、动画播放与编辑器 UI 渲染共享同一 JS 线程，复杂动画可能导致编辑器卡顿
- **安全隔离不足**：用户自定义 DOM/Style 直接在主页面执行，存在 XSS 风险（虽有 sanitizer，但仍在同域环境）
- **状态耦合**：预览状态（播放/暂停、容器引用）通过 props 和 ref 传递，难以独立测试和维护

### 1.2 重构目标

1. **物理隔离**：将预览渲染与动画播放逻辑抽离为独立路由页面 `/preview`，通过 `<iframe>` 嵌入编辑器
2. **通信解耦**：使用通用跨窗口事件桥接替代 props/ref 传递，bridge 按事件名自动分发到对应回调
3. **职责清晰**：自定义 DOM/Style 的编辑与校验留在 editor 页面，preview 仅负责接收数据并渲染；重播等播放控制在 preview 内部完成
4. **安全增强**：iframe 配置 sandbox 属性，限制脚本执行、表单提交等危险操作
5. **性能提升**：预览区运行在独立 browsing context，不阻塞编辑器主线程
6. **预览常驻**：预览面板始终显示，不存在多 tab 切换或懒加载场景

## 2. 架构设计

### 2.1 整体架构

```text
┌─────────────────────────────────────────────────────────┐
│  /editor (主页面)                                        │
│  ┌──────────────┐  ┌──────────────────────────────────┐ │
│  │ ChatPanel    │  │  <iframe src="/preview">         │ │
│  │              │  │  ┌────────────────────────────┐  │ │
│  │ CustomDom    │◄─┼──│  PreviewPage               │  │ │
│  │ Panel        │  │  │  - PreviewCanvas           │  │ │
│  │              │  │  │  - AnimationPlayer         │  │ │
│  │ BranchPanel  │  │  │  - Replay Button           │  │ │
│  └──────────────┘  │  └────────────────────────────┘  │ │
│                    └──────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
         ▲                    ▲
         │ postMessage        │ postMessage
         ▼                    ▼
   Editor ←──────────────► Preview
   (parent window)        (iframe contentWindow)
```

**职责划分**：

| 模块          | 职责                                                                              |
| ------------- | --------------------------------------------------------------------------------- |
| Editor        | AI 对话、历史管理、DOM/Style 编辑与校验、commit/checkout、向 preview 推送渲染数据 |
| Preview       | 接收 config/dom/style 并渲染、动画播放与重播、播放状态管理                        |
| iframe-bridge | 通用跨窗口事件收发，按事件名分发到注册回调，不绑定任何业务语义                    |

### 2.2 通用跨窗口事件协议

bridge 采用**二级监听机制**：第一级按页面命名空间（namespace）划分，第二级在命名空间内按事件名（event）分发。这种设计确保多页面、多事件场景下不会冲突，且易于扩展。

```typescript
// src/types/iframe-message.ts

/** 跨窗口消息信封 */
export interface IframeMessageEnvelope {
  source: 'mosu-bridge'; // 固定标识，防止与其他 postMessage 冲突
  namespace: string; // 页面命名空间，如 'preview'、'editor'
  event: string; // 事件名，由业务方自定义
  payload?: unknown; // 事件载荷
  timestamp: number;
}

/** 事件处理器类型 */
export type IframeEventHandler<T = unknown> = (payload: T) => void;
```

**命名空间约定**：每个页面使用唯一的命名空间标识，例如：

| 命名空间  | 所属页面   | 说明                               |
| --------- | ---------- | ---------------------------------- |
| `preview` | `/preview` | 预览页发出的所有事件               |
| `editor`  | `/editor`  | 编辑器页发出的所有事件（未来扩展） |

**事件命名约定**：在命名空间内，事件名采用 `模块.动作` 格式，例如：

| 完整事件标识                 | 方向             | 说明                |
| ---------------------------- | ---------------- | ------------------- |
| `preview:ready`              | Preview → Editor | 预览页初始化完成    |
| `preview:update-config`      | Editor → Preview | 推送动画配置        |
| `preview:update-dom`         | Editor → Preview | 推送 DOM/Style 数据 |
| `preview:error`              | Preview → Editor | 预览页运行时错误    |
| `preview:animation-complete` | Preview → Editor | 动画播放结束        |

> **注意**：上表中的 `preview:xxx` 是"命名空间:事件名"的组合表示。实际通信时，`namespace` 和 `event` 是信封中的两个独立字段。

### 2.3 通用 iframe bridge

新增 `src/libs/iframe-bridge.ts`，提供基于命名空间的二级跨窗口事件收发能力：

```typescript
// src/libs/iframe-bridge.ts

import { logger } from '@lib/logger';
import type { IframeMessageEnvelope, IframeEventHandler } from '@/types/iframe-message';

const BRIDGE_SOURCE = 'mosu-bridge';

/** 二级 handler 映射：namespace → event → handlers */
type NamespaceHandlerMap = Map<string, Map<string, Set<IframeEventHandler>>>;

/** 创建面向 iframe 子窗口的 bridge 实例（Editor 侧使用） */
export function createParentBridge(iframe: HTMLIFrameElement) {
  const handlers: NamespaceHandlerMap = new Map();

  /** 向 iframe 发送事件 */
  function emit(namespace: string, event: string, payload?: unknown): void {
    if (!iframe.contentWindow) {
      logger.warn('libs.iframe-bridge.parent.emit', 'iframe contentWindow is null');
      return;
    }
    const envelope: IframeMessageEnvelope = {
      source: BRIDGE_SOURCE,
      namespace,
      event,
      payload,
      timestamp: Date.now(),
    };
    iframe.contentWindow.postMessage(envelope, globalThis.location.origin);
    logger.debug('libs.iframe-bridge.parent.emit', `Emitted: ${namespace}:${event}`, payload);
  }

  /** 注册事件监听，返回取消订阅函数 */
  function on<T = unknown>(namespace: string, event: string, handler: IframeEventHandler<T>): () => void {
    if (!handlers.has(namespace)) {
      handlers.set(namespace, new Map());
    }
    const nsMap = handlers.get(namespace)!;
    if (!nsMap.has(event)) {
      nsMap.set(event, new Set());
    }
    const wrappedHandler = handler as IframeEventHandler;
    nsMap.get(event)!.add(wrappedHandler);

    return () => {
      nsMap.get(event)?.delete(wrappedHandler);
      // 清理事件集合为空时移除该事件键
      if (nsMap.get(event)?.size === 0) {
        nsMap.delete(event);
      }
      // 清理命名空间下无事件时移除该命名空间键
      if (nsMap.size === 0) {
        handlers.delete(namespace);
      }
    };
  }

  /** 全局 message 监听器，按 namespace + event 二级分发 */
  const listener = (messageEvent: MessageEvent) => {
    if (messageEvent.origin !== globalThis.location.origin) {
      return;
    }
    const data = messageEvent.data as IframeMessageEnvelope | undefined;
    if (!data || data.source !== BRIDGE_SOURCE) {
      return;
    }
    const nsMap = handlers.get(data.namespace);
    if (!nsMap) {
      return;
    }
    const eventHandlers = nsMap.get(data.event);
    if (!eventHandlers || eventHandlers.size === 0) {
      return;
    }
    logger.debug('libs.iframe-bridge.parent.receive', `Received: ${data.namespace}:${data.event}`, data.payload);
    for (const handler of eventHandlers) {
      handler(data.payload);
    }
  };

  globalThis.addEventListener('message', listener);

  /** 销毁 bridge，移除全局监听 */
  function destroy(): void {
    globalThis.removeEventListener('message', listener);
    handlers.clear();
  }

  return { emit, on, destroy };
}

/** 创建面向父窗口的 bridge 实例（Preview 侧使用） */
export function createChildBridge() {
  const handlers: NamespaceHandlerMap = new Map();

  /** 向父窗口发送事件 */
  function emit(namespace: string, event: string, payload?: unknown): void {
    if (!globalThis.parent || globalThis.parent === globalThis) {
      logger.warn('libs.iframe-bridge.child.emit', 'Not running in iframe or parent is same window');
      return;
    }
    const envelope: IframeMessageEnvelope = {
      source: BRIDGE_SOURCE,
      namespace,
      event,
      payload,
      timestamp: Date.now(),
    };
    globalThis.parent.postMessage(envelope, globalThis.location.origin);
    logger.debug('libs.iframe-bridge.child.emit', `Emitted: ${namespace}:${event}`, payload);
  }

  /** 注册事件监听，返回取消订阅函数 */
  function on<T = unknown>(namespace: string, event: string, handler: IframeEventHandler<T>): () => void {
    if (!handlers.has(namespace)) {
      handlers.set(namespace, new Map());
    }
    const nsMap = handlers.get(namespace)!;
    if (!nsMap.has(event)) {
      nsMap.set(event, new Set());
    }
    const wrappedHandler = handler as IframeEventHandler;
    nsMap.get(event)!.add(wrappedHandler);

    return () => {
      nsMap.get(event)?.delete(wrappedHandler);
      if (nsMap.get(event)?.size === 0) {
        nsMap.delete(event);
      }
      if (nsMap.size === 0) {
        handlers.delete(namespace);
      }
    };
  }

  /** 全局 message 监听器，按 namespace + event 二级分发 */
  const listener = (messageEvent: MessageEvent) => {
    if (messageEvent.origin !== globalThis.location.origin) {
      return;
    }
    const data = messageEvent.data as IframeMessageEnvelope | undefined;
    if (!data || data.source !== BRIDGE_SOURCE) {
      return;
    }
    const nsMap = handlers.get(data.namespace);
    if (!nsMap) {
      return;
    }
    const eventHandlers = nsMap.get(data.event);
    if (!eventHandlers || eventHandlers.size === 0) {
      return;
    }
    logger.debug('libs.iframe-bridge.child.receive', `Received: ${data.namespace}:${data.event}`, data.payload);
    for (const handler of eventHandlers) {
      handler(data.payload);
    }
  };

  globalThis.addEventListener('message', listener);

  /** 销毁 bridge，移除全局监听 */
  function destroy(): void {
    globalThis.removeEventListener('message', listener);
    handlers.clear();
  }

  return { emit, on, destroy };
}
```

**设计要点**：

- **二级监听结构**：`handlers` 为 `Map<namespace, Map<event, Set<handler>>>`，先按命名空间过滤，再按事件名分发
- **完全通用**：bridge 不包含任何业务关键词，命名空间和事件名均由调用方指定
- **自动清理**：取消订阅时逐级清理空的 Set → Map → 外层 Map，防止内存泄漏
- **安全校验**：所有收到的消息必须同时满足 origin 匹配和 source 标识匹配，否则静默丢弃
- **可扩展性**：新增页面只需定义新的 namespace，无需修改 bridge 代码；同一 namespace 下可注册任意数量事件，互不冲突

## 3. 详细实现方案

### 3.1 新增预览页面路由

创建 `src/routes/preview.tsx` 作为独立预览页面。**自定义 DOM/Style 编辑不在 preview 中**，preview 仅接收渲染数据并负责动画播放与重播。

```typescript
// src/routes/preview.tsx

import { useEffect, useRef, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { PreviewCanvas, type PreviewCanvasHandle } from '@/components/preview/preview-canvas';
import { useAnimationPlayer } from '@/hooks/use-animation-player';
import { createChildBridge } from '@/libs/iframe-bridge';
import { logger } from '@lib/logger';
import type { AnimationConfig } from '@lib/animation-sdk';
import styles from './preview.module.css';

interface UpdateConfigPayload {
  config: AnimationConfig;
}

interface UpdateDomPayload {
  customDom: string | null;
  customStyle: string | null;
}

function PreviewPage() {
  const player = useAnimationPlayer();
  const canvasRef = useRef<PreviewCanvasHandle>(null);
  const [config, setConfig] = useState<AnimationConfig | null>(null);
  const [customDom, setCustomDom] = useState<string | null>(null);
  const [customStyle, setCustomStyle] = useState<string | null>(null);

  // 初始化 bridge 并注册事件
  useEffect(() => {
    const bridge = createChildBridge();

    const unsubConfig = bridge.on<UpdateConfigPayload>('preview', 'update-config', (payload) => {
      setConfig(payload.config);
    });

    const unsubDom = bridge.on<UpdateDomPayload>('preview', 'update-dom', (payload) => {
      setCustomDom(payload.customDom);
      setCustomStyle(payload.customStyle);
    });

    // 通知父窗口预览页已就绪
    bridge.emit('preview', 'ready');
    logger.info('routes.preview.init', 'Preview page ready');

    return () => {
      unsubConfig();
      unsubDom();
      bridge.destroy();
    };
  }, []);

  const handleReplay = () => {
    const container = canvasRef.current?.getContainer();
    if (container && config) {
      player.applyAndPlay(container, config);
    }
  };

  if (!config) {
    return <div className={styles.placeholder}>等待编辑器连接...</div>;
  }

  return (
    <div className={styles.previewPage}>
      <div className={styles.canvasWrapper}>
        <PreviewCanvas
          ref={canvasRef}
          config={config}
          customDom={customDom}
          customStyle={customStyle}
          player={player}
        />
      </div>
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.controlButton}
          onClick={handleReplay}
          disabled={config.tracks.length === 0}
        >
          重播
        </button>
      </div>
    </div>
  );
}

export const Route = createFileRoute('/preview')({
  component: PreviewPage,
});
```

### 3.2 改造 PreviewPanel 为 iframe 容器

修改 `src/components/editor/preview-panel.tsx`，将其改为 iframe 容器。**自定义 DOM/Style 的编辑面板保留在 editor 侧**，PreviewPanel 仅负责嵌入 iframe 和同步渲染数据。重播按钮移至 preview 页面内部，editor 侧不再暴露重播控制。

```typescript
// src/components/editor/preview-panel.tsx (重构后)

import { useRef, useEffect, useCallback, useState } from 'react';
import type { AnimationConfig } from '@lib/animation-sdk';
import { createParentBridge } from '@/libs/iframe-bridge';
import { dispatchEditorEvent, EDITOR_EVENTS } from '@/libs/event-bus';
import { logger } from '@lib/logger';
import styles from './preview-panel.module.css';

interface PreviewPanelProps {
  config: AnimationConfig;
  customDom: string | null;
  customStyle: string | null;
}

/** 缓存的最新状态，用于 iframe 未就绪时暂存 */
interface PendingState {
  config: AnimationConfig;
  customDom: string | null;
  customStyle: string | null;
}

export function PreviewPanel({ config, customDom, customStyle }: PreviewPanelProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const bridgeRef = useRef<ReturnType<typeof createParentBridge> | null>(null);
  const isReadyRef = useRef(false);
  const pendingStateRef = useRef<PendingState | null>(null);
  const [iframeError, setIframeError] = useState(false);

  // 始终更新缓存，确保 ready 时能同步最新状态
  useEffect(() => {
    pendingStateRef.current = { config, customDom, customStyle };
  }, [config, customDom, customStyle]);

  // 初始化 bridge
  useEffect(() => {
    if (!iframeRef.current) {
      return;
    }
    const bridge = createParentBridge(iframeRef.current);
    bridgeRef.current = bridge;

    const unsubReady = bridge.on('preview', 'ready', () => {
      isReadyRef.current = true;
      logger.info('components.preview-panel.ready', 'Preview iframe is ready');
      // 使用缓存的最新状态同步，避免闭包过期
      const pending = pendingStateRef.current;
      if (pending) {
        bridge.emit('preview', 'update-config', { config: pending.config });
        bridge.emit('preview', 'update-dom', { customDom: pending.customDom, customStyle: pending.customStyle });
      }
    });

    const unsubError = bridge.on<{ message: string }>('preview', 'error', (payload) => {
      logger.error('components.preview-panel.error', payload.message);
      dispatchEditorEvent(EDITOR_EVENTS.MESSAGE, { text: payload.message, type: 'error' });
    });

    const unsubAnimComplete = bridge.on('preview', 'animation-complete', () => {
      logger.debug('components.preview-panel.anim-complete', 'Animation completed');
    });

    return () => {
      unsubReady();
      unsubError();
      unsubAnimComplete();
      bridge.destroy();
      bridgeRef.current = null;
    };
  }, []);

  // 当 props 变化且 iframe 已就绪时，通过 bridge 推送
  useEffect(() => {
    const bridge = bridgeRef.current;
    if (!bridge || !isReadyRef.current) {
      return;
    }
    bridge.emit('preview', 'update-config', { config });
    bridge.emit('preview', 'update-dom', { customDom, customStyle });
  }, [config, customDom, customStyle]);

  const handleReload = useCallback(() => {
    setIframeError(false);
    isReadyRef.current = false;
    if (iframeRef.current) {
      iframeRef.current.src = '/preview';
    }
  }, []);

  const handleIframeError = useCallback(() => {
    logger.error('components.preview-panel.iframe-error', 'Failed to load preview iframe');
    setIframeError(true);
  }, []);

  if (iframeError) {
    return (
      <div className={styles.previewPanel}>
        <div className={styles.errorFallback}>
          <p>预览加载失败</p>
          <button type="button" className={styles.reloadButton} onClick={handleReload}>
            重新加载
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.previewPanel}>
      <iframe
        ref={iframeRef}
        src="/preview"
        className={styles.iframe}
        title="动画预览"
        sandbox="allow-scripts allow-same-origin"
        onError={handleIframeError}
      />
    </div>
  );
}
```

**关键设计说明**：

- **`bridgeRef` 保存 bridge 实例**：供 props 变化 effect 使用，避免绕过 bridge 抽象直接 postMessage
- **`pendingStateRef` 缓存机制**：每次 props 变化都更新缓存，`preview:ready` 回调从 ref 读取最新值，彻底避免闭包过期问题
- **props 变化推送**：独立 `useEffect([config, customDom, customStyle])` 通过 `bridgeRef.current` 推送，保持 bridge 抽象一致性
- **iframe 加载失败 fallback**：通过 `onError` 回调检测加载失败，显示错误 UI 和重新加载按钮；重新加载时重置 `isReadyRef` 并重新设置 `src` 触发 iframe 重建
- **cleanup 中清理 bridgeRef**：unmount 时将 `bridgeRef.current` 置 null，防止 stale 引用
- **移除了 `onCustomChange` prop**：自定义 DOM/Style 编辑由 editor 页面的 `CustomDomPanel` 独立完成，不再通过 preview 回传
- **移除了重播按钮**：重播是预览逻辑，由 preview 页面内部控制
- **Props 简化为只读数据推送**：`config`、`customDom`、`customStyle`

### 3.3 Editor 页面适配

`src/routes/editor.tsx` 需要做两处修改：

**1. 新增 CustomDomPanel import 并在 JSX 中渲染**

CustomDomPanel 从 PreviewPanel 内部移出，放置在 PreviewPanel 上方，由 editor 页面直接管理：

```diff
+import { CustomDomPanel } from '@/components/editor/custom-dom-panel';

 // 在 JSX return 中，PreviewPanel 之前添加 CustomDomPanel
+      <CustomDomPanel
+        customDom={currentDom}
+        customStyle={currentStyle}
+        onApply={handleCustomChange}
+      />
       <PreviewPanel
         config={currentConfig}
         customDom={currentDom}
         customStyle={currentStyle}
-        onCustomChange={handleCustomChange}
       />
```

`handleCustomChange` 回调保持不变，直接调用 `commit()` 创建新的 history node。CustomDomPanel 的 `onApply` 触发后，editor 侧完成 sanitize + commit，然后通过 props 变化自动推送到 iframe 内的 preview 页面。

**2. PreviewPanel 移除 `onCustomChange` prop**（见上方 diff）

### 3.4 样式调整

新增 `src/routes/preview.module.css`：

```css
.previewPage {
  display: flex;
  flex-direction: column;
  height: 100vh;
  padding: 16px;
  box-sizing: border-box;
  background: var(--bg-primary, #fff);
}

.canvasWrapper {
  flex: 1;
  overflow: auto;
  border: 1px solid var(--border-color, #ddd);
  border-radius: 8px;
}

.controls {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.controlButton {
  padding: 6px 16px;
  cursor: pointer;
  border: 1px solid var(--border-color, #ddd);
  border-radius: 4px;
  background: var(--bg-secondary, #f5f5f5);
}

.controlButton:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  color: var(--text-secondary, #999);
}
```

更新 `src/components/editor/preview-panel.module.css`，完整变更如下：

**移除以下样式类**（随 CustomDomPanel 和重播按钮移出而不再需要）：

- `.header`
- `.toggleButton`
- `.customPanel`
- `.inputLabel`
- `.textarea`
- `.inputActions`
- `.errorText`
- `.controls`
- `.controlButton`

**保留以下样式类**：

- `.previewPanel`
- `.canvasWrapper`

**新增以下样式类**：

```css
.iframe {
  width: 100%;
  height: 100%;
  border: none;
  flex: 1;
}

.errorFallback {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 12px;
  color: var(--text-secondary, #999);
}

.reloadButton {
  padding: 6px 16px;
  font-size: 13px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  transition: background 0.15s;
}

.reloadButton:hover {
  background: #f1f5f9;
}
```

### 3.5 类型定义

新增 `src/types/iframe-message.ts`（见 2.2 节）。

## 4. 文件变更清单

| 文件                                             | 变更类型 | 说明                                               |
| ------------------------------------------------ | -------- | -------------------------------------------------- |
| `src/types/iframe-message.ts`                    | 新增     | 通用跨窗口消息信封与事件处理器类型                 |
| `src/libs/iframe-bridge.ts`                      | 新增     | 通用跨窗口事件桥接，按事件名分发                   |
| `src/routes/preview.tsx`                         | 新增     | 独立预览页面路由，包含渲染、动画播放与重播         |
| `src/routes/preview.module.css`                  | 新增     | 预览页面样式                                       |
| `src/components/editor/preview-panel.tsx`        | 修改     | 重构为 iframe 容器，移除 CustomDomPanel 和重播按钮 |
| `src/components/editor/preview-panel.module.css` | 修改     | 添加 iframe 样式，移除 controls 样式               |
| `src/routes/editor.tsx`                          | 修改     | PreviewPanel 移除 onCustomChange prop              |
| `src/route-tree.gen.ts`                          | 自动     | TanStack Router 自动生成新路由                     |

## 5. 安全考量

### 5.1 iframe sandbox 策略

```html
<iframe sandbox="allow-scripts allow-same-origin" />
```

- **`allow-scripts`**：允许预览页执行 JS（动画播放必需）
- **`allow-same-origin`**：允许 postMessage 正确校验 origin
- **未授予**：`allow-forms`、`allow-popups`、`allow-top-navigation` 等，防止恶意行为

### 5.2 消息来源校验

bridge 内部对所有收到的 `MessageEvent` 执行双重校验：

1. `event.origin === globalThis.location.origin`（同源检查）
2. `data.source === 'mosu-bridge'`（应用标识检查）

不满足条件的消息静默丢弃，不调用任何 handler。

### 5.3 DOM/Style 安全

自定义 DOM/Style 的编辑与 sanitize 仍在 editor 页面完成，preview 仅接收已校验的数据进行渲染。iframe 隔离提供额外安全层。

## 6. 性能优化

### 6.1 消息节流

高频更新场景下，editor 侧可在调用 `bridge.emit` 前自行节流，bridge 本身不做节流以保持通用性。

### 6.2 内存管理

- preview 页面卸载时通过 `bridge.destroy()` 清理全局监听器和 handler 映射
- editor 侧 PreviewPanel unmount 时同样调用 `bridge.destroy()`
- 编辑器切换节点时，若预览页未就绪则缓存最新状态，收到 `preview:ready` 后一次性同步

## 7. 边界情况处理

| 场景                        | 处理方式                                                                                                                                                        |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| iframe 加载失败             | 通过 `<iframe onError>` 回调检测，显示 `.errorFallback` UI 和重新加载按钮；重新加载时重置 `isReadyRef` 并重新设置 `src` 触发 iframe 重建                        |
| 预览页未就绪时收到更新      | `pendingStateRef` 始终缓存最新 config/dom/style，收到 `preview:ready` 后从 ref 读取并一次性同步                                                                 |
| 编辑器快速切换节点          | `pendingStateRef` 仅保留最新值（last-write-wins），ready 时只同步最终状态；已就绪时每次 props 变化独立推送                                                      |
| 浏览器不支持 iframe sandbox | 在 PreviewPanel mount 时检测 `'sandbox' in document.createElement('iframe')`，若不支持则移除 `sandbox` 属性并记录 warn 日志，预览功能仍可正常工作但安全隔离降级 |
| postMessage 被浏览器拦截    | bridge 的 `emit` 函数在 `contentWindow` 为 null 时记录 warn 日志；接收端对不匹配 origin/source 的消息静默丢弃，不影响正常流程                                   |

## 8. 验收标准

1. 访问 `/preview` 可独立渲染预览页，显示"等待编辑器连接..."占位符
2. 在 `/editor` 中嵌入 iframe 后，预览页自动接收初始 config/dom/style 并渲染
3. 编辑器切换历史节点时，iframe 预览内容同步更新
4. 重播按钮在 iframe 内部，点击后动画正确重播
5. 自定义 DOM/Style 编辑面板在 editor 页面中，修改后 preview 同步更新
6. iframe sandbox 生效：无法打开新窗口、无法提交表单、无法导航顶层页面
7. 跨域消息被正确过滤，控制台无安全警告
8. 所有日志使用 `logger`，pointer 格式符合规范（如 `'routes.preview.init'`、`'libs.iframe-bridge.parent.emit'`）
9. TypeScript 类型检查通过，无 any 类型
10. 执行 `pnpm fmt:check` 和 `pnpm lint:fix` 无报错

## 9. 后续演进方向

- **移动端适配**：预览页独立响应式布局，编辑器仅提供控制接口
- **远程预览**：将预览页部署到 CDN，编辑器通过 URL 参数加载，实现零本地资源消耗
- **DevTools 集成**：预览页暴露调试 API，支持时间轴 scrubbing、track 可视化
