import { forwardRef, memo, useImperativeHandle, useState } from 'react';
import styles from './index.module.css';

export interface ToggleOptions {
  includeFullDom: boolean;
  includeCss: boolean;
  includeAnimationConfig: boolean;
}

export interface ToggleGroupRef {
  getOptions: () => ToggleOptions;
}

export const ToggleGroup = memo(
  forwardRef<ToggleGroupRef>((_, ref) => {
    const [includeFullDom, setIncludeFullDom] = useState(false);
    const [includeCss, setIncludeCss] = useState(false);
    const [includeAnimationConfig, setIncludeAnimationConfig] = useState(true);

    useImperativeHandle(ref, () => ({
      getOptions: () => ({ includeFullDom, includeCss, includeAnimationConfig }),
    }));

    return (
      <div className={styles.options}>
        <label className={styles.toggle} title="携带动画配置">
          <input
            type="checkbox"
            className={styles.toggleInput}
            checked={includeAnimationConfig}
            onChange={(e) => setIncludeAnimationConfig(e.target.checked)}
            aria-label="携带动画配置"
          />
          <span className={styles.toggleIcon}>
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M9.4 2.6L9.2 3.8C9.7 4 10.1 4.3 10.5 4.7L11.6 4.1L12.9 5.4L12.3 6.5C12.7 6.9 13 7.3 13.2 7.8L14.4 7.6V9.4L13.2 9.2C13 9.7 12.7 10.1 12.3 10.5L12.9 11.6L11.6 12.9L10.5 12.3C10.1 12.7 9.7 13 9.2 13.2L9.4 14.4H7.6L7.8 13.2C7.3 13 6.9 12.7 6.5 12.3L5.4 12.9L4.1 11.6L4.7 10.5C4.3 10.1 4 9.7 3.8 9.2L2.6 9.4V7.6L3.8 7.8C4 7.3 4.3 6.9 4.7 6.5L4.1 5.4L5.4 4.1L6.5 4.7C6.9 4.3 7.3 4 7.8 3.8L7.6 2.6H9.4Z"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="8.5" cy="8.5" r="2" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </span>
        </label>
        <label className={styles.toggle} title="携带全量 DOM">
          <input
            type="checkbox"
            className={styles.toggleInput}
            checked={includeFullDom}
            onChange={(e) => setIncludeFullDom(e.target.checked)}
            aria-label="携带全量 DOM"
          />
          <span className={styles.toggleIcon}>
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M4 5L1.5 8L4 11"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path d="M9 3L7 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path
                d="M12 5L14.5 8L12 11"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </label>
        <label className={styles.toggle} title="携带 CSS 样式">
          <input
            type="checkbox"
            className={styles.toggleInput}
            checked={includeCss}
            onChange={(e) => setIncludeCss(e.target.checked)}
            aria-label="携带 CSS 样式"
          />
          <span className={styles.toggleIcon}>
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <ellipse
                cx="8"
                cy="8"
                rx="6"
                ry="5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="5" cy="6" r="1" fill="currentColor" />
              <circle cx="8" cy="5" r="1" fill="currentColor" />
              <circle cx="11" cy="6" r="1" fill="currentColor" />
              <circle cx="7" cy="9" r="1" fill="currentColor" />
            </svg>
          </span>
        </label>
      </div>
    );
  }),
);

ToggleGroup.displayName = 'ToggleGroup';
