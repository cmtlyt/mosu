# Spec: 预览动画 SDK 框架无关化

## 1. 背景与目标

### 1.1 现状问题

当前动画播放能力分为两层：

- **`src/libs/animation-applier.ts`**：纯函数，基于 Web Animations API (WAAPI)，本身已框架无关
- **`src/hooks/use-animation-player.ts`**：React Hook，封装了播放状态管理、生命周期清理等逻辑，**与 React 强耦合**

这导致以下问题：

- **不可移植**：`useAnimationPlayer` 无法在非 React 环境（如 Vanilla JS、Vue、Svelte、iframe 内独立页面）中使用
- **预览页耦合**：`/preview` 路由虽然运行在 iframe 中，但仍需引入 React + Hook 才能播放动画，违背了 iframe 隔离的初衷
- **打包体积**：单独导出动画 SDK 时必须携带 React 运行时，无法做到轻量分发
- **测试困难**：动画播放逻辑必须通过 React Testing Library 测试，无法用简单的单元测试覆盖

### 1.2 重构目标

1. **SDK 独立**：将动画播放能力封装为纯 TypeScript SDK，零框架依赖，仅依赖浏览器 WAAPI
2. **可移植性**：SDK 可单独打包为 ESM/CJS/UMD，在任何前端框架或原生环境中使用
3. **预览页解耦**：`/preview` 页面直接使用 SDK，不再依赖 `useAnimationPlayer` Hook
4. **向后兼容**：保留 `useAnimationPlayer` 作为 React 适配层，内部委托给 SDK，现有调用方无需修改
5. **类型安全**：SDK 导出完整的 TypeScript 类型定义

## 2. 核心设计

### 2.1 SDK 架构

```text
┌─────────────────────────────────────────────────┐
│           @cmtlyt/mosu/animation-sdk            │
│                                                 │
│  AnimationPlayer (class)                        │
│  ├── apply(container, config): AnimationHandle[]│
│  ├── playAll(): void                            │
│  ├── pauseAll(): void                           │
│  ├── cancelAll(): void                          │
│  ├── on(event, handler): Unsubscribe            │
│  └── destroy(): void                            │
│                                                 │
│  Types:                                         │
│  ├── AnimationConfig                            │
│  ├── AnimationHandle                            │
│  ├── PlayerEventMap                             │
│  └── PlayerOptions                              │
└─────────────────────────────────────────────────┘
         ▲                    ▲
         │ import             │ import
         │                    │
┌────────┴────────┐  ┌───────┴──────────┐
│ useAnimation    │  │ /preview route   │
│ Player (Hook)   │  │ (Vanilla/React)  │
│ React adapter   │  │ direct SDK usage │
└─────────────────┘  └──────────────────┘
```

### 2.2 SDK 核心 API

```typescript
// src/libs/animation-sdk/index.ts

import type { AnimationConfig } from '@lib/animation-sdk';

/** 单个动画轨道的控制句柄 */
export interface AnimationHandle {
  /** 动画轨道 ID */
  readonly id: string;
  /** 目标元素选择器 */
  readonly target: string;
  /** 播放 */
  play(): void;
  /** 暂停 */
  pause(): void;
  /** 取消并重置 */
  cancel(): void;
  /** 是否正在播放 */
  readonly isPlaying: boolean;
  /** 动画完成 Promise */
  readonly finished: Promise<void>;
}

/** 播放器事件映射 */
export interface PlayerEventMap {
  /** 所有动画播放完成 */
  complete: void;
  /** 单个轨道动画完成 */
  'track-complete': { trackId: string };
  /** 应用动画时目标元素未找到 */
  'target-missing': { selector: string; trackId: string };
  /** 应用动画失败 */
  error: { trackId: string; error: Error };
}

/** 播放器配置选项 */
export interface PlayerOptions {
  /** 是否在 apply 后自动播放，默认 true */
  autoPlay?: boolean;
  /** 全局速度倍率，默认 1 */
  playbackRate?: number;
}

/** 事件处理器 */
export type EventHandler<T> = T extends void ? () => void : (payload: T) => void;

/** 取消订阅函数 */
export type Unsubscribe = () => void;

/**
 * 框架无关的动画播放器
 *
 * 仅依赖 Web Animations API，可在任何浏览器环境中使用。
 * 不依赖任何 UI 框架，可单独打包移植。
 */
export class AnimationPlayer {
  constructor(options?: PlayerOptions);

  /**
   * 将动画配置应用到容器元素
   * @returns 所有成功创建的动画句柄
   */
  apply(container: HTMLElement, config: AnimationConfig): AnimationHandle[];

  /** 播放所有当前动画 */
  playAll(): void;

  /** 暂停所有当前动画 */
  pauseAll(): void;

  /** 取消所有动画并清空内部状态 */
  cancelAll(): void;

  /** 获取当前所有动画句柄 */
  getHandles(): ReadonlyArray<AnimationHandle>;

  /** 注册事件监听 */
  on<K extends keyof PlayerEventMap>(event: K, handler: EventHandler<PlayerEventMap[K]>): Unsubscribe;

  /** 销毁播放器，取消所有动画并清理事件监听 */
  destroy(): void;
}
```

