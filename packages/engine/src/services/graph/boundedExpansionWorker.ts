/**
 * Child-process entry point for {@link expandBounded}.
 *
 * The network expander polls its cancellation callback cooperatively, between
 * iterations and between rule applications. That is enough to stop an
 * expansion that keeps *producing* iterations, but it cannot stop one that is
 * stuck applying a single rule to a combinatorial explosion of match
 * candidates: no callback is reached, so a deadline built on that callback
 * never fires. The only reliable way to bound such a run is to give it a
 * process that can be killed.
 *
 * This file is the process that gets killed. It is not imported by the gate
 * directly — `boundedExpansion.ts` spawns it.
 *
 * Protocol: the model path and a result path arrive in argv. The result is
 * written as JSON to the result path rather than to stdout, because the engine
 * and the parser both write progress and diagnostics to stdout and those would
 * otherwise be indistinguishable from the payload.
 */
import { readFileSync, writeFileSync } from 'node:fs';

import { parseBNGLWithANTLR } from '../../parser/BNGLParserWrapper';
import { generateExpandedNetwork } from '../simulation/NetworkExpansion';
import type { BoundedReaction } from './boundedExpansion';
import type { BNGLModel } from '../../types';

interface WorkerOk {
  status: 'ok';
  species: string[];
  reactions: BoundedReaction[];
  durationMs: number;
}

interface WorkerFailure {
  status: 'parse-error' | 'error';
  error: string;
  durationMs: number;
}

type WorkerResult = WorkerOk | WorkerFailure;

const [, , bnglPath, resultPath] = process.argv;

if (!bnglPath || !resultPath) {
  throw new Error('boundedExpansionWorker: expected <bnglPath> <resultPath>');
}

const started = Date.now();
let result: WorkerResult;

try {
  const parsed = parseBNGLWithANTLR(readFileSync(bnglPath, 'utf8'));
  if (!parsed.success) {
    result = {
      status: 'parse-error',
      error: parsed.errors?.[0]?.message ?? 'failed',
      durationMs: Date.now() - started,
    };
  } else {
    // No cooperative deadline here on purpose: the supervising process owns the
    // real bound and enforces it by killing this process. Both callbacks are
    // therefore no-ops — the child is bounded from outside, not from within.
    // `name` is optional on the model types, but the expander always assigns
    // one. An unnamed species would silently corrupt the shape comparison
    // downstream, so it is reported rather than papered over.
    const namesOf = (items: Array<{ name?: string }>, kind: string): string[] =>
      items.map((item, index) => {
        if (item.name === undefined) throw new Error(`expanded ${kind} at index ${index} has no name`);
        return item.name;
      });
    const expanded = await generateExpandedNetwork(parsed.model as BNGLModel, () => {}, () => {});
    result = {
      status: 'ok',
      species: namesOf(expanded.species ?? [], 'species'),
      reactions: (expanded.reactions ?? []).map((r) => ({
        reactants: r.reactants,
        products: r.products,
      })),
      durationMs: Date.now() - started,
    };
  }
} catch (err) {
  result = {
    status: 'error',
    error: err instanceof Error ? err.message : String(err),
    durationMs: Date.now() - started,
  };
}

writeFileSync(resultPath, JSON.stringify(result));
