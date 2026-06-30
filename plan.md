1. **Fix `rate` property missing error**
    - The TS error `Property 'rate' is missing in type ... but required in type 'BNGLReaction'` occurs because we didn't specify `rate: ''` or some string in the dummy reactions in the tests.

2. **Fix `PSAOptions` missing `method` error**
    - The TS error `Property 'method' is missing in type '{ t_end: number; n_steps: number; poplevel: number; seed: number; }' but required in type 'PSAOptions'` occurs because `PSAOptions` extends `SimulationOptions` which requires `method: 'ode' | 'ssa' | 'nfsim' | 'hybrid'`. We should add `method: 'hybrid'` to the options in the tests.

3. **Fix `Type 'never[]' is not assignable to type 'Record<string, number>'` error**
    - This error happens when providing an empty `parameters`, `rules`, etc. that expects a specific dictionary, or maybe when initializing `model.parameters = []` while it needs `Record<string, number>`. We will examine the TS error carefully.

4. **Update `PSASimulator.test.ts`**
    - Apply the fixes to `packages/engine/tests/simulation/PSASimulator.test.ts`.

5. **Validate with `npm run type-check`**
    - Ensure `npm run type-check` in the root folder passes without issues related to `PSASimulator.test.ts`.

6. **Submit changes**
    - Commit and push to fix the CI.
