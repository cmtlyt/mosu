import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-oxc';
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
    react({}),
  ],
  resolve: {
    tsconfigPaths: true,
  },
});
