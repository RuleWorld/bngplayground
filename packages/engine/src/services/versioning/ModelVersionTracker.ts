/**
 * ModelVersionTracker.ts - Model version tracking with semantic diffs
 *
 * Provides BNGL-aware version tracking using a DAG structure, semantic
 * diffing of model code, branching, and serialization.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface SemanticChange {
    section: string;
    type: 'added' | 'removed' | 'modified';
    name: string;
    oldValue?: string;
    newValue?: string;
    detail?: string; // e.g. "rate change" vs "pattern change" for rules
}

export interface SemanticDiff {
    changes: SemanticChange[];
    summary: string;
    sectionsAffected: string[];
}

export interface ModelVersion {
    id: string;
    code: string;
    parentIds: string[];
    timestamp: number;
    label?: string;
    branch?: string;
    diff?: SemanticDiff;
}

export interface VersionDAG {
    versions: Map<string, ModelVersion>;
    headId: string;
    branches: Map<string, string>; // branch name -> version id
}

export interface RecordVersionOptions {
    label?: string;
    branch?: string;
    parentIds?: string[];
}

/* ------------------------------------------------------------------ */
/*  BNGL section parser                                                */
/* ------------------------------------------------------------------ */

interface ParsedSection {
    parameters: Map<string, string>;
    moleculeTypes: Map<string, string>;
    species: Map<string, string>;
    observables: Map<string, string>;
    rules: Map<string, string>;
}

function stripInlineComment(line: string): string {
    const commentIdx = line.indexOf('#');
    return (commentIdx === -1 ? line : line.slice(0, commentIdx)).trim();
}

function collapseWhitespace(text: string): string {
    let result = '';
    let pendingSpace = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const isWhitespace = ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f' || ch === '\v';
        if (isWhitespace) {
            pendingSpace = result.length > 0;
            continue;
        }
        if (pendingSpace) {
            result += ' ';
            pendingSpace = false;
        }
        result += ch;
    }

    return result;
}

function extractSection(code: string, sectionName: string): string[] {
    const normalizedSection = collapseWhitespace(sectionName.toLowerCase());
    const lines = code.split('\n');
    const sectionLines: string[] = [];
    let inSection = false;

    for (const rawLine of lines) {
        const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
        const normalizedLine = collapseWhitespace(line.toLowerCase());

        if (!inSection) {
            if (normalizedLine === `begin ${normalizedSection}`) {
                inSection = true;
            }
            continue;
        }

        if (normalizedLine === `end ${normalizedSection}`) {
            break;
        }

        const stripped = stripInlineComment(line).trim();
        if (stripped.length > 0) {
            sectionLines.push(stripped);
        }
    }

    return sectionLines;
}

function normalizeWhitespace(s: string): string {
    return collapseWhitespace(s);
}

function parseParameters(lines: string[]): Map<string, string> {
    const m = new Map<string, string>();
    for (const line of lines) {
        // name value  or  name=value  or  name  value  # comment
        const stripped = stripInlineComment(line);
        if (!stripped) continue;
        const eqIdx = stripped.indexOf('=');

        if (eqIdx >= 0) {
            const left = collapseWhitespace(stripped.slice(0, eqIdx));
            const right = collapseWhitespace(stripped.slice(eqIdx + 1));
            if (!left) continue;

            const leftParts = left.split(' ').filter(Boolean);
            if (leftParts.length === 0) continue;

            const name = leftParts[0];
            const leftRemainder = leftParts.slice(1).join(' ');
            const expr = [leftRemainder, right].filter(Boolean).join(' ').trim();
            m.set(name, expr);
            continue;
        }

        const parts = collapseWhitespace(stripped).split(' ').filter(Boolean);
        if (parts.length >= 2) {
            m.set(parts[0], parts.slice(1).join(' '));
        } else if (parts.length === 1) {
            m.set(parts[0], '');
        }
    }
    return m;
}

