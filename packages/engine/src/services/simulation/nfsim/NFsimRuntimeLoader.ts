export interface NFsimModule {
  run?: (xml: string, options?: Record<string, unknown>) => Promise<string> | string;
  runNFsim?: (xml: string, options?: Record<string, unknown>) => string;
  resetNFsim?: () => void;
  reset?: () => void;
  ABORT?: boolean;
  EXITSTATUS?: number;
  print?: (s: string) => void;
  printErr?: (s: string) => void;
  FS?: {
    writeFile: (path: string, data: string | ArrayBufferView, opts?: Record<string, unknown>) => void;
    readFile: (path: string, opts?: Record<string, unknown>) => string | Uint8Array;
    unlink: (path: string) => void;
  };
  callMain?: (args: string[]) => void;
}

export type NFsimModuleFactory = (options?: Record<string, unknown>) => Promise<NFsimModule> | NFsimModule;

export type NFsimRuntime = {
  run: (xml: string, options: Record<string, unknown>) => Promise<string> | string;
  reset?: () => void;
};

export interface NFsimOptions extends Record<string, unknown> {
  progressCallback?: (msg: string) => void;
  modelName?: string;
  xmlPath?: string;
  outputPath?: string;
  t_end?: number;
  n_steps?: number;
  seed?: number;
  cb?: boolean;
  speciesPath?: string;
  verbose?: boolean;
}

export interface NFsimModuleExports {
  default?: NFsimModuleFactory;
  createNFsimModule?: NFsimModuleFactory;
  NFsimModule?: NFsimModuleFactory;
}

interface HTMLScriptElementLike {
  src: string;
  onload: (() => void) | null;
  onerror: (() => void) | null;
}

interface DocumentLike {
  createElement(tagName: 'script'): HTMLScriptElementLike;
  head: {
    appendChild(node: HTMLScriptElementLike): void;
  };
}

declare global {
  var __nfsimRuntime: NFsimRuntime | undefined;
  var __nfsimModuleUrl: string | undefined;
  var __nfsimWasmUrl: string | undefined;
  var __nfsimModuleFactory: NFsimModuleFactory | undefined;
  var createNFsimModule: NFsimModuleFactory | undefined;
  var Module: Record<string, unknown> | undefined;
}

const getGlobalRuntime = (): NFsimRuntime | null => {
  return globalThis.__nfsimRuntime ?? null;
};

const setGlobalRuntime = (runtime: NFsimRuntime): void => {
  globalThis.__nfsimRuntime = runtime;
};

const getRuntimeHints = () => {
  return {
    moduleUrl: globalThis.__nfsimModuleUrl,
    wasmUrl: globalThis.__nfsimWasmUrl,
    factory: globalThis.__nfsimModuleFactory
  };
};