### 2.3 SDK 实现要点

#### 2.3.1 事件系统

采用轻量级发布-订阅模式，不依赖 EventEmitter 或任何第三方库：

```typescript
// 内部事件总线，纯对象 + Set 实现
private listeners = new Map<string, Set<Function>>();

private emit<K extends keyof PlayerEventMap>(event: K, payload?: PlayerEventMap[K]): void {
  const handlers = this.listeners.get(event);
  if (!handlers) return;
  for (const handler of handlers) {
    handler(payload);
  }
}
```

#### 2.3.2 动画完成检测

利用 WAAPI 的 `finished` Promise 追踪每个轨道的完成状态，当所有轨道完成后触发 `complete` 事件：

```typescript
// 每个 AnimationHandle 内部持有 WAAPI Animation.finished
// apply 时收集所有 finished Promise
// Promise.allSettled 后检查是否全部 fulfilled → emit('complete')
```

#### 2.3.3 资源清理与 DOM 生命周期绑定

- `cancelAll()` 调用所有 handle 的 `cancel()` 并清空内部数组
- `destroy()` 额外清理事件监听器 Map，防止内存泄漏
- **DOM 销毁自动清理**：SDK 内部使用 `MutationObserver` 监听容器元素的子树变化，当被动画绑定的目标元素从 DOM 中移除时，自动取消对应轨道的动画并从内部状态中清除，无需外部手动调用 `cancelAll()`
- 支持外部传入 `AbortSignal`（可选扩展），用于与组件生命周期联动

```typescript
// DOM 销毁自动清理实现示意
private observeContainer(container: HTMLElement): void {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const removedNode of mutation.removedNodes) {
        if (!(removedNode instanceof HTMLElement)) continue;
        // 检查被移除的节点是否是某个动画的目标或其祖先
        const affectedHandles = this.handles.filter(
          (handle) => removedNode === handle.element || removedNode.contains(handle.element),
        );
        for (const handle of affectedHandles) {
          handle.cancel();
          this.emit('track-complete', { trackId: handle.id });
        }
        // 从内部状态中移除已失效的 handle
        this.handles = this.handles.filter((h) => !affectedHandles.includes(h));
      }
    }
    // 所有 handle 都被移除时触发 complete
    if (this.handles.length === 0 && this.hasEverApplied) {
      this.emit('complete');
    }
  });
  observer.observe(container, { childList: true, subtree: true });
  this.observers.set(container, observer);
}
```

### 2.4 React 适配层

保留 `useAnimationPlayer` Hook 作为薄适配层，内部完全委托给 SDK：

```typescript
// src/hooks/use-animation-player.ts (重构后)

import { useRef, useState, useCallback, useEffect } from 'react';
import { AnimationPlayer } from '@lib/animation-sdk';
import type { AnimationConfig } from '@lib/animation-sdk';
import type { UseAnimationPlayerReturn } from './types';

export function useAnimationPlayer(): UseAnimationPlayerReturn {
  const playerRef = useRef<AnimationPlayer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // 懒初始化，避免 SSR 问题
  if (!playerRef.current) {
    playerRef.current = new AnimationPlayer({ autoPlay: false });
  }

  const player = playerRef.current;

  const stopAll = useCallback(() => {
    player.cancelAll();
    setIsPlaying(false);
  }, [player]);

  const play = useCallback(() => {
    player.playAll();
    setIsPlaying(true);
  }, [player]);

  const pause = useCallback(() => {
    player.pauseAll();
    setIsPlaying(false);
  }, [player]);

  const applyAndPlay = useCallback(
    (container: HTMLElement, config: AnimationConfig) => {
      player.cancelAll();
      player.apply(container, config);
      player.playAll();
      setIsPlaying(true);
    },
    [player],
  );

  // 监听 SDK 的 complete 事件同步状态
  useEffect(() => {
    const unsub = player.on('complete', () => setIsPlaying(false));
    return unsub;
  }, [player]);

  // 卸载时销毁
  useEffect(() => () => player.destroy(), [player]);

  return { play, pause, isPlaying, applyAndPlay };
}
```

