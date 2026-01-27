import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchUniProtEntry, clearUniProtCache } from '../../src/lib/atomizer/services/uniprot';

describe('UniProt service', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    clearUniProtCache();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('parses a simple UniProt JSON response', async () => {
    const sample = {
      primaryAccession: 'P12345',
      proteinDescription: { recommendedName: { fullName: { value: 'Protein X' } } },
      genes: [{ geneName: { value: 'GENEX' } }],
      organism: { scientificName: 'Homo sapiens' },
      comments: [{ type: 'FUNCTION', texts: [{ value: 'Does X' }] }],
      keywords: [{ value: 'Kinase' }],
    };

    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => sample });

    const res = await fetchUniProtEntry('P12345');
    expect(res).not.toBeNull();
    expect(res?.accession).toBe('P12345');
    expect(res?.proteinName).toBe('Protein X');
    expect(res?.geneName).toBe('GENEX');
    expect(res?.organism).toBe('Homo sapiens');
    expect(res?.function).toBe('Does X');
    expect(res?.keywords).toContain('Kinase');
  });

  it('returns null on non-OK fetch', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false });
    const res = await fetchUniProtEntry('NOPE');
    expect(res).toBeNull();
  });

  it('caches results', async () => {
    const sample = { primaryAccession: 'P11111' };
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => sample });
    globalThis.fetch = mockFetch;

    const r1 = await fetchUniProtEntry('P11111');
    const r2 = await fetchUniProtEntry('P11111');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(r1?.accession).toBe('P11111');
    expect(r2?.accession).toBe('P11111');
  });
});
