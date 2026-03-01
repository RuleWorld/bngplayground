/**
 * igraphLoader.ts
 *
 * Dynamically loads the igraph WASM module compiled with Emscripten
 * (wasm-igraph/build_wasm.sh → services/igraph_loader.js + public/igraph.wasm).
 *
 * Falls back gracefully if the WASM has not been built yet (WASM_NOT_BUILT error).
 * Follows the same pattern as CVODESolver in packages/engine/src/services/simulation/ODESolver.ts.
 */

import type { IgraphAnalysisResult, NetworkAnalysisPayload } from '../types';

// ---- Module interface ------------------------------------------------------

interface IgraphModule {
  /** Analyse graph. Returns pointer to static JSON buffer (do NOT free). */
  _ig_analyse(nVerts: number, edgePtr: number, nEdges: number, directed: number): number;
  /** Allocate bytes in WASM heap. Caller must free with _ig_free. */
  _ig_malloc(bytes: number): number;
  /** Free a pointer previously allocated with _ig_malloc. */
  _ig_free(ptr: number): void;
  /** Standard malloc (forwarded). */
  _malloc(bytes: number): number;
  /** Standard free (forwarded). */
  _free(ptr: number): void;
  /** Read a C string at ptr into a JS string. */
  UTF8ToString(ptr: number, maxBytesToRead?: number): string;
  /** 32-bit signed integer view into WASM linear memory. */
  HEAP32: Int32Array;
  /** 8-bit unsigned view into WASM linear memory. */
  HEAPU8: Uint8Array;
}

// ---- Loader singleton ------------------------------------------------------

let _modulePromise: Promise<IgraphModule> | null = null;

/**
 * Resolve a factory function from an Emscripten module-like export.
 * Handles: bare function, .default, .IgraphModule, .default.default, .default.IgraphModule.
 */
function resolveLoader(moduleLike: unknown): (moduleArg?: unknown) => Promise<IgraphModule> {
  const candidates: unknown[] = [];
  if (typeof moduleLike === 'function') candidates.push(moduleLike);
  if (moduleLike && typeof moduleLike === 'object') {
    const rec = moduleLike as Record<string, unknown>;
    candidates.push(rec['default'], rec['IgraphModule']);
    const nested = rec['default'];
    if (nested && typeof nested === 'object') {
      const nestedRec = nested as Record<string, unknown>;
      candidates.push(nestedRec['default'], nestedRec['IgraphModule']);
    }
  }
  const callable = candidates.find((c) => typeof c === 'function');
  if (!callable) {
    throw new Error('[IgraphLoader] Failed to resolve callable export from igraph_loader.js');
  }
  return callable as (moduleArg?: unknown) => Promise<IgraphModule>;
}

/** Determine the base URL for WASM asset resolution, handling GitHub Pages sub-path. */
function getBaseUrl(): string {
  if (typeof self !== 'undefined' && self.location) {
    const { pathname } = self.location;
    if (pathname.includes('/bngplayground/')) return '/bngplayground/';
  }
  return '/';
}

async function _loadModule(): Promise<IgraphModule> {
  // igraph_loader.js sits alongside this file in services/.
  // Use a relative path so Vite resolves the module properly in both dev  and
  // prod (the previous @vite-ignore + @/ alias was never resolved at runtime).
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore — generated file may not have TS declarations
  const moduleLike = await import('./igraph_loader.js');
  const loader = resolveLoader(moduleLike);
  const baseUrl = getBaseUrl();

  const wasmUrl = `${baseUrl}igraph.wasm`;
  const mod = await loader({
    locateFile: (path: string) => {
      if (path.endsWith('.wasm')) {
        console.log(`[IgraphLoader] Resolving ${path} → ${wasmUrl}`);
        return wasmUrl;
      }
      return path;
    },
    // Provide a custom instantiateWasm so the module never needs to fall back
    // to readAsync — which is undefined in module-type Web Workers because the
    // Emscripten-generated detector uses `typeof importScripts` (only true for
    // classic workers). Fetching + instantiating manually avoids that path.
    // IMPORTANT: Emscripten's old-style instantiateWasm contract requires the
    // callback to return {} synchronously and call receiveInstance asynchronously.
    instantiateWasm: (
      imports: WebAssembly.Imports,
      receiveInstance: (instance: WebAssembly.Instance) => void,
    ) => {
      fetch(wasmUrl, { credentials: 'same-origin' })
        .then((r) => r.arrayBuffer())
        .then((buf) => WebAssembly.instantiate(buf, imports))
        .then((result) => receiveInstance(result.instance))
        .catch((e) => console.error('[IgraphLoader] WASM instantiation failed:', e));
      return {}; // synchronous return — Emscripten uses run-dependency system for sequencing
    },
  });

  return mod as unknown as IgraphModule;
}

