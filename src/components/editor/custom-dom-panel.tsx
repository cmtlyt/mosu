import { useState, useEffect } from 'react';
import { sanitizeDom, sanitizeStyle } from '@/libs/dom-sanitizer';
import styles from './custom-dom-panel.module.css';

interface CustomDomPanelProps {
  customDom: string | null;
  customStyle: string | null;
  onApply: (dom: string | null, style: string | null) => void;
}

export function CustomDomPanel({ customDom, customStyle, onApply }: CustomDomPanelProps) {
  const [domDraft, setDomDraft] = useState(customDom ?? '');
  const [styleDraft, setStyleDraft] = useState(customStyle ?? '');
  const [domError, setDomError] = useState<string | null>(null);
  const [styleError, setStyleError] = useState<string | null>(null);

  useEffect(() => {
    setDomDraft(customDom ?? '');
    setStyleDraft(customStyle ?? '');
    setDomError(null);
    setStyleError(null);
  }, [customDom, customStyle]);

  const handleApply = () => {
    let finalDom: string | null = null;
    let finalStyle: string | null = null;
    let hasError = false;

    if (domDraft.trim()) {
      const sanitized = sanitizeDom(domDraft);
      if (sanitized) {
        finalDom = sanitized;
        setDomError(null);
      } else {
        setDomError('DOM 包含不安全内容或格式无效');
        hasError = true;
      }
    } else {
      finalDom = null;
      setDomError(null);
    }

    if (styleDraft.trim()) {
      const sanitized = sanitizeStyle(styleDraft);
      if (sanitized) {
        finalStyle = sanitized;
        setStyleError(null);
      } else {
        setStyleError('样式包含动画属性或格式无效');
        hasError = true;
      }
    } else {
      finalStyle = null;
      setStyleError(null);
    }

    if (!hasError) {
      onApply(finalDom, finalStyle);
      setDomDraft(customDom ?? '');
      setStyleDraft(customStyle ?? '');
    }
  };

  const handleReset = () => {
    setDomDraft(customDom ?? '');
    setStyleDraft(customStyle ?? '');
    setDomError(null);
    setStyleError(null);
  };

  return (
    <div className={styles.customPanel}>
      <label className={styles.inputLabel} htmlFor="custom-dom">
        DOM
      </label>
      <textarea
        id="custom-dom"
        className={styles.textarea}
        rows={6}
        placeholder="输入自定义 HTML 结构..."
        aria-label="自定义 DOM 输入框"
        value={domDraft}
        onInput={(e) => setDomDraft((e.target as HTMLTextAreaElement).value)}
      />
      {domError && <p className={styles.errorText}>{domError}</p>}
      <label className={styles.inputLabel} htmlFor="custom-style">
        Style
      </label>
      <textarea
        id="custom-style"
        className={styles.textarea}
        rows={4}
        placeholder="输入自定义 CSS 样式（禁止动画属性）..."
        aria-label="自定义 Style 输入框"
        value={styleDraft}
        onInput={(e) => setStyleDraft((e.target as HTMLTextAreaElement).value)}
      />
      {styleError && <p className={styles.errorText}>{styleError}</p>}
      <div className={styles.inputActions}>
        <button type="button" className={styles.controlButton} onClick={handleApply}>
          应用
        </button>
        <button type="button" className={styles.controlButton} onClick={handleReset}>
          重置
        </button>
      </div>
    </div>
  );
}
