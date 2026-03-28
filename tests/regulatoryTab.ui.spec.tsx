// @vitest-environment jsdom
import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { parseBNGLStrict } from '../packages/engine/src/parser/BNGLParserWrapper';

const viewerMock = vi.hoisted(() => ({
  onRender: vi.fn(),
}));

vi.mock('../components/ARGraphViewer', () => ({
  ARGraphViewer: ({ arGraph }: { arGraph: { nodes: Array<{ id: string }>; edges: Array<{ from: string; to: string; edgeType: string }> } }) => {
    viewerMock.onRender(arGraph);
    return <div data-testid="ar-graph-viewer" />;
  },
}));

import { RegulatoryTab } from '../components/tabs/RegulatoryTab';

const NEG_FEEDBACK_MODEL = `begin model
begin parameters
k_transcribe 1.0
k_translate 4.0
k_bind 0.002
k_unbind 0.001
k_deg_m 0.2
k_deg_p 0.1
end parameters

begin molecule types
Gene(state~free~bound)
mRNA()
Protein(g)
end molecule types

begin seed species
Gene(state~free) 1
end seed species

begin observables
Molecules Free_gene Gene(state~free)
Molecules Bound_gene Gene(state~bound!?)
Molecules Transcript mRNA()
Molecules Protein Protein()
end observables

begin reaction rules
Gene(state~free) -> Gene(state~free) + mRNA() k_transcribe
mRNA() -> mRNA() + Protein(g) k_translate
Protein(g) + Gene(state~free) <-> Protein(g!1).Gene(state~bound!1) k_bind, k_unbind
mRNA() -> 0 k_deg_m
Protein(g) -> 0 k_deg_p
end reaction rules
end model`;

describe('RegulatoryTab UI edge coverage', () => {
  it('passes expected influence edges to ARGraphViewer for unchanged species context', () => {
    viewerMock.onRender.mockClear();
    const model = parseBNGLStrict(NEG_FEEDBACK_MODEL);

    render(<RegulatoryTab model={model} />);

    expect(viewerMock.onRender).toHaveBeenCalled();
    const arGraph = viewerMock.onRender.mock.calls.at(-1)?.[0] as
      | { nodes: Array<{ id: string }>; edges: Array<{ from: string; to: string; edgeType: string }> }
      | undefined;
    if (!arGraph) {
      throw new Error('Expected ARGraphViewer to receive a graph payload');
    }

    const edges: Array<{ from: string; to: string; edgeType: string }> = arGraph.edges;

    expect(edges.some((edge: { from: string; to: string; edgeType: string }) => edge.from === 'Gene(state)' && edge.to === '_R1' && edge.edgeType === 'modifies')).toBe(true);
    expect(edges.some((edge: { from: string; to: string; edgeType: string }) => edge.from === 'mRNA' && edge.to === '_R2' && edge.edgeType === 'modifies')).toBe(true);
  });
});
