import type { AIEditorResponse } from '@/types/ai-response';
import type { AnimationConfig } from '@/types/animation';
import type { ChatMessage, HistoryNodeData } from '@/types/history';
import { applyDomPatch } from '@/libs/dom-patcher';
import { applyAnimationPatch } from '@/libs/animation-patcher';
import { sanitizeStyle } from '@/libs/dom-sanitizer';
import { mergeStyles } from '@/libs/style-merger';
import { dispatchEditorEvent, EDITOR_EVENTS } from '@/utils/editor/event-bus';
import { logger } from '@/libs/logger';

export function generateAnimationId(): string {
  return `anim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function tryGetNodeData(
  getNode: (nodeId: string) => { data: HistoryNodeData },
  nodeId: string,
): HistoryNodeData | null {
  try {
    return getNode(nodeId).data;
  } catch {
    return null;
  }
}

export function processDomPatch(response: AIEditorResponse, currentDom: string | null): string | null {
  if (!response.domPatch || response.domPatch.length === 0) {
    return null;
  }

  const baseDom = currentDom ?? '';
  const { html, result: patchResult } = applyDomPatch(baseDom, response.domPatch);

  if (patchResult.skipped > 0) {
    logger.warn(
      'routes.editor.patch',
      `DOM patch partially applied: ${patchResult.applied} ok, ${patchResult.skipped} skipped`,
      patchResult.errors,
    );
    dispatchEditorEvent(EDITOR_EVENTS.MESSAGE, {
      text: `DOM 变更部分应用成功，${patchResult.skipped} 条指令因选择器无效被跳过`,
      type: 'info',
    });
  }

  return html;
}

export function processStyle(response: AIEditorResponse): string | null {
  if (!response.style) {
    return null;
  }

  const sanitizedStyle = sanitizeStyle(response.style);
  if (sanitizedStyle === null) {
    logger.warn('routes.editor.sanitize.style', 'AI generated style contains animation properties');
    dispatchEditorEvent(EDITOR_EVENTS.MESSAGE, {
      text: 'AI 生成的样式包含动画属性，已忽略样式更新',
      type: 'error',
    });
  }

  return sanitizedStyle;
}

export function processAnimationConfig(
  response: AIEditorResponse,
  currentConfig: AnimationConfig,
): Pick<AnimationConfig, 'tracks' | 'triggerGroups'> & { name?: string } {
  if (response.animationPatch && response.animationPatch.length > 0) {
    const { config: patchedConfig, result: patchResult } = applyAnimationPatch(currentConfig, response.animationPatch);

    if (patchResult.skipped > 0) {
      logger.warn(
        'routes.editor.animation-patch',
        `Animation patch partially applied: ${patchResult.applied} ok, ${patchResult.skipped} skipped`,
        patchResult.errors,
      );
      dispatchEditorEvent(EDITOR_EVENTS.MESSAGE, {
        text: `动画变更部分应用成功，${patchResult.skipped} 条指令被跳过`,
        type: 'info',
      });
    }

    return {
      name: response.name,
      tracks: patchedConfig.tracks,
      triggerGroups: patchedConfig.triggerGroups,
    };
  }

  if (response.config) {
    return { name: response.name, ...response.config };
  }

  return { name: response.name, tracks: currentConfig.tracks, triggerGroups: currentConfig.triggerGroups };
}

export function buildFullConfig(
  mergedConfig: Pick<AnimationConfig, 'tracks' | 'triggerGroups'> & { name?: string },
  content: string,
): AnimationConfig {
  return {
    version: '1.0',
    id: generateAnimationId(),
    name: mergedConfig.name || content.slice(0, 20) + (content.length > 20 ? '...' : ''),
    tracks: mergedConfig.tracks,
    triggerGroups: mergedConfig.triggerGroups,
  };
}

export function prepareMessagesForCommit(
  messages: ChatMessage[],
  existingMessages: ChatMessage[],
  hasUpdate: boolean,
): ChatMessage[] {
  const newMessages = messages.map((msg) => ({
    ...msg,
    hasDomUpdate: msg.role === 'assistant' && hasUpdate,
  }));

  return newMessages.filter((msg) => !existingMessages.some((existing) => existing.id === msg.id));
}

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
