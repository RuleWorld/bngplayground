import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(() => {
  return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      base: '/bngplayground/',
      plugins: [react()],
      optimizeDeps: {
        include: [
          'react',
          'react-dom',
          'scheduler',
          'react-is',
          'recharts',
          'cytoscape',
          'cytoscape-cose-bilkent',
          'd3'
        ],
        force: true
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        },
        // Avoid duplicate React copies in the bundle
        dedupe: ['react', 'react-dom']
      },
      build: {
        // Ensure Rollup/Vite converts mixed CJS/UMD modules to ESM during the build
        commonjsOptions: {
          transformMixedEsModules: true,
          requireReturnsDefault: 'auto' as const
        },
        // Intentionally remove manualChunks to let Vite/Rollup decide chunking.
        // This prevents a brittle catch-all `vendor_misc` that can mix UMD wrappers
        // with ESM bundles and produce runtime `exports`/`n` undefined errors.
      },
      worker: {
        // Use ES module format for workers to support code-splitting
        format: 'es' as const
      },
      test: {
        environment: 'node',
        include: ['tests/**/*.spec.ts', 'tests/**/*.test.ts']
      }
    };
});