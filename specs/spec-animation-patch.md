# Spec: Animation Patch 增量动画配置更新

## 1. 背景与目标

当前 AI 返回的动画配置（`config`）采用**全量替换**模式：每次对话 AI 都需要输出完整的 `tracks` 数组和 `triggerGroups`，即使用户只是微调了某个轨道的 `duration` 或新增了一条轨道。

**问题**：

- 当轨道数量较多时（如 10+ 条），每次全量输出会消耗大量 token
- AI 容易在重复输出未变更的轨道时产生幻觉（如丢失 keyframes、错改 id）
- 与 `domPatch` 的增量模式不一致，增加 AI 理解成本

**目标**：引入 `animationPatch` 字段，采用与 `domPatch` 一致的增量指令模式，AI 仅输出变更部分，系统自动合并到当前配置。

## 2. 核心设计

### 2.1 扩展 AI 输出 Schema

在 `AIEditorResponse` 中新增 `animationPatch` 字段，与 `config` 互斥：

```typescript
// src/types/ai-response.ts
import type { AnimationPatchInstruction } from './animation-patch';

export interface AIEditorResponse {
  domPatch?: DomPatchInstruction[];
  style?: string;
  /** 动画增量变更指令，与 config 互斥 */
  animationPatch?: AnimationPatchInstruction[];
  /** 动画全量配置（仅在全新场景时使用，与 animationPatch 互斥） */
  config?: Pick<AnimationConfig, 'tracks' | 'triggerGroups'> & {
    name?: string;
  };
}
```

**互斥规则**：

- 优先使用 `animationPatch`（增量模式）
- 仅在全新场景、完全重建动画时使用 `config`（全量模式）
- 若同时提供，优先应用 `animationPatch`，忽略 `config`

### 2.2 Animation Patch 指令类型

新增 `src/types/animation-patch.ts`：

```typescript
import type { AnimationTrack, AnimationTriggerGroup } from './animation';

export type AnimationPatchOp =
  | 'addTrack'
  | 'removeTrack'
  | 'updateTrack'
  | 'addTriggerGroup'
  | 'removeTriggerGroup'
  | 'updateTriggerGroup';

export interface AnimationPatchInstruction {
  /** 操作类型 */
  op: AnimationPatchOp;

  // --- addTrack / updateTrack ---
  /** addTrack 时的完整轨道定义 */
  track?: AnimationTrack;
  /** updateTrack 时的轨道 ID（必填） */
  trackId?: string;
  /** updateTrack 时的部分更新字段（与 track 互斥） */
  trackUpdate?: Partial<Omit<AnimationTrack, 'id'>>;

  // --- removeTrack ---
  /** removeTrack 时的轨道 ID */
  // 复用 trackId

  // --- addTriggerGroup / updateTriggerGroup ---
  /** 触发器分组 ID */
  groupId?: string;
  /** addTriggerGroup 时的完整分组定义 */
  group?: AnimationTriggerGroup;
  /** updateTriggerGroup 时的部分更新字段 */
  groupUpdate?: Partial<AnimationTriggerGroup>;

  // --- removeTriggerGroup ---
  /** removeTriggerGroup 时的分组 ID */
  // 复用 groupId
}
```

### 2.3 Patch 应用逻辑

新增 `src/libs/animation-patcher.ts`：

