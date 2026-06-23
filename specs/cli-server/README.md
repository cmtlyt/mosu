# Mosu CLI Server 架构设计文档

本目录包含 Mosu 项目从"纯前端 SPA + 可选后端代理"架构改造为 **CLI 一体化服务** 的完整设计文档。

## 文档结构

- [00-overview.md](./00-overview.md) — 概述、目标与非目标
- [01-architecture.md](./01-architecture.md) — 整体架构与目录结构
- [02-cli-design.md](./02-cli-design.md) — CLI 命令设计与配置
- [03-api-design.md](./03-api-design.md) — Agent API 路由设计
- [04-server-implementation.md](./04-server-implementation.md) — 服务端实现细节
- [05-dev-environment.md](./05-dev-environment.md) — 开发环境与 Vite 插件
- [06-frontend-adaptation.md](./06-frontend-adaptation.md) — 前端适配与 WebLLM 移除
- [07-logger.md](./07-logger.md) — Logger 统一与前后端共享
- [08-build-system.md](./08-build-system.md) — 多模块构建配置
- [09-dependencies.md](./09-dependencies.md) — 依赖优化与分类
- [10-implementation-steps.md](./10-implementation-steps.md) — 实施步骤与文件清单

## 核心变更

1. **移除 WebLLM**：AI 能力完全通过后端 API 提供
2. **Hono 框架**：使用 Hono 替代 Express
3. **开发环境集成**：使用 `@hono/vite-dev-server` 提供热更新
4. **多入口构建**：前端（dist/）、CLI（dist-cli/）、SDK（dist-npm/）
5. **Agent 能力体系**：统一 `/mosu/` 前缀，预留扩展接口
6. **Prompt 服务端化**：所有 AI prompt 从前端迁移到服务端
7. **Logger 统一**：前后端共享 logger
8. **依赖优化**：前端依赖移至 devDependencies

## 快速开始

阅读顺序建议：

1. 先阅读 [00-overview.md](./00-overview.md) 了解整体目标
2. 查看 [01-architecture.md](./01-architecture.md) 理解架构设计
3. 根据关注点选择对应的子文档深入阅读
4. 最后查看 [10-implementation-steps.md](./10-implementation-steps.md) 了解实施计划
