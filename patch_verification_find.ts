import * as fs from 'fs';

const filePath = 'packages/engine/src/services/verification/PatternMatcher.ts';
let code = fs.readFileSync(filePath, 'utf8');

const target = `  for (const patComp of pattern.components) {
    const specComp = species.components.find(
      sc => sc.name === patComp.name
    );`;

const replacement = `  for (const patComp of pattern.components) {
    // ⚡ Bolt: Convert array .find to single pass O(N) array search inside hot loop
    let specComp: typeof species.components[0] | undefined;
    for (let i = 0; i < species.components.length; i++) {
      if (species.components[i].name === patComp.name) {
        specComp = species.components[i];
        break;
      }
    }`;

if (code.includes(target)) {
    code = code.replace(target, replacement);
    fs.writeFileSync(filePath, code);
    console.log('Patched PatternMatcher!');
} else {
    console.log('Target not found in PatternMatcher!');
}
