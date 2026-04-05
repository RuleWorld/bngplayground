import { escapeXml } from '../../utils/xmlUtils';

/**
 * MIRIAMAnnotation.ts — MIRIAM annotation helper for SBML enrichment.
 *
 * Architecture:
 *  - Engine-side: Rich static dictionary + annotation generation logic.
 *    No network calls (engine stays pure).
 *  - MCP handler: Provides an async `IdentifierResolver` callback that
 *    queries UniProt/OLS/Identifiers.org at runtime to enrich annotations
 *    beyond the built-in dictionary.
 */

// ── Types ────────────────────────────────────────────────────────────

export interface MIRIAMAnnotation {
  qualifierType: 'bqbiol' | 'bqmodel';
  qualifier: string;
  resources: string[];
}

/**
 * An async callback that resolves a molecule name to MIRIAM identifiers.
 * Injected by the MCP handler or UI layer to call external databases.
 *
 * Return null for no match; the static dictionary is used as fallback.
 */
export type IdentifierResolver = (
  moleculeName: string,
  organism?: string,
) => Promise<MIRIAMAnnotation[] | null>;

// ── Static Dictionary ────────────────────────────────────────────────
// Covers 80+ common signaling molecules in canonical BNGL models.
// Sources: UniProt (human), Reactome, and BioModels curations.

