import fs from 'fs';

let content = fs.readFileSync('packages/engine/src/services/simulation/SimulationLoop.ts', 'utf-8');

// 1. Add propOrder
content = content.replace(
  'const oldPropensityValues = includeInfluence ? new Float64Array(numReactions) : null;',
  'const oldPropensityValues = includeInfluence ? new Float64Array(numReactions) : null;\n      const propOrder = new Int32Array(numReactions);'
);

// 2. Reset propOrder at start of phase
content = content.replace(
  'const shouldEmitPhaseStart = recordThisPhase && (phaseIdx === recordFromPhaseIdx || !(phase.continue ?? false));',
  'for (let j = 0; j < numReactions; j++) {\n          propOrder[j] = j;\n        }\n\n        const shouldEmitPhaseStart = recordThisPhase && (phaseIdx === recordFromPhaseIdx || !(phase.continue ?? false));'
);

// 3. Replace selection loop
const oldLoop = `          // Direct method: select reaction where cumulative sum exceeds r2
          // Use < instead of <= to avoid bias toward last reaction when r2 ≈ aTotal
          for (let i = 0; i < propensities.length; i++) {
            sumA += propensities[i];
            if (r2 < sumA || i === propensities.length - 1) {
              reactionIndex = i;
              break;
            }
          }`;

const newLoop = `          // Direct method: select reaction where cumulative sum exceeds r2
          // Use < instead of <= to avoid bias toward last reaction when r2 ≈ aTotal
          let selectedRxn = propOrder[0];
          for (let j = 0; j < numReactions; j++) {
            const rj = propOrder[j];
            sumA += propensities[rj];
            if (r2 < sumA) {
              selectedRxn = rj;
              break;
            }
            if (j > 0 && propensities[rj] > propensities[propOrder[j - 1]]) {
              const tmp = propOrder[j];
              propOrder[j] = propOrder[j - 1];
              propOrder[j - 1] = tmp;
            }
            selectedRxn = rj;
          }
          reactionIndex = selectedRxn;`;

content = content.replace(oldLoop, newLoop);

fs.writeFileSync('packages/engine/src/services/simulation/SimulationLoop.ts', content);
