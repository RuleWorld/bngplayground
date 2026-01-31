/**
 * BNGL Linter - Static analysis for BioNetGen models
 *
 * Performs structural validation and semantic checks on parsed BNGL models
 * to catch common errors before simulation.
 */

import type {
  BNGLModel,
  BNGLMoleculeType,
  ValidationSeverity,
  EditorMarker,
} from '../types.ts';
import { BNGLParser } from '../src/services/graph/core/BNGLParser.ts';

// ============================================================================
// Types
// ============================================================================

export interface LintDiagnostic {
  severity: ValidationSeverity;
  code: string;
  message: string;
  suggestion?: string;
  location?: LintLocation;
}

export interface LintLocation {
  type: 'parameter' | 'moleculeType' | 'species' | 'observable' | 'rule' | 'compartment' | 'function';
  name?: string;
  index?: number;
}

export interface LintResult {
  diagnostics: LintDiagnostic[];
  summary: {
    errors: number;
    warnings: number;
    info: number;
  };
}

export interface LinterOptions {
  checkUndefinedMolecules?: boolean;
  checkUndefinedComponents?: boolean;
  checkUndefinedStates?: boolean;
  checkUndefinedParameters?: boolean;
  checkUnusedDefinitions?: boolean;
  checkReachability?: boolean;
  checkSymmetricSites?: boolean;
  checkCompartments?: boolean;
  checkRateExpressions?: boolean;
}

const DEFAULT_OPTIONS: LinterOptions = {
  checkUndefinedMolecules: true,
  checkUndefinedComponents: true,
  checkUndefinedStates: true,
  checkUndefinedParameters: true,
  checkUnusedDefinitions: true,
  checkReachability: true,
  checkSymmetricSites: true,
  checkCompartments: true,
  checkRateExpressions: true,
};

// ============================================================================
// Pattern Parsing Utilities
// ============================================================================

interface ParsedMolecule {
  name: string;
  compartment?: string;
  components: ParsedComponent[];
}

interface ParsedComponent {
  name: string;
  states: string[];
  bonds: string[];
}

function parsePattern(pattern: string): ParsedMolecule[] {
  const molecules: ParsedMolecule[] = [];
  let workingPattern = pattern.trim();
  let globalCompartment: string | undefined;

  const prefixMatch = workingPattern.match(/^@([A-Za-z_][A-Za-z0-9_]*):/);
  if (prefixMatch) {
    globalCompartment = prefixMatch[1];
    workingPattern = workingPattern.slice(prefixMatch[0].length);
  }

  const molStrings = splitByDot(workingPattern);

  for (const molStr of molStrings) {
    const parsed = parseSingleMolecule(molStr.trim());
    if (parsed) {
      if (globalCompartment && !parsed.compartment) {
        parsed.compartment = globalCompartment;
      }
      molecules.push(parsed);
    }
  }

  return molecules;
}

function splitByDot(str: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;

  for (const ch of str) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === '.' && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parseSingleMolecule(molStr: string): ParsedMolecule | null {
  if (!molStr) return null;

  let compartment: string | undefined;
  const atIndex = molStr.lastIndexOf('@');
  if (atIndex > 0 && !molStr.includes('(', atIndex)) {
    compartment = molStr.slice(atIndex + 1);
    molStr = molStr.slice(0, atIndex);
  }

  const match = molStr.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(([^)]*)\))?(.*)$/);
  if (!match) return null;

  const name = match[1];
  const componentsStr = match[2] || '';
  const components: ParsedComponent[] = [];

  if (componentsStr) {
    const compParts = componentsStr
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    for (const compStr of compParts) {
      const comp = parseComponent(compStr);
      if (comp) components.push(comp);
    }
  }

  return { name, compartment, components };
}

