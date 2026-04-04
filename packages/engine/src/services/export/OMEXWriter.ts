/**
 * OMEXWriter.ts — COMBINE/OMEX archive generator.
 *
 * Packages BNGL + SED-ML + Dublin Core metadata into a ZIP archive
 * conforming to the COMBINE archive specification.
 */

import type { BNGLModel } from '../../types';
import { generateSedML, SedMLExportOptions } from './SedMLWriter';
import { createZip, ZipEntry } from '../../utils/miniZip';
import { escapeXml } from '../../utils/xmlUtils';

// ── Types ────────────────────────────────────────────────────────────

export interface OMEXExportOptions {
  /** Model name */
  modelName?: string;
  /** BNGL source code */
  bnglCode: string;
  /** SED-ML document (or generate from model) */
  sedml?: string;
  /** Dublin Core metadata */
  metadata?: {
    title?: string;
    creators?: string[];
    description?: string;
    created?: string;
    modified?: string;
  };
  /** Simulation options (used to generate SED-ML if not provided) */
  simulationOptions?: SedMLExportOptions;
}

// ── XML Helpers ──────────────────────────────────────────────────────

function generateManifest(hasMetadata: boolean): string {
  const entries = [
    `  <content location="." format="http://identifiers.org/combine.specifications/omex"/>`,
    `  <content location="model.bngl" format="http://identifiers.org/combine.specifications/bngl"/>`,
    `  <content location="experiment.sedml" format="http://identifiers.org/combine.specifications/sed-ml"/>`,
  ];

  if (hasMetadata) {
    entries.push(`  <content location="metadata.rdf" format="http://identifiers.org/combine.specifications/omex-metadata"/>`);
  }

  return `<?xml version="1.0" encoding="utf-8"?>
<omexManifest xmlns="http://identifiers.org/combine.specifications/omex-manifest">
${entries.join('\n')}
</omexManifest>`;
}

function generateMetadataRDF(metadata: NonNullable<OMEXExportOptions['metadata']>): string {
  const title = metadata.title ? `    <dc:title>${escapeXml(metadata.title)}</dc:title>` : '';
  const description = metadata.description
    ? `    <dc:description>${escapeXml(metadata.description)}</dc:description>`
    : '';

  const created = metadata.created
    ? `    <dcterms:created rdf:parseType="Resource">
      <dcterms:W3CDTF>${escapeXml(metadata.created)}</dcterms:W3CDTF>
    </dcterms:created>`
    : '';

  const modified = metadata.modified
    ? `    <dcterms:modified rdf:parseType="Resource">
      <dcterms:W3CDTF>${escapeXml(metadata.modified)}</dcterms:W3CDTF>
    </dcterms:modified>`
    : '';

  const creators = (metadata.creators ?? []).map((name) =>
    `    <dc:creator>
      <vCard:hasName rdf:parseType="Resource">
        <vCard:family-name>${escapeXml(name)}</vCard:family-name>
      </vCard:hasName>
    </dc:creator>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:dc="http://purl.org/dc/elements/1.1/"
         xmlns:dcterms="http://purl.org/dc/terms/"
         xmlns:vCard="http://www.w3.org/2006/vcard/ns#">
  <rdf:Description rdf:about=".">
${[title, description, created, modified, creators].filter(Boolean).join('\n')}
  </rdf:Description>
</rdf:RDF>`;
}

// ── Main ─────────────────────────────────────────────────────────────

export function generateOMEX(model: BNGLModel, options: OMEXExportOptions): Uint8Array {
  const encoder = new TextEncoder();

  // Generate SED-ML if not provided
  const sedml = options.sedml ?? generateSedML(model, options.simulationOptions ?? {
    method: 'ode',
    t_end: 100,
    n_steps: 100,
  });

  const hasMetadata = !!options.metadata;
  const manifest = generateManifest(hasMetadata);

  const entries: ZipEntry[] = [
    { name: 'manifest.xml', data: encoder.encode(manifest) },
    { name: 'model.bngl', data: encoder.encode(options.bnglCode) },
    { name: 'experiment.sedml', data: encoder.encode(sedml) },
  ];

  if (options.metadata) {
    const rdf = generateMetadataRDF(options.metadata);
    entries.push({ name: 'metadata.rdf', data: encoder.encode(rdf) });
  }

  return createZip(entries);
}
