/**
 * Convert BioNetGen-exported SBML (BNG-SBML) back to BNGL text
 * This is a pragmatic fallback used when SBML contains BNG-specific
 * sections like <ListOfMoleculeTypes>, <ListOfSpecies>, <ListOfReactionRules>.
 */

import { DOMParser } from '@xmldom/xmldom';
import { logger } from '../utils/helpers';

function escapeName(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

export function convertBNGXmlToBNGL(xml: string): string {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const modelEl = doc.getElementsByTagName('model')[0];
  if (!modelEl) throw new Error('No <model> element found in SBML');

  const lines: string[] = [];

  // Parameters
  const params = Array.from(modelEl.getElementsByTagName('ListOfParameters')[0]?.getElementsByTagName('Parameter') || []);
  if (params.length > 0) {
    lines.push('begin parameters');
    for (const p of params) {
      const id = p.getAttribute('id') || p.getAttribute('name') || 'p';
      const val = p.getAttribute('value') || p.getAttribute('expr') || '';
      lines.push(`    ${id} ${val}`);
    }
    lines.push('end parameters', '');
  }

  // Compartments (optional)
  const comps = Array.from(modelEl.getElementsByTagName('ListOfCompartments')[0]?.getElementsByTagName('Compartment') || []);
  if (comps.length > 0) {
    lines.push('begin compartments');
    for (const c of comps) {
      const id = c.getAttribute('id') || c.getAttribute('name') || 'c';
      const size = c.getAttribute('size') || '1';
      lines.push(`    ${id} ${size}`);
    }
    lines.push('end compartments', '');
  }

  // Molecule types
  const mtList = modelEl.getElementsByTagName('ListOfMoleculeTypes')[0];
  const moleculeTypes: string[] = [];
  if (mtList) {
    const mtypes = Array.from(mtList.getElementsByTagName('MoleculeType'));
    if (mtypes.length > 0) {
      lines.push('begin molecule types');
      for (const mt of mtypes) {
        const id = mt.getAttribute('id') || 'M';
        const comps = Array.from(mt.getElementsByTagName('ComponentType'));
        const compStrs = comps.map(c => {
          const cname = c.getAttribute('id') || c.getAttribute('name') || 'c';
          const allowed = Array.from(c.getElementsByTagName('AllowedState')).map(s => s.getAttribute('id') || s.textContent || '').filter(Boolean);
          return allowed.length > 0 ? `${cname}~${allowed.join('~')}` : cname;
        });
        const line = `    ${id}(${compStrs.join(',')})`;
        moleculeTypes.push(id);
        lines.push(line);
      }
      lines.push('end molecule types', '');
    }
  }

  // Seed species
  const speciesListEl = modelEl.getElementsByTagName('ListOfSpecies')[0];
  if (speciesListEl) {
    const speciesEls = Array.from(speciesListEl.getElementsByTagName('Species'));
    if (speciesEls.length > 0) {
      lines.push('begin seed species');
      for (const s of speciesEls) {
        const name = s.getAttribute('name') || s.getAttribute('id') || '';
        const conc = s.getAttribute('concentration') || s.getAttribute('initialConcentration') || s.getAttribute('initialAmount') || '0';
        lines.push(`    ${escapeName(name)}   ${conc}`);
      }
      lines.push('end seed species', '');
    }
  }

  // Observables
  const obsListEl = modelEl.getElementsByTagName('ListOfObservables')[0];
  if (obsListEl) {
    const obsEls = Array.from(obsListEl.getElementsByTagName('Observable'));
    if (obsEls.length > 0) {
      lines.push('begin observables');
      for (const o of obsEls) {
        const type = o.getAttribute('type') || 'Molecules';
        const name = o.getAttribute('name') || o.getAttribute('id') || 'obs';
        // Extract first pattern text
        const pattern = o.getElementsByTagName('Pattern')[0];
        let patternStr = '';
        if (pattern) {
          const molecules = Array.from(pattern.getElementsByTagName('Molecule'));
          const molStrs = molecules.map(m => {
            const mname = m.getAttribute('name') || '';
            const comps = Array.from(m.getElementsByTagName('Component'));
            const compStr = comps.map(c => {
              const sattr = c.getAttribute('state');
              return sattr ? `${c.getAttribute('name')}~${sattr}` : `${c.getAttribute('name')}`;
            }).filter(Boolean).join(',');
            return compStr.length > 0 ? `${mname}(${compStr})` : `${mname}()`;
          });
          patternStr = molStrs.join('.');
        }
        lines.push(`    ${type}    ${name}    ${patternStr}`);
      }
      lines.push('end observables', '');
    }
  }

  // Functions (optional)
  const fList = modelEl.getElementsByTagName('ListOfFunctions')[0];
  if (fList) {
    const functions = Array.from(fList.getElementsByTagName('Function'));
    if (functions.length > 0) {
      lines.push('begin functions');
      for (const fn of functions) {
        const fname = fn.getAttribute('id') || fn.getAttribute('name') || 'f';
        // Attempt to extract mathematical expression; if not available, skip
        const math = fn.getElementsByTagName('math')[0];
        const mathText = math ? (math.textContent || '').trim() : '';
        lines.push(`    function ${fname} = ${mathText}`);
      }
      lines.push('end functions', '');
    }
  }

  // Reaction rules
  const rxnListEl = modelEl.getElementsByTagName('ListOfReactionRules')[0];
  if (rxnListEl) {
    const rxnEls = Array.from(rxnListEl.getElementsByTagName('ReactionRule'));
    if (rxnEls.length > 0) {
      lines.push('begin reaction rules');

      for (const r of rxnEls) {
        const reactPatterns = Array.from(r.getElementsByTagName('ListOfReactantPatterns')[0]?.getElementsByTagName('ReactantPattern') || []);
        const prodPatterns = Array.from(r.getElementsByTagName('ListOfProductPatterns')[0]?.getElementsByTagName('ProductPattern') || []);

        function patternToString(patEl: Element, isProduct = false): string {
          // Iterate molecules in this pattern
          const molecules = Array.from(patEl.getElementsByTagName('Molecule')) || [];
          // Gather bonds in this pattern (if product pattern contains ListOfBonds)
          const bondEls = Array.from(patEl.getElementsByTagName('ListOfBonds')[0]?.getElementsByTagName('Bond') || []);
          // Map component id -> bond index
          const bondIndex = new Map<string, number>();
          let nextBond = 1;
          for (const b of bondEls) {
            const s1 = b.getAttribute('site1') || '';
            const s2 = b.getAttribute('site2') || '';
            const key = `${s1}__${s2}`;
            if (!bondIndex.has(key)) {
              bondIndex.set(key, nextBond++);
            }
            // store both directions
            bondIndex.set(s1 + '__' + s2, bondIndex.get(key)!);
            bondIndex.set(s2 + '__' + s1, bondIndex.get(key)!);
          }

          // For product patterns, there might be bond references (ids in components)
          const molStrs = molecules.map(m => {
            const mname = m.getAttribute('name') || '';
            const comps = Array.from(m.getElementsByTagName('Component'));
            const compStrs = comps.map(c => {
              const cname = c.getAttribute('name') || '';
              const state = c.getAttribute('state');
              const cid = c.getAttribute('id') || '';
              let cs = cname;
              if (state) cs += `~${state}`;
              // find any bond index that references this component id
              // search in bond elements site1/site2
              let foundBond = null;
              for (const b of bondEls) {
                if (b.getAttribute('site1') === cid || b.getAttribute('site2') === cid) {
                  // determine partner id
                  const s1 = b.getAttribute('site1') || '';
                  const s2 = b.getAttribute('site2') || '';
                  const partner = (s1 === cid) ? s2 : s1;
                  const key = `${cid}__${partner}`;
                  const k2 = `${partner}__${cid}`;
                  const bi = bondIndex.get(key) || bondIndex.get(k2);
                  if (bi) {
                    foundBond = bi;
                    break;
                  }
                }
              }
              if (foundBond) cs += `!${foundBond}`;
              return cs;
            });
            return compStrs.length > 0 ? `${mname}(${compStrs.join(',')})` : `${mname}()`;
          });

          return molecules.length > 1 ? molStrs.join(isProduct ? '.' : ' + ') : molStrs.join('');
        }

        const reactStr = reactPatterns.map(p => patternToString(p, false)).join(' + ');
        const prodStr = prodPatterns.map(p => patternToString(p, true)).join(' + ');

        // Rate - pick first RateConstant value or default
        const rateEl = r.getElementsByTagName('RateLaw')[0];
        let rateName = '';
        if (rateEl) {
          const rc = rateEl.getElementsByTagName('RateConstant')[0];
          if (rc) rateName = rc.getAttribute('value') || rc.textContent || '';
        }

        lines.push(`    ${reactStr} -> ${prodStr}   ${rateName}`);
      }

      lines.push('end reaction rules', '');
    }
  }

  // Return BNGL text
  const bngl = lines.join('\n');
  logger.info('BNGXML001', 'Converted BNG SBML to BNGL (fallback)');
  return bngl;
}
