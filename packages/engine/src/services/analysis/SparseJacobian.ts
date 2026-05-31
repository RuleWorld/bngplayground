/**
 * SparseJacobian.ts - Sparse Jacobian computation for stiff ODE systems
 * 
 * For mass-action kinetics, the Jacobian can be computed analytically:
 * J[i][j] = Σ_r (ν_i^r × ∂rate_r/∂y_j)
 * where ∂rate_r/∂y_j = (stoich_j / y_j) × rate_r if j is a reactant of r
 */

import type { Rxn } from '../graph/core/Rxn';
import { ExpressionTranslator } from '../graph/core/ExpressionTranslator';
import { getExpressionDependencies } from '../../parser/ExpressionDependencies';
import { SafeExpressionEvaluator } from '../../utils/safeExpressionEvaluator';

/**
 * CSR format sparse matrix info
 */
export interface SparseJacobianInfo {
  nnz: number;           // Number of non-zeros
  rowPtr: Int32Array;    // CSR row pointers (length n+1)
  colIdx: Int32Array;    // Column indices (length nnz)
  fillRatio: number;     // nnz / (n*n)
}

/**
 * Compute the sparsity pattern of the Jacobian matrix for a reaction network.
 * 
 * For mass-action kinetics, J[i][j] is non-zero if species j is a reactant
 * in any reaction that affects species i (produces or consumes i).
 * 
 * @param reactions - Array of reactions with reactant/product species indices
 * @param nSpecies - Total number of species
 * @returns CSR format sparsity pattern
 */
export function computeJacobianSparsity(
  reactions: Rxn[],
  nSpecies: number
): SparseJacobianInfo {
  // Build dependency sets: deps[i] = {j : species j affects dydt[i]}
  const deps: Set<number>[] = Array.from({ length: nSpecies }, () => new Set());
  
  for (const rxn of reactions) {
    const reactantIndices = rxn.reactants;
    
    // All species affected by this reaction (reactants and products)
    const affectedIndices = [...rxn.reactants, ...rxn.products];
    
    // For each affected species i, it depends on all reactants j
    for (const i of affectedIndices) {
      for (const j of reactantIndices) {
        deps[i].add(j);
      }
    }
  }
  
  // Count total non-zeros
  let nnz = 0;
  for (let i = 0; i < nSpecies; i++) {
    nnz += deps[i].size;
  }
  
  // Build CSR format
  const rowPtr = new Int32Array(nSpecies + 1);
  const colIdx = new Int32Array(nnz);
  
  let ptr = 0;
  for (let i = 0; i < nSpecies; i++) {
    rowPtr[i] = ptr;
    // Sort column indices for efficient access
    const cols = Array.from(deps[i]).sort((a, b) => a - b);
    for (const j of cols) {
      colIdx[ptr++] = j;
    }
  }
  rowPtr[nSpecies] = ptr;
  
  const fillRatio = nnz / (nSpecies * nSpecies);
  
  console.log(`[SparseJacobian] Sparsity pattern: ${nSpecies} species, ${nnz} non-zeros, ${(fillRatio * 100).toFixed(1)}% fill`);
  
  return { nnz, rowPtr, colIdx, fillRatio };
}

/**
 * Reaction contribution to Jacobian entry J[i][j]
 */
interface ReactionContribution {
  rxnIdx: number;          // Reaction index
  netStoichI: number;      // Net stoichiometry of species i in this reaction
  reactantStoichJ: number; // Stoichiometry of species j as reactant
  reactantIdxJ: number;    // Index of j in reaction's reactant list
}

/**
 * Build a mapping of which reactions contribute to each Jacobian entry.
 * This enables efficient analytical Jacobian evaluation.
 */
