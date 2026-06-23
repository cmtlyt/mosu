# 多模块构建

## Vite 配置

修改 `vite.config.ts` 支持多入口构建。使用条件变量避免多个 `export default`：

```typescript
import { defineConfig, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react-oxc';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import { devServer } from '@hono/vite-dev-server';
import { resolve } from 'node:path';
import dts from 'vite-plugin-dts';

const buildTarget = process.env.MOSU_BUILD_TARGET;

function getFrontendConfig(): UserConfig {
  return {
    base: '/mosu/',
    plugins: [
      tanstackRouter({
        target: 'react',
        autoCodeSplitting: true,
        generatedRouteTree: './src/route-tree.gen.ts',
      }),
      react({}),
      devServer({
        entry: './server/app.ts',
        exclude: [/^\/(src|node_modules)\//],
      }),
    ],
    resolve: {
      tsconfigPaths: true,
    },
  };
}

function getCliConfig(): UserConfig {
  return {
    build: {
      outDir: 'dist-cli',
      lib: {
        entry: resolve(__dirname, 'server/index.ts'),
        formats: ['es'],
        fileName: () => 'index.js',
      },
    },
  };
}

function getSdkConfig(): UserConfig {
  return {
    build: {
      outDir: 'dist-npm',
      lib: {
        entry: resolve(__dirname, 'src/libs/animation-sdk/index.ts'),
        name: 'MosuAnimationSDK',
        formats: ['es', 'cjs'],
        fileName: (format) => `animation-sdk.${format === 'es' ? 'mjs' : 'cjs'}`,
      },
    },
    plugins: [
      dts({
        outDir: 'dist-npm',
        include: ['src/libs/animation-sdk/**/*', 'src/types/animation.ts'],
      }),
    ],
  };
}

let config: UserConfig;
if (buildTarget === 'cli') {
  config = getCliConfig();
} else if (buildTarget === 'sdk') {
  config = getSdkConfig();
} else {
  config = getFrontendConfig();
}

export default defineConfig(config);
```

## package.json scripts

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "build:cli": "MOSU_BUILD_TARGET=cli vite build",
    "build:sdk": "MOSU_BUILD_TARGET=sdk vite build",
    "build:all": "pnpm build && pnpm build:cli && pnpm build:sdk",
    "preview": "vite preview",
    "start": "node dist-cli/index.js"
  }
}
```
