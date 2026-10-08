@echo off
REM wasm-spatial/build_wasm.bat - Build spatial engine WASM (Windows)
setlocal

echo Building spatial engine WASM...
pushd %~dp0

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

where em++ >nul 2>nul
if errorlevel 1 (
    echo Error: em++ not found. Please activate the Emscripten environment.
    exit /b 1
)

REM em++ (not emcc): spatial_engine.cpp uses std::vector, so the link needs the
REM C++ runtime. Plain emcc fails with undefined operator new / operator delete.
call em++ -std=c++17 ^
  -O2 ^
  -fno-fast-math ^
  -ffp-contract=off ^
  -fno-associative-math ^
  -fno-reciprocal-math ^
  -fwasm-exceptions ^
  -DNDEBUG ^
  "%~dp0spatial_engine.cpp" ^
  -o spatial_loader.js ^
  -s EXPORTED_FUNCTIONS="['_malloc', '_free', '_spatial_init', '_spatial_destroy', '_spatial_add_molecule', '_spatial_clear_molecules', '_spatial_set_diffusion_constant', '_spatial_molecule_count', '_spatial_set_callbacks', '_spatial_step', '_spatial_export_positions', '_spatial_count_species', '_spatial_remove_molecule', '_spatial_get_molecule_species_id', '_spatial_get_molecule_compartment_id', '_spatial_get_molecule_x', '_spatial_get_molecule_y', '_spatial_get_molecule_z']" ^
  -s EXPORTED_RUNTIME_METHODS="['cwrap', 'getValue', 'setValue', 'addFunction', 'removeFunction', 'HEAPF32', 'HEAP32']" ^
  -s MODULARIZE=1 ^
  -s EXPORT_NAME="createSpatialModule" ^
  -s ENVIRONMENT="web,worker" ^
  -s ALLOW_MEMORY_GROWTH=1 ^
  -s INITIAL_MEMORY=67108864 ^
  -s MAXIMUM_MEMORY=536870912 ^
  -s ALLOW_TABLE_GROWTH=1 ^
  -flto ^
  --closure 0
if errorlevel 1 (
    echo Build failed!
    exit /b 1
)

echo.>> spatial_loader.js
echo try {>> spatial_loader.js
echo     if ^(typeof module !== 'undefined' ^^&^^& typeof module.exports !== 'undefined'^) {>> spatial_loader.js
echo         module.exports = createSpatialModule;>> spatial_loader.js
echo     }>> spatial_loader.js
echo } catch ^(e^) {}>> spatial_loader.js
echo export default createSpatialModule;>> spatial_loader.js

echo Installing artifacts...
copy /Y spatial_loader.js "%~dp0\..\services\spatial_loader.js"
copy /Y spatial_loader.wasm "%~dp0\..\public\spatial.wasm"

echo Build complete!
popd
endlocal
