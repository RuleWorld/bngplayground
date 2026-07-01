// ---------------------------------------------------------------------------
// CellAgent.ts – Cell agent data structures for agent-based cell modelling
// ---------------------------------------------------------------------------

export interface CellState {
  id: number;
  cellType: string;
  position: [number, number, number];
  radius: number;
  intracellularState: Float64Array;
  observables: Record<string, number>;
  age: number;
  phase: 'active' | 'dividing' | 'apoptotic' | 'dead';
  volume: number;
  secretionRates: Record<string, number>;
  uptakeRates: Record<string, number>;
}

export interface CellDecisionRule {
  name: string;
  condition: {
    observable: string;
    operator: '>' | '<' | '>=' | '<=' | '==' | '!=';
    threshold: number;
  };
  action: CellAction;
  probability?: number;
  refractoryPeriod?: number;
}

export type CellAction =
  | { type: 'divide'; asymmetry?: number }
  | { type: 'die' }
  | { type: 'migrate'; direction: 'chemotaxis' | 'random'; speed: number; chemotaxisTarget?: string }
  | { type: 'secrete'; species: string; rate: number }
  | { type: 'stop_secrete'; species: string }
  | { type: 'change_type'; newType: string }
  | { type: 'set_parameter'; parameter: string; value: number };

export interface CellTypeDefinition {
  name: string;
  bnglModel: string;
  initialRadius: number;
  doublingVolume?: number;
  volumeGrowthRate?: number;
  decisionRules: CellDecisionRule[];
  motility: number;
  secretion?: Array<{
    species: string;
    intracellularObservable: string;
    scalingFactor: number;
  }>;
  uptake?: Array<{
    species: string;
    intracellularParameter: string;
    scalingFactor: number;
  }>;
}

// ---------------------------------------------------------------------------
// Helper: simple seeded pseudo-random number generator (xoshiro128**)
// ---------------------------------------------------------------------------

export class SimpleRNG {
  private s: Uint32Array;

  constructor(seed: number) {
    // Splitmix-style seeding
    this.s = new Uint32Array(4);
    let z = (seed | 0) >>> 0;
    for (let i = 0; i < 4; i++) {
      z = (z + 0x9e3779b9) >>> 0;
      let t = z ^ (z >>> 16);
      t = Math.imul(t, 0x85ebca6b);
      t = t ^ (t >>> 13);
      t = Math.imul(t, 0xc2b2ae35);
      t = (t ^ (t >>> 16)) >>> 0;
      this.s[i] = t;
    }
  }

  /** Return a uniform random number in [0, 1). */
  next(): number {
    const s = this.s;
    const tmp = (s[1] * 5) >>> 0;
    const result = (Math.imul(((tmp << 7) | (tmp >>> 25)), 9)) >>> 0;
    const t = s[1] << 9;

    s[2] ^= s[0];
    s[3] ^= s[1];
    s[1] ^= s[2];
    s[0] ^= s[3];
    s[2] ^= t;
    s[3] = (s[3] << 11) | (s[3] >>> 21);

    return (result >>> 0) / 0x100000000;
  }

  /** Return a standard normal variate via Box-Muller. */
  nextGaussian(): number {
    const u1 = this.next();
    const u2 = this.next();
    return Math.sqrt(-2 * Math.log(u1 || 1e-300)) * Math.cos(2 * Math.PI * u2);
  }

  /** Binomial sample B(n, p) via inversion for small n. */
  binomial(n: number, p: number): number {
    let successes = 0;
    for (let i = 0; i < n; i++) {
      if (this.next() < p) successes++;
    }
    return successes;
  }
}

// ---------------------------------------------------------------------------
// createCell – create a new cell with default state
// ---------------------------------------------------------------------------

export function createCell(
  id: number,
  typeDef: CellTypeDefinition,
  position: [number, number, number],
): CellState {
  const r = typeDef.initialRadius;
  const volume = (4 / 3) * Math.PI * r * r * r;

  return {
    id,
    cellType: typeDef.name,
    position: [position[0], position[1], position[2]],
    radius: r,
    intracellularState: new Float64Array(0), // populated later by simulation
    observables: {},
    age: 0,
    phase: 'active',
    volume,
    secretionRates: {},
    uptakeRates: {},
  };
}

