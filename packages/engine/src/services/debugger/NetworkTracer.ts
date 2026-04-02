// import { BNGLParser } from '../graph/core/BNGLParser';
// import { NetworkGenerator } from '../graph/NetworkGenerator';
import type { BNGLModel } from '../../types';
import { type TraceResult } from './types';

/*
const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

const asMultiplicity = (count: number): RuleMultiplicity => {
  if (count <= 1) return 'unimolecular';
  if (count === 2) return 'bimolecular';
  return 'multimolecular';
};

// ... (other helpers commented out) ...

const toExpandedEvent = (event: any, timestamp: number): ExpansionEvent => {
    // Stub
    return {} as any;
};
*/

export interface TraceOptions {
  maxSpecies?: number;
  maxReactions?: number;
  maxIterations?: number;
}

export class NetworkTracer {

  async trace(_model: BNGLModel, _options: TraceOptions = {}): Promise<TraceResult> {
    throw new Error("Network Tracing is currently disabled due to NetworkGenerator refactoring.");
  }

  /*
  private resolveRateConstant(model: BNGLModel, raw: string | undefined): number {
    if (!raw) {
      return 0;
    }
    const fromParams = model.parameters?.[raw];
    if (typeof fromParams === 'number' && !Number.isNaN(fromParams)) {
      return fromParams;
    }
    const numeric = Number(raw);
    if (!Number.isNaN(numeric)) {
      return numeric;
    }
    return 0;
  }
  */
}
