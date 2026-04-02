import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
// The worker implementation lives in bnglWorker.ts — load it directly
const source = fs.readFileSync(path.join(__dirname, '..', 'services', 'bnglWorker.ts'), 'utf8');
// Use the whole file as the worker script
const workerScript = source;

const selfObj = {
  postMessage: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  console,
};

const factory = new Function('self', `${workerScript}; return { parseBNGL, generateNetwork, generateExpandedNetwork, simulate };`);
const { parseBNGL, generateNetwork, generateExpandedNetwork, simulate } = factory(selfObj);

const bngl = fs.readFileSync(path.join(__dirname, '..', 'digest.txt'), 'utf8');
// parseBNGL expects (jobId, bnglCode)
const parsed = parseBNGL(0, bngl);
console.log('parsed parameters keys', Object.keys(parsed.parameters).length);
console.log('parsed species count', parsed.species.length);
console.log('parsed reactionRules count', parsed.reactionRules.length);
console.log('first 12 reactionRules (reactants->products):');
parsed.reactionRules.slice(0, 12).forEach((r, i) => {
  console.log(i + 1, 'reactants=', JSON.stringify(r.reactants), '=> products=', JSON.stringify(r.products), 'rate=', r.rate);
});

// generateNetwork expects (jobId, model)
const expanded = generateNetwork(0, parsed);
console.log('expanded species', expanded.species.length);
console.log('expanded reactions', expanded.reactions.length);
