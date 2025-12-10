// graph/core/Canonical.ts
import { SpeciesGraph } from './SpeciesGraph.ts';
import { NautyService } from './NautyService.ts';

interface MoleculeInfo {
  originalIndex: number;
  localSignature: string;
  colorClass: number;  // Color class from WL refinement
  molecule: any;
  initialRank: number;
}

/**
 * Simple hash function for strings
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
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
      const result = this.moleculeToString(graph.molecules[0], new Map(), graph, 0);
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

    // NAUTY DISABLED: Found to be non-deterministic for symmetric S-R-R-S isomers in Barua model.
    // BFS with MinNeighborRank fix is robust and correct (149 species).
    if (false && nauty.isInitialized) {
      try {
        const n = graph.molecules.length;
        const flatAdj = new Int32Array(n * n);

        // Build simple adjacency matrix for Nauty
        // Note: Component details are encoded in the WL colors passed to Nauty
        for (const [key, partnerKeys] of graph.adjacency) {
          const [m1Str, _] = key.split('.');
          const m1 = parseInt(m1Str, 10);

          for (const partnerKey of partnerKeys) {
            const [m2Str, __] = partnerKey.split('.');
            const m2 = parseInt(m2Str, 10);

            if (m1 !== m2) {
              flatAdj[m1 * n + m2] = 1;
              flatAdj[m2 * n + m1] = 1;
            }
          }
        }

        // Prepare colors from WL refinement
        const colors = new Int32Array(n);
        for (let i = 0; i < n; i++) {
          colors[i] = moleculeInfos[i].colorClass;
        }

        // Get canonical labeling (permutation)
        const result = nauty.getCanonicalLabeling(n, flatAdj, colors);
        finalOrder = Array.from(result.labeling);

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
        const [m1, c1] = key.split('.').map(Number);
        for (const partnerKey of partnerKeys) {
          const [m2, c2] = partnerKey.split('.').map(Number);
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
              const [pMolStr] = pKey.split('.');
              const pMolIdx = Number(pMolStr);
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
              const [pMolStr] = pKey.split('.');
              const pMolIdx = Number(pMolStr);
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

    if (nauty.isInitialized && finalOrder.length === graph.molecules.length && !moleculeInfos[0].hasOwnProperty('sortedWrapped')) {
      // Nauty path: moleculeInfos is ordered by ORIGINAL index.
      // finalOrder[canIdx] = Original Index.

      // FORCE ALPHABETIC SORT (BNG2 Convention)
      // This reorders canonical indices to prioritize Molecule Name


      // Removed redundant sort that was here

      moleculeInfos.forEach(info => {
        originalToSortedVector.set(info.originalIndex, info.originalIndex);
      });

      finalOrder.forEach((origIdx, canIdx) => {
        sortedToCanonicalVector.set(origIdx, canIdx);
      });

    } else {
      // Fallback path: moleculeInfos IS SORTED.
      // finalOrder[canIdx] = Sorted Index.

      moleculeInfos.forEach((info, index) => {
        originalToSortedVector.set(info.originalIndex, index);
      });

      finalOrder.forEach((sortedIdx, canIdx) => {
        sortedToCanonicalVector.set(sortedIdx, canIdx);
      });
    }

    // 5. Collect bonds and assign IDs
    const allBonds: Array<{
      canIdx1: number, ci1: number, canIdx2: number, ci2: number,
      compName1: string, compName2: string
    }> = [];
    const addedBondKeys = new Set<string>();

    for (const [key, partnerKeys] of graph.adjacency) {
      const [m1, c1] = key.split('.').map(Number);
      for (const partnerKey of partnerKeys) {
        const [m2, c2] = partnerKey.split('.').map(Number);

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
      const info = moleculeInfos[sourceIdx];

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

    const result = canonicalStrings.join('.');
    graph.cachedCanonical = result;
    return result;
  }

  /**
   * Get local signature for a molecule (excluding connectivity to other molecules)
   * Components are sorted alphabetically to match BNG2 canonical form
   */
  private static getLocalSignature(mol: any): string {
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
  private static getBondAwareSignature(mol: any, molIdx: number, graph: SpeciesGraph): string {
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
   */
  private static moleculeToString(
    mol: any,
    _bondMapping: Map<string, number>,
    _graph: SpeciesGraph,
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

    // DEBUG: Force Log if unsorted
    const sortedStrs = componentData.map(c => c.str);
    if (sortedStrs.length > 1 && sortedStrs[0] > sortedStrs[1]) {
      console.log('[Canonical Debug] FAILED SORT DETECTED:', sortedStrs);
    }

    const compartmentSuffix = mol.compartment ? `@${mol.compartment}` : '';
    return `${mol.name}(${componentData.map((c: any) => c.str).join(',')})${compartmentSuffix}`;
  }

  /**
   * Convert a molecule to string with canonical bond IDs (multi-molecule case)
   * Components are sorted alphabetically to match BNG2 canonical form
   */
  private static moleculeToStringNew(
    mol: any,
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
          const [pMolOrigIdx, pCompIdx] = partnerKey.split('.').map(Number);
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

      return { baseStr, bondStr, compIdx };
    });

    // Sort components alphabetically by their base string (name + state, without bond)
    componentData.sort((a: any, b: any) => a.baseStr < b.baseStr ? -1 : a.baseStr > b.baseStr ? 1 : 0);

    const compartmentSuffix = mol.compartment ? `@${mol.compartment}` : '';
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

        // Build adjacency matrix from graph.adjacency
        for (const [key, partnerKeys] of graph.adjacency) {
          const [m1Str, _] = key.split('.');
          const m1 = parseInt(m1Str, 10);

          for (const partnerKey of partnerKeys) {
            const [m2Str, __] = partnerKey.split('.');
            const m2 = parseInt(m2Str, 10);

            if (m1 !== m2) {
              flatAdj[m1 * n + m2] = 1;
              flatAdj[m2 * n + m1] = 1;
            }
          }
        }

        const orbitsArr = nauty.getCanonicalOrbits(n, flatAdj);

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

    // 2. Fallback: Weisfeiler-Lehman
    const infos = this.getRefinedMoleculeInfos(graph);
    const orbits = new Map<number, number>();
    for (const info of infos) {
      orbits.set(info.originalIndex, info.colorClass);
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
              const [pMolIdxStr, pCompIdxStr] = partnerKey.split('.');
              const pMolIdx = Number(pMolIdxStr);
              const pCompIdx = Number(pCompIdxStr);
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