import type { AnimationConfig } from '@lib/animation-sdk';
import { dispatchEditorEvent, EDITOR_EVENTS } from '@/utils/editor/event-bus';
import styles from './index.module.css';

interface AnimationGuideProps {
  config: AnimationConfig;
}

function generateGuideContent(config: AnimationConfig): string {
  return `## 动画接入指南

### 1. 安装依赖

\`\`\`bash
npm install @cmtlyt/mosu
\`\`\`

### 2. 初始化 AnimationPlayer

\`\`\`typescript
import { AnimationPlayer } from '@cmtlyt/mosu/animation-sdk';

const player = new AnimationPlayer({
  autoPlay: true,
  playbackRate: 1,
});
\`\`\`

### 3. 应用动画配置

\`\`\`typescript
const config = ${JSON.stringify(config, null, 2)};

const container = document.querySelector('.animation-container');
const handles = player.apply(container, config);
\`\`\`

### 4. 事件监听

\`\`\`typescript
player.on('complete', () => {
  console.log('所有动画播放完成');
});

player.on('track-complete', ({ trackId }) => {
  console.log(\`轨道 \${trackId} 播放完成\`);
});

player.on('error', ({ trackId, error }) => {
  console.error(\`轨道 \${trackId} 播放失败:\`, error);
});
\`\`\`

### 5. 播放控制

\`\`\`typescript
player.playAll();      // 播放所有动画
player.pauseAll();     // 暂停所有动画
player.cancelAll();    // 取消并重置
player.replay();       // 重播
player.seek(500);      // 跳转到 500ms
\`\`\`

### 6. 销毁播放器

\`\`\`typescript
player.destroy();
\`\`\``;
}

export function AnimationGuide({ config }: AnimationGuideProps) {
  const guideContent = generateGuideContent(config);

  const handleCopy = () => {
    navigator.clipboard.writeText(guideContent).then(
      () => {
        dispatchEditorEvent(EDITOR_EVENTS.MESSAGE, { text: '文档已复制到剪贴板', type: 'success' });
      },
      () => {
        dispatchEditorEvent(EDITOR_EVENTS.MESSAGE, { text: '复制失败，请手动选择复制', type: 'error' });
      },
    );
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button type="button" className={styles.copyButton} onClick={handleCopy}>
          复制文档
        </button>
      </div>
      <pre className={styles.content}>
        <code>{guideContent}</code>
      </pre>
    </div>
  );
}
