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
  const paramNames = new Set<string>();
  if (params.length > 0) {
    lines.push('begin parameters');
    for (const p of params) {
      const id = p.getAttribute('id') || p.getAttribute('name') || 'p';
      // Priority: expr attribute often contains the formula if it's dynamic
      const val = p.getAttribute('expr') || p.getAttribute('value') || '';
      lines.push(`    ${id} ${val}`);
      paramNames.add(id);
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
        const comp = s.getAttribute('compartment');
        const conc = s.getAttribute('concentration') || s.getAttribute('initialConcentration') || s.getAttribute('initialAmount') || '0';
        const fullSpecies = comp ? `${name}@${comp}` : name;
        lines.push(`    ${escapeName(fullSpecies)}   ${conc}`);
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
          // Build bond map first
          const bondIndex = new Map<string, number>();
          let nextBond = 1;
          const bondList = pattern.getElementsByTagName('ListOfBonds')[0];
          if (bondList) {
            const bonds = Array.from(bondList.getElementsByTagName('Bond'));
            for (const b of bonds) {
              const s1 = b.getAttribute('site1') || '';
              const s2 = b.getAttribute('site2') || '';
              if (s1 && s2) {
                bondIndex.set(s1, nextBond);
                bondIndex.set(s2, nextBond);
                nextBond++;
              }
            }
          }

          const molecules = Array.from(pattern.getElementsByTagName('Molecule'));
          const molStrs = molecules.map(m => {
            const mname = m.getAttribute('name') || '';
            const mcomp = m.getAttribute('compartment');
            const comps = Array.from(m.getElementsByTagName('Component'));
            const compStr = comps.map(c => {
              const cname = c.getAttribute('name') || '';
              const cid = c.getAttribute('id') || '';
              const sattr = c.getAttribute('state');
              const nb = c.getAttribute('numberOfBonds');
              const bAttr = c.getAttribute('bond');

              let s = cname;
              if (sattr) s += `~${sattr}`;

              // Handle bond constraints
              if (bondIndex.has(cid)) {
                s += `!${bondIndex.get(cid)}`;
              } else if (nb && nb.includes('+')) {
                s += '!+';
              } else if (nb && nb.includes('?')) {
                s += '!?';
              } else if (bAttr) {
                // Fallback for direct bond attribute
                if (bAttr === '+' || bAttr.includes('+')) s += '!+';
                else if (bAttr === '?' || bAttr.includes('?')) s += '!?';
                else if (bAttr !== '0') s += `!${bAttr}`;
              }
              
              return s;
            }).filter(Boolean).join(',');
            const base = compStr.length > 0 ? `${mname}(${compStr})` : `${mname}()`;
            return mcomp ? `${base}@${mcomp}` : base;
          });
          patternStr = molStrs.join('.');
          console.log(`[Parser Debug] Observable '${name}': reconstructed pattern '${patternStr}'`);
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
        // Attempt to extract mathematical expression; priority: <Expression> then <math>
        const exprTag = fn.getElementsByTagName('Expression')[0];
        const math = fn.getElementsByTagName('math')[0];
        const mathText = (exprTag ? (exprTag.textContent || '').trim() : (math ? (math.textContent || '').trim() : ''));
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
            const mcomp = m.getAttribute('compartment');
            const comps = Array.from(m.getElementsByTagName('Component'));
            const compStrs = comps.map(c => {
              const cname = c.getAttribute('name') || '';
              const state = c.getAttribute('state');
              const bond = c.getAttribute('bond');
              const numberOfBonds = c.getAttribute('numberOfBonds');
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
            const base = compStrs.length > 0 ? `${mname}(${compStrs.join(',')})` : `${mname}()`;
            return mcomp ? `${base}@${mcomp}` : base;
          });

          return molecules.length > 1 ? molStrs.join(isProduct ? '.' : ' + ') : molStrs.join('');
        }

        const reactStr = reactPatterns.map(p => patternToString(p, false)).join(' + ');
        const prodStr = prodPatterns.map(p => patternToString(p, true)).join(' + ');

        // Rate - reconstruct based on type (MM, Sat, etc) for parity with xmlparsers.py
        const rateEl = r.getElementsByTagName('RateLaw')[0];
        let rateName = '';
        if (rateEl) {
          const type = rateEl.getAttribute('type');
          if (type === 'Ele') {
            const rc = rateEl.getElementsByTagName('RateConstant')[0];
            if (rc) rateName = rc.getAttribute('value') || rc.textContent || '';
          } else if (type === 'Function') {
            rateName = rateEl.getAttribute('name') || '';
          } else if (type && ['MM', 'Sat', 'Hill', 'Arrhenius'].includes(type)) {
            const rcEls = Array.from(rateEl.getElementsByTagName('RateConstant'));
            let argVals = rcEls.map(rc => rc.getAttribute('value') || rc.textContent || '0');

            // PARITY FIX: Scale Km (arg 2) from Molar to Molecules if reaction is in a compartment
            // MM(kcat, Km) -> MM(kcat, Km * vol * NA)
            // Sat(kcat, Km) -> Sat(kcat, Km * vol * NA)
            if ((type === 'MM' || type === 'Sat') && argVals.length >= 2) {
                // Heuristic: determine reaction compartment from first reactant molecule
                const rPatternList = r.getElementsByTagName('ListOfReactantPatterns')[0];
                let rxnComp = '';
                if (rPatternList) {
                    const rPatterns = Array.from(rPatternList.getElementsByTagName('ReactantPattern'));
                    for (const rp of rPatterns) {
                        const mols = Array.from(rp.getElementsByTagName('Molecule'));
                        for (const m of mols) {
                             const c = m.getAttribute('compartment');
                             if (c) {
                                 rxnComp = c;
                                 break;
                             }
                        }
                        if (rxnComp) break;
                    }
                }

                if (rxnComp) {
                    const hasNA = paramNames.has('NA');
                    let scaleFactor = rxnComp;
                    if (hasNA) scaleFactor += ' * NA';
                    
                    // Wrap in parens to be safe
                    argVals[1] = `(${argVals[1]} * ${scaleFactor})`;
                    logger.info('BNGXML002', `Scaled ${type} constant for ${rxnComp}: ${argVals[1]}`);
                }
            }

            rateName = `${type}(${argVals.join(',')})`;
          } else {
            // Fallback for unknown types
            const rc = rateEl.getElementsByTagName('RateConstant')[0];
            if (rc) rateName = rc.getAttribute('value') || rc.textContent || '';
          }
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
