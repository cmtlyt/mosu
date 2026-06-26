/**
 * OPFS (Origin Private File System) 工具模块
 * 用于在浏览器中持久化存储数据
 */

import { logger } from '@lib/logger';

const OPFS_ROOT_DIR = '@cmtlyt-mosu';

/**
 * 获取 OPFS 根目录
 */
async function getRootDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return await root.getDirectoryHandle(OPFS_ROOT_DIR, { create: true });
}

/**
 * 保存数据到 OPFS
 * @param filename 文件名
 * @param data 要保存的数据
 */
export async function saveToOPFS<T>(filename: string, data: T): Promise<void> {
  try {
    const rootDir = await getRootDir();
    const fileHandle = await rootDir.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    const json = JSON.stringify(data, null, 2);
    await writable.write(json);
    await writable.close();
    logger.info('utils.opfs.save', `Saved to OPFS: ${filename}`);
  } catch (error) {
    logger.error('utils.opfs.save', `Failed to save to OPFS: ${filename}`, error);
    throw error;
  }
}

/**
 * 从 OPFS 读取数据
 * @param filename 文件名
 * @returns 读取的数据，如果文件不存在返回 null
 */
export async function loadFromOPFS<T>(filename: string): Promise<T | null> {
  try {
    const rootDir = await getRootDir();
    const fileHandle = await rootDir.getFileHandle(filename, { create: false });
    const file = await fileHandle.getFile();
    const text = await file.text();
    const data = JSON.parse(text) as T;
    logger.info('utils.opfs.load', `Loaded from OPFS: ${filename}`);
    return data;
  } catch (error) {
    if (error instanceof Error && error.name === 'NotFoundError') {
      logger.info('utils.opfs.load', `File not found in OPFS: ${filename}`);
      return null;
    }
    logger.error('utils.opfs.load', `Failed to load from OPFS: ${filename}`, error);
    throw error;
  }
}

/**
 * 删除 OPFS 中的文件
 * @param filename 文件名
 */
export async function deleteFromOPFS(filename: string): Promise<void> {
  try {
    const rootDir = await getRootDir();
    await rootDir.removeEntry(filename);
    logger.info('utils.opfs.delete', `Deleted from OPFS: ${filename}`);
  } catch (error) {
    if (error instanceof Error && error.name === 'NotFoundError') {
      logger.info('utils.opfs.delete', `File not found in OPFS: ${filename}`);
      return;
    }
    logger.error('utils.opfs.delete', `Failed to delete from OPFS: ${filename}`, error);
    throw error;
  }
}

/**
 * 列出 OPFS 中的所有文件
 * @returns 文件名数组
 */
export async function listOPFSFiles(): Promise<string[]> {
  try {
    const rootDir = await getRootDir();
    const files: string[] = [];
    for await (const name of rootDir.keys()) {
      files.push(name);
    }
    logger.info('utils.opfs.list', `Listed ${files.length} files from OPFS`);
    return files;
  } catch (error) {
    logger.error('utils.opfs.list', 'Failed to list files from OPFS', error);
    throw error;
  }
}

/**
 * 检查 OPFS 中是否存在文件
 * @param filename 文件名
 * @returns 是否存在
 */
export async function existsInOPFS(filename: string): Promise<boolean> {
  try {
    const rootDir = await getRootDir();
    await rootDir.getFileHandle(filename, { create: false });
    return true;
  } catch (error) {
    if (error instanceof Error && error.name === 'NotFoundError') {
      return false;
    }
    throw error;
  }
}
