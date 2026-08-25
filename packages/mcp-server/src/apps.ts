import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MCP_APPS_EXTENSION_ID = 'io.modelcontextprotocol/ui';
export const MCP_APP_MIME_TYPE = 'text/html;profile=mcp-app';
export const MCP_APP_RESOURCE_URI_META_KEY = 'ui/resourceUri';

export const SIMULATION_APP_URI = 'ui://bngplayground/simulation.html';
export const CONTACT_MAP_APP_URI = 'ui://bngplayground/contact-map.html';

const APP_BUNDLE_FILENAME = 'bng-results.html';
const moduleDir = dirname(fileURLToPath(import.meta.url));

export interface AppResourceDescriptor {
  uri: string;
  name: string;
  title: string;
  description: string;
  mimeType: typeof MCP_APP_MIME_TYPE;
  _meta: {
    ui: {
      csp: {
        connectDomains: string[];
        resourceDomains: string[];
        frameDomains: string[];
        baseUriDomains: string[];
      };
      prefersBorder: true;
    };
  };
}

const APP_RESOURCE_META = {
  ui: {
    csp: {
      connectDomains: [],
      resourceDomains: [],
      frameDomains: [],
      baseUriDomains: [],
    },
    prefersBorder: true as const,
  },
};

const APP_RESOURCES: AppResourceDescriptor[] = [
  {
    uri: SIMULATION_APP_URI,
    name: 'bngplayground-simulation-results',
    title: 'BioNetGen simulation results',
    description: 'Interactive trajectory explorer for BioNetGen simulation output.',
    mimeType: MCP_APP_MIME_TYPE,
    _meta: APP_RESOURCE_META,
  },
  {
    uri: CONTACT_MAP_APP_URI,
    name: 'bngplayground-contact-map',
    title: 'BioNetGen contact map',
    description: 'Interactive contact-map viewer for BioNetGen models.',
    mimeType: MCP_APP_MIME_TYPE,
    _meta: APP_RESOURCE_META,
  },
];

export function createAppToolMeta(resourceUri: string) {
  return {
    ui: { resourceUri },
    [MCP_APP_RESOURCE_URI_META_KEY]: resourceUri,
  };
}

export function listAppResources(): AppResourceDescriptor[] {
  return APP_RESOURCES.map((resource) => ({
    ...resource,
    _meta: {
      ui: {
        ...resource._meta.ui,
        csp: { ...resource._meta.ui.csp },
      },
    },
  }));
}

export function createAppResourceReadResult(uri: string, html: string) {
  const resource = APP_RESOURCES.find((candidate) => candidate.uri === uri);
  if (!resource) {
    throw new Error(`Unknown MCP App resource: ${uri}`);
  }

  return {
    contents: [
      {
        uri,
        mimeType: MCP_APP_MIME_TYPE,
        text: html,
        _meta: resource._meta,
      },
    ],
  };
}

async function loadAppBundle(): Promise<string> {
  // Source execution (tsx) and compiled package execution place index.js at
  // different depths. Both resolve to packages/mcp-server/dist/apps.
  const candidates = [
    resolve(moduleDir, '..', 'dist', 'apps', APP_BUNDLE_FILENAME),
    resolve(moduleDir, '..', '..', '..', 'apps', APP_BUNDLE_FILENAME),
  ];

  const failures: string[] = [];
  for (const candidate of candidates) {
    try {
      return await readFile(candidate, 'utf8');
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(
    `MCP App bundle is unavailable. Run the MCP server build first. ${failures.join(' | ')}`,
  );
}

export async function readAppResource(uri: string) {
  if (!APP_RESOURCES.some((resource) => resource.uri === uri)) {
    throw new Error(`Unknown MCP App resource: ${uri}`);
  }
  const html = await loadAppBundle();
  return createAppResourceReadResult(uri, html);
}
