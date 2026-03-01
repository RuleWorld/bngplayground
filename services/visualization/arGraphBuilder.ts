import type { ReactionRule } from '../../types';
import type { AtomRuleGraph, AREdge, ARNode } from '../../types/visualization';
import {
  extractAtoms,
  parseSpeciesGraphs,
} from './speciesGraphUtils';
import { getExpressionDependencies } from '../../src/parser/ExpressionDependencies';

interface AtomRuleGraphOptions {
  getRuleId?: (rule: ReactionRule, index: number) => string;
  getRuleLabel?: (rule: ReactionRule, index: number) => string;
  // Optional: all observables and functions to resolve regulatory dependencies
  observables?: Array<{ name: string; pattern: string }>;
  functions?: Array<{ name: string; expression: string }>;
  /**
   * Include rate‑law/regulatory dependencies. Web UI defaults to true for
   * convenience; turn off when comparing against BNG2.pl (“parity mode”).
   */
  includeRateLawDeps?: boolean;
  /**
   * Atomization strategy. 'standard' breaks species into component/state/bond
   * atoms (web default). 'bng2' keeps each reactant/product string intact,
   * matching the way BNG2.pl names atomic patterns.
   */
  atomization?: 'standard' | 'bng2';
}

/** prettify string the way BNG2.pl does: add spaces around arrows and commas. */
const prettify = (s: string): string => {
  let result = s;
  // BNG2.pl prettify only adds spaces around -> and ,
  if (result.includes('->')) {
    if (!/\s->\s/.test(result)) {
      result = result.split('->').map(p => prettify(p.trim())).join(' -> ');
    }
  }
  if (result.includes(',')) {
    if (!/\s,\s/.test(result)) {
      result = result.split(',').map(p => p.trim()).join(' , ');
    }
  }
  return result;
};

/**
 * Filter out patterns that contain "?" (wildcard) as they are suppressed in BNG2 graphs.
 */
const isSuppressed = (atomId: string): boolean => {
  return atomId.includes('~?') || atomId.includes('!?');
};

/**
 * Identify if a pattern is a bond wildcard (!+).
 */
const isWildcard = (atomId: string): boolean => {
  return atomId.includes('!+');
};

/**
 * Make a BNG2-style bond atom string from two (mol, comp) pairs.
 * BNG2 sorts the two endpoints alphabetically (matching makeAtomicPattern's `sort`),
 * then joins with a dot:  "Mol1(comp1!1).Mol2(comp2!1)".
 */
const makeBondAtom = (
  mol1: string, comp1: string,
  mol2: string, comp2: string,
): string => {
  const a = `${mol1}(${comp1}!1)`;
  const b = `${mol2}(${comp2}!1)`;
  return [a, b].sort().join('.');
};

/**
 * Make a BNG2-style free-component atom string: "Mol(comp)".
 */
const makeFreeAtom = (mol: string, comp: string): string => `${mol}(${comp})`;

/**
 * Make a BNG2-style state atom string: "Mol(comp~state)".
 */
const makeStateAtom = (mol: string, comp: string, state: string): string =>
  `${mol}(${comp}~${state})`;

/**
 * Decompose a pair of reactant/product SpeciesGraphs into BNG2-style atomic patterns,
 * mirroring NetworkGraph.pm makeTransformation + getContext.
 *
 * Returns three disjoint sets:
 *   reactants – atoms consumed by this rule's graph operations
 *   products  – atoms produced by this rule's graph operations
 *   context   – atoms present unchanged on both sides
 *
 * Graph operations detected (matching BNG2.pl Visualization/NetworkGraph.pm):
 *   ChangeState  A(c~u) → A(c~p)  : reactant=state, product=state
 *   AddBond      A(c) + B(d) → A(c!1).B(d!1)  : reactants=free, product=bond
 *   DeleteBond   A(c!1).B(d!1) → A(c) + B(d)  : reactant=bond, products=free
 *   AddMol       0 → A  : product = molecule atom
 *   DeleteMol    A → 0  : reactant = molecule atom
 */
