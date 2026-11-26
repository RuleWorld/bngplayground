@echo off
REM wasm-libbng/build_wasm.bat - Build libBNG to WebAssembly (Windows)
REM Pattern: wasm-sundials/build_wasm.bat, wasm-nfsim/build_wasm.bat
setlocal

echo Building libBNG WASM with strict IEEE-754 compliance...

REM Ensure relative paths resolve from this script's directory
pushd %~dp0

set SCRIPT_DIR=%CD%

REM --- Activate Emscripten SDK ---
set EMSDK_ENV_SCRIPT=
if defined EMSDK (
    if exist "%EMSDK%\emsdk_env.bat" set EMSDK_ENV_SCRIPT=%EMSDK%\emsdk_env.bat
)
if not defined EMSDK_ENV_SCRIPT if exist "%USERPROFILE%\emsdk\emsdk_env.bat" set EMSDK_ENV_SCRIPT=%USERPROFILE%\emsdk\emsdk_env.bat
if not defined EMSDK_ENV_SCRIPT if exist "C:\emsdk\emsdk_env.bat" set EMSDK_ENV_SCRIPT=C:\emsdk\emsdk_env.bat

if defined EMSDK_ENV_SCRIPT (
    call "%EMSDK_ENV_SCRIPT%"
) else (
    echo EMSDK environment script not found. Assuming Emscripten is already in PATH.
)

where emcc >nul 2>nul
if errorlevel 1 (
    echo Error: emcc not found. Please activate the Emscripten environment.
    exit /b 1
)

REM --- Locate libBNG sources ---
if defined LIBBNG_SRC (
    set LIBBNG_SRC=%LIBBNG_SRC%
) else (
    set LIBBNG_SRC=%SCRIPT_DIR%\_deps\libbng
)

if not exist "%LIBBNG_SRC%\bng\bng_engine.h" (
    echo libBNG sources not found. Cloning...
    if not exist "%SCRIPT_DIR%\_deps" mkdir "%SCRIPT_DIR%\_deps"
    git clone --depth 1 https://github.com/mcellteam/libbng.git "%LIBBNG_SRC%"
    if errorlevel 1 exit /b 1
)

REM --- Generate Bison/Flex parser on host (Windows variant) ---
if not defined WIN_FB_DIR (
    if exist "%USERPROFILE%\winflexbison_tools" set WIN_FB_DIR=%USERPROFILE%\winflexbison_tools
)
if defined WIN_FB_DIR set PATH=%WIN_FB_DIR%;%PATH%

if not exist "%LIBBNG_SRC%\bng\generated" mkdir "%LIBBNG_SRC%\bng\generated"

REM --- Build libBNG static library with Emscripten ---
set BUILD_DIR=%TEMP%\bng_libbng_build
if exist "%BUILD_DIR%" rmdir /s /q "%BUILD_DIR%"
mkdir "%BUILD_DIR%"

echo Configuring libBNG with emcmake cmake...
call emcmake cmake -S "%LIBBNG_SRC%\bng" -B "%BUILD_DIR%" ^
  -DCMAKE_BUILD_TYPE=Release ^
  -DCMAKE_CXX_FLAGS="-std=c++17 -O2 -fno-fast-math -ffp-contract=off -fno-associative-math -fno-reciprocal-math -fwasm-exceptions -DNDEBUG -DYY_NO_UNISTD_H" ^
  -DCMAKE_C_FLAGS="-O2 -fno-fast-math -ffp-contract=off -fwasm-exceptions -DNDEBUG" ^
  -DBUILD_SHARED_LIBS=OFF ^
  -DBUILD_STATIC_LIBS=ON
if errorlevel 1 (
    echo CMake configure failed!
    exit /b 1
)

echo Building libBNG...
where make >nul 2>nul
if errorlevel 1 (
    cmake --build "%BUILD_DIR%" --config Release -j 4
) else (
    emmake make -C "%BUILD_DIR%" -j4
)
if errorlevel 1 (
    echo Build failed!
    exit /b 1
)

