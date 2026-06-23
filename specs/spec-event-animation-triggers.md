# Spec: 事件动画触发器

## 1. 背景与目标

### 1.1 现状问题

当前动画系统仅支持**自动播放**模式：

- `AnimationPlayer.apply()` 后立即创建所有轨道的 WAAPI 动画
- 若 `autoPlay: true`（默认），所有动画在 `apply()` 后立即开始播放
- 无法通过用户交互（点击、悬停、滚动等）触发特定轨道的动画

这导致以下限制：

- **交互能力缺失**：无法实现"点击按钮后播放动画"、"鼠标悬停时触发动画"等常见交互场景
- **AI 生成受限**：AI 返回的动画配置无法包含交互意图，所有动画都是"apply 即播放"
- **灵活性不足**：无法为不同轨道设置不同的触发条件

### 1.2 设计目标

1. **扩展数据模型**：在 `AnimationTrack` 中新增可选的 `trigger` 字段，描述事件触发器配置
2. **播放器支持**：`AnimationPlayer` 根据 `trigger` 类型绑定相应的事件监听器，按需创建和播放动画
3. **向后兼容**：未指定 `trigger` 或 `trigger.type === 'auto'` 时，行为与现有逻辑完全一致
4. **AI 友好**：触发器配置结构简单、语义清晰，便于 AI 生成
5. **资源管理**：事件监听器随播放器生命周期自动清理，无内存泄漏

## 2. 核心设计

### 2.1 类型定义扩展

#### 2.1.1 触发器类型

```typescript
// src/types/animation.ts

/** 事件触发器类型 */
export type AnimationTriggerType = 'auto' | 'click' | 'hover' | 'scroll' | 'viewport';

/** 触发器分组定义（与 tracks 同级，key 为分组 ID） */
export interface AnimationTriggerGroup {
  /** 触发类型 */
  type: AnimationTriggerType;
  /** 触发目标选择器 */
  target: string;
  /** 触发延迟（毫秒），组级别延迟，在轨道自身 delay 之前生效 */
  delay?: number;
}

/** 事件触发器配置 */
export interface AnimationTrigger {
  /** 触发类型（无 group 时必填） */
  type?: AnimationTriggerType;
  /** 触发目标选择器，未指定时使用 track.target（无 group 时生效） */
  target?: string;
  /** 是否只触发一次，默认 false */
  once?: boolean;
  /** 触发延迟（毫秒），轨道级别延迟 */
  delay?: number;
  /** 引用 triggerGroups 中的分组 ID，配置后 type/target 从分组继承 */
  group?: string;
}
```

#### 2.1.2 AnimationTrack 扩展

```typescript
export interface AnimationTrack {
  id: string;
  target: string;
  keyframes: AnimationTrackKeyframe[];
  options: AnimationTrackOptions;
  /** 事件触发器，未指定时默认为 auto（自动播放） */
  trigger?: AnimationTrigger;
}
```

#### 2.1.3 AnimationConfig 扩展

```typescript
export interface AnimationConfig {
  version: string;
  id: string;
  name: string;
  tracks: AnimationTrack[];
  /** 触发器分组定义，key 为分组 ID，tracks 通过 trigger.group 引用 */
  triggerGroups?: Record<string, AnimationTriggerGroup>;
}
```

#### 2.1.4 AI 响应类型

`AIEditorResponse` 使用 `Pick<AnimationConfig, 'tracks'>`，需要扩展为同时包含 `triggerGroups`：

```typescript
export interface AIEditorResponse {
  domPatch?: DomPatchInstruction[];
  style?: string;
  config: Pick<AnimationConfig, 'tracks' | 'triggerGroups'> & { name?: string };
}
```

### 2.2 触发器类型语义

