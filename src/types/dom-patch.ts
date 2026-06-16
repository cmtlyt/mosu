/**
 * DOM Patch 指令类型定义
 * AI 生成增量 DOM 变更时使用此结构，避免全量替换
 */

export type DomPatchOp = 'add' | 'remove' | 'replace' | 'attr' | 'text';

export interface DomPatchInstruction {
  /** 操作类型 */
  op: DomPatchOp;
  /** CSS 选择器，定位目标元素（remove/replace/attr/text 必填，add 时表示父容器） */
  selector: string;
  /** add/replace 时的 HTML 内容（需经过 sanitize） */
  html?: string;
  /** attr 操作时的属性名 */
  attrName?: string;
  /** attr 操作时的属性值，null 表示移除属性 */
  attrValue?: string | null;
  /** text 操作时的文本内容 */
  text?: string;
  /** add 操作时的插入位置，默认 append */
  position?: 'append' | 'prepend' | 'before' | 'after';
}