**关键变更**：

- 移除对 `applyAnimation` 的直接调用，改为通过 `AnimationPlayer` 实例
- `isPlaying` 状态由 SDK 事件驱动，而非手动设置
- Hook 仅负责 React 生命周期绑定，不含任何动画逻辑

### 2.5 Preview 页面适配

`/preview` 页面可直接使用 SDK，无需 React Hook：

```typescript
// src/routes/preview.tsx (关键变更片段)

import { AnimationPlayer } from '@lib/animation-sdk';

// 在 useEffect 中初始化
const player = new AnimationPlayer({ autoPlay: true });

// 接收 config 后
player.apply(canvasContainer, config);

// 重播按钮
replayButton.onclick = () => {
  player.cancelAll();
  player.apply(canvasContainer, currentConfig);
};

// 监听完成事件通知父窗口
player.on('complete', () => {
  bridge.emit('preview', 'animation-complete');
});

// cleanup
return () => player.destroy();
```

> **注意**：Preview 页面仍使用 React 渲染 UI（按钮、占位符等），但动画播放逻辑完全由 SDK 驱动，不经过任何 Hook。未来若需进一步轻量化，可将 Preview 页面的 UI 也替换为 Vanilla DOM 操作。

## 3. 文件变更清单

| 文件                                | 变更类型 | 说明                                             |
| ----------------------------------- | -------- | ------------------------------------------------ |
| `src/libs/animation-sdk/index.ts`   | 新增     | SDK 入口，导出 `AnimationPlayer` 及所有类型      |
| `src/libs/animation-sdk/player.ts`  | 新增     | `AnimationPlayer` 类实现                         |
| `src/libs/animation-sdk/handle.ts`  | 新增     | `AnimationHandle` 实现，封装 WAAPI Animation     |
| `src/libs/animation-sdk/events.ts`  | 新增     | 轻量事件系统实现                                 |
| `src/libs/animation-sdk/types.ts`   | 新增     | SDK 公共类型定义                                 |
| `src/hooks/use-animation-player.ts` | 修改     | 重构为 SDK 适配层，移除直接 WAAPI 调用           |
| `src/routes/preview.tsx`            | 修改     | 动画播放改用 SDK，移除 `useAnimationPlayer` 依赖 |
| `src/libs/animation-applier.ts`     | 废弃     | 功能迁移至 SDK，保留 re-export 过渡期后删除      |

## 4. 集成方式

### 4.1 主工程直接引入

SDK 作为主工程源码的一部分，通过路径别名直接导入，无需独立打包或发布：

```typescript
// 在任意模块中直接使用
import { AnimationPlayer } from '@lib/animation-sdk';
```

Vite 构建时会将 SDK 代码与主工程一起 tree-shaking 和 bundle，零额外配置。

### 4.2 未来独立分发（可选）

若后续需要将 SDK 作为独立包提供给外部项目使用，可将其提取为 `@cmtlyt/mosu` 的子路径导出：

```jsonc
// package.json
{
  "exports": {
    "./animation-sdk": {
      "types": "./dist/animation-sdk/index.d.ts",
      "import": "./dist/animation-sdk/index.js",
    },
  },
}
```

此步骤为可选演进，当前阶段不涉及。

## 5. 迁移策略

### 5.1 阶段一：SDK 落地 + 适配层

1. 创建 `src/libs/animation-sdk/` 目录及所有模块
2. 重构 `useAnimationPlayer` 为适配层
3. 修改 `/preview` 页面直接使用 SDK
4. 保留 `animation-applier.ts` 作为 re-export 兼容层
5. 全量回归测试

### 5.2 阶段二：清理

1. 确认无其他模块直接引用 `animation-applier.ts`
2. 删除 `animation-applier.ts`
3. 更新相关文档

### 5.3 阶段三（可选）：独立发包