function parseComponent(compStr: string): ParsedComponent | null {
  if (!compStr) return null;

  const states: string[] = [];
  const bonds: string[] = [];

  const nameMatch = compStr.match(/^([A-Za-z_][A-Za-z0-9_]*|[0-9]+)/);
  if (!nameMatch) return null;

  const name = nameMatch[1];
  let rest = compStr.slice(name.length);

  while (rest.length > 0) {
    if (rest.startsWith('~')) {
      rest = rest.slice(1);
      const stateMatch = rest.match(/^([A-Za-z_][A-Za-z0-9_]*|[0-9]+|\?)/);
      if (stateMatch) {
        states.push(stateMatch[1]);
        rest = rest.slice(stateMatch[1].length);
      }
    } else if (rest.startsWith('!')) {
      rest = rest.slice(1);
      if (rest.startsWith('+')) {
        bonds.push('+');
        rest = rest.slice(1);
      } else if (rest.startsWith('?')) {
        bonds.push('?');
        rest = rest.slice(1);
      } else {
        const bondMatch = rest.match(/^([A-Za-z_][A-Za-z0-9_]*|[0-9]+)/);
        if (bondMatch) {
          bonds.push(bondMatch[1]);
          rest = rest.slice(bondMatch[1].length);
        }
      }
    } else if (rest.startsWith('.')) {
      bonds.push('unbound');
      rest = rest.slice(1);
    } else {
      rest = rest.slice(1);
    }
  }

  return { name, states, bonds };
}

// ============================================================================
// Molecule Type Registry Builder
// ============================================================================

interface MoleculeTypeInfo {
  name: string;
  components: Map<string, Set<string>>;
}

function buildMoleculeTypeRegistry(moleculeTypes: BNGLMoleculeType[]): Map<string, MoleculeTypeInfo> {
  const registry = new Map<string, MoleculeTypeInfo>();

  for (const mt of moleculeTypes) {
    const info: MoleculeTypeInfo = {
      name: mt.name,
      components: new Map(),
    };

    for (const compDef of mt.components) {
      const parts = compDef.split('~');
      const compName = parts[0];
      const states = parts.slice(1);
      info.components.set(compName, new Set(states));
    }

    registry.set(mt.name, info);
  }

  return registry;
}

// ============================================================================
// Individual Lint Checks
// ============================================================================

function checkUndefinedMolecules(model: BNGLModel, registry: Map<string, MoleculeTypeInfo>): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = [];
  const patternsToCheck: Array<{ pattern: string; location: LintLocation }> = [];

  model.species.forEach((sp, idx) => {
    patternsToCheck.push({
      pattern: sp.name,
      location: { type: 'species', name: sp.name, index: idx },
    });
  });

  model.observables.forEach((obs, idx) => {
    patternsToCheck.push({
      pattern: obs.pattern,
      location: { type: 'observable', name: obs.name, index: idx },
    });
  });

  model.reactionRules.forEach((rule, idx) => {
    for (const r of rule.reactants) {
      patternsToCheck.push({
        pattern: r,
        location: { type: 'rule', name: rule.name, index: idx },
      });
    }
    for (const p of rule.products) {
      patternsToCheck.push({
        pattern: p,
        location: { type: 'rule', name: rule.name, index: idx },
      });
    }
  });

  const reportedMolecules = new Set<string>();

  for (const { pattern, location } of patternsToCheck) {
    const molecules = parsePattern(pattern);
    for (const mol of molecules) {
      if (!registry.has(mol.name) && !reportedMolecules.has(mol.name)) {
        reportedMolecules.add(mol.name);
        diagnostics.push({
          severity: 'warning',
          code: 'UNDEFINED_MOLECULE_TYPE',
          message: `Molecule type '${mol.name}' is used but not defined in molecule types block`,
          suggestion: `Add '${mol.name}(...)' to the molecule types block`,
          location,
        });
      }
    }
  }

  return diagnostics;
}

