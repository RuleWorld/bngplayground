#!/bin/bash
echo "Building CVODE WASM with KLU-backed sparse support..."

# Define paths
SUNDIALS_INC="./sundials/include"
BUILD_INC="./build/include"
SUITESPARSE_SRC="./_deps/SuiteSparse"
SUITESPARSE_BUILD="./_deps/build-emscripten-klu"
SUITESPARSE_INSTALL="./_deps/install-emscripten-klu"

# Check if emcc is in path
EMCC="emcc"
EMCMAKE="emcmake"
EMMAKE="emmake"

if ! command -v emcc &> /dev/null; then
    echo "Error: emcc not found. Please activate the Emscripten SDK first:"
    echo "  source \$EMSDK/emsdk_env.sh"
    exit 1
fi
echo "Using emcc: $(which emcc)"

mkdir -p ./_deps

if [ ! -d "$SUITESPARSE_SRC/.git" ]; then
    echo "Fetching SuiteSparse (v7.3.0 tag)..."
    rm -rf "$SUITESPARSE_SRC"
    git clone --depth 1 --branch v7.3.0 https://github.com/DrTimothyAldenDavis/SuiteSparse.git "$SUITESPARSE_SRC"
fi

if [ "${FORCE_SUITESPARSE_REBUILD:-0}" = "1" ] || [ ! -f "$SUITESPARSE_INSTALL/lib/libklu.a" ]; then
    echo "Building SuiteSparse KLU toolchain for Emscripten..."
    rm -rf "$SUITESPARSE_BUILD" "$SUITESPARSE_INSTALL"
    $EMCMAKE cmake -S "$SUITESPARSE_SRC" -B "$SUITESPARSE_BUILD" \
        -D CMAKE_BUILD_TYPE=Release \
        -D CMAKE_INSTALL_PREFIX="$SUITESPARSE_INSTALL" \
        -D SUITESPARSE_ENABLE_PROJECTS="suitesparse_config;amd;colamd;btf;klu" \
        -D KLU_USE_CHOLMOD=OFF \
        -D BUILD_SHARED_LIBS=OFF \
        -D BUILD_STATIC_LIBS=ON \
        -D SUITESPARSE_REQUIRE_BLAS=OFF \
        -D SUITESPARSE_USE_FORTRAN=OFF \
        -D SUITESPARSE_CONFIG_USE_OPENMP=OFF \
        -D BLA_VENDOR=Generic
    cmake --build "$SUITESPARSE_BUILD" --config Release --target install -j4
fi

ORIG_DIR=$(pwd)
SUITESPARSE_INC="$ORIG_DIR/_deps/install-emscripten-klu/include/suitesparse"
LIBS="build/src/cvode/libsundials_cvode.a build/src/cvodes/libsundials_cvodes.a build/src/kinsol/libsundials_kinsol.a build/src/nvector/serial/libsundials_nvecserial.a build/src/sunmatrix/dense/libsundials_sunmatrixdense.a build/src/sunmatrix/sparse/libsundials_sunmatrixsparse.a build/src/sunlinsol/dense/libsundials_sunlinsoldense.a build/src/sunlinsol/spgmr/libsundials_sunlinsolspgmr.a build/src/sunlinsol/klu/libsundials_sunlinsolklu.a build/src/sunnonlinsol/newton/libsundials_sunnonlinsolnewton.a build/src/sunnonlinsol/fixedpoint/libsundials_sunnonlinsolfixedpoint.a build/src/sundials/libsundials_core.a build/src/nvector/manyvector/libsundials_nvecmanyvector.a build/src/sunmatrix/band/libsundials_sunmatrixband.a build/src/sunlinsol/band/libsundials_sunlinsolband.a $ORIG_DIR/_deps/install-emscripten-klu/lib/libklu.a $ORIG_DIR/_deps/install-emscripten-klu/lib/libamd.a $ORIG_DIR/_deps/install-emscripten-klu/lib/libcolamd.a $ORIG_DIR/_deps/install-emscripten-klu/lib/libbtf.a $ORIG_DIR/_deps/install-emscripten-klu/lib/libsuitesparseconfig.a"

echo "Using compiler: $EMCC"
echo "Using cmake wrapper: $EMCMAKE"
echo "Using make wrapper: $EMMAKE"

echo "Building SUNDIALS libraries..."
rm -rf ./build
mkdir -p ./build
cd ./build
rm -rf *
$EMCMAKE cmake ../sundials -DCMAKE_INSTALL_PREFIX=install -DBUILD_SHARED_LIBS=OFF -DBUILD_STATIC_LIBS=ON -DEXAMPLES_ENABLE_C=OFF -DEXAMPLES_INSTALL=OFF -DBUILD_CVODES=ON -DBUILD_KINSOL=ON -DENABLE_KLU=ON -DKLU_ROOT="$ORIG_DIR/_deps/install-emscripten-klu" -DCMAKE_PREFIX_PATH="$ORIG_DIR/_deps/install-emscripten-klu" -DKLU_WORKS=TRUE
$EMMAKE make -j4
cd ..

echo "Compiling CVODE WASM with strict IEEE-754 floating-point compliance..."
# Note outputting to cvode.js automatically creates cvode.wasm
$EMCC -I$SUNDIALS_INC -I$BUILD_INC -I"$SUITESPARSE_INC" -O3 \
 -fno-fast-math \
 -ffp-contract=off \
 -fno-associative-math \
 -fno-reciprocal-math \
 cvode_wrapper.c \
 $LIBS \
 -o cvode.js \
 --js-library library_cvode.js \
  -s EXPORTED_FUNCTIONS="['_init_solver', '_init_solver_adams', '_init_solver_sparse', '_init_solver_jac', '_solve_step', '_get_y', '_destroy_solver', '_set_init_step', '_set_max_step', '_set_min_step', '_set_max_ord', '_set_stab_lim_det', '_set_max_nonlin_iters', '_set_nonlin_conv_coef', '_set_max_err_test_fails', '_set_max_conv_fails', '_set_max_num_steps', '_set_sv_tolerances', '_reinit_solver', '_get_solver_stats', '_init_roots', '_get_root_info', '_load_network', '_bind_network', '_unload_network', '_update_rate_constants', '_cvode_load_network', '_cvode_bind_network', '_cvode_unload_network', '_cvode_update_rate_constants', '_sens_init_forward', '_sens_solve_step', '_sens_get_y', '_sens_get_s', '_sens_get_all', '_sens_bind_network', '_sens_update_params', '_sens_get_stats', '_sens_destroy', '_kinsol_init', '_kinsol_solve', '_kinsol_get_y', '_kinsol_bind_network', '_kinsol_get_stats', '_kinsol_destroy', '_malloc', '_free']" \
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

echo "Done!"
