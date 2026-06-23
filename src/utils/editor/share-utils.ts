import type { AnimationConfig } from '@lib/animation-sdk';
import { logger } from '@lib/logger';
import { dispatchEditorEvent, EDITOR_EVENTS } from './event-bus';

/** 完整的动画项目数据，包含配置、DOM 和样式 */
export interface AnimationProjectData {
  config: AnimationConfig;
  customDom: string | null;
  customStyle: string | null;
}

const SHARED_QUERY = 'config';

export function encodeConfigToQuery(data: AnimationProjectData): string {
  try {
    const json = JSON.stringify(data);
    const encoded = btoa(encodeURIComponent(json));
    return `${SHARED_QUERY}=${encoded}`;
  } catch (error) {
    logger.error('libs.share-utils.encode', 'Failed to encode animation project data to query', error);
    return '';
  }
}

export function decodeConfigFromQuery(config?: string): AnimationProjectData | null {
  if (!config) {
    return null;
  }
  try {
    const json = decodeURIComponent(atob(config));
    const data = JSON.parse(json) as AnimationProjectData;

    if (!data.config?.version || !data.config?.id || !data.config?.tracks) {
      logger.warn('libs.share-utils.decode', 'Invalid animation project data from query: missing required fields');
      return null;
    }

    return data;
  } catch (error) {
    logger.warn('libs.share-utils.decode', 'Failed to decode animation project data from query', error);
    return null;
  }
}

export function exportProjectToFile(data: AnimationProjectData): void {
  try {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${data.config.name || 'animation'}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    logger.info('libs.share-utils.export', `Exported animation project: ${data.config.name}`);
    dispatchEditorEvent(EDITOR_EVENTS.MESSAGE, { text: '导出成功', type: 'success' });
  } catch (error) {
    logger.error('libs.share-utils.export', 'Failed to export animation project', error);
    dispatchEditorEvent(EDITOR_EVENTS.MESSAGE, { text: '导出失败', type: 'error' });
  }
}

export function importProjectFromFile(file: File): Promise<AnimationProjectData | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string) as AnimationProjectData;

        if (!data.config?.version || !data.config?.id || !data.config?.tracks) {
          logger.warn('libs.share-utils.import', 'Invalid animation project file: missing required fields');
          dispatchEditorEvent(EDITOR_EVENTS.MESSAGE, { text: '文件格式无效：缺少必要字段', type: 'error' });
          resolve(null);
          return;
        }
        logger.info('libs.share-utils.import', `Imported animation project: ${data.config.name}`);
        dispatchEditorEvent(EDITOR_EVENTS.MESSAGE, { text: `导入成功: ${data.config.name}`, type: 'success' });
        resolve(data);
      } catch (error) {
        logger.error('libs.share-utils.import', 'Failed to parse animation project file', error);
        dispatchEditorEvent(EDITOR_EVENTS.MESSAGE, { text: 'JSON 解析失败', type: 'error' });
        resolve(null);
      }
    };
    reader.onerror = () => {
      logger.error('libs.share-utils.import', 'Failed to read animation project file', reader.error);
      dispatchEditorEvent(EDITOR_EVENTS.MESSAGE, { text: '文件读取失败', type: 'error' });
      resolve(null);
    };
    reader.readAsText(file);
  });
}
