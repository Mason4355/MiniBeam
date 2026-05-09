@echo off
setlocal
cd /d "%~dp0"
set "PATH=%ProgramFiles%\nodejs;%ProgramFiles(x86)%\nodejs;%PATH%"

echo [MiniBeam] Installing dependencies...
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: npm not found.
  echo Install Node.js LTS or restart Windows after Node.js installation.
  echo.
  pause
  exit /b 1
)

if exist node_modules (
  echo Existing node_modules found. If install fails, close MiniBeam/Electron and reboot Windows.
  echo.
)

npm install
if errorlevel 1 (
  echo.
  echo ERROR: npm install failed.
  echo Close all MiniBeam/Electron windows. If it still fails, reboot Windows and run this file again.
  echo.
  pause
  exit /b 1
)

echo.
echo Done.
pause
