@echo off
REM wasm-igraph/build_wasm.bat
REM
REM Build igraph_wrapper.c -> igraph.js + igraph.wasm (Windows / Emscripten SDK).
REM
REM Prerequisites:
REM   1. Emscripten SDK installed at one of:
REM        %USERPROFILE%\emsdk   (default install location)
REM        C:\emsdk
REM      This script will auto-detect and activate it if emcc is not in PATH.
REM   2. Prebuilt kanaverse/igraph-wasm artifacts extracted to
REM        wasm-igraph\igraph-wasm-artifacts\
REM      Expected layout:
REM        igraph-wasm-artifacts\include\igraph\   <- headers
REM        igraph-wasm-artifacts\lib\libigraph.a   <- static lib (WASM target)
REM      Run tools\fetch-igraph-wasm.ps1 to download automatically.
REM
REM Usage (from repo root or wasm-igraph\):
REM   cd wasm-igraph
REM   build_wasm.bat

setlocal EnableDelayedExpansion

set SCRIPT_DIR=%~dp0
set ROOT_DIR=%SCRIPT_DIR%..

set ARTIFACTS=%SCRIPT_DIR%igraph-wasm-artifacts
set INCLUDE_DIR=%ARTIFACTS%\include
set LIB_DIR=%ARTIFACTS%\lib
set SRC=%SCRIPT_DIR%igraph_wrapper.c
set OUT_JS=%SCRIPT_DIR%igraph.js

REM ---- auto-activate emsdk if emcc not in PATH ----------------------------
where emcc >nul 2>&1
if errorlevel 1 (
    echo emcc not in PATH. Searching for Emscripten SDK...

    set EMSDK_ENV=
    if exist "%USERPROFILE%\emsdk\emsdk_env.bat"  set EMSDK_ENV=%USERPROFILE%\emsdk\emsdk_env.bat
    if exist "%USERPROFILE%\emsdk\emsdk.bat"       set EMSDK_ENV=%USERPROFILE%\emsdk\emsdk_env.bat
    if exist "C:\emsdk\emsdk_env.bat"              set EMSDK_ENV=C:\emsdk\emsdk_env.bat

    if defined EMSDK_ENV (
        echo Activating: !EMSDK_ENV!
        call "!EMSDK_ENV!"
    ) else (
        echo ERROR: Could not find Emscripten SDK. Install it from https://emscripten.org/docs/getting_started/downloads.html
        echo Expected locations:
        echo   %USERPROFILE%\emsdk\emsdk_env.bat
        echo   C:\emsdk\emsdk_env.bat
        echo.
        echo If emsdk is elsewhere, run emsdk_env.bat manually before calling this script.
        exit /b 1
    )

    where emcc >nul 2>&1
    if errorlevel 1 (
        echo ERROR: emsdk found at !EMSDK_ENV! but emcc still not available.
        echo Run the following to install/activate the required version:
        echo   cd !EMSDK_DIR!
        echo   emsdk install 3.1.68
        echo   emsdk activate 3.1.68
        exit /b 1
    )
    echo emcc activated successfully.
)

REM ---- warn if emcc version is not 3.1.68 ---------------------------------
for /f "tokens=*" %%v in ('emcc --version 2^>^&1 ^| findstr /i "emcc"') do (
    echo Found: %%v
    echo NOTE: igraph-wasm artifacts were built with Emscripten 3.1.68.
    echo       Using a different version may cause ABI incompatibility.
    echo       To install the correct version:
    echo         cd %%USERPROFILE%%\emsdk ^&^& emsdk install 3.1.68 ^&^& emsdk activate 3.1.68
    goto :version_ok
)
:version_ok

REM ---- check artifacts -----------------------------------------------------
if not exist "%INCLUDE_DIR%\igraph" (
    echo ERROR: igraph headers not found at %INCLUDE_DIR%\igraph
    echo Run the fetch script to download prebuilt artifacts:
    echo   powershell -ExecutionPolicy Bypass -File tools\fetch-igraph-wasm.ps1
    exit /b 1
)

if not exist "%LIB_DIR%\libigraph.a" (
    echo ERROR: libigraph.a not found at %LIB_DIR%\libigraph.a
    echo Run: powershell -ExecutionPolicy Bypass -File tools\fetch-igraph-wasm.ps1
    exit /b 1
)

echo Building igraph WASM wrapper...

REM ---- compile -------------------------------------------------------------
emcc "%SRC%" ^
  -I "%INCLUDE_DIR%" ^
  "%LIB_DIR%\libigraph.a" ^
  -o "%OUT_JS%" ^
  -O3 ^
  -flto ^
  -s WASM=1 ^
  -s MODULARIZE=1 ^
  -s EXPORT_NAME="IgraphModule" ^
  -s ENVIRONMENT="web,worker" ^
  -s ALLOW_MEMORY_GROWTH=1 ^
  -s INITIAL_MEMORY=33554432 ^
  -s MAXIMUM_MEMORY=268435456 ^
  -s FILESYSTEM=0 ^
  -s EXPORTED_FUNCTIONS="[\"_ig_analyse\",\"_ig_malloc\",\"_ig_free\",\"_malloc\",\"_free\",\"_strlen\"]" ^
  -s EXPORTED_RUNTIME_METHODS="[\"ccall\",\"cwrap\",\"UTF8ToString\",\"HEAPU8\",\"HEAP32\",\"setValue\"]" ^
  -s NO_EXIT_RUNTIME=1 ^
  -s SINGLE_FILE=0 ^
  -lm

if errorlevel 1 (
    echo Build FAILED.
    exit /b 1
)

echo Build complete.

REM ---- append ESM export (PowerShell handles paths with spaces correctly) --
powershell -NoProfile -Command ^
  "Add-Content -Path '%OUT_JS%' -Value \"`n// ESM export for Vite / bundlers`nexport default IgraphModule;\""

REM ---- install outputs (PowerShell Copy-Item handles spaces in paths) ------
powershell -NoProfile -Command ^
  "Copy-Item -Path '%OUT_JS%' -Destination '%ROOT_DIR%\services\igraph_loader.js' -Force; ^
   Copy-Item -Path '%SCRIPT_DIR%igraph.wasm' -Destination '%ROOT_DIR%\public\igraph.wasm' -Force"

echo Installed:
echo   services\igraph_loader.js
echo   public\igraph.wasm
echo.
echo Done. igraph WASM ready for use in BNG Playground.
