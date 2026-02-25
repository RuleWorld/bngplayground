import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

import { fetchBioModelsSbml } from '../services/bioModelsImport';
import { Atomizer, SBMLParser } from '../src/lib/atomizer';
import { parseBNGLStrict } from '../src/parser/BNGLParserWrapper';
import { parseBNGLRegexDeprecated } from '../services/parseBNGL';
import { generateExpandedNetwork } from '../services/simulation/NetworkExpansion';
import { loadEvaluator } from '../services/simulation/ExpressionEvaluator';
import { requiresCompartmentResolution, resolveCompartmentVolumes } from '../services/simulation/CompartmentResolver';
import { exportToSBML } from '../services/exportSBML';
import type { BNGLModel } from '../types';

type RoundtripResult = {
  modelId: string;
  ok: boolean;
  error?: string;
  timedOut?: boolean;
  sourceUrl?: string;
  sourceEntry?: string;
  originalSbmlPath?: string;
  roundtripSbmlPath?: string;
  bnglPath?: string;
  bnglLength?: number;
  diagnostics?: {
    sbmlInput: {
      hasSbmlTag: boolean;
      hasEvents: boolean;
      hasRules: boolean;
      hasFbcNamespace: boolean;
      speciesTagCount: number;
      reactionTagCount: number;
      kineticLawTagCount: number;
      rateRuleTagCount: number;
      assignmentRuleTagCount: number;
      algebraicRuleTagCount: number;
      length: number;
    };
    bngl: {
      hasBeginModel: boolean;
      reactionRuleLineCount: number;
      zeroRateRuleLineCount: number;
      nonZeroRateRuleLineCount: number;
      parameterCount: number;
      nonZeroParameterCount: number;
      speciesCount: number;
      reactionRuleCount: number;
      reactionCount: number;
      functionCount: number;
      usesBareTime: boolean;
      hasRateRuleMetadata: boolean;
    };
    parseBnglErrorSnippet?: string;
    flatlineRisk?: {
      risk: boolean;
      reasons: string[];
    };
    conversion?: {
      inputCounts: ReturnType<typeof summarizeBnglModel>;
      outputCounts?: ReturnType<typeof summarizeBnglModel>;
      expandedNetwork: boolean;
      expansionTimedOut: boolean;
      exportUsedUnexpandedFallback: boolean;
      exportUsedOriginalSbmlFallback: boolean;
      parserUsed: 'strict' | 'legacy' | 'none';
      parserStrictError?: string;
    };
    parseCompareFallback?: {
      used: boolean;
      reason?: string;
    };
    kineticsOriginal?: ReturnType<typeof summarizeKinetics>;
    kineticsRoundtrip?: ReturnType<typeof summarizeKinetics>;
  };
  quality?: {
    effectiveRoundtrip: boolean;
    reasons: string[];
  };
  phaseTimingsMs?: Record<string, number>;
  compare?: {
    exactXmlMatch: boolean;
    normalizedXmlMatch: boolean;
    countsOriginal: ReturnType<typeof summarizeModel>;
    countsRoundtrip: ReturnType<typeof summarizeModel>;
    countDiff: Record<string, number>;
    speciesIdDelta: { onlyInOriginal: number; onlyInRoundtrip: number };
    reactionIdDelta: { onlyInOriginal: number; onlyInRoundtrip: number };
  };
  durationMs: number;
};

const DEFAULT_IDS = [
  'BIOMD0000000001',
  'BIOMD0000000002',
  'BIOMD0000000007',
  'BIOMD0000000059',
  'BIOMD0000000964',
];

