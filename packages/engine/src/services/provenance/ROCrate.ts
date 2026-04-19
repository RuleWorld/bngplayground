/**
 * ROCrate — package simulation results + provenance into an RO-Crate 1.1 zip.
 *
 * Reference: https://www.researchobject.org/ro-crate/1.1/
 *
 * Minimal layout:
 *   /
 *   ├── ro-crate-metadata.json     — crate manifest (JSON-LD)
 *   ├── prov.jsonld                — PROV-O document
 *   ├── model.bngl                 — BNGL source
 *   ├── results.gdat               — tab-separated simulation output (optional)
 *   └── results.json               — full SimulationResults as JSON (optional)
 *
 * The manifest conforms to conformsTo https://w3id.org/ro/crate/1.1.
 */

import JSZip from 'jszip';
import type { ProvDocument } from './types';
import type { SimulationResults } from '../../types';
import { gdatFromResults } from '../../utils/gdatWriter.ts';

export interface ROCrateConfig {
  provDocument: ProvDocument;
  bnglSource: string;
  results: SimulationResults;
  modelName?: string;
  includeGdat?: boolean;
  includeJsonResults?: boolean;
  extraFiles?: Array<{ name: string; content: string | Uint8Array; description?: string }>;
}

const RO_CRATE_CONTEXT = 'https://w3id.org/ro/crate/1.1/context';
const RO_CRATE_CONFORMS_TO = 'https://w3id.org/ro/crate/1.1';

export async function buildROCrate(config: ROCrateConfig): Promise<Blob> {
  const zip = new JSZip();
  const modelName = config.modelName ?? 'model';

  // 1. BNGL source
  zip.file('model.bngl', config.bnglSource);

  // 2. Provenance document
  zip.file('prov.jsonld', JSON.stringify(config.provDocument, null, 2));

  // 3. Results
  const hasParts: Array<{ id: string; name: string; description: string; encodingFormat: string }> = [
    { id: 'model.bngl', name: modelName, description: 'BNGL source', encodingFormat: 'text/x-bngl' },
    { id: 'prov.jsonld', name: 'Provenance', description: 'W3C PROV-O provenance document', encodingFormat: 'application/ld+json' },
  ];

  if (config.includeGdat ?? true) {
    zip.file('results.gdat', gdatFromResults(config.results));
    hasParts.push({
      id: 'results.gdat',
      name: 'Simulation output (GDAT)',
      description: 'Tab-separated observables over time',
      encodingFormat: 'text/tab-separated-values',
    });
  }

  if (config.includeJsonResults ?? false) {
    zip.file('results.json', JSON.stringify(config.results, null, 2));
    hasParts.push({
      id: 'results.json',
      name: 'Simulation output (JSON)',
      description: 'Full SimulationResults',
      encodingFormat: 'application/json',
    });
  }

  for (const f of config.extraFiles ?? []) {
    zip.file(f.name, f.content);
    hasParts.push({
      id: f.name,
      name: f.name,
      description: f.description ?? '',
      encodingFormat: inferEncoding(f.name),
    });
  }

  // 4. RO-Crate manifest
  const manifest = buildManifest(modelName, hasParts, config.provDocument);
  zip.file('ro-crate-metadata.json', JSON.stringify(manifest, null, 2));

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

function buildManifest(
  modelName: string,
  hasParts: Array<{ id: string; name: string; description: string; encodingFormat: string }>,
  prov: ProvDocument,
): Record<string, unknown> {
  return {
    '@context': RO_CRATE_CONTEXT,
    '@graph': [
      {
        '@id': 'ro-crate-metadata.json',
        '@type': 'CreativeWork',
        conformsTo: { '@id': RO_CRATE_CONFORMS_TO },
        about: { '@id': './' },
      },
      {
        '@id': './',
        '@type': 'Dataset',
        name: `BNG Playground simulation: ${modelName}`,
        description: `Simulation results with full PROV-O provenance produced by BNG Playground ${prov['bng:playgroundVersion']}`,
        datePublished: prov['bng:generatedAt'],
        license: { '@id': 'https://spdx.org/licenses/MIT.html' },
        hasPart: hasParts.map((p) => ({ '@id': p.id })),
      },
      ...hasParts.map((p) => ({
        '@id': p.id,
        '@type': 'File',
        name: p.name,
        description: p.description,
        encodingFormat: p.encodingFormat,
      })),
    ],
  };
}

function inferEncoding(name: string): string {
  if (name.endsWith('.json')) return 'application/json';
  if (name.endsWith('.jsonld')) return 'application/ld+json';
  if (name.endsWith('.bngl')) return 'text/x-bngl';
  if (name.endsWith('.gdat') || name.endsWith('.tsv')) return 'text/tab-separated-values';
  if (name.endsWith('.csv')) return 'text/csv';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.svg')) return 'image/svg+xml';
  if (name.endsWith('.xml')) return 'application/xml';
  return 'application/octet-stream';
}
