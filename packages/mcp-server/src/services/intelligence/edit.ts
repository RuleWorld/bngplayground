import {
    normalizeWhitespace,
    ensureModelEnvelope,
    insertRuleLine,
    updateParameterLine,
    setSeedSpeciesLine,
    setObservableLine,
    ensureBlock,
    insertIntoBlock,
    replaceLineInBlock,
    removeLineInBlock,
} from './utils/codeUtils.js';
import type { DriftInfo, ScopeInfo } from './types.js';
import { formatBNGL, SeededRandom } from '@bngplayground/engine';
import { parseModelOrThrow, validateModel } from '../../services/engine.js';
import { composeModelFromStatements } from './compose.js';

export function applyModelEdits(
    code: string,
    operations: Array<Record<string, unknown>>,
): {
    code: string;
    summary: string[];
    validation: {
        valid: boolean;
        errors: number;
        warnings: number;
    };
    drift: DriftInfo;
    scope?: ScopeInfo;
} {
    let current = ensureModelEnvelope(code);
    const summary: string[] = [];
    let structuralChanges = 0;
    let parametricChanges = 0;
    let scope: ScopeInfo | undefined = undefined;

    for (const operation of operations) {
        const action = String(operation.action ?? '');
        switch (action) {
            case 'add_rule': {
                const rule = normalizeWhitespace(String(operation.rule ?? ''));
                current = insertRuleLine(current, rule);
                summary.push(`Added rule: ${rule}`);
                structuralChanges++;
                break;
            }
            case 'add_statement': {
                const text = String(operation.text ?? '');
                const composed = composeModelFromStatements({ statements: [text] });
                if (composed.rules.length === 0) {
                    throw new Error(`Unable to translate statement into a rule: ${text}`);
                }
                const translated = composed.rules[0];
                current = insertRuleLine(current, `${translated.name}: ${translated.rule}`);
                summary.push(`Added statement as rule: ${translated.name}`);
                structuralChanges++;
                break;
            }
            case 'remove_rule': {
                const name = normalizeWhitespace(String(operation.name ?? ''));
                current = removeLineInBlock(current, 'reaction rules', (line) => line.startsWith(`${name}:`) || line === name);
                summary.push(`Removed rule: ${name}`);
                structuralChanges++;
                break;
            }
            case 'remove_rule_index': {
                const index = Number(operation.index ?? -1);
                const ensured = ensureBlock(current, 'reaction rules');
                const blockMatch = ensured.match(/begin\s+reaction rules([\s\S]*?)end\s+reaction rules/m);
                if (!blockMatch) {
                    throw new Error('Reaction rules block not found.');
                }
                const lines = blockMatch[1]
                    .split('\n')
                    .map((line) => line.trim())
                    .filter((line) => line.length > 0);
                if (!Number.isInteger(index) || index < 0 || index >= lines.length) {
                    throw new Error(`Rule index ${index} is out of bounds.`);
                }
                const removed = lines[index];
                current = removeLineInBlock(current, 'reaction rules', (line) => line === removed);
                summary.push(`Removed rule at index ${index}`);
                structuralChanges++;
                break;
            }
            case 'set_parameter':
            case 'add_parameter': {
                const name = normalizeWhitespace(String(operation.name ?? ''));
                const value = Number(operation.value);
                if (!Number.isFinite(value)) {
                    throw new Error(`Invalid parameter value for ${name}.`);
                }
                current = updateParameterLine(current, name, value);
                summary.push(`Set parameter ${name} = ${value}`);
                parametricChanges++;
                break;
            }
            case 'set_concentration': {
                const species = normalizeWhitespace(String(operation.species ?? ''));
                const value = Number(operation.value);
                if (!Number.isFinite(value)) {
                    throw new Error(`Invalid concentration for ${species}.`);
                }
                current = setSeedSpeciesLine(current, species, value);
                summary.push(`Set concentration ${species} = ${value}`);
                break;
            }
            case 'add_observable': {
                const name = String(operation.name ?? 'obs');
                const type = (String(operation.type ?? 'Molecules') === 'Species' ? 'Species' : 'Molecules') as 'Molecules' | 'Species';
                const pattern = String(operation.pattern ?? '');
                current = setObservableLine(current, name, type, pattern);
                summary.push(`Added/updated observable ${name}`);
                break;
            }
            case 'remove_observable': {
                const name = normalizeWhitespace(String(operation.name ?? ''));
                current = removeLineInBlock(current, 'observables', (line) => {
                    if (!/^(Molecules|Species)\s+/.test(line)) {
                        return false;
                    }
                    return line.split(/\s+/)[1] === name;
                });
                summary.push(`Removed observable ${name}`);
                break;
            }
            case 'add_molecule_type': {
                const definition = normalizeWhitespace(String(operation.definition ?? ''));
                current = insertIntoBlock(current, 'molecule types', definition);
                summary.push(`Added molecule type ${definition}`);
                structuralChanges++;
                break;
            }
            case 'add_species': {
                const species = normalizeWhitespace(String(operation.species ?? ''));
                const concentration = Number(operation.concentration);
                if (!Number.isFinite(concentration)) {
                    throw new Error(`Invalid species concentration for ${species}.`);
                }
                current = insertIntoBlock(current, 'seed species', `${species} ${concentration}`);
                summary.push(`Added seed species ${species}`);
                break;
            }
            case 'knockout_rule': {
                const name = normalizeWhitespace(String(operation.name ?? ''));
                const matcher = (line: string) => line.startsWith(`${name}:`) || line === name;
                const replaced = replaceLineInBlock(current, 'reaction rules', matcher, `# KNOCKED OUT: ${name}`);
                if (replaced !== current) {
                    current = replaced;
                    summary.push(`Knocked out rule: ${name} (commented out)`);
                } else {
                    summary.push(`Rule not found for knockout: ${name}`);
                }
                structuralChanges++;
                break;
            }
            case 'randomize_parameters': {
                const range = Number(operation.range);
                if (!Number.isFinite(range) || range <= 0) {
                    throw new Error(`Invalid range for randomize_parameters: ${range}`);
                }
                const seed = typeof operation.seed === 'number' ? operation.seed : Date.now();
                const rng = new SeededRandom(seed);
                const ensured = ensureBlock(current, 'parameters');
                const blockMatch = ensured.match(/begin\s+parameters([\s\S]*?)end\s+parameters/m);
                if (!blockMatch) break;

                const text = blockMatch[1];
                const regex = /^[ \t]*([^#\s]+)[ \t]+([^#\s]+)/gm;
                let match;
                let modified = 0;

                while ((match = regex.exec(text)) !== null) {
                    const name = match[1];
                    const value = Number(match[2]);
                    if (!Number.isFinite(value)) continue;
                    const factor = 1 + (range / 100) * (2 * rng.next() - 1);
                    const newValue = value * factor;
                    current = updateParameterLine(current, name, newValue);
                    modified++;
                }
                summary.push(`Randomized ${modified} parameters within ±${range}% of original values (seed: ${seed})`);
                parametricChanges += modified;
                break;
            }
            case 'set_scope': {
                const includes = (operation.includes as string[]) || [];
                const excludes = (operation.excludes as string[]) || [];
                const justification = String(operation.justification ?? '');
                scope = { includes, excludes, justification };
                summary.push(`Set scope: includes [${includes.join(', ')}], excludes [${excludes.join(', ')}], justification: ${justification}`);
                break;
            }
            default:
                throw new Error(`Unsupported edit operation: ${action}`);
        }
    }

    const formatted = (() => {
        try {
            return formatBNGL(current);
        } catch {
            return current;
        }
    })();

    const parsedModel = parseModelOrThrow(formatted);
    const validation = validateModel(parsedModel, false);

    const driftWarning = structuralChanges >= 3 ? 'Model has undergone significant structural changes (3+). Hypothesis may have drifted.' : undefined;

    return {
        code: formatted,
        summary,
        validation: {
            valid: validation.valid,
            errors: validation.summary.errors,
            warnings: validation.summary.warnings,
        },
        drift: {
            totalOperations: operations.length,
            structuralChanges,
            parametricChanges,
            driftWarning,
        },
        ...(scope ? { scope } : {}),
    };
}