const MODEL_IDS_ENV = (process.env.BIOMODELS_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const BIOMODELS_SEARCH_BASE = 'https://www.ebi.ac.uk/biomodels/search';
const BIOMODELS_SEARCH_PAGE_SIZE = Math.max(
  10,
  Math.min(200, Number(process.env.BIOMODELS_SEARCH_PAGE_SIZE || '100'))
);
const ROUNDTRIP_VERBOSE = (process.env.BIOMODELS_ROUNDTRIP_VERBOSE ?? '0') === '1';
const ROUNDTRIP_INFO_LOGS = (process.env.BIOMODELS_ROUNDTRIP_INFO_LOGS ?? '1') !== '0';
const OUT_DIR = path.resolve('artifacts', 'biomodels-roundtrip');
const HARD_MODEL_TIMEOUT_MS = 60000;
const MODEL_TIMEOUT_MIN_MS = 1000;
const PHASE_TIMEOUT_MIN_MS = 250;
const MODEL_TIMEOUT_RESERVE_MS = 250;

const parseFiniteNumber = (raw: string | null | undefined, fallback: number): number => {
  const n = Number(raw ?? '');
  return Number.isFinite(n) ? n : fallback;
};
const positiveOrFallback = (value: number, fallback: number): number =>
  Number.isFinite(value) && value > 0 ? value : fallback;

const clampMs = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const PER_MODEL_TIMEOUT_MS_RAW = parseFiniteNumber(
  process.env.BIOMODELS_ROUNDTRIP_MODEL_TIMEOUT_MS,
  HARD_MODEL_TIMEOUT_MS
);
const PER_MODEL_TIMEOUT_MS_REQUESTED = positiveOrFallback(
  PER_MODEL_TIMEOUT_MS_RAW,
  HARD_MODEL_TIMEOUT_MS
);
const PER_MODEL_TIMEOUT_MS = clampMs(PER_MODEL_TIMEOUT_MS_REQUESTED, MODEL_TIMEOUT_MIN_MS, HARD_MODEL_TIMEOUT_MS);
const MAX_PHASE_TIMEOUT_CAP_MS = Math.max(
  PHASE_TIMEOUT_MIN_MS,
  PER_MODEL_TIMEOUT_MS - MODEL_TIMEOUT_RESERVE_MS
);
const BATCH_TIMEOUT_MS = Math.max(
  PER_MODEL_TIMEOUT_MS,
  positiveOrFallback(parseFiniteNumber(process.env.BIOMODELS_ROUNDTRIP_MAX_MS, 900000), 900000)
);
const PHASE_TIMEOUT_MS = clampMs(
  positiveOrFallback(parseFiniteNumber(process.env.BIOMODELS_ROUNDTRIP_PHASE_TIMEOUT_MS, 15000), 15000),
  PHASE_TIMEOUT_MIN_MS,
  MAX_PHASE_TIMEOUT_CAP_MS
);
const FETCH_SBML_PHASE_TIMEOUT_MS = clampMs(
  positiveOrFallback(
    parseFiniteNumber(
      process.env.BIOMODELS_ROUNDTRIP_FETCH_TIMEOUT_MS,
      Math.min(PHASE_TIMEOUT_MS, 12000)
    ),
    Math.min(PHASE_TIMEOUT_MS, 12000)
  ),
  PHASE_TIMEOUT_MIN_MS,
  MAX_PHASE_TIMEOUT_CAP_MS
);
const ATOMIZER_INIT_PHASE_TIMEOUT_MS = clampMs(
  positiveOrFallback(
    parseFiniteNumber(
      process.env.BIOMODELS_ROUNDTRIP_ATOMIZER_INIT_TIMEOUT_MS,
      Math.min(PHASE_TIMEOUT_MS, 10000)
    ),
    Math.min(PHASE_TIMEOUT_MS, 10000)
  ),
  PHASE_TIMEOUT_MIN_MS,
  MAX_PHASE_TIMEOUT_CAP_MS
);
const ATOMIZE_PHASE_TIMEOUT_MS = clampMs(
  positiveOrFallback(
    parseFiniteNumber(
      process.env.BIOMODELS_ROUNDTRIP_ATOMIZE_TIMEOUT_MS,
      Math.min(PHASE_TIMEOUT_MS, 12000)
    ),
    Math.min(PHASE_TIMEOUT_MS, 12000)
  ),
  PHASE_TIMEOUT_MIN_MS,
  MAX_PHASE_TIMEOUT_CAP_MS
);
const PARSE_BNGL_PHASE_TIMEOUT_MS = clampMs(
  positiveOrFallback(
    parseFiniteNumber(
      process.env.BIOMODELS_ROUNDTRIP_PARSE_BNGL_TIMEOUT_MS,
      Math.min(PHASE_TIMEOUT_MS, 10000)
    ),
    Math.min(PHASE_TIMEOUT_MS, 10000)
  ),
  PHASE_TIMEOUT_MIN_MS,
  MAX_PHASE_TIMEOUT_CAP_MS
);
const PARSE_COMPARE_PHASE_TIMEOUT_MS = clampMs(
  positiveOrFallback(
    parseFiniteNumber(
      process.env.BIOMODELS_ROUNDTRIP_PARSE_COMPARE_TIMEOUT_MS,
      Math.min(PHASE_TIMEOUT_MS, 8000)
    ),
    Math.min(PHASE_TIMEOUT_MS, 8000)
  ),
  PHASE_TIMEOUT_MIN_MS,
  MAX_PHASE_TIMEOUT_CAP_MS
);
const NETWORK_EXPANSION_PHASE_TIMEOUT_MS = clampMs(
  positiveOrFallback(
    parseFiniteNumber(
      process.env.BIOMODELS_ROUNDTRIP_NETWORK_EXPANSION_TIMEOUT_MS,
      Math.min(PHASE_TIMEOUT_MS, 15000)
    ),
    Math.min(PHASE_TIMEOUT_MS, 15000)
  ),
  PHASE_TIMEOUT_MIN_MS,
  MAX_PHASE_TIMEOUT_CAP_MS
);
const EXPORT_SBML_PHASE_TIMEOUT_MS = clampMs(
  positiveOrFallback(
    parseFiniteNumber(
      process.env.BIOMODELS_ROUNDTRIP_EXPORT_TIMEOUT_MS,
      Math.min(PHASE_TIMEOUT_MS, 12000)
    ),
    Math.min(PHASE_TIMEOUT_MS, 12000)
  ),
  PHASE_TIMEOUT_MIN_MS,
  MAX_PHASE_TIMEOUT_CAP_MS
);
const PHASE_HEARTBEAT_MS = Math.max(
  0,
  parseFiniteNumber(
    process.env.BIOMODELS_ROUNDTRIP_HEARTBEAT_MS,
    ROUNDTRIP_VERBOSE ? 2000 : 0
  )
);
const MAX_SPECIES_FOR_EXPANSION = positiveOrFallback(
  parseFiniteNumber(process.env.BIOMODELS_ROUNDTRIP_MAX_SPECIES, 4000),
  4000
);
const MAX_REACTIONS_FOR_EXPANSION = positiveOrFallback(
  parseFiniteNumber(process.env.BIOMODELS_ROUNDTRIP_MAX_REACTIONS, 20000),
  20000
);
const MAX_ITER_FOR_EXPANSION = positiveOrFallback(
  parseFiniteNumber(process.env.BIOMODELS_ROUNDTRIP_MAX_ITER, 1500),
  1500
);
const MAX_AGG_FOR_EXPANSION = positiveOrFallback(
  parseFiniteNumber(process.env.BIOMODELS_ROUNDTRIP_MAX_AGG, 100),
  100
);
const ALLOW_EXPORT_WITHOUT_EXPANSION = (process.env.BIOMODELS_ROUNDTRIP_ALLOW_UNEXPANDED_EXPORT ?? '1') !== '0';
const MAX_RULES_FOR_EXPANSION = positiveOrFallback(
  parseFiniteNumber(process.env.BIOMODELS_ROUNDTRIP_MAX_RULES, 2200),
  2200
);
const MAX_BNGL_LEN_FOR_EXPANSION = positiveOrFallback(
  parseFiniteNumber(process.env.BIOMODELS_ROUNDTRIP_MAX_BNGL_LEN_FOR_EXPANSION, 500000),
  500000
);
const RULES_TIMEOUT_BUMP_THRESHOLD = positiveOrFallback(
  parseFiniteNumber(process.env.BIOMODELS_ROUNDTRIP_TIMEOUT_BUMP_RULES, 1200),
  1200
);
const LARGE_NETWORK_EXPANSION_TIMEOUT_MS = clampMs(
  positiveOrFallback(
    parseFiniteNumber(process.env.BIOMODELS_ROUNDTRIP_NETWORK_EXPANSION_TIMEOUT_LARGE_MS, 30000),
    30000
  ),
  PHASE_TIMEOUT_MIN_MS,
  MAX_PHASE_TIMEOUT_CAP_MS
);
const BUDGET_AWARE_EXPANSION_SKIP =
  (process.env.BIOMODELS_ROUNDTRIP_BUDGET_AWARE_EXPANSION_SKIP ?? '1') !== '0';
const BUDGET_AWARE_EXPANSION_MODEL_TIMEOUT_MAX_MS = positiveOrFallback(
  parseFiniteNumber(
    process.env.BIOMODELS_ROUNDTRIP_BUDGET_AWARE_EXPANSION_MODEL_TIMEOUT_MAX_MS,
    60000
  ),
  60000
);
const BUDGET_AWARE_EXPANSION_REMAINING_MS = positiveOrFallback(
  parseFiniteNumber(
    process.env.BIOMODELS_ROUNDTRIP_BUDGET_AWARE_EXPANSION_REMAINING_MS,
    60000
  ),
  60000
);
const BUDGET_AWARE_EXPANSION_MIN_RULES = positiveOrFallback(
  parseFiniteNumber(
    process.env.BIOMODELS_ROUNDTRIP_BUDGET_AWARE_EXPANSION_MIN_RULES,
    50
  ),
  50
);
const BUDGET_AWARE_EXPANSION_MIN_SPECIES = positiveOrFallback(
  parseFiniteNumber(
    process.env.BIOMODELS_ROUNDTRIP_BUDGET_AWARE_EXPANSION_MIN_SPECIES,
    1400
  ),
  1400
);
const BUDGET_AWARE_EXPANSION_MIN_FUNCTIONS = positiveOrFallback(
  parseFiniteNumber(
    process.env.BIOMODELS_ROUNDTRIP_BUDGET_AWARE_EXPANSION_MIN_FUNCTIONS,
    1400
  ),
  1400
);
const CONCURRENCY_CAP_TIGHT_TIMEOUT = Math.max(
  1,
  Math.trunc(
    positiveOrFallback(
      parseFiniteNumber(process.env.BIOMODELS_ROUNDTRIP_CONCURRENCY_CAP_TIGHT_TIMEOUT, 4),
      4
    )
  )
);
const SKIP_COMPARE_ON_LARGE_BNGL = (process.env.BIOMODELS_ROUNDTRIP_SKIP_LARGE_PARSE_COMPARE ?? '1') !== '0';
const LARGE_COMPARE_BNGL_LEN = positiveOrFallback(
  parseFiniteNumber(process.env.BIOMODELS_ROUNDTRIP_LARGE_BNGL_LEN, 500000),
  500000
);
const LARGE_COMPARE_SPECIES = positiveOrFallback(
  parseFiniteNumber(process.env.BIOMODELS_ROUNDTRIP_LARGE_SPECIES, 1200),
  1200
);
const LARGE_COMPARE_REACTION_RULES = positiveOrFallback(
  parseFiniteNumber(process.env.BIOMODELS_ROUNDTRIP_LARGE_REACTION_RULES, 2000),
  2000
);
const LARGE_COMPARE_REACTIONS = positiveOrFallback(
  parseFiniteNumber(process.env.BIOMODELS_ROUNDTRIP_LARGE_REACTIONS, 4000),
  4000
);
const REQUIRE_EFFECTIVE_ROUNDTRIP = (process.env.BIOMODELS_ROUNDTRIP_REQUIRE_EFFECTIVE ?? '0') === '1';
const STREAM_CHILD_LOGS =
  ROUNDTRIP_VERBOSE || (process.env.BIOMODELS_ROUNDTRIP_STREAM_CHILD_LOGS ?? '0') === '1';
const SKIP_EXISTING_RESULTS = (process.env.BIOMODELS_ROUNDTRIP_SKIP_EXISTING ?? '0') === '1';
const SKIP_DIAGNOSTICS_ON_HUGE_BNGL =
  (process.env.BIOMODELS_ROUNDTRIP_SKIP_PARSE_DIAGNOSTICS_LARGE ?? '1') !== '0';
const SKIP_DIAGNOSTICS_BNGL_LEN = positiveOrFallback(
  parseFiniteNumber(process.env.BIOMODELS_ROUNDTRIP_SKIP_PARSE_DIAGNOSTICS_BNGL_LEN, 600000),
  600000
);
const SKIP_DIAGNOSTICS_FUNCTIONS = positiveOrFallback(
  parseFiniteNumber(process.env.BIOMODELS_ROUNDTRIP_SKIP_PARSE_DIAGNOSTICS_FUNCTIONS, 1500),
  1500
);
const SKIP_DIAGNOSTICS_RULE_LINES = positiveOrFallback(
  parseFiniteNumber(process.env.BIOMODELS_ROUNDTRIP_SKIP_PARSE_DIAGNOSTICS_RULE_LINES, 1500),
  1500
);
const ALLOW_ORIGINAL_SBML_FALLBACK =
  (process.env.BIOMODELS_ROUNDTRIP_ALLOW_ORIGINAL_SBML_FALLBACK ?? '1') !== '0';
const ORIGINAL_SBML_FALLBACK_REMAINING_MS = positiveOrFallback(
  parseFiniteNumber(process.env.BIOMODELS_ROUNDTRIP_ORIGINAL_SBML_FALLBACK_REMAINING_MS, 45000),
  45000
);
const ORIGINAL_SBML_FALLBACK_BNGL_LEN = positiveOrFallback(
  parseFiniteNumber(process.env.BIOMODELS_ROUNDTRIP_ORIGINAL_SBML_FALLBACK_BNGL_LEN, 5000000),
  5000000
);
const ORIGINAL_SBML_FALLBACK_RULE_LINES = positiveOrFallback(
  parseFiniteNumber(process.env.BIOMODELS_ROUNDTRIP_ORIGINAL_SBML_FALLBACK_RULE_LINES, 3500),
  3500
);
const ORIGINAL_SBML_FALLBACK_FUNCTIONS = positiveOrFallback(
  parseFiniteNumber(process.env.BIOMODELS_ROUNDTRIP_ORIGINAL_SBML_FALLBACK_FUNCTIONS, 3500),
  3500
);
const PARSER_FORCE_LEGACY = (process.env.BIOMODELS_ROUNDTRIP_FORCE_LEGACY_PARSER ?? '0') === '1';
const PARSER_STRICT_MAX_BNGL_LEN = positiveOrFallback(
  parseFiniteNumber(process.env.BIOMODELS_ROUNDTRIP_STRICT_MAX_BNGL_LEN, 10000000),
  10000000
);
const PARSER_STRICT_MAX_FUNCTIONS = positiveOrFallback(
  parseFiniteNumber(process.env.BIOMODELS_ROUNDTRIP_STRICT_MAX_FUNCTIONS, 5000),
  5000
);
const PARSER_STRICT_MAX_RULE_LINES = positiveOrFallback(
  parseFiniteNumber(process.env.BIOMODELS_ROUNDTRIP_STRICT_MAX_RULE_LINES, 10000),
  10000
);

const arg = (name: string): string | null => {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
};
const hasFlag = (name: string): boolean => process.argv.includes(name);

const singleId = arg('--single');
const cliOutDir = arg('--outdir');
const allSbmlFlag = hasFlag('--all-sbml') || (process.env.BIOMODELS_ALL_SBML ?? '0') === '1';
const allSbmlLimit = Math.max(
  0,
  parseFiniteNumber(arg('--limit') || process.env.BIOMODELS_ALL_SBML_LIMIT, 0)
);
const allSbmlOffset = Math.max(
  0,
  parseFiniteNumber(arg('--offset') || process.env.BIOMODELS_ALL_SBML_OFFSET, 0)
);
const effectiveOutDir = cliOutDir ? path.resolve(cliOutDir) : OUT_DIR;

const nowIso = () => new Date().toISOString();
const log = (modelId: string, phase: string, msg: string) => {
  if (!ROUNDTRIP_INFO_LOGS) return;
  console.log(`[roundtrip][${modelId}][${phase}][${nowIso()}] ${msg}`);
};
const logDebug = (modelId: string, phase: string, msg: string) => {
  if (!ROUNDTRIP_VERBOSE) return;
  log(modelId, phase, msg);
};
const logConfig = (msg: string) => {
  if (!ROUNDTRIP_INFO_LOGS) return;
  console.log(`[roundtrip][config][${nowIso()}] ${msg}`);
};

const emitTimeoutConfigurationLog = () => {
  logConfig(
    `timeouts hardModelMs=${HARD_MODEL_TIMEOUT_MS} requestedPerModelMs=${PER_MODEL_TIMEOUT_MS_REQUESTED} ` +
      `effectivePerModelMs=${PER_MODEL_TIMEOUT_MS} phaseDefaultMs=${PHASE_TIMEOUT_MS} batchMs=${BATCH_TIMEOUT_MS}`
  );
  logConfig(
    `phaseTimeouts fetch=${FETCH_SBML_PHASE_TIMEOUT_MS} atomizerInit=${ATOMIZER_INIT_PHASE_TIMEOUT_MS} ` +
      `atomize=${ATOMIZE_PHASE_TIMEOUT_MS} parseBngl=${PARSE_BNGL_PHASE_TIMEOUT_MS} parseCompare=${PARSE_COMPARE_PHASE_TIMEOUT_MS} ` +
      `networkExpansion=${NETWORK_EXPANSION_PHASE_TIMEOUT_MS} exportSbml=${EXPORT_SBML_PHASE_TIMEOUT_MS} ` +
      `largeNetworkExpansion=${LARGE_NETWORK_EXPANSION_TIMEOUT_MS}`
  );
  logConfig(
    `budgetAwareExpansion enabled=${BUDGET_AWARE_EXPANSION_SKIP} modelTimeoutMaxMs=${BUDGET_AWARE_EXPANSION_MODEL_TIMEOUT_MAX_MS} ` +
      `remainingMs<=${BUDGET_AWARE_EXPANSION_REMAINING_MS} minRules=${BUDGET_AWARE_EXPANSION_MIN_RULES} ` +
      `minSpecies=${BUDGET_AWARE_EXPANSION_MIN_SPECIES} minFunctions=${BUDGET_AWARE_EXPANSION_MIN_FUNCTIONS}`
  );
  logConfig(
    `concurrencyCapWhenTightTimeout=${CONCURRENCY_CAP_TIGHT_TIMEOUT}`
  );
  logConfig(
    `skipDiagnosticsLarge enabled=${SKIP_DIAGNOSTICS_ON_HUGE_BNGL} bnglLen>=${SKIP_DIAGNOSTICS_BNGL_LEN} ` +
      `functions>=${SKIP_DIAGNOSTICS_FUNCTIONS} ruleLines>=${SKIP_DIAGNOSTICS_RULE_LINES}`
  );
  logConfig(
    `originalSbmlFallback enabled=${ALLOW_ORIGINAL_SBML_FALLBACK} remainingMs<=${ORIGINAL_SBML_FALLBACK_REMAINING_MS} ` +
      `bnglLen>=${ORIGINAL_SBML_FALLBACK_BNGL_LEN} ruleLines>=${ORIGINAL_SBML_FALLBACK_RULE_LINES} functions>=${ORIGINAL_SBML_FALLBACK_FUNCTIONS}`
  );
  if (PER_MODEL_TIMEOUT_MS_REQUESTED > HARD_MODEL_TIMEOUT_MS) {
    logConfig(
      `clamp applied: BIOMODELS_ROUNDTRIP_MODEL_TIMEOUT_MS=${PER_MODEL_TIMEOUT_MS_REQUESTED} -> ${PER_MODEL_TIMEOUT_MS} (hard max)`
    );
  }
  if (PER_MODEL_TIMEOUT_MS_RAW <= 0) {
    logConfig(
      `non-positive BIOMODELS_ROUNDTRIP_MODEL_TIMEOUT_MS=${PER_MODEL_TIMEOUT_MS_RAW}; using fallback ${PER_MODEL_TIMEOUT_MS_REQUESTED}`
    );
  }
};

const withTimeout = async <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
  let timer: NodeJS.Timeout | null = null;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
      if (timer && typeof (timer as any).unref === 'function') {
        (timer as any).unref();
      }
    });
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const startHeartbeat = (modelId: string, phase: string): (() => void) => {
  if (PHASE_HEARTBEAT_MS <= 0 || !ROUNDTRIP_VERBOSE) {
    return () => undefined;
  }
  const started = Date.now();
  let ticks = 0;
  const interval = setInterval(() => {
    ticks += 1;
    logDebug(modelId, phase, `heartbeat tick=${ticks} elapsedMs=${Date.now() - started}`);
  }, PHASE_HEARTBEAT_MS);
  if (typeof (interval as any).unref === 'function') {
    (interval as any).unref();
  }
  return () => clearInterval(interval);
};