| 类型       | 语义                                         | 事件监听                             | 典型场景                       |
| ---------- | -------------------------------------------- | ------------------------------------ | ------------------------------ |
| `auto`     | 自动播放（默认），`apply()` 时立即创建并播放 | 无                                   | 入场动画、apply 即播放的动画   |
| `click`    | 点击触发                                     | `click`（事件委托）                  | 点击按钮后播放动画             |
| `hover`    | 悬停触发，离开时**取消**动画（重置到起点）   | `mouseover` / `mouseout`（事件委托） | 鼠标悬停时播放，离开时取消重置 |
| `scroll`   | 滚动触发                                     | `scroll`                             | 容器滚动时触发动画             |
| `viewport` | 进入视口触发                                 | `IntersectionObserver`               | 元素滚动到可视区域时播放       |

### 2.2.1 触发器分组（triggerGroups）

通过 `AnimationConfig.triggerGroups` 定义触发器分组，轨道通过 `trigger.group` 引用分组 ID。分组定义了**事件类型和目标**，轨道只需声明**行为控制属性**（如 `once`、`delay`）。

**职责分离**：

- **triggerGroups**（组级）：定义 `type`（事件类型）和 `target`（触发目标选择器）
- **track.trigger**（轨道级）：引用 `group` ID + 行为控制属性（`once`、`delay`）

**规则**：

- 轨道配置了 `trigger.group` 后，`type` 和 `target` 从分组继承，无需重复配置
- 事件触发时，组内所有轨道同时创建动画并播放
- 每个轨道的 `delay` 独立生效（轨道级延迟在组级延迟之后叠加）
- 每个轨道的 `once` 独立控制
- 若组内某个轨道的动画目标（`track.target`）未找到，不影响组内其他轨道

**示例**：点击按钮时同时触发按钮缩放和背景色变化两个轨道，各自有独立的延迟：

```json
{
  "triggerGroups": {
    "btn-click": { "type": "click", "target": ".btn" }
  },
  "tracks": [
    {
      "id": "btn-scale",
      "target": ".btn",
      "keyframes": [
        { "offset": 0, "transform": "scale(1)" },
        { "offset": 0.5, "transform": "scale(1.1)" },
        { "offset": 1, "transform": "scale(1)" }
      ],
      "options": { "duration": 300 },
      "trigger": { "group": "btn-click", "once": true }
    },
    {
      "id": "btn-color",
      "target": ".btn",
      "keyframes": [
        { "offset": 0, "backgroundColor": "#3b82f6" },
        { "offset": 1, "backgroundColor": "#1d4ed8" }
      ],
      "options": { "duration": 300, "fillMode": "forwards" },
      "trigger": { "group": "btn-click", "delay": 100 }
    }
  ]
}
```

### 2.3 播放器行为变更

#### 2.3.1 apply 流程

```text
apply(container, config)
  │
  ├─ 清理旧动画和旧触发器
  │
  ├─ 解析 triggerGroups：构建 groupId -> AnimationTriggerGroup 映射
  │
  ├─ 遍历 config.tracks
  │   │
  │   ├─ 若 track.trigger.group 存在
  │   │   └─ 从 triggerGroups 中查找对应分组定义
  │   │       └─ 将轨道加入该分组的轨道列表
  │   │       └─ 不立即创建 WAAPI 动画
  │   │
  │   ├─ 若 track.trigger 存在且 type !== 'auto'（无 group 的独立触发）
  │   │   └─ 作为单独一组处理
  │   │
  │   └─ 否则（无 trigger 或 type === 'auto'）
  │       └─ 调用 applyTrack() 立即创建动画
  │           └─ 加入 autoPlayHandles（全局管理）
  │
  ├─ 调用 bindTriggerGroups() 为所有分组绑定事件（事件委托）
  │
  ├─ 若 autoPlay && autoPlayHandles.length > 0
  │   └─ playAll()（仅播放 autoPlayHandles）
  │
  └─ observeContainer()
```

