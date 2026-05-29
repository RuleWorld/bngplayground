/**
 * Provenance tests — asserts chain integrity, hash determinism, RO-Crate layout.
 */

import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { ProvenanceRecorder } from './ProvenanceRecorder';
import { buildROCrate } from './ROCrate';
import { sha256Normalized, sha256OfParams } from './HashComputer';
import type { ProvActivity } from './types';

const SAMPLE_BNGL = `
begin model
begin parameters
  kf 0.1
  kr 0.01
end parameters
begin molecule types
  A(s)
  B(s)
end molecule types
begin seed species
  A(s) 100
  B(s) 100
end seed species
begin reaction rules
  A(s) + B(s) <-> A(s!1).B(s!1) kf, kr
end reaction rules
end model
`;

describe('ProvenanceRecorder', () => {
  it('emits engine agent on construction', () => {
    const r = new ProvenanceRecorder();
    const doc = r.finalize();
    const agents = doc['@graph'].filter((n: any) => 'bng:name' in n);
    expect(agents.length).toBeGreaterThanOrEqual(1);
    expect((agents[0] as any)['bng:name']).toBe('BNG Playground Engine');
  });

  it('includes WASM agents when configured', () => {
    const r = new ProvenanceRecorder({
      wasmShas: {
        'cvode.wasm': 'a'.repeat(64),
        'nfsim.wasm': 'b'.repeat(64),
      },
    });
    const doc = r.finalize();
    const wasmAgents = doc['@graph'].filter(
      (n: any) => Array.isArray(n['@type']) && (n['@type'] as string[]).includes('bng:WASMModule'),
    );
    expect(wasmAgents).toHaveLength(2);
  });

  it('produces a complete parse → netgen → simulate chain', () => {
    const r = new ProvenanceRecorder();
    const modelEntity = r.recordParse(SAMPLE_BNGL, 'test_model');
    const { entity: netEntity } = r.recordNetworkGen(modelEntity['@id'], {
      nSpecies: 4,
      nReactions: 2,
    });
    const { outputEntity } = r.recordSimulation({
      modelEntityId: modelEntity['@id'],
      networkEntityId: netEntity['@id'],
      solver: 'cvode',
      solverConfig: { rtol: 1e-8, atol: 1e-10 },
      parameterVector: { kf: 0.1, kr: 0.01 },
      tSpan: [0, 100],
      nSteps: 1000,
    });
    r.markComplete({ elapsedMs: 42, nSteps: 1000 });
    const doc = r.finalize();

    // Chain: output → simulate-activity → (model, network, params) → parse/netgen activities → source
    expect(outputEntity['prov:wasDerivedFrom']).toContain(modelEntity['@id']);
    expect(outputEntity['prov:wasDerivedFrom']).toContain(netEntity['@id']);
    expect(netEntity['prov:wasDerivedFrom']).toContain(modelEntity['@id']);

    // Activities present
    const activities = doc['@graph'].filter(
      (n: any): n is ProvActivity => 'prov:startedAtTime' in n,
    );
    const actTypes = activities.flatMap((a: ProvActivity) => Array.isArray(a['@type']) ? a['@type'] : [a['@type']]);
    expect(actTypes).toEqual(
      expect.arrayContaining(['bng:Parse', 'bng:NetworkGeneration', 'bng:Simulate']),
    );
  });

  it('hash of same BNGL with different whitespace/comments is stable', () => {
    const h1 = sha256Normalized(SAMPLE_BNGL);
    const h2 = sha256Normalized(
      SAMPLE_BNGL.replace('begin parameters', '# a comment\nbegin parameters')
        .replace(/\n\s*\n/g, '\n\n'),
    );
    expect(h1).toBe(h2);
  });

  it('parameter hash is order-independent', () => {
    const h1 = sha256OfParams({ kf: 0.1, kr: 0.01 });
    const h2 = sha256OfParams({ kr: 0.01, kf: 0.1 });
    expect(h1).toBe(h2);
  });

  it('finalize is idempotent', () => {
    const r = new ProvenanceRecorder();
    r.recordParse(SAMPLE_BNGL, 'm');
    const d1 = r.finalize();
    const d2 = r.finalize();
    expect(d1['@graph'].length).toBe(d2['@graph'].length);
  });
});

describe('buildROCrate', () => {
  it('produces a zip with the required files and valid manifest', async () => {
    const r = new ProvenanceRecorder();
    const m = r.recordParse(SAMPLE_BNGL, 'test');
    r.recordNetworkGen(m['@id'], { nSpecies: 4, nReactions: 2 });
    const prov = r.finalize();

    const blob = await buildROCrate({
      provDocument: prov,
      bnglSource: SAMPLE_BNGL,
      results: fakeResults(),
      modelName: 'test_model',
    });

    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const files = Object.keys(zip.files);
    expect(files).toEqual(
      expect.arrayContaining(['ro-crate-metadata.json', 'prov.jsonld', 'model.bngl', 'results.gdat']),
    );

    const manifest = JSON.parse(
      await zip.file('ro-crate-metadata.json')!.async('string'),
    );
    expect(manifest['@context']).toBe('https://w3id.org/ro/crate/1.1/context');
    const root = manifest['@graph'].find((n: any) => n['@id'] === './');
    expect(root['@type']).toBe('Dataset');
    expect(root.hasPart.length).toBeGreaterThanOrEqual(3);
  });
});

function fakeResults() {
  return {
    time: [0, 1, 2],
    observables: { Cplx: [0, 50, 90] },
    meta: { method: 'ode' },
  } as any;
}
