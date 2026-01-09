// graph/core/Canonical.ts
import { SpeciesGraph } from './SpeciesGraph.ts';
import { NautyService } from './NautyService.ts';
import { Molecule } from './Molecule.ts';

interface MoleculeInfo {
  originalIndex: number;
  localSignature: string;
  colorClass: number;  // Color class from WL refinement
  molecule: Molecule;
  initialRank: number;
}

/**
 * FNV-1a hash function for strings (better collision resistance than djb2)
 */

/**
 * cyrb53 hash function (better collision resistance and mixing than FNV-1a)
 * Returns a 53-bit unsigned integer.
 */
function simpleHash(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * BioNetGen: SpeciesGraph::findAutomorphisms() + canonical()
 * Uses nauty via HNauty.pm in Perl; here we implement a simplified version
 * using iterative refinement (similar to Weisfeiler-Lehman algorithm)
 * with hash-based color classes to handle symmetric subgraphs correctly.
 */
export class GraphCanonicalizer {

  /**
   * Generate canonical string with sorted molecules and renumbered bonds.
   * Uses iterative refinement to ensure symmetric graphs produce the same canonical form.
   */
  static canonicalize(graph: SpeciesGraph): string {
    // Check if already cached on the graph
    if (graph.cachedCanonical !== undefined) {
      return graph.cachedCanonical;
    }

    if (graph.molecules.length === 0) {
      graph.cachedCanonical = '';
      return '';
    }
    if (graph.molecules.length === 1) {
      let result = this.moleculeToString(graph.molecules[0], new Map(), graph, 0);
      if (graph.compartment) {
        result = `@${graph.compartment}::${result}`;
      }
      graph.cachedCanonical = result;
      return result;
    }

    // 1. Get refined molecule infos (Orbits/Colors)
    // We use WL refinement to get robust vertex partitions (colors) that encode
    // local structure and component-specific connectivity.
    const moleculeInfos = this.getRefinedMoleculeInfos(graph);

    // 2. Try Nauty Canonical Labeling
    const nauty = NautyService.getInstance();
    let finalOrder: number[] = [];

    let usedNauty = false;

    // Nauty canonical labeling (when initialized): build an expanded, type-annotated graph
    // that includes molecule vertices, component vertices, and bond vertices.
    // This avoids losing information from multi-bonds and component-specific connectivity.
    if (nauty.isInitialized) {
      try {
        type VertexKind = 'mol' | 'comp' | 'bond';

        const moleculeVertexIds: number[] = [];
        const componentVertexIds: number[][] = [];

        // Vertex metadata for coloring + decoding Nauty labeling
        const vertexKind: VertexKind[] = [];
        const vertexMolIndex: Array<number | null> = [];
        const vertexLabel: string[] = [];

        const addVertex = (kind: VertexKind, molIdx: number | null, label: string): number => {
          const id = vertexKind.length;
          vertexKind.push(kind);
          vertexMolIndex.push(molIdx);
          vertexLabel.push(label);
          return id;
        };

        // 1) Molecule vertices
        for (let molIdx = 0; molIdx < graph.molecules.length; molIdx++) {
          const mol = graph.molecules[molIdx];
          const molLabel = `M:${mol.name}${mol.compartment ? `@${mol.compartment}` : ''}`;
          moleculeVertexIds[molIdx] = addVertex('mol', molIdx, molLabel);
        }

        // 2) Component vertices (one per component instance)
        for (let molIdx = 0; molIdx < graph.molecules.length; molIdx++) {
          const mol = graph.molecules[molIdx];
          componentVertexIds[molIdx] = [];
          for (let compIdx = 0; compIdx < mol.components.length; compIdx++) {
            const comp = mol.components[compIdx];
            const compLabel = `C:${comp.name}${comp.state ? `~${comp.state}` : ''}${comp.wildcard ? `!${comp.wildcard}` : ''}`;
            componentVertexIds[molIdx][compIdx] = addVertex('comp', molIdx, compLabel);
          }
        }

        // 3) Bond vertices (one per unique undirected bond)
        // Deduplicate from adjacency map which contains both directions.
        const bondVertexByKey = new Map<string, number>();
        const bondEndpoints: Array<{ bondV: number; v1: number; v2: number }> = [];

        for (const [key, partnerKeys] of graph.adjacency) {
          const dot1 = key.indexOf('.');
          const m1 = parseInt(key.substring(0, dot1), 10);
          const c1 = parseInt(key.substring(dot1 + 1), 10);

          for (const partnerKey of partnerKeys) {
            const dot2 = partnerKey.indexOf('.');
            const m2 = parseInt(partnerKey.substring(0, dot2), 10);
            const c2 = parseInt(partnerKey.substring(dot2 + 1), 10);

            const aKey = `${m1}.${c1}`;
            const bKey = `${m2}.${c2}`;
            const bondKey = aKey < bKey ? `${aKey}-${bKey}` : `${bKey}-${aKey}`;

            if (!bondVertexByKey.has(bondKey)) {
              const bondVertexId = addVertex('bond', null, 'B');
              bondVertexByKey.set(bondKey, bondVertexId);
              bondEndpoints.push({
                bondV: bondVertexId,
                v1: componentVertexIds[m1]?.[c1],
                v2: componentVertexIds[m2]?.[c2]
              });
            }
          }
        }

        const n = vertexKind.length;
        const flatAdj = new Int32Array(n * n);

        const addUndirectedEdge = (a: number | undefined, b: number | undefined): void => {
          if (a === undefined || b === undefined) return;
          if (a === b) return;
          flatAdj[a * n + b] = 1;
          flatAdj[b * n + a] = 1;
        };

        // Molecule-component edges (hierarchy)
        for (let molIdx = 0; molIdx < graph.molecules.length; molIdx++) {
          const molV = moleculeVertexIds[molIdx];
          const compVs = componentVertexIds[molIdx];
          for (const compV of compVs) {
            addUndirectedEdge(molV, compV);
          }
        }

        // Bond edges via bond-vertices
        for (const { bondV, v1, v2 } of bondEndpoints) {
          addUndirectedEdge(bondV, v1);
          addUndirectedEdge(bondV, v2);
        }

        // Prepare stable color partitions from vertex labels
        const uniqueLabels = Array.from(new Set(vertexLabel)).sort();
        const labelToColor = new Map<string, number>();
        uniqueLabels.forEach((lbl, idx) => labelToColor.set(lbl, idx));
        const colors = new Int32Array(n);
        for (let i = 0; i < n; i++) {
          colors[i] = labelToColor.get(vertexLabel[i]) ?? 0;
        }

        const result = nauty.getCanonicalLabeling(n, flatAdj, colors);
        const labeling = Array.from(result.labeling);

        // Extract molecule ordering from full canonical vertex ordering
        for (const v of labeling) {
          if (vertexKind[v] === 'mol') {
            const molIdx = vertexMolIndex[v];
            if (molIdx !== null) {
              finalOrder.push(molIdx);
            }
          }
        }

        if (finalOrder.length === graph.molecules.length) {
          usedNauty = true;
        } else {
          finalOrder = [];
        }

      } catch (e) {
        console.warn('Nauty canonicalization failed, falling back to WL+BFS:', e);
      }
    }

    // 3. Fallback: Manual BFS-based canonicalization (if Nauty failed or not ready)
    if (finalOrder.length === 0) {
      // Sort a COPY of moleculeInfos for grouping
      const sortedInfos = [...moleculeInfos].sort((a, b) => {
        if (a.colorClass !== b.colorClass) return a.colorClass - b.colorClass;
        if (a.localSignature < b.localSignature) return -1;
        if (a.localSignature > b.localSignature) return 1;
        return 0;
      });

      // Map original index -> sorted index
      const originalToSortedTmp = new Map<number, number>();
      sortedInfos.forEach((info, index) => {
        originalToSortedTmp.set(info.originalIndex, index);
      });

      // Build adjacency list for BFS traversal
      // Nodes are SORTED INDICES
      const adjList: Map<number, Array<{ neighbor: number, myComp: string, neighborComp: string, myCompIdx: number, neighborCompIdx: number }>> = new Map();
      for (let i = 0; i < sortedInfos.length; i++) {
        adjList.set(i, []);
      }

      for (const [key, partnerKeys] of graph.adjacency) {
        const dot1 = key.indexOf('.');
        const m1 = parseInt(key.substring(0, dot1), 10);
        const c1 = parseInt(key.substring(dot1 + 1), 10);
        for (const partnerKey of partnerKeys) {
          const dot2 = partnerKey.indexOf('.');
          const m2 = parseInt(partnerKey.substring(0, dot2), 10);
          const c2 = parseInt(partnerKey.substring(dot2 + 1), 10);
          const si1 = originalToSortedTmp.get(m1)!;
          const si2 = originalToSortedTmp.get(m2)!;
          const mol1 = graph.molecules[m1];
          const mol2 = graph.molecules[m2];
          const compName1 = mol1.components[c1]?.name || '';
          const compName2 = mol2.components[c2]?.name || '';

          adjList.get(si1)!.push({ neighbor: si2, myComp: compName1, neighborComp: compName2, myCompIdx: c1, neighborCompIdx: c2 });
        }
      }

      // Sort each adjacency list using deterministic criteria
      for (const [_node, neighbors] of adjList) {
        neighbors.sort((a, b) => {
          const sigA = sortedInfos[a.neighbor].localSignature;
          const sigB = sortedInfos[b.neighbor].localSignature;
          if (sigA !== sigB) return sigA < sigB ? -1 : 1;
          if (a.myComp !== b.myComp) return a.myComp < b.myComp ? -1 : 1;
          if (a.neighborComp !== b.neighborComp) return a.neighborComp < b.neighborComp ? -1 : 1;
          if (a.neighbor !== b.neighbor) return a.neighbor - b.neighbor;
          return 0;
        });
      }

      // BFS from lexicographically smallest molecule
      const placed = new Set<number>();
      const startIdx = 0; // sortedInfos is already sorted
      const queue: number[] = [startIdx];
      placed.add(startIdx);
      const sortedOrderVertices: number[] = [startIdx];

      while (queue.length > 0) {
        const current = queue.shift()!;
        for (const edge of adjList.get(current)!) {
          if (!placed.has(edge.neighbor)) {
            placed.add(edge.neighbor);
            sortedOrderVertices.push(edge.neighbor);
            queue.push(edge.neighbor);
          }
        }
      }

      // Add disconnected components
      for (let i = 0; i < sortedInfos.length; i++) {
        if (!placed.has(i)) sortedOrderVertices.push(i);
      }

      // CONVERT SORTED INDICES BACK TO ORIGINAL INDICES
      finalOrder = sortedOrderVertices.map(si => sortedInfos[si].originalIndex);
    }

    // FORCE ALPHABETIC SORT (BNG2 Convention)
    // This reorders canonical indices to prioritize Molecule Name
    // ONLY if Nauty didn't already enforce a stronger order?
    // Nauty returns canonical order based on graph structure.
    // If we re-sort by name, we might break the canonical property for identical names?
    // But BNG requires names to be sorted.
    // Nauty doesn't know about names (only colors).
    // If colors encode names, Nauty respects names.
    // Colors DO encode names (via localSignature).
    // So Nauty result IS sorted by name (because name correlates with color rank).
    // So this sort should be redundant/stable.



    // Capture the initial canonical rank (from Nauty or deterministic BFS)
    // This is crucial for symmetry breaking. If we use original index as tie-breaker, 
    // we re-introduce input order dependency for symmetric nodes.
    const canonicalRank = new Map<number, number>();
    finalOrder.forEach((nodeIdx, rank) => {
      canonicalRank.set(nodeIdx, rank);
    });

    finalOrder.sort((a, b) => {
      // Primary Sort: Molecule Name
      const nameA = graph.molecules[a].name;
      const nameB = graph.molecules[b].name;
      if (nameA < nameB) return -1;
      if (nameA > nameB) return 1;
      // Secondary Sort: Bond-Aware Signature (Name + States + Bond Status)
      const sigA = GraphCanonicalizer.getBondAwareSignature(graph.molecules[a], a, graph);
      const sigB = GraphCanonicalizer.getBondAwareSignature(graph.molecules[b], b, graph);
      if (sigA < sigB) return -1;
      if (sigA > sigB) return 1;

      // Tertiary Sort: Bonded Partners' Signatures
      const getBondedPartnersSig = (molIdx: number): string => {
        const mol = graph.molecules[molIdx];
        const partnerSigs: string[] = [];
        for (let compIdx = 0; compIdx < mol.components.length; compIdx++) {
          const adjKey = `${molIdx}.${compIdx}`;
          const partners = graph.adjacency.get(adjKey);
          if (partners && partners.length > 0) {
            for (const pKey of partners) {
              const dotP = pKey.indexOf('.');
              const pMolIdx = parseInt(pKey.substring(0, dotP), 10);
              const pMol = graph.molecules[pMolIdx];
              if (pMol.name !== mol.name) {
                partnerSigs.push(GraphCanonicalizer.getLocalSignature(pMol));
              }
            }
          }
        }
        partnerSigs.sort();
        return partnerSigs.join('|');
      };
      const bondedSigA = getBondedPartnersSig(a);
      const bondedSigB = getBondedPartnersSig(b);
      if (bondedSigA < bondedSigB) return -1;
      if (bondedSigA > bondedSigB) return 1;

      // Quaternary Sort: Min Neighbor Canonical Rank
      // This enforces a BFS-like ordering: if two molecules are identical branches,
      // the one attached to the "earlier" (lower rank) parent comes first.
      const getMinNeighborRank = (molIdx: number): number => {
        let minRank = Number.MAX_SAFE_INTEGER;
        for (let compIdx = 0; compIdx < graph.molecules[molIdx].components.length; compIdx++) {
          const adjKey = `${molIdx}.${compIdx}`;
          const partners = graph.adjacency.get(adjKey);
          if (partners) {
            for (const pKey of partners) {
              const dotP = pKey.indexOf('.');
              const pMolIdx = parseInt(pKey.substring(0, dotP), 10);
              // Ignore self-loops or same-molecule bonds if any (unlikely here)
              if (pMolIdx !== molIdx) {
                const rank = canonicalRank.get(pMolIdx) ?? Number.MAX_SAFE_INTEGER;
                if (rank < minRank) minRank = rank;
              }
            }
          }
        }
        return minRank;
      };

      const minNeighborRankA = getMinNeighborRank(a);
      const minNeighborRankB = getMinNeighborRank(b);



      if (minNeighborRankA !== minNeighborRankB) return minNeighborRankA - minNeighborRankB;

      // Quinary Sort: WL Color Class (Structural / Topological Equivalence)
      const rankA = moleculeInfos[a].colorClass;
      const rankB = moleculeInfos[b].colorClass;
      if (rankA !== rankB) return rankA - rankB;

      // Senary Sort: Canonical Rank (from Nauty/BFS) -> Breaking Symmetry Deterministically
      return (canonicalRank.get(a) || 0) - (canonicalRank.get(b) || 0);
    });



    // 4. Construct Mapping Maps
    const originalToSortedVector = new Map<number, number>();
    const sortedToCanonicalVector = new Map<number, number>();

    // Note: moleculeInfos might be sorted (fallback) or unsorted (Nauty)
    // We rebuild originalToSortedVector based on current moleculeInfos state?
    // NO. We need robust mapping.

    if (usedNauty && finalOrder.length === graph.molecules.length) {
      // Nauty path: moleculeInfos is ordered by ORIGINAL index.
      // finalOrder[canIdx] = Original Index.

      // FORCE ALPHABETIC SORT (BNG2 Convention)
      // This reorders canonical indices to prioritize Molecule Name


      // Removed redundant sort that was here

      for (let i = 0; i < moleculeInfos.length; i++) {
        originalToSortedVector.set(i, i);
      }

      finalOrder.forEach((origIdx, canIdx) => {
        sortedToCanonicalVector.set(origIdx, canIdx);
      });

    } else {
      // Fallback path: moleculeInfos IS SORTED.
      // finalOrder[canIdx] = Sorted Index.

      for (let i = 0; i < moleculeInfos.length; i++) {
        originalToSortedVector.set(i, i);
      }

      finalOrder.forEach((origIdx, canIdx) => {
        sortedToCanonicalVector.set(origIdx, canIdx);
      });
    }

    // 5. Collect bonds and assign IDs
    const allBonds: Array<{
      canIdx1: number, ci1: number, canIdx2: number, ci2: number,
      compName1: string, compName2: string
    }> = [];
    const addedBondKeys = new Set<string>();

    for (const [key, partnerKeys] of graph.adjacency) {
      const dot1 = key.indexOf('.');
      const m1 = parseInt(key.substring(0, dot1), 10);
      const c1 = parseInt(key.substring(dot1 + 1), 10);
      for (const partnerKey of partnerKeys) {
        const dot2 = partnerKey.indexOf('.');
        const m2 = parseInt(partnerKey.substring(0, dot2), 10);
        const c2 = parseInt(partnerKey.substring(dot2 + 1), 10);

        // Get Canonical Indices
        const si1 = originalToSortedVector.get(m1)!;
        const si2 = originalToSortedVector.get(m2)!;
        const canIdx1 = sortedToCanonicalVector.get(si1)!;
        const canIdx2 = sortedToCanonicalVector.get(si2)!;

        const mol1 = graph.molecules[m1];
        const mol2 = graph.molecules[m2];
        const compName1 = mol1.components[c1]?.name || '';
        const compName2 = mol2.components[c2]?.name || '';

        const bondKey = canIdx1 < canIdx2 || (canIdx1 === canIdx2 && c1 < c2)
          ? `${canIdx1}.${c1}-${canIdx2}.${c2}`
          : `${canIdx2}.${c2}-${canIdx1}.${c1}`;

        if (!addedBondKeys.has(bondKey)) {
          addedBondKeys.add(bondKey);
          if (canIdx1 < canIdx2 || (canIdx1 === canIdx2 && c1 < c2)) {
            allBonds.push({ canIdx1, ci1: c1, canIdx2, ci2: c2, compName1, compName2 });
          } else {
            allBonds.push({ canIdx1: canIdx2, ci1: c2, canIdx2: canIdx1, ci2: c1, compName1: compName2, compName2: compName1 });
          }
        }
      }
    }

    // Sort bonds deterministically
    allBonds.sort((a, b) => {
      if (a.canIdx1 !== b.canIdx1) return a.canIdx1 - b.canIdx1;
      if (a.compName1 !== b.compName1) return a.compName1 < b.compName1 ? -1 : 1;
      if (a.ci1 !== b.ci1) return a.ci1 - b.ci1; // Component index tie-breaker
      if (a.canIdx2 !== b.canIdx2) return a.canIdx2 - b.canIdx2;
      if (a.compName2 !== b.compName2) return a.compName2 < b.compName2 ? -1 : 1;
      if (a.ci2 !== b.ci2) return a.ci2 - b.ci2; // Component index tie-breaker
      return 0;
    });

    // Assign Bond IDs
    let nextBondId = 1;
    const bondMapping = new Map<string, number>();
    for (const bond of allBonds) {
      const key = `${bond.canIdx1}.${bond.ci1}-${bond.canIdx2}.${bond.ci2}`;
      if (!bondMapping.has(key)) bondMapping.set(key, nextBondId++);
    }

    // 6. Generate final canonical string
    const canonicalStrings = finalOrder.map((sourceIdx, _canIdx) => {
      // sourceIdx is Original Index (Nauty) or Sorted Index (Fallback)
      // For Nauty: graph.molecules[sourceIdx] is the correct molecule
      const mol = graph.molecules[sourceIdx];


      // Debug: Log the molecule being used at each position
      // if (graph.molecules[0]?.name === 'APC') console.log(`[Canonical Debug] canIdx=${_canIdx} sourceIdx=${sourceIdx} molecule=${mol.name}`);

      return this.moleculeToStringNew(
        mol,
        bondMapping,
        graph,
        sourceIdx, // Original index is sourceIdx for Nauty path
        originalToSortedVector,
        sortedToCanonicalVector
      );
    });

    const canonicalMolecules = canonicalStrings.join('.');
    const finalResult = graph.compartment ? `@${graph.compartment}::${canonicalMolecules}` : canonicalMolecules;
    // if (graph.molecules.length === 1 && graph.molecules[0].name === 'CCND') {
    //   console.error(`[Canonical] CCND comp='${graph.compartment}' => '${finalResult}'`);
    // }
    graph.cachedCanonical = finalResult;
    return finalResult;
  }

  /**
   * Get local signature for a molecule (excluding connectivity to other molecules)
   * Components are sorted alphabetically to match BNG2 canonical form
   */
  private static getLocalSignature(mol: Molecule): string {
    const compSigs = mol.components.map((comp: any, idx: number) => {
      let sig = comp.name;
      if (comp.state && comp.state !== '?') sig += `~${comp.state}`;
      return { sig, idx };
    });
    // Sort components alphabetically by their string representation
    compSigs.sort((a: any, b: any) => a.sig < b.sig ? -1 : a.sig > b.sig ? 1 : 0);
    const compartmentStr = mol.compartment ? `@${mol.compartment}` : '';
    return `${mol.name}${compartmentStr}(${compSigs.map((c: any) => c.sig).join(',')})`;
  }

  /**
   * Get bond-aware signature for sorting purposes.
   * Includes bond status (!+ for bound, nothing for unbound) to ensure
   * deterministic ordering of molecules with same name and state but different connectivity.
   * BNG2 places bound components before unbound components.
   */
  private static getBondAwareSignature(mol: Molecule, molIdx: number, graph: SpeciesGraph): string {
    const compSigs = mol.components.map((comp: any, compIdx: number) => {
      let sig = comp.name;
      if (comp.state && comp.state !== '?') sig += `~${comp.state}`;
      // Check if this component has any bonds
      const adjacencyKey = `${molIdx}.${compIdx}`;
      const hasBond = graph.adjacency.has(adjacencyKey) && graph.adjacency.get(adjacencyKey)!.length > 0;
      // Add !+ for bound components (makes them sort BEFORE unbound in string comparison)
      if (hasBond) sig += `!+`;
      return { sig, compIdx };
    });
    // Sort components alphabetically by their string representation
    compSigs.sort((a: any, b: any) => a.sig < b.sig ? -1 : a.sig > b.sig ? 1 : 0);
    const compartmentStr = mol.compartment ? `@${mol.compartment}` : '';
    return `${mol.name}${compartmentStr}(${compSigs.map((c: any) => c.sig).join(',')})`;
  }

  /**
   * Convert a molecule to string with canonical bond IDs (single molecule case)
   * BNG2 convention: Only include molecule compartment when it differs from graph compartment
   */
  private static moleculeToString(
    mol: Molecule,
    _bondMapping: Map<string, number>,
    graph: SpeciesGraph,
    _molOrigIdx: number
  ): string {
    // Build component strings with their original indices
    const componentData = mol.components.map((comp: any, compIdx: number) => {
      let str = comp.name;
      if (comp.state && comp.state !== '?') str += `~${comp.state}`;

      if (comp.wildcard) {
        str += `!${comp.wildcard}`;
      }

      return { str, compIdx };
    });

    // Sort components alphabetically
    /*console.log('[Canonical Debug] Before Sort:', componentData.map(c => c.str));*/
    componentData.sort((a: any, b: any) => {
      // Compare the base string (without bonds)
      const baseA = a.str.split('!')[0];
      const baseB = b.str.split('!')[0];
      return baseA < baseB ? -1 : baseA > baseB ? 1 : 0;
    });
    /*console.log('[Canonical Debug] After Sort:', componentData.map(c => c.str));*/

    // BNG2 convention: Only include molecule compartment when it differs from graph compartment
    const compartmentSuffix = (mol.compartment && mol.compartment !== graph.compartment) ? `@${mol.compartment}` : '';
    const res = `${mol.name}(${componentData.map((c: any) => c.str).join(',')})${compartmentSuffix}`;
    return res;
  }

  /**
   * Convert a molecule to string with canonical bond IDs (multi-molecule case)
   * Components are sorted alphabetically to match BNG2 canonical form
   * BNG2 convention: Only include molecule compartment when it differs from graph compartment
   */
  private static moleculeToStringNew(
    mol: Molecule,
    bondMapping: Map<string, number>,
    graph: SpeciesGraph,
    molOrigIdx: number,
    originalToSorted: Map<number, number>,
    sortedToCanonical: Map<number, number>
  ): string {
    const mySortedIdx = originalToSorted.get(molOrigIdx)!;
    const myCanIdx = sortedToCanonical.get(mySortedIdx)!;

    // Build component strings with their original indices for bond lookup
    const componentData = mol.components.map((comp: any, compIdx: number) => {
      let baseStr = comp.name;
      if (comp.state && comp.state !== '?') baseStr += `~${comp.state}`;

      const adjacencyKey = `${molOrigIdx}.${compIdx}`;
      const partnerKeys = graph.adjacency.get(adjacencyKey);

      // Support multi-site bonding: collect all bond IDs for this component
      const bondIds: number[] = [];
      if (partnerKeys && partnerKeys.length > 0) {
        for (const partnerKey of partnerKeys) {
          const dot = partnerKey.indexOf('.');
          const pMolOrigIdx = parseInt(partnerKey.substring(0, dot), 10);
          const pCompIdx = parseInt(partnerKey.substring(dot + 1), 10);
          const pSortedIdx = originalToSorted.get(pMolOrigIdx)!;
          const pCanIdx = sortedToCanonical.get(pSortedIdx)!;

          let key: string;
          if (myCanIdx < pCanIdx || (myCanIdx === pCanIdx && compIdx < pCompIdx)) {
            key = `${myCanIdx}.${compIdx}-${pCanIdx}.${pCompIdx}`;
          } else {
            key = `${pCanIdx}.${pCompIdx}-${myCanIdx}.${compIdx}`;
          }

          const bondId = bondMapping.get(key);
          if (bondId !== undefined) {
            bondIds.push(bondId);
          }
        }
      }

      // Build bond string (sorted for canonical form)
      let bondStr = '';
      if (bondIds.length > 0) {
        bondIds.sort((a, b) => a - b);
        bondStr = bondIds.map(id => `!${id}`).join('');
      } else if (comp.wildcard) {
        bondStr = `!${comp.wildcard}`;
      }

      return { baseStr, bondStr, compIdx, hasRealBond: bondIds.length > 0 };
    });

    // Sort components alphabetically by base string (name + state).
    // IMPORTANT: When base strings are identical (e.g., repeated site names like A(b,b)),
    // BNG2 places bound components before unbound components.
    componentData.sort((a: any, b: any) => {
      if (a.baseStr !== b.baseStr) return a.baseStr < b.baseStr ? -1 : 1;

      // Bound before unbound for repeated component names
      if (a.hasRealBond !== b.hasRealBond) return a.hasRealBond ? -1 : 1;

      // Deterministic tie-breaker across multiple bonds
      if (a.bondStr !== b.bondStr) return a.bondStr < b.bondStr ? -1 : 1;

      // Final deterministic tie-breaker
      return a.compIdx - b.compIdx;
    });

    // BNG2 convention: Only include molecule compartment when it differs from graph compartment
    const compartmentSuffix = (mol.compartment && mol.compartment !== graph.compartment) ? `@${mol.compartment}` : '';
    return `${mol.name}(${componentData.map((c: any) => c.baseStr + c.bondStr).join(',')})${compartmentSuffix}`;
  }

  /**
   * Compute automorphism orbits using Weisfeiler-Lehman refinement (color classes).
   * Returns a map of Molecule Index -> Orbit ID (Color Hash).
   * Molecules with the same Orbit ID are symmetrically equivalent.
   */
  /**
   * Compute molecule orbits.
   * Logic:
   * 1. If Nauty WASM is ready, use it (exact automorphism).
   * 2. Else, use Weisfeiler-Lehman (approximate but usually sufficient).
   */
  static computeOrbits(graph: SpeciesGraph): Map<number, number> {
    const nauty = NautyService.getInstance();

    // 1. Try Nauty WASM
    if (nauty.isInitialized) {
      try {
        const n = graph.molecules.length;
        const flatAdj = new Int32Array(n * n);

        // Build a stable vertex coloring so Nauty respects molecule labels/state.
        // Without colors, Nauty computes orbits of the *unlabeled* graph, which can
        // incorrectly merge distinct molecule types and over-reduce symmetry.
        const localSigs = graph.molecules.map(mol => this.getLocalSignature(mol));
        const uniqueSigs = Array.from(new Set(localSigs)).sort();
        const sigToRank = new Map<string, number>();
        uniqueSigs.forEach((sig, idx) => sigToRank.set(sig, idx));
        const colors = new Int32Array(n);
        for (let i = 0; i < n; i++) {
          colors[i] = sigToRank.get(localSigs[i])!;
        }

        // Build adjacency matrix from graph.adjacency
        for (const [key, partnerKeys] of graph.adjacency) {
          const dot1 = key.indexOf('.');
          const m1 = parseInt(key.substring(0, dot1), 10);

          for (const partnerKey of partnerKeys) {
            const dot2 = partnerKey.indexOf('.');
            const m2 = parseInt(partnerKey.substring(0, dot2), 10);

            if (m1 !== m2) {
              flatAdj[m1 * n + m2] = 1;
              flatAdj[m2 * n + m1] = 1;
            }
          }
        }

        const { orbits: orbitsArr } = nauty.getCanonicalLabeling(n, flatAdj, colors);

        // Map back to molecule indices
        const result = new Map<number, number>();
        for (let i = 0; i < n; i++) {
          result.set(i, orbitsArr[i]);
        }
        return result;

      } catch (e) {
        console.warn('Nauty computation failed, falling back to WL:', e);
      }
    }

    // 2. Fallback: no symmetry reduction.
    // WL refinement is not an exact orbit computation; using it for symmetry reduction
    // can incorrectly merge non-symmetric matches and drop reactions.
    const orbits = new Map<number, number>();
    for (let i = 0; i < graph.molecules.length; i++) {
      orbits.set(i, i);
    }
    return orbits;
  }

  /**
   * Run Weisfeiler-Lehman refinement to get stable color classes for all molecules.
   */
  private static getRefinedMoleculeInfos(graph: SpeciesGraph): MoleculeInfo[] {
    // 1. Generate initial signatures based on local structure only (no connectivity)
    // SORTING FIX: Assign colorClass based on ALPHABETIC RANK of signature, not hash
    const initialSigs = graph.molecules.map(mol => this.getLocalSignature(mol));
    const uniqueSigs = Array.from(new Set(initialSigs)).sort();
    const sigToRank = new Map<string, number>();
    uniqueSigs.forEach((sig, idx) => sigToRank.set(sig, idx));

    const moleculeInfos: MoleculeInfo[] = graph.molecules.map((mol, molIdx) => {
      const localSig = initialSigs[molIdx];
      const rank = sigToRank.get(localSig)!;
      return {
        originalIndex: molIdx,
        localSignature: localSig,
        colorClass: rank,
        molecule: mol,
        initialRank: rank
      } as MoleculeInfo;
    });

    // 2. Iterative refinement: update color classes based on neighbor colors
    // Use hash-based colors to avoid exponential string growth

    for (let iter = 0; iter < graph.molecules.length; iter++) {
      const prevColors = moleculeInfos.map(m => m.colorClass);
      let changed = false;

      for (let molIdx = 0; molIdx < graph.molecules.length; molIdx++) {
        const mol = graph.molecules[molIdx];
        const neighborColors: number[] = [];

        // Collect colors of all neighbors (molecules connected via bonds)
        for (let compIdx = 0; compIdx < mol.components.length; compIdx++) {
          const adjacencyKey = `${molIdx}.${compIdx}`;
          const partnerKeys = graph.adjacency.get(adjacencyKey);
          if (partnerKeys) {
            for (const partnerKey of partnerKeys) {
              const dot = partnerKey.indexOf('.');
              const pMolIdx = parseInt(partnerKey.substring(0, dot), 10);
              const pCompIdx = parseInt(partnerKey.substring(dot + 1), 10);
              const pMol = graph.molecules[pMolIdx];
              if (pMol) {
                // Include component info and partner's color
                const edgeHash = simpleHash(
                  `${mol.components[compIdx].name}->${pMol.components[pCompIdx]?.name}:${prevColors[pMolIdx]}`
                );
                neighborColors.push(edgeHash);
              }
            }
          }
        }

        // Sort and combine neighbor colors for a deterministic hash
        neighborColors.sort((a, b) => a - b);
        const combinedHash = simpleHash(prevColors[molIdx] + ':' + neighborColors.join(','));

        if (combinedHash !== moleculeInfos[molIdx].colorClass) {
          moleculeInfos[molIdx].colorClass = combinedHash;
          changed = true;
        }
      }

      if (!changed) {
        break; // Converged
      }
    }

    // 3. POST-REFINEMENT REMAP: Enforce Primary Sort by Initial Rank
    const finalStates = moleculeInfos.map(info => ({
      rank: (info as any).initialRank,
      hash: info.colorClass
    }));

    // Sort key: rank ASC, then hash ASC
    finalStates.sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.hash - b.hash;
    });

    // Create mapping: "rank:hash" -> newOrderedIndex
    const stateMap = new Map<string, number>();
    let nextIndex = 0;
    for (const state of finalStates) {
      const key = `${state.rank}:${state.hash}`;
      if (!stateMap.has(key)) {
        stateMap.set(key, nextIndex++);
      }
    }

    // Apply new ordered colors
    for (const info of moleculeInfos) {
      const key = `${(info as any).initialRank}:${info.colorClass}`;
      info.colorClass = stateMap.get(key)!;
    }

    return moleculeInfos;
  }

  /**
   * Compute automorphism group size (for StatFactor correction)
   * BioNetGen: SpeciesGraph::aut_permutations()
   */
  static computeAutomorphisms(_graph: SpeciesGraph): number {
    // Placeholder
    return 1;
  }
}