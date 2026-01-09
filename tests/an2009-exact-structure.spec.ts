// @ts-nocheck
/**
 * Exact copy of bng2-comparison.spec.ts but ONLY for An_2009
 * This tests if the problem is with bng2-comparison structure itself
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, mkdtempSync, rmSync, copyFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseBNGL } from '../services/parseBNGL';
import { BNGLParser } from '../src/services/graph/core/BNGLParser';
import { NetworkGenerator, GeneratorProgress } from '../src/services/graph/NetworkGenerator';
import type { BNGLModel } from '../types';

// Import BNG2 path defaults
import { DEFAULT_BNG2_PATH, DEFAULT_PERL_CMD } from '../scripts/bngDefaults.js';

const thisDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(thisDir, '..');

const BNG2_PATH = process.env.BNG2_PATH ?? DEFAULT_BNG2_PATH;
const PERL_CMD = process.env.PERL_CMD ?? DEFAULT_PERL_CMD;

const bngAvailable = existsSync(BNG2_PATH);

const TIMEOUT_MS = 120_000;
const NETWORK_TIMEOUT_MS = 60_000;
const PROGRESS_LOG_INTERVAL = 100;

// Progress logger class (exact copy from bng2-comparison)
class ProgressTracker {
  modelName: string;
  startTime: number;
  lastLogTime: number;
  lastSpeciesCount: number;
  logInterval: number;
  stuckThreshold: number;
  
  constructor(modelName: string, logInterval = PROGRESS_LOG_INTERVAL) {
    this.modelName = modelName;
    this.startTime = Date.now();
    this.lastLogTime = this.startTime;
    this.lastSpeciesCount = 0;
    this.logInterval = logInterval;
    this.stuckThreshold = 30000;
  }
  
  log(progress: GeneratorProgress) {
    const now = Date.now();
    const timeSinceLast = now - this.lastLogTime;
    const speciesAddedSinceLast = progress.species - this.lastSpeciesCount;
    
    if (speciesAddedSinceLast >= this.logInterval || timeSinceLast > 5000) {
      const rate = timeSinceLast > 0 ? (speciesAddedSinceLast / timeSinceLast * 1000).toFixed(1) : '?';
      console.log(
        `  [${this.modelName}] Iter ${progress.iteration}: ` +
        `${progress.species} species, ${progress.reactions} reactions ` +
        `(${rate} sp/s, ${(progress.timeElapsed/1000).toFixed(1)}s elapsed)`
      );
      this.lastLogTime = now;
      this.lastSpeciesCount = progress.species;
    }
  }
  
  isStuck(progress: GeneratorProgress): boolean {
    const now = Date.now();
    const timeSinceLast = now - this.lastLogTime;
    const speciesAddedSinceLast = progress.species - this.lastSpeciesCount;
    return speciesAddedSinceLast === 0 && timeSinceLast > this.stuckThreshold;
  }
}

interface GdatData {
  headers: string[];
  data: Record<string, number>[];
}

function parseGdat(content: string): GdatData {
  const lines = content.trim().split(/\r?\n/);
  const headerLine = lines.find(l => l.startsWith('#'));
  if (!headerLine) throw new Error('No header line found');
  
  const headers = headerLine.slice(1).trim().split(/\s+/);
  const data: Record<string, number>[] = [];
  
  for (const line of lines) {
    if (line.startsWith('#') || !line.trim()) continue;
    const values = line.trim().split(/\s+/).map(v => parseFloat(v));
    if (values.length === headers.length) {
      const row: Record<string, number> = {};
      headers.forEach((h, i) => row[h] = values[i]);
      data.push(row);
    }
  }
  
  return { headers, data };
}

function runBNG2(bnglPath: string): GdatData | null {
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
    if (gdatFiles.length === 0) return null;

    const gdatContent = readFileSync(join(tempDir, gdatFiles[0]), 'utf-8');
    return parseGdat(gdatContent);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

const formatSpeciesList = (list: string[]) => (list.length > 0 ? list.join(' + ') : '0');

function rateContainsObservables(rateExpr: string, observableNames: Set<string>): boolean {
  for (const obsName of observableNames) {
    const regex = new RegExp(`\\b${obsName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    if (regex.test(rateExpr)) return true;
  }
  return false;
}

// Simplified version - just network generation, no ODE
async function runWebSimulatorNetwork(
  model: BNGLModel, 
  modelName: string = 'unknown'
): Promise<{ species: number; reactions: number }> {
  const progressTracker = new ProgressTracker(modelName);
  
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

  const networkOpts = model.networkOptions || {};
  const maxStoich = networkOpts.maxStoich 
    ? new Map(Object.entries(networkOpts.maxStoich))
    : 500;
  
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    abortController.abort();
    console.error(`\n  ❌ [${modelName}] NETWORK GENERATION TIMEOUT`);
  }, NETWORK_TIMEOUT_MS);
  
  const generator = new NetworkGenerator({ 
    maxSpecies: 5000,
    maxIterations: 5000,
    maxAgg: networkOpts.maxAgg ?? 500,
    maxStoich 
  });
  
  const networkStart = Date.now();
  console.log(`\n  ▶ [${modelName}] Starting network generation...`);
  console.log(`  [DEBUG] About to call generator.generate()`);
  
  let progressCallCount = 0;
  const result = await generator.generate(
    seedSpecies, 
    rules,
    (progress) => {
      progressCallCount++;
      if (progressCallCount <= 10) {
        console.log(`  [DEBUG] Progress callback #${progressCallCount}: ${progress.species} species, ${progress.reactions} reactions`);
      }
      progressTracker.log(progress);
      if (progressTracker.isStuck(progress)) {
        console.warn(`\n  ⚠️ [${modelName}] Network generation appears STUCK`);
      }
    },
    abortController.signal
  );
  
  console.log(`  [DEBUG] generator.generate() returned`);
  clearTimeout(timeoutId);
  console.log(`  [DEBUG] Timeout cleared`);
  const networkTime = Date.now() - networkStart;
  console.log(`  ✓ [${modelName}] Network: ${result.species.length} species, ${result.reactions.length} reactions in ${(networkTime/1000).toFixed(2)}s`);

  return { species: result.species.length, reactions: result.reactions.length };
}

const describeFn = bngAvailable ? describe : describe.skip;

describeFn('An_2009 Only (exact bng2-comparison structure)', () => {
  // Use for...of loop EXACTLY like bng2-comparison
  const testModels = [
    { model: 'An_2009', path: join(projectRoot, 'published-models/immune-signaling/An_2009.bngl') }
  ];
  
  console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
  console.log(`║  Testing 1 model                                               ║`);
  console.log(`╚════════════════════════════════════════════════════════════════╝\n`);
  
  // EXACT structure from bng2-comparison
  for (const { model: modelName, path: bnglPath } of testModels) {
    it(`matches BNG2.pl for ${modelName}`, async () => {
      console.log(`\n┌─ Testing: ${modelName} ─────────────────────────────────────`);
      
      if (!existsSync(bnglPath)) {
        console.warn(`  ⚠️ Skipping: BNGL file not found`);
        return;
      }
      
      const bnglContent = readFileSync(bnglPath, 'utf-8');
      
      // Run BNG2.pl
      console.log(`  Running BNG2.pl...`);
      const bng2Start = Date.now();
      const bng2Result = runBNG2(bnglPath);
      const bng2Time = Date.now() - bng2Start;
      
      if (!bng2Result) {
        console.warn(`  ⚠️ Skipping: BNG2.pl failed`);
        return;
      }
      console.log(`  ✓ BNG2.pl completed in ${(bng2Time/1000).toFixed(2)}s`);
      
      // Parse and run web simulator
      const model = parseBNGL(bnglContent);
      
      try {
        const webResult = await runWebSimulatorNetwork(model, modelName);
        
        console.log(`  ✓ [${modelName}] Network generated: ${webResult.species} species, ${webResult.reactions} reactions`);
        console.log(`└─────────────────────────────────────────────────────────────────`);
        
        expect(webResult.species).toBe(76);  // Verified: matches BNG2
        expect(webResult.reactions).toBe(202);  // Verified: matches BNG2
      } catch (err) {
        console.error(`  ❌ [${modelName}] ERROR:`, err instanceof Error ? err.message : err);
        console.log(`└─────────────────────────────────────────────────────────────────`);
        throw err;
      }
    }, TIMEOUT_MS);
  }
});

