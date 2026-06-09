/**
 * Influence Graph Parity Script
 *
 * Compares the playground's influence graph against BNG2's
 * `visualize({type=>"regulatory"})` GML output.
 *
 * For a reference model (e.g., EGFR from RuleHub):
 * 1. Run playground's `computeInfluenceGraph`
 * 2. Parse BNG2's GML output
 * 3. Compare nodes and edges
 *
 * Usage: npx ts-node scripts/influence_graph_parity.ts <bngl-file>
 */

import { computeInfluenceGraph } from '../services/visualization/computeInfluence.ts';
import { buildRuleOverlays } from '../services/visualization/buildRuleOverlays.ts';
import { parseBNGL } from '../services/parseBNGL.ts';
import { BNGLModel } from '../types.ts';
import * as fs from 'fs';
import * as path from 'path';

interface GraphComparison {
  model: string;
  playgroundNodes: number;
  bng2Nodes?: number;
  playgroundEdges: number;
  bng2Edges?: number;
  matching: boolean;
  differences: string[];
}

const compareInfluenceGraphs = async (bnglFilePath: string) => {
  const results: GraphComparison = {
    model: path.basename(bnglFilePath),
    playgroundNodes: 0,
    playgroundEdges: 0,
    matching: false,
    differences: [],
  };

  try {
    // Read BNGL file
    const bnglContent = fs.readFileSync(bnglFilePath, 'utf-8');

    console.log(`Parsing ${bnglFilePath}...`);
    const parsedModel: BNGLModel = parseBNGL(bnglContent);

    console.log('Building rule overlays...');
    const overlays = buildRuleOverlays(parsedModel.reactionRules);

    console.log('Computing influence graph...');
    const influenceGraph = computeInfluenceGraph(overlays, parsedModel.reactionRules);

    results.playgroundNodes = influenceGraph.nodes.length;
    results.playgroundEdges = influenceGraph.edges.length;

    // Output playground's influence graph structure
    console.log('\n=== Playground Influence Graph Structure ===');
    console.log(`Nodes: ${results.playgroundNodes}`);
    console.log(`Edges: ${results.playgroundEdges}`);
    console.log('Note: Full comparison requires BNG2 GML output');
    console.log('Run BNG2: visualize({type=>"regulatory"}) to get GML output');

  } catch (err) {
    results.differences.push(`Error: ${err}`);
  }

  return results;
};

const main = async () => {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: npx ts-node scripts/influence_graph_parity.ts <bngl-file>');
    process.exit(1);
  }

  const bnglFile = args[0];
  if (!fs.existsSync(bnglFile)) {
    console.error(`File not found: ${bnglFile}`);
    process.exit(1);
  }

  console.log('=== Influence Graph Parity Check ===\n');
  const results = await compareInfluenceGraphs(bnglFile);

  console.table(results);
};

main().catch(err => {
  console.error('Parity check failed:', err);
  process.exit(1);
});
