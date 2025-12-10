
import fs from 'fs';
import path from 'path';
import { parseBNGL } from '../services/parseBNGL';
import { NetworkGenerator } from '../src/services/graph/NetworkGenerator';
import { BNGLParser } from '../src/services/graph/core/BNGLParser';

const BNGL_PATH = path.join(process.cwd(), 'published-models/complex-models/Barua_2007.bngl');
const NET_PATH = path.join(process.cwd(), 'Barua_2007.net');

async function run() {
  console.log('--- Comparing Barua_2007 Species ---');

  // 1. Read Reference Species from .net file
  if (!fs.existsSync(NET_PATH)) {
    console.error('Reference file Barua_2007.net not found!');
    process.exit(1);
  }

  const netContent = fs.readFileSync(NET_PATH, 'utf-8');
  const referenceSpecies = new Set<string>();

  const speciesBlockMatch = netContent.match(/begin species([\s\S]*?)end species/);
  if (speciesBlockMatch) {
    const lines = speciesBlockMatch[1].trim().split('\n');
    for (const line of lines) {
      // Format: index species_str concentration
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2) {
        // parts[0] is index, parts[1] is species string
        referenceSpecies.add(parts[1]);
      }
    }
  }
  console.log(`Reference Species Count: ${referenceSpecies.size}`);

  // 2. Generate Species using Web Simulator
  console.log('Parsing BNGL...');
  const bnglContent = fs.readFileSync(BNGL_PATH, 'utf-8');
  const model = parseBNGL(bnglContent);

  console.log('Generating Network...');
  const generator = new NetworkGenerator({
    maxSpecies: 5000,
    maxReactions: 10000,
    maxIterations: 100,
    maxAgg: 100,
    maxStoich: 500
  });

  const seedSpecies = model.species.map(s => BNGLParser.parseSpeciesGraph(s.name));

  // Need to parse rules properly with evaluated rates
  const parametersMap = new Map(Object.entries(model.parameters).map(([k, v]) => [k, Number(v)]));

  const rules = model.reactionRules.flatMap(r => {
    // For network gen, rate values don't matter much effectively for reachability, 
    // but we need valid objects.
    let rate = 0; // default
    try { rate = BNGLParser.evaluateExpression(r.rate, parametersMap); } catch { }
    if (Number.isNaN(rate)) rate = 0;

    const formatList = (list: string[]) => list.length > 0 ? list.join(' + ') : '0';
    const ruleStr = `${formatList(r.reactants)} -> ${formatList(r.products)}`;

    try {
      const forwardRule = BNGLParser.parseRxnRule(ruleStr, rate);
      if (r.constraints && r.constraints.length > 0) {
        forwardRule.applyConstraints(r.constraints, (s) => BNGLParser.parseSpeciesGraph(s));
      }

      const res = [forwardRule];

      if (r.isBidirectional) {
        let revRate = 0;
        try { revRate = BNGLParser.evaluateExpression(r.reverseRate || '0', parametersMap); } catch { }
        if (Number.isNaN(revRate)) revRate = 0;

        const revRuleStr = `${formatList(r.products)} -> ${formatList(r.reactants)}`;
        const revRule = BNGLParser.parseRxnRule(revRuleStr, revRate);
        // Note: Constraints usually apply to the forward direction in BNGL syntax unless specified?
        // In "ExcludeReactants(2,R)", it applies to the rule as written.
        // If bidirectional, BNG syntax: reactants <-> products ... exclude_reactants(2,R)
        // This usually applies to the forward direction reactants.
        // Does it apply to reverse?
        // "exclude_reactants" applies to the *reactant list of the rule*.
        // For reverse rule, the products are reactants.
        // Does the constraint implicitly flip?
        // In BNG2 core, constraints are properties of the specific transformation rule.
        // If checking Barua_2007.bngl:
        // R(Y2~P) + S(CSH2) <-> R... exclude_reactants(2,R)
        // This constraint is on the Forward reaction (R+S).
        // Does it apply to Reverse (R.S -> R + S)?
        // Reverse is unimolecular dissociation. ExcludeReactants(2,R) would require 2 reactants.
        // So it's ignored for reverse.
        res.push(revRule);
      }
      return res;
    } catch (e) {
      console.warn('Failed to parse rule:', ruleStr, e);
      return [];
    }
  });

  const result = await generator.generate(seedSpecies, rules, () => { });
  console.log(`Web Generated Species Count: ${result.species.length}`);

  // 3. Compare
  const webSpeciesStrs = new Set(result.species.map(s => s.canonicalString));

  const extraSpecies = [];
  const missingSpecies = [];

  for (const s of webSpeciesStrs) {
    if (!referenceSpecies.has(s)) {
      extraSpecies.push(s);
    }
  }

  for (const s of referenceSpecies) {
    if (!webSpeciesStrs.has(s)) {
      missingSpecies.push(s);
    }
  }

  console.log(`Extra Species: ${extraSpecies.length}`);
  console.log(`Missing Species: ${missingSpecies.length}`);

  if (extraSpecies.length > 0) {
    console.log('\n--- Writing Extra Species to extra_species.txt ---');
    fs.writeFileSync(path.join(process.cwd(), 'extra_species.txt'), extraSpecies.join('\n'));
    // Print first few for quick check
    extraSpecies.slice(0, 5).forEach(s => console.log(s));
  }

  if (missingSpecies.length > 0) {
    console.log('\n--- Writing Missing Species to missing_species.txt ---');
    fs.writeFileSync(path.join(process.cwd(), 'missing_species.txt'), missingSpecies.join('\n'));
    missingSpecies.slice(0, 5).forEach(s => console.log(s));
  }
}

run().catch(console.error);
