import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('loadIgraph', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads the module successfully on the first attempt and caches the result', async () => {
    let callCount = 0;

    vi.doMock('../../services/igraph_loader.js', () => {
      return {
        default: vi.fn().mockImplementation(() => {
          callCount++;
          return Promise.resolve({
            _ig_analyse: vi.fn()
          });
        }),
        IgraphModule: vi.fn()
      };
    });

    const { loadIgraph } = await import('../../services/igraphLoader');

    const result1 = await loadIgraph();
    expect(result1).toBeDefined();

    const result2 = await loadIgraph();
    expect(result2).toBe(result1); // same instance

    expect(callCount).toBe(1); // Only called once
  });

  it('retries on failure by clearing the cached promise', async () => {
    let callCount = 0;

    vi.doMock('../../services/igraph_loader.js', () => {
      return {
        default: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.reject(new Error('First call fails'));
          }
          return Promise.resolve({
            _ig_analyse: vi.fn()
          });
        }),
        IgraphModule: vi.fn()
      };
    });

    const { loadIgraph } = await import('../../services/igraphLoader');

    // First call should fail
    await expect(loadIgraph()).rejects.toThrow('First call fails');
    expect(callCount).toBe(1);

    // Second call should retry and succeed
    const result = await loadIgraph();
    expect(result).toBeDefined();
    expect(callCount).toBe(2);

    // Third call should be cached
    await loadIgraph();
    expect(callCount).toBe(2);
  });
});
