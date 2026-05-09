@echo off
setlocal
cd /d "%~dp0"
set "PATH=%ProgramFiles%\nodejs;%ProgramFiles(x86)%\nodejs;%PATH%"

echo [MiniBeam] Portable build is paused.
echo.
echo We are using development mode while patching.
echo Run 02-start-dev.bat to test the app.
echo.
echo Later, when ready, run:
echo npm run dist
echo.
pause
