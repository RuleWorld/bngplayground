
import fs from 'fs';
import path from 'path';
import { parseBNGL } from '../services/parseBNGL';
import { NetworkGenerator } from '../src/services/graph/NetworkGenerator';

const MODEL_PATH = path.join(process.cwd(), 'published-models/cell-regulation/Barua_2013.bngl');
const OUTPUT_FILE = path.join(process.cwd(), 'barua_sim_species.txt');

async function run() {
  console.log(`Reading model from ${MODEL_PATH}...`);
  const bnglContent = fs.readFileSync(MODEL_PATH, 'utf-8');
  const model = parseBNGL(bnglContent);

  console.log('Generating network...');
  console.log('Model parsed. Network options:', model.networkOptions);
  
  // Prepare maxStoich
  let maxStoich: number | Map<string, number> = 500;
  try {
      if (model.networkOptions && model.networkOptions.maxStoich) {
        if (typeof model.networkOptions.maxStoich === 'object') {
          maxStoich = new Map(Object.entries(model.networkOptions.maxStoich));
        } else {
          maxStoich = model.networkOptions.maxStoich as number;
        }
      }
  } catch (e) {
      console.warn('Error processing maxStoich, using default:', e);
  }

  const generator = new NetworkGenerator({
    maxSpecies: 5000,
    maxReactions: 10000,
    maxIterations: 100,
    maxAgg: 100,
    maxStoich
  });

  const result = generator.generate(model.reactionRules, model.seedSpecies, model.moleculeTypes);
  console.log(`Generation complete. ${result.products.length} species generated.`);

  const speciesList = result.products.map(p => p.patternString).sort();
  fs.writeFileSync(OUTPUT_FILE, speciesList.join('\n'));
  console.log(`Species list written to ${OUTPUT_FILE}`);
}

run().catch(console.error);
