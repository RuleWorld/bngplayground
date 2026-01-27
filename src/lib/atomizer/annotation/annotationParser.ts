/**
 * Annotation Parser and Resolver
 * Complete TypeScript port of analyzeRDF.py, annotationResolver.py, and related modules
 * 
 * Handles SBML annotation parsing, MIRIAM cross-references, and ontology resolution.
 */

import {
  SBMLModel,
  SBMLSpecies,
  AnnotationInfo,
  BiologicalQualifier,
  ModelQualifier,
  BIOLOGICAL_QUALIFIER_NAMES,
  MODEL_QUALIFIER_NAMES,
} from '../config/types';
import { logger, DefaultDict } from '../utils/helpers';

// =============================================================================
// Annotation Types
// =============================================================================

export interface ParsedAnnotation {
  speciesId: string;
  speciesName: string;
  qualifierType: 'biological' | 'model';
  qualifier: string;
  resources: string[];
  database: string;
  identifier: string;
}

export interface ResolvedAnnotation extends ParsedAnnotation {
  label?: string;
  description?: string;
  synonyms?: string[];
  crossReferences?: string[];
}

export interface EquivalenceGroup {
  canonicalId: string;
  members: string[];
  database: string;
}

// =============================================================================
// Annotation Database Patterns
// =============================================================================

const DATABASE_PATTERNS: Record<string, RegExp> = {
  uniprot: /uniprot[:/]([A-Z0-9]+)/i,
  go: /GO[:/](\d+)/i,
  chebi: /CHEBI[:/](\d+)/i,
  kegg: /kegg\.(compound|reaction|pathway)[:/]([A-Za-z0-9]+)/i,
  reactome: /reactome[:/]([A-Z0-9_]+)/i,
  biomodels: /biomodels\.db[:/](BIOMD\d+)/i,
  pubmed: /pubmed[:/](\d+)/i,
  doi: /doi[:/](10\.\d+\/[^\s]+)/i,
  obo: /obo\.([A-Z]+)[:/]([A-Z0-9_:]+)/i,
  ncbiTaxon: /taxonomy[:/](\d+)/i,
  ensembl: /ensembl[:/]([A-Z0-9]+)/i,
  interpro: /interpro[:/](IPR\d+)/i,
  pfam: /pfam[:/](PF\d+)/i,
  ec: /ec-code[:/](\d+\.\d+\.\d+\.\d+)/i,
};

// =============================================================================
// Annotation Parsing
// =============================================================================

/**
 * Parse annotations from an SBML species
 */
export function parseSpeciesAnnotations(
  species: SBMLSpecies
): ParsedAnnotation[] {
  const annotations: ParsedAnnotation[] = [];

  for (const ann of species.annotations) {
    const qualifierType = ann.qualifierType === 1 ? 'biological' : 'model';
    const qualifier = ann.qualifierType === 1
      ? BIOLOGICAL_QUALIFIER_NAMES[ann.biologicalQualifier || 13]
      : MODEL_QUALIFIER_NAMES[ann.modelQualifier || 5];

    for (const resource of ann.resources) {
      const { database, identifier } = parseResourceURI(resource);

      annotations.push({
        speciesId: species.id,
        speciesName: species.name,
        qualifierType,
        qualifier,
        resources: [resource],
        database,
        identifier,
      });
    }
  }

  return annotations;
}

/**
 * Parse a resource URI to extract database and identifier
 */
export function parseResourceURI(uri: string): { database: string; identifier: string } {
  for (const [database, pattern] of Object.entries(DATABASE_PATTERNS)) {
    const match = uri.match(pattern);
    if (match) {
      return {
        database,
        identifier: match[1] || match[2] || '',
      };
    }
  }

  // Try to extract from identifiers.org format
  const identifiersMatch = uri.match(/identifiers\.org\/([^/]+)\/([^/\s]+)/);
  if (identifiersMatch) {
    return {
      database: identifiersMatch[1],
      identifier: identifiersMatch[2],
    };
  }

  // Generic URL parsing
  const urlMatch = uri.match(/\/([^/]+)\/([^/\s]+)$/);
  if (urlMatch) {
    return {
      database: 'unknown',
      identifier: urlMatch[2],
    };
  }

  return { database: 'unknown', identifier: uri };
}

/**
 * Get all annotations from an SBML model
 */
