import type { BNGLModel } from '../../types';
import { parseSpeciesGraphs, extractAtoms } from './speciesGraphUtils';
import { getRuleId, getRuleLabel } from '../ruleIdentity';



export type AtomKind = 'state' | 'bond';

export interface AtomMetadata {
  id: string;
  kind: AtomKind;
  label: string;
  molecule?: string;
  component?: string;
  state?: string;
  bond?: {
    left: string;
    right: string;
  };
}

export interface RuleImpact {
  ruleId: string;
  label: string;
  consumes: string[];
  produces: string[];
  modifies: string[];
}

export interface AtomRuleUsage {
  produces: string[];
  consumes: string[];
  modifies: string[];
}

export interface RegulatoryInsights {
  atomMetadata: Record<string, AtomMetadata>;
  ruleImpacts: Record<string, RuleImpact>;
  atomRuleUsage: Record<string, AtomRuleUsage>;
  atomToObservables: Record<string, string[]>;
  observableToAtoms: Record<string, string[]>;
  atomToSpecies: Record<string, string[]>;
  speciesToAtoms: Record<string, string[]>;
}

const parseAtomId = (atomId: string): AtomMetadata => {
  // bonds are now identified simply by containing a `|` separator
  if (atomId.includes('|')) {
    const [leftRaw, rightRaw] = atomId.split('|');
    const formatEndpoint = (endpoint: string): string => endpoint.replace(':', '.');
    const label = `${formatEndpoint(leftRaw)} — ${formatEndpoint(rightRaw ?? '')}`;

    return {
      id: atomId,
      kind: 'bond',
      label,
      bond: {
        left: leftRaw,
        right: rightRaw ?? '',
      },
    } satisfies AtomMetadata;
  }

  const [base, state] = atomId.split('~');
  const [molecule, component] = base.split('.');
  const label = state ? `${molecule}.${component}~${state}` : `${molecule}.${component}`;

  return {
    id: atomId,
    kind: 'state',
    label,
    molecule,
    component,
    state,
  } satisfies AtomMetadata;
};

const ensureArrayEntry = (map: Record<string, string[]>, key: string): string[] => {
  if (!map[key]) {
    map[key] = [];
  }
  return map[key];
};

const addToMap = (map: Record<string, string[]>, key: string, value: string) => {
  const target = ensureArrayEntry(map, key);
  if (!target.includes(value)) {
    target.push(value);
  }
};

export const buildRegulatoryInsights = (model: BNGLModel | null): RegulatoryInsights | null => {
  if (!model) {
    return null;
  }

  const atomMetadata: Record<string, AtomMetadata> = {};
  const ruleImpacts: Record<string, RuleImpact> = {};
  const atomRuleUsage: Record<string, AtomRuleUsage> = {};

  const registerAtom = (atomId: string) => {
    if (!atomMetadata[atomId]) {
      atomMetadata[atomId] = parseAtomId(atomId);
    }
    if (!atomRuleUsage[atomId]) {
      atomRuleUsage[atomId] = { produces: [], consumes: [], modifies: [] } satisfies AtomRuleUsage;
    }
  };

  model.reactionRules.forEach((rule, index) => {
    const ruleId = getRuleId(rule, index);
    const label = getRuleLabel(rule, index);

    const reactantGraphs = parseSpeciesGraphs(rule.reactants);
    const productGraphs = parseSpeciesGraphs(rule.products);

    const reactantAtoms = extractAtoms(reactantGraphs);
    const productAtoms = extractAtoms(productGraphs);

    const consumes = Array.from(reactantAtoms).filter((atom) => !productAtoms.has(atom));
    const produces = Array.from(productAtoms).filter((atom) => !reactantAtoms.has(atom));
    const modifies = Array.from(reactantAtoms).filter((atom) => productAtoms.has(atom));

    const registerUsage = (atomId: string, bucket: keyof AtomRuleUsage) => {
      registerAtom(atomId);
      const usage = atomRuleUsage[atomId];
      if (!usage[bucket].includes(ruleId)) {
        usage[bucket].push(ruleId);
      }
    };

    consumes.forEach((atomId) => registerUsage(atomId, 'consumes'));
    produces.forEach((atomId) => registerUsage(atomId, 'produces'));
    modifies.forEach((atomId) => registerUsage(atomId, 'modifies'));

    [...reactantAtoms, ...productAtoms].forEach((atomId) => registerAtom(atomId));

    ruleImpacts[ruleId] = {
      ruleId,
      label,
      consumes: consumes.sort(),
      produces: produces.sort(),
      modifies: modifies.sort(),
    } satisfies RuleImpact;
  });

  const atomToObservables: Record<string, string[]> = {};
  const observableToAtoms: Record<string, string[]> = {};

  model.observables.forEach((observable) => {
    const observableAtoms = Array.from(extractAtoms(parseSpeciesGraphs([observable.pattern])));
    if (observableAtoms.length === 0) {
      return;
    }

    observableToAtoms[observable.name] = observableAtoms;
    observableAtoms.forEach((atomId) => {
      registerAtom(atomId);
      addToMap(atomToObservables, atomId, observable.name);
    });
  });

  const atomToSpecies: Record<string, string[]> = {};
  const speciesToAtoms: Record<string, string[]> = {};

  model.species.forEach((species) => {
    const speciesAtoms = Array.from(extractAtoms(parseSpeciesGraphs([species.name])));
    if (speciesAtoms.length === 0) {
      return;
    }

    speciesToAtoms[species.name] = speciesAtoms;
    speciesAtoms.forEach((atomId) => {
      registerAtom(atomId);
      addToMap(atomToSpecies, atomId, species.name);
    });
  });

  // Sort arrays for stable UI presentation
  Object.values(atomRuleUsage).forEach((usage) => {
    usage.consumes.sort();
    usage.produces.sort();
    usage.modifies.sort();
  });

  Object.values(atomToObservables).forEach((items) => items.sort());
  Object.values(observableToAtoms).forEach((items) => items.sort());
  Object.values(atomToSpecies).forEach((items) => items.sort());
  Object.values(speciesToAtoms).forEach((items) => items.sort());

  return {
    atomMetadata,
    ruleImpacts,
    atomRuleUsage,
    atomToObservables,
    observableToAtoms,
    atomToSpecies,
    speciesToAtoms,
  } satisfies RegulatoryInsights;
};
