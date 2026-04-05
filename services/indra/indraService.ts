import type {
  INDRADBQueryParams,
  INDRADBQueryResponse,
  INDRAAssembleEnglishResponse,
  INDRAAssemblePySBResponse,
  INDRAProcessTextResponse,
  INDRAStatement,
  INDRAModification,
  ReviewableStatement,
} from './types';
import { parseBNGLWithANTLR } from '@bngplayground/engine';

const DEFAULT_INDRA_API_BASE = 'https://api.indra.bio';
const DEFAULT_INDRA_DB_BASE = 'https://db.indra.bio';
const DEFAULT_TIMEOUT_MS = 30_000;
const DB_TIMEOUT_MS = 45_000;
const INDRA_DEBUG = true;

function logIndra(message: string, data?: unknown): void {
  if (!INDRA_DEBUG) return;
  if (data === undefined) {
    console.log(`[INDRA] ${message}`);
    return;
  }
  console.log(`[INDRA] ${message}`, data);
}

function getEnvString(name: string): string | null {
  try {
    const value = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env?.[name];
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  } catch {
    return null;
  }
}

function getIndraApiBase(): string {
  const explicit = getEnvString('VITE_INDRA_API_BASE');
  const base = explicit ? explicit.replace(/\/$/, '') : DEFAULT_INDRA_API_BASE;
  logIndra('Resolved API base', { explicit, base, hostname: typeof window !== 'undefined' ? window.location.hostname : 'server' });
  return base;
}

function getIndraDbBase(): string {
  const explicit = getEnvString('VITE_INDRA_DB_BASE');
  const base = explicit ? explicit.replace(/\/$/, '') : DEFAULT_INDRA_DB_BASE;
  logIndra('Resolved DB base', { explicit, base, hostname: typeof window !== 'undefined' ? window.location.hostname : 'server' });
  return base;
}

function normalizeStatementArray(payload: unknown): INDRAStatement[] {
  if (Array.isArray(payload)) {
    return payload as INDRAStatement[];
  }
  if (payload && typeof payload === 'object') {
    const candidate = payload as INDRAProcessTextResponse;
    if (Array.isArray(candidate.statements)) return candidate.statements;
    if (Array.isArray(candidate.results)) return candidate.results;
  }
  return [];
}

function normalizeDbPayload(payload: INDRADBQueryResponse): Array<[string, INDRAStatement]> {
  const records = payload.statements ?? payload.results ?? {};
  return Object.entries(records);
}

function uniqueUrls(urls: string[]): string[] {
  return [...new Set(urls.map((url) => url.replace(/\/$/, '')))];
}

