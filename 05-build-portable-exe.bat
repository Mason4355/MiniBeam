@echo off
setlocal
cd /d "%~dp0"
set "PATH=%ProgramFiles%\nodejs;%ProgramFiles(x86)%\nodejs;%PATH%"

echo [MiniBeam] Portable build is paused.
echo.
echo We are using server/client development mode while patching.
echo Start 02-start-server.bat, then 03-start-client.bat.
echo.
echo Later, when ready, run:
echo npm run dist
echo.
pause
