#!/usr/bin/env bash
# wasm-igraph/build_wasm.sh
#
# Build igraph_wrapper.c -> igraph.js + igraph.wasm using Emscripten.
#
# Prerequisites:
#   1. Emscripten SDK installed and activated:
#        source /path/to/emsdk/emsdk_env.sh
#   2. Prebuilt igraph WASM artifacts from kanaverse/igraph-wasm.
#      Download the release archive for your Emscripten version:
#        https://github.com/kanaverse/igraph-wasm/releases
#      and extract it (e.g.) to ./igraph-wasm-artifacts/
#      Expected structure after extraction:
#        igraph-wasm-artifacts/
#          include/igraph/         <- igraph headers
#          lib/libigraph.a         <- static library (WASM target)
#          lib/libxml2.a           <- optional, igraph XML support
#
#   3. GMP is disabled in the prebuilt .a files; no separate GMP needed.
#
# Usage:
#   ./build_wasm.sh
#
# Outputs (installed automatically):
#   services/igraph_loader.js
#   public/igraph.wasm

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

ARTIFACTS="${SCRIPT_DIR}/igraph-wasm-artifacts"
INCLUDE_DIR="${ARTIFACTS}/include"
LIB_DIR="${ARTIFACTS}/lib"
SRC="${SCRIPT_DIR}/igraph_wrapper.c"
OUT_JS="${SCRIPT_DIR}/igraph.js"

# ---- sanity checks -------------------------------------------------------
if ! command -v emcc &>/dev/null; then
  echo "ERROR: emcc not found. Activate the Emscripten SDK first:"
  echo "  source /path/to/emsdk/emsdk_env.sh"
  exit 1
fi

if [ ! -d "${INCLUDE_DIR}/igraph" ]; then
  echo "ERROR: igraph headers not found at ${INCLUDE_DIR}/igraph"
  echo "Download the prebuilt artifacts from https://github.com/kanaverse/igraph-wasm/releases"
  echo "and extract to ${ARTIFACTS}/"
  exit 1
fi

if [ ! -f "${LIB_DIR}/libigraph.a" ]; then
  echo "ERROR: libigraph.a not found at ${LIB_DIR}/libigraph.a"
  exit 1
fi

echo "Building igraph WASM wrapper..."
echo "  emcc version : $(emcc --version | head -1)"
echo "  igraph headers : ${INCLUDE_DIR}"
echo "  libigraph.a    : ${LIB_DIR}/libigraph.a"

# ---- compile ---------------------------------------------------------------
emcc "${SRC}" \
  -I "${INCLUDE_DIR}" \
  "${LIB_DIR}/libigraph.a" \
  -o "${OUT_JS}" \
  -O3 \
  -flto \
  -s WASM=1 \
  -s MODULARIZE=1 \
  -s EXPORT_NAME="IgraphModule" \
  -s ENVIRONMENT="web,worker" \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s INITIAL_MEMORY=33554432 \
  -s MAXIMUM_MEMORY=268435456 \
  -s FILESYSTEM=0 \
  -s EXPORTED_FUNCTIONS='["_ig_analyse","_ig_malloc","_ig_free","_malloc","_free","_strlen"]' \
  -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","UTF8ToString","HEAPU8","HEAP32","setValue"]' \
  -s NO_EXIT_RUNTIME=1 \
  -s SINGLE_FILE=0 \
  -lm

echo "Build complete: ${OUT_JS}"
echo "              ${SCRIPT_DIR}/igraph.wasm"

# ---- append module exports -------------------------------------------------
# Universal CJS + ESM export pattern, same as cvode_loader.js
cat >> "${OUT_JS}" << 'EOF'

// Universal module export pattern — CJS for Node.js, ESM for Vite/browsers
// Use try-catch to handle Vitest's ESM environment where module.exports may be read-only
try {
    if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
        module.exports = IgraphModule;
    }
} catch (e) {
    // Ignore — ESM export below will be used
}
// ESM export for browsers using Vite/bundlers
export default IgraphModule;
EOF

# ---- install outputs -------------------------------------------------------
echo "Installing outputs..."

install -D "${OUT_JS}" "${ROOT_DIR}/services/igraph_loader.js"
install -D "${SCRIPT_DIR}/igraph.wasm" "${ROOT_DIR}/public/igraph.wasm"

echo "Installed:"
echo "  services/igraph_loader.js"
echo "  public/igraph.wasm"
echo ""
echo "Done. igraph WASM ready for use in BNG Playground."
