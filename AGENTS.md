## 项目环境

1. **框架**: React 19 项目，使用 `@vitejs/plugin-react` 插件
2. **路由**: @tanstack/react-router（自动生成路由树到 `./src/route-tree.gen.ts`）
3. **构建工具**: Vite 8.x + TypeScript 7.x (native-preview)
4. **包管理器**: pnpm >= 11
5. **Node 版本**: >= 22
6. **代码规范**: oxlint (lint) + oxfmt (格式化)，通过 lint-staged 在提交时自动执行
7. **路径别名**: `@/*` 映射到 `./src/*`（tsconfig paths + vite tsconfigPaths）
8. **JSX 配置**: `jsxImportSource: react`，使用 `react-jsx` 转换模式
9. **AI 能力**: 集成 @mlc-ai/web-llm 用于浏览器端 LLM 推理
10. **日志库**: @cmtlyt/logger

## 开发规则

1. **永远不允许动我的工程化配置**
2. 每次修改完之后都要对对应文件执行 `pnpm fmt:check <filePath>` 和 `pnpm lint:fix <filePath>`
3. 所有日志都应该使用 `import { logger } from '@/libs/logger';` 导出的 logger
4. 所有跨模块路径优先使用 `@/` 开始, 例如routes中访问components就应该使用 `@/components/xxx`
5. 出了全局样式之外, 所有样式都应该使用module css
6. 页面级样式文件统一放到 `src/styles/` 目录下, 组件级样式跟随组件文件
7. 文件和目录命名统一使用烤串命名法(kebab-case), 禁止使用驼峰命名
8. 通用组件样式永远跟随组件文件, 页面专属组件/hooks/libs/types 必须放到 `components/<page>/`、`hooks/<page>/`、`libs/<page>/`、`types/<page>/` 等对应页面目录下进行隔离
9. `src/libs/` 目录用于存放与业务逻辑无关、可被任意项目引入和复用的通用逻辑（如 dom-sanitizer、animation-patcher 等）；`src/utils/<page>/` 目录用于存放特定页面的辅助方法（如 editor 页面的 AI 响应处理逻辑）；`src/utils/` 根目录用于存放跨页面但与当前项目强绑定的工具逻辑（如 iframe-bridge）
10. logger 的第一个参数是 pointer（模块点分格式），用于唯一标识日志点位，格式为 `'page.module.comp.feature'`，例如 `'editor.ai.chat.stream'`
11. 必须修复所有类型错误，禁止提交带有 TypeScript 类型错误的代码
12. CSS 中使用 rem 单位替代 px（1rem = 1px），以下情况可保留 px：`border: 1px` 细线、`box-shadow` 阴影值、`transform` 变换值、根元素 `font-size: 1px` 基准值
