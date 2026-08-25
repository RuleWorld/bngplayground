import { describe, expect, it } from 'vitest';

import { classifyResultPayload, getParameterScanHeatmap, getParameterScanRows } from '../apps/src/resultAdapters.js';
import { handleParameterScan } from '../src/handlers/parameterScan.js';
import { handleParseBngl } from '../src/handlers/parseBngl.js';
import { handleValidateModel } from '../src/handlers/validateModel.js';

const MODEL = `begin model
begin parameters
  kon 0.01
  koff 0.1
end parameters
begin molecule types
  A(b)
  B(a)
end molecule types
begin seed species
  A(b) 100
  B(a) 100
end seed species
begin observables
  Molecules FreeA A(b)
  Molecules Bound A(b!1).B(a!1)
end observables
begin reaction rules
  bind: A(b) + B(a) -> A(b!1).B(a!1) kon
  unbind: A(b!1).B(a!1) -> A(b) + B(a) koff
end reaction rules
end model`;

describe('MCP App result integration', () => {
  it('recognizes the live parse_bngl payload as a model-structure result', async () => {
    const result = await handleParseBngl({ code: MODEL });
    expect(classifyResultPayload(result.structuredContent)).toBe('model');
    expect(result.structuredContent.model.reactionRules).toHaveLength(2);
  });

  it('recognizes the live validation payload as a validation result', async () => {
    const result = await handleValidateModel({ code: MODEL, include_nfsim: true });
    expect(classifyResultPayload(result.structuredContent)).toBe('validation');
    expect(result.structuredContent.parseSuccess).toBe(true);
  });

  it('recognizes and charts the live parameter_scan payload', async () => {
    const result = await handleParameterScan({
      code: MODEL,
      parameter: 'kon',
      start: 0.005,
      end: 0.02,
      steps: 3,
      t_end: 1,
      n_steps: 2,
    });

    expect(classifyResultPayload(result.structuredContent)).toBe('parameter-scan');
    expect(getParameterScanRows(result.structuredContent)).toHaveLength(3);
  });

  it('preserves x/y coordinates for a live 2D parameter-scan heatmap', async () => {
    const result = await handleParameterScan({
      code: MODEL,
      parameter: 'kon',
      start: 0.005,
      end: 0.02,
      steps: 3,
      parameter2: 'koff',
      start2: 0.05,
      end2: 0.2,
      steps2: 2,
      t_end: 1,
      n_steps: 2,
    });

    expect(result.structuredContent.mode).toBe('2d');
    const heatmap = getParameterScanHeatmap(result.structuredContent, 'Bound');
    expect(heatmap).toHaveLength(6);
    expect(heatmap.map(({ x, y }) => [x, y])).toEqual([
      [0.005, 0.05],
      [0.0125, 0.05],
      [0.02, 0.05],
      [0.005, 0.2],
      [0.0125, 0.2],
      [0.02, 0.2],
    ]);
  });
});
