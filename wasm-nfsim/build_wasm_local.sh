#!/bin/bash
set -euo pipefail

export EMSDK="/c/Users/Achyudhan/emsdk"
EMSDK_PYTHON="$EMSDK/python/3.13.3_64bit"

# Put emsdk's python FIRST — before Windows Store aliases
export PATH="$EMSDK_PYTHON:$EMSDK_PYTHON/Scripts:$EMSDK/upstream/emscripten:$EMSDK/node/22.16.0_64bit/bin:$EMSDK:$PATH"

# Also set EM_PYTHON so emcc uses the right interpreter
export EM_PYTHON="$EMSDK_PYTHON/python.exe"

# Create a 'python' alias in a temp dir that points to emsdk's python
# This bypasses Windows Store alias completely
TMPBIN="$(mktemp -d)"
ln -sf "$EMSDK_PYTHON/python.exe" "$TMPBIN/python"
ln -sf "$EMSDK_PYTHON/python.exe" "$TMPBIN/python3"
export PATH="$TMPBIN:$PATH"

NFSIM_SRC="/c/Users/Achyudhan/OneDrive - University of Pittsburgh/Desktop/Achyudhan/School/PhD/Research/temp/nfsim"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/build_ems"
POST_JS="$SCRIPT_DIR/nfsim_post.js"

echo "Using emcc: $(which emcc)"
echo "Using python: $(which python) -> $("$TMPBIN/python" --version)"
echo "NFsim source: $NFSIM_SRC"

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# Copy post-js to build dir to avoid spaces-in-path issues with CMake linker flags
cp "$POST_JS" "$BUILD_DIR/nfsim_post.js"

cd "$BUILD_DIR"

emcmake cmake "$NFSIM_SRC" \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_CXX_FLAGS="-O3 -fexceptions -std=c++11" \
  -DCMAKE_C_FLAGS="-O3" \
  -DCMAKE_EXE_LINKER_FLAGS="-s MODULARIZE=1 -s EXPORT_NAME=createNFsimModule -s EXPORTED_FUNCTIONS=[_main,_malloc,_free] -s EXPORTED_RUNTIME_METHODS=[callMain,FS,cwrap,UTF8ToString,stringToUTF8,lengthBytesUTF8,print,printErr] -s ALLOW_MEMORY_GROWTH=1 -s INITIAL_MEMORY=134217728 -s MAXIMUM_MEMORY=536870912 -s STACK_SIZE=5242880 -s ENVIRONMENT=web,worker -s FORCE_FILESYSTEM=1 -s DISABLE_EXCEPTION_CATCHING=0 -s INVOKE_RUN=0 --post-js nfsim_post.js"

emmake make -j4

# Copy output
for name in NFsim nfsim; do
  if [ -f "${name}.js" ]; then
    cp "${name}.js" "$SCRIPT_DIR/../public/nfsim.js"
    printf "\nexport default createNFsimModule;\n" >> "$SCRIPT_DIR/../public/nfsim.js"
    break
  fi
done

for name in NFsim nfsim; do
  if [ -f "${name}.wasm" ]; then
    cp "${name}.wasm" "$SCRIPT_DIR/../public/nfsim.wasm"
    cp "${name}.wasm" "$SCRIPT_DIR/../public/NFsim.wasm"
    break
  fi
done

rm -rf "$TMPBIN"

echo "Build complete!"
echo "Verifying energy code in WASM..."
strings "$SCRIPT_DIR/../public/nfsim.wasm" 2>/dev/null | grep -i "energy" | head -5 || echo "(no energy strings found - check with wasm tools)"