const extractAtomicPatternsBNG2 = (
  reactantGraphs: import('@bngplayground/engine').SpeciesGraph[],
  productGraphs: import('@bngplayground/engine').SpeciesGraph[],
): { reactants: Set<string>; products: Set<string>; context: Set<string> } => {
  const reactants = new Set<string>();
  const products  = new Set<string>();
  const context   = new Set<string>();

  // Build molecule lists from each side
  // A SpeciesGraph wraps one or more molecules into a complex; flatten all
  // molecules into a matchable list indexed by (graphIdx, molIdx).
  interface MolEntry {
    name: string;
    comps: Array<{ name: string; state?: string; bondKey?: string }>;
    graphIdx: number;
    molIdx: number;
  }

  const flattenMols = (
    graphs: import('@bngplayground/engine').SpeciesGraph[],
  ): MolEntry[] => {
    const result: MolEntry[] = [];
    graphs.forEach((graph, gIdx) => {
      graph.molecules.forEach((mol, mIdx) => {
        const comps = mol.components.map((comp, cIdx) => {
          // Determine if this component has a bond partner
          const partners = graph.adjacency.get(`${mIdx}.${cIdx}`);
          let bondKey: string | undefined;
          if (partners && partners.length > 0) {
            // Build bond key as "molA:compA|molB:compB" (sorted)
            const [pm, pc] = partners[0].split('.').map(Number);
            const partnerMol  = graph.molecules[pm];
            const partnerComp = partnerMol?.components[pc];
            if (partnerMol && partnerComp) {
              bondKey = [mol.name + ':' + comp.name, partnerMol.name + ':' + partnerComp.name]
                .sort()
                .join('|');
            }
          }
          return { name: comp.name, state: comp.state ?? undefined, bondKey };
        });
        result.push({ name: mol.name, comps, graphIdx: gIdx, molIdx: mIdx });
      });
    });
    return result;
  };

  const rMols = flattenMols(reactantGraphs);
  const pMols = flattenMols(productGraphs);

  // Match molecules by name (first available) so we can compare per-component
  const usedP = new Set<number>();
  const rMatched = new Map<number, number>(); // rIdx → pIdx

  rMols.forEach((rMol, rIdx) => {
    const pIdx = pMols.findIndex((p, i) => !usedP.has(i) && p.name === rMol.name);
    if (pIdx >= 0) {
      usedP.add(pIdx);
      rMatched.set(rIdx, pIdx);
    }
  });

  // Track which (rIdx, cIdx) and (pIdx, cIdx) slots are already assigned to an operation
  const rUsedComp = new Set<string>(); // `${rIdx}.${cIdx}`
  const pUsedComp = new Set<string>(); // `${pIdx}.${cIdx}`

  // === ChangeState: same molecule, same component, different state ===
  rMatched.forEach((pIdx, rIdx) => {
    const rMol = rMols[rIdx];
    const pMol = pMols[pIdx];
    rMol.comps.forEach((rComp, cIdx) => {
      const pComp = pMol.comps[cIdx];
      if (!pComp) return;
      if (rComp.state !== undefined && pComp.state !== undefined &&
          rComp.state !== pComp.state &&
          rComp.state !== '?' && pComp.state !== '?') {
        reactants.add(makeStateAtom(rMol.name, rComp.name, rComp.state));
        products.add(makeStateAtom(pMol.name, pComp.name, pComp.state));
        rUsedComp.add(`${rIdx}.${cIdx}`);
        pUsedComp.add(`${pIdx}.${cIdx}`);
      }
    });
  });

  // === AddBond / DeleteBond: bond exists on one side only ===
  // Build bond-key sets for each side
  const rBondKeys = new Set<string>();
  const pBondKeys = new Set<string>();
  const rBondEntries = new Map<string, { rIdx: number; cIdx: number; mol: string; comp: string }[]>();
  const pBondEntries = new Map<string, { pIdx: number; cIdx: number; mol: string; comp: string }[]>();

  rMols.forEach((mol, rIdx) => {
    mol.comps.forEach((comp, cIdx) => {
      if (comp.bondKey && !rBondKeys.has(comp.bondKey)) {
        rBondKeys.add(comp.bondKey);
        rBondEntries.set(comp.bondKey, []);
      }
      if (comp.bondKey) {
        rBondEntries.get(comp.bondKey)!.push({ rIdx, cIdx, mol: mol.name, comp: comp.name });
      }
    });
  });
  pMols.forEach((mol, pIdx) => {
    mol.comps.forEach((comp, cIdx) => {
      if (comp.bondKey && !pBondKeys.has(comp.bondKey)) {
        pBondKeys.add(comp.bondKey);
        pBondEntries.set(comp.bondKey, []);
      }
      if (comp.bondKey) {
        pBondEntries.get(comp.bondKey)!.push({ pIdx, cIdx, mol: mol.name, comp: comp.name });
      }
    });
  });

  // AddBond: bond in products but not reactants
  pBondKeys.forEach(key => {
    if (!rBondKeys.has(key)) {
      const entries = pBondEntries.get(key)!;
      if (entries.length >= 2) {
        const [e0, e1] = entries;
        products.add(makeBondAtom(e0.mol, e0.comp, e1.mol, e1.comp));
        // The free components were reactants
        entries.forEach(e => {
          reactants.add(makeFreeAtom(e.mol, e.comp));
          pUsedComp.add(`${e.pIdx}.${e.cIdx}`);
        });
      }
    }
  });

  // DeleteBond: bond in reactants but not products
  rBondKeys.forEach(key => {
    if (!pBondKeys.has(key)) {
      const entries = rBondEntries.get(key)!;
      if (entries.length >= 2) {
        const [e0, e1] = entries;
        reactants.add(makeBondAtom(e0.mol, e0.comp, e1.mol, e1.comp));
        // The free components are products
        entries.forEach(e => {
          products.add(makeFreeAtom(e.mol, e.comp));
          rUsedComp.add(`${e.rIdx}.${e.cIdx}`);
        });
      }
    }
  });

  // === AddMol: molecule only in products, no match on reactant side ===
  pMols.forEach((pMol, pIdx) => {
    const hasReactantMatch = rMols.some((_, ri) => rMatched.get(ri) === pIdx);
    if (!hasReactantMatch && pMol.name !== '0') {
      products.add(pMol.name);
    }
  });

  // === DeleteMol: molecule only in reactants ===
  rMols.forEach((rMol, rIdx) => {
    if (!rMatched.has(rIdx) && rMol.name !== '0') {
      reactants.add(rMol.name);
    }
  });

  // === Context: atoms present unchanged on both sides of matched molecules ===
  rMatched.forEach((pIdx, rIdx) => {
    const rMol = rMols[rIdx];
    const pMol = pMols[pIdx];
    rMol.comps.forEach((rComp, cIdx) => {
      const pComp = pMol.comps[cIdx];
      if (!pComp) return;
      const rKey = `${rIdx}.${cIdx}`;
      const pKey = `${pIdx}.${cIdx}`;
      if (rUsedComp.has(rKey) || pUsedComp.has(pKey)) return; // already in an operation

      // State context
      if (rComp.state !== undefined && rComp.state === pComp.state && rComp.state !== '?') {
        context.add(makeStateAtom(rMol.name, rComp.name, rComp.state));
        return;
      }
      // Bond context (bond present on both sides and not an operation)
      if (rComp.bondKey && pComp.bondKey && rComp.bondKey === pComp.bondKey) {
        if (rBondKeys.has(rComp.bondKey) && pBondKeys.has(rComp.bondKey)) {
          const rEntries = rBondEntries.get(rComp.bondKey)!;
          if (rEntries.length >= 2) {
            const [e0, e1] = rEntries;
            context.add(makeBondAtom(e0.mol, e0.comp, e1.mol, e1.comp));
          }
        }
        return;
      }
      // Free component context (no state, no bond)
      if (!rComp.state && !rComp.bondKey && !pComp.state && !pComp.bondKey) {
        context.add(makeFreeAtom(rMol.name, rComp.name));
      }
    });
  });

  // Remove empty strings that can arise from edge cases (e.g. '0' molecules)
  [reactants, products, context].forEach(s => { s.delete(''); s.delete('0'); });

  return { reactants, products, context };
};