export function buildJacobianContributions(
  reactions: Rxn[],
  nSpecies: number,
  sparsity: SparseJacobianInfo
): ReactionContribution[][] {
  const contributions: ReactionContribution[][] = Array.from(
    { length: sparsity.nnz },
    () => []
  );
  
  // Create a lookup for Jacobian entry indices
  const entryIndex = new Map<string, number>();
  for (let i = 0; i < nSpecies; i++) {
    for (let ptr = sparsity.rowPtr[i]; ptr < sparsity.rowPtr[i + 1]; ptr++) {
      const j = sparsity.colIdx[ptr];
      entryIndex.set(`${i},${j}`, ptr);
    }
  }
  
  // For each reaction, determine which Jacobian entries it affects
  for (let rxnIdx = 0; rxnIdx < reactions.length; rxnIdx++) {
    const rxn = reactions[rxnIdx];
    
    // Count stoichiometry of each species in reactants and products
    const reactantCount = new Map<number, number>();
    const productCount = new Map<number, number>();
    
    for (const s of rxn.reactants) {
      reactantCount.set(s, (reactantCount.get(s) || 0) + 1);
    }
    for (const s of rxn.products) {
      productCount.set(s, (productCount.get(s) || 0) + 1);
    }
    
    // Net stoichiometry for each affected species
    const netStoich = new Map<number, number>();
    for (const [s, count] of reactantCount) {
      netStoich.set(s, (netStoich.get(s) || 0) - count);
    }
    for (const [s, count] of productCount) {
      netStoich.set(s, (netStoich.get(s) || 0) + count);
    }
    
    // For each affected species i with non-zero net stoichiometry
    for (const [i, ν_i] of netStoich) {
      if (ν_i === 0) continue;
      
      // For each reactant j
      for (let k = 0; k < rxn.reactants.length; k++) {
        const j = rxn.reactants[k];
        const key = `${i},${j}`;
        const entryIdx = entryIndex.get(key);
        if (entryIdx !== undefined) {
          const stoichJ = reactantCount.get(j) || 0;
          contributions[entryIdx].push({
            rxnIdx,
            netStoichI: ν_i,
            reactantStoichJ: stoichJ,
            reactantIdxJ: k
          });
        }
      }
    }
  }
  
  return contributions;
}


/**
 * Generate a JIT-compiled analytical Jacobian evaluation function.
 * Supports mass-action kinetics and constant rate expressions.
 * 
 * @param reactions - Array of reactions
 * @param nSpecies - Number of species
 * @param sparsity - Sparsity pattern
 * @param parameters - Parameter values for expression evaluation
 * @returns A function that evaluates J(y) into a flat data array
 */
