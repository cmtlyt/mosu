# 依赖优化

## 依赖分类原则

**生产依赖（dependencies）**：仅包含后端运行时必需的依赖

- `hono` — HTTP 框架
- `@hono/node-server` — Hono Node.js 适配器
- `@cmtlyt/logger` — 日志库（前后端共享）

**开发依赖（devDependencies）**：包含所有前端依赖和构建工具

- `react`、`react-dom` — 前端框架（打包进 dist/）
- `@tanstack/react-router` — 前端路由（打包进 dist/）
- `motion` — 前端动画库（打包进 dist/）
- `@cmtlyt/lingshu-toolkit` — 前端工具库（打包进 dist/）
- 所有构建工具、类型定义、代码规范工具

## package.json 变更

```json
{
  "name": "@cmtlyt/mosu",
  "version": "0.1.1",
  "type": "module",
  "bin": {
    "mosu": "./dist-cli/index.js"
  },
  "files": ["dist", "dist-cli", "dist-npm"],
  "exports": {
    "./animation-sdk": {
      "import": "./dist-npm/animation-sdk.mjs",
      "require": "./dist-npm/animation-sdk.cjs",
      "types": "./dist-npm/index.d.ts"
    }
  },
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "build:cli": "MOSU_BUILD_TARGET=cli vite build",
    "build:sdk": "MOSU_BUILD_TARGET=sdk vite build",
    "build:all": "pnpm build && pnpm build:cli && pnpm build:sdk",
    "preview": "vite preview",
    "start": "node dist-cli/index.js",
    "prepublishOnly": "pnpm build:all",
    "lint": "oxlint",
    "lint:github": "oxlint --format=github",
    "lint:fix": "oxlint --fix",
    "fmt": "oxfmt --no-error-on-unmatched-pattern",
    "fmt:check": "oxfmt --no-error-on-unmatched-pattern --check",
    "prepare": "husky"
  },
  "dependencies": {
    "@cmtlyt/logger": "^0.6.1",
    "@hono/node-server": "^2.0.5",
    "@hono/zod-openapi": "^1.4.0",
    "hono": "^4.12.26",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@cmtlyt/lingshu-toolkit": "^0.10.0",
    "@commitlint/cli": "^21.0.2",
    "@commitlint/config-conventional": "^21.0.2",
    "@hono/vite-dev-server": "^0.26.0",
    "@mlc-ai/web-llm": "^0.2.84",
    "@tanstack/react-router": "^1.170.15",
    "@tanstack/router-plugin": "^1.168.18",
    "@types/react": "^19.2.17",
    "@types/react-dom": "^19.2.3",
    "@typescript/native-preview": "7.0.0-dev.20260612.1",
    "@vitejs/plugin-react-oxc": "^0.4.3",
    "changelogithub": "^14.0.0",
    "husky": "^9.1.7",
    "lint-staged": "^17.0.7",
    "oxfmt": "^0.54.0",
    "oxlint": "^1.69.0",
    "react": "^19.2.7",
    "react-dom": "^19.2.7",
    "vite": "^8.0.16",
    "vite-plugin-dts": "^4.5.4"
  }
}
```

## 依赖变更说明

**移除的依赖**：

- `motion`（已不再使用）

**新增的依赖**：

- `hono@^4.12.26` — 生产依赖
- `@hono/node-server@^2.0.5` — 生产依赖
- `@hono/zod-openapi@^1.4.0` — 生产依赖（OpenAPI Router）
- `zod@^4.4.3` — 生产依赖（schema 验证）
- `@hono/vite-dev-server@^0.26.0` — 开发依赖（开发环境热更新）

**移动的依赖**（从 dependencies 移到 devDependencies）：

- `@cmtlyt/lingshu-toolkit`
- `@tanstack/react-router`
- `react`
- `react-dom`
