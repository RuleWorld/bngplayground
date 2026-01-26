import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
// cache bust
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(() => {
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      headers: {
        // Required for SharedArrayBuffer and WASM threading
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp'
      },
      proxy: {
        '/api/biomodels': {
          target: 'https://www.ebi.ac.uk/biomodels',
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/api\/biomodels/, ''),
          secure: false
        }
      }
    },
    base: '/bngplayground/',
    plugins: [react()],
    // Include WASM files as assets
    assetsInclude: ['**/*.wasm'],
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'scheduler',
        'react-is',
        'recharts',
        'cytoscape',
        'cytoscape-cose-bilkent',
        'd3',
        'antlr4ts',
        'antlr4ts/tree/AbstractParseTreeVisitor',
        'antlr4ts/atn/ATNDeserializer',
        'antlr4ts/Lexer',
        'antlr4ts/atn/LexerATNSimulator',
        'antlr4ts/VocabularyImpl',
        'antlr4ts/misc/Utils',
        'antlr4ts/atn/ATN',
        'antlr4ts/FailedPredicateException',
        'antlr4ts/NoViableAltException',
        'antlr4ts/Parser',
        'antlr4ts/ParserRuleContext',
        'antlr4ts/atn/ParserATNSimulator',
        'antlr4ts/RecognitionException',
        'antlr4ts/Token',
        'jsep'
      ],
      // Prevent Vite from pre-bundling the heavy transformers package for the dev server
      exclude: ['@xenova/transformers'],
      force: true
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        // Polyfill Node.js modules for ANTLR4 browser compatibility
        'util': 'util',
        'assert': 'assert',
        // Stub out 'fs' for browser/TensorFlow.js compatibility
        'fs': path.resolve(__dirname, 'src/shims/fs-shim.js'),
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
      rollupOptions: {
        external: ['module', '@xenova/transformers'],
      },
      // Keep standard minifier; explicit minifier selection avoids surprises
      minify: 'esbuild' as const
    },
    worker: {
      // Use ES module format for workers to support code-splitting
      format: 'es' as const
    },
    test: {
      environment: 'node',
      include: ['tests/**/*.spec.ts', 'tests/**/*.test.ts', 'tests/**/*.test.tsx'],
      setupFiles: ['./tests/setup.ts']
    },
    // Polyfill process for ANTLR4 browser/worker compatibility
    define: {
      'process.env': JSON.stringify({}),
      'process.platform': JSON.stringify('browser'),
      'process.version': JSON.stringify(''),
    }
  };
});