export function generateAnalyticalJacobian(
  reactions: Rxn[],
  nSpecies: number,
  sparsity: SparseJacobianInfo,
  parameters: Record<string, number> = {}
): (y: Float64Array, data: Float64Array) => void {
  const contributions = buildJacobianContributions(reactions, nSpecies, sparsity);
  const lines: string[] = [];
  
  lines.push('// JIT-compiled analytical Jacobian evaluator');
  lines.push('var r_val, dv;');
  
  // Bind parameters
  for (const [name, value] of Object.entries(parameters)) {
    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) {
      lines.push(`const ${name} = ${value};`);
    }
  }

  // Pre-process reactions to handle complex rates vs simple rates
  const rxnRateExprs = reactions.map(rxn => {
    if (rxn.rateExpression) {
      // Check for illegal patterns or y dependencies
      const deps = getExpressionDependencies(rxn.rateExpression);

      // SECURITY: Validate AST structure to prevent code injection via new Function
      if (!SafeExpressionEvaluator.isSafe(rxn.rateExpression, Array.from(deps))) {
        throw new Error(`[SparseJacobian] Unsafe rate expression detected: ${rxn.rateExpression}`);
      }

      const translated = ExpressionTranslator.translate(rxn.rateExpression);
      const hasSpeciesDep = Array.from(deps).some(d => d.startsWith('s') && !isNaN(parseInt(d.substring(1))));
      
      return { 
        expr: translated, 
        isConstant: !hasSpeciesDep,
        statFactor: rxn.statFactor ?? 1
      };
    }
    return { 
      expr: (rxn.rate !== undefined ? rxn.rate.toString() : "0"), 
      isConstant: true,
      statFactor: rxn.statFactor ?? 1
    };
  });

  const rxnRateValues = rxnRateExprs.map((info, idx) => {
    const expr = info.expr.replace(/\bMath\./g, '');
    const parameterNames = Object.keys(parameters);

    if (!info.isConstant) {
      const evaluator = SafeExpressionEvaluator.compile(expr, parameterNames);
      const value = evaluator(parameters);
      if (!Number.isFinite(value)) {
        throw new Error(`[SparseJacobian] Non-finite rate expression at reaction ${idx}`);
      }
      return value * info.statFactor;
    }

    const numericValue = Number(expr);
    return (Number.isFinite(numericValue) ? numericValue : 0) * info.statFactor;
  });

  // For each non-zero entry, generate code to compute it
  for (let i = 0; i < nSpecies; i++) {
    for (let ptr = sparsity.rowPtr[i]; ptr < sparsity.rowPtr[i + 1]; ptr++) {
      const j = sparsity.colIdx[ptr];
      const contribs = contributions[ptr];
      
      lines.push(`data[${ptr}] = 0;`);
      
      for (const contrib of contribs) {
        const rxn = reactions[contrib.rxnIdx];
        const info = rxnRateExprs[contrib.rxnIdx];
        
        // Mass-action part: derivative of k * prod(y_r) wrt y_j
        // d(k * y_j * prod(y_k))/dy_j = k * prod(y_k)
        
        let massActionPart = `${info.expr}`;
        if (info.statFactor !== 1) massActionPart = `(${massActionPart} * ${info.statFactor})`;
        
        // Multiply by other reactants (excluding one instance of y_j)
        // ⚡ Bolt Performance Optimization:
        // Avoid array allocation and splice during string building.
        const rxnReactants = rxn.reactants;
        let jIdxToSkip = rxnReactants.indexOf(j);
        for (let idx = 0; idx < rxnReactants.length; idx++) {
          if (idx === jIdxToSkip) {
            jIdxToSkip = -1; // skip only one instance
            continue;
          }
          massActionPart += ` * y[${rxnReactants[idx]}]`;
        }
        
        // Coeff is netStoichI * reactantStoichJ
        const coeff = contrib.netStoichI * contrib.reactantStoichJ;
        lines.push(`data[${ptr}] += ${coeff} * (${massActionPart});`);
        
        // If the rate itself depends on y[j] (non-mass-action), we need d(k)/dy[j] * prod(y_r)
        // For now, we assume rates don't depend on species (standard BNG2 network simulation)
        // but if they do, we'd need DF/dy[j] here.
      }
    }
  }
  
  const code = `return function analyticalJacobian(y, data) {\n  ${lines.join('\n  ')}\n}`;
  void code;

  return (y: Float64Array, data: Float64Array) => {
    data.fill(0);

    for (let ptr = 0; ptr < contributions.length; ptr++) {
      const contribs = contributions[ptr];
      if (contribs.length === 0) continue;

      let value = 0;
      for (const contrib of contribs) {
        const rxn = reactions[contrib.rxnIdx];
        let massActionPart = rxnRateValues[contrib.rxnIdx];

        // ⚡ Bolt Performance Optimization:
        // Avoid array allocation ([...rxn.reactants]) and .splice() inside this hot loop.
        // Instead, find the index to skip and iterate the original array directly.
        const rxnReactants = rxn.reactants;
        let skipIndex = -1;
        if (contrib.reactantIdxJ >= 0 && contrib.reactantIdxJ < rxnReactants.length) {
          skipIndex = contrib.reactantIdxJ;
        } else {
          skipIndex = rxnReactants.indexOf(contrib.reactantIdxJ);
        }

        for (let idx = 0; idx < rxnReactants.length; idx++) {
          if (idx === skipIndex) {
            skipIndex = -1; // Only skip one instance in case of duplicates
            continue;
          }
          massActionPart *= y[rxnReactants[idx]];
        }

        const coeff = contrib.netStoichI * contrib.reactantStoichJ;
        value += coeff * massActionPart;
      }

      data[ptr] = value;
    }
  };
}

// Legacy alias kept for backward compatibility with older tests and APIs.
// The earlier implementation required the precomputed `contributions` array,
// but the modern `generateAnalyticalJacobian` recomputes what it needs and
// ignores the extra argument. We still accept `contributions` here so that
// existing callers (like tests) don't need to be modified immediately.
export function generateSparseJacobianFunction(
  reactions: Rxn[],
  nSpecies: number,
  sparsity: SparseJacobianInfo,
  _contributions: ReactionContribution[][]
): (y: Float64Array, data: Float64Array) => void {
  // contributions parameter is unused; kept for compatibility
  return generateAnalyticalJacobian(reactions, nSpecies, sparsity);
}
