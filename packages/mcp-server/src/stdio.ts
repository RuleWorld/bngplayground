import { serveStdio, type StdioServerHandle } from '@modelcontextprotocol/server/stdio';
import { buildServer, resolveToolProfile } from './server.js';
import type { ToolProfile } from './toolRegistry.js';

export function serveMcpStdio(profile?: ToolProfile): StdioServerHandle {
  return serveStdio(() => buildServer({ profile: resolveToolProfile(profile) }));
}
