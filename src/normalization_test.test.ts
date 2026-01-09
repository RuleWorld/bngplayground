// @ts-nocheck
import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { BNGLParser } from './services/graph/core/BNGLParser';
import { NetworkGenerator } from './services/graph/NetworkGenerator';
import { GraphCanonicalizer } from './services/graph/core/Canonical';
import { parseBNGL } from '../services/parseBNGL';

/**
 * Normalize BNG2 species through Web parser and trace missing species origins
 */
describe('Species Normalization and Tracing', () => {
  const modelPath = path.join(__dirname, '..', 'published-models', 'cell-regulation', 'Barua_2013.bngl');
  const outputDir = path.join(__dirname, '..', 'species_comparison_output');

  beforeAll(async () => {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  });

  it('should normalize BNG2 species and compare canonical forms', async () => {
    // Read web species (already canonical)
    const webSpeciesPath = path.join(outputDir, 'web_species.txt');
    const webSpecies = fs.readFileSync(webSpeciesPath, 'utf-8').split('\n').filter(s => s.trim());
    const webCanonicalSet = new Set(webSpecies);

    console.log('\n=== Normalizing BNG2 Species ===');
    console.log(`Web species count: ${webSpecies.length}`);

    // Read BNG2 species (raw)
    const bng2SpeciesPath = path.join(outputDir, 'bng2_species_clean.txt');
    const bng2Species = fs.readFileSync(bng2SpeciesPath, 'utf-8').split('\n').filter(s => s.trim());
    console.log(`BNG2 species count: ${bng2Species.length}`);

    // Parse each BNG2 species through Web parser and canonicalize
    const bng2Canonical: string[] = [];
    const parseErrors: string[] = [];
    const canonicalToOriginal = new Map<string, string>();

    for (const spec of bng2Species) {
      try {
        const parsed = BNGLParser.parseSpeciesGraph(spec);
        const canonical = GraphCanonicalizer.canonicalize(parsed);
        bng2Canonical.push(canonical);
        canonicalToOriginal.set(canonical, spec);
      } catch (e: any) {
        parseErrors.push(`${spec}: ${e.message}`);
      }
    }

    console.log(`BNG2 species parsed: ${bng2Canonical.length}`);
    console.log(`Parse errors: ${parseErrors.length}`);

    // Write parse errors
    if (parseErrors.length > 0) {
      fs.writeFileSync(
        path.join(outputDir, 'parse_errors.txt'),
        parseErrors.join('\n')
      );
      console.log('First 5 parse errors:');
      parseErrors.slice(0, 5).forEach(e => console.log(`  ${e}`));
    }

    // Compare canonical forms
    const bng2CanonicalSet = new Set(bng2Canonical);

    // Find species with duplicate canonical forms in BNG2
    const canonicalCounts = new Map<string, number>();
    for (const c of bng2Canonical) {
      canonicalCounts.set(c, (canonicalCounts.get(c) || 0) + 1);
    }
    const duplicates = [...canonicalCounts.entries()].filter(([_, count]) => count > 1);
    console.log(`\nBNG2 duplicate canonical forms: ${duplicates.length}`);

    // Find species only in BNG2 (after canonicalization)
    const onlyInBng2: string[] = [];
    for (const c of bng2CanonicalSet) {
      if (!webCanonicalSet.has(c)) {
        onlyInBng2.push(c);
      }
    }

    // Find species only in Web
    const onlyInWeb: string[] = [];
    for (const c of webCanonicalSet) {
      if (!bng2CanonicalSet.has(c)) {
        onlyInWeb.push(c);
      }
    }

    console.log(`\n=== After Canonical Normalization ===`);
    console.log(`Web unique canonical: ${webCanonicalSet.size}`);
    console.log(`BNG2 unique canonical: ${bng2CanonicalSet.size}`);
    console.log(`Only in BNG2 (after normalization): ${onlyInBng2.length}`);
    console.log(`Only in Web: ${onlyInWeb.length}`);

    // Write normalized comparison
    fs.writeFileSync(
      path.join(outputDir, 'only_in_bng2_normalized.txt'),
      onlyInBng2.map(c => `${c}\n  Original: ${canonicalToOriginal.get(c) || 'N/A'}`).join('\n\n')
    );

    fs.writeFileSync(
      path.join(outputDir, 'only_in_web_normalized.txt'),
      onlyInWeb.join('\n')
    );

    // Analyze patterns in missing species
    console.log('\n=== Pattern Analysis (Only in BNG2) ===');
    const ssdCount = onlyInBng2.filter(s => s.includes('ss~d')).length;
    const sslCount = onlyInBng2.filter(s => s.includes('ss~l')).length;
    console.log(`Degraded (ss~d): ${ssdCount}`);
    console.log(`Live (ss~l): ${sslCount}`);

    // Check for phosphorylation patterns
    const s33s37P = onlyInBng2.filter(s => s.includes('s33s37~P')).length;
    const s45P = onlyInBng2.filter(s => s.includes('s45~P')).length;
    console.log(`s33s37~P: ${s33s37P}`);
    console.log(`s45~P: ${s45P}`);

    // Show first 15 missing species
    console.log('\n=== First 15 species only in BNG2 ===');
    onlyInBng2.slice(0, 15).forEach((s, i) => {
      console.log(`${i + 1}. ${s}`);
      console.log(`   Original: ${canonicalToOriginal.get(s) || 'N/A'}`);
    });

    expect(bng2Canonical.length).toBeGreaterThan(0);
  }, 180000);

  it('should trace which rules generate missing species', async () => {
    console.log('\n=== Tracing Missing Species Origins ===');

    // Parse the model
    const bnglContent = fs.readFileSync(modelPath, 'utf-8');
    const parsedModel = parseBNGL(bnglContent);

    // Get the rules
    const rules = parsedModel.reactionRules;
    console.log(`Total rules: ${rules.length}`);

    // Read missing species
    const missingPath = path.join(outputDir, 'only_in_bng2_normalized.txt');
    if (!fs.existsSync(missingPath)) {
      console.log('No missing species file found. Run normalization test first.');
      return;
    }

    const missingContent = fs.readFileSync(missingPath, 'utf-8');
    const missingSpecies = missingContent.split('\n\n').map(block => {
      const lines = block.split('\n');
      return lines[0]; // Get canonical form
    }).filter(s => s.trim());

    console.log(`Missing species to trace: ${missingSpecies.length}`);

    // Analyze which rule patterns could produce these species
    const rulePatterns: Record<string, number> = {};

    for (const spec of missingSpecies) {
      // Check which molecule types are involved
      if (spec.includes('APC') && spec.includes('a20~P') && spec.includes('bCat')) {
        rulePatterns['APC-bCat ARM34 binding (R25-like)'] = (rulePatterns['APC-bCat ARM34 binding (R25-like)'] || 0) + 1;
      }
      if (spec.includes('AXIN') && spec.includes('bCat') && spec.includes('ss~d')) {
        rulePatterns['AXIN-bCat dissociation (R117-118)'] = (rulePatterns['AXIN-bCat dissociation (R117-118)'] || 0) + 1;
      }
      if (spec.includes('APC') && spec.includes('ss~d') && spec.includes('ARM59')) {
        rulePatterns['APC-bCat ARM59 dissociation (R114-115)'] = (rulePatterns['APC-bCat ARM59 dissociation (R114-115)'] || 0) + 1;
      }
      if (spec.includes('GSK3b') && spec.includes('AXIN')) {
        rulePatterns['GSK3b-AXIN binding (R14)'] = (rulePatterns['GSK3b-AXIN binding (R14)'] || 0) + 1;
      }
      if (spec.includes('CK1a') && spec.includes('AXIN')) {
        rulePatterns['CK1a-AXIN binding (R15)'] = (rulePatterns['CK1a-AXIN binding (R15)'] || 0) + 1;
      }
    }

    console.log('\n=== Rule Pattern Analysis ===');
    const sortedPatterns = Object.entries(rulePatterns).sort((a, b) => b[1] - a[1]);
    for (const [pattern, count] of sortedPatterns) {
      console.log(`${pattern}: ${count}`);
    }

    // List the rules with dissociation patterns
    console.log('\n=== Dissociation Rules (lines 114-118) ===');
    const dissociationRules = rules.filter(r => {
      const ruleStr = JSON.stringify(r);
      return ruleStr.includes('ss~d') && (ruleStr.includes('ARM59') || ruleStr.includes('ARM34'));
    });

    console.log(`Found ${dissociationRules.length} dissociation rules`);
    dissociationRules.forEach((r, i) => {
      console.log(`${i + 1}. ${r.reactants?.join(' + ') || 'N/A'} -> ${r.products?.join(' + ') || 'N/A'}`);
    });

    expect(true).toBe(true);
  }, 60000);
});