**关键设计**：事件触发的动画使用独立的 `triggerHandles` 数组管理，不加入全局 `handles`，避免 `playAll()`/`replay()` 时自动播放事件动画。

#### 2.3.2 bindTriggerGroups 实现要点（事件委托模式）

所有 DOM 事件（`click`、`mouseover`、`mouseout`）统一在 `container` 上使用**事件委托**，而非逐个绑定到目标元素上。这样做的优势：

- **减少事件绑定/移除开销**：无论有多少个触发分组，每种事件类型只绑定一个监听器
- **自动适配 DOM 变化**：目标元素被框架重渲染后无需重新绑定
- **清理简单**：`cleanupTriggers()` 只需移除 container 上的几个监听器

```typescript
// 新增私有字段
private triggerHandles: AnimationHandleImpl[] = []; // 事件触发的动画，独立于全局 handles
private delegatedHandlers = new Map<string, (event: Event) => void>(); // container 上的委托处理器
private resolvedGroups = new Map<string, { def: AnimationTriggerGroup; tracks: AnimationTrack[] }>();

/**
 * 解析 triggerGroups 配置，将轨道分配到对应分组
 * 无 group 的独立触发轨道自动创建隐式分组
 */
private resolveGroups(config: AnimationConfig): void {
  const groupDefs = config.triggerGroups ?? {};

  for (const track of config.tracks) {
    if (!track.trigger || track.trigger.type === 'auto') continue;

    if (track.trigger.group) {
      // 引用显式分组
      const groupDef = groupDefs[track.trigger.group];
      if (!groupDef) {
        logger.warn('libs.animation-sdk.player.resolve-groups',
          `Track "${track.id}" references unknown group "${track.trigger.group}"`);
        continue;
      }
      if (!this.resolvedGroups.has(track.trigger.group)) {
        this.resolvedGroups.set(track.trigger.group, { def: groupDef, tracks: [] });
      }
      this.resolvedGroups.get(track.trigger.group)!.tracks.push(track);
    } else {
      // 无 group 的独立触发轨道，创建隐式分组
      const implicitGroupId = `__implicit_${track.id}`;
      const implicitDef: AnimationTriggerGroup = {
        type: track.trigger.type!,
        target: track.trigger.target ?? track.target,
      };
      this.resolvedGroups.set(implicitGroupId, { def: implicitDef, tracks: [track] });
    }
  }
}

private bindTriggerGroups(container: HTMLElement): void {
  // 按事件类型分组
  const clickGroups: Array<{ def: AnimationTriggerGroup; tracks: AnimationTrack[] }> = [];
  const hoverGroups: Array<{ def: AnimationTriggerGroup; tracks: AnimationTrack[] }> = [];
  const scrollGroups: Array<{ def: AnimationTriggerGroup; tracks: AnimationTrack[] }> = [];
  const viewportGroups: Array<{ def: AnimationTriggerGroup; tracks: AnimationTrack[] }> = [];

  for (const [, group] of this.resolvedGroups) {
    switch (group.def.type) {
      case 'click': clickGroups.push(group); break;
      case 'hover': hoverGroups.push(group); break;
      case 'scroll': scrollGroups.push(group); break;
      case 'viewport': viewportGroups.push(group); break;
    }
  }

  // click 事件委托
  if (clickGroups.length > 0) {
    const handler = (event: Event): void => {
      for (const group of clickGroups) {
        if ((event.target as Element)?.closest?.(group.def.target)) {
          this.fireTriggeredGroup(container, group);
        }
      }
    };
    container.addEventListener('click', handler);
    this.delegatedHandlers.set('click', handler);
  }

  // hover 事件委托（mouseover / mouseout）
  if (hoverGroups.length > 0) {
    const enterHandler = (event: Event): void => {
      for (const group of hoverGroups) {
        if ((event.target as Element)?.closest?.(group.def.target)) {
          this.fireTriggeredGroup(container, group);
        }
      }
    };
    const leaveHandler = (event: Event): void => {
      for (const group of hoverGroups) {
        if ((event.target as Element)?.closest?.(group.def.target)) {
          // hover 离开时取消组内所有动画（重置到起点）
          for (const track of group.tracks) {
            const handle = this.triggerHandles.find((handle) => handle.id === track.id);
            if (handle) {
              handle.cancel();
              this.triggerHandles = this.triggerHandles.filter((handle) => handle.id !== track.id);
            }
          }
        }
      }
    };
    container.addEventListener('mouseover', enterHandler);
    container.addEventListener('mouseout', leaveHandler);
    this.delegatedHandlers.set('mouseover', enterHandler);
    this.delegatedHandlers.set('mouseout', leaveHandler);
  }

  // scroll 事件委托（绑定在 container 上）
  if (scrollGroups.length > 0) {
    const handler = (): void => {
      for (const group of scrollGroups) {
        this.fireTriggeredGroup(container, group);
      }
    };
    container.addEventListener('scroll', handler, { passive: true });
    this.delegatedHandlers.set('scroll', handler);
  }

  // viewport 使用 IntersectionObserver（无法事件委托）
  for (const group of viewportGroups) {
    const element = container.querySelector(group.def.target);
    if (!element) {
      for (const track of group.tracks) {
        this.emitter.emit('target-missing', { selector: group.def.target, trackId: track.id });
      }
      continue;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            this.fireTriggeredGroup(container, group);
          }
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(element);
    this.intersectionObservers.push(observer);
  }
}

/** 触发一组动画：组内所有轨道按各自的 delay 独立创建并播放 */
private fireTriggeredGroup(
  container: HTMLElement,
  group: { def: AnimationTriggerGroup; tracks: AnimationTrack[] },
): void {
  if (this.destroyed) return;

  for (const track of group.tracks) {
    // once 独立控制：每个轨道各自判断
    if (track.trigger?.once && this.firedTrackIds.has(track.id)) continue;

    // 总延迟 = 组级延迟 + 轨道级延迟
    const totalDelay = (group.def.delay ?? 0) + (track.trigger?.delay ?? 0);

    const fireTrack = (): void => {
      if (this.destroyed) return;
      // 若已有同名 handle 在播放，先取消再重新创建
      const existingHandle = this.triggerHandles.find((handle) => handle.id === track.id);
      if (existingHandle) {
        existingHandle.cancel();
      }
      const handle = this.applyTrack(container, track);
      if (handle) {
        this.triggerHandles = this.triggerHandles.filter((handle) => handle.id !== track.id);
        this.triggerHandles.push(handle);
        handle.play();
        this.firedTrackIds.add(track.id);
        this.emitter.emit('trigger-fired', { trackId: track.id, type: group.def.type });
      }
    };

    if (totalDelay > 0) {
      setTimeout(fireTrack, totalDelay);
    } else {
      fireTrack();
    }
  }
}
```

