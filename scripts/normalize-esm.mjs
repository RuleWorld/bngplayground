import { promises as fs } from 'node:fs';
import { accessSync } from 'node:fs';
import { join, dirname } from 'node:path';
import process from 'node:process';

const distArg = process.argv[2] || 'dist';
const root = process.cwd();
const dist = join(root, distArg);

function existsSync(p) {
  try { accessSync(p); return true; } catch { return false; }
}

function nodeModulesDirs(start) {
  const out = [];
  let current = start;
  while (true) {
    const candidate = join(current, 'node_modules');
    if (existsSync(candidate)) out.push(candidate);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return out;
}

function findNodeModulesForPackage(pkgName, start) {
  for (const dir of nodeModulesDirs(start)) {
    if (existsSync(join(dir, pkgName))) return dir;
  }
  return null;
}

function physicalBase(spec, fromDir) {
  if (spec.startsWith('/')) return join(fromDir, spec);
  if (spec.startsWith('.')) return join(fromDir, spec);
  if (spec.startsWith('node:')) return null;
  const parts = spec.split('/');
  let pkgName, subpath;
  if (spec.startsWith('@')) {
    if (parts.length < 2) return null;
    pkgName = parts.slice(0, 2).join('/');
    subpath = parts.slice(2).join('/');
  } else {
    pkgName = parts[0];
    subpath = parts.slice(1).join('/');
  }
  if (!subpath) return null;
  const nodeModules = findNodeModulesForPackage(pkgName, fromDir);
  if (!nodeModules) return null;
  return join(nodeModules, pkgName, subpath);
}

function normalizeSpecifier(spec, fromDir) {
  if (/\.[a-z0-9]+$/i.test(spec)) return spec;
  const base = physicalBase(spec, fromDir);
  if (!base) return spec;
  if (existsSync(base + '.js')) return spec + '.js';
  if (existsSync(base + '.mjs')) return spec + '.mjs';
  if (existsSync(base + '.cjs')) return spec + '.cjs';
  if (existsSync(base) && existsSync(join(base, 'index.js'))) return spec + '/index.js';
  return spec;
}

async function walk(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(p));
    else out.push(p);
  }
  return out;
}

async function normalizeFile(file) {
  if (!file.endsWith('.js') && !file.endsWith('.mjs') && !file.endsWith('.cjs')) return;
  const original = await fs.readFile(file, 'utf8');
  const re = /((?:from|import)\s*\(\s*|from\s+)(['"])([^'"]+?)(\2)/g;
  const next = original.replace(re, (match, prefix, quote, spec, closeQuote) => {
    const normalized = normalizeSpecifier(spec, dirname(file));
    return normalized === spec ? match : `${prefix}${quote}${normalized}${closeQuote}`;
  });
  if (next !== original) await fs.writeFile(file, next, 'utf8');
}

const files = await walk(dist);
let count = 0;
for (const f of files) {
  if (f.endsWith('.js') || f.endsWith('.mjs') || f.endsWith('.cjs')) count++;
  await normalizeFile(f);
}
console.log(`Normalized ESM imports in ${count} files under ${dist}`);