function hasGenerateNetworkAction(code: string): boolean {
  return /\bgenerate_network\s*\(/i.test(code);
}

function hasSimulateAction(code: string): boolean {
  return /\bsimulate(?:_ode|_ssa|_nf|_pla|_rm)?\s*\(/i.test(code);
}

function hasObservablesBlock(code: string): boolean {
  return /\bbegin observables\b/i.test(code);
}

function insertBeforeEndModel(code: string, insertion: string): string {
  const endModelMatch = /\nend model\b/i;
  if (!endModelMatch.test(code)) {
    return `${code.trimEnd()}\n${insertion}\n`;
  }
  return code.replace(endModelMatch, `\n${insertion}\nend model`);
}

function sanitizeObservableName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  const normalized = cleaned.length > 0 ? cleaned : 'obs';
  return /^[A-Za-z_]/.test(normalized) ? normalized : `obs_${normalized}`;
}

function ensureDefaultObservables(code: string): string {
  if (!code.trim() || hasObservablesBlock(code)) return code.trimEnd();

  try {
    const parsed = parseBNGLWithANTLR(code);
    if (!parsed.success || !parsed.model) {
      return code.trimEnd();
    }

    const observableLines: string[] = [];
    const usedNames = new Set<string>();

    for (const moleculeType of parsed.model.moleculeTypes) {
      const observableName = sanitizeObservableName(`${moleculeType.name}_total`);
      usedNames.add(observableName);
      observableLines.push(`  Molecules ${observableName} ${moleculeType.name}()`);
    }

    parsed.model.species.forEach((species, index) => {
      const baseName = sanitizeObservableName(species.initialExpression || `${species.name}_species_${index + 1}`);
      let observableName = baseName;
      let suffix = 2;
      while (usedNames.has(observableName)) {
        observableName = `${baseName}_${suffix}`;
        suffix += 1;
      }
      usedNames.add(observableName);
      observableLines.push(`  Molecules ${observableName} ${species.name}`);
    });

    if (observableLines.length === 0) {
      return code.trimEnd();
    }

    const block = `begin observables\n${observableLines.join('\n')}\nend observables`;
    return insertBeforeEndModel(code.trimEnd(), block);
  } catch {
    return code.trimEnd();
  }
}

function ensureDefaultActions(code: string): string {
  const trimmed = ensureDefaultObservables(code).trimEnd();
  if (!trimmed) return trimmed;

  const actionLines: string[] = [];
  if (!hasGenerateNetworkAction(trimmed)) {
    actionLines.push('generate_network({overwrite=>1})');
  }
  if (!hasSimulateAction(trimmed)) {
    actionLines.push('simulate({method=>"ode", t_end=>100, n_steps=>100})');
  }

  if (actionLines.length === 0) {
    return trimmed;
  }

  return `${trimmed}\n${actionLines.join('\n')}\n`;
}

async function indraFetch<T>(
  url: string,
  options: RequestInit & { timeout?: number } = {},
): Promise<T> {
  const { timeout = DEFAULT_TIMEOUT_MS, ...fetchOpts } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const startedAt = performance.now();
  logIndra('Fetch start', {
    url,
    method: fetchOpts.method ?? 'GET',
    timeout,
    headers: fetchOpts.headers,
    bodyPreview: typeof fetchOpts.body === 'string' ? fetchOpts.body.slice(0, 200) : undefined,
  });

  try {
    const response = await fetch(url, {
      ...fetchOpts,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...fetchOpts.headers,
      },
    });
    logIndra('Fetch response', {
      url,
      status: response.status,
      ok: response.ok,
      elapsedMs: Math.round(performance.now() - startedAt),
      contentType: response.headers.get('content-type'),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      logIndra('Fetch non-ok body', { url, status: response.status, bodyPreview: errorText.slice(0, 300) });
      throw new INDRAError(
        `INDRA API error (${response.status}): ${errorText || response.statusText}`,
        response.status,
        url,
      );
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      return await response.json() as T;
    }

    const text = await response.text();
    logIndra('Fetch text response', { url, textPreview: text.slice(0, 300) });
    return ({ model: text } as unknown) as T;
  } catch (error) {
    logIndra('Fetch error', {
      url,
      elapsedMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : 'unknown',
    });
    if (error instanceof INDRAError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new INDRAError(`INDRA request timed out after ${timeout}ms`, 408, url);
    }
    throw new INDRAError(
      `Network error reaching INDRA: ${error instanceof Error ? error.message : String(error)}`,
      0,
      url,
    );
  } finally {
    clearTimeout(timer);
  }
}

export class INDRAError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly url: string,
  ) {
    super(message);
    this.name = 'INDRAError';
  }
}

export class INDRAService {
  static async processText(text: string): Promise<INDRAStatement[]> {
    if (!text.trim()) return [];
    const candidateBases = uniqueUrls([
      getIndraApiBase(),
      DEFAULT_INDRA_API_BASE,
      'http://api.indra.bio:8000',
    ]);
    const candidatePaths = ['/trips/process_text', '/api/trips/process_text'];
    let lastError: Error | null = null;
    logIndra('processText candidates', { candidateBases, candidatePaths, textPreview: text.slice(0, 160) });

    for (const base of candidateBases) {
      for (const path of candidatePaths) {
        try {
          logIndra('processText attempt', { base, path });
          const response = await indraFetch<INDRAProcessTextResponse>(
            `${base}${path}`,
            {
              method: 'POST',
              body: JSON.stringify({ text }),
              timeout: 60_000,
            },
          );
          const statements = normalizeStatementArray(response);
          logIndra('processText success', { base, path, statementCount: statements.length });
          return statements;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          logIndra('processText failed', {
            base,
            path,
            error: lastError.message,
            statusCode: error instanceof INDRAError ? error.statusCode : undefined,
          });
          if (!(error instanceof INDRAError) || error.statusCode !== 404) {
            throw error;
          }
        }
      }
    }

    throw lastError ?? new INDRAError('INDRA NLP endpoint not found.', 404, getIndraApiBase());
  }