function checkUndefinedComponents(model: BNGLModel, registry: Map<string, MoleculeTypeInfo>): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = [];
  const patternsToCheck: Array<{ pattern: string; location: LintLocation }> = [];

  model.species.forEach((sp, idx) => {
    patternsToCheck.push({
      pattern: sp.name,
      location: { type: 'species', name: sp.name, index: idx },
    });
  });

  model.observables.forEach((obs, idx) => {
    patternsToCheck.push({
      pattern: obs.pattern,
      location: { type: 'observable', name: obs.name, index: idx },
    });
  });

  model.reactionRules.forEach((rule, idx) => {
    for (const r of rule.reactants) {
      patternsToCheck.push({
        pattern: r,
        location: { type: 'rule', name: rule.name, index: idx },
      });
    }
    for (const p of rule.products) {
      patternsToCheck.push({
        pattern: p,
        location: { type: 'rule', name: rule.name, index: idx },
      });
    }
  });

  const reported = new Set<string>();

  for (const { pattern, location } of patternsToCheck) {
    const molecules = parsePattern(pattern);
    for (const mol of molecules) {
      const typeInfo = registry.get(mol.name);
      if (!typeInfo) continue;

      for (const comp of mol.components) {
        if (!typeInfo.components.has(comp.name)) {
          const key = `${mol.name}.${comp.name}`;
          if (!reported.has(key)) {
            reported.add(key);
            diagnostics.push({
              severity: 'error',
              code: 'UNDEFINED_COMPONENT',
              message: `Component '${comp.name}' is not defined for molecule type '${mol.name}'`,
              suggestion: `Add '${comp.name}' to the ${mol.name} molecule type definition`,
              location,
            });
          }
        }
      }
    }
  }

  return diagnostics;
}

function checkUndefinedStates(model: BNGLModel, registry: Map<string, MoleculeTypeInfo>): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = [];
  const patternsToCheck: Array<{ pattern: string; location: LintLocation }> = [];

  model.species.forEach((sp, idx) => {
    patternsToCheck.push({
      pattern: sp.name,
      location: { type: 'species', name: sp.name, index: idx },
    });
  });

  model.observables.forEach((obs, idx) => {
    patternsToCheck.push({
      pattern: obs.pattern,
      location: { type: 'observable', name: obs.name, index: idx },
    });
  });

  model.reactionRules.forEach((rule, idx) => {
    for (const r of rule.reactants) {
      patternsToCheck.push({
        pattern: r,
        location: { type: 'rule', name: rule.name, index: idx },
      });
    }
    for (const p of rule.products) {
      patternsToCheck.push({
        pattern: p,
        location: { type: 'rule', name: rule.name, index: idx },
      });
    }
  });

  const reported = new Set<string>();

  for (const { pattern, location } of patternsToCheck) {
    const molecules = parsePattern(pattern);
    for (const mol of molecules) {
      const typeInfo = registry.get(mol.name);
      if (!typeInfo) continue;

      for (const comp of mol.components) {
        const compInfo = typeInfo.components.get(comp.name);
        if (!compInfo) continue;

        for (const state of comp.states) {
          if (state === '?' || state === '*') continue;

          if (compInfo.size === 0) {
            const key = `${mol.name}.${comp.name}.${state}`;
            if (!reported.has(key)) {
              reported.add(key);
              diagnostics.push({
                severity: 'error',
                code: 'UNEXPECTED_STATE',
                message: `Component '${comp.name}' of '${mol.name}' has no states defined, but state '${state}' is used`,
                suggestion: `Add '~${state}' to the component definition: ${comp.name}~${state}`,
                location,
              });
            }
          } else if (!compInfo.has(state)) {
            const key = `${mol.name}.${comp.name}.${state}`;
            if (!reported.has(key)) {
              reported.add(key);
              const validStates = Array.from(compInfo).join(', ');
              diagnostics.push({
                severity: 'error',
                code: 'UNDEFINED_STATE',
                message: `State '${state}' is not defined for component '${comp.name}' of '${mol.name}'`,
                suggestion: `Valid states are: ${validStates}. Add '~${state}' to the molecule type if this state should be allowed.`,
                location,
              });
            }
          }
        }
      }
    }
  }

  return diagnostics;
}

