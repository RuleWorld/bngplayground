import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, '..', 'services', 'bnglService.ts'), 'utf8');
const match = source.match(/const workerScript = `([\s\S]*?)`;/);
if (!match) {
  throw new Error('workerScript not found');
}

let workerScript = match[1];

console.log('has block regex?', workerScript.includes("const regex = new RegExp('begin\\\\s+' + blockName + '([\\\\s\\\\S]*?)end\\\\s+' + blockName, 'gim');"));
console.log(workerScript.slice(0, 300));
const blockStart = workerScript.indexOf('const getBlockContent');
console.log(workerScript.slice(blockStart, blockStart + 200));
console.log(JSON.stringify(workerScript.slice(blockStart, blockStart + 200)));
const targetLine = workerScript.split('\n').find(line => line.includes('new RegExp('));
console.log('targetLine', JSON.stringify(targetLine));
console.log('targetLen', targetLine && targetLine.length);
if (targetLine) {
  const before = targetLine.indexOf('begin');
  const segment = targetLine.slice(before, before + 20);
  console.log('segment', segment);
  console.log('codes', segment.split('').map(ch => ch.charCodeAt(0)));
}

const inject = (needle, replacement) => {
  if (!workerScript.includes(needle)) {
    console.warn('Did not find snippet for injection:', needle);
    return;
  }
  workerScript = workerScript.replace(needle, replacement);
};

inject(
  'model.parameters[parts[0]] = parseFloat(parts[1]);',
  'console.log("assign param", parts[0], parseFloat(parts[1])); model.parameters[parts[0]] = parseFloat(parts[1]);'
);

inject(
  "const paramsContent = getBlockContent('parameters', bnglCode);",
  String.raw`console.log('[parse] code prefix', bnglCode.slice(0, 80)); const regex = new RegExp('begin\\s+parameters([\\s\\S]*?)end\\s+parameters', 'gim'); console.log('[parse] regex source', regex.toString()); const testMatch = regex.exec(bnglCode); console.log('[parse] direct regex match', !!testMatch, testMatch && testMatch[1] && testMatch[1].trim().split('\n')[0]); regex.lastIndex = 0; const paramsContent = getBlockContent('parameters', bnglCode); console.log('[parse] paramsContent raw', JSON.stringify(paramsContent)); console.log('[parse] paramsContent length', paramsContent ? paramsContent.length : null);`
);

inject(
  "const regex = new RegExp('begin\\\\s+' + blockName + '([\\\\s\\\\S]*?)end\\\\s+' + blockName, 'gim');",
  String.raw`const regex = new RegExp('begin\\s+' + blockName + '([\\s\\S]*?)end\\s+' + blockName, 'gim'); console.log('[getBlockContent] block', blockName, 'pattern', regex.toString()); const peek = regex.exec(code); console.log('[getBlockContent] initial match?', !!peek); regex.lastIndex = 0;`
);

inject(
  "return match ? match[1].trim() : '';",
  "if (!match) { console.log('[getBlockContent] worker miss', blockName); } else { console.log('[getBlockContent] worker raw length', blockName, match[1].length); } return match ? match[1].trim() : '';"
);

const selfObj = {
  postMessage: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  console,
};

globalThis.self = selfObj;

const factory = new Function('self', `${workerScript}; return { parseBNGL, simulate };`);
const { parseBNGL, simulate } = factory(selfObj);

const quorum = fs.readFileSync(path.join(__dirname, '..', 'constants.ts'), 'utf8');
const start = quorum.indexOf("id: 'quorum-sensing'");
const snippet = quorum.slice(start, start + 1500);
console.log(snippet.split('\n').slice(0, 40).join('\n'));

const codeMatch = snippet.match(/code: `([\s\S]*?)`,\n {4}tags/);
if (!codeMatch) {
  throw new Error('quorum code not found');
}
const code = codeMatch[1];
console.log('Length', code.length);

const debugBlock = (block) => {
  const regex = new RegExp('begin\\s+' + block + '([\\s\\S]*?)end\\s+' + block, 'gim');
  const matchBlock = regex.exec(code);
  console.log('Block', block, 'found?', !!matchBlock);
  if (matchBlock) {
    console.log(matchBlock[1]);
  }
};

debugBlock('parameters');
debugBlock('molecule types');
debugBlock('seed species');
debugBlock('observables');
debugBlock('reaction rules');

const parsed = parseBNGL(code);
console.log('Params', parsed.parameters);
console.log('Param keys', Object.keys(parsed.parameters));
console.log('Species', parsed.species);
console.log('Reactions', parsed.reactionRules);
console.log(parseBNGL.toString());

const getBlockContent = (blockName, sourceCode) => {
  const regex = new RegExp('begin\\s+' + blockName + '([\\s\\S]*?)end\\s+' + blockName, 'gim');
  const matchBlock = regex.exec(sourceCode);
    if (!matchBlock) { 
      console.log('[getBlockContent] no match inside', blockName); 
    } else { 
      console.log('[getBlockContent] raw length', blockName, matchBlock[1].length); 
    } 
    return matchBlock ? matchBlock[1].trim() : '';
};

const paramsContent = getBlockContent('parameters', code);
paramsContent.split('\n').forEach((line, idx) => {
  const cleaned = line.trim().split('#')[0].trim();
  if (cleaned) {
    const parts = cleaned.split(/\s+/);
    console.log('Line', idx, 'parts', parts);
  } else {
    console.log('Line', idx, 'skipped');
  }
});

const testCode = `begin model
begin parameters
  k 1.0
end parameters
begin molecule types
  A()
end molecule types
begin seed species
  A() 10
end seed species
begin observables
  Molecules A_obs A()
end observables
begin reaction rules
  A() -> 0 k
end reaction rules
end model`;
const parsedTest = parseBNGL(testCode);
console.log('Test Params', parsedTest.parameters);
console.log('Test Species', parsedTest.species);
console.log('Test Reactions', parsedTest.reactionRules);

const res = simulate(parsed, { method: 'ode', t_end: 120, n_steps: 240 });
console.log(res.headers);
console.log(res.data.slice(-3));