const createRuntimeFromModule = (module: NFsimModule | null | undefined): NFsimRuntime | null => {
  if (!module) return null;

  // Priority 1: runNFsim wrapper (provided by nfsim.js – includes all arg handling,
  // ExitStatus wrapping, -utl, error checks, etc.).  Use this before falling back to
  // raw FS + callMain so we don't re-implement the same logic with missing pieces.
  const runNFsimFn = module.runNFsim;
  if (typeof runNFsimFn === 'function') {
    const run = (xml: string, options: Record<string, unknown> = {}) => {
      if (typeof xml !== 'string') {
        throw new Error('NFsim run expects XML text input.');
      }
      const opts = options as NFsimOptions;
      const progressCb = opts.progressCallback;

      // Wire module.print/printErr to the progress callback so NFsim stdout is forwarded.
      let oldPrint: ((s: string) => void) | undefined;
      let oldPrintErr: ((s: string) => void) | undefined;
      if (progressCb) {
        if (typeof module.print === 'function') {
          oldPrint = module.print.bind(module);
          module.print = (s: string) => { try { progressCb(String(s)); } catch { /* ignore */ } try { oldPrint?.(s); } catch { /* ignore */ } };
        }
        if (typeof module.printErr === 'function') {
          oldPrintErr = module.printErr.bind(module);
          module.printErr = (s: string) => { try { progressCb(String(s)); } catch { /* ignore */ } try { oldPrintErr?.(s); } catch { /* ignore */ } };
        }
      }

      try {
        // Reset ABORT/EXITSTATUS so the module can be reused across multiple simulations.
        module.ABORT = false;
        module.EXITSTATUS = 0;
        return runNFsimFn(xml, opts);
      } finally {
        if (progressCb) {
          if (oldPrint) module.print = oldPrint;
          if (oldPrintErr) module.printErr = oldPrintErr;
        }
      }
    };
    const resetNFsimFn = module.resetNFsim;
    const resetFn = module.reset;
    const reset = typeof resetNFsimFn === 'function'
      ? resetNFsimFn.bind(module)
      : (typeof resetFn === 'function' ? resetFn.bind(module) : undefined);
    return { run, reset };
  }

  const fs = module.FS;
  const callMain = module.callMain;
  const hasFs = fs && typeof fs.writeFile === 'function' && typeof fs.readFile === 'function';
  const hasCallMain = typeof callMain === 'function';

  if (fs && hasFs && callMain && hasCallMain) {
    const run = (xml: string, options: Record<string, unknown> = {}) => {
      if (typeof xml !== 'string') {
        throw new Error('NFsim run expects XML text input.');
      }
      const opts = options as NFsimOptions;
      const progressCb = opts.progressCallback;
      const modelName = opts.modelName || 'model';
      const xmlPath = opts.xmlPath || `/${modelName}.xml`;
      const outPath = opts.outputPath || `/${modelName}.gdat`;

      try {
        fs.unlink(xmlPath);
      } catch {
        // ignore
      }
      try {
        fs.unlink(outPath);
      } catch {
        // ignore
      }

      // If the module honors Module.print/printErr, temporarily wire them to the supplied progress callback
      let oldPrint: ((s: string) => void) | undefined;
      let oldPrintErr: ((s: string) => void) | undefined;
      let origConsoleLog: typeof console.log | undefined;
      let origConsoleError: typeof console.error | undefined;

      if (progressCb) {
        if (typeof module.print === 'function') {
          oldPrint = module.print.bind(module);
          module.print = (s: string) => {
            try {
              progressCb(String(s));
            } catch {
              /* ignore */
            }
            try {
              oldPrint?.(s);
            } catch {
              /* ignore */
            }
          };
        }
        if (typeof module.printErr === 'function') {
          oldPrintErr = module.printErr.bind(module);
          module.printErr = (s: string) => {
            try {
              progressCb(String(s));
            } catch {
              /* ignore */
            }
            try {
              oldPrintErr?.(s);
            } catch {
              /* ignore */
            }
          };
        }

        // Also wrap global console so modules that use console.log still emit progress
        origConsoleLog = console.log;
        origConsoleError = console.error;
        console.log = (...args: Parameters<typeof console.log>) => {
          try {
            progressCb(args.map(String).join(' '));
          } catch {
            /* ignore */
          }
          origConsoleLog?.(...args);
        };
        console.error = (...args: Parameters<typeof console.error>) => {
          try {
            progressCb(args.map(String).join(' '));
          } catch {
            /* ignore */
          }
          origConsoleError?.(...args);
        };
      }

      fs.writeFile(xmlPath, xml);

      const args: string[] = ['-xml', xmlPath, '-o', outPath];
      if (opts.t_end !== undefined) {
        args.push('-sim', String(opts.t_end));
      }
      if (opts.n_steps !== undefined) {
        args.push('-oSteps', String(opts.n_steps));
      }
      if (opts.seed !== undefined) {
        args.push('-seed', String(opts.seed));
      }
      if (opts.cb) {
        args.push('-cb');
      }
      if (opts.speciesPath) {
        args.push('-ss', String(opts.speciesPath));
      }
      if (opts.verbose) {
        args.push('-v');
      }

      // Reset ABORT flag and EXITSTATUS before each callMain to allow reuse of the same Emscripten module
      // if it was previously halted or exited.
      module.ABORT = false;
      module.EXITSTATUS = 0;
      // Some Emscripten versions use NO_EXIT_RUNTIME but may still set this
      const resetFn = module.reset;
      if (typeof resetFn === 'function') {
        try {
          resetFn();
        } catch (e) {
          console.warn('[NFsimRuntimeLoader] module.reset() failed', e);
        }
      }

      let callMainError: unknown = null;
      try {
        callMain(args);
      } catch (e: unknown) {
        // Emscripten throws ExitStatus (an object with a `status` property) when the
        // process exits – even on clean exit (status 0).  Treat status-0 as success and
        // fall through so we can read the output file.  Any other value is a real error.
        const isExitStatus = e != null && typeof e === 'object' && 'status' in e && typeof (e as { status: unknown }).status === 'number';
        if (isExitStatus) {
          const code = (e as { status: number }).status;
          if (code !== 0) {
            callMainError = new Error(`NFsim exited with code ${code}`);
          }
          // code === 0 → successful exit, callMainError stays null
        } else {
          callMainError = e;
        }
      } finally {
        // restore wrapped functions
        if (progressCb) {
          if (oldPrint) module.print = oldPrint;
          if (oldPrintErr) module.printErr = oldPrintErr;
          if (origConsoleLog) console.log = origConsoleLog;
          if (origConsoleError) console.error = origConsoleError;
        }
      }

      if (callMainError != null) {
        throw callMainError;
      }

      const output = fs.readFile(outPath, { encoding: 'utf8' });
      return typeof output === 'string' ? output : String(output);
    };

    const resetFn = module.reset;
    return { run, reset: typeof resetFn === 'function' ? resetFn.bind(module) : undefined };
  }

  const moduleRun = module.run;
  if (typeof moduleRun === 'function') {
    const run = (xml: string, options: Record<string, unknown> = {}) => {
      const opts = options as NFsimOptions;
      const progressCb = opts.progressCallback;
      let origConsoleLog: typeof console.log | undefined;
      let origConsoleError: typeof console.error | undefined;
      if (progressCb) {
        origConsoleLog = console.log;
        origConsoleError = console.error;
        console.log = (...args: Parameters<typeof console.log>) => {
          try { progressCb(args.map(String).join(' ')); } catch { /* ignore */ }
          origConsoleLog?.(...args);
        };
        console.error = (...args: Parameters<typeof console.error>) => {
          try { progressCb(args.map(String).join(' ')); } catch { /* ignore */ }
          origConsoleError?.(...args);
        };
      }
      try {
        return moduleRun(xml, options);
      } finally {
        if (progressCb) {
          if (origConsoleLog) console.log = origConsoleLog;
          if (origConsoleError) console.error = origConsoleError;
        }
      }
    };
    const resetFn = module.reset;
    return { run, reset: typeof resetFn === 'function' ? resetFn.bind(module) : undefined };
  }

  const runNFsimFn2 = module.runNFsim;
  if (typeof runNFsimFn2 === 'function') {
    const run = (xml: string, options: Record<string, unknown> = {}) => {
      const opts = options as NFsimOptions;
      const progressCb = opts.progressCallback;
      let origConsoleLog: typeof console.log | undefined;
      let origConsoleError: typeof console.error | undefined;
      if (progressCb) {
        origConsoleLog = console.log;
        origConsoleError = console.error;
        console.log = (...args: Parameters<typeof console.log>) => {
          try { progressCb(args.map(String).join(' ')); } catch { /* ignore */ }
          origConsoleLog?.(...args);
        };
        console.error = (...args: Parameters<typeof console.error>) => {
          try { progressCb(args.map(String).join(' ')); } catch { /* ignore */ }
          origConsoleError?.(...args);
        };
      }
      try {
        return runNFsimFn2(xml, options);
      } finally {
        if (progressCb) {
          if (origConsoleLog) console.log = origConsoleLog;
          if (origConsoleError) console.error = origConsoleError;
        }
      }
    };
    const resetFn = module.reset;
    return { run, reset: typeof resetFn === 'function' ? resetFn.bind(module) : undefined };
  }

  return null;
};

