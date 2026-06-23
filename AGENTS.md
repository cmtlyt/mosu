## 项目环境

1. **框架**: React 19 项目，使用 `@vitejs/plugin-react` 插件
2. **路由**: @tanstack/react-router（自动生成路由树到 `./src/route-tree.gen.ts`）
3. **构建工具**: Vite 8.x + TypeScript 7.x (native-preview)
4. **包管理器**: pnpm >= 11
5. **Node 版本**: >= 22
6. **代码规范**: oxlint (lint) + oxfmt (格式化)，通过 lint-staged 在提交时自动执行
7. **路径别名**: `@/*` 映射到 `./src/*`，`@lib/*` 映射到 `./libs/*`，`@mosu/*` 映射到 `./server/*`（tsconfig paths + vite tsconfigPaths）
8. **JSX 配置**: `jsxImportSource: react`，使用 `react-jsx` 转换模式
9. **AI 能力**: 通过后端 Hono 服务代理 AI API（`/mosu/api/v1/chat/completions`），前端仅通过 HTTP 调用
10. **日志库**: @cmtlyt/logger
11. **后端框架**: Hono（`@hono/zod-openapi` OpenAPI Router），代码位于 `server/` 目录

## 目录结构

- `libs/` — 前后端共享的通用模块（如 `logger.ts`、`animation-sdk/`、`api-client.ts`），通过 `@lib/*` 别名引用
- `server/` — 后端服务代码（Hono + OpenAPI Router），CLI 入口、路由、配置、prompt 等，通过 `@mosu/*` 别名引用
- `src/` — 前端代码（React 组件、hooks、路由、工具函数等）

## 开发规则

1. **永远不允许动我的工程化配置**
2. 每次修改完之后都要对对应文件执行 `pnpm fmt:check <filePath>` 和 `pnpm lint:fix <filePath>`
3. 所有日志都应该使用 `import { logger } from '@lib/logger';` 导出的 logger
4. 所有跨模块路径优先使用 `@/` 开始, 例如routes中访问components就应该使用 `@/components/xxx`；引用 `libs/` 下的模块使用 `@lib/` 别名；引用 `server/` 下的模块使用 `@mosu/` 别名
5. 出了全局样式之外, 所有样式都应该使用module css
6. 页面级样式文件统一放到 `src/styles/` 目录下, 组件级样式跟随组件文件
7. 文件和目录命名统一使用烤串命名法(kebab-case), 禁止使用驼峰命名
8. 通用组件样式永远跟随组件文件, 页面专属组件/hooks/libs/types 必须放到 `components/<page>/`、`hooks/<page>/`、`libs/<page>/`、`types/<page>/` 等对应页面目录下进行隔离
9. `libs/` 目录用于存放前后端共享的通用逻辑（如 logger、animation-sdk、api-client 等）；`src/utils/<page>/` 目录用于存放特定页面的辅助方法（如 editor 页面的 AI 响应处理逻辑）；`src/utils/` 根目录用于存放跨页面但与当前项目强绑定的工具逻辑（如 iframe-bridge）
10. logger 的第一个参数是 pointer（模块点分格式），用于唯一标识日志点位，格式为 `'page.module.comp.feature'`，例如 `'editor.ai.chat.stream'`
11. 必须修复所有类型错误，禁止提交带有 TypeScript 类型错误的代码
12. CSS 中使用 rem 单位替代 px（1rem = 1px），以下情况可保留 px：`border: 1px` 细线、`box-shadow` 阴影值、`transform` 变换值、根元素 `font-size: 1px` 基准值
13. 组件必须采用目录形式组织，目录名为组件名（kebab-case），`index.tsx` 作为组件统一导出文件，`index.module.css` 作为组件样式文件放在同一目录下
14. Hono 路由注册必须使用链式调用（如 `new OpenAPIHono<Env>().openapi(route1, handler1).openapi(route2, handler2)`），禁止分步调用（`router.openapi(...)` 后再 `router.openapi(...)`），否则会导致类型推导丢失
15. `server/routes/` 目录采用模块化组织：每个路由模块为一个独立目录（如 `chat/`、`capabilities/`、`tools/`），目录内细分为 `schema.ts`（Zod schema 定义）、`routes.ts`（OpenAPI route 定义）、`controller.ts`（业务逻辑处理函数）、`index.ts`（路由注册与导出）；必要时可添加 `service.ts`（复杂业务逻辑封装）。外部引用时直接使用 `./routes/<module>` 即可，无需修改导入路径。route 定义必须放在 `routes.ts` 中，禁止放在 `schema.ts` 中。在 `index.ts` 中导入 `routes.ts` 时必须使用 `import * as routes from './routes'` 的命名空间导入方式，然后通过 `routes.xxxRoute` 引用具体的 route 定义
