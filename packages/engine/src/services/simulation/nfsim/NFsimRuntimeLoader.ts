export type NFsimModuleFactory = (options?: Record<string, unknown>) => Promise<any> | any;

export type NFsimRuntime = {
  run: (xml: string, options: Record<string, unknown>) => Promise<string> | string;
  reset?: () => void;
};

const getGlobalRuntime = (): NFsimRuntime | null => {
  const globalAny = globalThis as unknown as { __nfsimRuntime?: NFsimRuntime };
  return globalAny.__nfsimRuntime ?? null;
};

const setGlobalRuntime = (runtime: NFsimRuntime): void => {
  const globalAny = globalThis as unknown as { __nfsimRuntime?: NFsimRuntime };
  globalAny.__nfsimRuntime = runtime;
};

const getRuntimeHints = () => {
  const globalAny = globalThis as unknown as {
    __nfsimModuleUrl?: string;
    __nfsimWasmUrl?: string;
    __nfsimModuleFactory?: NFsimModuleFactory;
  };
  return {
    moduleUrl: globalAny.__nfsimModuleUrl,
    wasmUrl: globalAny.__nfsimWasmUrl,
    factory: globalAny.__nfsimModuleFactory
  };
};

const createRuntimeFromModule = (module: any): NFsimRuntime | null => {
  if (!module) return null;

  // Priority 1: runNFsim wrapper (provided by nfsim.js – includes all arg handling,
  // ExitStatus wrapping, -utl, error checks, etc.).  Use this before falling back to
  // raw FS + callMain so we don't re-implement the same logic with missing pieces.
  if (typeof module.runNFsim === 'function') {
    const run = (xml: string, options: Record<string, unknown> = {}) => {
      if (typeof xml !== 'string') {
        throw new Error('NFsim run expects XML text input.');
      }
      const opts = options ?? {};
      const progressCb = typeof (opts as any).progressCallback === 'function'
        ? (opts as any).progressCallback as (msg: string) => void
        : undefined;

      // Wire module.print/printErr to the progress callback so NFsim stdout is forwarded.
      let oldPrint: ((s: string) => void) | undefined;
      let oldPrintErr: ((s: string) => void) | undefined;
      if (progressCb && module) {
        if (typeof module.print === 'function') {
          oldPrint = module.print.bind(module);
          module.print = (s: any) => { try { progressCb(String(s)); } catch { /* ignore */ } try { oldPrint?.(s); } catch { /* ignore */ } };
        }
        if (typeof module.printErr === 'function') {
          oldPrintErr = module.printErr.bind(module);
          module.printErr = (s: any) => { try { progressCb(String(s)); } catch { /* ignore */ } try { oldPrintErr?.(s); } catch { /* ignore */ } };
        }
      }

      try {
        // Reset ABORT/EXITSTATUS so the module can be reused across multiple simulations.
        if (module) {
          module.ABORT = false;
          module.EXITSTATUS = 0;
        }
        return module.runNFsim(xml, opts);
      } finally {
        if (progressCb) {
          if (oldPrint) module.print = oldPrint;
          if (oldPrintErr) module.printErr = oldPrintErr;
        }
      }
    };
    const reset = typeof module.resetNFsim === 'function'
      ? module.resetNFsim.bind(module)
      : module.reset?.bind(module);
    return { run, reset };
  }

  const hasFs = module.FS && typeof module.FS.writeFile === 'function' && typeof module.FS.readFile === 'function';
  const hasCallMain = typeof module.callMain === 'function';

  if (hasFs && hasCallMain) {
    const run = (xml: string, options: Record<string, unknown> = {}) => {
      if (typeof xml !== 'string') {
        throw new Error('NFsim run expects XML text input.');
      }
      const opts = options ?? {};
      const progressCb = typeof (opts as any).progressCallback === 'function' ? (opts as any).progressCallback as (msg: string) => void : undefined;
      const modelName = (opts as any).modelName || 'model';
      const xmlPath = (opts as any).xmlPath || `/${modelName}.xml`;
      const outPath = (opts as any).outputPath || `/${modelName}.gdat`;

      try {
        module.FS.unlink(xmlPath);
      } catch {
        // ignore
      }
      try {
        module.FS.unlink(outPath);
      } catch {
        // ignore
      }

      // If the module honors Module.print/printErr, temporarily wire them to the supplied progress callback
      let oldPrint: ((s: string) => void) | undefined;
      let oldPrintErr: ((s: string) => void) | undefined;
      let origConsoleLog: typeof console.log | undefined;
      let origConsoleError: typeof console.error | undefined;

      if (progressCb) {
        if (module && typeof module.print === 'function') {
          oldPrint = module.print.bind(module);
          module.print = (s: any) => {
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
        if (module && typeof module.printErr === 'function') {
          oldPrintErr = module.printErr.bind(module);
          module.printErr = (s: any) => {
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
        console.log = (...args: any[]) => {
          try {
            progressCb(args.map(String).join(' '));
          } catch {
            /* ignore */
          }
          origConsoleLog?.(...args);
        };
        console.error = (...args: any[]) => {
          try {
            progressCb(args.map(String).join(' '));
          } catch {
            /* ignore */
          }
          origConsoleError?.(...args);
        };
      }

      module.FS.writeFile(xmlPath, xml);

      const args: string[] = ['-xml', xmlPath, '-o', outPath];
      if ((opts as any).t_end !== undefined) {
        args.push('-sim', String((opts as any).t_end));
      }
      if ((opts as any).n_steps !== undefined) {
        args.push('-oSteps', String((opts as any).n_steps));
      }
      if ((opts as any).seed !== undefined) {
        args.push('-seed', String((opts as any).seed));
      }
      if ((opts as any).cb) {
        args.push('-cb');
      }
      if ((opts as any).speciesPath) {
        args.push('-ss', String((opts as any).speciesPath));
      }
      if ((opts as any).verbose) {
        args.push('-v');
      }

      // Reset ABORT flag and EXITSTATUS before each callMain to allow reuse of the same Emscripten module
      // if it was previously halted or exited.
      if (module) {
        module.ABORT = false;
        module.EXITSTATUS = 0;
        // Some Emscripten versions use NO_EXIT_RUNTIME but may still set this
        if (typeof module.reset === 'function') {
          try {
            module.reset();
          } catch (e) {
            console.warn('[NFsimRuntimeLoader] module.reset() failed', e);
          }
        }
      }

      let callMainError: unknown = null;
      try {
        module.callMain(args);
      } catch (e: unknown) {
        // Emscripten throws ExitStatus (an object with a `status` property) when the
        // process exits – even on clean exit (status 0).  Treat status-0 as success and
        // fall through so we can read the output file.  Any other value is a real error.
        const isExitStatus = e != null && typeof (e as any).status === 'number';
        if (isExitStatus) {
          const code = (e as any).status as number;
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

      const output = module.FS.readFile(outPath, { encoding: 'utf8' });
      return typeof output === 'string' ? output : String(output);
    };

    return { run, reset: module.reset?.bind(module) };
  }

  if (typeof module.run === 'function') {
    const run = (xml: string, options: Record<string, unknown> = {}) => {
      const opts = options ?? {};
      const progressCb = typeof (opts as any).progressCallback === 'function' ? (opts as any).progressCallback as (msg: string) => void : undefined;
      let origConsoleLog: typeof console.log | undefined;
      let origConsoleError: typeof console.error | undefined;
      if (progressCb) {
        origConsoleLog = console.log;
        origConsoleError = console.error;
        console.log = (...args: any[]) => {
          try { progressCb(args.map(String).join(' ')); } catch { /* ignore */ }
          origConsoleLog?.(...args);
        };
        console.error = (...args: any[]) => {
          try { progressCb(args.map(String).join(' ')); } catch { /* ignore */ }
          origConsoleError?.(...args);
        };
      }
      try {
        return module.run(xml, options);
      } finally {
        if (progressCb) {
          if (origConsoleLog) console.log = origConsoleLog;
          if (origConsoleError) console.error = origConsoleError;
        }
      }
    };
    return { run, reset: module.reset?.bind(module) };
  }

  if (typeof module.runNFsim === 'function') {
    const run = (xml: string, options: Record<string, unknown> = {}) => {
      const opts = options ?? {};
      const progressCb = typeof (opts as any).progressCallback === 'function' ? (opts as any).progressCallback as (msg: string) => void : undefined;
      let origConsoleLog: typeof console.log | undefined;
      let origConsoleError: typeof console.error | undefined;
      if (progressCb) {
        origConsoleLog = console.log;
        origConsoleError = console.error;
        console.log = (...args: any[]) => {
          try { progressCb(args.map(String).join(' ')); } catch { /* ignore */ }
          origConsoleLog?.(...args);
        };
        console.error = (...args: any[]) => {
          try { progressCb(args.map(String).join(' ')); } catch { /* ignore */ }
          origConsoleError?.(...args);
        };
      }
      try {
        return module.runNFsim(xml, options);
      } finally {
        if (progressCb) {
          if (origConsoleLog) console.log = origConsoleLog;
          if (origConsoleError) console.error = origConsoleError;
        }
      }
    };
    return { run, reset: module.reset?.bind(module) };
  }

  return null;
};

const importModuleFromUrl = async (url: string): Promise<any> => {
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
  const globalAny = globalThis as any;
  const augmented = text + '\n;if(typeof createNFsimModule!=="undefined")self.createNFsimModule=createNFsimModule;\n';

  // Strategy 1: <script> tag in main thread (has document)
  if (typeof globalThis !== 'undefined' && (globalThis as any).document) {
    await new Promise<void>((resolve, reject) => {
      const blobUrl = URL.createObjectURL(new Blob([augmented], { type: 'text/javascript' }));
      const script = (globalThis as any).document.createElement('script');
      script.src = blobUrl;
      script.onload = () => { URL.revokeObjectURL(blobUrl); resolve(); };
      script.onerror = () => { URL.revokeObjectURL(blobUrl); reject(new Error('Failed to execute nfsim.js via script tag')); };
      (globalThis as any).document.head.appendChild(script);
    });
  } else {
    // Strategy 2: Worker context (including module workers).
    // Try classic worker importScripts first (fast, synchronous).
    let loaded = false;
    if (typeof (globalThis as any).importScripts === 'function') {
      const blobUrl = URL.createObjectURL(new Blob([augmented], { type: 'text/javascript' }));
      try {
        (globalThis as any).importScripts(blobUrl);
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
        const mod = await import(/* @vite-ignore */ blobUrl);
        if (mod && mod.createNFsimModule) {
          globalAny.createNFsimModule = mod.createNFsimModule;
        } else if (mod && mod.default) {
          globalAny.createNFsimModule = mod.default;
        }
      } catch (err) {
        throw new Error('Failed to load nfsim.js via dynamic import in module worker', { cause: err });
      } finally {
        URL.revokeObjectURL(blobUrl);
      }
    }
  }

  // After evaluation, createNFsimModule should be on globalThis/self
  if (typeof globalAny.createNFsimModule === 'function') {
    return { default: globalAny.createNFsimModule, createNFsimModule: globalAny.createNFsimModule };
  }

  // Last resort: try blob URL import (may work for true ESM nfsim builds)
  const blobUrl = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
  try {
    const mod = await import(/* @vite-ignore */ blobUrl);
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

      const baseUrl = typeof import.meta !== 'undefined' && (import.meta as any).env?.BASE_URL
        ? (import.meta as any).env.BASE_URL
        : '/';
      const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
      const resolvedWasmUrl = wasmUrl ?? `${normalizedBase}nfsim.wasm`;

      if (factory && typeof factory === 'function') {
        const moduleArg = {
          locateFile: (p: string) => (p.endsWith('.wasm') ? resolvedWasmUrl : p),
          print: (msg: string) => console.log(`[NFsim Out] ${msg}`),
          printErr: (msg: string) => console.error(`[NFsim Err] ${msg}`)
        } as Record<string, unknown>;
        (globalThis as unknown as { Module?: Record<string, unknown> }).Module = moduleArg;
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
        const factoryFn = (mod?.default ?? mod?.createNFsimModule ?? mod?.NFsimModule) as NFsimModuleFactory | undefined;
        if (typeof factoryFn === 'function') {
          const moduleArg = {
            locateFile: (p: string) => (p.endsWith('.wasm') ? resolvedWasmUrl : p),
            print: (msg: string) => console.log(`[NFsim Out] ${msg}`),
            printErr: (msg: string) => console.error(`[NFsim Err] ${msg}`)
          } as Record<string, unknown>;
          (globalThis as unknown as { Module?: Record<string, unknown> }).Module = moduleArg;
          const module = await factoryFn(moduleArg);
          const runtime = createRuntimeFromModule(module) ?? createRuntimeFromModule(mod);
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

        const directRuntime = createRuntimeFromModule(mod);
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

export function resetNFsimRuntime(): void {
  initPromise = null;
  const globalAny = globalThis as unknown as { __nfsimRuntime?: NFsimRuntime };
  delete globalAny.__nfsimRuntime;
}
