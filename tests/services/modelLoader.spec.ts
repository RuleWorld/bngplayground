import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Model Loader Error Paths', () => {
  let modelLoader: typeof import('../../services/modelLoader');

  beforeEach(async () => {
    vi.resetModules();
    vi.unstubAllGlobals();
    // Dynamic import to get a fresh instance of the module cache
    modelLoader = await import('../../services/modelLoader');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should throw an error when all manifest fetch candidates return non-ok responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404
    });
    vi.stubGlobal('fetch', fetchMock);

    const manifestPromise = modelLoader.getManifest();
    await expect(manifestPromise).rejects.toThrow(/Manifest fetch failed for all candidates/);
    await expect(manifestPromise).rejects.toThrow(/404/);
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('should throw an error when all manifest fetch candidates reject with a network error', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Network failure'));
    vi.stubGlobal('fetch', fetchMock);

    const manifestPromise = modelLoader.getManifest();
    await expect(manifestPromise).rejects.toThrow(/Manifest fetch failed for all candidates/);
    await expect(manifestPromise).rejects.toThrow(/Network failure/);
  });

  it('should succeed if the first candidate fails but the second succeeds', async () => {
    const validManifest = { models: [], totalModels: 0, generated: '2023-01-01' };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => validManifest
      });
    vi.stubGlobal('fetch', fetchMock);

    const manifest = await modelLoader.getManifest();
    expect(manifest).toEqual(validManifest);
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('should throw an error if the manifest payload is invalid', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ unexpected: 'format' })
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(modelLoader.getManifest()).rejects.toThrow(/Invalid model manifest payload/);
  });
});

describe('getManifestDebugInfo', () => {
  let modelLoader: typeof import('../../services/modelLoader');

  beforeEach(async () => {
    vi.resetModules();
    vi.unstubAllGlobals();
    modelLoader = await import('../../services/modelLoader');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initially return null for resolved, and list candidates', () => {
    const debugInfo = modelLoader.getManifestDebugInfo();
    expect(debugInfo.resolved).toBeNull();
    expect(debugInfo.candidates).toBeInstanceOf(Array);
    expect(debugInfo.candidates.length).toBeGreaterThan(0);
  });

  it('should return the resolved URL after successful manifest load', async () => {
    const validManifest = { models: [], totalModels: 0, generated: '2023-01-01' };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => validManifest
    });
    vi.stubGlobal('fetch', fetchMock);

    let debugInfo = modelLoader.getManifestDebugInfo();
    expect(debugInfo.resolved).toBeNull();

    await modelLoader.getManifest();

    debugInfo = modelLoader.getManifestDebugInfo();
    expect(debugInfo.resolved).not.toBeNull();
    expect(typeof debugInfo.resolved).toBe('string');
    expect(debugInfo.candidates).toContain(debugInfo.resolved);
  });
});

describe('preloadModel', () => {
  let modelLoader: typeof import('../../services/modelLoader');

  beforeEach(async () => {
    vi.resetModules();
    vi.unstubAllGlobals();
    modelLoader = await import('../../services/modelLoader');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should call loadModelCode and fetch when not cached and not pending', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const mockManifest = {
      models: [{ id: 'model1', rawUrl: 'http://test.com/model1.bngl' }],
      totalModels: 1,
      generated: '2023-01-01'
    };

    fetchMock.mockImplementation((url: string) => {
      if (url.includes('manifest.json')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockManifest
        });
      }
      return Promise.resolve({
        ok: true,
        text: async () => 'test code'
      });
    });

    modelLoader.preloadModel('model1');

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(fetchMock).toHaveBeenCalled();
    const calls = fetchMock.mock.calls.map(call => call[0]);
    expect(calls).toContain('http://test.com/model1.bngl');
  });

  it('should not initiate a load if the model is already in codeCache', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    modelLoader.setCachedCode('model1', 'cached code');
    modelLoader.preloadModel('model1');

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should not initiate a load if the model is already in pendingFetches', async () => {
    const mockManifest = {
      models: [{ id: 'model1', rawUrl: 'http://test.com/model1.bngl' }],
      totalModels: 1,
      generated: '2023-01-01'
    };

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('manifest.json')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockManifest
        });
      }
      return new Promise(() => {});
    });
    vi.stubGlobal('fetch', fetchMock);

    modelLoader.loadModelCode('model1').catch(() => {});

    await new Promise(resolve => setTimeout(resolve, 10));

    fetchMock.mockClear();

    modelLoader.preloadModel('model1');

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should safely catch and suppress errors if loadModelCode throws/rejects', async () => {
    const mockManifest = {
      models: [{ id: 'model_fail', rawUrl: 'http://test.com/fail.bngl' }],
      totalModels: 1,
      generated: '2023-01-01'
    };

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('manifest.json')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockManifest
        });
      }
      return Promise.reject(new Error('Network Error'));
    });
    vi.stubGlobal('fetch', fetchMock);

    modelLoader.preloadModel('model_fail');

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(fetchMock).toHaveBeenCalled();
  });
});
