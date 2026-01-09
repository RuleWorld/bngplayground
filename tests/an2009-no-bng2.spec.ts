// @ts-nocheck
/**
 * Test An_2009 directly WITHOUT running BNG2.pl first
 * This isolates whether spawnSync is causing the hang
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBNGL } from '../services/parseBNGL';
import { BNGLParser } from '../src/services/graph/core/BNGLParser';
import { NetworkGenerator } from '../src/services/graph/NetworkGenerator';
import { GraphCanonicalizer } from '../src/services/graph/core/Canonical';

const thisDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(thisDir, '..');

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

describe('An_2009 without BNG2.pl', () => {
  it('should complete network generation without running BNG2.pl first', async () => {
    // Find An_2009
    const an2009Path = join(projectRoot, 'published-models/immune-signaling/An_2009.bngl');
    
    if (!existsSync(an2009Path)) {
      console.log('An_2009 model not found, skipping');
      return;
    }
    
    console.log('\n=== Testing An_2009 WITHOUT BNG2.pl ===\n');
    
    const content = readFileSync(an2009Path, 'utf-8');
    const model = parseBNGL(content);
    
    console.log(`Model loaded: ${model.species.length} species, ${model.reactionRules.length} rules`);
    
    // Generate network (same as bng2-comparison.spec.ts)
    const seedSpecies = model.species.map(s => BNGLParser.parseSpeciesGraph(s.name));
    
    const seedConcentrationMap = new Map<string, number>();
    model.species.forEach(s => {
      const g = BNGLParser.parseSpeciesGraph(s.name);
      const canonicalName = GraphCanonicalizer.canonicalize(g);
      seedConcentrationMap.set(canonicalName, s.initialConcentration);
    });

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
    
    // Create abort controller like bng2-comparison does
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
    
    expect(result.species.length).toBe(76);  // Verified: matches BNG2
    expect(result.reactions.length).toBe(202);  // Verified: matches BNG2
    
    console.log('\nTEST PASSED!');
  }, TIMEOUT_MS);
});