REM --- Find static libraries ---
set LIBBNG_LIB=
for /r "%BUILD_DIR%" %%f in (liblibbng.a libbng.a) do (
    if exist "%%f" set LIBBNG_LIB=%%f
)
set NAUTY_LIB=
for /r "%BUILD_DIR%" %%f in (libnauty.a) do (
    if exist "%%f" set NAUTY_LIB=%%f
)

if not defined LIBBNG_LIB (
    echo Error: Could not find libBNG static library.
    exit /b 1
)

echo Using libBNG: %LIBBNG_LIB%
echo Using nauty:  %NAUTY_LIB%

REM --- Compile WASM wrapper ---
echo Compiling libBNG WASM wrapper...
call emcc -std=c++17 ^
  -I"%LIBBNG_SRC%" ^
  -I"%LIBBNG_SRC%\libs\sparsehash\src" ^
  -I"%LIBBNG_SRC%\libs" ^
  -I"%BUILD_DIR%\deps" ^
  -O2 ^
  -fno-fast-math ^
  -ffp-contract=off ^
  -fno-associative-math ^
  -fno-reciprocal-math ^
  -fwasm-exceptions ^
  -DNDEBUG ^
  -DYY_NO_UNISTD_H ^
  "%SCRIPT_DIR%\libbng_wrapper.cpp" ^
  "%LIBBNG_LIB%" ^
  %NAUTY_LIB% ^
  -o libbng_loader.js ^
  -s EXPORTED_FUNCTIONS="['_malloc', '_free', '_libbng_init', '_libbng_destroy', '_libbng_get_last_error', '_libbng_species_count', '_libbng_species_name', '_libbng_species_compartment', '_libbng_check_bimol_reaction', '_libbng_get_rxn_class_max_prob', '_libbng_get_pathway_for_prob', '_libbng_get_pathway_product_count', '_libbng_get_pathway_product_species_id', '_libbng_check_unimol_reaction', '_libbng_apply_unimol_pathway', '_libbng_rule_rate', '_libbng_rule_count', '_libbng_compartment_count', '_libbng_compartment_name', '_libbng_compartment_is_3d', '_libbng_compartment_volume', '_libbng_compartment_parent', '_libbng_mol_type_count', '_libbng_mol_type_name', '_libbng_seed_species_count', '_libbng_seed_species_name', '_libbng_seed_species_amount', '_libbng_observable_count', '_libbng_observable_name', '_libbng_get_parameter']" ^
  -s EXPORTED_RUNTIME_METHODS="['cwrap', 'getValue', 'setValue', 'UTF8ToString', 'stringToUTF8', 'lengthBytesUTF8', 'HEAPF64', 'HEAP32']" ^
  -s MODULARIZE=1 ^
  -s EXPORT_NAME="createLibBNGModule" ^
  -s ENVIRONMENT="web,worker" ^
  -s ALLOW_MEMORY_GROWTH=1 ^
  -s INITIAL_MEMORY=67108864 ^
  -s MAXIMUM_MEMORY=536870912 ^
  -s FORCE_FILESYSTEM=1 ^
  -flto ^
  --closure 0
if errorlevel 1 (
    echo WASM compilation failed!
    exit /b 1
)

REM --- Append module exports ---
echo.>> libbng_loader.js
echo // Universal module export pattern>> libbng_loader.js
echo try {>> libbng_loader.js
echo     if ^(typeof module !== 'undefined' ^^&^^& typeof module.exports !== 'undefined'^) {>> libbng_loader.js
echo         module.exports = createLibBNGModule;>> libbng_loader.js
echo     }>> libbng_loader.js
echo } catch ^(e^) {}>> libbng_loader.js
echo export default createLibBNGModule;>> libbng_loader.js

REM --- Install artifacts ---
echo Installing artifacts...
copy /Y libbng_loader.js "%SCRIPT_DIR%\..\services\libbng_loader.js"
if errorlevel 1 (
    echo Error copying libbng_loader.js
    exit /b 1
)
copy /Y libbng_loader.wasm "%SCRIPT_DIR%\..\public\libbng.wasm"
if errorlevel 1 (
    echo Error copying libbng.wasm
    exit /b 1
)

echo Build complete!
popd
endlocal
