#!/usr/bin/env node
// Simple check to ensure no Node built-ins are present in client-facing dist JS
import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';

const DIST = path.resolve(process.cwd(), 'dist');
// Match only explicit import/require/dynamic-import forms to avoid false positives
const patterns = [
  /require\(['"]fs['"]\)/g,
  /require\(['"]path['"]\)/g,
  /require\(['"]sharp['"]\)/g,
  /require\(['"]onnxruntime-node['"]\)/g,
  /import\s+.*\s+from\s+['"]fs['"]/g,
  /import\s+.*\s+from\s+['"]path['"]/g,
  /import\s+.*\s+from\s+['"]sharp['"]/g,
  /import\s+.*\s+from\s+['"]onnxruntime-node['"]/g,
  /import\(['"]fs['"]\)/g,
  /import\(['"]path['"]\)/g,
  /import\(['"]sharp['"]\)/g,
  /import\(['"]onnxruntime-node['"]\)/g
];

function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const res = path.resolve(dir, e.name);
    if (e.isDirectory()) files.push(...walk(res));
    else files.push(res);
  }
  return files;
}

if (!statSync(DIST, { throwIfNoEntry: false })) {
  console.error('No dist/ directory found — run build first');
  process.exit(2);
}

const files = walk(DIST).filter(f => f.endsWith('.js'));
let problems = [];
for (const f of files) {
  const content = readFileSync(f, 'utf8');
  for (const p of patterns) {
    // Reset lastIndex for global regexes and collect all matches
    const matches = Array.from(content.matchAll(p));
    if (matches.length > 0) {
      for (const m of matches) {
        const idx = m.index || 0;
        // Heuristic: if the match is preceded by Node detection (process/versions/globalThis.process), treat it as Node-guarded and skip
        const pre = content.slice(Math.max(0, idx - 1000), idx);
        const nodeGuard = /globalThis\.process|process\.versions|typeof process|process\.env|globalThis\.process\?/;
        if (nodeGuard.test(pre)) continue; // safe: Node-only code guarded
        const snippet = content.slice(Math.max(0, idx - 80), Math.min(content.length, idx + 80)).replace(/\n/g, ' ');
        problems.push({ file: f, pattern: p.toString(), snippet });
      }
    }
  }
}

if (problems.length > 0) {
  console.error('ERROR: Found server-only references in production bundles:');
  for (const pr of problems) console.error(` - ${pr.file}: ${pr.pattern}`);
  process.exit(1);
}

console.log('OK: No server-only references found in dist JS.');
process.exit(0);
