import * as fs from 'fs';

const filePath = 'packages/engine/src/services/simulation/NetworkExpansion.ts';
let code = fs.readFileSync(filePath, 'utf8');

const target = `            while ((callMatch = obsCallRe.exec(fn.expression)) !== null) {
                const obsName = callMatch[1];
                const obs = inputModel.observables.find((o) => o.name === obsName);
                if (obs) {`;

const replacement = `            while ((callMatch = obsCallRe.exec(fn.expression)) !== null) {
                const obsName = callMatch[1];
                let obs: typeof inputModel.observables[0] | undefined;
                for (let i = 0; i < inputModel.observables.length; i++) {
                    if (inputModel.observables[i].name === obsName) {
                        obs = inputModel.observables[i];
                        break;
                    }
                }
                if (obs) {`;

if (code.includes(target)) {
    code = code.replace(target, replacement);
    fs.writeFileSync(filePath, code);
    console.log('Patched!');
} else {
    console.log('Target not found!');
}
