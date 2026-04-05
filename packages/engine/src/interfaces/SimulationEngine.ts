import type {
  BNGLModel,
  SimulationOptions,
  SimulationResults,
  BNGLReaction,
  BNGLSpecies,
} from '../types';

/**
 * Expanded network produced by NetworkExpansion.
 * ODE and SSA engines consume this. NFsim does not (works from BNG-XML).
 */
export interface ExpandedNetwork {
  species: BNGLSpecies[];
  reactions: BNGLReaction[];
  observableExpressions: Map<string, string>;
  parameterValues: Map<string, number>;
}

/**
 * Common interface for all simulation engines.
 */
export interface SimulationEngine {
  readonly name: string;
  readonly method: 'ode' | 'ssa' | 'nf' | 'pla' | 'psa';

  /** Can this engine handle the given model + options? */
  canHandle(model: BNGLModel, options: SimulationOptions): boolean;

  /** Run the simulation. */
  simulate(
    model: BNGLModel,
    network: ExpandedNetwork | null,
    options: SimulationOptions,
    onProgress?: (fraction: number) => void,
    signal?: AbortSignal,
  ): Promise<SimulationResults>;
}

/**
 * Registry for simulation engines. The worker queries this to dispatch.
 */
export class EngineRegistry {
  private engines: SimulationEngine[] = [];

  register(engine: SimulationEngine): void {
    this.engines.push(engine);
  }

  resolve(model: BNGLModel, options: SimulationOptions): SimulationEngine | null {
    const raw = options.method;
    const method: 'ode' | 'ssa' | 'nf' | 'pla' | 'psa' | null =
      raw === 'default' ? null :
      raw === 'nfsim'   ? 'nf' :
      raw === 'pla'     ? 'pla' :
      raw === 'psa'     ? 'psa' :
      raw;

    // Explicit method request
    if (method) {
      const engine = this.engines.find(
        e => e.method === method && e.canHandle(model, options)
      );
      if (engine) return engine;
    }

    // Auto-detect: ODE → SSA → NFsim
    for (const m of ['ode', 'ssa', 'nf'] as const) {
      const engine = this.engines.find(
        e => e.method === m && e.canHandle(model, options)
      );
      if (engine) return engine;
    }
    return null;
  }
}
