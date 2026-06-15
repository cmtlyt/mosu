import type { AnimationConfig } from '@/types/animation';
import { logger } from '@/libs/logger';
import { dispatchEditorEvent, EDITOR_EVENTS } from './event-bus';

export function encodeConfigToQuery(config: AnimationConfig): string {
  try {
    const json = JSON.stringify(config);
    const encoded = btoa(encodeURIComponent(json));
    return `animation=${encoded}`;
  } catch (error) {
    logger.error('libs.share-utils.encode', 'Failed to encode animation config to query', error);
    return '';
  }
}

export function decodeConfigFromQuery(queryString: string): AnimationConfig | null {
  try {
    const params = new URLSearchParams(queryString);
    const encoded = params.get('animation');
    if (!encoded) {
      return null;
    }

    const json = decodeURIComponent(atob(encoded));
    const config = JSON.parse(json) as AnimationConfig;

    if (!config.version || !config.id || !config.tracks) {
      logger.warn('libs.share-utils.decode', 'Invalid animation config from query: missing required fields');
      return null;
    }

    return config;
  } catch (error) {
    logger.warn('libs.share-utils.decode', 'Failed to decode animation config from query', error);
    return null;
  }
}

export function exportConfigToFile(config: AnimationConfig): void {
  try {
    const json = JSON.stringify(config, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${config.name || 'animation'}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    logger.info('libs.share-utils.export', `Exported animation config: ${config.name}`);
  } catch (error) {
    logger.error('libs.share-utils.export', 'Failed to export animation config', error);
    dispatchEditorEvent(EDITOR_EVENTS.IMPORT_ERROR, { message: '导出失败' });
  }
}

export function importConfigFromFile(file: File): Promise<AnimationConfig | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const config = JSON.parse(reader.result as string) as AnimationConfig;
        if (!config.version || !config.id || !config.tracks) {
          logger.warn('libs.share-utils.import', 'Invalid animation config file: missing required fields');
          dispatchEditorEvent(EDITOR_EVENTS.IMPORT_ERROR, { message: '文件格式无效：缺少必要字段' });
          resolve(null);
          return;
        }
        logger.info('libs.share-utils.import', `Imported animation config: ${config.name}`);
        dispatchEditorEvent(EDITOR_EVENTS.IMPORT_SUCCESS, { config });
        resolve(config);
      } catch (error) {
        logger.error('libs.share-utils.import', 'Failed to parse animation config file', error);
        dispatchEditorEvent(EDITOR_EVENTS.IMPORT_ERROR, { message: 'JSON 解析失败' });
        resolve(null);
      }
    };
    reader.onerror = () => {
      logger.error('libs.share-utils.import', 'Failed to read animation config file', reader.error);
      dispatchEditorEvent(EDITOR_EVENTS.IMPORT_ERROR, { message: '文件读取失败' });
      resolve(null);
    };
    reader.readAsText(file);
  });
}