function checkUndefinedParameters(model: BNGLModel, sourceCode?: string): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = [];

  const definedParams = new Set(Object.keys(model.parameters));
  const observableNames = new Set(model.observables.map((o) => o.name));
  const functionNames = new Set((model.functions || []).map((f) => f.name));

  const builtins = new Set([
    'pi',
    '_pi',
    'e',
    '_e',
    'PI',
    'E',
    'exp',
    'ln',
    'log',
    'log10',
    'log2',
    'sqrt',
    'abs',
    'sin',
    'cos',
    'tan',
    'asin',
    'acos',
    'atan',
    'sinh',
    'cosh',
    'tanh',
    'asinh',
    'acosh',
    'atanh',
    'min',
    'max',
    'floor',
    'ceil',
    'round',
    'if',
    'time',
    'Time',
    'TIME',
    'sat',
    'MM',
    'Hill',
    'Arrhenius',
  ]);

  const extractIdentifiers = (expr: string): string[] => {
    const identifiers: string[] = [];
    const regex = /\b([A-Za-z_][A-Za-z0-9_]*)\b/g;
    let match;
    while ((match = regex.exec(expr)) !== null) {
      identifiers.push(match[1]);
    }
    return identifiers;
  };

  model.reactionRules.forEach((rule, idx) => {
    const expressions = [rule.rate];
    if (rule.reverseRate) expressions.push(rule.reverseRate);

    for (const expr of expressions) {
      const identifiers = extractIdentifiers(expr);
      for (const id of identifiers) {
        if (
          !definedParams.has(id) &&
          !observableNames.has(id) &&
          !functionNames.has(id) &&
          !builtins.has(id) &&
          !builtins.has(id.toLowerCase())
        ) {
          if (/^\d+$/.test(id)) continue;
          diagnostics.push({
            severity: 'warning',
            code: 'UNDEFINED_PARAMETER',
            message: `Identifier '${id}' in rate expression is not defined`,
            suggestion: `Add '${id}' to the parameters block, or check for typos`,
            location: { type: 'rule', name: rule.name, index: idx },
          });
        }
      }
    }
  });

  // Also check seed species usage when source BNGL text is available
  if (sourceCode) {
    try {
      const seedParamNames = BNGLParser.getSeedParameters(sourceCode);
      for (const name of seedParamNames) {
        // If a seed param identifier looks like a parameter name and is undefined, warn
        if (!definedParams.has(name) && !observableNames.has(name) && !functionNames.has(name)) {
          diagnostics.push({
            severity: 'warning',
            code: 'UNDEFINED_PARAMETER',
            message: `Identifier '${name}' used in seed species is not defined in parameters`,
            suggestion: `Add parameter '${name}' to the parameters block`,
            location: { type: 'parameter', name },
          });
        }
      }
    } catch (e) {
      // getSeedParameters is best-effort - ignore errors
    }
  }

  return diagnostics;
}

function checkUnusedMoleculeTypes(model: BNGLModel): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = [];
  const usedMolecules = new Set<string>();
  const allPatterns: string[] = [];

  model.species.forEach((sp) => allPatterns.push(sp.name));
  model.observables.forEach((obs) => allPatterns.push(obs.pattern));
  model.reactionRules.forEach((rule) => {
    allPatterns.push(...rule.reactants);
    allPatterns.push(...rule.products);
  });

  for (const pattern of allPatterns) {
    const molecules = parsePattern(pattern);
    for (const mol of molecules) {
      usedMolecules.add(mol.name);
    }
  }

  for (const mt of model.moleculeTypes) {
    if (!usedMolecules.has(mt.name)) {
      diagnostics.push({
        severity: 'info',
        code: 'UNUSED_MOLECULE_TYPE',
        message: `Molecule type '${mt.name}' is defined but never used`,
        suggestion: `Remove '${mt.name}' if it's not needed, or add species/rules that use it`,
        location: { type: 'moleculeType', name: mt.name },
      });
    }
  }

  return diagnostics;
}

