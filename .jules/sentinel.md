2026-06-30
- Fixed `Math.random` vulnerability in `packages/engine/src/services/multiscale/CellAgent.ts` by replacing it with a custom secure fallback `cryptoRandom` utilizing `globalThis.crypto.getRandomValues`. This prevents potential exploitation via predictability if random generation is ever tied to sensitive contexts or precise reproducibility metrics.
