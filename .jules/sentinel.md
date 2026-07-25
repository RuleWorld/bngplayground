## 2025-02-27 - [Arbitrary Code Execution via new Function()]
**Vulnerability:** Found `new Function()` in `packages/engine/src/services/analysis/JITCompiler.ts` being used without the designated `createCompiledFunction` wrapper.
**Learning:** In this monorepo, there's a strict rule against using `new Function()` directly to prevent code injection via dynamically compiled functions.
**Prevention:** Always use the `createCompiledFunction` wrapper from `packages/engine/src/utils/safeFunctionCompiler.ts` when dynamic function generation is necessary.
