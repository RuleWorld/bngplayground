#!/usr/bin/env node
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { serveMcpStdio } from './stdio.js';

const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirectory = dirname(moduleFilename);
const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href
  || process.env.MCP_SERVER_RUN === 'true';

if (isMain) {
  // GUI-launched MCP clients may choose an unrelated working directory.
  process.chdir(resolve(moduleDirectory, '..', '..', '..'));

  // stdout is reserved for MCP JSON-RPC frames on stdio.
  const writeStderr = (prefix: string, args: unknown[]) => {
    process.stderr.write(`${prefix}${args.map(String).join(' ')}\n`);
  };
  console.log = (...args: unknown[]) => writeStderr('', args);
  console.info = (...args: unknown[]) => writeStderr('', args);
  console.debug = (...args: unknown[]) => writeStderr('[DEBUG] ', args);
  console.warn = (...args: unknown[]) => writeStderr('[WARN] ', args);
  console.error = (...args: unknown[]) => writeStderr('[ERROR] ', args);

  serveMcpStdio();
}

export { buildServer, resolveToolProfile, listRegisteredTools } from './server.js';
export { createHttpHandler, httpHandler } from './http.js';
export { serveMcpStdio } from './stdio.js';
export { getToolDefinitions, getToolNames, stableToolNames, fullToolNames } from './toolRegistry.js';
export type { BuildServerOptions } from './server.js';
export type { ToolProfile, BngToolDefinition } from './toolRegistry.js';
