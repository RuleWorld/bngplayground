import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const root = process.cwd();
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const build = spawnSync(npmCommand, ['run', 'build', '--workspace', '@bngplayground/mcp-server'], {
  cwd: root,
  stdio: 'inherit',
});
if (build.status !== 0) process.exit(build.status ?? 1);

const client = new Client(
  { name: 'bngplayground-inspector-smoke', version: '1.0.0' },
  { versionNegotiation: { mode: { pin: '2026-07-28' } } },
);
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['--import', 'tsx', 'packages/mcp-server/src/index.ts'],
  cwd: root,
  env: { ...process.env, BNG_MCP_PROFILE: 'stable' },
  stderr: 'inherit',
});

try {
  await client.connect(transport);
  const tools = await client.listTools();
  const resources = await client.listResources();
  const templates = await client.listResourceTemplates();
  const parsed = await client.callTool({
    name: 'parse_bngl',
    arguments: { code: 'begin model\nend model' },
  });
  process.stdout.write(JSON.stringify({
    protocol_era: client.getProtocolEra(),
    negotiated_version: client.getNegotiatedProtocolVersion(),
    tools: tools.tools.length,
    resources: resources.resources.length,
    resource_templates: templates.resourceTemplates.length,
    parse_is_error: parsed.isError === true,
  }, null, 2) + '\n');
  if (client.getProtocolEra() !== 'modern' || tools.tools.length !== 36 || parsed.isError === true) process.exitCode = 1;
} finally {
  await client.close();
}
