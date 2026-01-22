@echo off
set EMSDK=C:\Users\Achyudhan\emsdk
set EMSDK_QUIET=1
call "%EMSDK%\emsdk_env.bat"
set "PATH=%PATH%;C:\Strawberry\c\bin"
cd /d "c:\Users\Achyudhan\OneDrive - University of Pittsburgh\Desktop\Achyudhan\School\PhD\Research\BioNetGen\bionetgen-web-simulator\src\wasm\nfsim"
call build_wasm.bat
