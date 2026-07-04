import {
  buildSymbolicODESystem,
  exprToString,
  substitute,
  symVar,
  type SymbolicODESystem,
  type SymExpr,
} from '@bngplayground/engine';
import { BNGLModel } from '../types';

function fmtNum(v: number): string {
  if (!Number.isFinite(v)) return '0';
  if (Number.isInteger(v)) return String(v);
  return String(v);
}

export function symbolicODEToXPP(system: SymbolicODESystem, modelName: string): string {
  const { speciesNames, parameterNames, parameterValues, rhs, initialConcentrations } = system;

  const speciesVar = (i: number) => `S${i + 1}`;

  const renderedRhs = rhs.map((expr: SymExpr) => {
    let e = expr;
    speciesNames.forEach((sp, i) => {
      e = substitute(e, sp, symVar(speciesVar(i)));
    });
    return exprToString(e);
  });

  const lines: string[] = [];
  lines.push(`# ${modelName}.ode`);
  lines.push('# ODE system exported by BNG Playground.');
  lines.push('# Generated from the network-expanded reaction system (mass-action kinetics),');
  lines.push('# consistent with the reaction network integrated by the simulator.');
  lines.push('# Format: XPPAUT (.ode). Species are indexed S1..Sn; the legend below maps');
  lines.push('# each index to its BNGL species pattern. (Older XPP builds limit names to a');
  lines.push('# few characters, so very long parameter names may need shortening there.)');
  lines.push('#');
  lines.push('# ---- Species legend ----');
  speciesNames.forEach((sp, i) => {
    lines.push(`#   ${speciesVar(i)} = ${sp}`);
  });
  lines.push('');

  lines.push('# ---- Parameters ----');
  if (parameterNames.length === 0) {
    lines.push('# (no named parameters)');
  } else {
    parameterNames.forEach((name, i) => {
      lines.push(`par ${name}=${fmtNum(parameterValues?.[i] ?? 0)}`);
    });
  }
  lines.push('');

  lines.push('# ---- Initial conditions ----');
  speciesNames.forEach((_, i) => {
    lines.push(`init ${speciesVar(i)}=${fmtNum(initialConcentrations[i] ?? 0)}`);
  });
  lines.push('');

  lines.push('# ---- ODEs ----');
  renderedRhs.forEach((r, i) => {
    lines.push(`d${speciesVar(i)}/dt=${r}`);
  });
  lines.push('');

  lines.push('done');
  lines.push('');

  return lines.join('\n');
}

export async function exportModelToODE(model: BNGLModel, modelName: string): Promise<string> {
  const { bnglService } = await import('./bnglService');
  const gen = await bnglService.generateNetwork(model);
  const speciesNames = (gen.species ?? []).map((s) => s.name);
  const reactions = gen.reactions ?? [];
  const params = gen.parameters ?? model.parameters ?? {};
  const parameterNames = Object.keys(params);
  const parameterValues = parameterNames.map((n) => params[n]);
  const initialConcentrations = (gen.species ?? []).map((s) => s.initialConcentration ?? 0);

  const system = buildSymbolicODESystem(
    speciesNames,
    reactions,
    parameterNames,
    initialConcentrations,
    parameterValues,
  );

  return symbolicODEToXPP(system, modelName);
}
