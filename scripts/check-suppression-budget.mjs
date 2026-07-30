#!/usr/bin/env node
// scripts/check-suppression-budget.mjs
// -------------------------------------------------------------------------
// Ratchet gate for TypeScript escape hatches. Fails CI if the number of
// suppressions RISES above a committed baseline. New `any` / `@ts-ignore` are
// blocked; the existing ~360 are grandfathered and burned down over time by the
// type-strictness agent. When the count reaches ~0, replace this with hard
// eslint rules (@typescript-eslint/no-explicit-any, no-ts-ignore) and retire
// the agent.
//
// Setup (do this ONCE, against the LIVE repo — the ~360 figure is from a stale
// snapshot, do not hardcode it):
//   1. Run with --write to create the baseline:
//        node scripts/check-suppression-budget.mjs --write
//      This writes .suppression-budget.json with today's real counts.
//   2. Commit .suppression-budget.json.
//   3. Wire into CI (see optional-later/.github/workflows/suppression-budget.yml).
//
// Thereafter every PR runs it with no args; it fails if any category increased.
// -------------------------------------------------------------------------

import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOTS = ['packages/engine/src', 'packages/mcp-server/src'];
const BASELINE_PATH = path.join(process.cwd(), '.suppression-budget.json');

const PATTERNS = {
  colonAny: /:\s*any\b/g,
  asAny: /\bas any\b/g,
  angleAny: /(<any>|any\[\])/g,
  tsIgnore: /@ts-ignore/g,
  tsExpectError: /@ts-expect-error/g,
  tsNocheck: /@ts-nocheck/g,
};

function walk(dir, acc) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'generated') continue;
      walk(p, acc);
    } else if (/\.tsx?$/.test(entry.name) && !/\.(spec|test)\.tsx?$/.test(entry.name)) {
      acc.push(p);
    }
  }
  return acc;
}

function count() {
  const totals = Object.fromEntries(Object.keys(PATTERNS).map((k) => [k, 0]));
  for (const root of ROOTS) {
    if (!fs.existsSync(root)) continue;
    for (const file of walk(root, [])) {
      const src = fs.readFileSync(file, 'utf8');
      for (const [name, re] of Object.entries(PATTERNS)) {
        totals[name] += (src.match(re) || []).length;
      }
    }
  }
  return totals;
}

const write = process.argv.includes('--write');
const current = count();

if (write) {
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(current, null, 2) + '\n');
  console.log('Wrote baseline:', current);
  process.exit(0);
}

if (!fs.existsSync(BASELINE_PATH)) {
  console.error(`Missing ${BASELINE_PATH}. Run: node scripts/check-suppression-budget.mjs --write`);
  process.exit(1);
}

const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
let failed = false;
for (const key of Object.keys(PATTERNS)) {
  const base = baseline[key] ?? 0;
  const cur = current[key] ?? 0;
  const arrow = cur > base ? 'UP' : cur < base ? 'down' : '=';
  console.log(`${key}: ${base} -> ${cur} (${arrow})`);
  if (cur > base) failed = true;
}

if (failed) {
  console.error('\nSuppression count increased. Remove new `any`/`@ts-ignore`, or');
  console.error('if a rise is genuinely unavoidable (WASM glue), lower the count');
  console.error('elsewhere OR re-baseline deliberately with --write and justify it in the PR.');
  process.exit(1);
}
console.log('\nOK — no new suppressions.');