/**
 * Resolve wildcard edges by expanding Context edges to all matching concrete patterns.
 * This mirrors BNG2.pl's addWildcards + reprocessWildcards logic.
 */
const resolveWildcards = (
  nodes: ARNode[],
  edges: AREdge[],
): void => {
  const atomNodes = nodes.filter(n => n.type === 'atom');
  const wildcards = atomNodes.filter(n => isWildcard(n.id));
  const concrete = atomNodes.filter(n => !isWildcard(n.id) && !isSuppressed(n.id));

  // 1. Add 'wildcard' type edges from wildcard patterns to matching concrete patterns
  wildcards.forEach(wc => {
    const searchStr = wc.id.split('+')[0]; // e.g., "A(x!+)" -> "A(x!"
    concrete.forEach(con => {
      if (con.id.includes(searchStr)) {
        edges.push({
          from: wc.id,
          to: con.id,
          edgeType: 'wildcard',
        });
      }
    });
  });

  // 2. Expand 'modifies' (Context) edges involving wildcards
  const wcIds = new Set(wildcards.map(w => w.id));
  const newEdges: AREdge[] = [];
  const edgesToRemove = new Set<number>();

  edges.forEach((edge, idx) => {
    // In our graph, Context edges are atom -> rule (modifies), and we also
    // want to treat consumes/produces similarly when they involve a wildcard
    // atom.  Those should be expanded to the concrete partner atoms so that
    // no edge continues to reference a removed wildcard node.
    const isWildcardEdgeFrom = wcIds.has(edge.from);
    const isWildcardEdgeTo = wcIds.has(edge.to);

    // helper to expand an edge by replacing the wildcard endpoint with each
    // concrete match derived from existing wildcard->concrete edges
    const expand = (source: string, target: string, type: AREdge['edgeType']) => {
      const matches = edges.filter(e => e.edgeType === 'wildcard' && e.from === source);
      matches.forEach(m => {
        newEdges.push({
          from: m.to,
          to: target,
          edgeType: type,
        });
      });
    };

    if (isWildcardEdgeFrom && (edge.edgeType === 'modifies' || edge.edgeType === 'consumes')) {
      expand(edge.from, edge.to, edge.edgeType);
      edgesToRemove.add(idx);
    }
    if (isWildcardEdgeTo && (edge.edgeType === 'modifies' || edge.edgeType === 'produces')) {
      // when wildcard is the target we need to swap roles for expansion
      const matches = edges.filter(e => e.edgeType === 'wildcard' && e.from === edge.to);
      matches.forEach(m => {
        newEdges.push({
          from: edge.from,
          to: m.to,
          edgeType: edge.edgeType,
        });
      });
      edgesToRemove.add(idx);
    }
  });

  // Filter out removed edges and add new expanded ones
  // We also remove the 'wildcard' helper edges themselves at the end
  const filteredEdges = edges.filter((e, idx) => !edgesToRemove.has(idx) && e.edgeType !== 'wildcard').concat(newEdges);
  edges.length = 0;
  edges.push(...filteredEdges);

  // 3. Remove wildcard nodes – they were used to expand influence but shouldn't appear
  const finalNodes = nodes.filter(n => !wcIds.has(n.id));
  nodes.length = 0;
  nodes.push(...finalNodes);
};