#### 2.3.3 资源清理

```typescript
private cleanupTriggers(): void {
  // 移除 container 上的委托事件监听器
  for (const [eventType, handler] of this.delegatedHandlers) {
    this.container?.removeEventListener(eventType, handler);
  }
  this.delegatedHandlers.clear();

  // 断开 IntersectionObserver
  for (const observer of this.intersectionObservers) {
    observer.disconnect();
  }
  this.intersectionObservers = [];

  // 取消所有事件触发的动画
  for (const handle of this.triggerHandles) {
    handle.cancel();
  }
  this.triggerHandles = [];
  this.firedTrackIds.clear();
  this.resolvedGroups.clear();
}

// 在 apply() 和 destroy() 中调用 cleanupTriggers()
```

### 2.4 事件系统扩展

新增两个播放器事件：

```typescript
export interface PlayerEventMap {
  // ... 现有事件 ...

  /** 事件触发器已绑定到目标元素 */
  'trigger-bound': { trackId: string; type: string; target: string };
  /** 事件触发器已触发，动画开始播放 */
  'trigger-fired': { trackId: string; type: string };
}
```

### 2.5 AI 生成示例

AI 返回的动画配置可包含事件触发器和触发器分组：

```json
{
  "config": {
    "name": "interactive-demo",
    "triggerGroups": {
      "btn-click": { "type": "click", "target": ".cta-button" }
    },
    "tracks": [
      {
        "id": "entrance",
        "target": ".hero",
        "keyframes": [
          { "offset": 0, "opacity": 0, "transform": "translateY(20px)" },
          { "offset": 1, "opacity": 1, "transform": "translateY(0)" }
        ],
        "options": { "duration": 800, "easing": "ease-out" }
      },
      {
        "id": "btn-scale",
        "target": ".cta-button",
        "keyframes": [
          { "offset": 0, "transform": "scale(1)" },
          { "offset": 0.5, "transform": "scale(1.1)" },
          { "offset": 1, "transform": "scale(1)" }
        ],
        "options": { "duration": 300 },
        "trigger": { "group": "btn-click", "once": true }
      },
      {
        "id": "btn-color",
        "target": ".cta-button",
        "keyframes": [
          { "offset": 0, "backgroundColor": "#3b82f6" },
          { "offset": 1, "backgroundColor": "#1d4ed8" }
        ],
        "options": { "duration": 300, "fillMode": "forwards" },
        "trigger": { "group": "btn-click", "delay": 100 }
      },
      {
        "id": "card-hover",
        "target": ".card",
        "keyframes": [
          { "offset": 0, "transform": "translateY(0)" },
          { "offset": 1, "transform": "translateY(-10px)" }
        ],
        "options": { "duration": 300, "fillMode": "forwards" },
        "trigger": { "type": "hover" }
      },
      {
        "id": "scroll-reveal",
        "target": ".section",
        "keyframes": [
          { "offset": 0, "opacity": 0 },
          { "offset": 1, "opacity": 1 }
        ],
        "options": { "duration": 1000 },
        "trigger": { "type": "viewport", "once": true }
      }
    ]
  }
}
```

