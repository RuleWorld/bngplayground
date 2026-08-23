import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { queryPathwayCommons } from '../src/services/pathwayCommons/pathwayCommonsService';

const SAMPLE_BNGL = `
begin parameters
  k 1
end parameters
begin molecule types
  EGF()
  EGFR()
end molecule types
begin seed species
  EGF() 10
  EGFR() 10
end seed species
begin observables
  Molecules Total_EGF EGF()
end observables
begin reaction rules
  EGF() + EGFR() -> EGF().EGFR() k
end reaction rules
`;

describe('pathwayCommonsService contract tests', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('handles models with no molecule types', async () => {
    const emptyModel = `
begin parameters
  k 1
end parameters
begin seed species
end seed species
begin reaction rules
end reaction rules
`;
    const result = await queryPathwayCommons(emptyModel);
    expect(result.summary).toContain('No molecule types found in the model.');
    expect(result.interactions).toEqual([]);
    expect(result.pathways).toEqual([]);
  });

  it('queries graph and pathways with mocked fetch responses', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr.includes('/graph')) {
        return new Response('EGF\tin-complex-with\tEGFR\n', { status: 200 });
      }
      if (urlStr.includes('/search')) {
        return new Response(
          JSON.stringify({
            searchHit: [
              {
                name: 'EGF signaling pathway',
                dataSource: ['Reactome'],
                uri: 'http://pathwaycommons.org/pc2/EGF_pathway',
              },
            ],
          }),
          { status: 200 }
        );
      }
      return new Response('', { status: 404 });
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await queryPathwayCommons(SAMPLE_BNGL);

    expect(result.interactions.length).toBe(1);
    expect(result.interactions[0].source).toBe('EGF');
    expect(result.interactions[0].target).toBe('EGFR');
    expect(result.interactions[0].inModel).toBe(true);
    expect(result.confirmedInteractions.length).toBe(1);
    expect(result.pathways.length).toBeGreaterThan(0);
    expect(result.pathways[0].name).toBe('EGF signaling pathway');
    expect(result.summary).toContain('Queried 2 molecules against Pathway Commons.');
  });

  it('handles API errors and 404s gracefully', async () => {
    globalThis.fetch = vi.fn(async () => new Response('', { status: 404 })) as unknown as typeof fetch;

    const result = await queryPathwayCommons(SAMPLE_BNGL);
    expect(result.interactions).toEqual([]);
    expect(result.pathways).toEqual([]);
    expect(result.summary).toContain('Queried 2 molecules against Pathway Commons.');
  });
});
