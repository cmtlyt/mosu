# 整体架构

## 生产环境架构

```
┌─────────────────────────────────────────────────────┐
│                  mosu CLI (Node.js)                  │
│                                                     │
│  ┌─────────────────┐    ┌──────────────────────┐   │
│  │  Static Server   │    │     Agent API        │   │
│  │  (serve dist/)   │    │  /v1/* /mosu/*       │   │
│  │                  │    │                      │   │
│  │  GET / → SPA     │    │  POST /v1/chat/...   │   │
│  │  GET /assets/*   │    │  GET  /mosu/caps     │   │
│  │                  │    │  POST /mosu/tools/*   │   │
│  └─────────────────┘    └──────────────────────┘   │
│                                                     │
│  ┌───────────────────────────────────────────────┐ │
│  │         Configuration Layer                   │ │
│  │  CLI args > env vars > defaults               │ │
│  └───────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

## 开发环境架构

```
┌─────────────────────────────────────────────────────┐
│              Vite Dev Server (port 5173)             │
│                                                     │
│  ┌─────────────────┐    ┌──────────────────────┐   │
│  │  Frontend HMR   │    │  @hono/vite-dev-     │   │
│  │                 │    │  server              │   │
│  │  React + Router │    │                      │   │
│  └─────────────────┘    │  ┌────────────────┐  │   │
│                         │  │ Hono Server    │  │   │
│  /v1/* → proxy ─────────┼─▶│ (in-process)   │  │   │
│  /mosu/* → proxy ───────┼─▶│                │  │   │
│                         │  └────────────────┘  │   │
│                         └──────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

## 目录结构

```
mosu/
├── server/                    # 服务端代码（TypeScript）
│   ├── index.ts               # CLI 入口（#!/usr/bin/env node）
│   ├── config.ts              # 配置解析（CLI args + env vars）
│   ├── app.ts                 # Hono app 定义（OpenAPI Router）
│   ├── types.ts               # 类型定义（Env、RouteHandler）
│   ├── capabilities.ts        # 能力注册表
│   ├── routes/
│   │   ├── chat/              # Chat API 路由模块
│   │   │   ├── schema.ts      # Zod schema 定义
│   │   │   ├── routes.ts      # OpenAPI route 定义
│   │   │   ├── controller.ts  # 业务逻辑处理
│   │   │   └── index.ts       # 路由注册与导出
│   │   ├── capabilities/      # 能力检查路由模块
│   │   │   ├── schema.ts
│   │   │   ├── routes.ts
│   │   │   ├── controller.ts
│   │   │   └── index.ts
│   │   └── tools/             # 工具路由模块（预留）
│   │       └── index.ts
│   ├── prompts/
│   │   └── editor.ts          # 编辑器 AI system prompt（从前端迁移）
│   └── vite-plugin.ts         # Vite 插件（供生产环境其他开发服务器集成）
├── libs/                      # 项目通用库（前后端共享）
│   ├── logger.ts              # 通用 logger（同时注册 web 和 node adapter）
│   └── api-client.ts          # 同构 API client（从 OpenAPI schema 生成）
├── src/                       # 前端源码
│   └── ...
├── dist/                      # 前端构建产物（Vite 默认）
├── dist-cli/                  # CLI 服务构建产物
├── dist-npm/                  # SDK 构建产物（animation-sdk）
└── package.json
```

**删除**：

- `backend/` 目录（完全合并到 `server/`）
- `src/constants/ai.ts`（prompt 迁移到 `server/prompts/`，`MODEL_ID_MAP` 随 WebLLM 一起移除）
- `src/libs/logger.ts`（迁移到根目录 `libs/logger.ts`）
