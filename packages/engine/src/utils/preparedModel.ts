import type { BNGLModel } from '../types';
import { evaluateParameterExpression, reevaluateParameterExpressions } from './paramUtils';
import { resolveCompartmentVolumesSync } from '../services/simulation/CompartmentResolver';
import { setSafeNumberField } from './safeObjectKey';

export interface PreparedModelUpdateImpact {
  affectedParameters: string[];
  affectsKinetics: boolean;
  affectsInitialState: boolean;
  affectsCompartments: boolean;
  affectsVolumes: boolean;
  topologyMayChange: boolean;
}

export interface PreparedModelUpdateResult {
  model: BNGLModel;
  impact: PreparedModelUpdateImpact;
  ratesChanged: boolean;
  initialStateChanged: boolean;
  volumesChanged: boolean;
  solverReinitRequired: boolean;
}

/** Fork just the mutable numeric containers of a prepared graph. */
export function forkPreparedModel(model: BNGLModel): BNGLModel {
  return {
    ...model,
    parameters: { ...(model.parameters ?? {}) },
    species: (model.species ?? []).map((species) => ({ ...species })),
    reactions: (model.reactions ?? []).map((reaction) => ({ ...reaction })),
    compartments: model.compartments?.map((compartment) => ({ ...compartment })),
  };
}

const identifiers = (expression: string): string[] => expression.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];

