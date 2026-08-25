import { describe, expect, it } from 'vitest';

import {
  CONTACT_MAP_APP_URI,
  MCP_APP_MIME_TYPE,
  MODEL_STRUCTURE_APP_URI,
  PARAMETER_SCAN_APP_URI,
  SIMULATION_APP_URI,
  VALIDATION_APP_URI,
  createAppResourceReadResult,
  createAppToolMeta,
  listAppResources,
} from '../src/apps.js';
import { server } from '../src/index.js';
import { ListResourcesRequestSchema, ListToolsRequestSchema } from '../src/sdk.js';
import {
  classifyResultPayload,
  extractResultPayload,
  getParameterScanHeatmap,
  getParameterScanRows,
  getParameterScanSeries,
  getSimulationData,
  getSimulationSeries,
} from '../apps/src/resultAdapters.js';

describe('MCP Apps server metadata', () => {
  it('advertises modern and legacy tool resource metadata', () => {
    expect(createAppToolMeta(SIMULATION_APP_URI)).toEqual({
      ui: { resourceUri: SIMULATION_APP_URI },
      'ui/resourceUri': SIMULATION_APP_URI,
    });
  });

  it('lists all self-contained UI resources with deny-by-default CSP', async () => {
    const result = await server.handle(ListResourcesRequestSchema, {});
    const resources = (result as { resources: ReturnType<typeof listAppResources> }).resources;

    expect(resources.map((resource) => resource.uri)).toEqual([
      MODEL_STRUCTURE_APP_URI,
      SIMULATION_APP_URI,
      CONTACT_MAP_APP_URI,
      PARAMETER_SCAN_APP_URI,
      VALIDATION_APP_URI,
    ]);
    expect(resources.every((resource) => resource.mimeType === MCP_APP_MIME_TYPE)).toBe(true);
    expect(resources[0]._meta.ui.csp).toEqual({
      connectDomains: [],
      resourceDomains: [],
      frameDomains: [],
      baseUriDomains: [],
    });
  });

  it('attaches the appropriate App resource to each pilot tool', async () => {
    const result = await server.handle(ListToolsRequestSchema, {});
    const tools = (result as { tools: Array<{ name: string; description?: string; inputSchema?: { properties?: Record<string, { description?: string }> }; _meta?: Record<string, unknown> }> }).tools;
    const simulate = tools.find((tool) => tool.name === 'simulate');
    const contactMap = tools.find((tool) => tool.name === 'get_contact_map');
    const parseBngl = tools.find((tool) => tool.name === 'parse_bngl');
    const parameterScan = tools.find((tool) => tool.name === 'parameter_scan');
    const validateModel = tools.find((tool) => tool.name === 'validate_model');

    expect(parseBngl?._meta).toEqual(createAppToolMeta(MODEL_STRUCTURE_APP_URI));
    expect(simulate?._meta).toEqual(createAppToolMeta(SIMULATION_APP_URI));
    expect(contactMap?._meta).toEqual(createAppToolMeta(CONTACT_MAP_APP_URI));
    expect(parameterScan?._meta).toEqual(createAppToolMeta(PARAMETER_SCAN_APP_URI));
    expect(validateModel?._meta).toEqual(createAppToolMeta(VALIDATION_APP_URI));
    expect(simulate?.inputSchema?.properties?.solver?.description).toContain('Defaults to auto');
  });

  it('returns MCP App HTML with resource-level UI metadata', () => {
    const result = createAppResourceReadResult(CONTACT_MAP_APP_URI, '<html>contact map</html>');

    expect(result.contents[0]).toMatchObject({
      uri: CONTACT_MAP_APP_URI,
      mimeType: MCP_APP_MIME_TYPE,
      text: '<html>contact map</html>',
      _meta: { ui: { prefersBorder: true } },
    });
  });

  it('rejects unknown UI resource identifiers', () => {
    expect(() => createAppResourceReadResult('ui://bngplayground/unknown.html', '<html />'))
      .toThrow('Unknown MCP App resource');
  });
});

describe('MCP App result adapters', () => {
  const simulation = {
    headers: ['time', 'A', 'B'],
    data: [{ time: 0, A: 1, B: 2 }],
    dataBySuffix: {
      phase2: [{ time: 1, A: 3, B: 4 }],
    },
  };

  it('prefers structured content and classifies simulation results', () => {
    const payload = extractResultPayload({
      structuredContent: simulation,
      content: [{ type: 'text', text: '{"ignored":true}' }],
    });

    expect(payload).toBe(simulation);
    expect(classifyResultPayload(payload)).toBe('simulation');
    expect(getSimulationSeries(simulation)).toEqual(['A', 'B']);
    expect(getSimulationData(simulation, 'phase2')).toEqual([{ time: 1, A: 3, B: 4 }]);
  });

  it('falls back to JSON text for hosts that omit structured content', () => {
    const payload = extractResultPayload({
      content: [{ type: 'text', text: JSON.stringify({ nodes: [], edges: [] }) }],
    });

    expect(classifyResultPayload(payload)).toBe('contact-map');
  });

  it('recognizes structured MCP error payloads', () => {
    expect(classifyResultPayload({ error: 'parse failed', recovery: 'fix line 4' })).toBe('error');
    expect(classifyResultPayload({
      error: 'STIFF_DETECTED',
      partial_result: simulation,
    })).toBe('error');
  });

  it('classifies parsed models and validation reports', () => {
    expect(classifyResultPayload({ success: true, model: { reactionRules: [] }, errors: [] })).toBe('model');
    expect(classifyResultPayload({
      valid: true,
      parseSuccess: true,
      summary: { errors: 0, warnings: 0, info: 1 },
      errors: [],
      warnings: [],
      info: [],
    })).toBe('validation');
  });

  it('adapts 1D parameter scans into chart rows', () => {
    const scan = {
      mode: '1d' as const,
      parameter: 'kon',
      xValues: [0.1, 1],
      observables: { Bound: [2, 8], Free: [8, 2] },
    };

    expect(classifyResultPayload(scan)).toBe('parameter-scan');
    expect(getParameterScanSeries(scan)).toEqual(['Bound', 'Free']);
    expect(getParameterScanRows(scan)).toEqual([
      { kon: 0.1, Bound: 2, Free: 8 },
      { kon: 1, Bound: 8, Free: 2 },
    ]);
  });

  it('adapts 2D parameter scans using the engine y-by-x matrix order', () => {
    const scan = {
      mode: '2d' as const,
      parameter: 'kon',
      parameter2: 'koff',
      xValues: [1, 2],
      yValues: [10, 20],
      observables: { Bound: [[11, 12], [21, 22]] },
    };

    expect(getParameterScanHeatmap(scan, 'Bound')).toEqual([
      { x: 1, y: 10, value: 11 },
      { x: 2, y: 10, value: 12 },
      { x: 1, y: 20, value: 21 },
      { x: 2, y: 20, value: 22 },
    ]);
  });

  it('does not treat invalid text as a result payload', () => {
    expect(extractResultPayload({ content: [{ type: 'text', text: 'not json' }] })).toBeUndefined();
  });
});