// ---------------------------------------------------------------------------
// evaluateCondition – evaluate a decision rule condition against observables
// ---------------------------------------------------------------------------

export function evaluateCondition(
  cell: CellState,
  condition: CellDecisionRule['condition'],
): boolean {
  const value = cell.observables[condition.observable] ?? 0;
  switch (condition.operator) {
    case '>':
      return value > condition.threshold;
    case '<':
      return value < condition.threshold;
    case '>=':
      return value >= condition.threshold;
    case '<=':
      return value <= condition.threshold;
    case '==':
      return value === condition.threshold;
    case '!=':
      return value !== condition.threshold;
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// divideCell – create a daughter cell with ~50 % partitioned state
//
// Each molecule count in the intracellular state is partitioned via
// binomial sampling B(n, 0.5) so that parent + daughter = original total.
// ---------------------------------------------------------------------------

export function divideCell(
  parent: CellState,
  nextId: number,
  rng: SimpleRNG,
): CellState {
  // Create daughter as a copy of parent
  const daughter: CellState = {
    id: nextId,
    cellType: parent.cellType,
    position: [
      parent.position[0] + (rng.next() - 0.5) * parent.radius,
      parent.position[1] + (rng.next() - 0.5) * parent.radius,
      parent.position[2] + (rng.next() - 0.5) * parent.radius,
    ],
    radius: parent.radius / Math.cbrt(2), // half volume
    intracellularState: new Float64Array(parent.intracellularState.length),
    observables: { ...parent.observables },
    age: 0,
    phase: 'active',
    volume: parent.volume / 2,
    secretionRates: { ...parent.secretionRates },
    uptakeRates: { ...parent.uptakeRates },
  };

  // Partition intracellular molecules via binomial sampling
  const parentState = new Float64Array(parent.intracellularState.length);
  for (let i = 0; i < parent.intracellularState.length; i++) {
    const total = Math.round(parent.intracellularState[i]);
    if (total <= 0) {
      parentState[i] = 0;
      daughter.intracellularState[i] = 0;
    } else {
      const daughterCount = rng.binomial(total, 0.5);
      daughter.intracellularState[i] = daughterCount;
      parentState[i] = total - daughterCount;
    }
  }

  // Update parent in-place
  parent.intracellularState = parentState;
  parent.radius = parent.radius / Math.cbrt(2);
  parent.volume = parent.volume / 2;
  parent.age = 0;

  return daughter;
}

// ---------------------------------------------------------------------------
// moveCell – update cell position via random walk or chemotaxis
// ---------------------------------------------------------------------------

export function moveCell(
  cell: CellState,
  direction: 'random' | 'chemotaxis',
  dt: number,
  gradient?: [number, number, number],
  rng?: { next(): number },
): void {
  const speed = dt; // caller passes speed * dt already factored into the time-step

  if (direction === 'chemotaxis' && gradient) {
    // Normalise gradient
    const mag = Math.sqrt(
      gradient[0] * gradient[0] + gradient[1] * gradient[1] + gradient[2] * gradient[2],
    );
    if (mag > 1e-12) {
      cell.position[0] += (gradient[0] / mag) * speed;
      cell.position[1] += (gradient[1] / mag) * speed;
      cell.position[2] += (gradient[2] / mag) * speed;
    }
  } else {
    // Random walk: isotropic displacement of magnitude speed
    const rand = rng ? rng.next.bind(rng) : () => {
      const a = new Uint32Array(1);
      globalThis.crypto.getRandomValues(a);
      return a[0] / 0x100000000;
    };
    const theta = rand() * 2 * Math.PI;
    const phi = Math.acos(2 * rand() - 1);
    cell.position[0] += speed * Math.sin(phi) * Math.cos(theta);
    cell.position[1] += speed * Math.sin(phi) * Math.sin(theta);
    cell.position[2] += speed * Math.cos(phi);
  }
}
