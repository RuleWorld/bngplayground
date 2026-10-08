#!/bin/bash
# wasm-spatial/build_wasm.sh
# Build the spatial Monte Carlo engine to WebAssembly.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if ! command -v em++ &> /dev/null; then
    echo "Error: em++ not found. Please activate the Emscripten SDK."
    exit 1
fi

echo "Building spatial engine WASM..."

# em++ (not emcc): spatial_engine.cpp uses std::vector, so the link needs the
# C++ runtime. Plain emcc fails with undefined `operator new`/`operator delete`.
em++ -std=c++17 \
  -O2 \
  -fno-fast-math \
  -ffp-contract=off \
  -fno-associative-math \
  -fno-reciprocal-math \
  -fwasm-exceptions \
  -DNDEBUG \
  "$SCRIPT_DIR/spatial_engine.cpp" \
  -o spatial_loader.js \
  -s EXPORTED_FUNCTIONS="['_malloc', '_free', '_spatial_init', '_spatial_destroy', '_spatial_add_molecule', '_spatial_clear_molecules', '_spatial_set_diffusion_constant', '_spatial_molecule_count', '_spatial_set_callbacks', '_spatial_step', '_spatial_export_positions', '_spatial_count_species', '_spatial_remove_molecule', '_spatial_get_molecule_species_id', '_spatial_get_molecule_compartment_id', '_spatial_get_molecule_x', '_spatial_get_molecule_y', '_spatial_get_molecule_z']" \
  -s EXPORTED_RUNTIME_METHODS="['cwrap', 'getValue', 'setValue', 'addFunction', 'removeFunction', 'HEAPF32', 'HEAP32']" \
  -s MODULARIZE=1 \
  -s EXPORT_NAME="createSpatialModule" \
  -s ENVIRONMENT="web,worker" \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s INITIAL_MEMORY=67108864 \
  -s MAXIMUM_MEMORY=536870912 \
  -s ALLOW_TABLE_GROWTH=1 \
  -flto \
  --closure 0

# Append module exports
cat <<'EOF' >> spatial_loader.js

try {
    if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
        module.exports = createSpatialModule;
    }
} catch (e) {}
export default createSpatialModule;
EOF

echo "Installing artifacts..."
cp spatial_loader.js "$SCRIPT_DIR/../services/spatial_loader.js"
cp spatial_loader.wasm "$SCRIPT_DIR/../public/spatial.wasm"

echo "Build complete!"
echo "  services/spatial_loader.js"
echo "  public/spatial.wasm"
