import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { parseBNGLWithANTLR, generateExpandedNetwork } from '../../../packages/engine/src/index.ts';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const bnglPath = path.join(__dirname, '..', 'digest.txt');
const bngl = fs.readFileSync(bnglPath, 'utf8');

const { model: parsed } = parseBNGLWithANTLR(bngl);
console.log('parsed parameters keys', Object.keys(parsed.parameters).length);
console.log('parsed species count', parsed.species.length);
console.log('parsed reactionRules count', parsed.reactionRules.length);
console.log('first 12 reactionRules (reactants->products):');
parsed.reactionRules.slice(0, 12).forEach((r, i) => {
  console.log(i + 1, 'reactants=', JSON.stringify(r.reactants), '=> products=', JSON.stringify(r.products), 'rate=', r.rate);
});

// generateNetwork expects (model, checkCancelled, onProgress)
const expanded = await generateExpandedNetwork(parsed, () => {}, () => {});
console.log('expanded species', expanded.species.length);
console.log('expanded reactions', expanded.reactions.length);
