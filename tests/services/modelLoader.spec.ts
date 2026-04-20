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

    await expect(modelLoader.getManifest()).rejects.toThrow(/Manifest fetch failed for all candidates/);
    await expect(modelLoader.getManifest()).rejects.toThrow(/404/);
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('should throw an error when all manifest fetch candidates reject with a network error', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Network failure'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(modelLoader.getManifest()).rejects.toThrow(/Manifest fetch failed for all candidates/);
    await expect(modelLoader.getManifest()).rejects.toThrow(/Network failure/);
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