function affectedParameterClosure(model: BNGLModel, overrides: Record<string, number>): Set<string> {
  const affected = new Set(Object.keys(overrides));
  const expressions = model.paramExpressions ?? {};
  for (let pass = 0; pass <= Object.keys(expressions).length; pass++) {
    let changed = false;
    for (const [name, expression] of Object.entries(expressions)) {
      if (!affected.has(name) && expressionDependsOn(model, expression, affected)) {
        affected.add(name);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return affected;
}

function expressionDependsOn(
  model: BNGLModel,
  expression: string,
  affected: Set<string>,
  visitedFunctions = new Set<string>(),
): boolean {
  const functions = new Map((model.functions ?? []).map((fn) => [fn.name, fn.expression]));
  for (const identifier of identifiers(expression)) {
    if (affected.has(identifier)) return true;
    const body = functions.get(identifier);
    if (body && !visitedFunctions.has(identifier)) {
      visitedFunctions.add(identifier);
      const args = model.functions?.find((fn) => fn.name === identifier)?.args ?? [];
      const bodyAffected = args.length === 0
        ? affected
        : new Set([...affected].filter((name) => !args.includes(name)));
      if (expressionDependsOn(model, body, bodyAffected, visitedFunctions)) return true;
    }
  }
  return false;
}

export function analyzePreparedModelUpdate(
  model: BNGLModel,
  overrides: Record<string, number>,
  seedExpressions: ReadonlyMap<string, string> = new Map(),
): PreparedModelUpdateImpact {
  const affected = affectedParameterClosure(model, overrides);
  const affectsInitialState = (model.species ?? []).some((species) =>
    (species.name in overrides) || ([species.initialExpression, seedExpressions.get(species.name)]
      .some((expression) => typeof expression === 'string' && expressionDependsOn(model, expression, affected))),
  );
  const compartmentParameterNames = new Set((model.compartments ?? []).flatMap((compartment) => [
    compartment.name,
    `__compartment_${compartment.name}__`,
  ]));
  const affectsCompartments = Object.entries(model.paramExpressions ?? {}).some(([name, expression]) =>
    name.startsWith('__compartment_') && (affected.has(name) || expressionDependsOn(model, expression, affected)),
  ) || [...affected].some((name) => name.startsWith('__compartment_') || compartmentParameterNames.has(name));
  const rates = [
    ...(model.reactions ?? []).map((reaction) => reaction.rate),
    ...(model.reactionRules ?? []).map((rule) => rule.rate),
  ];
  const affectsKinetics = rates.some((rate) => typeof rate === 'string' && expressionDependsOn(model, rate, affected));

  return {
    affectedParameters: [...affected],
    affectsKinetics,
    affectsInitialState,
    affectsCompartments,
    affectsVolumes: affectsCompartments,
    // Seed amount changes reinitialize the solver but do not alter species or
    // reaction topology. Compartment changes can alter volume scaling.
    topologyMayChange: affectsCompartments,
  };
}

/** Apply parameter, dependent-rate, and seed updates through one engine-owned contract. */
export function updatePreparedModel(
  model: BNGLModel,
  overrides: Record<string, number>,
  options: { mutate?: boolean; seedExpressions?: ReadonlyMap<string, string>; refreshInitialState?: boolean } = {},
): PreparedModelUpdateResult {
  if (Object.keys(overrides).some((name) => !Number.isFinite(overrides[name]))) {
    throw new Error('Prepared model parameter overrides must be finite numbers');
  }

  const seedExpressions = options.seedExpressions ?? new Map<string, string>();
  const impact = analyzePreparedModelUpdate(model, overrides, seedExpressions);
  const target = options.mutate ? model : { ...model };
  const oldParameters = new Map(Object.entries(model.parameters ?? {}));
  const addCompartmentParameters = (parameters: Map<string, number>, compartments: BNGLModel['compartments']) => {
    for (const compartment of compartments ?? []) {
      const volume = compartment.resolvedVolume ?? compartment.size;
      parameters.set(compartment.name, volume);
      parameters.set(`__compartment_${compartment.name}__`, volume);
    }
    if (!parameters.has('Na')) parameters.set('Na', 1);
  };
  addCompartmentParameters(oldParameters, model.compartments);
  target.parameters = { ...(model.parameters ?? {}) };
  reevaluateParameterExpressions(target, overrides);

  let volumesChanged = false;
  if (impact.affectsCompartments && target.compartments?.length) {
    const oldVolumes = new Map(target.compartments.map((compartment) => [
      compartment.name,
      [compartment.size, compartment.resolvedVolume],
    ]));
    const updated = {
      ...target,
      compartments: target.compartments.map((compartment) => {
        const parameterVolume = overrides[compartment.name]
          ?? overrides[`__compartment_${compartment.name}__`]
          ?? (impact.affectedParameters.includes(`__compartment_${compartment.name}__`)
            ? target.parameters[`__compartment_${compartment.name}__`]
            : undefined);
        return Number.isFinite(parameterVolume) && parameterVolume > 0
          ? { ...compartment, size: parameterVolume }
          : { ...compartment };
      }),
    };
    const resolved = resolveCompartmentVolumesSync(updated);
    target.compartments = resolved.compartments;
    for (const compartment of target.compartments ?? []) {
      const volume = compartment.resolvedVolume ?? compartment.size;
      setSafeNumberField(target.parameters, compartment.name, volume);
      setSafeNumberField(target.parameters, `__compartment_${compartment.name}__`, volume);
      const previous = oldVolumes.get(compartment.name);
      volumesChanged ||= previous?.[0] !== compartment.size || previous?.[1] !== compartment.resolvedVolume;
    }
  }

  const newParameters = new Map(Object.entries(target.parameters ?? {}));
  addCompartmentParameters(newParameters, target.compartments);
  for (const [name, value] of Object.entries(target.parameters ?? {})) newParameters.set(name, value);
  let initialStateChanged = false;
  const oldSpeciesValues = new Map((model.species ?? []).map((species) => [species.name, species.initialConcentration]));
  target.species = (model.species ?? []).map((species) => {
    if (overrides[species.name] !== undefined) {
      initialStateChanged ||= species.initialConcentration !== overrides[species.name];
      return { ...species, initialConcentration: overrides[species.name] };
    }
    const expression = species.initialExpression ?? seedExpressions.get(species.name);
    if (options.refreshInitialState === false || Object.keys(overrides).length === 0
      || typeof expression !== 'string'
      || !expressionDependsOn(model, expression, new Set(impact.affectedParameters))) return { ...species };
    try {
      const normalizeAmountLikeSeedExpression = (value: number, parameters: Map<string, number>): number => {
        const compartment = species.name.match(/^@([^:]+)::?/)?.[1] ?? species.name.match(/@([^@:\s]+)$/)?.[1];
        if (!compartment || !/\bNa\b|\bquantity_to_number_factor\b/.test(expression)) return value;
        const volumeKey = `__compartment_${compartment}__`;
        const compact = expression.replace(/\s+/g, '');
        const volume = parameters.get(volumeKey);
        return Number.isFinite(volume) && volume! > 0 && compact.includes(volumeKey) && !compact.includes(`/${volumeKey}`)
          ? value / volume!
          : value;
      };
      const previousExpressionValue = normalizeAmountLikeSeedExpression(
        evaluateParameterExpression(expression, oldParameters, model.functions), oldParameters,
      );
      const updatedExpressionValue = normalizeAmountLikeSeedExpression(
        evaluateParameterExpression(expression, newParameters, model.functions), newParameters,
      );
      if (!Number.isFinite(updatedExpressionValue)) return { ...species };
      const previousAmount = typeof species.initialConcentration === 'number'
        ? species.initialConcentration
        : previousExpressionValue;
      const updatedAmount = Number.isFinite(previousExpressionValue) && previousExpressionValue !== 0
        ? previousAmount * (updatedExpressionValue / previousExpressionValue)
        : updatedExpressionValue;
      if (!Number.isFinite(updatedAmount)) return { ...species };
      initialStateChanged ||= updatedAmount !== species.initialConcentration;
      return { ...species, initialConcentration: updatedAmount };
    } catch {
      return { ...species };
    }
  });
  initialStateChanged ||= (target.species ?? []).some((species) => oldSpeciesValues.get(species.name) !== species.initialConcentration);

  let ratesChanged = false;
  target.reactions = (model.reactions ?? []).map((reaction) => {
    const refreshAllRates = Object.keys(overrides).length === 0;
    if (reaction.isFunctionalRate || typeof reaction.rate !== 'string'
      || (!refreshAllRates && !expressionDependsOn(model, reaction.rate, new Set(impact.affectedParameters)))) return reaction;
    try {
      const rateConstant = evaluateParameterExpression(reaction.rate, newParameters, model.functions);
      if (!Number.isFinite(rateConstant)) return reaction;
      ratesChanged ||= rateConstant !== reaction.rateConstant;
      return { ...reaction, rateConstant };
    } catch {
      return reaction;
    }
  });

  return {
    model: target,
    impact,
    ratesChanged,
    initialStateChanged,
    volumesChanged,
    solverReinitRequired: initialStateChanged || volumesChanged,
  };
}