const importModuleFromUrl = async (url: string): Promise<NFsimModuleExports> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to download NFsim module from ${url} (HTTP ${response.status}). ` +
      'Ensure the NFsim JS/WASM files are deployed at the expected location. ' +
      'Check your server configuration and network connectivity.'
    );
  }
  const text = await response.text();

  // nfsim.js is an Emscripten IIFE: `var createNFsimModule = (() => { ... })();`
  // This creates a top-level `var`, not a global property. We need to evaluate
  // the script so createNFsimModule is accessible.
  //
  // Problem: bnglWorker.ts is a module worker (type="module"). In module workers,
  // importScripts() is disallowed. We can't use <script> tags (no document).
  // Dynamic import() treats blob URLs as ESM where local vars aren't exported.
  //
  // Solution: indirect eval `(0, eval)(text)` evaluates in global scope. The var
  // createNFsimModule hoists to the worker's global scope. Append code to assign
  // it to self explicitly so we can retrieve it.
  const augmented = text + '\n;if(typeof createNFsimModule!=="undefined")self.createNFsimModule=createNFsimModule;\n';

  // Strategy 1: <script> tag in main thread (has document)
  const hasDocument = typeof globalThis !== 'undefined' && 'document' in globalThis && (globalThis as { document?: unknown }).document;
  if (hasDocument) {
    await new Promise<void>((resolve, reject) => {
      const blobUrl = URL.createObjectURL(new Blob([augmented], { type: 'text/javascript' }));
      const doc = (globalThis as unknown as { document?: DocumentLike }).document;
      if (doc) {
        const script = doc.createElement('script');
        script.src = blobUrl;
        script.onload = () => { URL.revokeObjectURL(blobUrl); resolve(); };
        script.onerror = () => { URL.revokeObjectURL(blobUrl); reject(new Error('Failed to execute nfsim.js via script tag')); };
        doc.head.appendChild(script);
      } else {
        reject(new Error('Document not found'));
      }
    });
  } else {
    // Strategy 2: Worker context (including module workers).
    // Try classic worker importScripts first (fast, synchronous).
    let loaded = false;
    if (typeof (globalThis as unknown as { importScripts?: unknown }).importScripts === 'function') {
      const blobUrl = URL.createObjectURL(new Blob([augmented], { type: 'text/javascript' }));
      try {
        (globalThis as unknown as { importScripts: (url: string) => void }).importScripts(blobUrl);
        loaded = true;
      } catch {
        // importScripts threw (e.g. module workers where it exists but is
        // disallowed). Fall through to the ESM dynamic import path below.
      } finally {
        URL.revokeObjectURL(blobUrl);
      }
    }
    if (!loaded) {
      // Module workers: use Blob URL with ESM import to avoid eval
      const esmAugmented = text + '\n;export { createNFsimModule };\nexport default createNFsimModule;\n';
      const blobUrl = URL.createObjectURL(new Blob([esmAugmented], { type: 'application/javascript' }));
      try {
        const mod = await import(/* @vite-ignore */ blobUrl) as NFsimModuleExports;
        if (mod && mod.createNFsimModule) {
          globalThis.createNFsimModule = mod.createNFsimModule;
        } else if (mod && mod.default) {
          globalThis.createNFsimModule = mod.default;
        }
      } catch (err) {
        throw new Error('Failed to load nfsim.js via dynamic import in module worker', { cause: err });
      } finally {
        URL.revokeObjectURL(blobUrl);
      }
    }
  }

  // After evaluation, createNFsimModule should be on globalThis/self
  if (typeof globalThis.createNFsimModule === 'function') {
    return { default: globalThis.createNFsimModule, createNFsimModule: globalThis.createNFsimModule };
  }

  // Last resort: try blob URL import (may work for true ESM nfsim builds)
  const blobUrl = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
  try {
    const mod = await import(/* @vite-ignore */ blobUrl) as NFsimModuleExports;
    return mod;
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
};

let initPromise: Promise<NFsimRuntime | null> | null = null;

export async function ensureNFsimRuntime(): Promise<NFsimRuntime | null> {
  const existing = getGlobalRuntime();
  if (existing) return existing;

  if (!initPromise) {
    initPromise = (async () => {
      const { moduleUrl, wasmUrl, factory } = getRuntimeHints();

      const baseUrl = typeof import.meta !== 'undefined' && (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL
        ? (import.meta as unknown as { env: { BASE_URL: string } }).env.BASE_URL
        : '/';
      const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
      const resolvedWasmUrl = wasmUrl ?? `${normalizedBase}nfsim.wasm`;

      if (factory && typeof factory === 'function') {
        const moduleArg: Record<string, unknown> = {
          locateFile: (p: string) => (p.endsWith('.wasm') ? resolvedWasmUrl : p),
          print: (msg: string) => console.log(`[NFsim Out] ${msg}`),
          printErr: (msg: string) => console.error(`[NFsim Err] ${msg}`)
        };
        globalThis.Module = moduleArg;
        const module = await factory(moduleArg);
        const runtime = createRuntimeFromModule(module);
        if (!runtime) {
          throw new Error(
            'NFsim module factory loaded successfully but did not produce a compatible runtime. ' +
            'The runtime must export a run(xml, options) function. ' +
            'This usually means the nfsim.js build is incompatible with this version of the simulator.'
          );
        }
        setGlobalRuntime(runtime);
        return runtime;
      }

      const url = moduleUrl || `${normalizedBase}nfsim.js`;
      console.log(`[NFsimRuntimeLoader] Loading NFsim from ${url}`);
      try {
        const mod = await importModuleFromUrl(url);
        const factoryFn = (mod.default ?? mod.createNFsimModule ?? mod.NFsimModule);
        if (typeof factoryFn === 'function') {
          const moduleArg: Record<string, unknown> = {
            locateFile: (p: string) => (p.endsWith('.wasm') ? resolvedWasmUrl : p),
            print: (msg: string) => console.log(`[NFsim Out] ${msg}`),
            printErr: (msg: string) => console.error(`[NFsim Err] ${msg}`)
          };
          globalThis.Module = moduleArg;
          const module = await factoryFn(moduleArg);
          const runtime = createRuntimeFromModule(module) ?? createRuntimeFromModule(mod as unknown as NFsimModule);
          if (!runtime) {
            throw new Error(
              'NFsim JS module loaded and initialized, but the resulting object does not expose a compatible runtime. ' +
              'Expected exports: run(xml, options) or runNFsim(xml, options). ' +
              'Rebuild the NFsim WASM module or check that the correct nfsim.js file is being served.'
            );
          }
          setGlobalRuntime(runtime);
          return runtime;
        }

        const directRuntime = createRuntimeFromModule(mod as unknown as NFsimModule);
        if (directRuntime) {
          setGlobalRuntime(directRuntime);
          return directRuntime;
        }

        throw new Error(
          'NFsim JS module was loaded but contains no recognized factory or runtime. ' +
          'Expected a default export function, createNFsimModule, or NFsimModule export. ' +
          'Ensure the correct nfsim.js file is deployed.'
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `NFsim runtime loader failed while loading from ${url}: ${message}. ` +
          'Ensure the file exists at that URL, is a valid JavaScript module, and exports either ' +
          'a run(xml, options) function or a factory (default export). ' +
          'If running locally, check that the NFsim WASM build files are present in the public directory.',
          { cause: error }
        );
      }
    })();
  }

  return initPromise;
}
