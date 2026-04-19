#!/usr/bin/env tsx
/**
 * scripts/generation/generate_tab_docs.ts
 *
 * Walk src/components/tabs/ to discover every tab component, then emit
 * docs/analysis-tabs.md with one auto-stub section per tab. The stub is
 * meant to be hand-polished: it includes the tab's file path, component name,
 * any JSDoc-style top-of-file comment, and placeholders for screenshots +
 * workflow notes. After hand-polishing, the script no longer overwrites
 * content between the AUTO-START / AUTO-END markers it emits — only refreshes
 * the generated sections.
 *
 * This is a two-mode tool:
 *   - First run (no existing file): write full skeleton.
 *   - Subsequent runs (file exists): refresh only the auto-managed blocks.
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, basename, resolve, dirname } from 'node:path';

const TABS_ROOT = 'src/components/tabs';
const OUT_PATH = 'docs/analysis-tabs.md';
const TAB_REGISTRY_PATH = 'src/components/layout/TabRegistry.ts';

interface TabEntry {
  id: string;
  label: string;
  filePath: string;       // absolute
  relPath: string;        // relative to repo root
  componentName: string;
  summary: string;        // first non-empty line of top-of-file JSDoc or null
  category?: string;
}

// ── Discovery ──────────────────────────────────────────────────────────────

function discoverTabs(): TabEntry[] {
  const root = resolve(TABS_ROOT);
  if (!existsSync(root)) {
    console.error(`${TABS_ROOT} does not exist — this project may not follow the standard tab layout`);
    process.exit(1);
  }

  const files = walk(root).filter((p) => /Tab\.tsx$/.test(p));
  const byId = new Map<string, TabEntry>();

  for (const filePath of files) {
    const content = readFileSync(filePath, 'utf8');
    const componentName = basename(filePath, '.tsx');
    const id = componentName.replace(/Tab$/, '').replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
    const label = humanizeId(id);
    const summary = extractFileHeader(content);
    byId.set(id, {
      id,
      label,
      filePath,
      relPath: filePath.replace(resolve('.') + '/', ''),
      componentName,
      summary,
    });
  }

  // Augment with category from the TabRegistry if present.
  if (existsSync(TAB_REGISTRY_PATH)) {
    const reg = readFileSync(TAB_REGISTRY_PATH, 'utf8');
    // Best-effort: look for `{ id: 'foo', category: 'bar' }` patterns.
    const catRe = /\bid:\s*['"]([a-z0-9-]+)['"][^}]*?\bcategory:\s*['"]([^'"]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = catRe.exec(reg))) {
      const tab = byId.get(m[1]);
      if (tab) tab.category = m[2];
    }
  }

  return [...byId.values()].sort((a, b) => {
    const ca = a.category ?? 'zzz';
    const cb = b.category ?? 'zzz';
    return ca.localeCompare(cb) || a.label.localeCompare(b.label);
  });
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...walk(full));
    else if (/\.tsx$/.test(name)) out.push(full);
  }
  return out;
}

function extractFileHeader(content: string): string {
  // JSDoc-style block at the top of the file.
  const m = /^\s*\/\*\*([\s\S]*?)\*\//.exec(content);
  if (m) {
    const lines = m[1].split('\n')
      .map((l) => l.replace(/^\s*\*\s?/, ''))
      .filter((l) => l.trim().length > 0);
    if (lines.length > 0) return lines[0].trim();
  }
  // Line-comment at the top (optional).
  const lineMatch = /^(\/\/[^\n]*)/.exec(content);
  if (lineMatch) return lineMatch[1].replace(/^\/\/\s*/, '').trim();
  return '';
}

