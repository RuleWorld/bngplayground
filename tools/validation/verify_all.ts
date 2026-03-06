
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { NetworkGenerator } from '@bngplayground/engine';
import { BNGLParser } from '@bngplayground/engine';
import { parseBNGL } from '../../services/parseBNGL.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PUBLISHED_MODELS_DIR = path.resolve(__dirname, '../../published-models');
const EXAMPLE_MODELS_DIR = path.resolve(__dirname, '../../example-models');

interface VerificationResult {
  model: string;
  success: boolean;
  parserSpecies?: number;
  parserReactions?: number;
  error?: string;
  usesIntramolecular?: boolean;
}

async function verifyModel(filePath: string): Promise<VerificationResult | null> {
  const modelName = path.basename(filePath);

  try {
    const bnglCode = fs.readFileSync(filePath, 'utf8');

    // Skip models with non-standard BNGL syntax not supported by bng2.pl
    // These are VCell-specific extensions
    if (bnglCode.includes('begin anchors')) {
      console.log(`\nSkipping ${modelName} (contains 'anchors' block - VCell-specific syntax)`);
      return null;
    }

    console.log(`\nVerifying ${modelName}...`);
    const model = parseBNGL(bnglCode);

    const seedSpecies = model.species.map(s => BNGLParser.parseSpeciesGraph(s.name));

    const rules = model.reactionRules.flatMap(r => {
      const rate = model.parameters[r.rate] ?? parseFloat(r.rate);
      const reverseRate = r.reverseRate ? (model.parameters[r.reverseRate] ?? parseFloat(r.reverseRate)) : rate;
      const ruleStr = `${r.reactants.join(' + ')} -> ${r.products.join(' + ')}`;

      try {
        const forwardRule = BNGLParser.parseRxnRule(ruleStr, rate);
        forwardRule.name = r.name || (r.reactants.join('+') + '->' + r.products.join('+'));

        if (r.constraints && r.constraints.length > 0) {
          forwardRule.applyConstraints(r.constraints, (s) => BNGLParser.parseSpeciesGraph(s));
        }

        if (r.isBidirectional) {
          const reverseRuleStr = `${r.products.join(' + ')} -> ${r.reactants.join(' + ')}`;
          const reverseRule = BNGLParser.parseRxnRule(reverseRuleStr, reverseRate);
          reverseRule.name = (r.name ? r.name + '_rev' : r.products.join('+') + '->' + r.reactants.join('+'));
          return [forwardRule, reverseRule];
        } else {
          return [forwardRule];
        }
      } catch (e) {
        console.error(`[DEBUG] Failed to parse rule in ${modelName}: ${ruleStr}`, e);
        return [];
      }
    });

    const generatorOptions = {
      maxSpecies: 5000,
      maxReactions: 5000,
      maxIterations: model.networkOptions?.maxIter ?? 50,
      maxAgg: model.networkOptions?.maxAgg ?? 50,
      maxStoich: (model.networkOptions?.maxStoich ?? 100) as any,
      partialReturnOnLimit: true
    };

    const generator = new NetworkGenerator(generatorOptions);
    const result = await generator.generate(seedSpecies, rules, (progress) => {
      // Optional: log progress
    });

    return {
      model: modelName,
      success: result.species.length > 0,
      parserSpecies: result.species.length,
      parserReactions: result.reactions.length
    };

  } catch (e: any) {
    if (e.message.includes('Max species limit reached') || e.message.includes('Max reactions limit reached')) {
      console.log(`[DEBUG] Hit limit: ${e.message}`);
      const partialSpecies = e.species || [];
      const partialReactions = e.reactions || [];
      return {
        model: modelName,
        success: partialSpecies.length > 0,
        parserSpecies: partialSpecies.length,
        parserReactions: partialReactions.length,
        error: `Limit Reached: ${e.message}`
      };
    }
    console.error(`[DEBUG] Verification failed with error:`, e);
    return { model: modelName, success: false, error: e.message };
  }
}

async function run() {
  const results: VerificationResult[] = [];

  function getBnglFiles(dir: string): string[] {
    let files: string[] = [];
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        files = files.concat(getBnglFiles(fullPath));
      } else if (item.name.endsWith('.bngl')) {
        files.push(fullPath);
      }
    }
    return files;
  }

  const files = [
    ...getBnglFiles(PUBLISHED_MODELS_DIR),
    ...getBnglFiles(EXAMPLE_MODELS_DIR)
  ];
  console.log(`Found ${files.length} models to verify.`);

  for (const file of files) {
    const result = await verifyModel(file);
    if (result === null) continue; // Skipped model
    results.push(result);

    if (result.success) {
      console.log(`✅ ${result.model}: Passed (S=${result.parserSpecies}, R=${result.parserReactions})`);
    } else {
      console.log(`❌ ${result.model}: Failed`);
      if (result.error) console.log(`   Error: ${result.error}`);
    }
  }

  console.log('\n--- Summary ---');
  const passed = results.filter(r => r.success).length;
  console.log(`Passed: ${passed}/${results.length}`);
  console.log(`Failed: ${results.length - passed}/${results.length}`);
}

run();
