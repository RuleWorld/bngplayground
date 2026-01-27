#!/usr/bin/env ts-node-esm
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

async function main() {
  const xmlPath = join(process.cwd(), 'tmp_gene_expr_test', 'gene_expr_sbml.xml');
  const xml = readFileSync(xmlPath, 'utf8');

  // Shim for libsbmljs in Node
  const originalSelf = (globalThis as any).self;
  (globalThis as any).self = globalThis;

  try {
    let Atomizer: any;
    let res: any = null;
    try {
      const mod = await import('../src/lib/atomizer/index.ts');
      Atomizer = mod.Atomizer;
      const atomizer = new Atomizer();
      try {
        await atomizer.initialize();
        console.log('Running Atomizer.atomize(xml) ...');
        res = await atomizer.atomize(xml);
      } catch (e) {
        console.warn('Atomizer initialization/atomize failed:', e?.message || e);
        // continue to fallback
      }
    } catch (e) {
      console.warn('Failed to import Atomizer module (continuing to fallback):', e?.message || e);
      // continue to fallback
    }

    if (res && res.success && res.bngl && res.bngl.length > 0) {
      console.log('Atomizer succeeded. BNGL (first 400 chars):\n', res.bngl.slice(0, 400));
      // Optionally parse the BNGL for counts
      try {
        const { parseBNGL } = await import('../services/parseBNGL.ts');
        const parsed = parseBNGL(res.bngl);
        console.log('Parsed BNGL counts => MoleculeTypes:', parsed.moleculeTypes.length, 'Species:', parsed.species.length, 'ReactionRules:', parsed.reactionRules.length);
      } catch (e) {
        console.warn('Failed to parse BNGL output:', e?.message || e);
      }
    } else {
      if (res) console.warn('Atomizer returned no BNGL or failed:', res?.error || '(no error provided)');
      console.log('Falling back to a minimal local BNG SBML -> BNGL extraction (no project imports) ...');

      try {
        // Use xmldom to parse SBML and extract counts and a small BNGL text snippet
        const { DOMParser } = await import('@xmldom/xmldom');
        const doc = new DOMParser().parseFromString(xml, 'application/xml');
        const modelEl = doc.getElementsByTagName('model')[0];

        // Support both BNG-specific capitalized tags and standard SBML lowercase tags
        const mtypes = modelEl.getElementsByTagName('ListOfMoleculeTypes')[0] || modelEl.getElementsByTagName('listOfMoleculeTypes')[0];
        const moleculeTypes = mtypes ? Array.from(mtypes.getElementsByTagName('MoleculeType')).map((el: any) => el.getAttribute('id') || el.getAttribute('name') || 'M') : [];

        const speciesEls = modelEl.getElementsByTagName('ListOfSpecies')[0] || modelEl.getElementsByTagName('listOfSpecies')[0];
        const species = speciesEls ? Array.from(speciesEls.getElementsByTagName('Species').length ? speciesEls.getElementsByTagName('Species') : speciesEls.getElementsByTagName('species')).map((el: any) => ({ name: el.getAttribute('name') || el.getAttribute('id') || '', conc: el.getAttribute('concentration') || el.getAttribute('initialConcentration') || el.getAttribute('initialAmount') || '0' })) : [];

        const rxnEls = modelEl.getElementsByTagName('ListOfReactionRules')[0] || modelEl.getElementsByTagName('listOfReactionRules')[0] || modelEl.getElementsByTagName('ListOfReactions')[0] || modelEl.getElementsByTagName('listOfReactions')[0];
        const rxns = rxnEls ? Array.from(rxnEls.getElementsByTagName('ReactionRule').length ? rxnEls.getElementsByTagName('ReactionRule') : rxnEls.getElementsByTagName('reaction')) : [];

        console.log('Extracted counts => MoleculeTypes:', moleculeTypes.length, 'Species:', species.length, 'ReactionRules:', rxns.length);

        // Build a tiny BNGL sample
        const lines: string[] = [];
        if (moleculeTypes.length > 0) {
          lines.push('begin molecule types');
          for (const mt of moleculeTypes) lines.push(`    ${mt}()`);
          lines.push('end molecule types', '');
        }
        if (species.length > 0) {
          lines.push('begin seed species');
          for (const s of species) lines.push(`    ${s.name}   ${s.conc}`);
          lines.push('end seed species', '');
        }
        if (rxns.length > 0) {
          lines.push('begin reaction rules');
          for (const r of rxns) {
            // Attempt to extract a simple rate
            const rateEl = (r.getElementsByTagName('RateLaw')[0] || r.getElementsByTagName('RateConstant')[0]);
            let rate = '';
            if (rateEl) rate = rateEl.getAttribute('value') || rateEl.textContent || '';
            lines.push(`    # reaction rule (rate=${rate || 'NA'})`);
          }
          lines.push('end reaction rules', '');
        }

        const snippet = lines.join('\n');
        console.log('Local-converted BNGL snippet:\n', snippet.slice(0, 1000));

        // Try to parse the snippet using parseBNGL if available
        try {
          const { parseBNGL } = await import('../services/parseBNGL.ts');
          const parsed = parseBNGL(snippet);
          console.log('Parsed local BNGL counts => MoleculeTypes:', parsed.moleculeTypes.length, 'Species:', parsed.species.length, 'ReactionRules:', parsed.reactionRules.length);
        } catch (e) {
          console.warn('Skipping BNGL parse (parseBNGL import failed):', e?.message || e);
        }

      } catch (e) {
        console.error('Local extraction failed:', e?.message || e);
      }
    }
  } finally {
    (globalThis as any).self = originalSelf;
  }
}

main().catch(e => { console.error(e); process.exit(1); });