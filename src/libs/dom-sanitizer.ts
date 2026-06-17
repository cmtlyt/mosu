import { logger } from '@/libs/logger';

const BLOCKED_TAGS = new Set([
  'script',
  'iframe',
  'object',
  'embed',
  'form',
  'link',
  'meta',
  'base',
  'applet',
  'svg',
  'math',
]);

const ALLOWED_ATTR_PREFIXES = ['data-', 'aria-'];
const ALLOWED_ATTRS = new Set(['class', 'id', 'style', 'role']);

const MAX_DOM_SIZE = 51_200;

const ANIMATION_PROPERTIES = [
  'animation',
  'animation-name',
  'animation-duration',
  'animation-timing-function',
  'animation-delay',
  'animation-iteration-count',
  'animation-direction',
  'animation-fill-mode',
  'animation-play-state',
  'transition',
  'transition-property',
  'transition-duration',
  'transition-timing-function',
  'transition-delay',
];

function isAllowedAttribute(name: string): boolean {
  if (ALLOWED_ATTRS.has(name)) {
    return true;
  }
  return ALLOWED_ATTR_PREFIXES.some((prefix) => name.startsWith(prefix));
}

function sanitizeElement(element: Element): void {
  const tagName = element.tagName.toLowerCase();

  if (BLOCKED_TAGS.has(tagName)) {
    element.remove();
    return;
  }

  const attrsToRemove: string[] = [];
  for (const attr of Array.from(element.attributes)) {
    if (attr.name.startsWith('on')) {
      attrsToRemove.push(attr.name);
      continue;
    }
    if (!isAllowedAttribute(attr.name)) {
      attrsToRemove.push(attr.name);
      continue;
    }
  }

  for (const attrName of attrsToRemove) {
    element.removeAttribute(attrName);
  }

  if (tagName === 'input') {
    const inputType = element.getAttribute('type')?.toLowerCase();
    if (inputType !== 'text' && inputType !== 'checkbox' && inputType !== 'radio') {
      element.setAttribute('type', 'text');
    }
    element.setAttribute('disabled', '');
  }

  if (tagName === 'img') {
    const src = element.getAttribute('src') ?? '';
    if (src.startsWith('http://') || src.startsWith('//')) {
      element.removeAttribute('src');
    }
  }

  for (const child of Array.from(element.children)) {
    sanitizeElement(child);
  }
}

export function sanitizeDom(rawHtml: string): string | null {
  if (rawHtml.length > MAX_DOM_SIZE) {
    logger.warn('libs.dom-sanitizer.size', `DOM exceeds max size: ${rawHtml.length}`);
    return null;
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, 'text/html');

    for (const child of Array.from(doc.body.children)) {
      sanitizeElement(child);
    }

    const result = doc.body.innerHTML.trim();
    if (!result) {
      return null;
    }

    return result;
  } catch (error) {
    logger.error('libs.dom-sanitizer.parse', 'Failed to parse DOM', error);
    return null;
  }
}

export function sanitizeStyle(rawCss: string): string | null {
  if (!rawCss.trim()) {
    return null;
  }

  let cleaned = rawCss;

  // Remove @keyframes blocks
  cleaned = cleaned.replace(/@keyframes\s+[\w-]+\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/giu, '');

  // Remove animation and transition properties
  for (const prop of ANIMATION_PROPERTIES) {
    const regex = new RegExp(`${prop}\\s*:[^;]+;?`, 'giu');
    cleaned = cleaned.replace(regex, '');
  }

  const result = cleaned.trim();
  if (!result) {
    return null;
  }

  return result;
}
