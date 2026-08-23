#!/bin/bash
# wasm-libbng/build_wasm.sh
# Build libBNG to WebAssembly via Emscripten.
#
# Dependencies: Emscripten SDK (emcc, emcmake, emmake), Bison 3.x, Flex 2.6.x
# Pattern: wasm-sundials/build_wasm.sh, wasm-nfsim/build_wasm.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LIBBNG_SRC="${LIBBNG_SRC:-$SCRIPT_DIR/_deps/libbng}"

# --- Step 0: Ensure libBNG sources exist ---
if [ ! -f "$LIBBNG_SRC/bng/bng_engine.h" ]; then
  echo "libBNG sources not found at $LIBBNG_SRC. Cloning..."
  mkdir -p "$SCRIPT_DIR/_deps"
  git clone --depth 1 https://github.com/mcellteam/libbng.git "$LIBBNG_SRC"
fi

# --- Step 0b: Verify Emscripten ---
if ! command -v emcc &> /dev/null; then
    echo "Error: emcc not found. Please activate the Emscripten SDK first."
    echo "  source /path/to/emsdk/emsdk_env.sh"
    exit 1
fi

echo "Using emcc: $(emcc --version | head -1)"

# --- Step 1: Generate Bison/Flex parser on host ---
GENERATED_DIR="$LIBBNG_SRC/bng/generated"
if [ ! -f "$GENERATED_DIR/bngl_parser.cpp" ]; then
  echo "Generating Bison/Flex parser..."
  mkdir -p "$GENERATED_DIR"

  if ! command -v bison &> /dev/null; then
    echo "Error: bison not found. Install bison 3.x."
    exit 1
  fi
  if ! command -v flex &> /dev/null; then
    echo "Error: flex not found. Install flex 2.6.x."
    exit 1
  fi

  bison -d -o "$GENERATED_DIR/bngl_parser.cpp" "$LIBBNG_SRC/bng/bngl_parser.y"
  flex --header-file="$GENERATED_DIR/bngl_scanner.hpp" \
       -o "$GENERATED_DIR/bngl_scanner.cpp" "$LIBBNG_SRC/bng/bngl_scanner.l"

  echo "Parser generation complete."
fi

# --- Step 2: Build libBNG + nauty as static libraries with Emscripten ---
BUILD_DIR="$SCRIPT_DIR/build_ems"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

echo "Configuring libBNG with emcmake cmake..."
pushd "$BUILD_DIR" > /dev/null

# We use the bng/ subdirectory CMakeLists which pulls in nauty
emcmake cmake "$LIBBNG_SRC/bng" \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_CXX_FLAGS="-std=c++17 -O2 -fno-fast-math -ffp-contract=off -fno-associative-math -fno-reciprocal-math -fwasm-exceptions -DNDEBUG -DYY_NO_UNISTD_H" \
  -DCMAKE_C_FLAGS="-O2 -fno-fast-math -ffp-contract=off -fwasm-exceptions -DNDEBUG" \
  -DBUILD_SHARED_LIBS=OFF \
  -DBUILD_STATIC_LIBS=ON

echo "Building libBNG..."
emmake make -j4

popd > /dev/null

# --- Step 3: Find the built static library ---
LIBBNG_LIB=""
if [ -f "$BUILD_DIR/liblibbng.a" ]; then
  LIBBNG_LIB="$BUILD_DIR/liblibbng.a"
elif [ -f "$BUILD_DIR/libbng.a" ]; then
  LIBBNG_LIB="$BUILD_DIR/libbng.a"
else
  echo "Searching for libBNG static library..."
  LIBBNG_LIB=$(find "$BUILD_DIR" -name "lib*.a" -path "*/libbng*" | head -1)
fi

NAUTY_LIB=""
if [ -f "$BUILD_DIR/nauty/libnauty.a" ]; then
  NAUTY_LIB="$BUILD_DIR/nauty/libnauty.a"
else
  NAUTY_LIB=$(find "$BUILD_DIR" -name "libnauty.a" | head -1)
fi