const UNIPROT_DB: Record<string, string[]> = {
  // ── EGF/ERBB signaling ──
  EGF:   ['P01133'],
  EGFR:  ['P00533'],
  ERBB2: ['P04626'], HER2: ['P04626'],
  ERBB3: ['P21860'], HER3: ['P21860'],
  ERBB4: ['Q15303'], HER4: ['Q15303'],

  // ── RAS-MAPK cascade ──
  GRB2: ['P62993'],
  SOS:  ['Q07889'], SOS1: ['Q07889'], SOS2: ['Q9BXP5'],
  SHC:  ['P29353'], SHC1: ['P29353'],
  GAB1: ['Q13480'],
  HRAS: ['P01112'], KRAS: ['P01116'], NRAS: ['P01111'],
  RAS:  ['P01112'],
  RAF:  ['P04049'], BRAF: ['P15056'], CRAF: ['P04049'], RAF1: ['P04049'],
  MEK:  ['Q02750'], MEK1: ['Q02750'], MEK2: ['P36507'],
  MAP2K1: ['Q02750'], MAP2K2: ['P36507'],
  ERK:  ['P27361'], ERK1: ['P27361'], ERK2: ['P28482'],
  MAPK1: ['P28482'], MAPK3: ['P27361'],
  RSK:  ['Q15418'], RSK1: ['Q15418'], RSK2: ['P51812'],

  // ── PI3K-AKT pathway ──
  PI3K: ['P42336'], PIK3CA: ['P42336'],
  PIP2: ['CHEBI:18348'], PIP3: ['CHEBI:59517'],
  AKT:  ['P31749'], AKT1: ['P31749'], AKT2: ['P31751'],
  PTEN: ['P60484'],
  PDK1: ['O15530'],
  MTOR: ['P42345'], mTOR: ['P42345'],
  TSC1: ['Q92574'], TSC2: ['P49815'],
  S6K:  ['P23443'], RPS6KB1: ['P23443'],

  // ── JAK-STAT pathway ──
  JAK:  ['P23458'], JAK1: ['P23458'], JAK2: ['O60674'],
  TYK2: ['P29597'],
  STAT1: ['P42224'], STAT2: ['P52630'], STAT3: ['P40763'],
  STAT4: ['Q14765'], STAT5: ['P42229'], STAT5A: ['P42229'],
  STAT5B: ['P51692'], STAT6: ['P42226'],
  SOCS1: ['O15524'], SOCS3: ['O14543'],

  // ── NF-kB signaling ──
  NFkB: ['Q04206'], RELA: ['Q04206'], NFKB1: ['P19838'],
  IkB:  ['P25963'], NFKBIA: ['P25963'],
  IKK:  ['O15111'], IKBKB: ['O14920'], IKBKG: ['Q9Y6K9'],
  TNF:  ['P01375'], TNFR1: ['P19438'],

  // ── Apoptosis ──
  BCL2:  ['P10415'],
  BCLXL: ['Q07817'], BCL2L1: ['Q07817'],
  BAX:   ['Q07812'], BAK:   ['Q16611'],
  BID:   ['P55957'], tBID:  ['P55957'],
  BAD:   ['Q92934'],
  BIM:   ['O43521'], BCL2L11: ['O43521'],
  NOXA:  ['Q13794'], PMAIP1:  ['Q13794'],
  PUMA:  ['Q9BXH1'], BBC3:    ['Q9BXH1'],
  Casp3: ['P42574'], CASP3: ['P42574'],
  Casp6: ['P55212'], CASP6: ['P55212'],
  Casp7: ['P55210'], CASP7: ['P55210'],
  Casp8: ['Q14790'], CASP8: ['Q14790'],
  Casp9: ['P55211'], CASP9: ['P55211'],
  CytC:  ['P99999'], CYCS:  ['P99999'],
  Apaf1: ['O14727'], APAF1: ['O14727'],
  XIAP:  ['P98170'],
  Smac:  ['Q9NR28'], DIABLO: ['Q9NR28'],
  FADD:  ['Q13158'],
  TRADD: ['Q15628'],
  FLIP:  ['O15519'], CFLAR:  ['O15519'],

  // ── Tumor suppressors / Cell cycle ──
  p53:  ['P04637'], TP53:  ['P04637'],
  MDM2: ['Q00987'],
  p21:  ['P38936'], CDKN1A: ['P38936'],
  RB:   ['P06400'], RB1:    ['P06400'],
  CDK2: ['P24941'], CDK4:  ['P11802'], CDK6:  ['Q00534'],
  CycD: ['P24385'], CCND1: ['P24385'],
  CycE: ['P24864'], CCNE1: ['P24864'],
  CycA: ['P20248'], CCNA2: ['P20248'],

  // ── Wnt signaling ──
  WNT:    ['P04628'], WNT3A: ['P56704'],
  FZD:    ['Q9UP38'],
  DVL:    ['O14640'], DVL1:   ['O14640'],
  AXIN:   ['O15169'], AXIN1:  ['O15169'],
  APC:    ['P25054'],
  GSK3:   ['P49841'], GSK3B:  ['P49841'],
  CTNNB1: ['P35222'], BetaCatenin: ['P35222'],

  // ── TGF-beta / SMAD ──
  TGFB:   ['P01137'], TGFB1: ['P01137'],
  TGFBR1: ['P36897'], TGFBR2: ['P37173'],
  SMAD2:  ['Q15796'], SMAD3: ['P84022'],
  SMAD4:  ['Q13315'],
  SMAD7:  ['O15105'],

  // ── Notch signaling ──
  NOTCH1: ['P46531'], NOTCH2: ['Q04721'],
  DLL1:   ['O00548'], JAG1:   ['P78504'],
  NICD:   ['P46531'], // Notch intracellular domain
  RBPJ:   ['Q06330'],
  HES1:   ['Q14469'],

  // ── Calcium / CaM pathway ──
  CaM:    ['P62158'], CALM1: ['P62158'],
  CaMKII: ['Q9UQM7'], CAMK2A: ['Q9UQM7'],
  CaN:    ['Q08209'], PPP3CA: ['Q08209'],
  NFAT:   ['O95644'], NFATC1: ['O95644'],

  // ── Common scaffolds / adaptors ──
  SHP2: ['Q06124'], PTPN11: ['Q06124'],
  CBL:  ['P22681'],
  CRK:  ['P46108'],
  NCK:  ['P16333'], NCK1: ['P16333'],
  PLCg: ['P19174'], PLCG1: ['P19174'],
  PKC:  ['P17252'], PRKCA: ['P17252'],

  // ── Small molecules (CHEBI) ──
  ATP:   ['CHEBI:15422'],
  ADP:   ['CHEBI:16761'],
  GTP:   ['CHEBI:15996'],
  GDP:   ['CHEBI:17552'],
  cAMP:  ['CHEBI:17489'],
  Ca:    ['CHEBI:29108'],
  IP3:   ['CHEBI:16595'],
  DAG:   ['CHEBI:18035'],
};

// ── GO term mappings ─────────────────────────────────────────────────

