import { BNGLModel, ValidationWarning, EditorMarker } from '../types';
import { extractMoleculeNames, findUnreachableRules } from '@bngplayground/engine';

const LARGE_PARAMETER_THRESHOLD = 1e6;
const SMALL_PARAMETER_THRESHOLD = 1e-6;

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
