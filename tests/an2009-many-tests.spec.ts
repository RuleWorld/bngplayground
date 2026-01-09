// @ts-nocheck
/**
 * Test An_2009 in a context with MANY registered tests
 * This tests if having 62+ tests causes the hang
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, mkdtempSync, rmSync, copyFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseBNGL } from '../services/parseBNGL';
import { BNGLParser } from '../src/services/graph/core/BNGLParser';
import { NetworkGenerator } from '../src/services/graph/NetworkGenerator';

// Import BNG2 path defaults
import { DEFAULT_BNG2_PATH, DEFAULT_PERL_CMD } from '../scripts/bngDefaults.js';

const thisDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(thisDir, '..');

const BNG2_PATH = process.env.BNG2_PATH ?? DEFAULT_BNG2_PATH;
const PERL_CMD = process.env.PERL_CMD ?? DEFAULT_PERL_CMD;

const bngAvailable = existsSync(BNG2_PATH);

const TIMEOUT_MS = 120_000;
const NETWORK_TIMEOUT_MS = 60_000;

const formatSpeciesList = (list: string[]) => (list.length > 0 ? list.join(' + ') : '0');

// Helper to check if a rate expression contains observable names
function rateContainsObservables(rateExpr: string, observableNames: Set<string>): boolean {
  for (const obsName of observableNames) {
    const regex = new RegExp(`\\b${obsName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    if (regex.test(rateExpr)) return true;
  }
  return false;
}

// Run BNG2.pl (same as in bng2-comparison)
function runBNG2(bnglPath: string): boolean {
  const tempDir = mkdtempSync(join(tmpdir(), 'bng-compare-'));
  const modelName = basename(bnglPath);
  const modelCopy = join(tempDir, modelName);
  copyFileSync(bnglPath, modelCopy);

  try {
    spawnSync(PERL_CMD, [BNG2_PATH, modelName], {
      cwd: tempDir,
      encoding: 'utf-8',
      timeout: 120000,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const gdatFiles = readdirSync(tempDir).filter(f => f.endsWith('.gdat'));
    return gdatFiles.length > 0;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

async function runAn2009(): Promise<{ species: number; reactions: number }> {
  const an2009Path = join(projectRoot, 'published-models/immune-signaling/An_2009.bngl');
  
  // Run BNG2.pl FIRST
  console.log('Running BNG2.pl via spawnSync...');
  const bng2Start = Date.now();
  const bng2Success = runBNG2(an2009Path);
  const bng2Time = Date.now() - bng2Start;
  console.log(`BNG2.pl completed in ${(bng2Time/1000).toFixed(2)}s, success=${bng2Success}`);
  
  // Now run network generation
  const content = readFileSync(an2009Path, 'utf-8');
  const model = parseBNGL(content);
  
  console.log(`\nModel loaded: ${model.species.length} species, ${model.reactionRules.length} rules`);
  
  // Generate network
  const seedSpecies = model.species.map(s => BNGLParser.parseSpeciesGraph(s.name));
  
  const observableNames = new Set(model.observables.map(o => o.name));
  const parametersMap = new Map(Object.entries(model.parameters));

  const rules = model.reactionRules.flatMap((r) => {
    const hasObsInForward = rateContainsObservables(r.rate, observableNames);
    const hasObsInReverse = r.reverseRate ? rateContainsObservables(r.reverseRate, observableNames) : false;
    
    const rate = hasObsInForward ? 1 : BNGLParser.evaluateExpression(r.rate, parametersMap, observableNames);
    const reverseRate = r.reverseRate 
      ? (hasObsInReverse ? 1 : BNGLParser.evaluateExpression(r.reverseRate, parametersMap, observableNames))
      : rate;
    
    const ruleStr = `${formatSpeciesList(r.reactants)} -> ${formatSpeciesList(r.products)}`;
    const forwardRule = BNGLParser.parseRxnRule(ruleStr, rate);
    forwardRule.name = r.reactants.join('+') + '->' + r.products.join('+');

    if (r.constraints && r.constraints.length > 0) {
      forwardRule.applyConstraints(r.constraints, (s: string) => BNGLParser.parseSpeciesGraph(s));
    }

    if (r.isBidirectional) {
      const reverseRuleStr = `${formatSpeciesList(r.products)} -> ${formatSpeciesList(r.reactants)}`;
      const reverseRule = BNGLParser.parseRxnRule(reverseRuleStr, reverseRate);
      reverseRule.name = r.products.join('+') + '->' + r.reactants.join('+');
      return [forwardRule, reverseRule];
    } else {
      return [forwardRule];
    }
  });

  console.log(`Prepared ${seedSpecies.length} seed species, ${rules.length} rules`);
  
  // Create abort controller
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    console.log('TIMEOUT - aborting');
    abortController.abort();
  }, NETWORK_TIMEOUT_MS);

  const generator = new NetworkGenerator({ 
    maxSpecies: 5000,
    maxIterations: 5000,
    maxAgg: 500,
    maxStoich: 500
  });

  console.log('[DEBUG] About to call generator.generate()');
  const networkStart = Date.now();
  let progressCount = 0;
  
  const result = await generator.generate(
    seedSpecies, 
    rules,
    (progress) => {
      progressCount++;
      if (progressCount <= 10) {
        console.log(`  [DEBUG] Progress callback #${progressCount}: ${progress.species} species, ${progress.reactions} reactions`);
      }
    },
    abortController.signal
  );
  
  console.log('[DEBUG] generator.generate() returned');
  clearTimeout(timeoutId);
  console.log('[DEBUG] Timeout cleared');
  
  const networkTime = Date.now() - networkStart;
  console.log(`✓ Network generated in ${networkTime}ms: ${result.species.length} species, ${result.reactions.length} reactions`);
  
  return { species: result.species.length, reactions: result.reactions.length };
}

const describeFn = bngAvailable ? describe : describe.skip;

describeFn('An_2009 with many tests registered (like bng2-comparison)', () => {
  // Register 70 tests BEFORE An_2009 (like in bng2-comparison which has 62 models)
  for (let i = 0; i < 70; i++) {
    it(`dummy test ${i}`, async () => {
      // Each test waits a tiny bit to simulate real tests
      await new Promise(resolve => setTimeout(resolve, 1));
    });
  }
  
  // The An_2009 test - should be the 71st test
  it('should complete An_2009 network generation (test #71)', async () => {
    console.log('\n=== Testing An_2009 WITH 70 OTHER TESTS REGISTERED ===\n');
    
    const result = await runAn2009();
    
    expect(result.species).toBe(76);  // Verified: matches BNG2
    expect(result.reactions).toBe(202);  // Verified: matches BNG2
    
    console.log('\nTEST PASSED!');
  }, TIMEOUT_MS);
  
  // A few more tests after
  for (let i = 0; i < 5; i++) {
    it(`trailing test ${i}`, async () => {
      await new Promise(resolve => setTimeout(resolve, 1));
    });
  }
});

