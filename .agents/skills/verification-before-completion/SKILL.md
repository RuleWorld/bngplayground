---
name: verification-before-completion
description: Use before claiming a change is fixed, complete, faster, valid, or passing. Do not use a stale, partial, interrupted, or environment-degraded command as completion evidence.
---

# Verification before completion

Match fresh checks to the risk. Structural MCP changes need typecheck, fast tests, and the MCP build. Protocol changes also need server tests and conformance/Inspector smoke coverage. Numeric engine changes need `npm run test:full:safe`; performance claims need immutable benchmarks, correctness guards, and raw samples. Record exact commands and distinguish skipped/environment failures from passes.