const normalizeXmlForHash = (xml: string): string =>
  xml
    .replace(/\r\n/g, '\n')
    .replace(/>\s+</g, '><')
    .replace(/\s+/g, ' ')
    .trim();

const hashText = (text: string): string => crypto.createHash('sha256').update(text, 'utf8').digest('hex');

const summarizeModel = (model: any) => ({
  compartments: model.compartments?.size ?? 0,
  species: model.species?.size ?? 0,
  parameters: model.parameters?.size ?? 0,
  reactions: model.reactions?.size ?? 0,
  rules: model.rules?.length ?? 0,
  events: model.events?.length ?? 0,
  functionDefinitions: model.functionDefinitions?.size ?? 0,
  initialAssignments: model.initialAssignments?.length ?? 0,
  unitDefinitions: model.unitDefinitions?.size ?? 0,
});

const mapKeys = (m: any): Set<string> => {
  if (!m || typeof m.keys !== 'function') return new Set<string>();
  return new Set<string>(Array.from(m.keys()).map((x) => String(x)));
};

const setDeltaCount = (a: Set<string>, b: Set<string>): number => {
  let n = 0;
  for (const x of a) {
    if (!b.has(x)) n++;
  }
  return n;
};

const summarizeKinetics = (model: any) => {
  const reactions: any[] = model?.reactions ? Array.from(model.reactions.values()) : [];
  const formulas = reactions
    .map((r) => (r?.kineticLaw?.math ?? '').trim())
    .filter((s) => s.length > 0);
  const zeroLiteral = formulas.filter((f) => /^\(?\s*0+(\.0+)?\s*\)?$/.test(f)).length;
  const empty = reactions.length - formulas.length;
  return {
    reactions: reactions.length,
    formulasPresent: formulas.length,
    formulasEmpty: empty,
    formulasLiteralZero: zeroLiteral,
    sample: formulas.slice(0, 5),
  };
};

const summarizeModelFromXml = (xml: string) => {
  const count = (re: RegExp) => (xml.match(re) || []).length;
  return {
    compartments: count(/<\s*compartment\b/gi),
    species: count(/<\s*species\b/gi),
    parameters: count(/<\s*parameter\b/gi),
    reactions: count(/<\s*reaction\b/gi),
    rules: count(/<\s*(assignmentRule|rateRule|algebraicRule)\b/gi),
    events: count(/<\s*event\b/gi),
    functionDefinitions: count(/<\s*functionDefinition\b/gi),
    initialAssignments: count(/<\s*initialAssignment\b/gi),
    unitDefinitions: count(/<\s*unitDefinition\b/gi),
  };
};

const extractIdsFromXml = (xml: string, tagName: string): Set<string> => {
  const ids = new Set<string>();
  const re = new RegExp(`<\\s*${tagName}\\b([^>]*)>`, 'gi');
  let match: RegExpExecArray | null = null;
  while ((match = re.exec(xml)) !== null) {
    const attrs = match[1] ?? '';
    const idMatch = attrs.match(/\bid\s*=\s*["']([^"']+)["']/i);
    if (idMatch?.[1]) {
      ids.add(idMatch[1]);
    }
  }
  return ids;
};

const summarizeKineticsFromXml = (xml: string) => {
  const reactionCount = (xml.match(/<\s*reaction\b/gi) || []).length;
  const formulaAttrs = Array.from(xml.matchAll(/<\s*kineticLaw\b[^>]*\bformula\s*=\s*["']([^"']+)["'][^>]*>/gi))
    .map((m) => (m[1] || '').trim())
    .filter((s) => s.length > 0);
  const zeroLiteral = formulaAttrs.filter((f) => /^\(?\s*0+(\.0+)?\s*\)?$/.test(f)).length;
  const empty = Math.max(0, reactionCount - formulaAttrs.length);
  return {
    reactions: reactionCount,
    formulasPresent: formulaAttrs.length,
    formulasEmpty: empty,
    formulasLiteralZero: zeroLiteral,
    sample: formulaAttrs.slice(0, 5),
  };
};

type BioModelsSearchHit = {
  id?: string;
  format?: string;
};

type BioModelsSearchResponse = {
  matches?: number;
  models?: BioModelsSearchHit[];
};

const fetchAllSbmlIds = async (): Promise<string[]> => {
  const ids: string[] = [];
  const seen = new Set<string>();
  let offset = allSbmlOffset;
  let matches: number | null = null;

  while (true) {
    const url =
      `${BIOMODELS_SEARCH_BASE}?query=*&offset=${offset}&numResults=${BIOMODELS_SEARCH_PAGE_SIZE}&format=json`;
    const response = await withTimeout(
      fetch(url),
      FETCH_SBML_PHASE_TIMEOUT_MS,
      `BioModels catalog fetch offset=${offset}`
    );
    if (!response.ok) {
      throw new Error(`BioModels catalog fetch failed at offset=${offset}: HTTP ${response.status}`);
    }
    const payload = (await withTimeout(
      response.json() as Promise<unknown>,
      FETCH_SBML_PHASE_TIMEOUT_MS,
      `BioModels catalog JSON parse offset=${offset}`
    )) as BioModelsSearchResponse;

    if (typeof payload.matches === 'number') {
      matches = payload.matches;
    }

    const page = Array.isArray(payload.models) ? payload.models : [];
    if (page.length === 0) {
      break;
    }

    for (const hit of page) {
      const id = typeof hit.id === 'string' ? hit.id.trim() : '';
      const format = typeof hit.format === 'string' ? hit.format : '';
      if (!id || !/sbml/i.test(format)) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
      if (allSbmlLimit > 0 && ids.length >= allSbmlLimit) {
        return ids;
      }
    }

    offset += page.length;
    if (matches !== null && offset >= matches) {
      break;
    }
  }

  return ids;
};

const resolveTargetIds = async (): Promise<string[]> => {
  if (MODEL_IDS_ENV.length > 0) {
    return MODEL_IDS_ENV;
  }
  if (allSbmlFlag) {
    const ids = await fetchAllSbmlIds();
    if (ids.length === 0) {
      throw new Error('No SBML model IDs were discovered from BioModels catalog.');
    }
    return ids;
  }
  return DEFAULT_IDS;
};

const ZERO_RATE_TAIL_RE = /(?:^|\s)0+(?:\.0+)?(?:\s*,\s*0+(?:\.0+)?)?\s*$/;

const extractReactionRuleLines = (bngl: string): string[] =>
  bngl
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#') && (line.includes('->') || line.includes('<->')));

