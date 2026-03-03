
import { parseBNGLStrict } from '../packages/engine/src/parser/BNGLParserWrapper';
import { NetworkGenerator } from '../packages/engine/src/services/graph/NetworkGenerator';
import { BNGLParser } from '../packages/engine/src/services/graph/core/BNGLParser';
import { EnergyService } from '../packages/engine/src/services/graph/core/EnergyService';
import { RxnRule } from '../packages/engine/src/services/graph/core/RxnRule';
import * as fs from 'fs';
import * as path from 'path';
import { describe, test, expect, beforeAll } from 'vitest';

describe('MWC Energy Model Parity', () => {
  const mwcBnglPath = path.join(__dirname, '../public/models/mwc.bngl');
  let mwcContent: string;

  beforeAll(() => {
    mwcContent = fs.readFileSync(mwcBnglPath, 'utf-8');
    // Sanitize: comment out setOption which might not be supported by current grammar in this position
    mwcContent = mwcContent.replace(/setOption/g, '#setOption');
  });

  test('Should parse MWC model with energy patterns', () => {
    const model = parseBNGLStrict(mwcContent);
    expect(model.energyPatterns).toBeDefined();
    expect(model.energyPatterns?.length).toBeGreaterThan(0);
    
    // Check specific pattern
    const htPattern = model.energyPatterns?.find(p => p.pattern.includes('H(m~T)'));
    expect(htPattern).toBeDefined();
    expect(htPattern?.expression).toContain('-ln(K_RT)');
  });

  test('Should calculate correct species energies', () => {
    const model = parseBNGLStrict(mwcContent);
    const energyService = new EnergyService(model.energyPatterns!);
    
    // Evaluate K_RT
    // K_RT = 1.4e3
    const K_RT = 1.4e3;
    const expectedEnergyHT = -Math.log(K_RT); // -ln(K_RT)

    // Construct H(m~T) species graph
    const htGraph = BNGLParser.parseSpeciesGraph('H(m~T,b,g,g,g,g)');
    const energyHT = energyService.calculateEnergy(htGraph);
    
    expect(energyHT).toBeCloseTo(expectedEnergyHT, 4);

    // H(m~R) should be 0 (no pattern)
    const hrGraph = BNGLParser.parseSpeciesGraph('H(m~R,b,g,g,g,g)');
    const energyHR = energyService.calculateEnergy(hrGraph);
    expect(energyHR).toBeCloseTo(0, 4);
  });

  test('Should generate correct Arrhenius rates for R_RT', async () => {
    const model = parseBNGLStrict(mwcContent);
    
    // Resolve parameters
    const paramMap = new Map<string, number>();
    for (const [key, val] of Object.entries(model.parameters)) {
        paramMap.set(key, Number(val));
    }
    // Also resolve dependent params like K_RT (if they depend on other params, but here they are constants)
    // Actually evaluateExpression handles dependencies if we passed them, 
    // but here K_RT is a simple number in the file: "K_RT 1.4e3"
    // Wait, row 19: "K_RT 1.4e3". It's static.

    const generator = new NetworkGenerator({
      energyPatterns: model.energyPatterns,
      parameters: paramMap
    });

    // R_RT: H(m~R) <-> H(m~T) Arrhenius(phi, EA)
    // phi = 0.5
    // EA = -10
    const phi = 0.5;
    const EA = -10;
    const K_RT = 1.4e3;
    
    // Params from file
    paramMap.set('phi', 0.5);
    paramMap.set('EA', -10);
    paramMap.set('K_RT', 1.4e3);

    // Seed Species
    const seeds = model.species.map(s => BNGLParser.parseSpeciesGraph(s.name));

    // Manual expansion of R_RT
    // Forward: H(m~R) -> H(m~T)
    // Delta G = E(Prod) - E(React) = E(H_T) - E(H_R) = -ln(K_RT) - 0 = -7.244
    const deltaG = -Math.log(K_RT);
    const exponent = -(EA + phi * deltaG); 
    const expectedForwardRate = Math.exp(exponent);

    // H(m~T) -> H(m~R)
    // Reverse Phi = 1 - phi = 0.5
    // Delta G_rev = E(React) - E(Prod) = 0 - (-ln(K_RT)) = ln(K_RT) = 7.244
    // exponent = -(EA + (1-phi) * DeltaG_rev) = -(-10 + 0.5 * 7.244) = -(-6.378) = 6.378
    const expectedReverseRate = Math.exp(6.378);
    
    // Convert BNGLReaction/ReactionRule to RxnRule class instances
    const rules: RxnRule[] = [];
    
    for (const r of model.reactionRules) {
        const reactants = r.reactants.map(s => BNGLParser.parseSpeciesGraph(s));
        const products = r.products.map(s => BNGLParser.parseSpeciesGraph(s));
        
        // Forward
        const kParsed = parseFloat(r.rate);
        const k = isNaN(kParsed) ? 0 : kParsed;
        
        const fwd = new RxnRule(r.name || 'rule', reactants, products, k);
        fwd.isArrhenius = r.isArrhenius || false;
        fwd.arrheniusPhi = r.arrheniusPhi;
        fwd.arrheniusEact = r.arrheniusEact;
        fwd.rateExpression = r.rateExpression;
        
        rules.push(fwd);
        
        // Reverse
        if (r.isBidirectional) {
             const revReactants = r.products.map(s => BNGLParser.parseSpeciesGraph(s));
             const revProducts = r.reactants.map(s => BNGLParser.parseSpeciesGraph(s));
             
             // Reverse rate usually usually same as forward if implicit, 
             // but here we just care about Arrhenius. 
             // BNG parser might not populate reverseRate if it's implicitly same.
             const kRevParsed = parseFloat(r.reverseRate || r.rate);
             const kRev = isNaN(kRevParsed) ? 0 : kRevParsed;
             
             const rev = new RxnRule((r.name || 'rule') + '_rev', revReactants, revProducts, kRev);
             // Important: Set rateExpression so baseRate defaults to 1 if k=0
             rev.rateExpression = r.reverseRate || r.rateExpression || r.rate;
             
             if (r.isArrhenius) {
                 rev.isArrhenius = true;
                 // Replicate NetworkExpansion logic: 1 - phi
                 rev.arrheniusPhi = r.arrheniusPhi ? `1 - (${r.arrheniusPhi})` : '1';
                 rev.arrheniusEact = r.arrheniusEact;
             }
             rules.push(rev);
        }
    }

    // We can run the generator for 1 step to see generated reactions
    const result = await generator.generate(seeds, rules, () => {});
    
    // Find reactions corresponding to R_RT
    // R_RT is rule index 0 (usually)
    // Actually search by rule name
    const r_rt_actions = result.reactions.filter(r => r.name?.includes('R_RT'));
    
    expect(r_rt_actions.length).toBeGreaterThan(0);

    // Forward
    const fwd = r_rt_actions.find(r => r.reactants[0] === result.species.find(s => s.toString().includes('m~R'))?.index);
    expect(fwd).toBeDefined();
    if (fwd) {
        // Effective rate = k_f * multiplicity (1 here)
        expect(Number(fwd.rate)).toBeCloseTo(expectedForwardRate, 1); // loose delta due to float exp
    }

    // Reverse
    const rev = r_rt_actions.find(r => r.reactants[0] === result.species.find(s => s.toString().includes('m~T'))?.index);
    expect(rev).toBeDefined();
    if (rev) {
        expect(Number(rev.rate)).toBeCloseTo(expectedReverseRate, 0);
    }
  });
});
