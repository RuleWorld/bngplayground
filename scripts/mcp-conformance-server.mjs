import http from 'node:http';
import process from 'node:process';

import {
  createMcpHandler,
  hostHeaderValidationResponse,
  localhostAllowedHostnames,
  localhostAllowedOrigins,
  originValidationResponse,
} from '@modelcontextprotocol/server';
import { RuleHubClient } from '@bngplayground/rulehub';
import { registerConformanceFixtures } from './conformance-fixtures.mjs';
import { buildServer } from '../packages/mcp-server/src/server.ts';

const simpleModel = `begin model
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

const ruleHubClient = new RuleHubClient({
  manifestUrl: 'https://conformance.rulehub.test/manifest.json',
  fetchImpl: async (input) => String(input).endsWith('.bngl')
    ? new Response(simpleModel, { status: 200, headers: { 'content-type': 'text/plain' } })
    : new Response(JSON.stringify({
      models: [{
        id: 'conformance-fixture',
        name: 'Conformance fixture',
        path: 'models/conformance-fixture.bngl',
        tags: ['fixture'],
        compatibility: { bng2: true, methods: ['ode'] },
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }),
});

let baseHandler;
baseHandler = createMcpHandler(() => {
  const server = buildServer({
    profile: 'stable',
    ruleHubClient,
    requestStateVerify: (state) => {
      if (state.endsWith('-TAMPERED')) throw new Error('tampered request state');
      return state;
    },
  });
  registerConformanceFixtures(server, baseHandler?.notify);
  return server;
}, { legacy: 'stateless' });

const handler = {
  ...baseHandler,
  fetch: async (request, requestOptions) => {
    const rejection =
      hostHeaderValidationResponse(request, localhostAllowedHostnames()) ??
      originValidationResponse(request, localhostAllowedOrigins());
    return rejection ?? baseHandler.fetch(request, requestOptions);
  },
};

async function readRequestBody(request) {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined;
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function writeResponse(nodeResponse, response) {
  const headers = {};
  response.headers.forEach((value, key) => { headers[key] = value; });
  nodeResponse.writeHead(response.status, headers);
  if (!response.body) {
    nodeResponse.end();
    return;
  }
  const reader = response.body.getReader();
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      nodeResponse.write(Buffer.from(next.value));
    }
  } finally {
    reader.releaseLock();
  }
  nodeResponse.end();
}

const server = http.createServer(async (nodeRequest, nodeResponse) => {
  try {
    const body = await readRequestBody(nodeRequest);
    const request = new Request(`http://${nodeRequest.headers.host ?? '127.0.0.1'}${nodeRequest.url ?? '/'}`, {
      method: nodeRequest.method,
      headers: nodeRequest.headers,
      body,
    });
    await writeResponse(nodeResponse, await handler.fetch(request));
  } catch {
    if (!nodeResponse.headersSent) nodeResponse.writeHead(500, { 'content-type': 'text/plain' });
    nodeResponse.end('Internal server error');
  }
});

server.listen(Number(process.env.MCP_CONFORMANCE_PORT ?? 0), '127.0.0.1', () => {
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not determine conformance server port');
  process.stdout.write(`READY ${address.port}\n`);
});

async function shutdown() {
  server.close();
  await handler.close();
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
