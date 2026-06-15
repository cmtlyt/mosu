## 项目环境

1. **框架**: Preact 项目，通过 `@preact/preset-vite` 的 `reactAliasesEnabled: true` 配置兼容 React 生态工具
2. **路由**: @tanstack/react-router（自动生成路由树到 `./src/route-tree.gen.ts`）
3. **构建工具**: Vite 8.x + TypeScript 7.x (native-preview)
4. **包管理器**: pnpm >= 11
5. **Node 版本**: >= 22
6. **代码规范**: oxlint (lint) + oxfmt (格式化)，通过 lint-staged 在提交时自动执行
7. **路径别名**: `@/*` 映射到 `./src/*`（tsconfig paths + vite tsconfigPaths）
8. **JSX 配置**: `jsxImportSource: preact`，使用 `react-jsx` 转换模式
9. **AI 能力**: 集成 @mlc-ai/web-llm 用于浏览器端 LLM 推理
10. **日志库**: @cmtlyt/logger

## 开发规则

1. **永远不允许动我的工程化配置**
2. 每次修改完之后都要对对应文件执行 `pnpm fmt:check <filePath>` 和 `pnpm lint:fix <filePath>`
3. 所有日志都应该使用 `import { logger } from '@/libs/logger';` 导出的 logger
4. 所有跨模块路径优先使用 `@/` 开始, 例如routes中访问components就应该使用 `@/components/xxx`
5. 出了全局样式之外, 所有样式都应该使用module css
