@echo off
setlocal
cd /d "%~dp0"
set "PATH=%ProgramFiles%\nodejs;%ProgramFiles(x86)%\nodejs;%PATH%"
set "ELECTRON_RUN_AS_NODE="
set "MINIBEAM_PORT=3847"

echo [MiniBeam] Starting local sync server...
echo Keep this window open.
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: npm not found. Run 01-install-deps.bat after installing Node.js LTS.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Dependencies are missing.
  echo Run 01-install-deps.bat first.
  echo.
  pause
  exit /b 1
)

call npm run server
echo.
pause