const PROCESS_GO: Record<string, string> = {
  phosphorylation:   'GO:0006468',
  dephosphorylation: 'GO:0006470',
  ubiquitination:    'GO:0016567',
  apoptosis:         'GO:0006915',
  transcription:     'GO:0006351',
  translation:       'GO:0006412',
  endocytosis:       'GO:0006897',
  exocytosis:        'GO:0006887',
};

// ── Reactome pathways (top-level) ────────────────────────────────────

const REACTOME_PATHWAYS: Record<string, string> = {
  EGFR: 'R-HSA-177929',
  RAS:  'R-HSA-5683057',
  PI3K: 'R-HSA-109704',
  AKT:  'R-HSA-109704',
  MAPK: 'R-HSA-5684996',
  WNT:  'R-HSA-195721',
  NOTCH1: 'R-HSA-157118',
  TGFB: 'R-HSA-170834',
  TNF:  'R-HSA-75893',
  p53:  'R-HSA-3700989',
  BCL2: 'R-HSA-109606',
};

// ── API ──────────────────────────────────────────────────────────────

/**
 * Generate MIRIAM RDF/XML annotation block.
 */
export function generateMIRIAMBlock(
  elementId: string,
  annotations: MIRIAMAnnotation[],
): string {
  if (annotations.length === 0) return '';

  const blocks = annotations.map((ann) => {
    const resources = ann.resources
      .map((r) => `              <rdf:li rdf:resource="${escapeXml(r)}"/>`)
      .join('\n');

    return `        <${ann.qualifierType}:${ann.qualifier}>
          <rdf:Bag>
${resources}
          </rdf:Bag>
        </${ann.qualifierType}:${ann.qualifier}>`;
  }).join('\n');

  return `    <annotation>
      <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
               xmlns:bqbiol="http://biomodels.net/biology-qualifiers/"
               xmlns:bqmodel="http://biomodels.net/model-qualifiers/">
        <rdf:Description rdf:about="#${escapeXml(elementId)}">
${blocks}
        </rdf:Description>
      </rdf:RDF>
    </annotation>`;
}

/**
 * Suggest MIRIAM annotations from the built-in dictionary.
 *
 * For richer annotations, supply an `IdentifierResolver` callback
 * (see `resolveAnnotations` below) that queries external APIs.
 */
export function suggestMIRIAMAnnotations(
  moleculeName: string,
  moleculeType?: { components: string[] },
): MIRIAMAnnotation[] {
  const annotations: MIRIAMAnnotation[] = [];
  // Extract base molecule name from potential pattern e.g. "AKT(Y~U)" -> "AKT"
  const baseName = moleculeName.split('(')[0].trim();
  const name = baseName;

  // 1. UniProt / CHEBI lookup
  const accessions = lookupIdentifiers(name);
  if (accessions.length > 0) {
    const uniprotResources = accessions
      .filter((a) => !a.startsWith('CHEBI:'))
      .map((a) => `https://identifiers.org/uniprot:${a}`);
    const chebiResources = accessions
      .filter((a) => a.startsWith('CHEBI:'))
      .map((a) => `https://identifiers.org/chebi/${a}`);

    if (uniprotResources.length > 0) {
      annotations.push({
        qualifierType: 'bqbiol',
        qualifier: 'is',
        resources: uniprotResources,
      });
    }
    if (chebiResources.length > 0) {
      annotations.push({
        qualifierType: 'bqbiol',
        qualifier: 'is',
        resources: chebiResources,
      });
    }
  }

  // 2. Reactome pathway
  const pathway = lookupPathway(name);
  if (pathway) {
    annotations.push({
      qualifierType: 'bqbiol',
      qualifier: 'isPartOf',
      resources: [`https://identifiers.org/reactome:${pathway}`],
    });
  }

  // 3. GO term inference from component patterns
  if (moleculeType?.components) {
    const goTerms = inferGOAnnotations(moleculeType.components);
    if (goTerms.length > 0) {
      annotations.push({
        qualifierType: 'bqbiol',
        qualifier: 'isVersionOf',
        resources: goTerms.map((g) => `https://identifiers.org/go/${g}`),
      });
    }
  }

  return annotations;
}

/**
 * Resolve annotations using an external API via the provided callback.
 * Falls back to the static dictionary when the resolver returns null.
 *
 * This is the entry point for the MCP handler.
 */
