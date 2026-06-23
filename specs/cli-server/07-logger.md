# Logger 统一

## 升级 `libs/logger.ts` 为项目通用模块

将 `src/libs/logger.ts` 迁移到根目录 `libs/logger.ts`，前后端共享。同时注册 web 和 node 的 outputAdapter，根据运行环境自动选择。

### 完整实现

```typescript
import { createLogger } from '@cmtlyt/logger';
import { webConsoleAdapter } from '@cmtlyt/logger/adapters/web';
import { nodeConsoleAdapter } from '@cmtlyt/logger/adapters/node';

interface ParsedData {
  type: string;
  pointer: string;
  message: string;
  otherMessage: unknown[];
}

type LoggerFn = (pointer: string, message: string, ...otherMessage: unknown[]) => void;

interface Logger {
  info: LoggerFn;
  warn: LoggerFn;
  error: (pointer: string, message: string, error: unknown, ...otherMessage: unknown[]) => void;
  debug: LoggerFn;
  appear: LoggerFn;
  event: LoggerFn;
}

const isNode = typeof process !== 'undefined' && process.versions?.node;

export const logger = createLogger<ParsedData>({
  enableOutput: true,
  transform(options) {
    const { type, messages } = options;
    const [pointer, message, ...otherMessage] = messages;
    return { type, pointer, message, otherMessage };
  },
  report() {},
  outputAdapters: [
    webConsoleAdapter({
      allowTypes: ['appear', 'event'],
      consoleLevel: 'debug',
      getSubTitle(options) {
        return options.transformData.pointer;
      },
      getMessages(options) {
        return options.messages.slice(1);
      },
    }),
    nodeConsoleAdapter({
      allowTypes: ['appear', 'event'],
      consoleLevel: 'debug',
      getSubTitle(options) {
        return options.transformData.pointer;
      },
      getMessages(options) {
        return options.messages.slice(1);
      },
    }),
  ],
}) as unknown as Logger;
```

## 使用方式

前端：

```typescript
import { logger } from '@lib/logger';
logger.info('editor.ai.chat', 'Chat started');
```

后端：

```typescript
import { logger } from '@lib/logger';
logger.info('server.chat.request', 'Chat request received');
```

**路径别名配置**：在 `tsconfig.json` 中添加 `@lib/logger` 到 `./libs/logger.ts` 的映射（Vite 8.x 通过 `tsconfigPaths` 自动读取，无需单独配置 alias）：

```json
// tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@lib/logger": ["./libs/logger.ts"]
    }
  }
}
```
