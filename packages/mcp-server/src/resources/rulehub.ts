import {
  ResourceTemplate,
  type McpServer,
  type ReadResourceResult,
  type ServerContext,
  type Variables,
} from '@modelcontextprotocol/server';
import { RuleHubClient, type RuleHubResolvedModel } from '@bngplayground/rulehub';

export const RULEHUB_MODEL_URI_TEMPLATE = 'rulehub://model/{id}';
export const RULEHUB_MODEL_MIME_TYPE = 'text/x-bngl';

function variableId(variables: Variables): string {
  const value = variables.id;
  if (Array.isArray(value) || typeof value !== 'string' || value.length === 0) {
    throw new Error('RuleHub resource requires one manifest model ID');
  }
  return decodeURIComponent(value);
}

function resourceForModel(model: RuleHubResolvedModel) {
  return {
    uri: `rulehub://model/${encodeURIComponent(model.id)}`,
    name: model.id,
    title: model.metadata.name,
    description: model.metadata.description ?? 'RuleHub BNGL model',
    mimeType: RULEHUB_MODEL_MIME_TYPE,
  };
}

async function readRuleHubModel(
  client: RuleHubClient,
  uri: URL,
  variables: Variables,
): Promise<ReadResourceResult> {
  const model = await client.getModel(variableId(variables));
  return {
    contents: [{
      uri: uri.href,
      mimeType: RULEHUB_MODEL_MIME_TYPE,
      text: model.code,
      _meta: {
        rulehub: model.provenance,
        metadata: model.metadata,
      },
    }],
  };
}

export function registerRuleHubResource(server: McpServer, client: RuleHubClient): void {
  const template = new ResourceTemplate(RULEHUB_MODEL_URI_TEMPLATE, {
    list: async () => {
      try {
        const manifest = await client.getManifest();
        return {
          resources: manifest.models
            .filter((entry) => entry.compatibility?.excluded !== true)
            .map((entry) => resourceForModel({
              id: entry.id,
              code: '',
              metadata: entry,
              provenance: {
                repository: manifest.repository,
                ref: manifest.ref,
                path: entry.path,
                model_id: entry.id,
                ...(entry.citation ? { citation: entry.citation } : {}),
                retrieved_at: new Date().toISOString(),
                revision: manifest.revision,
              },
            })),
        };
      } catch {
        // A RuleHub outage must not make the server's static App resources or
        // resource-template advertisement unavailable. Exact reads and the
        // search_models tool still report the authoritative fetch failure.
        return { resources: [] };
      }
    },
  });

  server.registerResource(
    'rulehub-model',
    template,
    {
      title: 'RuleHub BNGL model',
      description: 'Exact read-only BNGL source and provenance from RuleWorld/RuleHub.',
      mimeType: RULEHUB_MODEL_MIME_TYPE,
    },
    (uri, variables, _ctx: ServerContext) => readRuleHubModel(client, uri, variables),
  );
}