function checkUnusedParameters(model: BNGLModel, sourceCode?: string): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = [];
  const usedParams = new Set<string>();

  const extractParams = (expr: string) => {
    const regex = /\b([A-Za-z_][A-Za-z0-9_]*)\b/g;
    let match;
    while ((match = regex.exec(expr)) !== null) {
      usedParams.add(match[1]);
    }
  };

  for (const rule of model.reactionRules) {
    extractParams(rule.rate);
    if (rule.reverseRate) extractParams(rule.reverseRate);
  }

  for (const func of model.functions || []) {
    extractParams(func.expression);
  }

  for (const [name, value] of Object.entries(model.parameters)) {
    if ((model as any).paramExpressions?.[name]) {
      extractParams((model as any).paramExpressions[name]);
    }
  }

  // Also mark parameters used in seed species. Prefer parsed species initialExpression when available,
  // otherwise fall back to scanning the raw source BNGL if provided.
  if (model.species && model.species.length > 0) {
    for (const sp of model.species) {
      if (sp.initialExpression) {
        extractParams(sp.initialExpression);
      }
    }
  } else if (sourceCode) {
    try {
      const seedParams = BNGLParser.getSeedParameters(sourceCode);
      for (const p of seedParams) usedParams.add(p);
    } catch (e) {
      // ignore
    }
  }

  for (const paramName of Object.keys(model.parameters)) {
    if (!usedParams.has(paramName)) {
      diagnostics.push({
        severity: 'info',
        code: 'UNUSED_PARAMETER',
        message: `Parameter '${paramName}' is defined but never used`,
        suggestion: `Remove '${paramName}' if it's not needed`,
        location: { type: 'parameter', name: paramName },
      });
    }
  }

  return diagnostics;
}

function checkSymmetricSites(model: BNGLModel): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = [];

  for (const mt of model.moleculeTypes) {
    const compCounts = new Map<string, number>();
    for (const compDef of mt.components) {
      const compName = compDef.split('~')[0];
      compCounts.set(compName, (compCounts.get(compName) || 0) + 1);
    }

    for (const [compName, count] of compCounts) {
      if (count > 1) {
        diagnostics.push({
          severity: 'warning',
          code: 'SYMMETRIC_SITES',
          message: `Molecule type '${mt.name}' has ${count} components named '${compName}'`,
          suggestion: `Symmetric sites can affect rate calculations and cause issues with Kappa translation. Consider using distinct names like '${compName}1', '${compName}2' or adding states to distinguish them.`,
          location: { type: 'moleculeType', name: mt.name },
        });
      }
    }
  }

  return diagnostics;
}

