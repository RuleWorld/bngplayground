// ---------------------------------------------------------------------------
// MultiscaleParser.ts – Parse a multi-scale model definition into config
// ---------------------------------------------------------------------------

import { CellAction, CellDecisionRule, CellTypeDefinition } from './CellAgent';
import { MultiscaleConfig } from './MultiscaleSimulation';

// ---------------------------------------------------------------------------
// Model definition types (JSON input format)
// ---------------------------------------------------------------------------

export interface MultiscaleModelDefinition {
  name: string;
  cellTypes: Record<
    string,
    {
      model: string;
      radius: number;
      motility: number;
      doublingVolume?: number;
      volumeGrowthRate?: number;
      decisions: Array<{
        name: string;
        when: string;
        then: string;
        probability?: number;
        refractory?: number;
      }>;
      secretes?: Array<{ species: string; driven_by: string; rate: number }>;
      uptakes?: Array<{ species: string; sets_parameter: string; rate: number }>;
    }
  >;
  extracellular: {
    species: Array<{
      name: string;
      D: number;
      degradation?: number;
      initial?: number;
    }>;
  };
  domain: {
    dimensions: 2 | 3;
    size: [number, number, number];
    boundary: 'reflective' | 'periodic' | 'absorbing';
    resolution?: [number, number, number] | [number, number];
  };
  population: Array<{
    cellType: string;
    count: number;
    region?: string;
  }>;
  time: {
    end: number;
    dtIntra: number;
    dtExtra: number;
    dtDecision: number;
    outputs: number;
  };
  maxCells?: number;
  seed?: number;
}

// ---------------------------------------------------------------------------
// Condition parser: "pERK > 0.5" → { observable, operator, threshold }
// ---------------------------------------------------------------------------

const OPERATOR_RE = /^(\w+)\s*(>=|<=|==|!=|>|<)\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)$/;

function parseCondition(when: string): CellDecisionRule['condition'] {
  const match = when.trim().match(OPERATOR_RE);
  if (!match) {
    throw new Error(
      `Cannot parse condition: "${when}". Expected format: "<observable> <op> <number>", e.g. "pERK > 0.5". ` +
      'Supported operators: >, <, >=, <=, ==, !=',
    );
  }
  return {
    observable: match[1],
    operator: match[2] as CellDecisionRule['condition']['operator'],
    threshold: parseFloat(match[3]),
  };
}

// ---------------------------------------------------------------------------
// Action parser
// ---------------------------------------------------------------------------

function parseAction(then: string): CellAction {
  const s = then.trim();

  if (s === 'divide') {
    return { type: 'divide' };
  }
  if (s === 'die') {
    return { type: 'die' };
  }

  // secrete(EGF, 100)
  const secreteMatch = s.match(/^secrete\(\s*(\w+)\s*,\s*([+-]?[\d.eE+-]+)\s*\)$/);
  if (secreteMatch) {
    return { type: 'secrete', species: secreteMatch[1], rate: parseFloat(secreteMatch[2]) };
  }

  // stop_secrete(EGF)
  const stopSecreteMatch = s.match(/^stop_secrete\(\s*(\w+)\s*\)$/);
  if (stopSecreteMatch) {
    return { type: 'stop_secrete', species: stopSecreteMatch[1] };
  }

  // chemotaxis(EGF, 10)
  const chemoMatch = s.match(/^chemotaxis\(\s*(\w+)\s*,\s*([+-]?[\d.eE+-]+)\s*\)$/);
  if (chemoMatch) {
    return {
      type: 'migrate',
      direction: 'chemotaxis',
      speed: parseFloat(chemoMatch[2]),
      chemotaxisTarget: chemoMatch[1],
    };
  }

  // migrate(random, 5)
  const migrateMatch = s.match(/^migrate\(\s*(random|chemotaxis)\s*,\s*([+-]?[\d.eE+-]+)\s*\)$/);
  if (migrateMatch) {
    return {
      type: 'migrate',
      direction: migrateMatch[1] as 'random' | 'chemotaxis',
      speed: parseFloat(migrateMatch[2]),
    };
  }

  // change_type(Macrophage)
  const changeTypeMatch = s.match(/^change_type\(\s*(\w+)\s*\)$/);
  if (changeTypeMatch) {
    return { type: 'change_type', newType: changeTypeMatch[1] };
  }

  // set_parameter(kDeg, 0.01)
  const setParamMatch = s.match(
    /^set_parameter\(\s*(\w+)\s*,\s*([+-]?[\d.eE+-]+)\s*\)$/,
  );
  if (setParamMatch) {
    return {
      type: 'set_parameter',
      parameter: setParamMatch[1],
      value: parseFloat(setParamMatch[2]),
    };
  }

  throw new Error(
    `Cannot parse multiscale decision action: "${then}". ` +
    'Supported actions: divide, die, secrete(species, rate), stop_secrete(species), ' +
    'chemotaxis(species, speed), migrate(random|chemotaxis, speed), change_type(typeName), ' +
    'set_parameter(name, value).'
  );
}

