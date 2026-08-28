import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  RuleHubClient,
  isBng2Compatible,
  matchesSearchFilters,
  normalizeManifest,
  rankCandidates,
  scoreCandidate,
} from '@bngplayground/rulehub';

describe('shared RuleHub package', () => {
  it('normalizes the current array manifest and legacy compatibility fields', () => {
    const manifest = normalizeManifest([
      {
        id: 'fixture',
        name: 'Fixture',
        path: 'Published/fixture/model.bngl',
        tags: ['signaling'],
        bng2_compatible: true,
        rawUrl: 'https://example.test/model.bngl',
      },
    ], { ref: 'master', revision: null, sourceUrl: 'https://example.test/manifest.json' });

    expect(manifest.repository).toBe('RuleWorld/RuleHub');
    expect(manifest.models[0]).toMatchObject({
      id: 'fixture',
      path: 'Published/fixture/model.bngl',
      bng2_compatible: true,
      rawUrl: 'https://example.test/model.bngl',
    });
    expect(isBng2Compatible(manifest.models[0])).toBe(true);
  });

  it('caches the manifest and exact model source while preserving provenance', async () => {
    let manifestRequests = 0;
    let modelRequests = 0;
    const client = new RuleHubClient({
      manifestUrl: 'https://fixture.test/manifest.json',
      fetchImpl: async (input) => {
        if (String(input).endsWith('.bngl')) {
          modelRequests += 1;
          return new Response('begin model\nend model', { status: 200 });
        }
        manifestRequests += 1;
        return new Response(JSON.stringify({
          models: [{ id: 'fixture', name: 'Fixture', path: 'models/fixture.bngl', citation: { doi: '10.1/fixture' } }],
        }), { status: 200 });
      },
    });

    const [first, second] = await Promise.all([client.getModel('fixture'), client.getModel('fixture')]);
    expect(first.code).toBe('begin model\nend model');
    expect(second.code).toBe(first.code);
    expect(first.provenance).toMatchObject({
      repository: 'RuleWorld/RuleHub',
      ref: 'master',
      path: 'models/fixture.bngl',
      model_id: 'fixture',
      citation: { doi: '10.1/fixture' },
      revision: null,
    });
    expect(manifestRequests).toBe(1);
    expect(modelRequests).toBe(1);
  });

  it('filters before ranking and applies bounded deterministic lexical boosts', () => {
    const entries = [
      {
        id: 'egfr', name: 'EGFR signaling', path: 'egfr.bngl', tags: ['signaling'],
        compatibility: { bng2: true, nfsim: false, methods: ['ode'] },
      },
      {
        id: 'excluded-egfr', name: 'Excluded EGFR', path: 'excluded.bngl', tags: ['signaling'],
        compatibility: { bng2: true, excluded: true, methods: ['ode'] },
      },
      {
        id: 'polymer', name: 'Polymer', path: 'polymer.bngl', tags: ['polymer'],
        compatibility: { bng2: false, nfsim: true, methods: ['nf'] },
      },
    ];
    const filtered = entries.filter((entry) => matchesSearchFilters(entry, {
      query: 'EGFR', bng2_compatible: true, simulation_methods: ['ode'],
    }));
    expect(filtered.map((entry) => entry.id)).toEqual(['egfr']);
    const score = scoreCandidate('EGFR', { entry: filtered[0] });
    expect(score).toBe(1);
    expect(rankCandidates('model', entries.map((entry) => ({ entry })))).toEqual(
      expect.arrayContaining([expect.objectContaining({ entry: expect.objectContaining({ id: 'egfr' }) })]),
    );
  });

  it('keeps a reviewed benchmark fixture tied to real RuleHub IDs', async () => {
    const fixturePath = resolve(process.cwd(), 'tests/fixtures/rulehub-search-cases.json');
    const cases = JSON.parse(await readFile(fixturePath, 'utf8')) as Array<{ expected_any: string[] }>;
    expect(cases.length).toBeGreaterThanOrEqual(20);
    expect(cases.every((item) => item.expected_any.length > 0)).toBe(true);
  });
});
