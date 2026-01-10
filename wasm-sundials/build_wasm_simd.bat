@echo off
REM Build CVODE WASM with SIMD support for 2-4x speedup on vectorizable operations
REM Requires: Emscripten SDK, SUNDIALS built with emcc

call C:\Users\Achyudhan\emsdk\emsdk_env.bat

echo ===== Building CVODE WASM with SIMD Support =====

REM SIMD-enabled build flags:
REM   -msimd128: Enable WASM SIMD instructions
REM   -O3: Maximum optimization (better SIMD auto-vectorization)
REM   -ffast-math: Allow aggressive FP optimizations
REM   -flto: Link-time optimization for cross-file inlining

set SUNDIALS_LIB=C:\Users\Achyudhan\sundials_build\build\src
set SUNDIALS_INC=C:\Users\Achyudhan\sundials_build\sundials\include
set SUNDIALS_BUILD_INC=C:\Users\Achyudhan\sundials_build\build\include

set LIBS=%SUNDIALS_LIB%\cvode\libsundials_cvode.a ^
         %SUNDIALS_LIB%\nvector\serial\libsundials_nvecserial.a ^
         %SUNDIALS_LIB%\sunmatrix\dense\libsundials_sunmatrixdense.a ^
         %SUNDIALS_LIB%\sunlinsol\dense\libsundials_sunlinsoldense.a ^
         %SUNDIALS_LIB%\sunlinsol\spgmr\libsundials_sunlinsolspgmr.a ^
         %SUNDIALS_LIB%\sundials\libsundials_core.a

set EXPORTED_FUNCS="['_init_solver', '_init_solver_sparse', '_init_solver_with_jac', '_solve_step', '_get_y', '_destroy_solver', '_malloc', '_free']"
set EXPORTED_RUNTIME="['ccall', 'cwrap', 'getValue', 'setValue', 'HEAPF64']"

echo Building cvode_simd.js...
emcc cvode_wrapper.c %LIBS% ^
     -I %SUNDIALS_INC% -I %SUNDIALS_BUILD_INC% ^
     -o ..\public\cvode_simd.js ^
     -msimd128 ^
     -O3 ^
     -ffast-math ^
     -flto ^
     -s EXPORTED_FUNCTIONS=%EXPORTED_FUNCS% ^
     -s EXPORTED_RUNTIME_METHODS=%EXPORTED_RUNTIME% ^
     -s MODULARIZE=1 ^
     -s EXPORT_NAME="createCVodeModuleSIMD" ^
     -s ALLOW_MEMORY_GROWTH=1 ^
     -s WASM_BIGINT=1 ^
     --js-library library_cvode.js

if %ERRORLEVEL% NEQ 0 (
    echo ERROR: SIMD build failed!
    exit /b 1
)

echo ===== SIMD Build Complete =====
echo Output: public\cvode_simd.js
echo.
echo To use: Check browser support with WebAssembly.validate for SIMD
