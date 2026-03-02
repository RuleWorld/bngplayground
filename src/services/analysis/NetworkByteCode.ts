/**
 * Represents a compactly encoded reaction network for high-performance 
 * interpretation inside a WASM environment (C/C++).
 * 
 * This avoids the overhead of WASM -> JS transition for every RHS evaluation 
 * during ODE integration.
 */
export interface NetworkByteCode {
  nReactions: number;
  nSpecies: number;

  /**
   * Rate constants for each reaction.
   * length: nReactions
   */
  rateConstants: Float64Array;

  /**
   * Number of reactants for each reaction.
   * length: nReactions
   */
  nReactantsPerRxn: Int32Array;

  /**
   * Offsets into reactantIdx and reactantStoich arrays for each reaction.
   * length: nReactions + 1
   */
  reactantOffsets: Int32Array;

  /**
   * Flat array of reactant indices.
   * length: total number of reactant entries across all reactions
   */
  reactantIdx: Int32Array;

  /**
   * Flat array of reactant stoichiometries.
   * length: total number of reactant entries across all reactions
   */
  reactantStoich: Int32Array;

  /**
   * Volume scaling factor for each reaction's flux.
   * length: nReactions
   */
  scalingVolumes: Float64Array;

  /**
   * Offsets into speciesRxnIdx and speciesStoich arrays for each species.
   * length: nSpecies + 1
   */
  speciesOffsets: Int32Array;

  /**
   * Flat array of reaction indices that affect a given species.
   * length: total number of stoichiometry entries across all species
   */
  speciesRxnIdx: Int32Array;

  /**
   * Flat array of stoichiometry values (net change).
   * length: total number of stoichiometry entries across all species
   */
  speciesStoich: Float64Array;

  /**
   * Volume of each species' compartment.
   * length: nSpecies
   */
  speciesVolumes: Float64Array;

  /**
   * --- Jacobian Bytecode Extension ---
   * For analytical Jacobian calculation inside WASM.
   */
  
  /**
   * rowPtr for CSR format of the Jacobian.
   * length: nSpecies + 1
   */
  jacRowPtr?: Int32Array;

  /**
   * column indices for CSR format of the Jacobian.
   * length: total nonzero entries in Jacobian
   */
  jacColIdx?: Int32Array;

  /**
   * Offsets into jacContribRxnIdx and jacContribCoeffs for each nonzero entry.
   * length: (total nonzero entries) + 1
   */
  jacContribOffsets?: Int32Array;

  /**
   * Reaction indices contributing to a specific Jacobian entry.
   * length: total contribution entries
   */
  jacContribRxnIdx?: Int32Array;

  /**
   * Precomputed coefficients for Jacobian contributions (netStoichI * reactantStoichJ).
   * length: total contribution entries
   */
  jacContribCoeffs?: Float64Array;
}