function humanizeId(id: string): string {
  return id.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// ── Rendering ──────────────────────────────────────────────────────────────

const AUTO_START = '<!-- AUTO-GENERATED-TAB-ENTRIES-START — do not edit between markers -->';
const AUTO_END = '<!-- AUTO-GENERATED-TAB-ENTRIES-END -->';

function renderAutoSection(tabs: TabEntry[]): string {
  const out: string[] = [AUTO_START];
  const byCategory = new Map<string, TabEntry[]>();
  for (const t of tabs) {
    const c = t.category ?? 'Other';
    if (!byCategory.has(c)) byCategory.set(c, []);
    byCategory.get(c)!.push(t);
  }

  for (const [category, items] of byCategory) {
    out.push('');
    out.push(`#### ${category}`);
    out.push('');
    for (const t of items) {
      out.push(`- **${t.label}** (\`${t.id}\`) — ${t.summary || 'no description available'}.`);
      out.push(`  Source: [\`${t.relPath}\`](https://github.com/RuleWorld/bngplayground/blob/main/${t.relPath})`);
    }
  }
  out.push('');
  out.push(AUTO_END);
  return out.join('\n');
}

function renderFullSkeleton(tabs: TabEntry[]): string {
  const lines: string[] = [];
  lines.push('# Analysis tabs');
  lines.push('');
  lines.push('BNG Playground organizes its functionality into interactive tabs, each exposing a specific workflow or analysis method. This page documents every tab, its intended workflow, and how to reach the equivalent functionality through the MCP server (for agent-driven use).');
  lines.push('');
  lines.push('The tab summary list below is auto-generated by `scripts/generation/generate_tab_docs.ts`. The per-tab detail sections below the marker are hand-written.');
  lines.push('');
  lines.push('## Quick reference');
  lines.push('');
  lines.push(renderAutoSection(tabs));
  lines.push('');
  lines.push('## Tab details');
  lines.push('');
  for (const t of tabs) {
    lines.push(`### ${t.label}`);
    lines.push('');
    lines.push(`Component: \`${t.componentName}\`  `);
    lines.push(`Source: \`${t.relPath}\`  `);
    if (t.category) lines.push(`Category: **${t.category}**  `);
    lines.push('');
    lines.push('**Workflow:**');
    lines.push('');
    lines.push('<!-- TODO: describe the tab\'s intended workflow, screenshots, and common pitfalls -->');
    lines.push('');
    lines.push('**MCP equivalent:**');
    lines.push('');
    lines.push('<!-- TODO: list the MCP tools that expose equivalent functionality for agent-driven use -->');
    lines.push('');
    lines.push('**See also:**');
    lines.push('');
    lines.push('<!-- TODO: cross-references to tutorials, design docs, and related tabs -->');
    lines.push('');
    lines.push('---');
    lines.push('');
  }
  return lines.join('\n');
}

function refreshAutoBlock(existing: string, tabs: TabEntry[]): string {
  const startIdx = existing.indexOf(AUTO_START);
  const endIdx = existing.indexOf(AUTO_END);
  if (startIdx < 0 || endIdx < 0 || endIdx < startIdx) {
    console.warn('Existing file missing AUTO markers — falling back to full skeleton.');
    return renderFullSkeleton(tabs);
  }
  const before = existing.slice(0, startIdx);
  const after = existing.slice(endIdx + AUTO_END.length);
  return before + renderAutoSection(tabs) + after;
}

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  const tabs = discoverTabs();
  if (tabs.length === 0) {
    console.error('No tab components discovered. Check TABS_ROOT.');
    process.exit(1);
  }

  mkdirSync(dirname(resolve(OUT_PATH)), { recursive: true });

  let out: string;
  if (existsSync(OUT_PATH)) {
    out = refreshAutoBlock(readFileSync(OUT_PATH, 'utf8'), tabs);
    console.log(`refreshed AUTO block in ${OUT_PATH} (${tabs.length} tabs)`);
  } else {
    out = renderFullSkeleton(tabs);
    console.log(`wrote ${OUT_PATH} with full skeleton (${tabs.length} tabs)`);
  }
  writeFileSync(OUT_PATH, out);

  // Emit a JSON side-file for CI drift checks.
  writeFileSync(
    resolve('docs/.tab-registry.json'),
    JSON.stringify(tabs.map(({ filePath: _f, ...rest }) => rest), null, 2),
  );
}

main();