function checkCompartments(model: BNGLModel): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = [];
  if (!model.compartments || model.compartments.length === 0) {
    return diagnostics;
  }

  const compartmentNames = new Set(model.compartments.map((c) => c.name));

  for (const comp of model.compartments) {
    if (comp.parent && !compartmentNames.has(comp.parent)) {
      diagnostics.push({
        severity: 'error',
        code: 'UNDEFINED_PARENT_COMPARTMENT',
        message: `Compartment '${comp.name}' references undefined parent '${comp.parent}'`,
        suggestion: `Define compartment '${comp.parent}' or remove the parent reference`,
        location: { type: 'compartment', name: comp.name },
      });
    }

    if (comp.size <= 0) {
      diagnostics.push({
        severity: 'warning',
        code: 'INVALID_COMPARTMENT_SIZE',
        message: `Compartment '${comp.name}' has size ${comp.size}`,
        suggestion: `Compartment sizes should be positive`,
        location: { type: 'compartment', name: comp.name },
      });
    }

    if (![1, 2, 3].includes(comp.dimension)) {
      diagnostics.push({
        severity: 'warning',
        code: 'UNUSUAL_COMPARTMENT_DIMENSION',
        message: `Compartment '${comp.name}' has dimension ${comp.dimension}`,
        suggestion: `Typical dimensions are 2 (membrane) or 3 (volume)`,
        location: { type: 'compartment', name: comp.name },
      });
    }
  }

  const usedCompartments = new Set<string>();

  const collectCompartments = (pattern: string) => {
    const prefixMatch = pattern.match(/^@([A-Za-z_][A-Za-z0-9_]*):/);
    if (prefixMatch) usedCompartments.add(prefixMatch[1]);

    const suffixMatches = pattern.matchAll(/@([A-Za-z_][A-Za-z0-9_]*)/g);
    for (const match of suffixMatches) {
      if (!pattern.includes(`@${match[1]}:`)) {
        usedCompartments.add(match[1]);
      }
    }
  };

  model.species.forEach((sp) => collectCompartments(sp.name));
  model.observables.forEach((obs) => collectCompartments(obs.pattern));
  model.reactionRules.forEach((rule) => {
    rule.reactants.forEach((r) => collectCompartments(r));
    rule.products.forEach((p) => collectCompartments(p));
  });

  for (const compName of usedCompartments) {
    if (!compartmentNames.has(compName)) {
      diagnostics.push({
        severity: 'error',
        code: 'UNDEFINED_COMPARTMENT',
        message: `Compartment '${compName}' is used but not defined`,
        suggestion: `Add '${compName}' to the compartments block`,
        location: { type: 'compartment', name: compName },
      });
    }
  }

  return diagnostics;
}

function checkRateExpressions(model: BNGLModel): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = [];

  for (let idx = 0; idx < model.reactionRules.length; idx++) {
    const rule = model.reactionRules[idx];
    const location: LintLocation = { type: 'rule', name: rule.name, index: idx };

    if (rule.rate === '0' || rule.rate === '0.0') {
      diagnostics.push({
        severity: 'info',
        code: 'ZERO_RATE',
        message: `Rule '${rule.name || `#${idx + 1}`}' has zero rate constant`,
        suggestion: `Rules with zero rates will never fire. Remove or adjust if unintended.`,
        location,
      });
    }

    if (rule.rate.includes('/')) {
      if (rule.rate.match(/\/\s*0\b/) || rule.rate.match(/\/\s*0\.0\b/)) {
        diagnostics.push({
          severity: 'error',
          code: 'DIVISION_BY_ZERO',
          message: `Rule '${rule.name || `#${idx + 1}`}' rate expression contains division by zero`,
          location,
        });
      }
    }

    if (rule.isBidirectional && !rule.reverseRate) {
      diagnostics.push({
        severity: 'warning',
        code: 'MISSING_REVERSE_RATE',
        message: `Bidirectional rule '${rule.name || `#${idx + 1}`}' is missing reverse rate`,
        suggestion: `Add a reverse rate constant after the forward rate`,
        location,
      });
    }
  }

  return diagnostics;
}

function normalizePattern(pattern: string): string {
  return pattern.trim();
}

