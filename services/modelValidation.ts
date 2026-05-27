import { BNGLModel, ValidationWarning, EditorMarker } from '../types';

const LARGE_PARAMETER_THRESHOLD = 1e6;
const SMALL_PARAMETER_THRESHOLD = 1e-6;

const getRuleId = (rule: BNGLModel['reactionRules'][number], index: number): string => {
  return rule.name ?? `rule_${index + 1}`;
};

const getRuleLabel = (rule: BNGLModel['reactionRules'][number], index: number): string => {
  return rule.name ?? `Rule ${index + 1}`;
};

const extractMoleculeNames = (pattern: string): string[] => {
  if (!pattern) {
    return [];
  }

  return pattern
    .split('.')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .map((segment) => {
      const match = segment.match(/^([A-Za-z0-9_]+)/);
      return match ? match[1] : segment;
    });
};

const buildInitialMoleculeSet = (model: BNGLModel): Set<string> => {
  const molecules = new Set<string>();

  model.species.forEach((species) => {
    extractMoleculeNames(species.name).forEach((name) => molecules.add(name));
  });

  return molecules;
};

const findUnreachableRules = (model: BNGLModel): string[] => {
  const knownMolecules = buildInitialMoleculeSet(model);
  const reachable = new Set<string>();

  const ruleDescriptors = model.reactionRules.map((rule, index) => {
    const reactants = rule.reactants.flatMap(extractMoleculeNames);
    const products = rule.products.flatMap(extractMoleculeNames);
    const id = getRuleId(rule, index);
    const label = getRuleLabel(rule, index);
    return { id, label, reactants, products };
  });

  let progress = true;
  while (progress) {
    progress = false;

    ruleDescriptors.forEach((descriptor) => {
      if (reachable.has(descriptor.id)) {
        return;
      }
      if (descriptor.reactants.length === 0 || descriptor.reactants.every((mol) => knownMolecules.has(mol))) {
        descriptor.products.forEach((mol) => knownMolecules.add(mol));
        reachable.add(descriptor.id);
        progress = true;
      }
    });
  }

  return ruleDescriptors
    .filter((descriptor) => !reachable.has(descriptor.id))
    .map((descriptor) => descriptor.label);
};

export const validateBNGLModel = (model: BNGLModel): ValidationWarning[] => {
  const warnings: ValidationWarning[] = [];

  if (model.observables.length === 0) {
    warnings.push({
      severity: 'error',
      message: 'No observables defined. The simulator tracks observables to produce plots.',
      suggestion: 'Add at least one observable, e.g.\n\nobservables\n  Molecules TotalProtein Protein()\nend observables',
      relatedElement: 'observables',
      sourceHint: 'observables',
    });
  }

  Object.entries(model.parameters).forEach(([name, value]) => {
    if (!Number.isFinite(value)) {
      warnings.push({
        severity: 'error',
        message: `Parameter ${name} is not a finite number.`,
        suggestion: 'Ensure the parameter is assigned to a numeric literal or previously defined expression.',
        relatedElement: name,
        sourceHint: name,
      });
      return;
    }

    if (Math.abs(value) >= LARGE_PARAMETER_THRESHOLD || Math.abs(value) <= SMALL_PARAMETER_THRESHOLD) {
      warnings.push({
        severity: 'warning',
        message: `Parameter ${name} has an unusual magnitude (${value}).`,
        suggestion: 'Verify the units. Typical rate constants fall roughly between 1e-4 and 1e3.',
        relatedElement: name,
        sourceHint: name,
      });
    }
  });

  const unreachableRules = findUnreachableRules(model);
  if (unreachableRules.length > 0) {
    warnings.push({
      severity: 'warning',
      message: `${unreachableRules.length} rule(s) never trigger because their reactants do not match any seed species.`,
      suggestion: 'Check that seed species include the molecules, states, and bonds referenced by each rule reactant.',
      relatedElement: unreachableRules.join(', '),
      sourceHint: 'begin reaction rules',
    });
  }

  return warnings;
};

export const validationWarningsToMarkers = (code: string, warnings: ValidationWarning[]): EditorMarker[] => {
  if (!code) {
    return [];
  }

  const lines = code.split(/\r?\n/);

  const hintCache = new Map<string, number>();

  return warnings.map((warning) => {
    let lineIndex = 0;

    if (warning.sourceHint) {
      const hint = warning.sourceHint;
      if (hintCache.has(hint)) {
        lineIndex = hintCache.get(hint)!;
      } else {
        const matchIndex = lines.findIndex((line) => line.includes(hint));
        if (matchIndex !== -1) {
          lineIndex = matchIndex;
        }
        hintCache.set(hint, lineIndex);
      }
    }

    const lineText = lines[lineIndex] ?? '';

    return {
      severity: warning.severity,
      message: warning.message,
      startLineNumber: lineIndex + 1,
      endLineNumber: lineIndex + 1,
      startColumn: 1,
      endColumn: lineText.length + 1,
    } satisfies EditorMarker;
  });
};
