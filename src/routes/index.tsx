import { createFileRoute, Link } from '@tanstack/react-router';
import styles from '@/styles/home.module.css';

function RouteComponent() {
  return (
    <div className={styles.homePage}>
      {/* 动态背景 */}
      <div className={styles.gridBackground} />
      <div className={styles.floatingOrbs}>
        <div className={`${styles.orb} ${styles.orb1}`} />
        <div className={`${styles.orb} ${styles.orb2}`} />
        <div className={`${styles.orb} ${styles.orb3}`} />
      </div>

      {/* 主内容 */}
      <div className={styles.content}>
        {/* Hero 区域 */}
        <section className={styles.hero}>
          <h1 className={styles.logo}>Mosu</h1>
          <p className={styles.tagline}>AI 驱动的动画编辑器</p>
          <p className={styles.subtitle}>
            用自然语言描述你的创意，让 AI 帮你实现炫酷的动画效果。实时预览、版本控制、一键分享，创作从未如此简单。
          </p>
          <Link to="/editor" className={styles.ctaButton}>
            <span>开始创作</span>
            <span className={styles.ctaIcon}>→</span>
          </Link>
        </section>

        {/* 核心特性 */}
        <section className={styles.features}>
          <div className={styles.featureCard}>
            <span className={styles.featureIcon}>🤖</span>
            <h3 className={styles.featureTitle}>AI 智能创作</h3>
            <p className={styles.featureDescription}>
              基于 WebLLM 的浏览器端 AI 推理，用自然语言描述动画效果，AI 自动生成动画配置和代码。
            </p>
          </div>

          <div className={styles.featureCard}>
            <span className={styles.featureIcon}>⚡</span>
            <h3 className={styles.featureTitle}>实时预览</h3>
            <p className={styles.featureDescription}>
              所见即所得的编辑体验，实时预览动画效果，支持自定义 DOM 和样式，即时看到修改结果。
            </p>
          </div>

          <div className={styles.featureCard}>
            <span className={styles.featureIcon}>🌳</span>
            <h3 className={styles.featureTitle}>版本树管理</h3>
            <p className={styles.featureDescription}>
              智能版本控制系统，支持分支创建、节点切换、历史回溯，轻松管理和比较不同版本的动画效果。
            </p>
          </div>

          <div className={styles.featureCard}>
            <span className={styles.featureIcon}>🔗</span>
            <h3 className={styles.featureTitle}>一键分享</h3>
            <p className={styles.featureDescription}>
              生成分享链接，将你的动画作品分享给他人。支持配置导入导出，方便团队协作和灵感复用。
            </p>
          </div>
        </section>

        {/* 演示区域 */}
        <section className={styles.demo}>
          <h2 className={styles.demoTitle}>工作流程</h2>
          <p className={styles.demoSubtitle}>简单三步，创作专业级动画</p>

          <div className={styles.demoWindow}>
            <div className={styles.demoDots}>
              <div className={styles.demoDot} />
              <div className={styles.demoDot} />
              <div className={styles.demoDot} />
            </div>

            <div className={styles.demoContent}>
              <div className={styles.demoPanel}>
                <div className={styles.demoPanelTitle}>💬 AI 对话</div>
                <div className={styles.demoChatMessage}>帮我创建一个旋转缩放的动画效果，持续 2 秒，循环播放</div>
                <div className={styles.demoChatMessage}>✨ 已生成动画配置，请查看预览效果</div>
              </div>

              <div className={styles.demoPanel}>
                <div className={styles.demoPanelTitle}>👁️ 实时预览</div>
                <div className={styles.demoPreview}>
                  <div className={styles.demoAnimation} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 技术栈 */}
        <section className={styles.techStack}>
          <h2 className={styles.techStackTitle}>技术栈</h2>
          <div className={styles.techGrid}>
            <div className={styles.techItem}>React 19</div>
            <div className={styles.techItem}>TypeScript</div>
            <div className={styles.techItem}>Vite</div>
            <div className={styles.techItem}>WebLLM</div>
            <div className={styles.techItem}>TanStack Router</div>
            <div className={styles.techItem}>CSS Modules</div>
          </div>
        </section>

        {/* 页脚 */}
        <footer className={styles.footer}>
          <p>
            Built with ❤️ by{' '}
            <a href="https://github.com/cmtlyt" className={styles.footerLink}>
              cmtlyt
            </a>
          </p>
          <p style={{ marginTop: '8px', fontSize: '12px' }}>Powered by WebLLM · 浏览器端 AI 推理</p>
        </footer>
      </div>
    </div>
  );
}

export const Route = createFileRoute('/')({
  component: RouteComponent,
});
