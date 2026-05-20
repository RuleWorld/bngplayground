import fs from 'fs';

let content = fs.readFileSync('packages/engine/src/services/simulation/SimulationLoop.ts', 'utf-8');

const oldLoop = `        for (let j = 0; j < numReactions; j++) {
          propOrder[j] = j;
        }`;

content = content.replace(oldLoop, '');

const resetLoop = `      let globalTime = 0;
      for (let phaseIdx = 0; phaseIdx < phases.length; phaseIdx++) {
        const phase = phases[phaseIdx];
        const recordThisPhase = (phaseIdx >= recordFromPhaseIdx);

        for (let j = 0; j < numReactions; j++) {
          propOrder[j] = j;
        }`;

const newResetLoop = `      let globalTime = 0;
      for (let phaseIdx = 0; phaseIdx < phases.length; phaseIdx++) {
        const phase = phases[phaseIdx];
        const recordThisPhase = (phaseIdx >= recordFromPhaseIdx);

        for (let j = 0; j < numReactions; j++) {
          propOrder[j] = j;
        }`;

// We just need to ensure propOrder is reset at the start of phase
// Let's manually replace
content = content.replace(
  `        for (let j = 0; j < numReactions; j++) {
          propOrder[j] = j;
        }

        const shouldEmitPhaseStart = recordThisPhase && (phaseIdx === recordFromPhaseIdx || !(phase.continue ?? false));`,
  `        for (let j = 0; j < numReactions; j++) {
          propOrder[j] = j;
        }

        const shouldEmitPhaseStart = recordThisPhase && (phaseIdx === recordFromPhaseIdx || !(phase.continue ?? false));`
);

fs.writeFileSync('packages/engine/src/services/simulation/SimulationLoop.ts', content);
