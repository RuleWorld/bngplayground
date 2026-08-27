import { describe, expect, it } from 'vitest';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';

import { buildServer } from '../packages/mcp-server/src/server';

const SIMPLE_BNGL = `begin parameters
  k 1
end parameters

begin molecule types
  A()
end molecule types

begin seed species
  A() 10
end seed species

begin observables
  Molecules A_total A()
end observables

begin reaction rules
  A() -> 0 k
end reaction rules
`;

const SCAN_BNGL = `begin parameters
  k 1
end parameters

begin molecule types
  A()
end molecule types

begin seed species
  A() 100
end seed species

begin observables
  Molecules A_total A()
end observables

begin reaction rules
  A() -> 0 k
end reaction rules
`;

const CONTACT_MAP_BNGL = `begin parameters
  k 1
end parameters

begin molecule types
  A(x)
  B(y)
end molecule types

begin seed species
  A(x) 10
  B(y) 10
end seed species

begin observables
  Molecules Complex A(x!1).B(y!1)
end observables

begin reaction rules
  bind: A(x) + B(y) -> A(x!1).B(y!1) k
end reaction rules
`;

const INVALID_BNGL = `begin parameters
  k 1
end parameters

begin molecule types
  A()
end molecule types

begin seed species
  A() 10
end seed species

begin reaction rules
  A() -> 0 k
end reaction rules
`;

async function withMcpClient<T>(callback: (client: Client) => Promise<T>): Promise<T> {
  const server = buildServer({ profile: 'stable' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: 'bngplayground-root-test', version: '1.0.0' },
    { versionNegotiation: { mode: 'legacy' } },
  );
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    return await callback(client);
  } finally {
    await client.close();
    await server.close();
  }
}

function callTool(name: string, arguments_: Record<string, unknown>): Promise<Awaited<ReturnType<Client['callTool']>>> {
  return withMcpClient((client) => client.callTool({ name, arguments: arguments_ }));
}

describe('MCP server tool handlers', () => {
  it('lists validated tool schemas', async () => {
    const result = await withMcpClient((client) => client.listTools());
    const toolNames = result.tools.map((tool: { name: string }) => tool.name);
    const simulateTool = result.tools.find((tool: { name: string }) => tool.name === 'simulate');

    expect(toolNames).toEqual(expect.arrayContaining([
      'parse_bngl',
      'generate_network',
      'simulate',
      'parameter_scan',
      'validate_model',
      'get_contact_map',
    ]));
    expect(simulateTool).toBeDefined();
    expect(simulateTool.inputSchema.properties.solver.enum).toContain('auto');
  });

  it('rejects invalid generate_network arguments', async () => {
    const result = await callTool('generate_network', {
      code: SIMPLE_BNGL,
      max_agents: -1,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({ type: 'text' });
    expect((result.content[0] as { text: string }).text).toContain('Invalid arguments for tool generate_network');
  });

  it('generates an expanded network from BNGL', async () => {
    const result = await callTool('generate_network', { code: SIMPLE_BNGL });

    expect(result.structuredContent.species.length).toBeGreaterThan(0);
    expect(result.structuredContent.reactions.length).toBeGreaterThan(0);
  });

  it('simulates a simple model through the MCP tool pipeline', async () => {
    const result = await callTool('simulate', {
      code: SIMPLE_BNGL,
      method: 'ssa',
      seed: 123,
      t_end: 1,
      n_steps: 4,
      include_species_data: true,
    });

    expect(result.structuredContent.headers).toContain('time');
    expect(result.structuredContent.headers).toContain('A_total');
    expect(result.structuredContent.data.length).toBe(5);
    expect(result.structuredContent.speciesHeaders).toContain('A()');
  });

  it('simulates a simple model using ODE (CVODE) through the MCP tool pipeline', async () => {
    const result = await callTool('simulate', {
      code: SIMPLE_BNGL,
      method: 'ode',
      t_end: 1,
      n_steps: 10,
    });

    expect(result.structuredContent.headers).toContain('time');
    expect(result.structuredContent.headers).toContain('A_total');
    expect(result.structuredContent.data.length).toBe(11);
    // Verify decreasing trend for A() -> 0
    const data = result.structuredContent.data as any[];
    expect(data[0]['A_total']).toBe(10);
    expect(data[10]['A_total']).toBeLessThan(10);
  });

  it('runs a parameter scan with reusable expanded network state', async () => {
    const result = await callTool('parameter_scan', {
      code: SCAN_BNGL,
      parameter: 'k',
      start: 0.5,
      end: 1.5,
      steps: 3,
      method: 'ssa',
      seed: 7,
      t_end: 3,
      n_steps: 6,
    });

    expect(result.structuredContent.mode).toBe('1d');
    expect(result.structuredContent.xValues).toEqual([0.5, 1, 1.5]);
    const aTotal = result.structuredContent.observables.A_total as number[];
    expect(aTotal).toHaveLength(3);
    expect(aTotal[0]).toBeGreaterThan(aTotal[2]);
  });

  it('validates parsed models and reports structural issues', async () => {
    const result = await callTool('validate_model', { code: INVALID_BNGL });

    expect(result.structuredContent.valid).toBe(false);
    expect(result.structuredContent.errors.some((issue: { code: string }) => issue.code === 'MISSING_OBSERVABLES')).toBe(true);
  });

  it('builds a contact map from reaction rules and molecule types', async () => {
    const result = await callTool('get_contact_map', { code: CONTACT_MAP_BNGL });

    expect(result.structuredContent.nodes.some((node: { label: string }) => node.label === 'A')).toBe(true);
    expect(result.structuredContent.nodes.some((node: { label: string }) => node.label === 'B')).toBe(true);
    expect(result.structuredContent.edges.length).toBeGreaterThan(0);
    expect(result.structuredContent.edges[0].interactionType).toBe('binding');
  });
});
