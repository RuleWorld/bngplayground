#!/bin/bash
echo "Building CVODE WASM with SPGMR support..."

# Define paths
SUNDIALS_INC="./sundials/include"
BUILD_INC="./build/include"
LIBS="build/src/cvode/libsundials_cvode.a build/src/nvector/serial/libsundials_nvecserial.a build/src/sunmatrix/dense/libsundials_sunmatrixdense.a build/src/sunlinsol/dense/libsundials_sunlinsoldense.a build/src/sunlinsol/spgmr/libsundials_sunlinsolspgmr.a build/src/sunnonlinsol/newton/libsundials_sunnonlinsolnewton.a build/src/sunnonlinsol/fixedpoint/libsundials_sunnonlinsolfixedpoint.a build/src/sundials/libsundials_core.a build/src/nvector/manyvector/libsundials_nvecmanyvector.a build/src/sunmatrix/band/libsundials_sunmatrixband.a build/src/sunlinsol/band/libsundials_sunlinsolband.a"

# Check if emcc is in path
EMCC="emcc"
EMCMAKE="emcmake"
EMMAKE="emmake"

if ! command -v emcc &> /dev/null
then
    if command -v emcc.bat &> /dev/null
    then
        echo "Found emcc.bat..."
        EMCC="emcc.bat"
        EMCMAKE="emcmake.bat"
        EMMAKE="emmake.bat"
    # User specific path check (Git Bash style)
    elif [ -f "/c/Users/Achyudhan/emsdk/upstream/emscripten/emcc.bat" ]; then
        echo "Found emcc.bat at user path..."
        EMCC="/c/Users/Achyudhan/emsdk/upstream/emscripten/emcc.bat"
        EMCMAKE="/c/Users/Achyudhan/emsdk/upstream/emscripten/emcmake.bat"
        EMMAKE="/c/Users/Achyudhan/emsdk/upstream/emscripten/emmake.bat"
    elif [ -f "/c/Users/Achyudhan/emsdk/upstream/emscripten/emcc" ]; then
        echo "Found emcc at user path..."
        EMCC="/c/Users/Achyudhan/emsdk/upstream/emscripten/emcc"
        EMCMAKE="/c/Users/Achyudhan/emsdk/upstream/emscripten/emcmake"
        EMMAKE="/c/Users/Achyudhan/emsdk/upstream/emscripten/emmake"
    else
        echo "Error: emcc (or emcc.bat) not found in PATH or at C:/Users/Achyudhan/emsdk/upstream/emscripten/emcc"
        echo "Please make sure you have activated the Emscripten environment (e.g., emsdk_env.bat)."
        exit 1
    fi
fi

# Temp directory for building to avoid path length issues
BUILD_DIR="/tmp/bng_cvode_build"
ORIG_DIR=$(pwd)

echo "Setting up temporary build directory at $BUILD_DIR..."
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"
cp -r . "$BUILD_DIR"

echo "Using compiler: $EMCC"
echo "Using cmake wrapper: $EMCMAKE"
echo "Using make wrapper: $EMMAKE"

echo "Building SUNDIALS libraries..."
cd "$BUILD_DIR/build"
rm -rf *
$EMCMAKE cmake ../sundials -DCMAKE_INSTALL_PREFIX=install -DBUILD_SHARED_LIBS=OFF -DBUILD_STATIC_LIBS=ON -DEXAMPLES_ENABLE_C=OFF -DEXAMPLES_INSTALL=OFF
$EMMAKE make -j4
cd ..

echo "Compiling CVODE WASM with strict IEEE-754 floating-point compliance..."
# Note outputting to cvode.js automatically creates cvode.wasm
$EMCC -I$SUNDIALS_INC -I$BUILD_INC -O3 \
 -fno-fast-math \
 -ffp-contract=off \
 -fno-associative-math \
 -fno-reciprocal-math \
 cvode_wrapper.c \
 $LIBS \
 -o cvode.js \
 --js-library library_cvode.js \
 -s EXPORTED_FUNCTIONS="['_init_solver', '_init_solver_sparse', '_init_solver_jac', '_solve_step', '_get_y', '_destroy_solver', '_set_init_step', '_set_max_step', '_set_min_step', '_set_max_ord', '_set_stab_lim_det', '_set_max_nonlin_iters', '_set_nonlin_conv_coef', '_set_max_err_test_fails', '_set_max_conv_fails', '_reinit_solver', '_get_solver_stats', '_malloc', '_free']" \
 -s EXPORTED_RUNTIME_METHODS="['cwrap', 'getValue', 'setValue', 'HEAPF64', 'HEAP32']" \
 -s MODULARIZE=1 \
 -s EXPORT_NAME="createCVodeModule" \
 -s ENVIRONMENT="web,worker,node" \
 -s ALLOW_MEMORY_GROWTH=1

if [ $? -ne 0 ]; then
    echo "Build failed!"
    exit 1
fi

echo "Appending module exports..."
cat <<EOF >> cvode.js

// Universal module export pattern - CJS for Node.js, globalThis for browsers
// Use try-catch to handle Vitest's ESM environment where module.exports may be read-only
try {
    if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
        module.exports = createCVodeModule;
    }
} catch (e) {
    // Ignore - ESM export below will be used
}
// ESM export for browsers using Vite/bundlers and Vitest
export default createCVodeModule;
EOF

echo "Installing artifacts to original project..."
cp cvode.js "$ORIG_DIR/../services/cvode_loader.js"
cp cvode.wasm "$ORIG_DIR/../public/cvode.wasm"

echo "Cleaning up..."
cd "$ORIG_DIR"
rm -rf "$BUILD_DIR"

echo "Done!"