1. 将 `animation-sdk` 提取为独立 npm 包，作为 `@cmtlyt/mosu` 的子路径导出（如 `@cmtlyt/mosu/animation-sdk`）
2. 主工程通过 workspace 引用或子路径导入
3. 配置 CI 独立发布流程

## 6. 边界情况处理

| 场景                           | 处理方式                                                                                                                                                                                                                                                                                                                     |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 容器元素在 apply 后被移除      | `AnimationHandle.cancel()` 内部捕获 InvalidStateError，静默忽略；下次 apply 前自动清理失效 handle                                                                                                                                                                                                                            |
| config.tracks 为空             | `apply()` 返回空数组，不触发任何事件，`playAll()/pauseAll()` 为 no-op                                                                                                                                                                                                                                                        |
| 重复调用 apply 未先 cancel     | `apply()` 内部先调用 `cancelAll()` 再应用新配置，保证状态一致                                                                                                                                                                                                                                                                |
| 浏览器不支持 WAAPI             | 构造函数中检测 `HTMLElement.prototype.animate`，不支持时抛出明确错误；适配层可 catch 后降级为 CSS transition fallback（后续扩展）                                                                                                                                                                                            |
| 无效动画配置                   | 当 track 缺少必要字段（如 keyframes 为空、options.duration 非法）或 target 选择器在 container 内无法匹配到元素时，SDK **静默跳过该轨道**，不抛出异常、不中断其他轨道的应用；通过 `target-missing` 或 `error` 事件通知调用方，日志记录 warn 级别信息                                                                          |
| destroy 后继续调用方法         | 所有公开方法内部检查 destroyed 标志，已销毁时静默返回或抛出已销毁错误（由 options.strictMode 控制）                                                                                                                                                                                                                          |
| 多个 Player 实例操作同一容器   | 各实例独立管理自己的 handle，互不干扰；但同一元素的并发动画由 WAAPI 自身合成规则决定                                                                                                                                                                                                                                         |
| 响应式布局下窗口尺寸变化       | WAAPI 动画基于 CSS 属性（如 `transform`、`opacity`），天然支持响应式；若 keyframes 中使用百分比或 viewport 单位，动画会自动适配新尺寸。SDK 不监听 resize 事件，避免额外开销；如需在断点切换时重新应用不同配置，由调用方自行监听 `matchMedia` 或 `resize` 后调用 `apply()`                                                    |
| UI 框架重渲染导致 DOM 引用丢失 | React/Vue 等框架在状态变更时可能销毁并重建 DOM 节点，导致 SDK 持有的元素引用失效。SDK 通过 `MutationObserver` 检测到目标元素被移除后自动取消对应动画；当框架重渲染完成、新 DOM 挂载后，调用方需重新调用 `apply(container, config)` 绑定新节点。SDK 提供 `isStale()` 方法供调用方快速判断当前 handle 是否仍有效，避免无效操作 |
| DOM 元素被动态移除             | `MutationObserver` 自动检测目标元素从 DOM 中移除，立即取消对应动画并清理内部状态，无需外部干预                                                                                                                                                                                                                               |

## 7. 验收标准

1. `AnimationPlayer` 类可在无 React 环境的 Node.js + jsdom 中正常实例化和调用
2. SDK 单独打包产物不包含任何 React/Vue/Svelte 等框架代码
3. `/preview` 页面动画播放、重播、完成事件通知功能与重构前一致
4. `useAnimationPlayer` Hook 对外接口不变，现有调用方无需修改
5. SDK 的 `complete` 事件在所有轨道动画结束后准确触发
6. `destroy()` 后无内存泄漏（DevTools Memory 验证）
7. TypeScript 类型检查通过，SDK 导出类型完整可用
8. 执行 `pnpm fmt:check` 和 `pnpm lint:fix` 无报错
9. 所有日志使用 `logger`，pointer 格式符合规范（如 `'libs.animation-sdk.player.apply'`）

## 8. 后续演进方向

- **时间轴控制**：支持 `seek(time)`、`setPlaybackRate(rate)` 等高级播放控制
- **动画组合**：支持 sequence / parallel 组合多个 AnimationConfig
- **CSS Fallback**：在不支持 WAAPI 的环境中自动生成等效 CSS @keyframes
- **DevTools 集成**：暴露调试 API，支持时间轴可视化、轨道 inspect
- **服务端渲染预览**：结合 Puppeteer/Playwright 在服务端生成动画帧序列
