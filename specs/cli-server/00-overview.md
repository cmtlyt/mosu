# Mosu CLI Server 架构设计

## 概述

将 Mosu 从"纯前端 SPA + 可选后端代理"架构改造为 **CLI 一体化服务**。

## 目标

1. **一条命令启动完整服务**：`mosu` 命令同时启动前端页面和 AI API
2. **移除 WebLLM**：AI 能力完全通过后端 API 提供，不再依赖浏览器端推理
3. **统一技术栈**：服务端使用 TypeScript + Hono，与前端共享类型和工具
4. **开发体验优化**：开发环境通过 `@hono/vite-dev-server` 自动启动 backend
5. **多模块构建**：单次 Vite 构建同时产出前端页面、CLI 服务、SDK

## 非目标

- 不改变前端页面的核心功能和 UI
- 不修改动画编辑器的业务逻辑
- 不引入新的状态管理方案

## 核心变更

1. **移除 WebLLM**：删除 `@mlc-ai/web-llm` 依赖，AI 对话完全通过后端 API
2. **对话面板条件显示**：仅在配置了 backend URL 时显示对话面板
3. **Hono 框架**：使用 Hono 替代 Express，更轻量、TypeScript 友好
4. **开发环境集成**：使用 `@hono/vite-dev-server` 提供热更新
5. **多入口构建**：前端（dist/）、CLI（dist-cli/）、SDK（dist-npm/）
6. **Agent 能力体系**：统一 `/mosu/` 前缀，预留扩展接口
7. **Prompt 服务端化**：所有 AI prompt 从前端迁移到服务端
8. **Logger 统一**：前后端共享 logger，同时注册 web 和 node adapter
9. **依赖优化**：前端依赖移至 devDependencies，仅后端运行时依赖保留在 dependencies
