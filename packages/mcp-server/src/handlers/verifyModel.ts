import { ToolArgs, ToolResult, VerifyModelResult, ContactMap, MCPErrorResult } from '../types/index.js';
import { createToolResult, parseModelOrThrow, parseArgs, buildContactMap } from '../services/engine.js';
import { structureError } from '../services/errors.js';
import { verifyModelArgsSchema } from '../schemas/index.js';
import {
  parseQuery,
  checkAbstractReachability,
  boundedReachabilityCheck,
  checkRuleFires,
  checkDeadlock,
} from '@bngplayground/engine';

interface VerifierContactNode {
  moleculeType: string;
  component: string;
  states?: string[];
}

interface VerifierContactEdge {
  source: { moleculeType: string; component: string };
  target: { moleculeType: string; component: string };
  ruleNames: string[];
}

interface VerifierContactMap {
  nodes: VerifierContactNode[];
  edges: VerifierContactEdge[];
}

export async function handleVerifyModel(args: ToolArgs): Promise<ToolResult<VerifyModelResult | MCPErrorResult>> {
  try {
    const parsedArgs = parseArgs('verify_model', verifyModelArgsSchema, args);
    const model = parseModelOrThrow(parsedArgs.code);
    const query = parseQuery(parsedArgs.query);

    let result: VerifyModelResult = {
      query: parsedArgs.query,
      answer: 'unknown',
      confidence: 'unknown',
      layerUsed: 0,
      explanation: '',
    };

    // Build contact map from model rules for Layer 1 (if available)
    let contactMap: ContactMap = { nodes: [], edges: [] };
    try {
      contactMap = buildContactMap(model.reactionRules ?? [], model.moleculeTypes ?? []);
    } catch { /* Contact map builder unavailable, Layer 1 will use empty map */ }

    // Translate visualization contact map to the format expected by checkAbstractReachability
    const nodeMap = new Map<string, { moleculeType: string; component: string }>();
    const verifierNodes: VerifierContactNode[] = [];

    for (const node of contactMap.nodes) {
      if (node.type === 'component') {
        const parentNode = contactMap.nodes.find(n => n.id === node.parent);
        if (parentNode && parentNode.type === 'molecule') {
          const info = {
            moleculeType: parentNode.label,
            component: node.label,
          };
          nodeMap.set(node.id, info);
          verifierNodes.push(info);
        }
      }
    }

    const verifierEdges: VerifierContactEdge[] = [];
    for (const edge of contactMap.edges) {
      const sourceInfo = nodeMap.get(edge.from);
      const targetInfo = nodeMap.get(edge.to);
      if (sourceInfo && targetInfo) {
        verifierEdges.push({
          source: sourceInfo,
          target: targetInfo,
          ruleNames: edge.ruleLabels,
        });
      }
    }

    const verifierContactMap: VerifierContactMap = {
      nodes: verifierNodes,
      edges: verifierEdges,
    };

    if (query.kind === 'reachable' || query.kind === 'never') {
      // Try Layer 1: Contact Map Abstract Reachability
      try {
        const contactMapResult = checkAbstractReachability(
          verifierContactMap,
          query.pattern,
          model.moleculeTypes || [],
        );
        if (!contactMapResult.reachable && query.kind === 'reachable') {
          result = {
            query: parsedArgs.query,
            answer: false,
            confidence: 'exact',
            layerUsed: 1,
            explanation: 'Pattern is provably unreachable: no contact map edges satisfy the binding requirements.',
          };
        } else if (contactMapResult.reachable && query.kind === 'never') {
          // Layer 1 says possibly reachable -- need Layer 2 to confirm
          result = {
            query: parsedArgs.query,
            answer: 'unknown',
            confidence: 'over_approximate',
            layerUsed: 1,
            explanation: 'Contact map allows this pattern. Running bounded verification...',
          };
        }
      } catch { /* Layer 1 unavailable, skip */ }

      // Try Layer 2: Bounded Network Exploration
      if (result.answer === 'unknown') {
        try {
          const bounded = await boundedReachabilityCheck(
            model,
            query.pattern,
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
        const fireResult = checkRuleFires(model, query.ruleName, { maxSpecies: parsedArgs.maxSpecies || 1000 });
        result = {
          query: parsedArgs.query,
          answer: fireResult.fires,
          confidence: 'bounded',
          layerUsed: 2,
          explanation: fireResult.fires
            ? `Rule "${query.ruleName}" fires (matching species found: ${(fireResult.matchingSpecies ?? []).join(', ')}).`
            : `Rule "${query.ruleName}" does not fire within bounded exploration.`,
        };
      } catch (e) {
        result.explanation = e instanceof Error ? e.message : String(e);
      }
    } else if (query.kind === 'deadlock') {
      try {
        const deadlockResult = checkDeadlock(model, { maxSpecies: parsedArgs.maxSpecies || 1000 });
        result = {
          query: parsedArgs.query,
          answer: deadlockResult.hasDeadlock,
          confidence: 'bounded',
          layerUsed: 2,
          explanation: deadlockResult.hasDeadlock
            ? `Deadlock detected: ${deadlockResult.deadlockState ?? 'unknown state'}`
            : 'No deadlock states found.',
        };
      } catch (e) {
        result.explanation = e instanceof Error ? e.message : String(e);
      }
    }

    return createToolResult({
      ...result,
      technical: `Verification query: ${parsedArgs.query}. Layer ${result.layerUsed} used. Confidence: ${result.confidence}.`,
      biological: result.explanation,
      strategic: 'Use verification queries to check reachability of complexes, rule firing, and deadlock conditions without simulation.',
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error), { cause: error });
    return createToolResult(structureError(err));
  }
}
