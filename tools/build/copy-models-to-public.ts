/**
 * copy-models-to-public.ts
 *
 * Copies all .bngl files from example-models/ and published-models/ into
 * public/models/ with flattened filenames so they're servable at runtime.
 *
 * Usage:  npx tsx tools/build/copy-models-to-public.ts
 *
 * Add to package.json scripts:
 *   "copy:models": "tsx tools/build/copy-models-to-public.ts"
 *
 * And update the build script:
 *   "build": "tsx tools/build/copy-models-to-public.ts && tsx tools/build/generate-manifest.ts && tsx tools/build/generateEmbeddings.mjs && vite build"
 */

import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'public', 'models');

const SOURCES = [
  { dir: path.join(ROOT, 'example-models'), recursive: false },
  { dir: path.join(ROOT, 'published-models'), recursive: true },
];

function findBngl(dir: string, recursive: boolean): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && recursive) {
      results.push(...findBngl(full, true));
    } else if (entry.isFile() && entry.name.endsWith('.bngl')) {
      results.push(full);
    }
  }
  return results;
}

// Clean & recreate
if (fs.existsSync(OUT)) fs.rmSync(OUT, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

let copied = 0;
let skipped = 0;
const seen = new Set<string>();

for (const { dir, recursive } of SOURCES) {
  for (const src of findBngl(dir, recursive)) {
    const name = path.basename(src);
    if (seen.has(name)) {
      console.warn(`  ⚠ dup: ${name} — skipping ${path.relative(ROOT, src)}`);
      skipped++;
      continue;
    }
    seen.add(name);
    fs.copyFileSync(src, path.join(OUT, name));
    copied++;
  }
}

console.log(`✓ Copied ${copied} models to public/models/ (${skipped} dups skipped)`);
