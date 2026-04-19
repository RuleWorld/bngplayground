#!/usr/bin/env tsx

console.log('compare_graphml.ts start');

import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';
import { parseGraphML } from '../utils/brute_force_viz';
import { parseBNGL } from '../../services/parseBNGL';
import { buildAtomRuleGraph } from '../../services/visualization/arGraphBuilder';
import { exportArGraphToGraphML } from '../../services/visualization/arGraphExporter';
import { resolveBNG2Paths } from '../../tools/bng2-paths';
import { findRuleHubModelPath } from '../../tools/rulehubLocal';

interface GMLNode {
  id: string;
  label: string;
  color: string;
}

interface GMLEdge {
  source: string;
  target: string;
  color?: string;
}

function getCompatibleModels(): string[] {
  const constantsPath = path.resolve(__dirname, '../../src/constants.ts');
  const content = fs.readFileSync(constantsPath, 'utf8');
  // Extract models between the Set definition start/end in constants.ts
  const match = content.match(/export const BNG2_COMPATIBLE_MODELS = new Set\(\[([\s\S]*?)\]\);/);
  if (!match) return [];
  return match[1]
    .split(',')
    .map(s => s.trim().replace(/['"]/g, ''))
    .filter(s => s && !s.startsWith('//'));
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execFileAsync = promisify(execFile);
const TEMP_DIR = path.resolve(__dirname, '../temp_bng_output');
const BNG2_PATH = resolveBNG2Paths().bng2pl;

if (!BNG2_PATH) {
  console.error('BNG2.pl not found. Install bionetgen or set BNG2_PATH.');
  process.exit(1);
}

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR);
}

function diffArrays(a: string[], b: string[]): { onlyA: string[]; onlyB: string[] } {
  const setA = new Set(a);
  const setB = new Set(b);
  const onlyA: string[] = [];
  const onlyB: string[] = [];
  for (const x of setA) if (!setB.has(x)) onlyA.push(x);
  for (const x of setB) if (!setA.has(x)) onlyB.push(x);
  return { onlyA, onlyB };
}

function compareGraphML(file1: string, file2: string) {
  const c1 = fs.readFileSync(file1, 'utf8');
  const c2 = fs.readFileSync(file2, 'utf8');
  const g1 = parseGraphML(c1);
  const g2 = parseGraphML(c2);

  console.log(`\nComparison of ${path.basename(file1)} (Ref) vs ${path.basename(file2)} (Target):`);
  console.log(`  nodes: ${g1.nodes.length} vs ${g2.nodes.length}`);
  console.log(`  edges: ${g1.edges.length} vs ${g2.edges.length}`);

  const idToLabel1 = new Map(g1.nodes.map((n: GMLNode) => [n.id, n.label]));
  const idToLabel2 = new Map(g2.nodes.map((n: GMLNode) => [n.id, n.label]));

  const labels1 = Array.from(idToLabel1.values()).sort();
  const labels2 = Array.from(idToLabel2.values()).sort();
  
  const { onlyA: nOnly1raw, onlyB: nOnly2raw } = diffArrays(labels1 as string[], labels2 as string[]);
  // ignore blank labels (BNG2 often hides certain atom/rule labels)
  const isMonomer = (lab: string) => lab && !lab.includes('!') && !lab.includes('.');
  const nOnly1 = nOnly1raw.filter(l => l !== '' && !isMonomer(l));
  const nOnly2 = nOnly2raw.filter(l => l !== '' && !isMonomer(l));
  if (nOnly1.length || nOnly2.length) {
    console.log('  node label differences:');
    if (nOnly1.length) console.log('    only in Ref:', nOnly1.join(', '));
    if (nOnly2.length) console.log('    only in Target:', nOnly2.join(', '));
  } else {
    console.log('  ✓ All node labels match.');
  }

  const ekeys1 = g1.edges.map((e: GMLEdge) => `${idToLabel1.get(e.source)}->${idToLabel1.get(e.target)} [${e.color||''}]`).sort();
  const ekeys2 = g2.edges.map((e: GMLEdge) => `${idToLabel2.get(e.source)}->${idToLabel2.get(e.target)} [${e.color||''}]`).sort();
  const { onlyA: eOnly1, onlyB: eOnly2 } = diffArrays(ekeys1, ekeys2);
  if (eOnly1.length || eOnly2.length) {
    console.log('  edge differences (by label):');
    if (eOnly1.length) console.log('    only in Ref:', eOnly1.join(', '));
    if (eOnly2.length) console.log('    only in Target:', eOnly2.join(', '));
  } else {
    console.log('  ✓ All edges match.');
  }
}

async function maybeGenerateGraphML(file: string): Promise<string> {
  if (file.toLowerCase().endsWith('.graphml')) {
    return file;
  }
  // assume BNGL file: run BNG2.pl to produce graphml
  const basename = path.basename(file, '.bngl');
  const tempFile = path.join(TEMP_DIR, `${basename}.bngl`);
  let content = fs.readFileSync(file, 'utf8');
  
  // Strip all existing actions to avoid Perl errors
  content = content.replace(/^(generate_network|simulate|simulate_ode|simulate_ssa|simulate_nf|writeXML|writeSBML|writeMCell|saveConcentrations|resetConcentrations|setParameter|setConcentration|quit|visualize|writeCF|writeMDL|addConcentration|addParameter|setFixed|quit)\s*\(.*?\)/gms, '');
  
  // Add only the visualize command
  if (content.includes('end model')) {
    content = content.replace('end model', 'end model\nvisualize({type=>"regulatory"})');
  } else {
    content += '\nvisualize({type=>"regulatory"})';
  }

  // Clear stale outputs
  const dirFilesOld = fs.readdirSync(TEMP_DIR);
  dirFilesOld.forEach(f => {
    if (f.startsWith(basename) && (f.endsWith('_regulatory.graphml') || f.endsWith('_contactmap.graphml'))) {
      fs.unlinkSync(path.join(TEMP_DIR, f));
    }
  });

  fs.writeFileSync(tempFile, content);
  try {
    await execFileAsync('perl', [BNG2_PATH, tempFile], { cwd: TEMP_DIR });
  } catch (err: any) {
    // If it produced the file, we don't care about subsequent errors
    const dirFiles = fs.readdirSync(TEMP_DIR);
    if (!dirFiles.find(f => f.startsWith(basename) && f.endsWith('.graphml'))) {
      throw err;
    }
  }
  const dirFiles = fs.readdirSync(TEMP_DIR);
  // Prefer regulatory if it exists, otherwise contactmap
  const gmlFile = dirFiles.find(f => f.startsWith(basename) && f.endsWith('_regulatory.graphml')) ||
                  dirFiles.find(f => f.startsWith(basename) && f.endsWith('_contactmap.graphml')) ||
                  dirFiles.find(f => f.startsWith(basename) && f.endsWith('.graphml'));
  if (!gmlFile) throw new Error(`BNG2 did not produce GraphML for ${file}`);
  return path.join(TEMP_DIR, gmlFile);
}

async function maybeGenerateWebGraphML(file: string): Promise<string> {
  if (file.toLowerCase().endsWith('.graphml')) {
    return file;
  }
  const basename = path.basename(file, '.bngl');
  const outFile = path.join(TEMP_DIR, `${basename}_web.graphml`);
  
  const content = fs.readFileSync(file, 'utf8');
  const result = parseBNGL(content);
  // Pass observables and functions to resolve regulatory dependencies
  const graph = buildAtomRuleGraph(result.reactionRules || [], {
    observables: result.observables,
    functions: result.functions,
    includeRateLawDeps: false, // match BNG2.pl output when comparing
    atomization: 'bng2',       // keep whole reactant strings like BNG2.pl
  });
  const xml = exportArGraphToGraphML(graph, {
    showRuleNames: false, // hide rule names to mimic BNG2.pl default
    hideAtomLabels: false, // we'll filter monomer labels in diff instead
  });
  fs.writeFileSync(outFile, xml);
  return outFile;
}

// Silence console if needed, but for now we'll just grep the output
// main entrypoint
(async () => {
  console.log('argv', process.argv);
  const args = process.argv.slice(2);
  
  if (args.includes('--all')) {
    const models = getCompatibleModels();
    console.log(`Running batch comparison for ${models.length} models...`);
    for (const modelName of models) {
      const bnglPath = findRuleHubModelPath(process.cwd(), modelName);
      if (!bnglPath || !fs.existsSync(bnglPath)) {
        console.warn(`Skipping missing model: ${modelName}`);
        continue;
      }
      try {
        console.log(`\n--- ${modelName} ---`);
        const targetFile = await maybeGenerateWebGraphML(bnglPath);
        const refFile = await maybeGenerateGraphML(bnglPath);
        compareGraphML(refFile, targetFile);
      } catch (err: any) {
        console.error(`Error comparing ${modelName}:`, err.message);
      }
    }
    process.exit(0);
  }

  if (args.length === 0) {
    console.error('Usage: tsx scripts/compare_graphml.ts <file.bngl> [--all]');
    process.exit(1);
  }
  
  if (args.length === 1) {
    // compare web vs perl for the same BNGL
    const targetFile = await maybeGenerateWebGraphML(args[0]);
    const refFile = await maybeGenerateGraphML(args[0]);
    compareGraphML(refFile, targetFile);
  } else {
    // compare provided files (bngl or graphml)
    const fileA = await maybeGenerateGraphML(args[0]);
    const fileB = await maybeGenerateWebGraphML(args[1]);
    compareGraphML(fileA, fileB);
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
