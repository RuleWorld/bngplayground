import { describe, test, expect, vi, beforeEach } from 'vitest';

describe('igraphLoader analyseGraph error path', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  test('should cleanup memory when HEAP32 throws', async () => {
    const freeMock = vi.fn();

    // Mock the dynamic import of igraph_loader.js
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

    // Need to dynamically import igraphLoader after doMock
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
});
