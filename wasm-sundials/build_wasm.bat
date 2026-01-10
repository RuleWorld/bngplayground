@echo off
echo Building CVODE WASM with SPGMR support...

REM Ensure relative paths resolve from this script's directory
pushd %~dp0

REM Activate Emscripten SDK environment (local path)
call C:\Users\Achyudhan\emsdk\emsdk_env.bat

REM Define paths
set SUNDIALS_INC=./sundials/include
set BUILD_INC=./build/include
set LIBS=build/src/cvode/libsundials_cvode.a build/src/nvector/serial/libsundials_nvecserial.a build/src/sunmatrix/dense/libsundials_sunmatrixdense.a build/src/sunlinsol/dense/libsundials_sunlinsoldense.a build/src/sunlinsol/spgmr/libsundials_sunlinsolspgmr.a build/src/sunnonlinsol/newton/libsundials_sunnonlinsolnewton.a build/src/sunmatrix/band/libsundials_sunmatrixband.a build/src/sunlinsol/band/libsundials_sunlinsolband.a build/src/sundials/libsundials_core.a

REM Check if emcc is in path
where emcc >nul 2>nul
if errorlevel 1 (
    echo Error: emcc not found. Please activate the Emscripten environment via emsdk_env.bat.
    exit /b 1
)

echo Compiling with strict IEEE-754 floating-point compliance...
emcc -I%SUNDIALS_INC% -I%BUILD_INC% -O3 ^
 -fno-fast-math ^
 -ffp-contract=off ^
 -fno-associative-math ^
 -fno-reciprocal-math ^
 cvode_wrapper.c ^
 %LIBS% ^
 -o cvode_loader.js ^
 --js-library library_cvode.js ^
 -s EXPORTED_FUNCTIONS="['_init_solver', '_init_solver_jac', '_init_solver_sparse', '_solve_step', '_get_y', '_destroy_solver', '_set_init_step', '_set_max_step', '_set_min_step', '_set_max_ord', '_set_stab_lim_det', '_set_max_nonlin_iters', '_set_nonlin_conv_coef', '_set_max_err_test_fails', '_set_max_conv_fails', '_reinit_solver', '_get_solver_stats', '_malloc', '_free']" ^
 -s EXPORTED_RUNTIME_METHODS="['cwrap', 'getValue', 'setValue', 'HEAPF64']" ^
 -s MODULARIZE=1 ^
 -s EXPORT_NAME="createCVodeModule" ^
 -s ENVIRONMENT="web,worker,node" ^
 -s ALLOW_MEMORY_GROWTH=1

if errorlevel 1 (
    echo Build failed!
    exit /b 1
)

echo Appending module exports...
(
echo.
echo // Universal module export pattern - CJS for Node.js, globalThis for browsers
echo // Use try-catch to handle Vitest's ESM environment where module.exports may be read-only
echo try {
echo     if (typeof module !== 'undefined' ^&^& typeof module.exports !== 'undefined') {
echo         module.exports = createCVodeModule;
echo     }
echo } catch (e) {
echo     // Ignore - ESM export below will be used
echo }
echo // ESM export for browsers using Vite/bundlers and Vitest
echo export default createCVodeModule;
) >> cvode_loader.js

echo Installing artifacts...
copy /Y cvode_loader.js ..\services\cvode_loader.js
if errorlevel 1 (
    echo Error: copying cvode_loader.js to ..\services failed! Please ensure the file is not locked and you have write permissions.
    exit /b 1
)
copy /Y cvode_loader.wasm ..\public\cvode.wasm
if errorlevel 1 (
    echo Error: copying cvode_loader.wasm to ..\public failed! Please ensure the file is not locked and you have write permissions.
    exit /b 1
)

echo Done!

popd