export function getAllAnnotations(model: SBMLModel): Map<string, ParsedAnnotation[]> {
  const annotationMap = new Map<string, ParsedAnnotation[]>();

  for (const [id, species] of model.species) {
    const annotations = parseSpeciesAnnotations(species);
    if (annotations.length > 0) {
      annotationMap.set(id, annotations);
    }
  }

  return annotationMap;
}

/**
 * Get annotations filtered by database
 */
export function getAnnotationsByDatabase(
  model: SBMLModel,
  database: string
): Map<string, ParsedAnnotation[]> {
  const annotationMap = new Map<string, ParsedAnnotation[]>();

  for (const [id, species] of model.species) {
    const annotations = parseSpeciesAnnotations(species)
      .filter(a => a.database.toLowerCase() === database.toLowerCase());
    
    if (annotations.length > 0) {
      annotationMap.set(id, annotations);
    }
  }

  return annotationMap;
}

/**
 * Get annotations filtered by qualifier type
 */
export function getAnnotationsByQualifier(
  model: SBMLModel,
  qualifierType: 'biological' | 'model',
  qualifier?: string
): Map<string, ParsedAnnotation[]> {
  const annotationMap = new Map<string, ParsedAnnotation[]>();

  for (const [id, species] of model.species) {
    let annotations = parseSpeciesAnnotations(species)
      .filter(a => a.qualifierType === qualifierType);
    
    if (qualifier) {
      annotations = annotations.filter(a => a.qualifier === qualifier);
    }
    
    if (annotations.length > 0) {
      annotationMap.set(id, annotations);
    }
  }

  return annotationMap;
}

// =============================================================================
// Equivalence Detection
// =============================================================================

/**
 * Find species that share the same annotation
 * This is used to identify species that represent the same biological entity
 */
export function findEquivalentSpecies(model: SBMLModel): Map<string, string[]> {
  const annotationGroups = new DefaultDict<string[]>(() => []);
  
  for (const [id, species] of model.species) {
    const annotations = parseSpeciesAnnotations(species);
    
    for (const ann of annotations) {
      // Only consider BQB_IS and BQB_IS_VERSION_OF for equivalence
      if (
        ann.qualifier === 'BQB_IS' ||
        ann.qualifier === 'BQB_IS_VERSION_OF'
      ) {
        const key = `${ann.database}:${ann.identifier}`;
        annotationGroups.get(key).push(id);
      }
    }
  }

  // Convert to equivalence map
  const equivalenceMap = new Map<string, string[]>();
  
  for (const [key, speciesIds] of annotationGroups.entries()) {
    if (speciesIds.length > 1) {
      equivalenceMap.set(key, speciesIds);
    }
  }

  return equivalenceMap;
}

/**
 * Get the canonical species for each equivalence group
 * Returns the first (usually shortest name) species as canonical
 */
export function getCanonicalSpecies(
  equivalenceMap: Map<string, string[]>,
  model: SBMLModel
): Map<string, string> {
  const canonicalMap = new Map<string, string>();

  for (const [annotation, speciesIds] of equivalenceMap) {
    // Sort by name length, then alphabetically
    const sorted = [...speciesIds].sort((a, b) => {
      const nameA = model.species.get(a)?.name || a;
      const nameB = model.species.get(b)?.name || b;
      return nameA.length - nameB.length || nameA.localeCompare(nameB);
    });

    const canonical = sorted[0];
    for (const id of speciesIds) {
      if (id !== canonical) {
        canonicalMap.set(id, canonical);
      }
    }
  }

  return canonicalMap;
}

/**
 * Build RDF database from annotations
 * Groups species by their shared annotations
 */
export function buildRDFDatabase(
  model: SBMLModel,
  filterString?: string[]
): Map<string, string[]> {
  const rdfDatabase = new Map<string, string[]>();

  for (const [id, species] of model.species) {
    const annotations = parseSpeciesAnnotations(species);

    for (const ann of annotations) {
      // Apply filter if provided
      if (filterString && !filterString.some(f => ann.resources[0].includes(f))) {
        continue;
      }

      const key = ann.resources[0];
      if (!rdfDatabase.has(key)) {
        rdfDatabase.set(key, []);
      }
      
      if (!rdfDatabase.get(key)!.includes(id)) {
        rdfDatabase.get(key)!.push(id);
      }
    }
  }

  // Sort each group by name length
  for (const [key, speciesIds] of rdfDatabase) {
    speciesIds.sort((a, b) => {
      const nameA = model.species.get(a)?.name || a;
      const nameB = model.species.get(b)?.name || b;
      return nameA.length - nameB.length;
    });
  }

  return rdfDatabase;
}

