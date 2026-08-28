import { McpServer } from '@modelcontextprotocol/server';
import { RuleHubClient } from '@bngplayground/rulehub';
import {
  MCP_APPS_EXTENSION_ID,
  createAppResourceReadResult,
  createAppToolMeta,
  listAppResources,
  readAppResource,
} from './apps.js';
import { registerRuleHubResource } from './resources/rulehub.js';
import { getToolDefinitions, type ToolProfile } from './toolRegistry.js';

export interface BuildServerOptions {
  profile?: ToolProfile;
  ruleHubClient?: RuleHubClient;
  requestStateVerify?: (state: string) => unknown | Promise<unknown>;
}

const SERVER_INSTRUCTIONS = [
  'BioNetGen/RuleWorld MCP server.',
  'Use parse_bngl to inspect supplied BNGL and validate_model to check semantic and engine compatibility.',
  'Use direct BNGL authoring and edit_model for deterministic edits; compose_model is legacy/full-profile only.',
  'Use search_models for RuleHub discovery, then read the returned rulehub://model/{id} resource for exact BNGL and provenance.',
  'Stable profile names are the supported contract. The full profile exposes legacy compatibility aliases.',
].join(' ');

export function resolveToolProfile(value: string | undefined = process.env.BNG_MCP_PROFILE): ToolProfile {
  const profile = value?.trim() || 'stable';
  if (profile !== 'stable' && profile !== 'full') {
    throw new Error(`Unknown BNG_MCP_PROFILE "${profile}". Expected "stable" or "full".`);
  }
  return profile;
}

function registerAppResources(server: McpServer): void {
  for (const resource of listAppResources()) {
    server.registerResource(
      resource.name,
      resource.uri,
      {
        title: resource.title,
        description: resource.description,
        mimeType: resource.mimeType,
        _meta: resource._meta,
      },
      async (uri) => readAppResource(uri.href),
    );
  }
}

export function buildServer(options: BuildServerOptions = {}): McpServer {
  const profile = resolveToolProfile(options.profile);
  const server = new McpServer(
    { name: 'bngplayground-mcp-server', version: '1.0.0' },
    {
      instructions: SERVER_INSTRUCTIONS,
      supportedProtocolVersions: ['2026-07-28'],
      capabilities: {
        tools: {},
        resources: {},
        extensions: {
          [MCP_APPS_EXTENSION_ID]: {},
        },
      } as never,
      ...(options.requestStateVerify
        ? { requestState: { verify: options.requestStateVerify } }
        : {}),
    },
  );

  for (const definition of getToolDefinitions(profile)) {
    const appMetadata = definition.appResourceUri
      ? createAppToolMeta(definition.appResourceUri)
      : {};
    server.registerTool(
      definition.name,
      {
        title: definition.title,
        description: definition.description,
        inputSchema: definition.inputSchema,
        outputSchema: definition.outputSchema,
        annotations: definition.annotations,
        _meta: {
          ...appMetadata,
          'bngplayground/category': definition.category,
          'bngplayground/profile': profile,
          ...(definition.metadata ?? {}),
        },
      },
      async (args, ctx) => definition.handler(args as Record<string, unknown>, ctx.mcpReq.signal),
    );
  }

  registerAppResources(server);
  registerRuleHubResource(server, options.ruleHubClient ?? new RuleHubClient());
  return server;
}

export function listRegisteredTools(profile?: ToolProfile) {
  return getToolDefinitions(resolveToolProfile(profile));
}

export { createAppResourceReadResult };
