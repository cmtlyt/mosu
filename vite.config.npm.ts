import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    outDir: 'dist-npm',
    lib: {
      entry: resolve(__dirname, 'src/libs/animation-sdk/index.ts'),
      name: 'MosuAnimationSDK',
      formats: ['es', 'cjs'],
      fileName: (format) => `animation-sdk.${format === 'es' ? 'mjs' : 'cjs'}`,
    },
    rollupOptions: {
      external: ['@cmtlyt/logger'],
    },
  },
  plugins: [
    dts({
      outDir: 'dist-npm',
      include: ['src/libs/animation-sdk/**/*', 'src/types/animation.ts'],
    }),
  ],
});
