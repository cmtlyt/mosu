import { build } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dts from 'vite-plugin-dts';
import packageJson from '../package.json' with { type: 'json' };

const __dirname = dirname(fileURLToPath(import.meta.url));

const external = Object.keys(packageJson.dependencies);

async function buildSdk() {
  await build({
    publicDir: false,
    build: {
      outDir: 'dist-npm/animation-sdk',
      lib: {
        entry: resolve(__dirname, '../libs/animation-sdk/index.ts'),
        name: 'MosuAnimationSDK',
        formats: ['es', 'cjs'],
        fileName: (format) => `animation-sdk.${format === 'es' ? 'mjs' : 'cjs'}`,
      },
      rolldownOptions: {
        external,
      },
    },
    plugins: [
      dts({
        outDir: 'dist-npm/animation-sdk',
        include: ['libs/animation-sdk/**/*'],
      }),
    ],
  });

  await build({
    publicDir: false,
    build: {
      outDir: 'dist-npm/api',
      lib: {
        entry: resolve(__dirname, '../libs/api-client.ts'),
        name: 'MosuApiClient',
        formats: ['es', 'cjs'],
        fileName: (format) => `api-client.${format === 'es' ? 'mjs' : 'cjs'}`,
      },
      rolldownOptions: {
        external,
      },
    },
    plugins: [
      dts({
        outDir: 'dist-npm/api',
        include: ['libs/api-client.ts'],
      }),
    ],
  });
}

buildSdk().catch((error) => {
  console.error('SDK build failed:', error);
  process.exit(1);
});
