#!/usr/bin/env tsx
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildAtomRuleGraph } from '../services/visualization/arGraphBuilder';
import { exportArGraphToGraphML, ExportArGraphOptions } from '../services/visualization/arGraphExporter';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock types if needed, but we just need the ReactionRule structure
// and the arGraphBuilder.

// Since we are in a node environment, we need to mock the parser or use it.
// Actually, let's use the parser to get the rules first.
import { parseBNGL } from '../services/parseBNGL';

async function generate(bnglFile: string, outFile: string) {
    const content = fs.readFileSync(bnglFile, 'utf8');
    const result = parseBNGL(content);
    const graph = buildAtomRuleGraph(result.reactionRules, {
        includeRateLawDeps: false,
        atomization: 'bng2',
    });
    // by default we hide rule names and use BNG2 styling
    const xml = exportArGraphToGraphML(graph, { showRuleNames: false });
    fs.writeFileSync(outFile, xml);
}

if (process.argv[2] && process.argv[3]) {
    generate(process.argv[2], process.argv[3]).catch(console.error);
} else {
    console.log("Usage: tsx generate_web_ar_graphml.ts <input.bngl> <output.graphml>");
}