// Cytoscape uses the id field to correlate nodes and edges.
// BNG bond atoms natively contain '.' inside their complex string names,
// e.g. "A(b!1).B(a!1)". We must preserve this full string so complexes do
// not alias/merge into the first molecule on the Cytoscape graph.
const sanitizeAtomId = (id: string) => id;

const ensureAtomNode = (
  atomId: string,
  nodes: ARNode[],
  atomSet: Set<string>,
  formatLabel: (id: string) => string,
): void => {
  const safeId = sanitizeAtomId(atomId);
  if (isSuppressed(safeId)) return;
  if (atomSet.has(safeId)) {
    return;
  }
  atomSet.add(safeId);
  nodes.push({
    id: safeId,
    type: 'atom',
    // keep full atomId for the label so the user sees the complete
    // pattern even though the internal id is stripped
    label: formatLabel(atomId),
  });
};

const addEdge = (
  from: string,
  to: string,
  edgeType: AREdge['edgeType'],
  edges: AREdge[],
  edgeSet: Set<string>,
): void => {
  const safeFrom = sanitizeAtomId(from);
  const safeTo = sanitizeAtomId(to);
  if (isSuppressed(safeFrom) || isSuppressed(safeTo)) return;
  const key = `${safeFrom}->${safeTo}:${edgeType}`;
  if (edgeSet.has(key)) {
    return;
  }
  edgeSet.add(key);
  edges.push({
    from: safeFrom,
    to: safeTo,
    edgeType,
  });
};

