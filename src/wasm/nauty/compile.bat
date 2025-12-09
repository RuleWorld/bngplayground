@echo off
set EMCC="C:\Users\Achyudhan\emsdk\upstream\emscripten\emcc.bat"

echo Compiling objects...
call %EMCC% -c nauty_wrapper.c -o nauty_wrapper.o
if %errorlevel% neq 0 exit /b %errorlevel%

call %EMCC% -c nauty.c -o nauty.o
if %errorlevel% neq 0 exit /b %errorlevel%

call %EMCC% -c nautil.c -o nautil.o
if %errorlevel% neq 0 exit /b %errorlevel%

call %EMCC% -c naugraph.c -o naugraph.o
if %errorlevel% neq 0 exit /b %errorlevel%

echo Linking...
call %EMCC% nauty_wrapper.o nauty.o nautil.o naugraph.o -o nauty.js -s WASM=1 -s ALLOW_MEMORY_GROWTH=1 -O3 -s "EXPORTED_FUNCTIONS=['_getCanonicalOrbits','_malloc','_free']" -s "EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
if %errorlevel% neq 0 exit /b %errorlevel%

echo Build successful