/**
 * Lazily load the igraph WASM module.
 * Retries on error (resets the promise so the next call attempts a fresh import).
 */
export function loadIgraph(): Promise<IgraphModule> {
  if (!_modulePromise) {
    _modulePromise = _loadModule().catch((err) => {
      _modulePromise = null; // allow retry
      throw err;
    });
  }
  return _modulePromise;
}

// ---- High-level analyse API ------------------------------------------------

/**
 * Run igraph analysis on the provided graph payload.
 *
 * Allocates an int32 edge buffer in WASM memory: [from0, to0, from1, to1, ...],
 * calls ig_analyse, reads the JSON result from the static buffer, and returns
 * a fully-typed IgraphAnalysisResult.
 *
 * @throws {Error} If igraph WASM module cannot be loaded (not built yet).
 */
export async function analyseGraph(payload: NetworkAnalysisPayload): Promise<IgraphAnalysisResult> {
  const mod = await loadIgraph();
  const { edges, nodeLabels, directed } = payload;
  const nVerts = nodeLabels.length;
  const nEdges = edges.length;

  // Allocate int32 buffer: each edge is [from, to] as two 32-bit ints
  const byteCount = nEdges * 2 * 4;
  const edgePtr = byteCount > 0 ? mod._ig_malloc(byteCount) : 0;

  try {
    if (nEdges > 0 && edgePtr !== 0) {
      // Write edges into WASM heap (int32, so divide by 4 or use byte offset)
      const byteOffset = edgePtr;
      const view = new Int32Array(mod.HEAP32.buffer, byteOffset, nEdges * 2);
      for (let i = 0; i < nEdges; i++) {
        view[i * 2] = edges[i].from;
        view[i * 2 + 1] = edges[i].to;
      }
    }

    const resultPtr = mod._ig_analyse(nVerts, edgePtr, nEdges, directed ? 1 : 0);
    if (resultPtr === 0) {
      throw new Error('[IgraphLoader] ig_analyse returned null — out of memory or empty graph?');
    }

    const jsonStr = mod.UTF8ToString(resultPtr);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = JSON.parse(jsonStr) as Record<string, any>;

    return {
      nodeCount: raw['nodeCount'] ?? nVerts,
      edgeCount: raw['edgeCount'] ?? nEdges,
      nodeLabels,
      graphType: payload.graphType,
      degree: raw['degree'] ?? [],
      inDegree: raw['inDegree'] ?? [],
      outDegree: raw['outDegree'] ?? [],
      betweenness: raw['betweenness'] ?? [],
      closeness: raw['closeness'] ?? [],
      pagerank: raw['pagerank'] ?? [],
      localClustering: raw['localClustering'] ?? [],
      communityIds: raw['communityIds'] ?? [],
      communityCount: raw['communityCount'] ?? 0,
      modularity: raw['modularity'] ?? 0,
      globalClustering: raw['globalClustering'] ?? 0,
      diameter: raw['diameter'] ?? 0,
      avgPathLength: raw['avgPathLength'] ?? 0,
      components: raw['components'] ?? 1,
      isConnected: raw['isConnected'] ?? false,
    };
  } finally {
    if (edgePtr !== 0) {
      mod._ig_free(edgePtr);
    }
  }
}
