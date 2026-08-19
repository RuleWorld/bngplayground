/**
 * packages/mcp-server/src/services/pathwayCommons/pathwayCommonsService.ts
 *
 * Pathway Commons REST API client for querying known protein-protein
 * interactions and pathways.
 */

import { parseBNGLWithANTLR } from '@bngplayground/engine';

const PC_API_BASE = 'https://www.pathwaycommons.org/pc2';
const DEFAULT_TIMEOUT_MS = (process.env.VITEST || process.env.NODE_ENV === 'test') ? 1_000 : 15_000;

export interface PCInteraction {
  source: string;
  type: string;
  target: string;
  dataSources: string[];
  inModel: boolean;
}

export interface PCPathway {
  name: string;
  dataSource: string;
  uri: string;
  matchedMolecules: string[];
}

export interface PCQueryResult {
  interactions: PCInteraction[];
  missingInteractions: PCInteraction[];
  confirmedInteractions: PCInteraction[];
  pathways: PCPathway[];
  unknownMolecules: string[];
  summary: string;
}

interface SIFEntry {
  source: string;
  type: string;
  target: string;
}

function parseSIF(text: string): SIFEntry[] {
  const entries: SIFEntry[] = [];
  for (const line of text.split('\n')) {
    const parts = line.trim().split('\t');
    if (parts.length >= 3) {
      entries.push({
        source: parts[0],
        type: parts[1],
        target: parts[2],
      });
    }
  }
  return entries;
}

async function pcFetch(url: string, timeout = DEFAULT_TIMEOUT_MS): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      if (response.status === 404 || response.status === 452) {
        return '';
      }
      throw new Error(`Pathway Commons API error (${response.status}): ${response.statusText}`);
    }
    return await response.text();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Pathway Commons request timed out after ${timeout}ms`, { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function queryGraph(
  molecules: string[],
  kind: 'PATHSBETWEEN' | 'NEIGHBORHOOD' = 'PATHSBETWEEN',
): Promise<SIFEntry[]> {
  if (molecules.length < 2 && kind === 'PATHSBETWEEN') return [];
  if (molecules.length === 0) return [];

  const sourceParam = molecules.map((m) => encodeURIComponent(m)).join('&source=');
  const url = `${PC_API_BASE}/graph?source=${sourceParam}&kind=${kind}&format=SIF&limit=1`;

  const text = await pcFetch(url);
  return parseSIF(text);
}

async function searchPathways(molecule: string): Promise<PCPathway[]> {
  const url = `${PC_API_BASE}/search?q=${encodeURIComponent(molecule)}&type=pathway&datasource=reactome,kegg,panther&format=json`;

  try {
    const text = await pcFetch(url);
    if (!text) return [];

    const data = JSON.parse(text) as { searchHit?: Array<{ name?: string; dataSource?: string[]; uri?: string }> };
    const hits = data.searchHit ?? [];

    return hits.slice(0, 5).map((hit) => ({
      name: hit.name ?? 'Unknown pathway',
      dataSource: (hit.dataSource ?? []).join(', '),
      uri: hit.uri ?? '',
      matchedMolecules: [molecule],
    }));
  } catch {
    return [];
  }
}

export async function queryPathwayCommons(bnglCode: string): Promise<PCQueryResult> {
  const parseResult = parseBNGLWithANTLR(bnglCode);
  if (!parseResult.success || !parseResult.model) {
    throw new Error(`Failed to parse BNGL: ${parseResult.errors.map((e) => e.message).join(', ')}`);
  }

  const model = parseResult.model;
  const moleculeNames = model.moleculeTypes.map((mt) => mt.name);

  if (moleculeNames.length === 0) {
    return {
      interactions: [],
      missingInteractions: [],
      confirmedInteractions: [],
      pathways: [],
      unknownMolecules: [],
      summary: 'No molecule types found in the model.',
    };
  }

  const existingInteractions = new Set<string>();
  for (const rule of model.reactionRules ?? []) {
    if (rule.reactants.length >= 2) {
      const reactantMols = rule.reactants.map((reactant) => reactant.replace(/\(.*\)/, '').replace(/@.*/, ''));
      for (let i = 0; i < reactantMols.length; i++) {
        for (let j = i + 1; j < reactantMols.length; j++) {
          const key = [reactantMols[i], reactantMols[j]].sort().join(':');
          existingInteractions.add(key);
        }
      }
    }
  }

  const interactions: PCInteraction[] = [];
  const unknownMolecules: string[] = [];

  try {
    const sifEntries = await queryGraph(moleculeNames, 'PATHSBETWEEN');
    const molSet = new Set(moleculeNames.map((name) => name.toUpperCase()));

    for (const entry of sifEntries) {
      const srcUpper = entry.source.toUpperCase();
      const tgtUpper = entry.target.toUpperCase();

      if (molSet.has(srcUpper) || molSet.has(tgtUpper)) {
        const src = moleculeNames.find((m) => m.toUpperCase() === srcUpper) ?? entry.source;
        const tgt = moleculeNames.find((m) => m.toUpperCase() === tgtUpper) ?? entry.target;

        const key = [src, tgt].sort().join(':');
        interactions.push({
          source: src,
          type: entry.type,
          target: tgt,
          dataSources: [],
          inModel: existingInteractions.has(key),
        });
      }
    }
  } catch (error) {
    console.warn('[PathwayCommons] Graph query failed:', error);
  }

  const pathways: PCPathway[] = [];
  const pathwayMap = new Map<string, PCPathway>();

  for (const mol of moleculeNames.slice(0, 5)) {
    try {
      const molPathways = await searchPathways(mol);
      for (const pw of molPathways) {
        const existing = pathwayMap.get(pw.name);
        if (existing) {
          if (!existing.matchedMolecules.includes(mol)) {
            existing.matchedMolecules.push(mol);
          }
        } else {
          pathwayMap.set(pw.name, pw);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch {
      unknownMolecules.push(mol);
    }
  }

  for (const pw of pathwayMap.values()) {
    pathways.push(pw);
  }
  pathways.sort((a, b) => b.matchedMolecules.length - a.matchedMolecules.length);

  const confirmed = interactions.filter((interaction) => interaction.inModel);
  const missing = interactions.filter((interaction) => !interaction.inModel);

  const seenMissing = new Set<string>();
  const dedupMissing = missing.filter((interaction) => {
    const key = [interaction.source, interaction.target].sort().join(':');
    if (seenMissing.has(key)) return false;
    seenMissing.add(key);
    return true;
  });

  const sharedPathwayCount = pathways.filter((pathway) => pathway.matchedMolecules.length > 1).length;
  const summary = [
    `Queried ${moleculeNames.length} molecules against Pathway Commons.`,
    confirmed.length > 0 ? `${confirmed.length} model interactions confirmed by database evidence.` : '',
    dedupMissing.length > 0
      ? `${dedupMissing.length} known interactions NOT in the model - consider adding rules for: ${dedupMissing.slice(0, 5).map((i) => `${i.source} ${i.type} ${i.target}`).join('; ')}${dedupMissing.length > 5 ? ` (and ${dedupMissing.length - 5} more)` : ''}.`
      : 'No additional known interactions found.',
    sharedPathwayCount > 0 ? `${sharedPathwayCount} shared pathways found.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return {
    interactions,
    missingInteractions: dedupMissing,
    confirmedInteractions: confirmed,
    pathways: pathways.slice(0, 10),
    unknownMolecules,
    summary,
  };
}
