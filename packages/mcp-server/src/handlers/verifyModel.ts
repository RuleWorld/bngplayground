import { ToolArgs, ToolResult } from '../types/index.js';
import { createToolResult, parseModelOrThrow } from '../services/engine.js';
import { structureError } from '../services/errors.js';

export async function handleVerifyModel(args: ToolArgs): Promise<ToolResult<any>> {
  const parsedArgs = (args ?? {}) as any;
  try {
    const engine = await import('@bngplayground/engine') as any;
    const { parseQuery, checkAbstractReachability, boundedReachabilityCheck } = engine;
    const model = parseModelOrThrow(parsedArgs.code);
    const query = parseQuery(parsedArgs.query);

    let result: any = { query: parsedArgs.query, answer: 'unknown', confidence: 'unknown', layerUsed: 0 };

    // Build contact map from model rules for Layer 1 (if available)
    let contactMap = { nodes: [] as any[], edges: [] as any[] };
    try {
      // Use the MCP engine service's buildContactMap if available
      const { buildContactMap } = await import('../services/engine.js');
      if (typeof buildContactMap === 'function') {
        contactMap = buildContactMap(model.reactionRules ?? [], model.moleculeTypes ?? []);
      }
    } catch { /* Contact map builder unavailable, Layer 1 will use empty map */ }

    if (query.kind === 'reachable' || query.kind === 'never') {
      // Try Layer 1: Contact Map Abstract Reachability
      try {
        const contactMapResult = checkAbstractReachability(
          contactMap,
          query.pattern,
          model.moleculeTypes || [],
        );
        if (!contactMapResult.reachable && query.kind === 'reachable') {
          result = { query: parsedArgs.query, answer: false, confidence: 'exact', layerUsed: 1,
            explanation: 'Pattern is provably unreachable: no contact map edges satisfy the binding requirements.' };
        } else if (contactMapResult.reachable && query.kind === 'never') {
          // Layer 1 says possibly reachable -- need Layer 2 to confirm
          result = { query: parsedArgs.query, answer: 'unknown', confidence: 'over_approximate', layerUsed: 1,
            explanation: 'Contact map allows this pattern. Running bounded verification...' };
        }
      } catch { /* Layer 1 unavailable, skip */ }

      // Try Layer 2: Bounded Network Exploration
      if (result.answer === 'unknown') {
        try {
          const bounded = await boundedReachabilityCheck(
            model, query.pattern,
            { maxSpecies: parsedArgs.maxSpecies || 1000 },
          );
          result = {
            query: parsedArgs.query,
            answer: query.kind === 'reachable' ? bounded.reachable : !bounded.reachable,
            confidence: bounded.explorationComplete ? 'exact' : 'bounded',
            bound: parsedArgs.maxSpecies || 1000,
            layerUsed: 2,
            witness: bounded.witness,
            speciesExplored: bounded.speciesExplored,
            explanation: bounded.reachable
              ? `Pattern is reachable. Found matching species: ${bounded.witness?.speciesString}`
              : bounded.explorationComplete
                ? 'Pattern is provably unreachable within the complete state space.'
                : `Pattern not found within ${bounded.speciesExplored} explored species. Increase maxSpecies for more coverage.`,
          };
        } catch { /* Layer 2 failed */ }
      }
    } else if (query.kind === 'fires') {
      try {
        const { checkRuleFires } = await import('@bngplayground/engine');
        const fireResult = checkRuleFires(model, query.ruleName, { maxSpecies: parsedArgs.maxSpecies || 1000 });
        result = { query: parsedArgs.query, answer: fireResult.fires, confidence: 'bounded', layerUsed: 2,
          explanation: fireResult.fires
            ? `Rule "${query.ruleName}" fires (matching species found: ${(fireResult.matchingSpecies ?? []).join(', ')}).`
            : `Rule "${query.ruleName}" does not fire within bounded exploration.` };
      } catch (e: any) { result.explanation = e.message; }
    } else if (query.kind === 'deadlock') {
      try {
        const { checkDeadlock } = await import('@bngplayground/engine');
        const deadlockResult = checkDeadlock(model, { maxSpecies: parsedArgs.maxSpecies || 1000 });
        result = { query: parsedArgs.query, answer: deadlockResult.hasDeadlock, confidence: 'bounded', layerUsed: 2,
          explanation: deadlockResult.hasDeadlock
            ? `Deadlock detected: ${deadlockResult.deadlockState ?? 'unknown state'}`
            : 'No deadlock states found.' };
      } catch (e: any) { result.explanation = e.message; }
    }

    return createToolResult({
      ...result,
      technical: `Verification query: ${parsedArgs.query}. Layer ${result.layerUsed} used. Confidence: ${result.confidence}.`,
      biological: result.explanation,
      strategic: 'Use verification queries to check reachability of complexes, rule firing, and deadlock conditions without simulation.',
    });
  } catch (error: any) {
    return createToolResult(structureError(error instanceof Error ? error : new Error(String(error), { cause: error })));
  }
}