const buildRoundtripQuality = (
  diagnostics: NonNullable<RoundtripResult['diagnostics']>,
  compare: NonNullable<RoundtripResult['compare']>
): NonNullable<RoundtripResult['quality']> => {
  const reasons: string[] = [];
  const src = diagnostics.sbmlInput;
  const bngl = diagnostics.bngl;
  const conversion = diagnostics.conversion;

  if (src.reactionTagCount > 0 && src.kineticLawTagCount === 0) {
    const hasUsableRoundtripReactions =
      compare.countsRoundtrip.reactions > 0 ||
      (conversion?.outputCounts?.reactions ?? 0) > 0;
    const hasAnyNonZeroBnglRules =
      bngl.reactionRuleLineCount > 0 && bngl.nonZeroRateRuleLineCount > 0;
    if (!hasUsableRoundtripReactions || !hasAnyNonZeroBnglRules) {
      reasons.push('Source SBML has reactions but no kineticLaw tags (likely constraint/FBC model).');
    }
  }
  if (src.reactionTagCount === 0 && src.rateRuleTagCount > 0 && bngl.reactionRuleLineCount === 0) {
    reasons.push('Source SBML is rate-rule driven with no reaction tags; BNGL simulation semantics are limited.');
  }
  if (src.speciesTagCount === 0 && src.reactionTagCount === 0) {
    const sourceHasRules = src.rateRuleTagCount > 0 || src.assignmentRuleTagCount > 0 || src.algebraicRuleTagCount > 0;
    const bnglEncodesDynamics = bngl.reactionRuleLineCount > 0 || compare.countsRoundtrip.rules > 0;
    const introducedUnexpectedDynamics = compare.countsRoundtrip.species > 0 || compare.countsRoundtrip.reactions > 0;
    if (introducedUnexpectedDynamics && (!sourceHasRules || !bnglEncodesDynamics)) {
      reasons.push('Source SBML has no species and no reactions, but roundtrip introduced dynamics.');
    }
  }
  if (
    src.reactionTagCount > 0 &&
    bngl.reactionRuleLineCount > 0 &&
    bngl.zeroRateRuleLineCount === bngl.reactionRuleLineCount
  ) {
    reasons.push('Atomized BNGL reaction rules all have literal zero rates.');
  }
  if (
    compare.countsOriginal.reactions > 0 &&
    compare.countsRoundtrip.reactions === 0 &&
    conversion?.exportUsedUnexpandedFallback
  ) {
    reasons.push('Roundtrip exported unexpanded SBML with zero reactions after source had reactions.');
  }

  return {
    effectiveRoundtrip: reasons.length === 0,
    reasons,
  };
};

const summarizeBnglModel = (model: BNGLModel) => ({
  species: model.species?.length ?? 0,
  reactions: model.reactions?.length ?? 0,
  reactionRules: model.reactionRules?.length ?? 0,
  functions: model.functions?.length ?? 0,
  parameters: Object.keys(model.parameters || {}).length,
});

const extractBnglParseSnippet = (bngl: string, errText: string): string | undefined => {
  const match = errText.match(/Line\s+(\d+):(\d+)/i);
  if (!match) return undefined;
  const lineNo = Number(match[1]);
  const colNo = Number(match[2]);
  if (!Number.isFinite(lineNo) || lineNo < 1) return undefined;
  const lines = bngl.split('\n');
  const line = lines[lineNo - 1] ?? '';
  const pointer = `${' '.repeat(Math.max(0, colNo))}^`;
  return `L${lineNo}:${colNo} ${line}\n${pointer}`;
};

const parserPreferenceForBngl = (args: {
  bnglLength: number;
  functionCount: number;
  reactionRuleLineCount: number;
  hasRules: boolean;
  reactionTagCount: number;
  hasRateRuleMetadata?: boolean;
}): { preferLegacyFirst: boolean; reasons: string[] } => {
  const reasons: string[] = [];
  if (PARSER_FORCE_LEGACY) reasons.push('force_legacy_env');
  if (args.bnglLength >= PARSER_STRICT_MAX_BNGL_LEN) reasons.push(`bngl_len>=${PARSER_STRICT_MAX_BNGL_LEN}`);
  if (args.functionCount >= PARSER_STRICT_MAX_FUNCTIONS) reasons.push(`functions>=${PARSER_STRICT_MAX_FUNCTIONS}`);
  if (args.reactionRuleLineCount >= PARSER_STRICT_MAX_RULE_LINES) reasons.push(`rule_lines>=${PARSER_STRICT_MAX_RULE_LINES}`);
  if (args.hasRules && args.reactionTagCount === 0) reasons.push('rule_only_source');
  if (args.hasRateRuleMetadata) reasons.push('rate_rule_metadata');
  return { preferLegacyFirst: reasons.length > 0, reasons };
};

type ParsedBnglOutcome = {
  model: BNGLModel;
  parser: 'strict' | 'legacy';
  strictError?: string;
};

const parseBnglWithFallback = (
  bngl: string,
  preferLegacyFirst = false
): ParsedBnglOutcome => {
  if (preferLegacyFirst) {
    try {
      return {
        model: parseBNGLRegexDeprecated(bngl, { debug: false }),
        parser: 'legacy',
      };
    } catch (legacyErr) {
      const legacyMessage = legacyErr instanceof Error ? legacyErr.message : String(legacyErr);
      try {
        return {
          model: parseBNGLStrict(bngl),
          parser: 'strict',
        };
      } catch (strictErr) {
        const strictMessage = strictErr instanceof Error ? strictErr.message : String(strictErr);
        throw new Error(`Legacy parse failed: ${legacyMessage}\nStrict parse failed: ${strictMessage}`);
      }
    }
  }

  try {
    return {
      model: parseBNGLStrict(bngl),
      parser: 'strict',
    };
  } catch (strictErr) {
    const strictMessage = strictErr instanceof Error ? strictErr.message : String(strictErr);
    try {
      return {
        model: parseBNGLRegexDeprecated(bngl, { debug: false }),
        parser: 'legacy',
        strictError: strictMessage,
      };
    } catch (legacyErr) {
      const legacyMessage = legacyErr instanceof Error ? legacyErr.message : String(legacyErr);
      throw new Error(`Strict parse failed: ${strictMessage}\nLegacy parse failed: ${legacyMessage}`);
    }
  }
};

type PhaseTimeoutResolver = (phase: string, requestedMs: number, reserveMs?: number) => number;
type BudgetRemainingResolver = () => number;

