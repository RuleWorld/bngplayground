import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

// Import engine modules via relative paths
import { parseBNGLStrict } from '../packages/engine/src/parser/BNGLParserWrapper';
import { generateExpandedNetwork } from '../packages/engine/src/services/simulation/NetworkExpansion';
import { simulate } from '../packages/engine/src/services/simulation/SimulationLoop';
import { computeFIM } from '../packages/engine/src/services/analysis/FisherInformationMatrix';
import { analyzeReactionInformation } from '../packages/engine/src/services/analysis/ReactionInformationTheory';

// Polyfill require and __dirname for CVODE WASM module compatibility
const require = createRequire(import.meta.url);
if (typeof globalThis.require === 'undefined') {
  (globalThis as any).require = require;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Also polyfill __dirname and __filename globally for the WASM loader
if (typeof globalThis.__dirname === 'undefined') {
  const publicDir = path.resolve(__dirname, '..', 'public');
  (globalThis as any).__dirname = publicDir;
  (globalThis as any).filename = path.join(publicDir, 'cvode.wasm');
}

// Model representing DNA damage sensing and repair pathway (ATM-CHK2-p53 axis)
const modelCode = `
begin model
begin parameters
    # DNA damage sensing and repair pathway (ATM-CHK2-p53 axis)
    
    # Damage induction
    k_damage 0.1       # DNA lesion formation (e.g. UV,ROS)
    
    # Sensing & Signaling
    k_sense 1.5        # MRN complex sensing lesions
    k_atm_act 10.0      # ATM activation by MRN/DNA complexes
    k_chk2_phos 10.0    # Chk2 phosphorylation by active ATM
    
    # Effector activation
    k_repair_rec 100.0   # Recruitment of PARP/Ligase complexes
    k_repair_act 10.0   # Actual repair execution
    
    # Recovery
    k_reset 0.05       # Phosphatase relay
    k_turnover 0.02    # Basal protein degradation
    
    # Initials
    DNA_intact 100
    MRN_tot 50          # Sensor complex
    ATM_tot 100         # Master kinase
    Chk2_tot 150        # Transducer kinase
    Repair_tot 80       # Effector machinery
end parameters

begin molecule types
    DNA(state~intact~damaged)
    MRN(state~free~bound)
    ATM(state~inactive~active)
    Chk2(state~unphos~phos)
    Repair(state~inactive~active)
end molecule types

begin seed species
    DNA(state~intact) DNA_intact
    MRN(state~free) MRN_tot
    ATM(state~inactive) ATM_tot
    Chk2(state~unphos) Chk2_tot
    Repair(state~inactive) Repair_tot
end seed species

begin observables
    Molecules DamagedDNA DNA(state~damaged)
    Molecules ActiveATM ATM(state~active)
    Molecules PhosChk2 Chk2(state~phos)
    Molecules ActiveRepair Repair(state~active)
    Molecules IntactDNA DNA(state~intact)
end observables

begin reaction rules
    # 1. Damage induction
    Damage: DNA(state~intact) -> DNA(state~damaged) k_damage
    
    # 2. MRN complex sensing lesions
    Sense: MRN(state~free) + DNA(state~damaged) -> MRN(state~bound) + DNA(state~damaged) k_sense
    
    # 3. ATM activation by active MRN/DNA complexes
    ATM_Act: ATM(state~inactive) + MRN(state~bound) -> ATM(state~active) + MRN(state~bound) k_atm_act
    
    # 4. Chk2 phosphorylation by active ATM
    Chk2_Phos: Chk2(state~unphos) + ATM(state~active) -> Chk2(state~phos) + ATM(state~active) k_chk2_phos
    
    # 5. Recruitment of repair complexes by phosphorylated Chk2
    Repair_Rec: Repair(state~inactive) + Chk2(state~phos) -> Repair(state~active) + Chk2(state~phos) k_repair_rec
    
    # 6. Actual repair execution by active repair machinery
    Repair_Exec: DNA(state~damaged) + Repair(state~active) -> DNA(state~intact) + Repair(state~active) k_repair_act
    
    # 7. Resets/Deactivations (Phosphatase relay)
    MRN_Reset: MRN(state~bound) -> MRN(state~free) k_reset
    ATM_Reset: ATM(state~active) -> ATM(state~inactive) k_reset
    Chk2_Reset: Chk2(state~phos) -> Chk2(state~unphos) k_reset
    Repair_Reset: Repair(state~active) -> Repair(state~inactive) k_reset
end reaction rules
end model
`;

async function main() {
  console.log("================================================================");
  console.log("  INFORMATION-GUIDED IDENTIFIABILITY DIAGNOSTIC WORKFLOW");
  console.log("================================================================");

  // 1. Parse model
  console.log("\n[1/5] Parsing model code...");
  const parsed = parseBNGLStrict(modelCode);
  console.log(`Model parsed successfully: ${parsed.reactionRules.length} rules, ${parsed.species.length} seed species.`);

  // 2. Expand network
  console.log("\n[2/5] Expanding reaction network (rules -> reactions & species)...");
  const expanded = await generateExpandedNetwork(parsed, () => {}, () => {});
  console.log(`Network expanded: ${expanded.species.length} species, ${expanded.reactions.length} reactions.`);

  // Print reaction mapping
  console.log("\nReaction Rule Mapping:");
  expanded.reactions.forEach((r, idx) => {
    console.log(`  Reaction R${idx + 1}: ${r.name || 'unnamed'} (${r.reactants.join(' + ')} -> ${r.products.join(' + ')}) [rate: ${r.rate}, rateConstant: ${r.rateConstant}]`);
  });

  // 3. Compute Deterministic FIM
  console.log("\n[3/5] Computing Deterministic Fisher Information Matrix (FIM)...");
  
  const parametersToAnalyze = ['k_damage', 'k_sense', 'k_atm_act', 'k_chk2_phos', 'k_repair_rec', 'k_repair_act', 'k_reset'];
  const baseParameters: Record<string, number> = {
    k_damage: 0.1,
    k_sense: 1.5,
    k_atm_act: 10.0,
    k_chk2_phos: 10.0,
    k_repair_rec: 100.0,
    k_repair_act: 10.0,
    k_reset: 0.05,
  };

  const simulateCallback = async (overrides: Record<string, number>) => {
    const overriddenReactions = expanded.reactions.map(r => {
      let rateConstant = r.rateConstant;
      if (typeof r.rate === 'string' && overrides[r.rate] !== undefined) {
        rateConstant = overrides[r.rate];
      }
      return {
        ...r,
        rateConstant,
      };
    });

    const modelToSimulate = {
      ...expanded,
      parameters: {
        ...expanded.parameters,
        ...overrides,
      },
      reactions: overriddenReactions,
    };

    const odeResults = await simulate(0, modelToSimulate, {
      method: 'ode',
      t_end: 100,
      n_steps: 50,
      solver: 'cvode',
      atol: 1e-8,
      rtol: 1e-8,
    } as any, { checkCancelled: () => {}, postMessage: () => {} });

    return { data: odeResults.data };
  };

  const fimResult = await computeFIM({
    simulate: simulateCallback,
    parameters: baseParameters,
    parameterNames: parametersToAnalyze,
    allTimepoints: true,
    logParameters: true,
  });

  console.log("\nFIM Eigenvalues (Sloppiness Spectrum):");
  fimResult.eigenvalues.forEach((val, i) => {
    console.log(`  λ${i + 1}: ${val.toExponential(4)}`);
  });
  console.log(`FIM Condition Number: ${fimResult.conditionNumber.toExponential(4)}`);

  console.log("\nIdentifiability Classification:");
  console.log(`  Identifiable: [${fimResult.identifiableParams.join(', ')}]`);
  console.log(`  Unidentifiable (Sloppy): [${fimResult.unidentifiableParams.join(', ')}]`);

  console.log("\nVariance Inflation Factors (VIF - Collinearity):");
  parametersToAnalyze.forEach((name, idx) => {
    const vif = fimResult.vif[idx];
    console.log(`  ${name}: ${vif === Infinity ? 'Infinity' : vif.toFixed(2)} ${vif > 10 ? '(HIGH COLLINEARITY)' : '(OK)'}`);
  });

  // 4. Run Stochastic SSA & Compute Firing Log
  console.log("\n[4/5] Running Stochastic (SSA) Gillespie Simulation...");
  const ssaResults = await simulate(0, expanded, {
    method: 'ssa',
    t_end: 200,
    n_steps: 1000,
    seed: 42,
    recordFirings: true,
    maxFiringEvents: 100000,
  } as any, { checkCancelled: () => {}, postMessage: () => {} });

  const firingLog = ssaResults.firingLog || [];
  console.log(`Stochastic simulation completed. Recorded ${firingLog.length} firing events.`);

  if (firingLog.length === 0) {
    console.error("Error: Firing log is empty. Check if stochastic simulation options are correct.");
    return;
  }

  // 5. Compute Information Theory Metrics
  console.log("\n[5/5] Performing Information Theoretic Analysis...");
  const itResult = analyzeReactionInformation({
    firingLog: firingLog,
    nReactions: expanded.reactions.length,
    nShuffles: 100,
    historyLength: 3,
  });

  console.log("\nPer-Reaction Shannon Entropy (Firing Activity):");
  itResult.entropy.sort((a, b) => b.entropy - a.entropy).forEach((ent) => {
    const rxn = expanded.reactions[ent.reactionIndex];
    console.log(`  Reaction R${ent.reactionIndex + 1} (${rxn.name}): Entropy = ${ent.entropy.toFixed(4)} bits`);
  });

  console.log("\nTop Causal Transfer Entropy (Directed Information Flow):");
  const activeTE = itResult.transferEntropy.filter(te => te.pValue < 0.05);
  if (activeTE.length > 0) {
    activeTE.sort((a, b) => b.transferEntropy - a.transferEntropy).slice(0, 10).forEach((te) => {
      const srcRxn = expanded.reactions[te.source];
      const tgtRxn = expanded.reactions[te.target];
      console.log(`  R${te.source + 1} (${srcRxn.name}) → R${te.target + 1} (${tgtRxn.name}): TE = ${te.transferEntropy.toFixed(4)} bits (pValue = ${te.pValue.toFixed(3)}, netFlow = ${te.netInformationFlow.toFixed(4)})`);
    });
  } else {
    console.log("  No statistically significant Transfer Entropy (pValue < 0.05) detected.");
  }

  // Correlation & Cross-Analysis
  console.log("\n================================================================");
  console.log("  CROSS-METRIC PARITY REPORT & INTERPRETATION");
  console.log("================================================================");
  
  console.log("\n1. Mapping Sloppiness to Activity:");
  console.log("   We correlate Shannon Entropy in stochastic firings with unidentifiability in FIM.");
  
  parametersToAnalyze.forEach((paramName) => {
    const isIdentifiable = fimResult.identifiableParams.includes(paramName);
    const shortName = paramName.replace('k_', '').toLowerCase();
    
    // Find all reactions whose rule names match the parameter name
    const matchingReactionIndices: number[] = [];
    expanded.reactions.forEach((r, idx) => {
      const rName = (r.name || '').toLowerCase();
      if (rName.includes(shortName) || (shortName === 'reset' && rName.includes('reset'))) {
        matchingReactionIndices.push(idx);
      }
    });

    console.log(`   - Parameter ${paramName}:`);
    console.log(`     Deterministic FIM: ${isIdentifiable ? 'IDENTIFIABLE' : 'UNIDENTIFIABLE (SLOPPY)'}`);
    if (matchingReactionIndices.length > 0) {
      matchingReactionIndices.forEach((rxnIdx) => {
        const rxn = expanded.reactions[rxnIdx];
        const entInfo = itResult.entropy.find(e => e.reactionIndex === rxnIdx);
        const entropyVal = entInfo ? entInfo.entropy : 0;
        console.log(`     Stochastic Entropy for R${rxnIdx + 1} (${rxn.name}): ${entropyVal.toFixed(4)} bits`);
      });
    } else {
      console.log(`     Stochastic Entropy: N/A (no direct reaction mapping)`);
    }
  });

  console.log("\n2. Key Insights for Systems Biologists:");
  console.log("   - Consistency: Sloppy parameters correspond to low-entropy or");
  console.log("     highly-collinear reaction channels where the system contains redundant pathways or feedback loops.");
  console.log("   - Information Bottlenecks: Higher Transfer Entropy indicates");
  console.log("     high-flux signaling highways that are crucial for parameter estimation.");
  console.log("   - Experimental Design Recommendation: To resolve the sloppiness, design perturbation experiments");
  console.log("     targeting reactions with high collinearity or low entropy (e.g. knockouts or pulse-chase stimuli).");
  console.log("================================================================");
}

main().catch((err) => {
  console.error("Workflow failed with error:", err);
});
