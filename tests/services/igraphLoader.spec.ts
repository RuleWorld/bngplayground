import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

describe('igraphLoader', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('analyseGraph', () => {
    test('should cleanup memory when HEAP32 throws', async () => {
      const freeMock = vi.fn();

      vi.doMock('../../services/igraph_loader.js', () => {
        const fn = () => Promise.resolve({
          _ig_malloc: vi.fn().mockReturnValue(123),
          _ig_free: freeMock,
          get HEAP32() { throw new Error('Simulated memory error'); },
          HEAPU8: new Uint8Array(),
          _ig_analyse: vi.fn(),
          _malloc: vi.fn(),
          _free: vi.fn(),
          UTF8ToString: vi.fn(),
        });
        return {
          default: fn,
          IgraphModule: fn,
        };
      });

      const { analyseGraph } = await import('../../services/igraphLoader');

      const promise = analyseGraph({
        edges: [{from: 0, to: 1}],
        nodeLabels: ['A', 'B'],
        directed: false,
        graphType: 'reaction'
      });

      await expect(promise).rejects.toThrow('Simulated memory error');
      expect(freeMock).toHaveBeenCalledTimes(1);
      expect(freeMock).toHaveBeenCalledWith(123);
    });

    test('should successfully analyse a simple graph with fallback defaults', async () => {
      const freeMock = vi.fn();
      const mallocMock = vi.fn().mockReturnValue(124);
      const analyseMock = vi.fn().mockReturnValue(456);

      // empty json response to trigger fallback `??` operators
      const jsonResponse = {};

      const utf8ToStringMock = vi.fn().mockReturnValue(JSON.stringify(jsonResponse));

      const buffer = new ArrayBuffer(1024);
      const heap32 = new Int32Array(buffer);

      vi.doMock('../../services/igraph_loader.js', () => {
        const fn = () => Promise.resolve({
          _ig_malloc: mallocMock,
          _ig_free: freeMock,
          HEAP32: heap32,
          HEAPU8: new Uint8Array(buffer),
          _ig_analyse: analyseMock,
          _malloc: vi.fn(),
          _free: vi.fn(),
          UTF8ToString: utf8ToStringMock,
        });
        return {
          default: fn,
          IgraphModule: fn,
        };
      });

      const { analyseGraph } = await import('../../services/igraphLoader');

      const result = await analyseGraph({
        edges: [{from: 0, to: 1}],
        nodeLabels: ['A', 'B'],
        directed: false,
        graphType: 'reaction'
      });

      expect(mallocMock).toHaveBeenCalledWith(1 * 2 * 4); // 1 edge, 2 nodes, 4 bytes each
      expect(analyseMock).toHaveBeenCalledWith(2, 124, 1, 0); // 2 nodes, ptr, 1 edge, not directed
      expect(utf8ToStringMock).toHaveBeenCalledWith(456);
      expect(freeMock).toHaveBeenCalledTimes(1);
      expect(freeMock).toHaveBeenCalledWith(124);

      // checking the nullish coalescing defaults
      expect(result.nodeCount).toBe(2);
      expect(result.edgeCount).toBe(1);
      expect(result.nodeLabels).toEqual(['A', 'B']);
      expect(result.degree).toEqual([]);
      expect(result.communityCount).toBe(0);
      expect(result.components).toBe(1);
      expect(result.isConnected).toBe(false);
    });

    test('should successfully analyse a simple graph', async () => {
      const freeMock = vi.fn();
      // Ensure the mocked pointer is a multiple of 4 to avoid Int32Array alignment error
      const mallocMock = vi.fn().mockReturnValue(124);
      const analyseMock = vi.fn().mockReturnValue(456);

      const jsonResponse = {
        nodeCount: 2,
        edgeCount: 1,
        degree: [1, 1],
        components: 1,
        isConnected: true
      };

      const utf8ToStringMock = vi.fn().mockReturnValue(JSON.stringify(jsonResponse));

      // Need enough buffer space for offset 124
      const buffer = new ArrayBuffer(1024);
      const heap32 = new Int32Array(buffer);

      vi.doMock('../../services/igraph_loader.js', () => {
        const fn = () => Promise.resolve({
          _ig_malloc: mallocMock,
          _ig_free: freeMock,
          HEAP32: heap32,
          HEAPU8: new Uint8Array(buffer),
          _ig_analyse: analyseMock,
          _malloc: vi.fn(),
          _free: vi.fn(),
          UTF8ToString: utf8ToStringMock,
        });
        return {
          default: fn,
          IgraphModule: fn,
        };
      });

      const { analyseGraph } = await import('../../services/igraphLoader');

      const result = await analyseGraph({
        edges: [{from: 0, to: 1}],
        nodeLabels: ['A', 'B'],
        directed: false,
        graphType: 'reaction'
      });

      expect(mallocMock).toHaveBeenCalledWith(1 * 2 * 4); // 1 edge, 2 nodes, 4 bytes each
      expect(analyseMock).toHaveBeenCalledWith(2, 124, 1, 0); // 2 nodes, ptr, 1 edge, not directed
      expect(utf8ToStringMock).toHaveBeenCalledWith(456);
      expect(freeMock).toHaveBeenCalledTimes(1);
      expect(freeMock).toHaveBeenCalledWith(124);

      expect(result.nodeCount).toBe(2);
      expect(result.edgeCount).toBe(1);
      expect(result.nodeLabels).toEqual(['A', 'B']);
      expect(result.degree).toEqual([1, 1]);
      expect(result.components).toBe(1);
      expect(result.isConnected).toBe(true);
    });

    test('should handle empty graph', async () => {
      const freeMock = vi.fn();
      const mallocMock = vi.fn().mockReturnValue(0); // 0 bytes allocated
      const analyseMock = vi.fn().mockReturnValue(456);

      const jsonResponse = {
        nodeCount: 0,
        edgeCount: 0,
        degree: [],
      };

      const utf8ToStringMock = vi.fn().mockReturnValue(JSON.stringify(jsonResponse));

      vi.doMock('../../services/igraph_loader.js', () => {
        const fn = () => Promise.resolve({
          _ig_malloc: mallocMock,
          _ig_free: freeMock,
          HEAP32: new Int32Array(0),
          HEAPU8: new Uint8Array(0),
          _ig_analyse: analyseMock,
          _malloc: vi.fn(),
          _free: vi.fn(),
          UTF8ToString: utf8ToStringMock,
        });
        return {
          default: fn,
          IgraphModule: fn,
        };
      });

      const { analyseGraph } = await import('../../services/igraphLoader');

      const result = await analyseGraph({
        edges: [],
        nodeLabels: [],
        directed: true,
        graphType: 'reaction'
      });

      expect(mallocMock).not.toHaveBeenCalled();
      expect(analyseMock).toHaveBeenCalledWith(0, 0, 0, 1);
      expect(utf8ToStringMock).toHaveBeenCalledWith(456);
      expect(freeMock).not.toHaveBeenCalled();

      expect(result.nodeCount).toBe(0);
      expect(result.edgeCount).toBe(0);
      expect(result.nodeLabels).toEqual([]);
    });

    test('should throw error when _ig_analyse returns 0', async () => {
      const freeMock = vi.fn();
      const mallocMock = vi.fn().mockReturnValue(124); // multiple of 4
      const analyseMock = vi.fn().mockReturnValue(0); // null pointer returned

      const buffer = new ArrayBuffer(1024);

      vi.doMock('../../services/igraph_loader.js', () => {
        const fn = () => Promise.resolve({
          _ig_malloc: mallocMock,
          _ig_free: freeMock,
          HEAP32: new Int32Array(buffer),
          HEAPU8: new Uint8Array(buffer),
          _ig_analyse: analyseMock,
          _malloc: vi.fn(),
          _free: vi.fn(),
          UTF8ToString: vi.fn(),
        });
        return {
          default: fn,
          IgraphModule: fn,
        };
      });

      const { analyseGraph } = await import('../../services/igraphLoader');

      const promise = analyseGraph({
        edges: [{from: 0, to: 1}],
        nodeLabels: ['A', 'B'],
        directed: false,
        graphType: 'reaction'
      });

      await expect(promise).rejects.toThrow('[IgraphLoader] ig_analyse returned null');
      expect(freeMock).toHaveBeenCalledTimes(1);
      expect(freeMock).toHaveBeenCalledWith(124);
    });
  });

  describe('resolveLoader and WASM loading', () => {
    test('should throw when no callable export found', async () => {
      vi.doMock('../../services/igraph_loader.js', () => {
        return {
          default: {}, // not a function
          IgraphModule: null,
        };
      });

      const { loadIgraph } = await import('../../services/igraphLoader');

      await expect(loadIgraph()).rejects.toThrow('[IgraphLoader] Failed to resolve callable export from igraph_loader.js');
    });

    test('should correctly instantiate WASM using fetch', async () => {
      // Mock fetch and WebAssembly
      const arrayBufferMock = vi.fn().mockResolvedValue(new ArrayBuffer(8));
      const fetchMock = vi.fn().mockResolvedValue({
        arrayBuffer: arrayBufferMock
      });
      global.fetch = fetchMock;

      const instanceMock = { exports: {} };
      const instantiateMock = vi.fn().mockResolvedValue({
        instance: instanceMock
      });
      global.WebAssembly.instantiate = instantiateMock;

      // Mock resolveLoader candidates (bare function)
      const loaderFn = vi.fn().mockImplementation(async (options) => {
        // Trigger locateFile
        options.locateFile('test.wasm');
        options.locateFile('test.txt');

        // Trigger instantiateWasm
        const receiveInstance = vi.fn();
        options.instantiateWasm({}, receiveInstance);

        // Wait a tick for promises to resolve
        await new Promise(r => setTimeout(r, 10));

        return { _ig_malloc: vi.fn() };
      });

      vi.doMock('../../services/igraph_loader.js', () => {
        return {
          default: loaderFn,
          IgraphModule: loaderFn, // ensure there's a property to avoid vitest warnings
        };
      });

      const { loadIgraph } = await import('../../services/igraphLoader');

      await loadIgraph();

      expect(fetchMock).toHaveBeenCalledWith('/igraph.wasm', { credentials: 'same-origin' });
      expect(instantiateMock).toHaveBeenCalled();
      expect(loaderFn).toHaveBeenCalled();
    });

    test('should handle WASM instantiation failure', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const fetchMock = vi.fn().mockRejectedValue(new Error('Fetch failed'));
      global.fetch = fetchMock;

      const loaderFn = vi.fn().mockImplementation(async (options) => {
        const receiveInstance = vi.fn();
        options.instantiateWasm({}, receiveInstance);
        await new Promise(r => setTimeout(r, 10));
        return { _ig_malloc: vi.fn() };
      });

      vi.doMock('../../services/igraph_loader.js', () => {
        return {
          default: loaderFn,
          IgraphModule: loaderFn,
        };
      });

      const { loadIgraph } = await import('../../services/igraphLoader');

      await loadIgraph();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[IgraphLoader] WASM instantiation failed:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    test('resolveLoader candidates', async () => {
      const loaderFn = vi.fn().mockResolvedValue({ _ig_malloc: vi.fn() });

      // Test nested object structure
      vi.doMock('../../services/igraph_loader.js', () => {
        return {
          default: {
            default: {
              IgraphModule: loaderFn
            },
            IgraphModule: loaderFn,
          },
          IgraphModule: loaderFn,
        };
      });

      const { loadIgraph } = await import('../../services/igraphLoader');

      await loadIgraph();
      expect(loaderFn).toHaveBeenCalled();
    });

    test('resolveLoader directly returns a function mock', async () => {
      const loaderFn = vi.fn().mockResolvedValue({ _ig_malloc: vi.fn() });

      // Because Vitest's vi.doMock requires an object with a default export,
      // and we want to test the `if (typeof moduleLike === 'function')` branch
      // of `resolveLoader(moduleLike)`, we'll bypass vi.doMock and directly
      // test the internal function if possible, but it's not exported.
      //
      // The best way to hit this is simulating an interop export object:
      vi.doMock('../../services/igraph_loader.js', () => {
        const exportedFn = Object.assign(loaderFn, { IgraphModule: loaderFn });
        return {
          default: exportedFn,
          IgraphModule: loaderFn
        };
      });

      const { loadIgraph } = await import('../../services/igraphLoader');

      await loadIgraph();
      expect(loaderFn).toHaveBeenCalled();
    });
  });

  describe('getBaseUrl', () => {
    test('should return base URL correctly when in bngplayground subpath', async () => {
      const originalSelf = global.self;
      global.self = { location: { pathname: '/bngplayground/test' } } as unknown as { location: { pathname: string } };

      vi.doMock('../../services/igraph_loader.js', () => {
        const fn = () => Promise.resolve({ _ig_malloc: vi.fn() });
        return { default: fn, IgraphModule: fn };
      });

      const { loadIgraph } = await import('../../services/igraphLoader');
      await loadIgraph();

      global.self = originalSelf;
    });

    test('should recover from load error (retry logic)', async () => {
      let failCount = 0;

      vi.doMock('../../services/igraph_loader.js', () => {
        const fn = () => {
          if (failCount === 0) {
            failCount++;
            return Promise.reject(new Error('First load failed'));
          }
          return Promise.resolve({ _ig_malloc: vi.fn() });
        };
        return { default: fn, IgraphModule: fn };
      });

      const { loadIgraph } = await import('../../services/igraphLoader');

      // First attempt fails
      await expect(loadIgraph()).rejects.toThrow('First load failed');

      // Second attempt succeeds
      const result = await loadIgraph();
      expect(result).toBeDefined();
    });
  });
});
