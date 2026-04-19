
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { parseBNGL } from '../services/parseBNGL';
import { buildContactMap } from '../services/visualization/contactMapBuilder';
import { resolveBNG2Paths } from '../../tools/bng2-paths';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BNG2_PATH = resolveBNG2Paths().bng2pl;
const RULEHUB_ROOT = process.env.RULEHUB_ROOT
  ? path.resolve(process.env.RULEHUB_ROOT)
  : path.resolve(__dirname, '../../../RuleHub');
const RULEHUB_EXAMPLES_DIR = path.join(RULEHUB_ROOT, 'Contributed', 'BNGPlayground_Examples');
const TEMP_DIR = path.resolve(__dirname, '../temp_bng_output');

function collectBnglFiles(dir: string, results: string[] = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectBnglFiles(fullPath, results);
    } else if (entry.isFile() && entry.name.endsWith('.bngl')) {
      results.push(fullPath);
    }
  }
  return results;
}

if (!BNG2_PATH) {
  console.error('BNG2.pl not found. Install bionetgen or set BNG2_PATH.');
  process.exit(1);
}

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR);
}

// Robust GraphML parser for BNG contact maps
export function parseGraphML(content: string) {
  const nodes: { id: string; label: string; color: string; shape?: string; outline?: string; fontSize?: string; fontStyle?: string }[] = [];
  const edges: { source: string; target: string; color?: string; width?: string; sourceArrow?: string; targetArrow?: string }[] = [];

  let pos = 0;
  const stack: any[] = [];

  const getAttr = (tag: string, attr: string) => {
    const match = tag.match(new RegExp(`${attr}="([^"]+)"`));
    return match ? match[1] : null;
  };

  while (pos < content.length) {
    const nextTagStart = content.indexOf('<', pos);
    if (nextTagStart === -1) break;

    const nextTagEnd = content.indexOf('>', nextTagStart);
    if (nextTagEnd === -1) break;

    const tagContent = content.substring(nextTagStart + 1, nextTagEnd);
    const isClosing = tagContent.startsWith('/');
    const tagName = tagContent.split(' ')[0].replace('/', '');

    if (tagName === 'node') {
      if (!isClosing) {
        const id = getAttr(tagContent, 'id');
        if (id) {
          const node = { id, label: '', color: '' };
          nodes.push(node);
          stack.push(node);
        }
      } else {
        stack.pop();
      }
    } else if (tagName === 'edge') {
      if (!isClosing) {
        const source = getAttr(tagContent, 'source');
        const target = getAttr(tagContent, 'target');
        if (source && target) {
          const edgeObj: any = { source, target };
          edges.push(edgeObj);
          stack.push(edgeObj);
        }
      } else {
        stack.pop();
      }
    } else if (tagName === 'y:NodeLabel') {
      if (!isClosing && stack.length > 0) {
        const textEnd = content.indexOf('<', nextTagEnd);
        if (textEnd !== -1) {
          const text = content.substring(nextTagEnd + 1, textEnd).trim();
          stack[stack.length - 1].label = text;
          const fsz = getAttr(tagContent, 'fontSize');
          const fstyle = getAttr(tagContent, 'fontStyle');
          if (fsz) stack[stack.length - 1].fontSize = fsz;
          if (fstyle) stack[stack.length - 1].fontStyle = fstyle;
        }
      }
    } else if (tagName === 'y:Fill') {
      if (!isClosing && stack.length > 0) {
        const color = getAttr(tagContent, 'color');
        if (color) stack[stack.length - 1].color = color;
      }
    } else if (tagName === 'y:Shape') {
      if (!isClosing && stack.length > 0) {
        const type = getAttr(tagContent, 'type');
        if (type) stack[stack.length - 1].shape = type;
      }
    } else if (tagName === 'y:BorderStyle') {
      if (!isClosing && stack.length > 0) {
        const col = getAttr(tagContent, 'color');
        if (col) stack[stack.length - 1].outline = col;
      }
    } else if (tagName === 'y:LineStyle') {
      if (!isClosing && stack.length > 0) {
        const col = getAttr(tagContent, 'color');
        const width = getAttr(tagContent, 'width');
        if (col) stack[stack.length - 1].color = col;
        if (width) stack[stack.length - 1].width = width;
      }
    } else if (tagName === 'y:Arrows') {
      if (!isClosing && stack.length > 0) {
        const sa = getAttr(tagContent, 'source');
        const ta = getAttr(tagContent, 'target');
        if (sa) stack[stack.length - 1].sourceArrow = sa;
        if (ta) stack[stack.length - 1].targetArrow = ta;
      }
    }

    pos = nextTagEnd + 1;
  }

  return { nodes, edges };
}

