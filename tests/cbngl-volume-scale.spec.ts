// @ts-nocheck
/**
 * Vitest test for cBNGL_simple volume scaling
 * Run with: npx vitest run tests/cbngl-volume-scale.spec.ts
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBNGL } from '../services/parseBNGL';
import { NetworkGenerator } from '../src/services/graph/NetworkGenerator';
import { BNGLParser } from '../src/services/graph/core/BNGLParser';
import { GraphCanonicalizer } from '../src/services/graph/core/Canonical';
import type { BNGLModel } from '../types';

const thisDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(thisDir, '..');

const formatSpeciesList = (list: string[]) => (list.length > 0 ? list.join(' + ') : '0');

describe('cBNGL_simple Volume Scaling', () => {
  const modelPath = resolve(projectRoot, 'bng_test_output', 'cBNGL_simple.bngl');
  const netPath = resolve(projectRoot, 'bng_test_output', 'cBNGL_simple.net');
  
  it('should have correct volume scaling for L_R_bind reactions', async () => {
    // Parse BNGL model
    const bnglContent = readFileSync(modelPath, 'utf8');
    const model = parseBNGL(bnglContent) as BNGLModel;
    
    console.log('\n=== Compartments ===');
    if (model.compartments) {
      model.compartments.forEach(c => {
        console.log(`  ${c.name}: dimension=${c.dimension}, size=${c.size}`);
      });
    }
    
    console.log('\n=== Key Parameters ===');
    const params = model.parameters as Record<string, number>;
    console.log(`  kp_LR: ${params['kp_LR']}`);
    console.log(`  vol_EC: ${params['vol_EC']}`);
    console.log(`  vol_EN: ${params['vol_EN']} (should be 0.5)`);
    console.log(`  nEndo: ${params['nEndo']}`);
    
    console.log('\n=== Expected BNG2 Volume Scaling ===');
    console.log(`  EC reactions: 1/vol_EC = 1/20 = 0.05`);
    console.log(`  EN reactions: 1/vol_EN = 1/0.5 = 2.0`);
    
    // Parse seed species using BNGLParser
    const seedSpecies = model.species.map((s: any) => BNGLParser.parseSpeciesGraph(s.name));
    
    // Build parameter map
    const parametersMap = new Map(Object.entries(model.parameters || {}));
    
    // Build rules like bnglWorker does
    const rules = model.reactionRules.flatMap((r: any) => {
      let rate: number;
      try {
        rate = BNGLParser.evaluateExpression(r.rate, parametersMap);
        if (isNaN(rate)) rate = 0;
      } catch {
        rate = 0;
      }
      
      const ruleStr = `${formatSpeciesList(r.reactants)} -> ${formatSpeciesList(r.products)}`;
      const forwardRule = BNGLParser.parseRxnRule(ruleStr, rate);
      forwardRule.name = r.name;

      if (r.isBidirectional) {
        let reverseRate: number;
        try {
          reverseRate = BNGLParser.evaluateExpression(r.reverseRate || r.rate, parametersMap);
          if (isNaN(reverseRate)) reverseRate = 0;
        } catch {
          reverseRate = rate;
        }
        const reverseRuleStr = `${formatSpeciesList(r.products)} -> ${formatSpeciesList(r.reactants)}`;
        const reverseRule = BNGLParser.parseRxnRule(reverseRuleStr, reverseRate);
        reverseRule.name = r.name + '_rev';
        return [forwardRule, reverseRule];
      }
      
      return [forwardRule];
    });
    
    console.log('\n=== Rules Generated ===');
    for (const rule of rules) {
      console.log(`  ${rule.name}: ${rule.reactants.map(r => r.toString()).join(' + ')} -> ${rule.products.map(p => p.toString()).join(' + ')}`);
      if (rule.name === 'L_R_int') {
        console.log('    L_R_int rule pattern details:');
        for (const rp of rule.reactants) {
          for (const mol of rp.molecules) {
            console.log(`      Molecule: ${mol.name}@${mol.compartment}`);
            for (const comp of mol.components) {
              console.log(`        Component: ${comp.name} state=${comp.state} wildcard=${comp.wildcard} edges=${Array.from(comp.edges.entries()).map(([k,v]) => `${k}:${v}`).join(',')}`);
            }
          }
        }
        console.log('    L_R_int product pattern details:');
        for (const pp of rule.products) {
          for (const mol of pp.molecules) {
            console.log(`      Molecule: ${mol.name}@${mol.compartment}`);
            for (const comp of mol.components) {
              console.log(`        Component: ${comp.name} state=${comp.state} wildcard=${comp.wildcard} edges=${Array.from(comp.edges.entries()).map(([k,v]) => `${k}:${v}`).join(',')}`);
            }
          }
        }
      }
    }

    // Create generator with compartments
    const generator = new NetworkGenerator({
      maxSpecies: 1000,
      maxIterations: 100,
      maxAgg: 500,
      maxStoich: 500,
      compartments: model.compartments?.map((c: any) => ({
        name: c.name,
        dimension: c.dimension,
        size: c.size,
        parent: c.parent
      }))
    });

    const result = await generator.generate(seedSpecies, rules);
    const { species, reactions } = result;

    // Print all species for debugging
    console.log('=== Web Simulator Species ===');
    for (let i = 0; i < species.length; i++) {
      console.log(`  ${i + 1}: ${GraphCanonicalizer.canonicalize(species[i].graph)}`);
    }

    console.log(`\nGenerated ${species.length} species, ${reactions.length} reactions\n`);
    
    // Find L_R_bind reactions
    console.log('=== Web Simulator L_R_bind Reactions ===');
    const lrBindReactions = reactions.filter(r => r.name === 'L_R_bind');
    
    for (const rxn of lrBindReactions) {
      const reactants = rxn.reactants.map(idx => GraphCanonicalizer.canonicalize(species[idx].graph)).join(' + ');
      const products = rxn.products.map(idx => GraphCanonicalizer.canonicalize(species[idx].graph)).join(' + ');
      console.log(`  ${reactants} -> ${products}`);
      console.log(`    Rate: ${rxn.rate}`);
      console.log(`    Expression: ${(rxn as any).rateExpression || 'none'}`);
      console.log('');
    }
    
    // Check internalization (L_R_int) reactions
    console.log('=== Web Simulator L_R_int (Internalization) Reactions ===');
    const intReactions = reactions.filter(r => r.name === 'L_R_int');
    console.log(`Found ${intReactions.length} L_R_int reactions (BNG2 has 6)`);
    for (const rxn of intReactions) {
      const reactants = rxn.reactants.map(idx => GraphCanonicalizer.canonicalize(species[idx].graph)).join(' + ');
      const products = rxn.products.map(idx => GraphCanonicalizer.canonicalize(species[idx].graph)).join(' + ');
      console.log(`  ${reactants} -> ${products}`);
      console.log(`    Rate: ${rxn.rate}`);
    }
    
    // Check which species SHOULD match the L_R_int pattern: @PM::R(tf~pY!?)
    console.log('\n=== Species that SHOULD match L_R_int pattern: @PM::R(tf~pY!?) ===');
    console.log('  (Any species with R in PM compartment with tf~pY)');
    for (let i = 0; i < species.length; i++) {
      const canonical = GraphCanonicalizer.canonicalize(species[i].graph);
      // Check if contains R@PM or @PM::R and tf~pY
      if (canonical.includes('@PM') && canonical.includes('R(') && canonical.includes('tf~pY')) {
        console.log(`  ${i + 1}: ${canonical}`);
      }
    }
    
    // BNG2 L_R_int reactions:
    console.log('\nBNG2 L_R_int reactions:');
    console.log('  @PM::L(r!1)@EC.R(l!1,tf~pY) -> @EM::L(r!1)@EN.R(l!1,tf~pY)');
    console.log('  @PM::R(l,tf~pY) -> @EM::R(l,tf~pY)');
    console.log('  @PM::L(r!1)@EC.R(l!1,tf~pY!2).TF(d~Y!2)@CP -> @EM::L(r!1)@EN.R(l!1,tf~pY!2).TF(d~Y!2)@CP');
    console.log('  @PM::L(r!1)@EC.P(r!2)@CP.R(l!1,tf~pY!2) -> @EM::L(r!1)@EN.P(r!2)@CP.R(l!1,tf~pY!2)');
    console.log('  @PM::R(l,tf~pY!1).TF(d~Y!1)@CP -> @EM::R(l,tf~pY!1).TF(d~Y!1)@CP');
    console.log('  @PM::P(r!1)@CP.R(l,tf~pY!1) -> @EM::P(r!1)@CP.R(l,tf~pY!1)');
    
    // Check recycling (R_recyc) reactions
    console.log('\n=== Web Simulator R_recyc (Recycling) Reactions ===');
    const recycleReactions = reactions.filter(r => r.name === 'R_recyc');
    for (const rxn of recycleReactions) {
      const reactants = rxn.reactants.map(idx => GraphCanonicalizer.canonicalize(species[idx].graph)).join(' + ');
      const products = rxn.products.map(idx => GraphCanonicalizer.canonicalize(species[idx].graph)).join(' + ');
      console.log(`  ${reactants} -> ${products}`);
      console.log(`    Rate: ${rxn.rate}`);
    }
    
    // Check L_recyc reactions
    console.log('\n=== Web Simulator L_recyc (Ligand Recycling) Reactions ===');
    const lRecycleReactions = reactions.filter(r => r.name === 'L_recyc');
    for (const rxn of lRecycleReactions) {
      const reactants = rxn.reactants.map(idx => GraphCanonicalizer.canonicalize(species[idx].graph)).join(' + ');
      const products = rxn.products.map(idx => GraphCanonicalizer.canonicalize(species[idx].graph)).join(' + ');
      console.log(`  ${reactants} -> ${products}`);
      console.log(`    Rate: ${rxn.rate}`);
    }
    
    // Print all reaction names
    console.log('\n=== All Reaction Names ===');
    const ruleNames = new Set(reactions.map(r => r.name));
    for (const name of ruleNames) {
      const count = reactions.filter(r => r.name === name).length;
      console.log(`  ${name}: ${count} reactions`);
    }
    
    // Parse BNG2 .net file for comparison
    console.log('=== BNG2 L_R_bind Reactions (from .net file) ===');
    const netContent = readFileSync(netPath, 'utf8');
    const rxnMatch = netContent.match(/begin reactions\n([\s\S]*?)end reactions/);
    if (rxnMatch) {
      const rxnLines = rxnMatch[1].trim().split('\n');
      rxnLines.forEach(line => {
        if (line.includes('L_R_bind')) {
          console.log(`  ${line.trim()}`);
        }
      });
    }
    
    // Check volume scaling
    console.log('\n=== Volume Scale Check ===');
    
    // Find EC reaction (L@EC + R@PM)
    const ecReaction = lrBindReactions.find(r => {
      const s1 = GraphCanonicalizer.canonicalize(species[r.reactants[0]].graph);
      const s2 = GraphCanonicalizer.canonicalize(species[r.reactants[1]].graph);
      return s1.includes('@EC') || s2.includes('@EC');
    });
    
    // Find EN reaction (L@EN + R@EM)
    const enReaction = lrBindReactions.find(r => {
      const s1 = GraphCanonicalizer.canonicalize(species[r.reactants[0]].graph);
      const s2 = GraphCanonicalizer.canonicalize(species[r.reactants[1]].graph);
      return s1.includes('@EN') || s2.includes('@EN');
    });
    
    if (ecReaction) {
      // kp_LR = 0.1, so rate should be 0.1 * 0.05 = 0.005
      console.log(`EC reaction rate: ${ecReaction.rate} (expected: kp_LR * 0.05 = 0.1 * 0.05 = 0.005)`);
    }
    
    if (enReaction) {
      // kp_LR = 0.1, so rate should be 0.1 * 2.0 = 0.2
      console.log(`EN reaction rate: ${enReaction.rate} (expected: kp_LR * 2.0 = 0.1 * 2.0 = 0.2)`);
    }
    
    // Assertions
    expect(species.length).toBeGreaterThan(0);
    expect(reactions.length).toBeGreaterThan(0);
    expect(lrBindReactions.length).toBeGreaterThan(0);
    
    // Volume scale check: EN reactions should have 40x higher scale than EC reactions
    // (2.0 / 0.05 = 40)
    if (ecReaction && enReaction) {
      const ecRate = ecReaction.rate;
      const enRate = enReaction.rate;
      console.log(`\nRatio EN/EC: ${enRate / ecRate} (expected: 40)`);
      
      // The ratio should be approximately 40
      expect(enRate / ecRate).toBeCloseTo(40, 1);
    }
  });
});
