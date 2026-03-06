import { readFileSync } from 'fs';
import path from 'path';
import { parseBNGL } from '../../services/parseBNGL';
import { describe, it, expect } from 'vitest';
import { BNGLParser } from '@bngplayground/engine';
import { NetworkGenerator } from '@bngplayground/engine';
import { countPatternMatches } from '@bngplayground/engine';

describe('stat3-mediated-transcription parity diagnostic', () => {
  it('should find embeddings for Active_Dimer and Total_pSTAT3 patterns', async () => {
    const file = path.resolve(__dirname, '../../example-models/stat3-mediated-transcription.bngl');
    const code = readFileSync(file, 'utf8');

    const model = parseBNGL(code);
    // Build seed species & rules
    const seedSpecies = model.species.map((s: any) => BNGLParser.parseSpeciesGraph(s.name));
    const rules: any[] = [];
    for (const [i, r] of model.reactionRules.entries()) {
      if (r.isBidirectional && r.rate && r.rate.includes(',')) {
        const parts = r.rate.split(',').map((p: string) => p.trim());
        rules.push(BNGLParser.parseRxnRule(`${r.reactants.join(' + ')} -> ${r.products.join(' + ')}`, parts[0] || 0));
        rules.push(BNGLParser.parseRxnRule(`${r.products.join(' + ')} -> ${r.reactants.join(' + ')}`, parts[1] || 0));
      } else {
        rules.push(BNGLParser.parseRxnRule(`${r.reactants.join(' + ')} -> ${r.products.join(' + ')}`, r.rate || r.rateExpression || 0));
      }
    }

    const gen = new NetworkGenerator({ maxSpecies: 2000, maxIterations: 200 });
    const result = await gen.generate(seedSpecies, rules);

    const canonical = result.species.map(s => BNGLParser.speciesGraphToString(s.graph));

    const activeDimerCount = canonical.reduce((acc, s) => acc + countPatternMatches(s, 'STAT3(b!+,loc~nuc)'), 0);
    const totalPstatCount = canonical.reduce((acc, s) => acc + countPatternMatches(s, 'STAT3(s~P)'), 0);

    console.log('Active_Dimer embeddings:', activeDimerCount);
    console.log('Total_pSTAT3 embeddings:', totalPstatCount);

    expect(activeDimerCount).toBeGreaterThan(0);
    expect(totalPstatCount).toBeGreaterThan(0);
  }, 20000);
});
