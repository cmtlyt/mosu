import type { AnimationConfig } from '@/types/animation';
import type { PresetTemplate } from '@/constants/templates';
import { PreviewCanvas } from '@/components/preview/preview-canvas';
import styles from './preview-panel.module.css';

interface PreviewPanelProps {
  config: AnimationConfig;
  template: PresetTemplate;
}

export function PreviewPanel({ config, template }: PreviewPanelProps) {
  return (
    <div className={styles.previewPanel}>
      <div className={styles.header}>Preview</div>
      <PreviewCanvas config={config} template={template} />
    </div>
  );
}
