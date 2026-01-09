// @ts-nocheck
import type { ReactionRule } from './ruleChangeTypes';
import {
  extractBonds,
  parseSpeciesGraphs,
  detectStateChanges as detectStateChangesUtil,
} from '../visualization/speciesGraphUtils';
import type { BondInfo } from '../visualization/speciesGraphUtils';
import {
  RuleChangeSummary,
  RuleKind,
  Reversibility,
  BondChange,
  StateChange,
  ComplexChangeType,
  SynthDegChange,
} from './ruleChangeTypes';

interface ClassifierOptions {
  ruleId?: string;
  ruleName?: string;
}

export function classifyRuleChanges(rule: ReactionRule, opts: ClassifierOptions = {}): RuleChangeSummary {
  const reversibility: Reversibility = rule.isBidirectional ? 'reversible' : 'irreversible';
  const ruleId = opts.ruleId ?? rule.name ?? 'unnamed_rule';
  const ruleName = opts.ruleName ?? rule.name ?? ruleId;

  const reactantGraphs = parseSpeciesGraphs(rule.reactants);
  const productGraphs = parseSpeciesGraphs(rule.products);

  const bondChanges = buildBondChanges(reactantGraphs, productGraphs, reversibility);
  const stateChanges = buildStateChanges(reactantGraphs, productGraphs, reversibility);
  const synthDegChanges = detectSynthDeg(rule);
  const complexChange = classifyComplexChange(rule, reversibility);
  const kind = decideRuleKind(bondChanges, stateChanges, synthDegChanges, complexChange);

  return {
    ruleId,
    ruleName,
    kind,
    reversibility,
    bondChanges,
    stateChanges,
    complexChange,
    synthDegChanges,
  };
}

const buildBondChanges = (
  reactantGraphs: ReturnType<typeof parseSpeciesGraphs>,
  productGraphs: ReturnType<typeof parseSpeciesGraphs>,
  reversibility: Reversibility
): BondChange[] => {
  const reactantBonds = extractBonds(reactantGraphs);
  const productBonds = extractBonds(productGraphs);
  const changes: BondChange[] = [];

  productBonds.forEach((bondInfo, key) => {
    if (!reactantBonds.has(key)) {
      collectBondEndpoints(bondInfo).forEach((entry) => {
        changes.push({
          molecule: entry.molecule,
          site: entry.site,
          change: 'added',
          reversibility,
        });
      });
    }
  });

  reactantBonds.forEach((bondInfo, key) => {
    if (!productBonds.has(key)) {
      collectBondEndpoints(bondInfo).forEach((entry) => {
        changes.push({
          molecule: entry.molecule,
          site: entry.site,
          change: 'removed',
          reversibility,
        });
      });
    }
  });

  return changes;
};

const collectBondEndpoints = (bondInfo: BondInfo) => [
  { molecule: bondInfo.mol1, site: bondInfo.comp1 },
  { molecule: bondInfo.mol2, site: bondInfo.comp2 },
];

const buildStateChanges = (
  reactantGraphs: ReturnType<typeof parseSpeciesGraphs>,
  productGraphs: ReturnType<typeof parseSpeciesGraphs>,
  reversibility: Reversibility
): StateChange[] => {
  // Use the new positional state change detection
  const detectedChanges = detectStateChangesUtil(reactantGraphs, productGraphs);

  return detectedChanges.map((change) => ({
    molecule: change.molecule,
    site: change.component,
    fromState: change.fromState,
    toState: change.toState,
    reversibility,
  }));
};

const detectSynthDeg = (rule: ReactionRule): SynthDegChange[] => {
  const changes: SynthDegChange[] = [];
  if (rule.reactants.length === 0 && rule.products.length > 0) {
    rule.products.forEach((product) => {
      changes.push({
        molecule: product,
        fullPattern: patternToString(rule.products),
        change: 'synthesized',
      });
    });
  }

  if (rule.products.length === 0 && rule.reactants.length > 0) {
    rule.reactants.forEach((reactant) => {
      changes.push({
        molecule: reactant,
        fullPattern: patternToString(rule.reactants),
        change: 'degraded',
      });
    });
  }

  return changes;
};

const classifyComplexChange = (rule: ReactionRule, reversibility: Reversibility): ComplexChangeType => {
  const lhs = rule.reactants.length;
  const rhs = rule.products.length;
  if (lhs === rhs) {
    return lhs <= 1 ? 'no_change_complex' : 'no_change_separate';
  }

  if (rhs > lhs) {
    return reversibility === 'reversible' ? 'dissoc_rev' : 'dissoc_nonrev';
  }

  if (rhs < lhs) {
    return reversibility === 'reversible' ? 'assoc_rev' : 'assoc_nonrev';
  }

  return 'no_change_separate';
};

const decideRuleKind = (
  bondChanges: BondChange[],
  stateChanges: StateChange[],
  synthDeg: SynthDegChange[],
  complexChange: ComplexChangeType
): RuleKind => {
  const hasBond = bondChanges.length > 0;
  const hasState = stateChanges.length > 0;
  const hasSynth = synthDeg.some((ch) => ch.change === 'synthesized');
  const hasDeg = synthDeg.some((ch) => ch.change === 'degraded');

  if (complexChange === 'assoc_nonrev' || complexChange === 'assoc_rev') return 'association';
  if (complexChange === 'dissoc_nonrev' || complexChange === 'dissoc_rev') return 'dissociation';

  if (!hasBond && hasState && !hasSynth && !hasDeg) return 'pure_state_change';
  if (hasBond && !hasState && !hasSynth && !hasDeg) return 'pure_binding';
  if (hasBond && hasState && !hasSynth && !hasDeg) return 'binding_and_state_change';
  if (hasSynth && !hasDeg && !hasBond && !hasState) return 'synthesis';
  if (hasDeg && !hasSynth && !hasBond && !hasState) return 'degradation';

  return 'mixed';
};

const patternToString = (patterns: string[]): string => {
  if (patterns.length === 0) {
    return '0';
  }
  return patterns.join(' + ');
};
