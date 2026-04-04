@echo off
echo Building CVODE WASM with KLU-backed sparse support...

REM Ensure relative paths resolve from this script's directory
pushd %~dp0

REM Activate Emscripten SDK environment
set EMSDK_ENV_SCRIPT=
if defined EMSDK (
    if exist "%EMSDK%\emsdk_env.bat" set EMSDK_ENV_SCRIPT=%EMSDK%\emsdk_env.bat
)
if not defined EMSDK_ENV_SCRIPT if exist "%USERPROFILE%\emsdk\emsdk_env.bat" set EMSDK_ENV_SCRIPT=%USERPROFILE%\emsdk\emsdk_env.bat
if not defined EMSDK_ENV_SCRIPT if exist "C:\emsdk\emsdk_env.bat" set EMSDK_ENV_SCRIPT=C:\emsdk\emsdk_env.bat

if defined EMSDK_ENV_SCRIPT (
    call "%EMSDK_ENV_SCRIPT%"
) else (
    echo EMSDK environment script not found via EMSDK, %%USERPROFILE%%\emsdk, or C:\emsdk.
    echo Assuming Emscripten is already in PATH.
)

set ROOT_DIR=%CD%
set TEMP_BUILD=%TEMP%\bng_cvode_build
set SUITESPARSE_SRC=%ROOT_DIR%\_deps\SuiteSparse
set SUITESPARSE_BUILD=%TEMP%\bng_suitesparse_build
set SUITESPARSE_INSTALL=%TEMP%\bng_suitesparse_install
set SUNDIALS_INC=%ROOT_DIR%\sundials\include
set BUILD_INC=%TEMP_BUILD%\build\include
set SUITESPARSE_INC=%SUITESPARSE_INSTALL%\include\suitesparse
set LIBS=%TEMP_BUILD%\build\src\cvode\libsundials_cvode.a %TEMP_BUILD%\build\src\cvodes\libsundials_cvodes.a %TEMP_BUILD%\build\src\nvector\serial\libsundials_nvecserial.a %TEMP_BUILD%\build\src\sunmatrix\dense\libsundials_sunmatrixdense.a %TEMP_BUILD%\build\src\sunmatrix\sparse\libsundials_sunmatrixsparse.a %TEMP_BUILD%\build\src\sunlinsol\dense\libsundials_sunlinsoldense.a %TEMP_BUILD%\build\src\sunlinsol\spgmr\libsundials_sunlinsolspgmr.a %TEMP_BUILD%\build\src\sunlinsol\klu\libsundials_sunlinsolklu.a %TEMP_BUILD%\build\src\sunnonlinsol\newton\libsundials_sunnonlinsolnewton.a %TEMP_BUILD%\build\src\sunmatrix\band\libsundials_sunmatrixband.a %TEMP_BUILD%\build\src\sunlinsol\band\libsundials_sunlinsolband.a %TEMP_BUILD%\build\src\sundials\libsundials_core.a %SUITESPARSE_INSTALL%\lib\libklu.a %SUITESPARSE_INSTALL%\lib\libamd.a %SUITESPARSE_INSTALL%\lib\libcolamd.a %SUITESPARSE_INSTALL%\lib\libbtf.a %SUITESPARSE_INSTALL%\lib\libsuitesparseconfig.a

where emcc >nul 2>nul
if errorlevel 1 (
    echo Error: emcc not found. Please activate the Emscripten environment via emsdk_env.bat.
    exit /b 1
)

if not exist "%ROOT_DIR%\_deps" mkdir "%ROOT_DIR%\_deps"

if not exist "%SUITESPARSE_SRC%\.git" (
    echo Fetching SuiteSparse ^(stable branch^)...
    if exist "%SUITESPARSE_SRC%" rmdir /s /q "%SUITESPARSE_SRC%"
    git clone --depth 1 --branch stable https://github.com/DrTimothyAldenDavis/SuiteSparse.git "%SUITESPARSE_SRC%"
    if errorlevel 1 (
        echo Failed to fetch SuiteSparse.
        exit /b 1
    )
)

if "%FORCE_SUITESPARSE_REBUILD%"=="1" goto build_suitesparse
if not exist "%SUITESPARSE_INSTALL%\lib\libklu.a" goto build_suitesparse
goto suitesparse_ready