function parseMoleculeTypes(lines: string[]): Map<string, string> {
    const m = new Map<string, string>();
    for (const line of lines) {
        const stripped = stripInlineComment(line);
        if (!stripped) continue;
        // Molecule type name is the part before the first '(' or the whole line
        const firstTokenEnd = stripped.search(/[\s(]/);
        if (firstTokenEnd > 0) {
            m.set(stripped.slice(0, firstTokenEnd), normalizeWhitespace(stripped));
        } else if (firstTokenEnd === -1) {
            m.set(stripped, normalizeWhitespace(stripped));
        }
    }
    return m;
}

function parseSpecies(lines: string[]): Map<string, string> {
    const m = new Map<string, string>();
    for (const line of lines) {
        const stripped = stripInlineComment(line);
        if (!stripped) continue;
        // Species lines: pattern  initial_value
        const parts = stripped.split(/\s+/);
        if (parts.length >= 1) {
            m.set(parts[0], normalizeWhitespace(stripped));
        }
    }
    return m;
}

function parseObservables(lines: string[]): Map<string, string> {
    const m = new Map<string, string>();
    for (const line of lines) {
        const stripped = stripInlineComment(line);
        if (!stripped) continue;
        // Observables: Type Name Pattern
        const parts = stripped.split(/\s+/);
        if (parts.length >= 2) {
            m.set(parts[1], normalizeWhitespace(stripped));
        }
    }
    return m;
}

function parseRules(lines: string[]): Map<string, string> {
    const m = new Map<string, string>();
    for (const line of lines) {
        const stripped = stripInlineComment(line);
        if (!stripped) continue;
        // Use the rule name if prefixed with "name:", otherwise use normalized rule text as key
        const colonIdx = stripped.indexOf(':');
        const nameToken = colonIdx > 0 ? stripped.slice(0, colonIdx).trim() : '';
        if (colonIdx > 0 && /^[A-Za-z0-9_]+$/.test(nameToken)) {
            m.set(nameToken, normalizeWhitespace(stripped.slice(colonIdx + 1)));
        } else {
            // Use the rule pattern (everything before the rate) as key for stable diffing
            const normalized = normalizeWhitespace(stripped);
            const arrowIdx = normalized.indexOf('->');
            const key = arrowIdx >= 0
                ? normalizeWhitespace(normalized.slice(0, normalized.lastIndexOf(' ')))
                : normalized;
            m.set(key, normalized);
        }
    }
    return m;
}

function parseBNGL(code: string): ParsedSection {
    return {
        parameters: parseParameters(extractSection(code, 'parameters')),
        moleculeTypes: parseMoleculeTypes(extractSection(code, 'molecule types')),
        species: parseSpecies(
            [
                ...extractSection(code, 'species'),
                ...extractSection(code, 'seed species'),
            ],
        ),
        observables: parseObservables(extractSection(code, 'observables')),
        rules: parseRules(extractSection(code, 'reaction rules')),
    };
}

/* ------------------------------------------------------------------ */
/*  Semantic diff                                                      */
/* ------------------------------------------------------------------ */

function diffMaps(
    sectionName: string,
    oldMap: Map<string, string>,
    newMap: Map<string, string>,
    detectRateChange: boolean,
): SemanticChange[] {
    const changes: SemanticChange[] = [];

    for (const [name, newVal] of newMap) {
        const oldVal = oldMap.get(name);
        if (oldVal === undefined) {
            changes.push({ section: sectionName, type: 'added', name, newValue: newVal });
        } else if (oldVal !== newVal) {
            let detail: string | undefined;
            if (detectRateChange) {
                // For rules, try to detect rate-only vs pattern change.
                // Rate is typically the last space-separated token after the last comma
                // or the value after the reaction arrow's rate expression.
                const oldParts = oldVal.split(/\s+/);
                const newParts = newVal.split(/\s+/);
                const oldRate = oldParts[oldParts.length - 1];
                const newRate = newParts[newParts.length - 1];
                const oldPattern = oldParts.slice(0, -1).join(' ');
                const newPattern = newParts.slice(0, -1).join(' ');
                if (oldPattern === newPattern && oldRate !== newRate) {
                    detail = 'rate change';
                } else if (oldPattern !== newPattern) {
                    detail = 'pattern change';
                } else {
                    detail = 'modified';
                }
            }
            changes.push({
                section: sectionName,
                type: 'modified',
                name,
                oldValue: oldVal,
                newValue: newVal,
                detail,
            });
        }
    }
    for (const [name, oldVal] of oldMap) {
        if (!newMap.has(name)) {
            changes.push({ section: sectionName, type: 'removed', name, oldValue: oldVal });
        }
    }
    return changes;
}

export function computeSemanticDiff(oldCode: string, newCode: string): SemanticDiff {
    const oldParsed = parseBNGL(oldCode);
    const newParsed = parseBNGL(newCode);

    const allChanges: SemanticChange[] = [
        ...diffMaps('parameters', oldParsed.parameters, newParsed.parameters, false),
        ...diffMaps('molecule_types', oldParsed.moleculeTypes, newParsed.moleculeTypes, false),
        ...diffMaps('species', oldParsed.species, newParsed.species, false),
        ...diffMaps('observables', oldParsed.observables, newParsed.observables, false),
        ...diffMaps('rules', oldParsed.rules, newParsed.rules, true),
    ];

    const sectionsAffected = [...new Set(allChanges.map(c => c.section))];

    const counts = { added: 0, removed: 0, modified: 0 };
    for (const c of allChanges) counts[c.type]++;
    const parts: string[] = [];
    if (counts.added > 0) parts.push(`${counts.added} added`);
    if (counts.removed > 0) parts.push(`${counts.removed} removed`);
    if (counts.modified > 0) parts.push(`${counts.modified} modified`);
    const summary = parts.length > 0
        ? `${parts.join(', ')} across ${sectionsAffected.join(', ')}`
        : 'No changes';

    return { changes: allChanges, summary, sectionsAffected };
}

/* ------------------------------------------------------------------ */
/*  ID generation                                                      */
/* ------------------------------------------------------------------ */

function generateId(): string {
    try {
        return crypto.randomUUID();
    } catch {
        // Secure fallback if crypto.randomUUID is somehow unavailable
        try {
            const arr = new Uint32Array(2);
            crypto.getRandomValues(arr);
            return Date.now().toString(36) + arr[0].toString(36) + arr[1].toString(36);
        } catch {
            // Fail securely if crypto is completely unavailable
            throw new Error("Secure random generation is unavailable in this environment");
        }
    }
}

/* ------------------------------------------------------------------ */
/*  DAG operations                                                     */
/* ------------------------------------------------------------------ */

export function createVersionDAG(code: string, label?: string): VersionDAG {
    const id = generateId();
    const version: ModelVersion = {
        id,
        code,
        parentIds: [],
        timestamp: Date.now(),
        label: label ?? 'initial',
        branch: 'main',
    };
    const versions = new Map<string, ModelVersion>();
    versions.set(id, version);
    const branches = new Map<string, string>();
    branches.set('main', id);
    return { versions, headId: id, branches };
}

export function recordVersion(
    dag: VersionDAG,
    code: string,
    options?: RecordVersionOptions,
): VersionDAG {
    const parentIds = options?.parentIds ?? [dag.headId];
    const branch = options?.branch ?? 'main';
    const parentVersion = dag.versions.get(parentIds[0]);
    const diff = parentVersion
        ? computeSemanticDiff(parentVersion.code, code)
        : undefined;

    const id = generateId();
    const version: ModelVersion = {
        id,
        code,
        parentIds,
        timestamp: Date.now(),
        label: options?.label,
        branch,
        diff,
    };

    const newVersions = new Map(dag.versions);
    newVersions.set(id, version);

    const newBranches = new Map(dag.branches);
    newBranches.set(branch, id);

    return {
        versions: newVersions,
        headId: id,
        branches: newBranches,
    };
}

export function getHistory(dag: VersionDAG): ModelVersion[] {
    // Walk back from head following first parent to build linear history
    const history: ModelVersion[] = [];
    let currentId: string | undefined = dag.headId;
    const visited = new Set<string>();

    while (currentId && !visited.has(currentId)) {
        visited.add(currentId);
        const version = dag.versions.get(currentId);
        if (!version) break;
        history.push(version);
        currentId = version.parentIds[0];
    }

    return history.reverse();
}

export function createBranch(dag: VersionDAG, name: string): VersionDAG {
    const newBranches = new Map(dag.branches);
    newBranches.set(name, dag.headId);
    return { ...dag, branches: newBranches };
}

/* ------------------------------------------------------------------ */
/*  Serialization                                                      */
/* ------------------------------------------------------------------ */

export interface SerializedVersionDAG {
    versions: Record<string, ModelVersion>;
    headId: string;
    branches: Record<string, string>;
}

export function serializeDAG(dag: VersionDAG): string {
    const serialized: SerializedVersionDAG = {
        versions: Object.fromEntries(dag.versions),
        headId: dag.headId,
        branches: Object.fromEntries(dag.branches),
    };
    return JSON.stringify(serialized);
}

export function deserializeDAG(json: string): VersionDAG {
    const parsed: SerializedVersionDAG = JSON.parse(json);
    return {
        versions: new Map(Object.entries(parsed.versions)),
        headId: parsed.headId,
        branches: new Map(Object.entries(parsed.branches)),
    };
}