```typescript
import type { AnimationConfig } from '@lib/animation-sdk';
import type { AnimationPatchInstruction } from '@lib/animation-sdk-patch';
import { logger } from '@lib/logger';

interface PatchResult {
  applied: number;
  skipped: number;
  errors: string[];
}

/**
 * 将 animationPatch 指令合并到基础配置上，返回更新后的配置
 */
export function applyAnimationPatch(
  baseConfig: AnimationConfig,
  patches: AnimationPatchInstruction[],
): { config: AnimationConfig; result: PatchResult } {
  const result: PatchResult = { applied: 0, skipped: 0, errors: [] };

  // 深拷贝基础配置，避免直接修改原对象
  const config: AnimationConfig = structuredClone(baseConfig);

  for (const patch of patches) {
    try {
      applySinglePatch(config, patch);
      result.applied++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('libs.animation-patcher.skip', `Patch skipped: ${message}`, patch);
      result.skipped++;
      result.errors.push(message);
    }
  }

  // 合并连续的同轨道 updateTrack 操作
  mergeConsecutiveUpdates(patches);

  return { config, result };
}

/**
 * 合并连续的 updateTrack 操作：
 * 若多条 patch 针对同一 trackId 且均为 updateTrack，合并为一条
 * 减少冗余 patch，提升应用效率
 */
function mergeConsecutiveUpdates(patches: AnimationPatchInstruction[]): void {
  const merged = new Map<string, AnimationPatchInstruction>();

  for (const patch of patches) {
    if (patch.op !== 'updateTrack' || !patch.trackId || !patch.trackUpdate) {
      continue;
    }

    const existing = merged.get(patch.trackId);
    if (existing && existing.trackUpdate) {
      // 合并 trackUpdate 字段
      existing.trackUpdate = {
        ...existing.trackUpdate,
        ...patch.trackUpdate,
        // options 需要深度合并
        options: {
          ...existing.trackUpdate.options,
          ...patch.trackUpdate.options,
        },
      };
    } else {
      merged.set(patch.trackId, { ...patch });
    }
  }

  // 注意：此函数仅用于日志/统计，实际合并在 applySinglePatch 中已自然完成
  // 因为后续 updateTrack 会覆盖前面的同字段更新
}

function applySinglePatch(config: AnimationConfig, patch: AnimationPatchInstruction): void {
  switch (patch.op) {
    case 'addTrack':
      applyAddTrack(config, patch);
      break;
    case 'removeTrack':
      applyRemoveTrack(config, patch);
      break;
    case 'updateTrack':
      applyUpdateTrack(config, patch);
      break;
    case 'addTriggerGroup':
      applyAddTriggerGroup(config, patch);
      break;
    case 'removeTriggerGroup':
      applyRemoveTriggerGroup(config, patch);
      break;
    case 'updateTriggerGroup':
      applyUpdateTriggerGroup(config, patch);
      break;
    default:
      throw new Error(`Unknown patch op: ${patch.op}`);
  }
}

function applyAddTrack(config: AnimationConfig, patch: AnimationPatchInstruction): void {
  if (!patch.track) {
    throw new Error('addTrack: missing track definition');
  }
  if (!patch.track.id) {
    throw new Error('addTrack: track.id is required');
  }
  // 检查 ID 冲突
  if (config.tracks.some((track) => track.id === patch.track!.id)) {
    throw new Error(`addTrack: track "${patch.track.id}" already exists`);
  }
  config.tracks.push(patch.track);
}

function applyRemoveTrack(config: AnimationConfig, patch: AnimationPatchInstruction): void {
  if (!patch.trackId) {
    throw new Error('removeTrack: missing trackId');
  }
  const index = config.tracks.findIndex((track) => track.id === patch.trackId);
  if (index === -1) {
    throw new Error(`removeTrack: track "${patch.trackId}" not found`);
  }
  config.tracks.splice(index, 1);
}

function applyUpdateTrack(config: AnimationConfig, patch: AnimationPatchInstruction): void {
  if (!patch.trackId) {
    throw new Error('updateTrack: missing trackId');
  }
  if (!patch.trackUpdate) {
    throw new Error('updateTrack: missing trackUpdate');
  }
  const index = config.tracks.findIndex((track) => track.id === patch.trackId);
  if (index === -1) {
    throw new Error(`updateTrack: track "${patch.trackId}" not found`);
  }
  // 合并更新字段
  config.tracks[index] = {
    ...config.tracks[index],
    ...patch.trackUpdate,
  };
}

function applyAddTriggerGroup(config: AnimationConfig, patch: AnimationPatchInstruction): void {
  if (!patch.groupId) {
    throw new Error('addTriggerGroup: missing groupId');
  }
  if (!patch.group) {
    throw new Error('addTriggerGroup: missing group definition');
  }
  if (!config.triggerGroups) {
    config.triggerGroups = {};
  }
  if (config.triggerGroups[patch.groupId]) {
    throw new Error(`addTriggerGroup: group "${patch.groupId}" already exists`);
  }
  config.triggerGroups[patch.groupId] = patch.group;
}

function applyRemoveTriggerGroup(config: AnimationConfig, patch: AnimationPatchInstruction): void {
  if (!patch.groupId) {
    throw new Error('removeTriggerGroup: missing groupId');
  }
  if (!config.triggerGroups || !config.triggerGroups[patch.groupId]) {
    throw new Error(`removeTriggerGroup: group "${patch.groupId}" not found`);
  }
  delete config.triggerGroups[patch.groupId];
}

function applyUpdateTriggerGroup(config: AnimationConfig, patch: AnimationPatchInstruction): void {
  if (!patch.groupId) {
    throw new Error('updateTriggerGroup: missing groupId');
  }
  if (!patch.groupUpdate) {
    throw new Error('updateTriggerGroup: missing groupUpdate');
  }
  if (!config.triggerGroups || !config.triggerGroups[patch.groupId]) {
    throw new Error(`updateTriggerGroup: group "${patch.groupId}" not found`);
  }
  config.triggerGroups[patch.groupId] = {
    ...config.triggerGroups[patch.groupId],
    ...patch.groupUpdate,
  };
}
```

