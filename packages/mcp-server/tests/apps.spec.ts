import { describe, expect, it } from 'vitest';

import {
  CONTACT_MAP_APP_URI,
  MCP_APP_MIME_TYPE,
  SIMULATION_APP_URI,
  createAppResourceReadResult,
  createAppToolMeta,
  listAppResources,
} from '../src/apps.js';
import { server } from '../src/index.js';
import { ListResourcesRequestSchema, ListToolsRequestSchema } from '../src/sdk.js';
import {
  classifyResultPayload,
  extractResultPayload,
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

  it('lists both self-contained UI resources with deny-by-default CSP', async () => {
    const result = await server.handle(ListResourcesRequestSchema, {});
    const resources = (result as { resources: ReturnType<typeof listAppResources> }).resources;

    expect(resources.map((resource) => resource.uri)).toEqual([
      SIMULATION_APP_URI,
      CONTACT_MAP_APP_URI,
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

    expect(simulate?._meta).toEqual(createAppToolMeta(SIMULATION_APP_URI));
    expect(contactMap?._meta).toEqual(createAppToolMeta(CONTACT_MAP_APP_URI));
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

  it('does not treat invalid text as a result payload', () => {
    expect(extractResultPayload({ content: [{ type: 'text', text: 'not json' }] })).toBeUndefined();
  });
});
