# CLI 设计

## 命令格式

```bash
mosu [options]
```

## 选项

| 选项                  | 环境变量           | 默认值    | 说明                     |
| --------------------- | ------------------ | --------- | ------------------------ |
| `-p, --port <number>` | `MOSU_PORT`        | `3000`    | 服务端口                 |
| `--host <string>`     | `MOSU_HOST`        | `0.0.0.0` | 服务主机                 |
| `--ai-base-url <url>` | `MOSU_AI_BASE_URL` | `""`      | 上游 AI API 地址（必需） |
| `--ai-model <string>` | `MOSU_AI_MODEL`    | `""`      | AI 模型名称              |
| `--ai-api-key <key>`  | `MOSU_AI_API_KEY`  | `""`      | AI API 密钥（必需）      |
| `-v, --version`       | -                  | -         | 显示版本号               |
| `-h, --help`          | -                  | -         | 显示帮助信息             |

## 优先级

CLI 参数 > 环境变量 > 默认值

## 使用示例

```bash
# 基础启动
mosu --ai-base-url https://api.openai.com --ai-api-key sk-xxx

# 指定端口和主机
mosu -p 8080 --host 127.0.0.1 --ai-base-url https://api.openai.com --ai-api-key sk-xxx

# 使用环境变量
MOSU_AI_BASE_URL=https://api.openai.com MOSU_AI_API_KEY=sk-xxx mosu

# 查看版本
mosu -v

# 查看帮助
mosu -h
```

## 启动流程

1. 解析 CLI 参数和环境变量
2. 验证必需配置（`ai-base-url` 和 `ai-api-key`）
3. 创建 Hono app 实例
4. 启动 HTTP 服务器
5. 显示启动日志（仅 CLI 模式，开发模式不显示）