:build_suitesparse
echo Building SuiteSparse KLU toolchain for Emscripten...
if exist "%SUITESPARSE_BUILD%" rmdir /s /q "%SUITESPARSE_BUILD%"
if exist "%SUITESPARSE_INSTALL%" rmdir /s /q "%SUITESPARSE_INSTALL%"
call emcmake cmake -S "%SUITESPARSE_SRC%" -B "%SUITESPARSE_BUILD%" -D CMAKE_BUILD_TYPE=Release -D CMAKE_INSTALL_PREFIX="%SUITESPARSE_INSTALL%" -D SUITESPARSE_ENABLE_PROJECTS=suitesparse_config;amd;colamd;btf;klu -D KLU_USE_CHOLMOD=OFF -D BUILD_SHARED_LIBS=OFF -D BUILD_STATIC_LIBS=ON -D SUITESPARSE_REQUIRE_BLAS=OFF -D SUITESPARSE_USE_FORTRAN=OFF -D SUITESPARSE_CONFIG_USE_OPENMP=OFF -D BLA_VENDOR=Generic
if errorlevel 1 (
    echo SuiteSparse configure failed!
    exit /b 1
)
cmake --build "%SUITESPARSE_BUILD%" --config Release --target install -j 4
if errorlevel 1 (
    echo SuiteSparse build failed!
    exit /b 1
)

:suitesparse_ready

echo Building SUNDIALS libraries with KLU enabled...
if exist "%TEMP_BUILD%" rmdir /s /q "%TEMP_BUILD%"
mkdir "%TEMP_BUILD%"
call emcmake cmake -S "%ROOT_DIR%\sundials" -B "%TEMP_BUILD%\build" -DCMAKE_INSTALL_PREFIX="%TEMP_BUILD%\install" -DBUILD_SHARED_LIBS=OFF -DBUILD_STATIC_LIBS=ON -DEXAMPLES_ENABLE_C=OFF -DEXAMPLES_INSTALL=OFF -DCMAKE_BUILD_TYPE=Release -DBUILD_CVODES=ON -DENABLE_KLU=ON -DKLU_INCLUDE_DIR=%SUITESPARSE_INSTALL:\=/%/include/suitesparse -DKLU_LIBRARY=%SUITESPARSE_INSTALL:\=/%/lib/libklu.a -DAMD_LIBRARY=%SUITESPARSE_INSTALL:\=/%/lib/libamd.a -DCOLAMD_LIBRARY=%SUITESPARSE_INSTALL:\=/%/lib/libcolamd.a -DBTF_LIBRARY=%SUITESPARSE_INSTALL:\=/%/lib/libbtf.a -DSUITESPARSECONFIG_LIBRARY=%SUITESPARSE_INSTALL:\=/%/lib/libsuitesparseconfig.a -DKLU_WORKS=TRUE
if errorlevel 1 (
    echo SUNDIALS configure failed!
    exit /b 1
)
call emmake make -C "%TEMP_BUILD%\build" -j4
if errorlevel 1 (
    echo SUNDIALS build failed!
    exit /b 1
)

echo Compiling with strict IEEE-754 floating-point compliance...
call emcc -I"%SUNDIALS_INC%" -I"%BUILD_INC%" -I"%SUITESPARSE_INC%" -O3 ^
 -fno-fast-math ^
 -ffp-contract=off ^
 -fno-associative-math ^
 -fno-reciprocal-math ^
 "%ROOT_DIR%\cvode_wrapper.c" ^
 %LIBS% ^
 -o cvode_loader.js ^
 --js-library "%ROOT_DIR%\library_cvode.js" ^
 -s EXPORTED_FUNCTIONS="['_init_solver', '_init_solver_adams', '_init_solver_jac', '_init_solver_sparse', '_solve_step', '_get_y', '_destroy_solver', '_set_init_step', '_set_max_step', '_set_min_step', '_set_max_ord', '_set_stab_lim_det', '_set_max_nonlin_iters', '_set_nonlin_conv_coef', '_set_max_err_test_fails', '_set_max_conv_fails', '_set_max_num_steps', '_reinit_solver', '_get_solver_stats', '_init_roots', '_get_root_info', '_load_network', '_bind_network', '_unload_network', '_update_rate_constants', '_cvode_load_network', '_cvode_bind_network', '_cvode_unload_network', '_cvode_update_rate_constants', '_sens_init_forward', '_sens_solve_step', '_sens_get_y', '_sens_get_s', '_sens_get_all', '_sens_bind_network', '_sens_update_params', '_sens_get_stats', '_sens_destroy', '_malloc', '_free']" ^
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
>> cvode_loader.js echo.
>> cvode_loader.js echo // Universal module export pattern - CJS for Node.js, globalThis for browsers
>> cvode_loader.js echo // Use try-catch to handle Vitest's ESM environment where module.exports may be read-only
>> cvode_loader.js echo try {
>> cvode_loader.js echo     if ^(typeof module !== 'undefined' ^&^& typeof module.exports !== 'undefined'^) {
>> cvode_loader.js echo         module.exports = createCVodeModule;
>> cvode_loader.js echo     }
>> cvode_loader.js echo } catch ^(e^) {
>> cvode_loader.js echo     // Ignore - ESM export below will be used
>> cvode_loader.js echo }
>> cvode_loader.js echo // ESM export for browsers using Vite/bundlers and Vitest
>> cvode_loader.js echo export default createCVodeModule;

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
