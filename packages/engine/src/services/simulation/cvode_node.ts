import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

type CvodeLoader = (moduleArg?: unknown) => Promise<unknown>;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

const wasmPath = resolve(process.cwd(), 'public', 'cvode.wasm');
const loaderPath = resolve(process.cwd(), 'services', 'cvode_loader.js');

let cachedLoader: CvodeLoader | null = null;

function installNodePolyfills() {
  const g = globalThis as unknown as Record<string, unknown>;
  if (!g.require) g.require = require;
  if (!g.__filename) g.__filename = __filename;
  if (!g.__dirname) g.__dirname = __dirname;
}

export const createCVodeModule: CvodeLoader = async (moduleArg?: unknown) => {
  installNodePolyfills();

  if (!cachedLoader) {
    const moduleObj: { exports: unknown } = { exports: {} };
    const exportsObj: Record<string, unknown> = {};
    const source = readFileSync(loaderPath, 'utf8');
    const script = new vm.Script(source, { filename: loaderPath });
    const context = vm.createContext({
      module: moduleObj,
      exports: exportsObj,
      require,
      __filename: loaderPath,
      __dirname: dirname(loaderPath),
      process,
      console,
      URL,
      WebAssembly,
      setTimeout,
      clearTimeout,
      fetch: (globalThis as Record<string, unknown>).fetch,
      TextDecoder,
      globalThis,
    });
    script.runInContext(context);
    const candidate =
      (moduleObj.exports as Record<string, unknown>)?.default ?? moduleObj.exports;
    if (typeof candidate !== 'function') {
      throw new Error('Failed to resolve CVODE loader from services/cvode_loader.js');
    }
    cachedLoader = candidate as CvodeLoader;
  }

  if (!cachedLoader) {
    throw new Error('Failed to resolve CVODE loader from services/cvode_loader.js');
  }

  const config = {
    ...(typeof moduleArg === 'object' && moduleArg ? (moduleArg as Record<string, unknown>) : {}),
    locateFile: (path: string) => {
      if (path.endsWith('.wasm')) return wasmPath;
      if (typeof (moduleArg as any)?.locateFile === 'function') {
        return (moduleArg as any).locateFile(path);
      }
      return resolve(process.cwd(), path);
    },
  } as Record<string, unknown>;

  try {
    config.wasmBinary = new Uint8Array(readFileSync(wasmPath));
  } catch {
    // Fallback to locateFile-based loading.
  }

  return await cachedLoader(config);
};

export default createCVodeModule;