/**
 * Get equivalence for a species from RDF database
 */
export function getEquivalence(
  speciesId: string,
  rdfDatabase: Map<string, string[]>
): string[] {
  for (const [_, speciesIds] of rdfDatabase) {
    if (speciesIds.includes(speciesId)) {
      if (speciesIds.indexOf(speciesId) === 0) {
        return []; // This is the canonical form
      }
      return [speciesIds[0]]; // Return the canonical form
    }
  }
  return [];
}

// =============================================================================
// Annotation Statistics
// =============================================================================

export interface AnnotationStats {
  totalSpecies: number;
  annotatedSpecies: number;
  annotationCount: number;
  databaseDistribution: Map<string, number>;
  qualifierDistribution: Map<string, number>;
  coveragePercent: number;
}

/**
 * Compute annotation statistics for a model
 */
export function computeAnnotationStats(model: SBMLModel): AnnotationStats {
  let annotatedSpecies = 0;
  let annotationCount = 0;
  const databaseDistribution = new Map<string, number>();
  const qualifierDistribution = new Map<string, number>();

  for (const [_, species] of model.species) {
    const annotations = parseSpeciesAnnotations(species);
    
    if (annotations.length > 0) {
      annotatedSpecies++;
      annotationCount += annotations.length;

      for (const ann of annotations) {
        databaseDistribution.set(
          ann.database,
          (databaseDistribution.get(ann.database) || 0) + 1
        );
        qualifierDistribution.set(
          ann.qualifier,
          (qualifierDistribution.get(ann.qualifier) || 0) + 1
        );
      }
    }
  }

  return {
    totalSpecies: model.species.size,
    annotatedSpecies,
    annotationCount,
    databaseDistribution,
    qualifierDistribution,
    coveragePercent: (annotatedSpecies / model.species.size) * 100,
  };
}

// =============================================================================
// UniProt Integration
// =============================================================================

// Delegate UniProt network access to the dedicated service implementation
import { fetchUniProtEntry as fetchUniProtEntryService, UniProtEntry } from '../services/uniprot';

export { UniProtEntry, fetchUniProtEntryService as fetchUniProtEntry };


/**
 * Extract UniProt accessions from annotations
 */
export function extractUniProtAccessions(model: SBMLModel): Map<string, string[]> {
  const uniprotMap = new Map<string, string[]>();

  for (const [id, species] of model.species) {
    const annotations = parseSpeciesAnnotations(species)
      .filter(a => a.database === 'uniprot');
    
    if (annotations.length > 0) {
      uniprotMap.set(id, annotations.map(a => a.identifier));
    }
  }

  return uniprotMap;
}

// =============================================================================
// Annotation Output Formats
// =============================================================================

/**
 * Convert annotations to YAML format (matching Python atomizer output)
 */
export function annotationsToYAML(
  model: SBMLModel,
  annotationMap: Map<string, ParsedAnnotation[]>
): string {
  const lines: string[] = [];
  
  for (const [speciesId, annotations] of annotationMap) {
    const species = model.species.get(speciesId);
    lines.push(`${speciesId}:`);
    lines.push(`  name: ${species?.name || speciesId}`);
    lines.push(`  annotations:`);
    
    for (const ann of annotations) {
      lines.push(`    - qualifier: ${ann.qualifier}`);
      lines.push(`      database: ${ann.database}`);
      lines.push(`      identifier: ${ann.identifier}`);
      lines.push(`      uri: ${ann.resources[0]}`);
    }
  }

  return lines.join('\n');
}

/**
 * Convert annotations to JSON format
 */
export function annotationsToJSON(
  model: SBMLModel,
  annotationMap: Map<string, ParsedAnnotation[]>
): string {
  const data: Record<string, any> = {};

  for (const [speciesId, annotations] of annotationMap) {
    const species = model.species.get(speciesId);
    data[speciesId] = {
      name: species?.name || speciesId,
      annotations: annotations.map(ann => ({
        qualifier: ann.qualifier,
        database: ann.database,
        identifier: ann.identifier,
        uri: ann.resources[0],
      })),
    };
  }

  return JSON.stringify(data, null, 2);
}
