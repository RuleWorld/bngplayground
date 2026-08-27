import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { describe, expect, it } from 'vitest';
import { RuleHubClient } from '@bngplayground/rulehub';

import { createHttpHandler } from '../src/http.js';
import {
  CONTACT_MAP_APP_URI,
  MCP_APP_MIME_TYPE,
  MODEL_STRUCTURE_APP_URI,
  PARAMETER_SCAN_APP_URI,
  SIMULATION_APP_URI,
  VALIDATION_APP_URI,
} from '../src/apps.js';

const SIMPLE_MODEL = `begin model
begin parameters
  k 1
end parameters
begin molecule types
  A()
end molecule types
begin seed species
  A() 1
end seed species
begin observables
  Molecules A_count A()
end observables
end model`;

describe('MCP 2026-07-28 HTTP serving', () => {
  it('negotiates the modern era and serves tools/resources through the v2 client', async () => {
    const ruleHubClient = new RuleHubClient({
      manifestUrl: 'https://rulehub.test/manifest.json',
      fetchImpl: async (input) => String(input).endsWith('.bngl')
        ? new Response(SIMPLE_MODEL, { status: 200, headers: { 'content-type': 'text/plain' } })
        : new Response(JSON.stringify({
          models: [{ id: 'fixture', name: 'Fixture model', path: 'models/fixture.bngl' }],
        }), { status: 200, headers: { 'content-type': 'application/json' } }),
    });
    const handler = createHttpHandler('stable', { ruleHubClient });
    const transport = new StreamableHTTPClientTransport(new URL('http://127.0.0.1/mcp'), {
      fetch: async (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set('host', '127.0.0.1');
        return handler.fetch(new Request(input, { ...init, headers }));
      },
    });
    const client = new Client(
      { name: 'bngplayground-protocol-test', version: '1.0.0' },
      { versionNegotiation: { mode: { pin: '2026-07-28' } } },
    );

    try {
      await client.connect(transport);
      expect(client.getProtocolEra()).toBe('modern');
      expect(client.getNegotiatedProtocolVersion()).toBe('2026-07-28');
      expect(client.getInstructions()).toContain('RuleHub');

      const tools = await client.listTools();
      expect(tools.tools).toHaveLength(36);
      const simulate = tools.tools.find((tool) => tool.name === 'simulate');
      expect(simulate?._meta?.ui).toEqual({ resourceUri: SIMULATION_APP_URI });
      expect(tools.tools.find((tool) => tool.name === 'compose_model')).toBeUndefined();

      const resources = await client.listResources();
      expect(resources.resources.map((resource) => resource.uri)).toEqual([
        MODEL_STRUCTURE_APP_URI,
        SIMULATION_APP_URI,
        CONTACT_MAP_APP_URI,
        PARAMETER_SCAN_APP_URI,
        VALIDATION_APP_URI,
        'rulehub://model/fixture',
      ]);
      expect(resources.resources.slice(0, 5).every((resource) => resource.mimeType === MCP_APP_MIME_TYPE)).toBe(true);

      const templates = await client.listResourceTemplates();
      expect(templates.resourceTemplates).toEqual(expect.arrayContaining([
        expect.objectContaining({ uriTemplate: 'rulehub://model/{id}' }),
      ]));

      const resource = await client.readResource({ uri: 'rulehub://model/fixture' });
      expect(resource.contents[0]).toMatchObject({
        uri: 'rulehub://model/fixture',
        mimeType: 'text/x-bngl',
        text: SIMPLE_MODEL,
        _meta: {
          rulehub: {
            repository: 'RuleWorld/RuleHub',
            ref: 'master',
            path: 'models/fixture.bngl',
            model_id: 'fixture',
          },
        },
      });

      const result = await client.callTool({
        name: 'parse_bngl',
        arguments: { code: SIMPLE_MODEL },
      });
      expect(result.isError).not.toBe(true);
      expect((result.structuredContent as { success: boolean }).success).toBe(true);
    } finally {
      await client.close();
      await handler.close();
    }
  }, 30_000);
});
