import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';

// https://vitejs.dev/config/
export default defineConfig({
  base: '/mosu/',
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      generatedRouteTree: './src/route-tree.gen.ts',
    }),
    preact({
      reactAliasesEnabled: true,
    }),
  ],
  resolve: {
    tsconfigPaths: true,
  },
});