/**
 * Identify species used in an expression, expanding observables and functions as needed.
 */
const getSpeciesDependencies = (
  expression: string,
  observables: Array<{ name: string; pattern: string }> = [],
  functions: Array<{ name: string; expression: string }> = [],
): Set<string> => {
  const deps = getExpressionDependencies(expression);
  const speciesDeps = new Set<string>();

  const obsMap = new Map(observables.map(o => [o.name, o.pattern]));
  const funcMap = new Map(functions.map(f => [f.name, f.expression]));
  const seenIds = new Set<string>();

  const resolve = (id: string) => {
    if (seenIds.has(id)) return;
    seenIds.add(id);

    if (obsMap.has(id)) {
      const pattern = obsMap.get(id)!;
      // Pattern might be a comma-separated list of species patterns
      const speciesInPattern = pattern.split(',').map(s => s.trim().split('(')[0].trim());
      speciesInPattern.forEach(s => { if (s) speciesDeps.add(s); });
    } else if (funcMap.has(id)) {
      const funcExpr = funcMap.get(id)!;
      const subDeps = getExpressionDependencies(funcExpr);
      subDeps.forEach(resolve);
    } else {
      // It might be a direct species name or a parameter
      // Standard BNG regulatory graphs treat external symbols as species nodes.
      if (id) speciesDeps.add(id);
    }
  };

  deps.forEach(resolve);
  return speciesDeps;
};