### 2.4 System Prompt 更新

在 `src/hooks/use-ai-chat.ts` 的 `SYSTEM_PROMPT` 中追加 Animation Patch 规则：

```text
## Animation Patch 规则

26. 动画变更通过 "animationPatch" 字段表达，值为指令数组。仅在全新场景时使用 "config" 全量替换。
27. 每条指令包含 "op"（操作类型）及操作所需参数。
28. 支持的操作类型：
    - "addTrack": 添加新轨道。需 "track" 字段（完整轨道定义，包含 id/target/keyframes/options）。
    - "removeTrack": 移除轨道。需 "trackId" 字段。
    - "updateTrack": 更新轨道。需 "trackId" 和 "trackUpdate"（部分更新字段，如 { "options": { "duration": 2000 } }）。注意：若需修改 keyframes，必须返回完整的 keyframes 数组，不支持部分更新。
    - "addTriggerGroup": 添加触发器分组。需 "groupId" 和 "group"（完整分组定义）。
    - "removeTriggerGroup": 移除触发器分组。需 "groupId"。
    - "updateTriggerGroup": 更新触发器分组。需 "groupId" 和 "groupUpdate"（部分更新字段）。
29. "trackId" 和 "groupId" 必须基于当前动画配置中已存在的 ID。
30. 增量修改时仅输出变更部分的 patch 指令，不要重复未变更的内容。
31. "animationPatch" 和 "config" 互斥：优先使用 "animationPatch"，仅在全新场景时使用 "config"。
```

### 2.5 AI 生成示例

**场景 1：微调单个轨道的 duration**

```json
{
  "animationPatch": [
    {
      "op": "updateTrack",
      "trackId": "track-1",
      "trackUpdate": {
        "options": { "duration": 2000 }
      }
    }
  ]
}
```

**场景 2：新增一条轨道**

```json
{
  "animationPatch": [
    {
      "op": "addTrack",
      "track": {
        "id": "track-3",
        "target": ".footer",
        "keyframes": [
          { "offset": 0, "opacity": 0 },
          { "offset": 1, "opacity": 1 }
        ],
        "options": { "duration": 800, "delay": 500 }
      }
    }
  ]
}
```

**场景 3：删除轨道 + 更新触发器分组**

```json
{
  "animationPatch": [
    { "op": "removeTrack", "trackId": "track-2" },
    {
      "op": "updateTriggerGroup",
      "groupId": "btn-click",
      "groupUpdate": { "delay": 200 }
    }
  ]
}
```

**场景 4：全新场景（全量替换）**

```json
{
  "config": {
    "name": "全新动画",
    "tracks": [
      { "id": "entrance", "target": ".hero", "keyframes": [...], "options": {...} }
    ]
  }
}
```

## 3. 文件变更清单

