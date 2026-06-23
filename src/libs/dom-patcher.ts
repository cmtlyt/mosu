import type { DomPatchInstruction } from '@/types/dom-patch';
import { sanitizeDom } from '@/libs/dom-sanitizer';
import { logger } from '@lib/logger';

interface PatchResult {
  applied: number;
  skipped: number;
  errors: string[];
}

function createFragmentFromHtml(html: string): DocumentFragment {
  const temp = document.createElement('div');
  temp.innerHTML = html;
  const fragment = document.createDocumentFragment();
  while (temp.firstChild) {
    fragment.appendChild(temp.firstChild);
  }
  return fragment;
}

function applyAddOp(root: Element, patch: DomPatchInstruction): void {
  const parent = root.querySelector(patch.selector);
  if (!parent) {
    throw new Error(`add: selector "${patch.selector}" not found`);
  }
  const sanitizedHtml = patch.html ? sanitizeDom(patch.html) : null;
  if (!sanitizedHtml && patch.html) {
    throw new Error('add: html content failed sanitization');
  }
  if (!sanitizedHtml) {
    throw new Error('add: missing html content');
  }

  const fragment = createFragmentFromHtml(sanitizedHtml);
  const position = patch.position ?? 'append';
  switch (position) {
    case 'prepend':
      parent.prepend(fragment);
      break;
    case 'before':
      parent.before(fragment);
      break;
    case 'after':
      parent.after(fragment);
      break;
    case 'append':
    default:
      parent.append(fragment);
      break;
  }
}

function applyRemoveOp(root: Element, selector: string): void {
  const target = root.querySelector(selector);
  if (!target) {
    throw new Error(`remove: selector "${selector}" not found`);
  }
  target.remove();
}

function applyReplaceOp(root: Element, patch: DomPatchInstruction): void {
  const target = root.querySelector(patch.selector);
  if (!target) {
    throw new Error(`replace: selector "${patch.selector}" not found`);
  }
  const sanitizedHtml = patch.html ? sanitizeDom(patch.html) : null;
  if (!sanitizedHtml) {
    throw new Error('replace: missing or invalid html content');
  }
  target.outerHTML = sanitizedHtml;
}

function applyAttrOp(root: Element, patch: DomPatchInstruction): void {
  const target = root.querySelector(patch.selector);
  if (!target) {
    throw new Error(`attr: selector "${patch.selector}" not found`);
  }
  if (!patch.attrName) {
    throw new Error('attr: missing attrName');
  }
  if (patch.attrValue === null || patch.attrValue === undefined) {
    target.removeAttribute(patch.attrName);
  } else {
    target.setAttribute(patch.attrName, patch.attrValue);
  }
}

function applyTextOp(root: Element, patch: DomPatchInstruction): void {
  const target = root.querySelector(patch.selector);
  if (!target) {
    throw new Error(`text: selector "${patch.selector}" not found`);
  }
  if (patch.text === undefined) {
    throw new Error('text: missing text content');
  }
  target.textContent = patch.text;
}

function applySinglePatch(root: Element, patch: DomPatchInstruction): void {
  switch (patch.op) {
    case 'add':
      applyAddOp(root, patch);
      break;
    case 'remove':
      applyRemoveOp(root, patch.selector);
      break;
    case 'replace':
      applyReplaceOp(root, patch);
      break;
    case 'attr':
      applyAttrOp(root, patch);
      break;
    case 'text':
      applyTextOp(root, patch);
      break;
    default:
      throw new Error(`Unknown patch op: ${patch.op}`);
  }
}

/**
 * 将 DOM Patch 指令应用到基础 HTML 上，返回更新后的 HTML 字符串。
 * 尽力应用可执行的 patch，跳过失败项并记录警告。
 */
export function applyDomPatch(baseHtml: string, patches: DomPatchInstruction[]): { html: string; result: PatchResult } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div id="__patch_root__">${baseHtml}</div>`, 'text/html');
  const root = doc.getElementById('__patch_root__');

  if (!root) {
    logger.error('libs.dom-patcher.apply', 'Failed to create patch root container', null);
    return {
      html: baseHtml,
      result: { applied: 0, skipped: patches.length, errors: ['Root container creation failed'] },
    };
  }

  const result: PatchResult = { applied: 0, skipped: 0, errors: [] };

  for (const patch of patches) {
    try {
      applySinglePatch(root, patch);
      result.applied++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('libs.dom-patcher.skip', `Patch skipped: ${message}`, patch);
      result.skipped++;
      result.errors.push(message);
    }
  }

  const updatedHtml = root.innerHTML.trim();
  return { html: updatedHtml || baseHtml, result };
}