async function runTest() {
  if (!fs.existsSync(RULEHUB_EXAMPLES_DIR)) {
    throw new Error('RuleHub example directory not found. Set RULEHUB_ROOT before running this script.');
  }
  const files = collectBnglFiles(RULEHUB_EXAMPLES_DIR);
  console.log(`Found ${files.length} models.`);

  const results: any[] = [];

  for (const filePath of files) {
    const modelName = path.basename(filePath, '.bngl');
    const file = path.basename(filePath);

    try {
      // 1. Run BNG2.pl
      const tempFilePath = path.join(TEMP_DIR, file);
      let bnglContentForBNG = fs.readFileSync(filePath, 'utf-8');

      if (!bnglContentForBNG.includes('visualize({type=>"contactmap"})')) {
        if (bnglContentForBNG.includes('end model')) {
          bnglContentForBNG = bnglContentForBNG.replace('end model', 'visualize({type=>"contactmap"})\nend model');
        } else {
          bnglContentForBNG += '\nvisualize({type=>"contactmap"})';
        }
      }

      fs.writeFileSync(tempFilePath, bnglContentForBNG);

      execFileSync('perl', [BNG2_PATH, tempFilePath], { cwd: TEMP_DIR, stdio: 'pipe' });

      // 2. Parse BNG Output
      const dirFiles = fs.readdirSync(TEMP_DIR);
      const gmlFile = dirFiles.find(f => f.startsWith(modelName) && f.endsWith('.graphml') && f.includes('contactmap'));

      if (!gmlFile) {
        results.push({ name: modelName, status: 'NO_GML' });
        continue;
      }

      const gmlPath = path.join(TEMP_DIR, gmlFile);
      const gmlContent = fs.readFileSync(gmlPath, 'utf-8');
      const bngGraph = parseGraphML(gmlContent);

      // Filter BNG Nodes
      const bngMolecules = bngGraph.nodes.filter(n => n.color.toUpperCase() === '#D2D2D2');
      const bngComponents = bngGraph.nodes.filter(n => n.color.toUpperCase() === '#FFFFFF');
      const bngStates = bngGraph.nodes.filter(n => n.color.toUpperCase() === '#FFCC00');

      // Filter BNG Edges
      const stateNodeIds = new Set(bngStates.map(n => n.id));
      const bngBindingEdges = bngGraph.edges.filter(e => !stateNodeIds.has(e.source) && !stateNodeIds.has(e.target));

      // 3. Run Web Sim Logic
      const bnglContent = fs.readFileSync(filePath, 'utf-8');
      const model = parseBNGL(bnglContent);
      const webGraph = buildContactMap(model.reactionRules, model.moleculeTypes);

      // 4. Compare
      const webMolecules = webGraph.nodes.filter(n => n.type === 'molecule');
      const webComponents = webGraph.nodes.filter(n => n.type === 'component');
      // @ts-ignore
      const webStates = webGraph.nodes.filter(n => n.type === 'state');
      const webEdges = webGraph.edges.filter(e => e.interactionType === 'binding');

      const discrepancy = {
        name: modelName,
        status: 'OK',
        webMols: webMolecules.length,
        bngMols: bngMolecules.length,
        webComps: webComponents.length,
        bngComps: bngComponents.length,
        webStates: webStates.length,
        bngStates: bngStates.length,
        webEdges: webEdges.length,
        bngEdges: bngBindingEdges.length,
      };

      if (discrepancy.webMols !== discrepancy.bngMols ||
        discrepancy.webComps !== discrepancy.bngComps ||
        discrepancy.webStates !== discrepancy.bngStates ||
        discrepancy.webEdges !== discrepancy.bngEdges) {
        discrepancy.status = 'MISMATCH';
        console.log(`MISMATCH ${modelName}: Mols ${discrepancy.webMols}/${discrepancy.bngMols}, Comps ${discrepancy.webComps}/${discrepancy.bngComps}, States ${discrepancy.webStates}/${discrepancy.bngStates}, Edges ${discrepancy.webEdges}/${discrepancy.bngEdges}`);
      }

      results.push(discrepancy);

    } catch (error) {
      console.error(`ERROR ${modelName}:`, error);
      results.push({ name: modelName, status: 'ERROR', error: String(error) });
    }
  }

  // Summary
  console.log('\n--- SUMMARY ---');
  const mismatches = results.filter(r => r.status === 'MISMATCH');
  const errors = results.filter(r => r.status === 'ERROR');
  const noGml = results.filter(r => r.status === 'NO_GML');

  console.log(`Total: ${results.length}`);
  console.log(`Matches: ${results.length - mismatches.length - errors.length - noGml.length}`);
  console.log(`Mismatches: ${mismatches.length}`);
  console.log(`Errors: ${errors.length}`);
  console.log(`No GML: ${noGml.length}`);
}

// only execute the brute‑force sweep when run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTest();
}