// ---------------------------------------------------------------------------
// parseMultiscaleModel – main entry
// ---------------------------------------------------------------------------

export function parseMultiscaleModel(
  definition: MultiscaleModelDefinition,
): MultiscaleConfig {
  if (!definition || typeof definition !== 'object') {
    throw new Error('Multiscale model definition must be a valid non-null object');
  }

  if (!definition.cellTypes || typeof definition.cellTypes !== 'object' || Object.keys(definition.cellTypes).length === 0) {
    throw new Error('Multiscale model definition must define at least one cell type');
  }

  if (!definition.domain || typeof definition.domain !== 'object') {
    throw new Error('Multiscale model definition must include domain configuration');
  }

  const dims = definition.domain.dimensions;
  if (dims !== 2 && dims !== 3) {
    throw new Error(`Invalid domain dimensions: ${String(dims)}. Must be 2 or 3.`);
  }

  const dSize = definition.domain.size;
  if (!Array.isArray(dSize) || dSize.length < 2 || dSize[0] <= 0 || dSize[1] <= 0 || (dims === 3 && (dSize[2] ?? 0) <= 0)) {
    throw new Error('Multiscale model domain.size must have positive dimensions');
  }

  const time = definition.time;
  if (!time || typeof time !== 'object') {
    throw new Error('Multiscale model definition must include time configuration');
  }

  if (time.end <= 0 || !Number.isFinite(time.end)) {
    throw new Error(`Invalid simulation end time: ${time.end}. Must be > 0.`);
  }
  if (time.dtIntra <= 0 || !Number.isFinite(time.dtIntra)) {
    throw new Error(`Invalid dtIntra: ${time.dtIntra}. Must be > 0.`);
  }
  if (time.dtExtra <= 0 || !Number.isFinite(time.dtExtra)) {
    throw new Error(`Invalid dtExtra: ${time.dtExtra}. Must be > 0.`);
  }
  if (time.dtDecision <= 0 || !Number.isFinite(time.dtDecision)) {
    throw new Error(`Invalid dtDecision: ${time.dtDecision}. Must be > 0.`);
  }
  if (time.outputs <= 0 || !Number.isFinite(time.outputs)) {
    throw new Error(`Invalid outputs count: ${time.outputs}. Must be > 0.`);
  }

  const cellTypes: CellTypeDefinition[] = [];

  for (const [name, ct] of Object.entries(definition.cellTypes)) {
    if (!ct || typeof ct !== 'object') {
      throw new Error(`Cell type "${name}" definition is invalid`);
    }

    const rules: CellDecisionRule[] = (ct.decisions ?? []).map((d) => ({
      name: d.name,
      condition: parseCondition(d.when),
      action: parseAction(d.then),
      probability: d.probability,
      refractoryPeriod: d.refractory,
    }));

    cellTypes.push({
      name,
      bnglModel: ct.model ?? '',
      initialRadius: ct.radius ?? 5.0,
      doublingVolume: ct.doublingVolume,
      volumeGrowthRate: ct.volumeGrowthRate,
      decisionRules: rules,
      motility: ct.motility ?? 0,
      secretion: ct.secretes?.map((s) => ({
        species: s.species,
        intracellularObservable: s.driven_by,
        scalingFactor: s.rate,
      })),
      uptake: ct.uptakes?.map((u) => ({
        species: u.species,
        intracellularParameter: u.sets_parameter,
        scalingFactor: u.rate,
      })),
    });
  }

  // Centre of domain for initial placement
  const domainCentre: [number, number, number] = [
    definition.domain.size[0] / 2,
    definition.domain.size[1] / 2,
    dims === 3 ? (definition.domain.size[2] ?? 1) / 2 : 0,
  ];

  const population = definition.population ?? [];
  const initialCells: MultiscaleConfig['initialCells'] = population.map(
    (p) => ({
      cellType: p.cellType,
      position: domainCentre,
      count: p.count,
    }),
  );

  const extraSpecies = (definition.extracellular?.species ?? []).map((s) => {
    if (s.D < 0) {
      throw new Error(`Extracellular species "${s.name}" cannot have negative diffusion constant: ${s.D}`);
    }
    return {
      name: s.name,
      diffusionConstant: s.D,
      initialConcentration: s.initial ?? 0,
      degradationRate: s.degradation ?? 0,
    };
  });

  return {
    cellTypes,
    initialCells,
    extracellularSpecies: extraSpecies,
    domain: {
      dimensions: dims,
      size: [
        definition.domain.size[0],
        definition.domain.size[1],
        dims === 3 ? (definition.domain.size[2] ?? 1) : 1,
      ],
      boundaryCondition: definition.domain.boundary ?? 'reflective',
      resolution: definition.domain.resolution,
    },
    tEnd: definition.time.end,
    dtIntracellular: definition.time.dtIntra,
    dtExtracellular: definition.time.dtExtra,
    dtDecision: definition.time.dtDecision,
    nOutput: definition.time.outputs,
    maxCells: definition.maxCells,
    seed: definition.seed,
  };
}
