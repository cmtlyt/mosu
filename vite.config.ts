import { defineConfig, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react-oxc';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import { mosuPlugin } from './plugins/vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import packageJson from './package.json' with { type: 'json' };

const __dirname = dirname(fileURLToPath(import.meta.url));
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
      mosuPlugin({ serveStatic: false }),
    ],
    resolve: {
      tsconfigPaths: true,
    },
  };
}

function getCliConfig(): UserConfig {
  return {
    publicDir: false,
    build: {
      outDir: 'dist-cli',
      lib: {
        entry: resolve(__dirname, 'server/index.ts'),
        formats: ['es'],
        fileName: () => 'index.js',
      },
      rolldownOptions: {
        external: Object.keys(packageJson.dependencies),
      },
    },
  };
}

let config: UserConfig;
if (buildTarget === 'cli') {
  config = getCliConfig();
} else {
  config = getFrontendConfig();
}

export default defineConfig(config);