export async function resolveAnnotations(
  moleculeNames: string[],
  resolver?: IdentifierResolver,
  organism?: string,
): Promise<Record<string, MIRIAMAnnotation[]>> {
  const result: Record<string, MIRIAMAnnotation[]> = {};

  for (const name of moleculeNames) {
    // Try external resolver first
    if (resolver) {
      try {
        const external = await resolver(name, organism);
        if (external && external.length > 0) {
          result[name] = external;
          continue;
        }
      } catch {
        // Fallthrough to static
      }
    }

    // Static fallback
    result[name] = suggestMIRIAMAnnotations(name);
  }

  return result;
}

// ── Lookup Helpers ───────────────────────────────────────────────────

/** Case-insensitive lookup in the UniProt/CHEBI dictionary */
function lookupIdentifiers(name: string): string[] {
  // Direct match
  if (UNIPROT_DB[name]) return UNIPROT_DB[name];
  // Case-insensitive match
  const upper = name.toUpperCase();
  for (const [key, value] of Object.entries(UNIPROT_DB)) {
    if (key.toUpperCase() === upper) return value;
  }
  return [];
}

/** Reactome pathway lookup */
function lookupPathway(name: string): string | null {
  if (REACTOME_PATHWAYS[name]) return REACTOME_PATHWAYS[name];
  const upper = name.toUpperCase();
  for (const [key, value] of Object.entries(REACTOME_PATHWAYS)) {
    if (key.toUpperCase() === upper) return value;
  }
  return null;
}

/** Infer GO terms from BNGL component patterns */
function inferGOAnnotations(components: string[]): string[] {
  const goTerms: string[] = [];
  for (const comp of components) {
    // Phosphorylation: sites like Y~U~P, S~U~P, T~U~P
    if (/[YST]/.test(comp) && (comp.includes('~U~P') || comp.includes('~u~p') || comp.includes('~0~P'))) {
      if (!goTerms.includes(PROCESS_GO.phosphorylation)) {
        goTerms.push(PROCESS_GO.phosphorylation);
      }
    }
    // Ubiquitination: ub~0~1
    if (/ub/i.test(comp) && (comp.includes('~0~1') || comp.includes('~0~Ub'))) {
      if (!goTerms.includes(PROCESS_GO.ubiquitination)) {
        goTerms.push(PROCESS_GO.ubiquitination);
      }
    }
  }
  return goTerms;
}

/**
 * Create a UniProt REST API resolver.
 *
 * Use in MCP handler:
 *   const resolver = createUniProtResolver(fetch);
 *   const annotations = await resolveAnnotations(names, resolver, 'Homo sapiens');
 *
 * NOTE: This factory is callable from Node.js (MCP server) only.
 *       The engine does NOT call it internally.
 */
type UniProtSearchResponse = {
  results: Array<{
    primaryAccession: string;
    genes?: Array<{ geneName?: { value: string } }>;
    organism?: { scientificName: string };
  }>;
};

function isUniProtSearchResponse(data: unknown): data is UniProtSearchResponse {
  if (!data || typeof data !== 'object') return false;
  const obj = data as { results?: unknown };
  if (!Array.isArray(obj.results)) return false;
  // We only minimally validate items to ensure primaryAccession exists.
  return obj.results.every((item) => {
    if (!item || typeof item !== 'object') return false;
    const rec = item as { primaryAccession?: unknown };
    return typeof rec.primaryAccession === 'string';
  });
}

export function createUniProtResolver(
  fetchFn: typeof fetch,
): IdentifierResolver {
  return async (name: string, organism?: string): Promise<MIRIAMAnnotation[] | null> => {
    const orgFilter = organism ? `+AND+organism_name:${encodeURIComponent(organism)}` : '+AND+organism_id:9606';
    const url = `https://rest.uniprot.org/uniprotkb/search?query=gene_exact:${encodeURIComponent(name)}${orgFilter}&format=json&fields=accession,gene_names,organism_name&size=3`;

    const response = await fetchFn(url, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;

    const raw = await response.json() as unknown;
    if (!isUniProtSearchResponse(raw)) {
      return null;
    }
    const data = raw;

    if (!data.results || data.results.length === 0) return null;

    const accessions = data.results.map((r) => r.primaryAccession);
    return [{
      qualifierType: 'bqbiol',
      qualifier: 'is',
      resources: accessions.map((a) => `https://identifiers.org/uniprot:${a}`),
    }];
  };
}