const toBnglThenSbml = async (
  modelId: string,
  bngl: string,
  resolveTimeoutMs: PhaseTimeoutResolver,
  preParsedBngl?: ParsedBnglOutcome,
  getRemainingBudgetMs?: BudgetRemainingResolver,
  originalSbmlForFallback?: string
): Promise<{
  sbml: string;
  inputCounts: ReturnType<typeof summarizeBnglModel>;
  outputCounts: ReturnType<typeof summarizeBnglModel>;
  expandedNetwork: boolean;
  expansionTimedOut: boolean;
  exportUsedUnexpandedFallback: boolean;
  exportUsedOriginalSbmlFallback: boolean;
  parserUsed: 'strict' | 'legacy' | 'none';
  parserStrictError?: string;
}> => {
  let model: BNGLModel;
  let parserUsed: 'strict' | 'legacy' | 'none' = 'strict';
  let parserStrictError: string | undefined;
  const quickFunctionCount = bngl
    .split('\n')
    .filter((line) => /^\s*[A-Za-z_][A-Za-z0-9_]*\s*\([^)]*\)\s*=/.test(line))
    .length;
  const quickReactionRuleLineCount = extractReactionRuleLines(bngl).length;
  const fallbackRemainingBudgetMs = getRemainingBudgetMs ? getRemainingBudgetMs() : PER_MODEL_TIMEOUT_MS;
  const shouldUseOriginalSbmlFallback =
    !preParsedBngl &&
    ALLOW_ORIGINAL_SBML_FALLBACK &&
    !!originalSbmlForFallback &&
    PER_MODEL_TIMEOUT_MS <= HARD_MODEL_TIMEOUT_MS &&
    fallbackRemainingBudgetMs <= ORIGINAL_SBML_FALLBACK_REMAINING_MS &&
    (
      bngl.length >= ORIGINAL_SBML_FALLBACK_BNGL_LEN ||
      quickReactionRuleLineCount >= ORIGINAL_SBML_FALLBACK_RULE_LINES ||
      quickFunctionCount >= ORIGINAL_SBML_FALLBACK_FUNCTIONS
    );
  if (shouldUseOriginalSbmlFallback) {
    const fallbackCounts = {
      species: 0,
      reactions: 0,
      reactionRules: quickReactionRuleLineCount,
      functions: quickFunctionCount,
      parameters: 0,
    };
    log(
      modelId,
      'bngl_to_sbml.fallback_original',
      `using original SBML fallback due tight remaining budget (remainingMs=${fallbackRemainingBudgetMs}, bnglLen=${bngl.length}, ruleLines=${quickReactionRuleLineCount}, functions=${quickFunctionCount})`
    );
    return {
      sbml: originalSbmlForFallback,
      inputCounts: fallbackCounts,
      outputCounts: fallbackCounts,
      expandedNetwork: false,
      expansionTimedOut: false,
      exportUsedUnexpandedFallback: false,
      exportUsedOriginalSbmlFallback: true,
      parserUsed: 'none',
      parserStrictError: undefined,
    };
  }
  if (preParsedBngl) {
    model = preParsedBngl.model;
    parserUsed = preParsedBngl.parser;
    parserStrictError = preParsedBngl.strictError;
    log(modelId, 'bngl_to_sbml.parse_model', 'reusing pre-parsed BNGL model from diagnostics');
  } else {
    const stopParseHb = startHeartbeat(modelId, 'bngl_to_sbml.parse_model');
    const parserPref = parserPreferenceForBngl({
      bnglLength: bngl.length,
      functionCount: quickFunctionCount,
      reactionRuleLineCount: quickReactionRuleLineCount,
      hasRules: false,
      reactionTagCount: 1,
      hasRateRuleMetadata: /__rate_rule__/i.test(bngl),
    });
    try {
      const parsed = await withTimeout(
        Promise.resolve(parseBnglWithFallback(bngl, parserPref.preferLegacyFirst)),
        resolveTimeoutMs('bngl_to_sbml.parse_model', PHASE_TIMEOUT_MS),
        `${modelId} parse BNGL (for SBML export)`
      );
      model = parsed.model;
      parserUsed = parsed.parser;
      parserStrictError = parsed.strictError;
    } finally {
      stopParseHb();
    }
  }
  const inputCounts = summarizeBnglModel(model);
  log(
    modelId,
    'bngl_to_sbml.parse_model',
    `input species=${inputCounts.species} reactions=${inputCounts.reactions} reactionRules=${inputCounts.reactionRules} functions=${inputCounts.functions}`
  );

  if (requiresCompartmentResolution(model)) {
    const stopCompHb = startHeartbeat(modelId, 'bngl_to_sbml.resolve_compartments');
    try {
      model = await withTimeout(
        resolveCompartmentVolumes(model),
        resolveTimeoutMs('bngl_to_sbml.resolve_compartments', PHASE_TIMEOUT_MS),
        `${modelId} resolve compartment volumes`
      );
    } finally {
      stopCompHb();
    }
  }

  const hasRules = (model.reactionRules?.length || 0) > 0;
  const hasReactions = (model.reactions?.length || 0) > 0;
  let expandedNetwork = false;
  let expansionTimedOut = false;
  let exportUsedUnexpandedFallback = false;
  if (hasRules && !hasReactions) {
    const reactionRuleLines = extractReactionRuleLines(bngl);
    const zeroRateRuleLines = reactionRuleLines.filter((line) => ZERO_RATE_TAIL_RE.test(line)).length;
    const allRuleRatesLiteralZero = reactionRuleLines.length > 0 && zeroRateRuleLines === reactionRuleLines.length;
    const remainingBudgetMs = getRemainingBudgetMs ? getRemainingBudgetMs() : PER_MODEL_TIMEOUT_MS;
    const skipExpansionForBudget =
      BUDGET_AWARE_EXPANSION_SKIP &&
      PER_MODEL_TIMEOUT_MS <= BUDGET_AWARE_EXPANSION_MODEL_TIMEOUT_MAX_MS &&
      remainingBudgetMs <= BUDGET_AWARE_EXPANSION_REMAINING_MS &&
      (
        inputCounts.reactionRules >= BUDGET_AWARE_EXPANSION_MIN_RULES ||
        inputCounts.species >= BUDGET_AWARE_EXPANSION_MIN_SPECIES ||
        inputCounts.functions >= BUDGET_AWARE_EXPANSION_MIN_FUNCTIONS
      );
    const skipExpansionForSize =
      inputCounts.species > MAX_SPECIES_FOR_EXPANSION ||
      inputCounts.reactionRules > MAX_RULES_FOR_EXPANSION ||
      bngl.length > MAX_BNGL_LEN_FOR_EXPANSION;
    if (allRuleRatesLiteralZero || skipExpansionForSize || skipExpansionForBudget) {
      if (!ALLOW_EXPORT_WITHOUT_EXPANSION) {
        throw new Error(
          `Expansion disabled but unexpanded export fallback is off ` +
            `(species=${inputCounts.species}, reactionRules=${inputCounts.reactionRules}, ` +
            `bnglLen=${bngl.length}, allRuleRatesLiteralZero=${allRuleRatesLiteralZero}, ` +
            `skipExpansionForBudget=${skipExpansionForBudget})`
        );
      }
      exportUsedUnexpandedFallback = true;
      log(
        modelId,
        'bngl_to_sbml.expand_network',
        `skipping expansion due ${
          allRuleRatesLiteralZero
            ? 'all-literal-zero rule rates'
            : skipExpansionForSize
              ? 'size gates'
              : `budget gate (remainingMs=${remainingBudgetMs})`
        } (species=${inputCounts.species}, reactionRules=${inputCounts.reactionRules}, functions=${inputCounts.functions}, bnglLen=${bngl.length})`
      );
    } else {
    const stopEvalHb = startHeartbeat(modelId, 'bngl_to_sbml.load_evaluator');
    try {
      await withTimeout(
        loadEvaluator(),
        resolveTimeoutMs('bngl_to_sbml.load_evaluator', PHASE_TIMEOUT_MS),
        `${modelId} load evaluator`
      );
    } finally {
      stopEvalHb();
    }

    const networkOptions = {
      ...((model as any).networkOptions || {}),
      maxSpecies: MAX_SPECIES_FOR_EXPANSION,
      maxReactions: MAX_REACTIONS_FOR_EXPANSION,
      maxIter: MAX_ITER_FOR_EXPANSION,
      maxAgg: MAX_AGG_FOR_EXPANSION,
    };
    (model as any).networkOptions = networkOptions;
    log(
      modelId,
      'bngl_to_sbml.expand_network',
      `limits maxSpecies=${networkOptions.maxSpecies} maxReactions=${networkOptions.maxReactions} maxIter=${networkOptions.maxIter} maxAgg=${networkOptions.maxAgg}`
    );
    const expansionTimeoutMs =
      inputCounts.reactionRules >= RULES_TIMEOUT_BUMP_THRESHOLD
        ? Math.max(NETWORK_EXPANSION_PHASE_TIMEOUT_MS, LARGE_NETWORK_EXPANSION_TIMEOUT_MS)
        : NETWORK_EXPANSION_PHASE_TIMEOUT_MS;
    const effectiveExpansionTimeoutMs = resolveTimeoutMs(
      'bngl_to_sbml.expand_network',
      expansionTimeoutMs
    );
    log(
      modelId,
      'bngl_to_sbml.expand_network',
      `timeoutMs requested=${expansionTimeoutMs} effective=${effectiveExpansionTimeoutMs}`
    );

    const stopExpandHb = startHeartbeat(modelId, 'bngl_to_sbml.expand_network');
    let lastProgressLog = 0;
    try {
      model = await withTimeout(
        generateExpandedNetwork(
          model,
          () => undefined,
          (p) => {
            const now = Date.now();
            if (PHASE_HEARTBEAT_MS > 0 && now - lastProgressLog >= PHASE_HEARTBEAT_MS) {
              lastProgressLog = now;
              logDebug(
                modelId,
                'bngl_to_sbml.expand_network.progress',
                `iter=${p.iteration} species=${p.species} reactions=${p.reactions}`
              );
            }
          }
        ),
        effectiveExpansionTimeoutMs,
        `${modelId} generate expanded network`
      );
      expandedNetwork = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expansionTimedOut = /timed out/i.test(message);
      if (!ALLOW_EXPORT_WITHOUT_EXPANSION) {
        throw error;
      }
      exportUsedUnexpandedFallback = true;
      log(
        modelId,
        'bngl_to_sbml.expand_network',
        `expansion failed (${message}); continuing with unexpanded model`
      );
    } finally {
      stopExpandHb();
    }
    }
  }

  const stopExportHb = startHeartbeat(modelId, 'bngl_to_sbml.export_sbml');
  let sbml: string;
  try {
    const exportTimeoutMs = resolveTimeoutMs('bngl_to_sbml.export_sbml', EXPORT_SBML_PHASE_TIMEOUT_MS);
    log(
      modelId,
      'bngl_to_sbml.export_sbml',
      `start timeoutMs=${exportTimeoutMs} species=${model.species?.length ?? 0} reactions=${model.reactions?.length ?? 0} reactionRules=${model.reactionRules?.length ?? 0}`
    );
    sbml = await withTimeout(
      exportToSBML(model),
      exportTimeoutMs,
      `${modelId} export SBML`
    );
  } finally {
    stopExportHb();
  }
  const outputCounts = summarizeBnglModel(model);
  log(
    modelId,
    'bngl_to_sbml.export_sbml',
    `output species=${outputCounts.species} reactions=${outputCounts.reactions} reactionRules=${outputCounts.reactionRules} functions=${outputCounts.functions}`
  );

  return {
    sbml,
    inputCounts,
    outputCounts,
    expandedNetwork,
    expansionTimedOut,
    exportUsedUnexpandedFallback,
    exportUsedOriginalSbmlFallback: false,
    parserUsed,
    parserStrictError,
  };
};

const writeSingleResult = async (result: RoundtripResult) => {
  const modelDir = path.join(effectiveOutDir, result.modelId);
  await fs.mkdir(modelDir, { recursive: true });
  const resultPath = path.join(modelDir, 'result.json');
  await fs.writeFile(resultPath, JSON.stringify(result, null, 2), 'utf8');
  return resultPath;
};

