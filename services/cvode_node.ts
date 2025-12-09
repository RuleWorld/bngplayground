/**
 * Node.js-compatible CVODE loader wrapper
 * 
 * This wrapper provides compatibility polyfills for running the CVODE WASM module
 * in Node.js ES module context where `require()` is not available.
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Make require available for the CVODE loader
const require = createRequire(import.meta.url);

// Provide a polyfill for the CVODE loader
if (typeof globalThis.require === 'undefined') {
  (globalThis as any).require = require;
}

// Path to cvode.wasm file
const wasmPath = join(__dirname, 'cvode.wasm');

// Create module config with locateFile for Node.js
const moduleConfig = {
  locateFile: (path: string) => {
    if (path.endsWith('.wasm')) {
      return wasmPath;
    }
    return join(__dirname, path);
  },
  // Pre-load the WASM binary for Node.js
  wasmBinary: undefined as Uint8Array | undefined,
};

// Try to pre-load the WASM binary
try {
  moduleConfig.wasmBinary = new Uint8Array(readFileSync(wasmPath));
} catch (e) {
  // Will use fetch-based loading in browser
}

// Re-export the CVODE module creation function
import createCVodeModuleBase from './cvode_loader.js';

export default async function createCVodeModule(config = {}): Promise<any> {
  return createCVodeModuleBase({
    ...moduleConfig,
    ...config,
  });
}

export { createCVodeModule };