| 文件                            | 变更类型 | 说明                                                      |
| ------------------------------- | -------- | --------------------------------------------------------- |
| `src/types/animation-patch.ts`  | 新增     | 定义 `AnimationPatchOp`、`AnimationPatchInstruction` 类型 |
| `src/types/ai-response.ts`      | 修改     | 新增 `animationPatch` 字段，与 `config` 互斥              |
| `src/libs/animation-patcher.ts` | 新增     | 实现 `applyAnimationPatch` 函数，处理 patch 合并逻辑      |
| `src/hooks/use-ai-chat.ts`      | 修改     | `SYSTEM_PROMPT` 补充 Animation Patch 规则说明             |
| `src/routes/editor.tsx`         | 修改     | 调用 `applyAnimationPatch` 处理 AI 返回的 animationPatch  |

## 4. 边界情况处理

| 场景                                          | 处理方式                                                            |
| --------------------------------------------- | ------------------------------------------------------------------- |
| `addTrack` 时 `track.id` 已存在               | 抛出错误，跳过该 patch，记录 warn 日志                              |
| `removeTrack` 时 `trackId` 不存在             | 抛出错误，跳过该 patch，记录 warn 日志                              |
| `updateTrack` 时 `trackId` 不存在             | 抛出错误，跳过该 patch，记录 warn 日志                              |
| `updateTrack` 的 `trackUpdate` 包含 `id` 字段 | 忽略 `id` 字段，禁止修改轨道 ID                                     |
| `addTriggerGroup` 时 `groupId` 已存在         | 抛出错误，跳过该 patch，记录 warn 日志                              |
| `removeTriggerGroup` 时 `groupId` 不存在      | 抛出错误，跳过该 patch，记录 warn 日志                              |
| `updateTriggerGroup` 时 `groupId` 不存在      | 抛出错误，跳过该 patch，记录 warn 日志                              |
| 同时提供 `animationPatch` 和 `config`         | 优先应用 `animationPatch`，忽略 `config`，记录 warn 日志            |
| `animationPatch` 为空数组                     | 不修改配置，直接返回原配置                                          |
| 所有 patch 均失败                             | 返回原配置，`result.applied = 0`，`result.skipped = patches.length` |

## 5. 实现约束

### 5.1 深拷贝与不可变性

`applyAnimationPatch` 必须返回新的配置对象，不得修改传入的 `baseConfig`。内部使用 `structuredClone` 进行深拷贝，确保完全不可变。

### 5.2 日志规范

所有日志使用 `logger`，pointer 格式符合规范：

- `'libs.animation-patcher.skip'`：patch 被跳过时
- `'libs.animation-patcher.apply'`：patch 应用成功时（可选，debug 级别）

### 5.3 类型安全

`trackUpdate` 和 `groupUpdate` 使用 `Partial<Omit<T, 'id'>>` 类型，确保：

- 禁止修改 `id` 字段
- 允许部分更新，未提供的字段保持原值

## 6. 验收标准

1. `AnimationPatchInstruction` 类型定义完整，TypeScript 类型检查通过
2. `applyAnimationPatch` 函数正确处理所有 6 种操作类型
3. patch 应用后返回新的配置对象，原配置未被修改
4. 失败的 patch 被跳过，不影响后续 patch 的执行
5. `result.applied` 和 `result.skipped` 计数准确
6. AI 返回 `animationPatch` 时，系统正确合并到当前配置
7. AI 返回 `config` 时，行为与现有逻辑一致（向后兼容）
8. 同时提供 `animationPatch` 和 `config` 时，优先使用 `animationPatch`
9. System Prompt 包含 Animation Patch 规则，AI 能正确生成 patch 指令
10. 执行 `pnpm fmt:check` 和 `pnpm lint:fix` 无报错
11. 所有日志使用 `logger`，pointer 格式符合规范

## 7. 后续演进方向

- **Patch 预览**：在应用 patch 前，提供 diff 预览，让用户确认变更
- **Patch 批量操作**：支持 `addTracks`（批量添加）、`removeTracks`（批量删除）等批量操作
- **Patch 验证**：在应用前验证 patch 的合法性（如检查 selector 是否存在）
- **Patch 优化**：自动合并连续的 `updateTrack` 操作，减少冗余 patch
