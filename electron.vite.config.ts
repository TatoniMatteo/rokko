import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { figcraftPlugin } from './scripts/design/figcraft.mjs';
import { resolve } from 'node:path';

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: {
      input: { index: resolve('src/preload/index.ts'), notifications: resolve('src/preload/notifications.ts') },
      output: { format: 'cjs', entryFileNames: '[name].cjs' }
    } }
  },
  renderer: {
    root: 'src/renderer',
    plugins: [react(), figcraftPlugin()],
    resolve: { alias: { '@shared': resolve('src/shared') } }
  }
});
