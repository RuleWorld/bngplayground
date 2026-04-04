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
    boundary: 'reflective' | 'periodic';
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
}

// ---------------------------------------------------------------------------
// Condition parser: "pERK > 0.5" → { observable, operator, threshold }
// ---------------------------------------------------------------------------

const OPERATOR_RE = /^(\w+)\s*(>=|<=|==|!=|>|<)\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)$/;

function parseCondition(when: string): CellDecisionRule['condition'] {
  const match = when.trim().match(OPERATOR_RE);
  if (!match) {
    throw new Error(`Cannot parse decision condition: "${when}"`);
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

  throw new Error(`Cannot parse decision action: "${then}"`);
}

// ---------------------------------------------------------------------------
// parseMultiscaleModel – main entry
// ---------------------------------------------------------------------------

export function parseMultiscaleModel(
  definition: MultiscaleModelDefinition,
): MultiscaleConfig {
  const cellTypes: CellTypeDefinition[] = [];

  for (const [name, ct] of Object.entries(definition.cellTypes)) {
    const rules: CellDecisionRule[] = ct.decisions.map((d) => ({
      name: d.name,
      condition: parseCondition(d.when),
      action: parseAction(d.then),
      probability: d.probability,
      refractoryPeriod: d.refractory,
    }));

    cellTypes.push({
      name,
      bnglModel: ct.model,
      initialRadius: ct.radius,
      doublingVolume: ct.doublingVolume,
      volumeGrowthRate: ct.volumeGrowthRate,
      decisionRules: rules,
      motility: ct.motility,
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
    definition.domain.size[2] / 2,
  ];

  const initialCells: MultiscaleConfig['initialCells'] = definition.population.map(
    (p) => ({
      cellType: p.cellType,
      position: domainCentre,
      count: p.count,
    }),
  );

  return {
    cellTypes,
    initialCells,
    extracellularSpecies: definition.extracellular.species.map((s) => ({
      name: s.name,
      diffusionConstant: s.D,
      initialConcentration: s.initial ?? 0,
      degradationRate: s.degradation ?? 0,
    })),
    domain: {
      dimensions: definition.domain.dimensions,
      size: definition.domain.size,
      boundaryCondition: definition.domain.boundary,
    },
    tEnd: definition.time.end,
    dtIntracellular: definition.time.dtIntra,
    dtExtracellular: definition.time.dtExtra,
    dtDecision: definition.time.dtDecision,
    nOutput: definition.time.outputs,
  };
}