  static async queryAgents(params: INDRADBQueryParams): Promise<{
    statements: INDRAStatement[];
    evidenceCounts: Map<string, number>;
    hashes: string[];
  }> {
    const queryParams = new URLSearchParams();
    if (params.subject) queryParams.set('subject', params.subject);
    if (params.object) queryParams.set('object', params.object);
    if (params.type) queryParams.set('type', params.type);
    queryParams.set('format', 'json');

    const candidateBases = uniqueUrls([
      getIndraDbBase(),
      DEFAULT_INDRA_DB_BASE,
    ]);
    let response: INDRADBQueryResponse | null = null;
    let lastError: Error | null = null;
    logIndra('queryAgents candidates', { candidateBases, params });

    for (const base of candidateBases) {
      try {
        logIndra('queryAgents attempt', { base, query: queryParams.toString() });
        response = await indraFetch<INDRADBQueryResponse>(
          `${base}/statements/from_agents?${queryParams.toString()}`,
          {
            method: 'GET',
            timeout: DB_TIMEOUT_MS,
            headers: {},
          },
        );
        logIndra('queryAgents success', { base, resultKeys: Object.keys(response.results ?? response.statements ?? {}).length });
        break;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logIndra('queryAgents failed', { base, error: lastError.message });
      }
    }

    if (!response) {
      throw lastError ?? new INDRAError('INDRA DB query failed.', 0, getIndraDbBase());
    }

    const entries = normalizeDbPayload(response);
    const evidenceCounts = new Map<string, number>();

    for (const [hash, statement] of entries) {
      evidenceCounts.set(hash, response.evidence_totals?.[hash] ?? statement.evidence?.length ?? 0);
    }

    const filteredEntries = entries.filter(([hash, statement]) => {
      const evidenceCount = evidenceCounts.get(hash) ?? 0;
      if (params.minEvidence !== undefined && evidenceCount < params.minEvidence) return false;
      if (params.minBelief !== undefined && (statement.belief ?? 0) < params.minBelief) return false;
      return true;
    });

    filteredEntries.sort((a, b) => {
      const evidenceDiff = (evidenceCounts.get(b[0]) ?? 0) - (evidenceCounts.get(a[0]) ?? 0);
      if (evidenceDiff !== 0) return evidenceDiff;
      return (b[1].belief ?? 0) - (a[1].belief ?? 0);
    });
    logIndra('queryAgents filtered', {
      totalEntries: entries.length,
      filteredEntries: filteredEntries.length,
      topHashes: filteredEntries.slice(0, 5).map(([hash]) => hash),
    });

    return {
      statements: filteredEntries.map(([, statement]) => statement),
      evidenceCounts,
      hashes: filteredEntries.map(([hash]) => hash),
    };
  }

  static async assembleBNGL(
    statements: INDRAStatement[],
    options: {
      policy?: 'one_step' | 'two_step' | 'interactions_only';
    } = {},
  ): Promise<string> {
    if (statements.length === 0) return '';
    logIndra('assembleBNGL start', {
      statementCount: statements.length,
      policy: options.policy,
      types: statements.slice(0, 10).map((statement) => statement.type),
    });

    const response = await indraFetch<INDRAAssemblePySBResponse>(
      `${getIndraApiBase()}/assemblers/pysb`,
      {
        method: 'POST',
        body: JSON.stringify({
          statements,
          export_format: 'bngl',
          ...(options.policy ? { policies: options.policy } : {}),
        }),
      },
    );
    const model = ensureDefaultActions(response.model ?? response.model_str ?? response.bngl ?? '');
    logIndra('assembleBNGL success', { outputLength: model.length, outputPreview: model.slice(0, 200) });
    return model;
  }

