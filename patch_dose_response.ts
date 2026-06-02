import * as fs from 'fs';

const filePath = 'packages/engine/src/services/analysis/DoseResponse.ts';
let code = fs.readFileSync(filePath, 'utf8');

const target = `  // First check model observables for speciesIndices/coefficients.
  const modelObs = model.observables.find((o) => o.name === obsName);
  if (modelObs) {`;

const replacement = `  // First check model observables for speciesIndices/coefficients.
  // ⚡ Bolt: Replace .find with for loop
  let modelObs: typeof model.observables[0] | undefined;
  for (let i = 0; i < model.observables.length; i++) {
    if (model.observables[i].name === obsName) {
      modelObs = model.observables[i];
      break;
    }
  }
  if (modelObs) {`;

if (code.includes(target)) {
    code = code.replace(target, replacement);
    fs.writeFileSync(filePath, code);
    console.log('Patched!');
} else {
    console.log('Target not found!');
}
