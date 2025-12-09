
# Nauty WebAssembly Module

This directory contains the source code for the Nauty graph canonicalization library and a C wrapper for WebAssembly integration.

## Compilation

To compile this module, you need [Emscripten](https://emscripten.org/) installed and active in your environment.

Run the following command from the project root:

```bash
emcc src/wasm/nauty/nauty_wrapper.c src/wasm/nauty/nauty.c src/wasm/nauty/nautil.c src/wasm/nauty/naugraph.c -o src/wasm/nauty/nauty.js -s WASM=1 -s EXPORTED_FUNCTIONS="['_getCanonicalOrbits', '_malloc', '_free']" -s EXPORTED_RUNTIME_METHODS="['ccall', 'cwrap']" -s ALLOW_MEMORY_GROWTH=1 -O3
```

This will generate:
- `src/wasm/nauty/nauty.js`: The JavaScript loader.
- `src/wasm/nauty/nauty.wasm`: The binary WebAssembly module.

## Usage

The module is integrated via `src/services/graph/core/NautyService.ts`.
Ensure the WASM module is initialized before running simulations that require symmetry reduction on large graphs.