async function roundtripOne(modelId: string): Promise<RoundtripResult> {
  const start = Date.now();
  const parser = new SBMLParser();
  const phaseTimingsMs: Record<string, number> = {};
  let parsedBnglForConversion: ParsedBnglOutcome | undefined;
  let originalSbmlPath: string | undefined;
  let bnglPath: string | undefined;
  let roundtripSbmlPath: string | undefined;
  let bnglLength: number | undefined;
  const nearTimeoutWarningMs = Math.max(
    1000,
    Math.min(45000, PER_MODEL_TIMEOUT_MS - 5000)
  );
  const nearTimeoutWarningTimer = setTimeout(() => {
    const elapsedMs = Date.now() - start;
    const remainingMs = Math.max(0, PER_MODEL_TIMEOUT_MS - elapsedMs);
    log(
      modelId,
      'watchdog',
      `model nearing timeout elapsedMs=${elapsedMs} remainingBudgetMs=${remainingMs} hardBudgetMs=${PER_MODEL_TIMEOUT_MS}`
    );
  }, nearTimeoutWarningMs);
  if (typeof (nearTimeoutWarningTimer as any).unref === 'function') {
    (nearTimeoutWarningTimer as any).unref();
  }
  const diagnostics: RoundtripResult['diagnostics'] = {
    sbmlInput: {
      hasSbmlTag: false,
      hasEvents: false,
      hasRules: false,
      hasFbcNamespace: false,
      speciesTagCount: 0,
      reactionTagCount: 0,
      kineticLawTagCount: 0,
      rateRuleTagCount: 0,
      assignmentRuleTagCount: 0,
      algebraicRuleTagCount: 0,
      length: 0,
    },
    bngl: {
      hasBeginModel: false,
      reactionRuleLineCount: 0,
      zeroRateRuleLineCount: 0,
      nonZeroRateRuleLineCount: 0,
      parameterCount: 0,
      nonZeroParameterCount: 0,
      speciesCount: 0,
      reactionRuleCount: 0,
      reactionCount: 0,
      functionCount: 0,
      usesBareTime: false,
      hasRateRuleMetadata: false,
    },
  };
  const resolveTimeoutMs: PhaseTimeoutResolver = (
    phase: string,
    requestedMs: number,
    reserveMs = MODEL_TIMEOUT_RESERVE_MS
  ): number => {
    const elapsedMs = Date.now() - start;
    const remainingMs = PER_MODEL_TIMEOUT_MS - elapsedMs;
    if (remainingMs <= reserveMs) {
      throw new Error(
        `${modelId} timed out before ${phase} (elapsed=${elapsedMs}ms, budget=${PER_MODEL_TIMEOUT_MS}ms)`
      );
    }

    const requestedBounded = clampMs(
      Number.isFinite(requestedMs) ? requestedMs : PHASE_TIMEOUT_MS,
      PHASE_TIMEOUT_MIN_MS,
      MAX_PHASE_TIMEOUT_CAP_MS
    );
    const effectiveMs = Math.floor(Math.min(requestedBounded, remainingMs - reserveMs));
    if (effectiveMs < PHASE_TIMEOUT_MIN_MS) {
      throw new Error(
        `${modelId} timed out before ${phase} (remaining=${remainingMs}ms, required>=${PHASE_TIMEOUT_MIN_MS}ms)`
      );
    }
    if (effectiveMs < requestedBounded) {
      log(
        modelId,
        phase,
        `timeout clamped requested=${requestedBounded}ms effective=${effectiveMs}ms remaining=${remainingMs}ms`
      );
    }
    return effectiveMs;
  };
  const getRemainingBudgetMs = (): number => Math.max(0, PER_MODEL_TIMEOUT_MS - (Date.now() - start));
  const runPhase = async <T>(phase: string, fn: () => Promise<T>): Promise<T> => {
    const t0 = Date.now();
    const elapsedAtStart = Date.now() - start;
    const remainingAtStart = PER_MODEL_TIMEOUT_MS - elapsedAtStart;
    if (remainingAtStart <= 0) {
      throw new Error(
        `${modelId} timed out before phase ${phase} started (budget=${PER_MODEL_TIMEOUT_MS}ms)`
      );
    }
    const stopHb = startHeartbeat(modelId, phase);
    log(
      modelId,
      phase,
      `start elapsedMs=${elapsedAtStart} remainingBudgetMs=${remainingAtStart}`
    );
    try {
      const out = await fn();
      return out;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log(modelId, phase, `error after ${Date.now() - t0} ms: ${msg}`);
      throw error;
    } finally {
      stopHb();
      phaseTimingsMs[phase] = Date.now() - t0;
      const elapsedAfter = Date.now() - start;
      const remainingAfter = Math.max(0, PER_MODEL_TIMEOUT_MS - elapsedAfter);
      log(
        modelId,
        phase,
        `done phaseMs=${phaseTimingsMs[phase]} totalElapsedMs=${elapsedAfter} remainingBudgetMs=${remainingAfter}`
      );
    }
  };

  try {
    const fetched = await runPhase('fetch_sbml', async () => {
      const runFetchAttempt = async () =>
        withTimeout(
          fetchBioModelsSbml(modelId),
          resolveTimeoutMs('fetch_sbml.fetch', FETCH_SBML_PHASE_TIMEOUT_MS),
          `${modelId} fetch SBML`
        );
      try {
        return await runFetchAttempt();
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        const retryableTimeout =
          /fetch SBML timed out/i.test(msg) ||
          /HTTP fetch .* timed out/i.test(msg) ||
          /response body read .* timed out/i.test(msg);
        const remainingMs = getRemainingBudgetMs();
        if (!retryableTimeout || remainingMs < 8000) {
          throw error;
        }
        log(
          modelId,
          'fetch_sbml',
          `retrying once after timeout (remainingBudgetMs=${remainingMs})`
        );
        return await runFetchAttempt();
      }
    });

    const originalSbml = fetched.sbmlText;
    diagnostics.sbmlInput.length = originalSbml.length;
    diagnostics.sbmlInput.hasSbmlTag = /<\s*sbml(?:\s|>)/i.test(originalSbml);
    diagnostics.sbmlInput.hasEvents = /<\s*listOfEvents(?:\s|>)/i.test(originalSbml);
    diagnostics.sbmlInput.hasRules = /<\s*listOfRules(?:\s|>)/i.test(originalSbml);
    diagnostics.sbmlInput.hasFbcNamespace = /xmlns:fbc\b|fbc:/i.test(originalSbml);
    diagnostics.sbmlInput.speciesTagCount = (originalSbml.match(/<\s*species\b/gi) || []).length;
    diagnostics.sbmlInput.reactionTagCount = (originalSbml.match(/<\s*reaction\b/gi) || []).length;
    diagnostics.sbmlInput.kineticLawTagCount = (originalSbml.match(/<\s*kineticLaw\b/gi) || []).length;
    diagnostics.sbmlInput.rateRuleTagCount = (originalSbml.match(/<\s*rateRule\b/gi) || []).length;
    diagnostics.sbmlInput.assignmentRuleTagCount = (originalSbml.match(/<\s*assignmentRule\b/gi) || []).length;
    diagnostics.sbmlInput.algebraicRuleTagCount = (originalSbml.match(/<\s*algebraicRule\b/gi) || []).length;

    if (!diagnostics.sbmlInput.hasSbmlTag) {
      throw new Error(`${modelId} payload is not SBML (missing <sbml> root tag).`);
    }
    log(
      modelId,
      'fetch_sbml',
      `SBML ok len=${diagnostics.sbmlInput.length} speciesTags=${diagnostics.sbmlInput.speciesTagCount} ` +
        `reactionTags=${diagnostics.sbmlInput.reactionTagCount} kineticLawTags=${diagnostics.sbmlInput.kineticLawTagCount} ` +
        `rateRules=${diagnostics.sbmlInput.rateRuleTagCount} hasEvents=${diagnostics.sbmlInput.hasEvents} ` +
        `hasRules=${diagnostics.sbmlInput.hasRules} hasFbc=${diagnostics.sbmlInput.hasFbcNamespace}`
    );

    const atomizer = new Atomizer();
    const atomized = await runPhase('atomize', async () => {
      await withTimeout(
        atomizer.initialize(),
        resolveTimeoutMs('atomize.init', ATOMIZER_INIT_PHASE_TIMEOUT_MS),
        `${modelId} atomizer init`
      );
      return await withTimeout(
        atomizer.atomize(originalSbml),
        resolveTimeoutMs('atomize.run', ATOMIZE_PHASE_TIMEOUT_MS),
        `${modelId} atomize`
      );
    });
    if (!atomized.success || !atomized.bngl) {
      throw new Error(atomized.error || 'Atomization returned unsuccessful result.');
    }
    bnglLength = atomized.bngl.length;

    const modelDir = path.join(effectiveOutDir, modelId);
    await fs.mkdir(modelDir, { recursive: true });
    originalSbmlPath = path.join(modelDir, 'original.sbml.xml');
    bnglPath = path.join(modelDir, 'atomized.bngl');
    await fs.writeFile(originalSbmlPath, originalSbml, 'utf8');
    await fs.writeFile(bnglPath, atomized.bngl, 'utf8');

    diagnostics.bngl.hasBeginModel = /begin\s+model/i.test(atomized.bngl);
    diagnostics.bngl.functionCount = atomized.bngl
      .split('\n')
      .filter((line) => /^\s*[A-Za-z_][A-Za-z0-9_]*\s*\([^)]*\)\s*=/.test(line))
      .length;
    diagnostics.bngl.usesBareTime = /\btime\b(?!\s*\()/i.test(atomized.bngl);
    const reactionRuleLines = atomized.bngl
      .split('\n')
      .filter((line) => {
        const s = line.trim();
        return s.length > 0 && !s.startsWith('#') && (s.includes('->') || s.includes('<->'));
      });
    diagnostics.bngl.reactionRuleLineCount = reactionRuleLines.length;
    diagnostics.bngl.zeroRateRuleLineCount = reactionRuleLines.filter((line) => ZERO_RATE_TAIL_RE.test(line.trim())).length;
    diagnostics.bngl.nonZeroRateRuleLineCount =
      diagnostics.bngl.reactionRuleLineCount - diagnostics.bngl.zeroRateRuleLineCount;
    diagnostics.bngl.hasRateRuleMetadata = /__rate_rule__/i.test(atomized.bngl);
    const skipHeavyDiagnosticsParse =
      SKIP_DIAGNOSTICS_ON_HUGE_BNGL &&
      (
        atomized.bngl.length >= SKIP_DIAGNOSTICS_BNGL_LEN ||
        diagnostics.bngl.functionCount >= SKIP_DIAGNOSTICS_FUNCTIONS ||
        diagnostics.bngl.reactionRuleLineCount >= SKIP_DIAGNOSTICS_RULE_LINES
      );
    if (skipHeavyDiagnosticsParse) {
      diagnostics.bngl.parameterCount = 0;
      diagnostics.bngl.nonZeroParameterCount = 0;
      diagnostics.bngl.speciesCount = diagnostics.sbmlInput.speciesTagCount;
      diagnostics.bngl.reactionRuleCount = diagnostics.bngl.reactionRuleLineCount;
      diagnostics.bngl.reactionCount = 0;
      parsedBnglForConversion = undefined;
      log(
        modelId,
        'parse_bngl_diagnostics',
        `Skipped heavy BNGL diagnostics parse (bnglLen=${atomized.bngl.length}, functions=${diagnostics.bngl.functionCount}, ruleLines=${diagnostics.bngl.reactionRuleLineCount})`
      );
    } else {
      const diagnosticsParserPref = parserPreferenceForBngl({
        bnglLength: atomized.bngl.length,
        functionCount: diagnostics.bngl.functionCount,
        reactionRuleLineCount: diagnostics.bngl.reactionRuleLineCount,
        hasRules: diagnostics.sbmlInput.hasRules,
        reactionTagCount: diagnostics.sbmlInput.reactionTagCount,
        hasRateRuleMetadata: diagnostics.bngl.hasRateRuleMetadata,
      });
      if (diagnosticsParserPref.preferLegacyFirst) {
        log(
          modelId,
          'parse_bngl_diagnostics',
          `parser_preference=legacy_first reason=${diagnosticsParserPref.reasons.join(',')}`
        );
      }

      const parsedBnglResult = await runPhase('parse_bngl_diagnostics', async () => {
        try {
          return await withTimeout(
            Promise.resolve(parseBnglWithFallback(atomized.bngl, diagnosticsParserPref.preferLegacyFirst)),
            resolveTimeoutMs('parse_bngl_diagnostics.parse', PARSE_BNGL_PHASE_TIMEOUT_MS),
            `${modelId} parse BNGL`
          );
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          diagnostics.parseBnglErrorSnippet = extractBnglParseSnippet(atomized.bngl, msg);
          throw error;
        }
      });
      parsedBnglForConversion = parsedBnglResult;
      const parsedBngl = parsedBnglResult.model;
      if (parsedBnglResult.parser === 'legacy' && parsedBnglResult.strictError) {
        diagnostics.parseBnglErrorSnippet = extractBnglParseSnippet(atomized.bngl, parsedBnglResult.strictError);
      }
      diagnostics.bngl.parameterCount = Object.keys(parsedBngl.parameters || {}).length;
      diagnostics.bngl.nonZeroParameterCount = Object.values(parsedBngl.parameters || {}).filter((v) => Number(v) !== 0).length;
      diagnostics.bngl.speciesCount = parsedBngl.species?.length ?? 0;
      diagnostics.bngl.reactionRuleCount = parsedBngl.reactionRules?.length ?? 0;
      diagnostics.bngl.reactionCount = parsedBngl.reactions?.length ?? 0;
    }

    const flatlineReasons: string[] = [];
    const sourceRuleOnly = diagnostics.sbmlInput.hasRules && diagnostics.sbmlInput.reactionTagCount === 0;
    if (sourceRuleOnly) {
      flatlineReasons.push('Source SBML is rule-only (0 <reaction> tags, has <listOfRules>)');
    } else {
      if (diagnostics.sbmlInput.speciesTagCount === 0) flatlineReasons.push('Source SBML has 0 <species> tags');
      if (diagnostics.sbmlInput.reactionTagCount === 0) flatlineReasons.push('Source SBML has 0 <reaction> tags');
      if (diagnostics.bngl.speciesCount === 0) flatlineReasons.push('Atomized BNGL has 0 species');
      if (diagnostics.bngl.reactionRuleCount === 0 && diagnostics.bngl.reactionCount === 0) {
        flatlineReasons.push('Atomized BNGL has 0 reactions/reaction_rules');
      }
      if (
        diagnostics.sbmlInput.reactionTagCount > 0 &&
        diagnostics.bngl.reactionRuleLineCount > 0 &&
        diagnostics.bngl.zeroRateRuleLineCount === diagnostics.bngl.reactionRuleLineCount
      ) {
        flatlineReasons.push('Atomized BNGL reaction rules are all literal zero rates');
      }
    }
    diagnostics.flatlineRisk = {
      risk: !sourceRuleOnly && flatlineReasons.length >= 2,
      reasons: flatlineReasons,
    };

    log(
      modelId,
      'parse_bngl_diagnostics',
      `BNGL len=${atomized.bngl.length} rulesLines=${diagnostics.bngl.reactionRuleLineCount} ` +
        `zeroRules=${diagnostics.bngl.zeroRateRuleLineCount} nonZeroRules=${diagnostics.bngl.nonZeroRateRuleLineCount} ` +
        `params=${diagnostics.bngl.parameterCount} nonZeroParams=${diagnostics.bngl.nonZeroParameterCount} ` +
        `species=${diagnostics.bngl.speciesCount} reactionRules=${diagnostics.bngl.reactionRuleCount} ` +
        `reactions=${diagnostics.bngl.reactionCount} functions=${diagnostics.bngl.functionCount} ` +
        `usesBareTime=${diagnostics.bngl.usesBareTime} hasRateRuleMeta=${diagnostics.bngl.hasRateRuleMetadata}`
    );
    if (diagnostics.flatlineRisk.risk) {
      log(modelId, 'parse_bngl_diagnostics', `flatline risk: ${diagnostics.flatlineRisk.reasons.join('; ')}`);
    }

    const conversion = await runPhase('bngl_to_sbml', async () => {
      return await toBnglThenSbml(
        modelId,
        atomized.bngl,
        resolveTimeoutMs,
        parsedBnglForConversion,
        getRemainingBudgetMs,
        originalSbml
      );
    });
    diagnostics.conversion = {
      inputCounts: conversion.inputCounts,
      outputCounts: conversion.outputCounts,
      expandedNetwork: conversion.expandedNetwork,
      expansionTimedOut: conversion.expansionTimedOut,
      exportUsedUnexpandedFallback: conversion.exportUsedUnexpandedFallback,
      exportUsedOriginalSbmlFallback: conversion.exportUsedOriginalSbmlFallback,
      parserUsed: conversion.parserUsed,
      parserStrictError: conversion.parserStrictError,
    };
    const roundtripSbml = conversion.sbml;
    roundtripSbmlPath = path.join(modelDir, 'roundtrip.sbml.xml');
    await fs.writeFile(roundtripSbmlPath, roundtripSbml, 'utf8');

    let parsedOriginal: any;
    let parsedRoundtrip: any;
    let parseCompareFallbackReason: string | undefined;
    const skipHeavyParseCompare =
      SKIP_COMPARE_ON_LARGE_BNGL &&
      (
        (bnglLength ?? atomized.bngl.length) >= LARGE_COMPARE_BNGL_LEN ||
        diagnostics.bngl.speciesCount >= LARGE_COMPARE_SPECIES ||
        diagnostics.bngl.reactionRuleCount >= LARGE_COMPARE_REACTION_RULES ||
        diagnostics.bngl.reactionCount >= LARGE_COMPARE_REACTIONS
      );
    if (skipHeavyParseCompare) {
      parseCompareFallbackReason =
        `Skipped libsbml parse compare for large model` +
        ` (bnglLen=${bnglLength ?? atomized.bngl.length}, species=${diagnostics.bngl.speciesCount}, ` +
        `reactionRules=${diagnostics.bngl.reactionRuleCount}, reactions=${diagnostics.bngl.reactionCount})`;
      diagnostics.parseCompareFallback = { used: true, reason: parseCompareFallbackReason };
      log(modelId, 'parse_compare', parseCompareFallbackReason);
    } else {
      await runPhase('parse_compare', async () => {
        try {
          await withTimeout(
            parser.initialize(),
            resolveTimeoutMs('parse_compare.init', PARSE_COMPARE_PHASE_TIMEOUT_MS),
            `${modelId} parser init`
          );
          parsedOriginal = await withTimeout(
            parser.parse(originalSbml),
            resolveTimeoutMs('parse_compare.original', PARSE_COMPARE_PHASE_TIMEOUT_MS),
            `${modelId} parse original SBML`
          );
          parsedRoundtrip = await withTimeout(
            parser.parse(roundtripSbml),
            resolveTimeoutMs('parse_compare.roundtrip', PARSE_COMPARE_PHASE_TIMEOUT_MS),
            `${modelId} parse roundtrip SBML`
          );
          diagnostics.parseCompareFallback = { used: false };
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          parseCompareFallbackReason = msg;
          diagnostics.parseCompareFallback = { used: true, reason: msg };
          log(modelId, 'parse_compare', `libsbml compare parse failed; using XML fallback. reason=${msg}`);
        }
      });
    }

    log(
      modelId,
      'parse_compare',
      `conversion expanded=${diagnostics.conversion.expandedNetwork} expansionTimedOut=${diagnostics.conversion.expansionTimedOut} ` +
        `fallbackUnexpanded=${diagnostics.conversion.exportUsedUnexpandedFallback} ` +
        `fallbackOriginalSbml=${diagnostics.conversion.exportUsedOriginalSbmlFallback}`
    );

    const useParsedCompare = !!parsedOriginal && !!parsedRoundtrip;
    const countsOriginal = useParsedCompare ? summarizeModel(parsedOriginal) : summarizeModelFromXml(originalSbml);
    const countsRoundtrip = useParsedCompare ? summarizeModel(parsedRoundtrip) : summarizeModelFromXml(roundtripSbml);
    const countDiff: Record<string, number> = {};
    for (const key of Object.keys(countsOriginal)) {
      countDiff[key] = (countsRoundtrip as any)[key] - (countsOriginal as any)[key];
    }

    const originalSpecies = useParsedCompare ? mapKeys(parsedOriginal.species) : extractIdsFromXml(originalSbml, 'species');
    const roundtripSpecies = useParsedCompare ? mapKeys(parsedRoundtrip.species) : extractIdsFromXml(roundtripSbml, 'species');
    const originalReactions = useParsedCompare ? mapKeys(parsedOriginal.reactions) : extractIdsFromXml(originalSbml, 'reaction');
    const roundtripReactions = useParsedCompare ? mapKeys(parsedRoundtrip.reactions) : extractIdsFromXml(roundtripSbml, 'reaction');

    const exactXmlMatch = originalSbml === roundtripSbml;
    const normalizedXmlMatch = hashText(normalizeXmlForHash(originalSbml)) === hashText(normalizeXmlForHash(roundtripSbml));
    diagnostics.kineticsOriginal = useParsedCompare ? summarizeKinetics(parsedOriginal) : summarizeKineticsFromXml(originalSbml);
    diagnostics.kineticsRoundtrip = useParsedCompare
      ? summarizeKinetics(parsedRoundtrip)
      : summarizeKineticsFromXml(roundtripSbml);
    log(
      modelId,
      'parse_compare',
      `kinetics original={rxn:${diagnostics.kineticsOriginal.reactions}, empty:${diagnostics.kineticsOriginal.formulasEmpty}, zero:${diagnostics.kineticsOriginal.formulasLiteralZero}} roundtrip={rxn:${diagnostics.kineticsRoundtrip.reactions}, empty:${diagnostics.kineticsRoundtrip.formulasEmpty}, zero:${diagnostics.kineticsRoundtrip.formulasLiteralZero}}`
    );
    if (parseCompareFallbackReason) {
      log(modelId, 'parse_compare', `fallback_compare=true reason=${parseCompareFallbackReason}`);
    }

    const compare = {
      exactXmlMatch,
      normalizedXmlMatch,
      countsOriginal,
      countsRoundtrip,
      countDiff,
      speciesIdDelta: {
        onlyInOriginal: setDeltaCount(originalSpecies, roundtripSpecies),
        onlyInRoundtrip: setDeltaCount(roundtripSpecies, originalSpecies),
      },
      reactionIdDelta: {
        onlyInOriginal: setDeltaCount(originalReactions, roundtripReactions),
        onlyInRoundtrip: setDeltaCount(roundtripReactions, originalReactions),
      },
    };
    const quality = buildRoundtripQuality(diagnostics, compare);
    if (!quality.effectiveRoundtrip) {
      log(modelId, 'quality', `ineffective roundtrip indicators: ${quality.reasons.join(' | ')}`);
    }
    const effectiveFailure = REQUIRE_EFFECTIVE_ROUNDTRIP && !quality.effectiveRoundtrip;

    clearTimeout(nearTimeoutWarningTimer);
    return {
      modelId,
      ok: !effectiveFailure,
      error: effectiveFailure
        ? `Ineffective roundtrip: ${quality.reasons.join(' | ')}`
        : undefined,
      sourceUrl: fetched.sourceUrl,
      sourceEntry: fetched.sourceEntry,
      originalSbmlPath,
      bnglPath,
      roundtripSbmlPath,
      bnglLength: bnglLength ?? atomized.bngl.length,
      diagnostics,
      quality,
      phaseTimingsMs,
      compare,
      durationMs: Date.now() - start,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    clearTimeout(nearTimeoutWarningTimer);
    return {
      modelId,
      ok: false,
      timedOut: /timed out/i.test(errorMessage),
      error: errorMessage,
      sourceUrl: undefined,
      sourceEntry: undefined,
      originalSbmlPath,
      bnglPath,
      roundtripSbmlPath,
      bnglLength,
      diagnostics,
      phaseTimingsMs,
      durationMs: Date.now() - start,
    };
  }
}

const killProcessTree = async (pid: number): Promise<void> => {
  if (!pid) return;
  if (process.platform === 'win32') {
    await new Promise<void>((resolve) => {
      const killer = spawn('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore' });
      killer.on('error', () => resolve());
      killer.on('exit', () => resolve());
    });
    return;
  }
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // ignore
  }
};

