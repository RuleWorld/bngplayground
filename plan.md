1. Add `compileSSAPropensities` method to `packages/engine/src/services/analysis/JITCompiler.ts`.
   - The method generates a fast path for evaluating propensities for mass-action kinetics without functional rates.
   - It will return `(state: Float64Array, propensities: Float64Array) => number`, matching the exact inline calculations used in the interpreted loop in `SimulationLoop.ts`.
   - It iterates over the concrete reactions to generate string expressions for inline propensity evaluation. This involves accounting for propensity factors, scaled volumes, and stoichiometric state multipliers for non-functional rates.
   - It aggregates propensities into `propensities[i]` and keeps a running `aTotal` which it returns.
2. Integrate `compileSSAPropensities` into `packages/engine/src/services/simulation/SimulationLoop.ts`.
   - In the SSA loop section, if `functionalRateCount === 0`, try to generate the fast SSA propensities evaluating function via `jitCompiler.compileSSAPropensities(concreteReactions, reactionReactingVolumes)`.
   - Update the loop body to dispatch to the compiled function if available, rather than running the generic interpreted loop.
3. Complete pre commit steps.
4. Submit the change.
