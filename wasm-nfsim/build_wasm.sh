#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# C++ source: clone akutuva21/nfsim and set NFSIM_SRC, or clone into a sibling directory
NFSIM_SRC="${NFSIM_SRC:-$SCRIPT_DIR/../nfsim-src}"

if [ ! -f "$NFSIM_SRC/src/NFsim.cpp" ]; then
  echo "NFsim sources not found at $NFSIM_SRC/src/NFsim.cpp"
  echo "Please clone https://github.com/RuleWorld/nfsim into $NFSIM_SRC first."
  exit 1
fi

# Resolve Emscripten tools
if ! command -v emcc &> /dev/null; then
    echo "Error: emcc not found. Please activate the Emscripten SDK first:"
    echo "  source \$EMSDK/emsdk_env.sh"
    exit 1
fi
EMCMAKE="emcmake"
EMMAKE="emmake"

BUILD_DIR="$SCRIPT_DIR/build_ems"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

POST_JS="$SCRIPT_DIR/nfsim_post.js"

pushd "$BUILD_DIR" >/dev/null

$EMCMAKE cmake "$NFSIM_SRC" \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_CXX_FLAGS="-O3 -fexceptions -std=c++11" \
  -DCMAKE_C_FLAGS="-O3" \
  -DCMAKE_EXE_LINKER_FLAGS="-s MODULARIZE=1 -s EXPORT_NAME=createNFsimModule -s EXPORTED_FUNCTIONS=['_main','_malloc','_free'] -s EXPORTED_RUNTIME_METHODS=['callMain','FS','cwrap','UTF8ToString','stringToUTF8','lengthBytesUTF8'] -s ALLOW_MEMORY_GROWTH=1 -s ENVIRONMENT=web,worker -s FORCE_FILESYSTEM=1 -s DISABLE_EXCEPTION_CATCHING=0 --post-js \"$POST_JS\""

$EMMAKE make -j4

WASM_OPT="wasm-opt"
if [ -f "/opt/flutter/bin/cache/dart-sdk/bin/utils/wasm-opt" ]; then
  WASM_OPT="/opt/flutter/bin/cache/dart-sdk/bin/utils/wasm-opt"
fi

optimize_wasm() {
  local wasm_file="$1"
  if command -v "$WASM_OPT" &> /dev/null; then
    echo "Optimizing $wasm_file with wasm-opt..."
    "$WASM_OPT" -Oz --enable-exception-handling --enable-sign-ext "$wasm_file" -o "$wasm_file"
  else
    echo "wasm-opt not found, skipping optimization for $wasm_file."
  fi
}

if [ -f "NFsim.js" ]; then
  cp "NFsim.js" "$SCRIPT_DIR/../public/nfsim.js"
  printf "\nexport default createNFsimModule;\n" >> "$SCRIPT_DIR/../public/nfsim.js"
elif [ -f "nfsim.js" ]; then
  cp "nfsim.js" "$SCRIPT_DIR/../public/nfsim.js"
  printf "\nexport default createNFsimModule;\n" >> "$SCRIPT_DIR/../public/nfsim.js"
fi

if [ -f "NFsim.wasm" ]; then
  optimize_wasm "NFsim.wasm"
  cp "NFsim.wasm" "$SCRIPT_DIR/../public/nfsim.wasm"
  cp "NFsim.wasm" "$SCRIPT_DIR/../public/NFsim.wasm"
elif [ -f "nfsim.wasm" ]; then
  optimize_wasm "nfsim.wasm"
  cp "nfsim.wasm" "$SCRIPT_DIR/../public/nfsim.wasm"
  cp "nfsim.wasm" "$SCRIPT_DIR/../public/NFsim.wasm"
fi

popd >/dev/null

echo "Build complete."
