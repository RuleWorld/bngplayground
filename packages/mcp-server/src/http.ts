import {
  createMcpHandler,
  hostHeaderValidationResponse,
  localhostAllowedHostnames,
  localhostAllowedOrigins,
  originValidationResponse,
  type McpHttpHandler,
} from '@modelcontextprotocol/server';
import type { RuleHubClient } from '@bngplayground/rulehub';
import { buildServer, resolveToolProfile } from './server.js';
import type { ToolProfile } from './toolRegistry.js';

export function createHttpHandler(
  profile?: ToolProfile,
  options: { ruleHubClient?: RuleHubClient } = {},
): McpHttpHandler {
  const handler = createMcpHandler(
    () => buildServer({ profile: resolveToolProfile(profile), ruleHubClient: options.ruleHubClient }),
    { legacy: 'stateless' },
  );

  return {
    ...handler,
    fetch: async (request, requestOptions) => {
      const rejection =
        hostHeaderValidationResponse(request, localhostAllowedHostnames()) ??
        originValidationResponse(request, localhostAllowedOrigins());
      return rejection ?? handler.fetch(request, requestOptions);
    },
  };
}

export const httpHandler = createHttpHandler();

export default httpHandler;