  static async statementsToEnglish(statements: INDRAStatement[]): Promise<string[]> {
    if (statements.length === 0) return [];
    logIndra('statementsToEnglish start', { statementCount: statements.length });

    try {
      const response = await indraFetch<INDRAAssembleEnglishResponse>(
        `${getIndraApiBase()}/assemblers/english`,
        {
          method: 'POST',
          body: JSON.stringify({ statements }),
        },
      );
      const english = response.sentences ?? response.english ?? [];
      logIndra('statementsToEnglish success', { sentenceCount: english.length });
      return english;
    } catch {
      logIndra('statementsToEnglish fallback', { statementCount: statements.length });
      return statements.map((statement) => summarizeStatement(statement));
    }
  }

  static async processTextForReview(text: string): Promise<ReviewableStatement[]> {
    const statements = await this.processText(text);
    if (statements.length === 0) return [];

    const english = await this.statementsToEnglish(statements);
    return statements.map((statement, index) => ({
      statement,
      hash: statement.matches_hash ?? statement.id ?? `nlp-${index}`,
      english: english[index] ?? summarizeStatement(statement),
      evidenceCount: statement.evidence?.length ?? 0,
      selected: true,
      sourceType: 'nlp',
    }));
  }

  static async queryAgentsForReview(params: INDRADBQueryParams): Promise<ReviewableStatement[]> {
    const { statements, evidenceCounts, hashes } = await this.queryAgents(params);
    if (statements.length === 0) return [];

    const english = await this.statementsToEnglish(statements);
    return statements.map((statement, index) => {
      const hash = hashes[index] ?? statement.matches_hash ?? statement.id ?? `db-${index}`;
      return {
        statement,
        hash,
        english: english[index] ?? summarizeStatement(statement),
        evidenceCount: evidenceCounts.get(hash) ?? statement.evidence?.length ?? 0,
        selected: true,
        sourceType: 'db' as const,
      };
    });
  }

  static async isAvailable(): Promise<boolean> {
    const urls = [
      `${getIndraApiBase()}/swagger.json`,
      `${getIndraDbBase()}/statements/from_agents?subject=BRAF&format=json`,
    ];
    logIndra('isAvailable probe start', { urls });
    for (const url of urls) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5_000);
        const response = await fetch(url, {
          method: 'GET',
          signal: controller.signal,
        });
        clearTimeout(timer);
        logIndra('isAvailable probe response', { url, status: response.status, ok: response.ok });
        if (response.ok || response.status === 404 || response.status === 405) {
          return true;
        }
      } catch (error) {
        logIndra('isAvailable probe error', {
          url,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    logIndra('isAvailable probe failed');
    return false;
  }
}

export function summarizeStatement(stmt: INDRAStatement): string {
  switch (stmt.type) {
    case 'Phosphorylation': {
      const enz = stmt.enz?.name ?? 'An enzyme';
      const site = stmt.residue && stmt.position
        ? ` at ${stmt.residue}${stmt.position}`
        : stmt.residue
          ? ` at ${stmt.residue}`
          : '';
      return `${enz} phosphorylates ${stmt.sub.name}${site}.`;
    }
    case 'Dephosphorylation': {
      const enz = stmt.enz?.name ?? 'A phosphatase';
      return `${enz} dephosphorylates ${stmt.sub.name}.`;
    }
    case 'Complex':
      return `${stmt.members.map((member) => member.name).join(', ')} form a complex.`;
    case 'Activation':
      return `${stmt.subj.name} activates ${stmt.obj.name}.`;
    case 'Inhibition':
      return `${stmt.subj.name} inhibits ${stmt.obj.name}.`;
    case 'IncreaseAmount':
      return `${stmt.subj?.name ?? 'Something'} increases the amount of ${stmt.obj.name}.`;
    case 'DecreaseAmount':
      return `${stmt.subj?.name ?? 'Something'} decreases the amount of ${stmt.obj.name}.`;
    case 'Translocation':
      return `${stmt.agent.name} translocates from ${stmt.from_location ?? '?'} to ${stmt.to_location ?? '?'}.`;
    default: {
      const modification = stmt as INDRAModification;
      return `${modification.enz?.name ?? 'An enzyme'} ${stmt.type.toLowerCase()}s ${modification.sub.name}.`;
    }
  }
}