**说明**：

- `btn-scale` 和 `btn-color` 通过 `trigger.group: "btn-click"` 引用同一个分组，点击 `.cta-button` 时两个动画同时触发
- `btn-scale` 配置了 `once: true`（只触发一次），`btn-color` 没有（每次点击都触发）
- `btn-color` 配置了 `delay: 100`（延迟 100ms 后播放），`btn-scale` 立即播放
- `card-hover` 和 `scroll-reveal` 没有 group，作为独立触发轨道处理

## 3. 文件变更清单

| 文件                                         | 变更类型 | 说明                                                                                                                                                                                                                                   |
| -------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/types/animation.ts`                     | 修改     | 新增 `AnimationTrigger`、`AnimationTriggerType`、`AnimationTriggerGroup` 类型，`AnimationTrack` 新增 `trigger` 字段，`AnimationConfig` 新增 `triggerGroups` 字段                                                                       |
| `src/types/ai-response.ts`                   | 修改     | `AIEditorResponse.config` 的 Pick 扩展为包含 `triggerGroups`                                                                                                                                                                           |
| `src/libs/animation-sdk/types.ts`            | 修改     | `PlayerEventMap` 新增 `trigger-bound`、`trigger-fired` 事件                                                                                                                                                                            |
| `src/libs/animation-sdk/player.ts`           | 修改     | 新增 `resolveGroups`、`bindTriggerGroups`、`fireTriggeredGroup`、`cleanupTriggers` 方法，修改 `apply`、`destroy` 逻辑，新增 `triggerHandles`、`delegatedHandlers`、`resolvedGroups`、`intersectionObservers`、`firedTrackIds` 私有字段 |
| `src/libs/animation-sdk/trigger-resolver.ts` | 新增     | 抽离触发器分组解析、事件委托绑定等纯函数/独立模块，避免 player.ts 逻辑膨胀                                                                                                                                                             |
| `src/libs/animation-sdk/index.ts`            | 修改     | 导出 `AnimationTrigger`、`AnimationTriggerType`、`AnimationTriggerGroup` 类型                                                                                                                                                          |
| `src/hooks/use-ai-chat.ts`                   | 修改     | `SYSTEM_PROMPT` 补充 `triggerGroups` 和 `trigger` 的 Schema 示例与规则说明                                                                                                                                                             |

## 4. 边界情况处理

| 场景                                                   | 处理方式                                                                                   |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `trigger.target` 选择器在容器内未找到                  | 发出 `target-missing` 事件，跳过该轨道，不抛出异常                                         |
| `trigger.type` 为未知值                                | 发出 warn 日志，跳过该轨道                                                                 |
| `trigger.once: true` 且事件已触发                      | 触发后记录到 `firedTrackIds`，后续交互不再触发，`cleanupTriggers()` 时清空                 |
| `hover` 触发后鼠标快速离开                             | `mouseout` 时**取消**动画（重置到起点），下次进入时从头播放                                |
| `viewport` 触发后元素被移出视口                        | `IntersectionObserver` 不会自动暂停动画，动画继续播放直到完成                              |
| `scroll` 触发频繁触发                                  | 若 `once: false`，每次滚动都会创建新动画实例，可能导致性能问题；建议配合 `once: true` 使用 |
| 播放器 `destroy()` 后触发器仍被触发                    | `fireTrack` 内部检查 `destroyed` 标志，已销毁时静默返回                                    |
| 同一轨道同时配置 `auto` 和 `click`                     | `trigger.type === 'auto'` 时按自动播放处理，忽略其他触发器配置                             |
| `trigger.delay` 期间播放器被销毁                       | `setTimeout` 回调中检查 `destroyed` 标志，已销毁时不执行                                   |
| `trigger.group` 引用了不存在的分组 ID                  | 发出 warn 日志，跳过该轨道                                                                 |
| 分组定义中的 `target` 元素未找到                       | 组内所有轨道均发出 `target-missing` 事件                                                   |
| 组内某个轨道的动画目标（`track.target`）未找到         | 该轨道跳过，不影响组内其他轨道正常触发                                                     |
| 组内各轨道 `once` 配置不同                             | 每个轨道独立控制，互不影响                                                                 |
| 组内各轨道 `delay` 配置不同                            | 每个轨道独立计算延迟（组级 delay + 轨道级 delay），互不影响                                |
| 轨道配置了 `trigger.group` 同时又配置了 `trigger.type` | `type` 被忽略，以分组定义的 `type` 为准                                                    |

## 5. 实现约束

### 5.1 纯函数抽离

为避免 `AnimationPlayer` 类逻辑膨胀，触发器相关的数据处理逻辑应抽离为独立的纯函数模块 `src/libs/animation-sdk/trigger-resolver.ts`：

```typescript
// src/libs/animation-sdk/trigger-resolver.ts