function checkReachability(model: BNGLModel): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = [];
  const reachable = new Set<string>();

  model.species.forEach((sp) => {
    const normalized = normalizePattern(sp.name);
    if (normalized) reachable.add(normalized);
  });

  let changed = true;
  while (changed) {
    changed = false;
    for (const rule of model.reactionRules) {
      const reactants = (rule.reactants || [])
        .map(normalizePattern)
        .filter(Boolean);
      const reactantsReachable = reactants.length === 0 || reactants.every((r) => reachable.has(r));
      if (!reactantsReachable) continue;

      for (const product of rule.products || []) {
        const normalizedProduct = normalizePattern(product);
        if (!normalizedProduct) continue;

        if (!reachable.has(normalizedProduct)) {
          reachable.add(normalizedProduct);
          changed = true;
        }
      }
    }
  }

  for (let idx = 0; idx < model.reactionRules.length; idx++) {
    const rule = model.reactionRules[idx];
    const reactants = (rule.reactants || [])
      .map(normalizePattern)
      .filter(Boolean);

    if (reactants.length === 0) continue;

    const missing = reactants.filter((reactant) => !reachable.has(reactant));
    if (missing.length === 0) continue;

    const location: LintLocation = { type: 'rule', name: rule.name, index: idx };
    const prettyMissing = missing.map((m) => `'${m}'`).join(', ');
    diagnostics.push({
      severity: 'warning',
      code: 'UNREACHABLE_RULE',
      message: `Rule '${rule.name || `#${idx + 1}`}' can never fire because reactants ${prettyMissing} are never produced`,
      suggestion: `Ensure ${missing.length === 1 ? 'this species' : 'these species'} appear in seed species or are produced by other reachable rules.`,
      location,
    });
  }

  return diagnostics;
}

function checkDuplicateDefinitions(model: BNGLModel): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = [];

  const molTypeNames = new Set<string>();
  for (const mt of model.moleculeTypes) {
    if (molTypeNames.has(mt.name)) {
      diagnostics.push({
        severity: 'warning',
        code: 'DUPLICATE_MOLECULE_TYPE',
        message: `Molecule type '${mt.name}' is defined multiple times`,
        location: { type: 'moleculeType', name: mt.name },
      });
    }
    molTypeNames.add(mt.name);
  }

  const obsNames = new Set<string>();
  for (const obs of model.observables) {
    if (obsNames.has(obs.name)) {
      diagnostics.push({
        severity: 'warning',
        code: 'DUPLICATE_OBSERVABLE',
        message: `Observable '${obs.name}' is defined multiple times`,
        location: { type: 'observable', name: obs.name },
      });
    }
    obsNames.add(obs.name);
  }

  const ruleNames = new Set<string>();
  for (const rule of model.reactionRules) {
    if (rule.name && !rule.name.startsWith('_R')) {
      if (ruleNames.has(rule.name)) {
        diagnostics.push({
          severity: 'info',
          code: 'DUPLICATE_RULE_NAME',
          message: `Rule name '${rule.name}' is used multiple times`,
          location: { type: 'rule', name: rule.name },
        });
      }
      ruleNames.add(rule.name);
    }
  }

  return diagnostics;
}

function checkZeroConcentrations(model: BNGLModel): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = [];

  for (let idx = 0; idx < model.species.length; idx++) {
    const sp = model.species[idx];
    if (sp.initialConcentration === 0 && !sp.isConstant) {
      diagnostics.push({
        severity: 'info',
        code: 'ZERO_INITIAL_CONCENTRATION',
        message: `Species '${sp.name}' has zero initial concentration`,
        suggestion: `This species must be produced by rules to appear in simulation`,
        location: { type: 'species', name: sp.name, index: idx },
      });
    }
  }

  return diagnostics;
}

// ============================================================================
// Main Linter Function
// ============================================================================

