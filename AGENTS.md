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

- `libs/` — 前后端共享的通用模块（logger、animation-sdk、api-client 等）
- `server/` — 后端服务代码（Hono + OpenAPI Router），包含 CLI 入口、路由、配置、prompt 等
- `src/` — 前端代码（React 组件、hooks、路由、工具函数等）

## 开发规则

### 🚫 禁止事项

1. **禁止修改工程化配置**（Vite、TypeScript、ESLint 等配置文件）
2. **禁止跨端引入**：`server/` 不得从 `src/` 引入，`src/` 不得从 `server/` 引入。共享类型必须放在 `libs/types/` 下，通过 `@lib/types/*` 引用
3. **禁止使用原生 fetch**：前端必须通过 `@/utils/api-client` 的 `apiClient` 调用后端 API（该模块基于 `@lib/api-client` 封装，支持动态 base URL）
4. **禁止提交带类型错误的代码**：必须修复所有 TypeScript 类型错误

### 📁 目录与文件组织

1. **路径别名优先级**：
   - 跨模块引用使用 `@/`（如 `@/components/xxx`）
   - 引用 `libs/` 使用 `@lib/`
   - 引用 `server/` 使用 `@mosu/`

2. **目录职责**：
   - `libs/`：前后端共享的通用逻辑（logger、animation-sdk、api-client 等）
   - `src/utils/<page>/`：特定页面的辅助方法
   - `src/utils/`：跨页面但与项目强绑定的工具逻辑（如 dom-patcher、animation-patcher、style-merger、dom-sanitizer）
   - `server/routes/<module>/`：模块化路由（schema.ts、routes.ts、controller.ts、index.ts）

3. **组件组织**：
   - 必须采用目录形式：`component-name/index.tsx` + `index.module.css`
   - 通用组件样式跟随组件文件
   - 页面专属组件/hooks/libs/types 必须放到对应页面目录下隔离（如 `components/<page>/`）

4. **样式文件**：
   - 页面级样式：`src/styles/`
   - 组件级样式：跟随组件文件
   - 除全局样式外，所有样式使用 Module CSS

### 📝 命名与格式

1. **文件/目录命名**：统一使用 kebab-case（烤串命名法），禁止驼峰命名
2. **CSS 单位**：使用 rem（1rem = 1px），以下情况可保留 px：
   - `border: 1px` 细线
   - `box-shadow` 阴影值
   - `transform` 变换值
   - 根元素 `font-size: 1px` 基准值

### 🔧 代码规范

1. **日志规范**：
   - 使用 `import { logger } from '@lib/logger';`
   - 第一个参数为 pointer（模块点分格式）：`'page.module.comp.feature'`
   - 示例：`'editor.ai.chat.stream'`

2. **Hono 路由规范**：
   - 必须使用链式调用：`new OpenAPIHono<Env>().openapi(route1, handler1).openapi(route2, handler2)`
   - 禁止分步调用（会导致类型推导丢失）
   - route 定义必须放在 `routes.ts`，禁止放在 `schema.ts`
   - 所有模块内引用必须使用命名空间导入：
     - `index.ts`：`import * as routes from './routes'`、`import * as controller from './controller'`
     - `routes.ts`：`import * as schema from './schema'`
   - 通过命名空间引用具体内容（如 `routes.chatRoute`、`controller.handleChatCompletion`、`schema.ChatCompletionRequestSchema`）

3. **Service 规范**：
   - 优先通过函数提供服务
   - 如需初始化，提供 `setup` 方法（如 `setupLLMService`）
   - 通过 `server/services/index.ts` 统一导出和初始化
   - 使用命名空间导出：`export * as llmService from './llm-service'`

4. **API 路径规范**：
   - 自定义 API 禁止使用版本号（如 `/v1/editor/chat`）
   - 使用语义化路径（如 `/editor/chat`）
   - 例外：代理外部 API 时保留原始路径（如 `/v1/chat/completions`）

5. **类型推断**：
   - 请求/响应类型从 apiClient 推断：`InferRequest<typeof apiClient.xxx.$post>['json']`
   - 禁止手动定义或从公共类型空间引入

### ✅ 质量保障

1. **每次修改后执行**：
   - `pnpm fmt:check <filePath>`（格式检查）
   - `pnpm lint:fix <filePath>`（lint 修复）
