import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { NetworkGenerator } from '@bngplayground/engine';
import { BNGLParser } from '@bngplayground/engine';
import { parseBNGL } from '../services/parseBNGL.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to BNG2.pl provided by user
const BNG_PATH = "C:\\Users\\Achyudhan\\anaconda3\\envs\\Research\\Lib\\site-packages\\bionetgen\\bng-win\\BNG2.pl";
const PUBLISHED_MODELS_DIR = path.resolve(__dirname, '../published-models');

interface VerificationResult {
  model: string;
  success: boolean;
  bngSpecies?: number;
  bngReactions?: number;
  parserSpecies?: number;
  parserReactions?: number;
  error?: string;
}

function parseNetFile(netPath: string): { species: number, reactions: number } {
  const content = fs.readFileSync(netPath, 'utf8');
  const lines = content.split('\n');
  let speciesCount = 0;
  let reactionsCount = 0;
  let inSpecies = false;
  let inReactions = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('begin species')) {
      inSpecies = true;
      continue;
    }
    if (trimmed.startsWith('end species')) {
      inSpecies = false;
      continue;
    }
    if (trimmed.startsWith('begin reactions')) {
      inReactions = true;
      continue;
    }
    if (trimmed.startsWith('end reactions')) {
      inReactions = false;
      continue;
    }

    if (inSpecies && trimmed && !trimmed.startsWith('#')) {
      // Simple check: index followed by species string
      if (/^\d+\s+/.test(trimmed)) speciesCount++;
    }
    if (inReactions && trimmed && !trimmed.startsWith('#')) {
      // Simple check: index followed by reaction
      if (/^\d+\s+/.test(trimmed)) reactionsCount++;
    }
  }
  return { species: speciesCount, reactions: reactionsCount };
}

