import * as fs from 'fs';

const filePath = 'packages/engine/src/services/simulation/SimulationLoop.ts';
let code = fs.readFileSync(filePath, 'utf8');

const target = `              const rateTranscribeFn = (model.functions || []).find((f) => f.name === 'rate_transcribe');`;

const replacement = `              // ⚡ Bolt: Replace .find with for loop in inner loop
              let rateTranscribeFn: typeof model.functions[0] | undefined;
              if (model.functions) {
                for (let i = 0; i < model.functions.length; i++) {
                  if (model.functions[i].name === 'rate_transcribe') {
                    rateTranscribeFn = model.functions[i];
                    break;
                  }
                }
              }`;

if (code.includes(target)) {
    code = code.replace(target, replacement);
    fs.writeFileSync(filePath, code);
    console.log('Patched!');
} else {
    console.log('Target not found!');
}