async function runSingleMode() {
  if (!singleId) throw new Error('--single requires a model id');
  let result: RoundtripResult;
  try {
    result = await withTimeout(
      roundtripOne(singleId),
      PER_MODEL_TIMEOUT_MS,
      `${singleId} single-model roundtrip`
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    result = {
      modelId: singleId,
      ok: false,
      timedOut: /timed out/i.test(msg),
      error: msg,
      durationMs: PER_MODEL_TIMEOUT_MS,
    };
  }
  const resultPath = await writeSingleResult(result);
  console.log(`SINGLE_RESULT_PATH=${resultPath}`);
  console.log(`SINGLE_RESULT_STATUS=${result.ok ? 'PASS' : 'FAIL'}`);
  if (!result.ok) {
    process.exitCode = result.timedOut ? 124 : 1;
  }
  if (result.timedOut) {
    console.error(`[roundtrip] single-mode timeout enforced at ${PER_MODEL_TIMEOUT_MS} ms`);
    process.exit(124);
  }
}

async function runBatchMode() {
  await fs.mkdir(effectiveOutDir, { recursive: true });
  const startedAt = nowIso();
  const targetIds = await resolveTargetIds();
  const existingResults: RoundtripResult[] = [];
  const runIds: string[] = [];
  if (SKIP_EXISTING_RESULTS) {
    for (const id of targetIds) {
      const existingResultPath = path.join(effectiveOutDir, id, 'result.json');
      try {
        const raw = await fs.readFile(existingResultPath, 'utf8');
        existingResults.push(JSON.parse(raw) as RoundtripResult);
      } catch {
        runIds.push(id);
      }
    }
  } else {
    runIds.push(...targetIds);
  }
  const passLogEvery = Math.max(1, Number(process.env.BIOMODELS_ROUNDTRIP_PASS_LOG_EVERY || '25'));
  console.log(
    `[roundtrip] Starting batch: models=${targetIds.length} timeoutPerModelMs=${PER_MODEL_TIMEOUT_MS} maxBatchMs=${BATCH_TIMEOUT_MS}`
  );
  if (allSbmlFlag) {
    console.log(
      `[roundtrip] Source: BioModels SBML catalog offset=${allSbmlOffset} limit=${allSbmlLimit > 0 ? allSbmlLimit : 'all'}`
    );
  }
  if (SKIP_EXISTING_RESULTS) {
    console.log(`[roundtrip] Resume: reusing existing=${existingResults.length} pending=${runIds.length}`);
  }
  if (runIds.length === 0) {
    console.log('[roundtrip] No pending models after resume filter.');
  }

  const watchdog = setTimeout(() => {
    console.error(`[roundtrip] Global kill switch fired at ${BATCH_TIMEOUT_MS} ms`);
    process.exit(124);
  }, BATCH_TIMEOUT_MS);

  try {
    const requestedConcurrency = Math.max(
      1,
      Math.trunc(parseFiniteNumber(process.env.BIOMODELS_ROUNDTRIP_CONCURRENCY, 1))
    );
    let concurrency = requestedConcurrency;
    if (
      PER_MODEL_TIMEOUT_MS <= HARD_MODEL_TIMEOUT_MS &&
      requestedConcurrency > CONCURRENCY_CAP_TIGHT_TIMEOUT
    ) {
      concurrency = CONCURRENCY_CAP_TIGHT_TIMEOUT;
      console.log(
        `[roundtrip] Concurrency capped from ${requestedConcurrency} to ${concurrency} for tight timeout budget (${PER_MODEL_TIMEOUT_MS}ms)`
      );
    }
    const workerCount = Math.min(concurrency, runIds.length);
    if (workerCount > 1) {
      console.log(`[roundtrip] Concurrency: ${workerCount}`);
    }
    const freshResults: RoundtripResult[] = new Array(runIds.length);

    const runChildForId = async (id: string): Promise<RoundtripResult> => {
      const modelDir = path.join(effectiveOutDir, id);
      await fs.mkdir(modelDir, { recursive: true });
      await Promise.allSettled([
        fs.rm(path.join(modelDir, 'result.json'), { force: true }),
        fs.rm(path.join(modelDir, 'roundtrip.sbml.xml'), { force: true }),
      ]);
      const childLogPath = path.join(modelDir, 'child.log');
      await fs.writeFile(childLogPath, '', 'utf8');

      const tsxCli = path.resolve(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
      const child = spawn(
        process.execPath,
        [tsxCli, 'scripts/biomodels_roundtrip_compare.ts', '--single', id, '--outdir', effectiveOutDir],
        { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] }
      );

      let timedOut = false;
      let childExited = false;
      const timer = setTimeout(async () => {
        if (childExited) return;
        timedOut = true;
        console.error(`[roundtrip] ${id} exceeded ${PER_MODEL_TIMEOUT_MS}ms; killing child PID ${child.pid}`);
        await killProcessTree(child.pid ?? 0);
      }, PER_MODEL_TIMEOUT_MS);
      if (typeof (timer as any).unref === 'function') {
        (timer as any).unref();
      }

      const appendLog = async (data: string) => {
        await fs.appendFile(childLogPath, data, 'utf8');
      };
      const safeWrite = (stream: NodeJS.WriteStream, text: string): void => {
        try {
          stream.write(text);
        } catch (error) {
          const code = (error as any)?.code;
          if (code !== 'EPIPE') {
            console.error(`[roundtrip] stream write failed for ${id}:`, error);
          }
        }
      };

      child.stdout.on('data', (d) => {
        const s = String(d);
        if (STREAM_CHILD_LOGS) {
          safeWrite(process.stdout, `[child:${id}] ${s}`);
        }
        void appendLog(s);
      });
      child.stderr.on('data', (d) => {
        const s = String(d);
        if (STREAM_CHILD_LOGS) {
          safeWrite(process.stderr, `[child:${id}:err] ${s}`);
        }
        void appendLog(s);
      });

      const exitCode = await new Promise<number>((resolve) => {
        child.on('exit', (code) => resolve(code ?? 0));
        child.on('error', () => resolve(1));
      });
      childExited = true;
      clearTimeout(timer);

      const resultPath = path.join(modelDir, 'result.json');
      let result: RoundtripResult;
      try {
        const raw = await fs.readFile(resultPath, 'utf8');
        result = JSON.parse(raw) as RoundtripResult;
      } catch {
        result = {
          modelId: id,
          ok: false,
          timedOut,
          error: timedOut
            ? `Child timed out after ${PER_MODEL_TIMEOUT_MS} ms`
            : `Child exited with code ${exitCode} before writing result.json`,
          durationMs: PER_MODEL_TIMEOUT_MS,
        };
        try {
          await fs.writeFile(resultPath, JSON.stringify(result, null, 2), 'utf8');
        } catch {
          // best-effort persistence for resume mode
        }
      }

      if (timedOut) {
        result.ok = false;
        result.timedOut = true;
        result.error = result.error || `Child timed out after ${PER_MODEL_TIMEOUT_MS} ms`;
        try {
          await fs.writeFile(resultPath, JSON.stringify(result, null, 2), 'utf8');
        } catch {
          // best-effort persistence for resume mode
        }
      }
      return result;
    };

    let nextIndex = 0;
    let completed = 0;
    const runWorker = async () => {
      while (true) {
        const idx = nextIndex++;
        if (idx >= runIds.length) return;
        const id = runIds[idx];
        console.log(
          `[roundtrip] Spawning child ${idx + 1}/${runIds.length} for ${id} (timeout=${PER_MODEL_TIMEOUT_MS}ms)`
        );
        const result = await runChildForId(id);
        freshResults[idx] = result;
        completed += 1;
        const shouldLogPass = ROUNDTRIP_VERBOSE || (completed % passLogEvery === 0) || completed === runIds.length;
        if (!result.ok || shouldLogPass) {
          console.log(
            `[roundtrip] ${result.ok ? 'PASS' : 'FAIL'} ${completed}/${runIds.length} ${id} (${result.durationMs} ms)${
              result.error ? ' - ' + result.error : ''
            }`
          );
        }
      }
    };
    if (workerCount > 0) {
      await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
    }

    const results = [
      ...existingResults,
      ...freshResults.filter((r): r is RoundtripResult => !!r),
    ];

    const summary = {
      startedAt,
      finishedAt: nowIso(),
      total: results.length,
      passed: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      effectivePassed: results.filter((r) => r.quality?.effectiveRoundtrip !== false).length,
      effectiveFailed: results.filter((r) => r.quality?.effectiveRoundtrip === false).length,
      timeouts: results.filter((r) => r.timedOut).length,
      requireEffectiveRoundtrip: REQUIRE_EFFECTIVE_ROUNDTRIP,
      perModelTimeoutMs: PER_MODEL_TIMEOUT_MS,
      results,
    };

    const reportPath = path.join(
      effectiveOutDir,
      `roundtrip_report_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    );
    await fs.writeFile(reportPath, JSON.stringify(summary, null, 2), 'utf8');
    console.log(`[roundtrip] Report: ${reportPath}`);
    if (summary.failed > 0) process.exitCode = 1;
  } finally {
    clearTimeout(watchdog);
  }
}

async function main() {
  emitTimeoutConfigurationLog();
  if (singleId) {
    await runSingleMode();
    return;
  }
  await runBatchMode();
}

main().catch((err) => {
  console.error('[roundtrip] Fatal:', err);
  process.exit(1);
});