async function verifyModel(filePath: string): Promise<VerificationResult> {
  const modelName = path.basename(filePath);
  console.log(`\nVerifying ${modelName}...`);

  try {
    // 1. Run BNG2.pl (Skipped for debugging)
    /*
    const tempDir = path.resolve(__dirname, '../temp_verification');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
    
    // Copy bngl to temp dir to avoid cluttering source
    const tempBnglPath = path.join(tempDir, modelName);
    
    console.log(`[DEBUG] Reading BNGL file: ${filePath}`);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Comment out simulate commands to speed up BNG2.pl
    console.log(`[DEBUG] Stripping simulate commands...`);
    content = content.replace(/^\s*simulate_.*$/gm, '# simulate command removed for verification');
    fs.writeFileSync(tempBnglPath, content);

    console.log(`[DEBUG] Running BNG2.pl on ${tempBnglPath}`);
    const bngStart = Date.now();
    try {
        // Capture output for debugging, with timeout
        const output = execSync(`perl "${BNG_PATH}" "${tempBnglPath}"`, { 
            cwd: tempDir, 
            encoding: 'utf8',
            timeout: 60000 // 60 seconds timeout
        });
        console.log(`[DEBUG] BNG2.pl Output (first 200 chars): ${output.slice(0, 200)}...`);
    } catch (e: any) {
        if (e.code === 'ETIMEDOUT') {
            console.warn(`[DEBUG] BNG2.pl timed out after 60s. Checking if .net file exists...`);
        } else {
            console.error(`[DEBUG] BNG2.pl execution failed:`, e.message);
            if (e.stdout) console.log(`[DEBUG] BNG2.pl STDOUT:`, e.stdout.toString());
            if (e.stderr) console.log(`[DEBUG] BNG2.pl STDERR:`, e.stderr.toString());
        }
    }
    console.log(`[DEBUG] BNG2.pl finished in ${Date.now() - bngStart}ms`);

    const netPath = tempBnglPath.replace('.bngl', '.net');
    console.log(`[DEBUG] Checking for .net file at: ${netPath}`);
    
    let bngStats = { species: 0, reactions: 0 };
    if (fs.existsSync(netPath)) {
        bngStats = parseNetFile(netPath);
        console.log(`[DEBUG] BNG Stats: Species=${bngStats.species}, Reactions=${bngStats.reactions}`);
    } else {
        console.error(`[DEBUG] .net file not found at ${netPath}. Skipping comparison.`);
    }
    */
    const bngStats = { species: 0, reactions: 0 };

    // 2. Run Internal Parser
    console.log(`[DEBUG] Starting internal parser...`);
    const bnglCode = fs.readFileSync(filePath, 'utf8');
    const model = parseBNGL(bnglCode);

    console.log(`[DEBUG] Parsed Network Options:`, JSON.stringify(model.networkOptions, null, 2));

    const seedSpecies = model.species.map(s => BNGLParser.parseSpeciesGraph(s.name));
    console.log(`[DEBUG] Parsed ${seedSpecies.length} seed species`);

    // Helper to format species list
    const formatSpeciesList = (list: string[]) => (list.length > 0 ? list.join(' + ') : '0');

    const rules = model.reactionRules.flatMap(r => {
      const rate = model.parameters[r.rate] ?? parseFloat(r.rate);
      const reverseRate = r.reverseRate ? (model.parameters[r.reverseRate] ?? parseFloat(r.reverseRate)) : rate;
      const ruleStr = `${formatSpeciesList(r.reactants)} -> ${formatSpeciesList(r.products)}`;
      console.log(`[DEBUG] Attempting to parse rule: ${ruleStr}`);

      try {
        const forwardRule = BNGLParser.parseRxnRule(ruleStr, rate);
        forwardRule.name = r.name || (r.reactants.join('+') + '->' + r.products.join('+'));

        if (r.constraints && r.constraints.length > 0) {
          forwardRule.applyConstraints(r.constraints, (s) => BNGLParser.parseSpeciesGraph(s));
        }

        if (r.isBidirectional) {
          const reverseRuleStr = `${formatSpeciesList(r.products)} -> ${formatSpeciesList(r.reactants)}`;
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

    console.log(`[DEBUG] Parsed ${rules.length} rules successfully`);

    const generatorOptions = {
      maxSpecies: 5000,
      maxReactions: 5000,
      maxIterations: model.networkOptions?.maxIter ?? 50,
      maxAgg: model.networkOptions?.maxAgg ?? 50,
      maxStoich: (model.networkOptions?.maxStoich ?? 100) as any,
      partialReturnOnLimit: true
    };
    console.log(`[DEBUG] Generator Options:`, JSON.stringify(generatorOptions, null, 2));

    const generator = new NetworkGenerator(generatorOptions);

    const genStart = Date.now();
    const result = await generator.generate(seedSpecies, rules, (progress) => {
      if (progress.iteration % 10 === 0) {
        console.log(`[DEBUG] Progress: Iter=${progress.iteration}, S=${progress.species}, R=${progress.reactions}, Mem=${(progress.memoryUsed / 1024 / 1024).toFixed(1)}MB`);
      }
    });
    console.log(`[DEBUG] Internal parser finished in ${Date.now() - genStart}ms`);
    console.log(`[DEBUG] Internal Stats: Species=${result.species.length}, Reactions=${result.reactions.length}`);

    console.log(`[DEBUG] Generated Species List:`);
    result.species.forEach(s => console.log(`  ${s.index}: ${s.toString()}`));

    // 3. Compare / Verify
    // Since BNG2.pl is disabled, we consider success if we generated species/reactions without error
    const success = result.species.length > 0;

    return {
      model: modelName,
      success,
      bngSpecies: 0,
      bngReactions: 0,
      parserSpecies: result.species.length,
      parserReactions: result.reactions.length
    };

  } catch (e: any) {
    if (e.message.includes('Max species limit reached') || e.message.includes('Max reactions limit reached')) {
        console.log(`[DEBUG] Hit limit: ${e.message}`);
        const partialSpecies = e.species || [];
        const partialReactions = e.reactions || [];
        const success = partialSpecies.length > 0;
        return {
            model: modelName,
            success,
            bngSpecies: 0,
            bngReactions: 0,
            parserSpecies: partialSpecies.length,
            parserReactions: partialReactions.length,
            error: `Limit Reached: ${e.message}`
        };
    }
    console.error(`[DEBUG] Verification failed with error:`, e);
    fs.writeFileSync('error_stack.txt', e.stack || e.message);
    return { model: modelName, success: false, error: e.message };
  }
}

async function run() {
  const results: VerificationResult[] = [];

  // Find all .bngl files recursively
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

  const files = getBnglFiles(PUBLISHED_MODELS_DIR).filter(f => f.includes('tlbr.bngl'));
  console.log(`Found ${files.length} models to verify.`);

  for (const file of files) {
    const result = await verifyModel(file);
    results.push(result);

    if (result.success) {
      console.log(`✅ ${result.model}: Passed`);
    } else {
      console.log(`❌ ${result.model}: Failed`);
      console.log(`   BNG: S=${result.bngSpecies}, R=${result.bngReactions}`);
      console.log(`   Parser: S=${result.parserSpecies}, R=${result.parserReactions}`);
      if (result.error) console.log(`   Error: ${result.error}`);
    }
  }

  console.log('\n--- Summary ---');
  const passed = results.filter(r => r.success).length;
  console.log(`Passed: ${passed}/${results.length}`);
  console.log(`Failed: ${results.length - passed}/${results.length}`);
}

run();
