#!/usr/bin/env node

/**
 * Analyze failure patterns to identify systematic issues
 */

import fs from 'fs';

const compareFile = 'compare_results_fixed.txt';
const content = fs.readFileSync(compareFile, 'utf-8');

const failures = [];

// Extract failure blocks
const failurePattern = /FAIL (\w+.*?)\s*\(ref=(.*?)\):([\s\S]*?)(?=FAIL|\n\s{0,2}[A-Z]|$)/g;
let match;

while ((match = failurePattern.exec(content)) !== null) {
  const model = match[1].trim();
  const details = match[3];

  // Extract max relative error
  const relErrorMatch = /Max relative error:\s*([\d.]+)%/i.exec(details);
  const maxRelError = relErrorMatch ? parseFloat(relErrorMatch[1]) : 0;

  // Extract sample errors
  const samples = [];
  const samplePattern = /t=([\d.eE+-]+):\s*(\w+)\s+web=.*?\((\d+\.?\d*)%\)/g;
  let sampleMatch;
  while ((sampleMatch = samplePattern.exec(details)) !== null) {
    samples.push({
      time: sampleMatch[1],
      col: sampleMatch[2],
      relError: parseFloat(sampleMatch[3])
    });
  }

  // Categorize
  let category = 'other';
  if (details.includes('[multi-phase concatenation]')) {
    category = 'multi-phase';
  } else if (
    model.includes('organelle') ||
    model.includes('cbngl') ||
    model.includes('lr_comp') ||
    model.includes('motivating')
  ) {
    category = 'compartment';
  } else if (model === 'repressilator') {
    category = 'oscillator';
  } else if (model === 'simple_sbml_import') {
    category = 'sbml';
  }

  const worstAtMatch = details.match(/Worst at t=([\d.eE+-]+), col=(\w+)/);

  failures.push({
    model,
    category,
    maxRelError,
    worstAt: worstAtMatch ? worstAtMatch[1] : 'unknown',
    samples
  });
}

// Group by category
const byCategory = {};
for (const failure of failures) {
  if (!byCategory[failure.category]) {
    byCategory[failure.category] = [];
  }
  byCategory[failure.category].push(failure);
}

console.log('================================================================================');
console.log('Failure Pattern Analysis');
console.log('================================================================================\n');

for (const [category, failureList] of Object.entries(byCategory)) {
  console.log(`\n${category.toUpperCase()} (${failureList.length} models)`);
  console.log('─'.repeat(80));

  // Sort by max relative error
  failureList.sort((a, b) => a.maxRelError - b.maxRelError);

  for (const f of failureList) {
    const status = f.maxRelError < 1 ? '✓ SMALL' : f.maxRelError < 10 ? '⚠ MEDIUM' : '✗ LARGE';
    console.log(`${status} ${f.model}: ${f.maxRelError.toFixed(3)}%`);
    if (f.samples.length > 0) {
      console.log(`   ${f.samples.slice(0, 2).map(s => `t=${s.time}: ${s.col} (${s.relError.toFixed(2)}%)`).join(', ')}`);
    }
  }

  // Statistics
  const errors = failureList.map(f => f.maxRelError);
  const avg = errors.reduce((a, b) => a + b, 0) / errors.length;
  const max = Math.max(...errors);
  const min = Math.min(...errors);

  console.log(`\n   Stats: min=${min.toFixed(3)}%, avg=${avg.toFixed(3)}%, max=${max.toFixed(3)}%`);

  // Check if category could be acceptable
  if (category === 'compartment' && max < 1) {
    console.log(`   → Could be acceptable: Small solver differences`);
  } else if (category === 'multi-phase' && max < 50) {
    console.log(`   → Could be acceptable: Equilibration differences`);
  } else if (category === 'oscillator') {
    console.log(`   → Long-term integration divergence (expected)`);
  }
}

console.log('\n================================================================================');
console.log('Summary');
console.log('================================================================================\n');

const totalByCategory = Object.entries(byCategory).map(([cat, lst]) => ({
  category: cat,
  count: lst.length,
  avgError: lst.map(f => f.maxRelError).reduce((a, b) => a + b, 0) / lst.length
}));

totalByCategory.sort((a, b) => b.count - a.count);

for (const { category, count, avgError } of totalByCategory) {
  console.log(`${category.padEnd(15)} ${count} failures, avg error: ${avgError.toFixed(3)}%`);
}

console.log(`\nTotal failing: ${failures.length} models`);
console.log(`Total passing: ${140 - 6 - failures.length} models (estimated)\n`);