export function lintBNGL(model: BNGLModel, options: LinterOptions = {}, sourceCode?: string): LintResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const diagnostics: LintDiagnostic[] = [];

  const registry = buildMoleculeTypeRegistry(model.moleculeTypes);

  if (opts.checkUndefinedMolecules) {
    diagnostics.push(...checkUndefinedMolecules(model, registry));
  }

  if (opts.checkUndefinedComponents) {
    diagnostics.push(...checkUndefinedComponents(model, registry));
  }

  if (opts.checkUndefinedStates) {
    diagnostics.push(...checkUndefinedStates(model, registry));
  }

  if (opts.checkUndefinedParameters) {
    diagnostics.push(...checkUndefinedParameters(model, sourceCode));
  }

  if (opts.checkUnusedDefinitions) {
    diagnostics.push(...checkUnusedMoleculeTypes(model));
    diagnostics.push(...checkUnusedParameters(model, sourceCode));
  }

  if (opts.checkReachability) {
    diagnostics.push(...checkReachability(model));
  }

  if (opts.checkSymmetricSites) {
    diagnostics.push(...checkSymmetricSites(model));
  }

  if (opts.checkCompartments) {
    diagnostics.push(...checkCompartments(model));
  }

  if (opts.checkRateExpressions) {
    diagnostics.push(...checkRateExpressions(model));
  }

  diagnostics.push(...checkDuplicateDefinitions(model));
  diagnostics.push(...checkZeroConcentrations(model));

  const summary = {
    errors: diagnostics.filter((d) => d.severity === 'error').length,
    warnings: diagnostics.filter((d) => d.severity === 'warning').length,
    info: diagnostics.filter((d) => d.severity === 'info').length,
  };

  return { diagnostics, summary };
}

const LINE_SPLIT_REGEX = /\r?\n/;

function findLineIndexForDiagnostic(lines: string[], diagnostic: LintDiagnostic, fallback: number): number {
  const candidates = new Set<string>();
  if (diagnostic.location?.name) {
    candidates.add(diagnostic.location.name.trim());
  }
  if (diagnostic.location?.type) {
    candidates.add(diagnostic.location.type.trim());
  }

  for (const candidate of candidates) {
    if (!candidate) continue;
    const idx = lines.findIndex((line) => line.includes(candidate));
    if (idx !== -1) {
      return idx;
    }
  }

  return fallback;
}

export function lintDiagnosticsToMarkers(code: string, diagnostics: LintDiagnostic[]): EditorMarker[] {
  const lines = code.length ? code.split(LINE_SPLIT_REGEX) : [''];
  const fallbackLine = Math.max(0, lines.findIndex((line) => line.trim().length > 0));

  return diagnostics.map((diag) => {
    const lineIndex = findLineIndexForDiagnostic(lines, diag, fallbackLine);
    const lineText = lines[lineIndex] ?? '';
    return {
      severity: diag.severity,
      message: diag.message,
      startLineNumber: lineIndex + 1,
      endLineNumber: lineIndex + 1,
      startColumn: 1,
      endColumn: Math.max(1, lineText.length + 1),
    } satisfies EditorMarker;
  });
}

export function formatLintResults(result: LintResult): string {
  const lines: string[] = [];

  const errors = result.diagnostics.filter((d) => d.severity === 'error');
  const warnings = result.diagnostics.filter((d) => d.severity === 'warning');
  const infos = result.diagnostics.filter((d) => d.severity === 'info');

  const formatDiagnostic = (d: LintDiagnostic): string => {
    let loc = '';
    if (d.location) {
      loc = `[${d.location.type}${d.location.name ? `: ${d.location.name}` : ''}] `;
    }
    let line = `  ${loc}${d.message}`;
    if (d.suggestion) {
      line += `\n    → ${d.suggestion}`;
    }
    return line;
  };

  if (errors.length > 0) {
    lines.push(`❌ Errors (${errors.length}):`);
    errors.forEach((d) => lines.push(formatDiagnostic(d)));
    lines.push('');
  }

  if (warnings.length > 0) {
    lines.push(`⚠️  Warnings (${warnings.length}):`);
    warnings.forEach((d) => lines.push(formatDiagnostic(d)));
    lines.push('');
  }

  if (infos.length > 0) {
    lines.push(`ℹ️  Info (${infos.length}):`);
    infos.forEach((d) => lines.push(formatDiagnostic(d)));
    lines.push('');
  }

  if (result.diagnostics.length === 0) {
    lines.push('✅ No issues found');
  } else {
    lines.push(`Summary: ${result.summary.errors} errors, ${result.summary.warnings} warnings, ${result.summary.info} info`);
  }

  return lines.join('\n');
}