/**
 * indraModelPrep.ts — post-assembly BNGL model-text preparation.
 *
 * After INDRA assembles a model, the BNGL text often lacks observables and
 * run actions. These helpers add sensible defaults and provide the small
 * text checks they rely on. Shared by the app and MCP INDRA services, which
 * previously carried byte-identical copies of each.
 *
 * Pure text transforms apart from a call to the engine's BNGL parser.
 */
import { parseBNGLWithANTLR } from '../../parser/BNGLParserWrapper';

export function sanitizeObservableName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9_]+/g, '_');
  let s = cleaned;
  while (s.startsWith('_')) s = s.slice(1);
  while (s.endsWith('_')) s = s.slice(0, -1);
  const result = s.length > 0 ? s : 'obs';
  return /^[A-Za-z_]/.test(result) ? result : `obs_${result}`;
}

export function insertBeforeEndModel(code: string, insertion: string): string {
  const endModelMatch = /\nend model\b/i;
  if (!endModelMatch.test(code)) {
    return `${code.trimEnd()}\n${insertion}\n`;
  }
  return code.replace(endModelMatch, `\n${insertion}\nend model`);
}

export function hasSimulateAction(code: string): boolean {
  return /\bsimulate(?:_ode|_ssa|_nf|_pla|_rm)?\s*\(/i.test(code);
}

export function hasObservablesBlock(code: string): boolean {
  return /\bbegin observables\b/i.test(code);
}

export function hasGenerateNetworkAction(code: string): boolean {
  return /\bgenerate_network\s*\(/i.test(code);
}

export function ensureDefaultObservables(code: string): string {
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

export function ensureDefaultActions(code: string): string {
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