export const buildAtomRuleGraph = (
  rules: ReactionRule[],
  options: AtomRuleGraphOptions = {},
): AtomRuleGraph => {
  const nodes: ARNode[] = [];
  const edges: AREdge[] = [];
  const atomIds = new Set<string>();
  const edgeIds = new Set<string>();

  // choose formatting strategy depending on atomization option
  const formatLabel = (atomId: string): string => {
    // When using BNG2 atomization we want the original species string to
    // appear exactly; skip prettification except for bond nodes which still
    // need whitespace around the dash for readability.  We also preserve the
    // "bond:" stripping logic as before.
    const skipPretty = options.atomization === 'bng2' && !atomId.startsWith('bond:');

    let cleanId = atomId.startsWith('bond:') ? atomId.substring(5) : atomId;

    if (cleanId.includes('|')) {
      // bond endpointals should still be prettified even in BNG2 mode
      const [leftRaw, rightRaw] = cleanId.split('|');
      const formatEndpoint = (endpoint: string): string => endpoint.replace(':', '.');
      const label = `${formatEndpoint(leftRaw)} — ${formatEndpoint(rightRaw ?? '')}`;
      return skipPretty ? label : prettify(label);
    }

    return skipPretty ? cleanId : prettify(cleanId);
  };

  // Pass 2: Process rules
  rules.forEach((rule, index) => {
    // rule ID/label – mirror BNG2.pl behavior for names beginning with digits
    let ruleId = options.getRuleId?.(rule, index) ?? rule.name ?? `rule_${index + 1}`;
    if (/^[0-9]/.test(ruleId)) {
      ruleId = `_${ruleId}`;
    }
    const ruleLabel = options.getRuleLabel?.(rule, index) ?? rule.name ?? `Rule ${index + 1}`;
    nodes.push({
      id: ruleId,
      type: 'rule',
      label: prettify(ruleLabel),
    });

    // 1. Structural dependencies (reactants/products)
    let reactantGraphs = [];
    let productGraphs = [];
    
    try {
      reactantGraphs = parseSpeciesGraphs(rule.reactants);
      productGraphs = parseSpeciesGraphs(rule.products);
    } catch (e) {
      console.warn(`[buildAtomRuleGraph] Failed to parse rule ${ruleId} graphs:`, e);
    }

    let reactantAtoms: Set<string>;
    let productAtoms: Set<string>;
    let contextAtoms: Set<string> = new Set();
    if (options.atomization === 'bng2') {
      // BNG2-style decomposition: derive atomic patterns from graph operations
      // (ChangeState, AddBond, DeleteBond, AddMol, DeleteMol) rather than
      // using whole species strings.  This matches BNG2.pl NetworkGraph.pm.
      const decomposed = extractAtomicPatternsBNG2(reactantGraphs, productGraphs);
      reactantAtoms = decomposed.reactants;
      productAtoms  = decomposed.products;
      contextAtoms  = decomposed.context;
    } else {
      reactantAtoms = extractAtoms(reactantGraphs);
      productAtoms = extractAtoms(productGraphs);
    }

    reactantAtoms.forEach((atom) => {
      ensureAtomNode(atom, nodes, atomIds, formatLabel);
      addEdge(atom, ruleId, 'consumes', edges, edgeIds);
    });

    productAtoms.forEach((atom) => {
      ensureAtomNode(atom, nodes, atomIds, formatLabel);
      addEdge(ruleId, atom, 'produces', edges, edgeIds);
    });

    // Context atoms (unchanged on both sides) – BNG2 'c' edges rendered as gray
    if (options.atomization === 'bng2') {
      contextAtoms.forEach((atom) => {
        ensureAtomNode(atom, nodes, atomIds, formatLabel);
        addEdge(atom, ruleId, 'modifies', edges, edgeIds);
      });
    } else {
      // Standard mode: atoms on both sides are context
      reactantAtoms.forEach((atom) => {
        if (productAtoms.has(atom)) {
          addEdge(atom, ruleId, 'modifies', edges, edgeIds);
        }
      });
    }

    // 2. Functional/Regulatory dependencies (rate laws) — opt-in
    if (options.includeRateLawDeps !== false) {
      const allDepSpecies = new Set<string>();
      if (rule.rate) {
        getSpeciesDependencies(rule.rate, options.observables, options.functions).forEach(s => allDepSpecies.add(s));
      }
      // Bidirectional rules
      const rateExpressions = rule.reverseRate ? [rule.rate, rule.reverseRate] : [rule.rate];
      
      allDepSpecies.forEach(speciesName => {
        // Only draw functional arrow if it's NOT already a consumed/produced/modified atom
        // AND it doesn't look like a keyword/primitive
        if (speciesName && 
            !reactantAtoms.has(speciesName) && 
            !productAtoms.has(speciesName) &&
            !['time', 'e', 'pi'].includes(speciesName.toLowerCase())) {
           
           // Standard: context dependency is a 'modifies' arrow (gray)
           ensureAtomNode(speciesName, nodes, atomIds, formatLabel);
           addEdge(speciesName, ruleId, 'modifies', edges, edgeIds);
        }
      });
    }
  });

  // Pass 3: Resolve Wildcards (!+)
  // This mirrors BNG2.pl's addWildcards + reprocessWildcards logic for Process Graphs.
  if (options.atomization === 'bng2') {
    resolveWildcards(nodes, edges);
  }

  return {
    nodes,
    edges,
  };
};
