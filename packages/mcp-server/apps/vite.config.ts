import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const appsDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(appsDir, '..', '..', '..');

export default defineConfig({
  root: appsDir,
  base: './',
  plugins: [react(), viteSingleFile()],
  resolve: {
    alias: {
      // The reused contact-map component only needs escapeXml at runtime. Point
      // its engine import at the narrow utility to avoid bundling the simulator.
      '@bngplayground/engine': resolve(repositoryRoot, 'packages/engine/src/utils/xmlUtils.ts'),
      '@': repositoryRoot,
      fs: resolve(repositoryRoot, 'src/shims/fs-shim.js'),
    },
    dedupe: ['react', 'react-dom'],
  },
  build: {
    outDir: resolve(appsDir, '..', 'dist', 'apps'),
    emptyOutDir: false,
    cssCodeSplit: false,
    rollupOptions: {
      input: resolve(appsDir, 'bng-results.html'),
    },
  },
});