/** 解析后的触发器分组 */
export interface ResolvedTriggerGroup {
  def: AnimationTriggerGroup;
  tracks: AnimationTrack[];
}

/**
 * 解析 triggerGroups 配置，将轨道分配到对应分组
 * 无 group 的独立触发轨道自动创建隐式分组
 */
export function resolveTriggerGroups(
  tracks: AnimationTrack[],
  triggerGroups?: Record<string, AnimationTriggerGroup>,
): Map<string, ResolvedTriggerGroup> { ... }

/**
 * 按事件类型对已解析的分组进行分类
 */
export function classifyGroupsByType(
  resolvedGroups: Map<string, ResolvedTriggerGroup>,
): {
  clickGroups: ResolvedTriggerGroup[];
  hoverGroups: ResolvedTriggerGroup[];
  scrollGroups: ResolvedTriggerGroup[];
  viewportGroups: ResolvedTriggerGroup[];
} { ... }

/**
 * 计算轨道的总触发延迟（组级 + 轨道级）
 */
export function computeTotalDelay(groupDef: AnimationTriggerGroup, track: AnimationTrack): number { ... }
```

**优势**：

- 纯函数无 `this` 依赖，易于单元测试
- 语义清晰，职责单一
- 可被其他模块复用（如预览页、调试工具）
- `AnimationPlayer` 只负责 DOM 交互和生命周期管理

### 5.2 System Prompt 更新

`src/hooks/use-ai-chat.ts` 中的 `SYSTEM_PROMPT` 需要补充触发器相关内容：

**Schema 示例中增加**：

```json
{
  "config": {
    "name": "交互动画示例",
    "triggerGroups": {
      "btn-click": { "type": "click", "target": ".btn" }
    },
    "tracks": [
      {
        "id": "entrance",
        "target": ".card",
        "keyframes": [...],
        "options": { "duration": 800 }
      },
      {
        "id": "btn-scale",
        "target": ".btn",
        "keyframes": [...],
        "options": { "duration": 300 },
        "trigger": { "group": "btn-click", "once": true }
      }
    ]
  }
}
```

**关键规则中增加**：

- `triggerGroups` 为可选对象，key 为分组 ID，值为 `{ type, target, delay? }`
- `trigger` 为 track 的可选字段，配置 `group` 引用分组 ID 时，`type` 和 `target` 从分组继承
- 无 `trigger` 或 `trigger.type === "auto"` 的轨道在 apply 时自动播放
- `trigger.once` 控制是否只触发一次，`trigger.delay` 控制轨道级延迟（毫秒）

## 6. 验收标准

1. `AnimationTrack` 类型包含可选的 `trigger` 字段，TypeScript 类型检查通过
2. 未指定 `trigger` 或 `trigger.type === 'auto'` 时，行为与现有逻辑完全一致（向后兼容）
3. `trigger.type === 'click'` 时，点击目标元素后动画开始播放
4. `trigger.type === 'hover'` 时，鼠标进入目标元素后动画开始播放，离开后**取消**动画（重置到起点），下次进入从头播放
5. `trigger.type === 'scroll'` 时，容器滚动后动画开始播放
6. `trigger.type === 'viewport'` 时，目标元素进入视口后动画开始播放
7. `trigger.once: true` 时，触发器只生效一次，后续交互不再触发
8. `trigger.delay` 生效，触发后延迟指定毫秒数再播放动画
9. `trigger-bound` 和 `trigger-fired` 事件正确触发
10. `destroy()` 后所有事件监听器和 `IntersectionObserver` 被正确清理，无内存泄漏
11. AI 返回的动画配置可包含 `trigger` 字段，播放器正确解析和执行
12. 同一 `group` 的多个轨道在事件触发时同时播放
13. `group` 内各轨道的 `once`、`delay` 独立生效，互不影响
14. `triggerGroups` 定义在 `AnimationConfig` 顶层，轨道通过 `trigger.group` 引用
15. 执行 `pnpm fmt:check` 和 `pnpm lint:fix` 无报错
16. 所有日志使用 `logger`，pointer 格式符合规范（如 `'libs.animation-sdk.player.bind-trigger'`）

## 7. 后续演进方向

- **触发器组合**：支持多个触发器组合（如"点击且进入视口后触发"）
- **触发器条件**：支持更复杂的触发条件（如"滚动到 50% 时触发"、"视口可见度 > 80% 时触发"）
- **触发器状态查询**：暴露 API 查询触发器绑定状态和触发次数
- **自定义触发器**：支持用户自定义触发器类型（如"表单提交后触发"、"WebSocket 消息到达时触发"）
- **触发器序列**：支持组内轨道按顺序依次播放（而非同时），通过 `stagger` 延迟控制