if [ -z "$LIBBNG_LIB" ]; then
  echo "Error: Could not find libBNG static library in $BUILD_DIR"
  echo "Available .a files:"
  find "$BUILD_DIR" -name "*.a"
  exit 1
fi

echo "Using libBNG: $LIBBNG_LIB"
echo "Using nauty:  $NAUTY_LIB"

# --- Step 4: Compile wrapper with Embind, linking against static libs ---
echo "Compiling libBNG WASM wrapper with strict IEEE-754 compliance..."
emcc -std=c++17 \
  -I"$LIBBNG_SRC" \
  -I"$LIBBNG_SRC/libs/sparsehash/src" \
  -I"$LIBBNG_SRC/libs" \
  -I"$BUILD_DIR/deps" \
  -O2 \
  -fno-fast-math \
  -ffp-contract=off \
  -fno-associative-math \
  -fno-reciprocal-math \
  -fwasm-exceptions \
  -DNDEBUG \
  -DYY_NO_UNISTD_H \
  "$SCRIPT_DIR/libbng_wrapper.cpp" \
  "$LIBBNG_LIB" \
  ${NAUTY_LIB:+"$NAUTY_LIB"} \
  -o libbng_loader.js \
  -s EXPORTED_FUNCTIONS="['_malloc', '_free', '_libbng_init', '_libbng_destroy', '_libbng_get_last_error', '_libbng_species_count', '_libbng_species_name', '_libbng_species_compartment', '_libbng_check_bimol_reaction', '_libbng_get_rxn_class_max_prob', '_libbng_get_pathway_for_prob', '_libbng_get_pathway_product_count', '_libbng_get_pathway_product_species_id', '_libbng_check_unimol_reaction', '_libbng_apply_unimol_pathway', '_libbng_rule_rate', '_libbng_rule_count', '_libbng_compartment_count', '_libbng_compartment_name', '_libbng_compartment_is_3d', '_libbng_compartment_volume', '_libbng_compartment_parent', '_libbng_mol_type_count', '_libbng_mol_type_name', '_libbng_seed_species_count', '_libbng_seed_species_name', '_libbng_seed_species_amount', '_libbng_observable_count', '_libbng_observable_name', '_libbng_get_parameter']" \
  -s EXPORTED_RUNTIME_METHODS="['cwrap', 'getValue', 'setValue', 'UTF8ToString', 'stringToUTF8', 'lengthBytesUTF8', 'HEAPF64', 'HEAP32']" \
  -s MODULARIZE=1 \
  -s EXPORT_NAME="createLibBNGModule" \
  -s ENVIRONMENT="web,worker" \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s INITIAL_MEMORY=67108864 \
  -s MAXIMUM_MEMORY=536870912 \
  -s FORCE_FILESYSTEM=1 \
  -flto \
  --closure 0

# --- Step 5: Append module exports (pattern from wasm-sundials) ---
cat <<'EOF' >> libbng_loader.js

// Universal module export pattern
try {
    if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
        module.exports = createLibBNGModule;
    }
} catch (e) {}
export default createLibBNGModule;
EOF

# --- Step 6: Install artifacts ---
echo "Installing artifacts..."
WASM_OPT="wasm-opt"
if [ -f "/opt/flutter/bin/cache/dart-sdk/bin/utils/wasm-opt" ]; then
  WASM_OPT="/opt/flutter/bin/cache/dart-sdk/bin/utils/wasm-opt"
fi

if command -v "$WASM_OPT" &> /dev/null; then
  echo "Optimizing libbng_loader.wasm with wasm-opt..."
  "$WASM_OPT" -Oz --enable-exception-handling --enable-sign-ext libbng_loader.wasm -o libbng_loader.wasm
else
  echo "wasm-opt not found, skipping optimization for libbng_loader.wasm."
fi

cp libbng_loader.js "$SCRIPT_DIR/../services/libbng_loader.js"
cp libbng_loader.wasm "$SCRIPT_DIR/../public/libbng.wasm"

echo "Build complete!"
echo "  services/libbng_loader.js"
echo "  public/libbng.wasm"
