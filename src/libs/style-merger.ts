/**
 * 将增量 CSS 合并到基础样式中。
 * 采用简单追加策略：新规则放在末尾，利用 CSS 层叠机制实现覆盖。
 * 若 base 为空，直接返回增量；若增量空，返回 base。
 */
export function mergeStyles(base: string | null, increment: string | null): string | null {
  if (!increment) {
    return base;
  }
  if (!base) {
    return increment;
  }
  return `${base}\n${increment}`;
}
