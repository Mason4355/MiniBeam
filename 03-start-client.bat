@echo off
setlocal
cd /d "%~dp0"
set "PATH=%ProgramFiles%\nodejs;%ProgramFiles(x86)%\nodejs;%PATH%"
set "MINIBEAM_SERVER_URL=http://127.0.0.1:3847"

echo [MiniBeam] Starting client app...
echo Make sure 02-start-server.bat is already running.
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

call npm run client

echo.
echo Cleaning MiniBeam helper processes...
taskkill /F /IM electron.exe /T >nul 2>nul
taskkill /F /IM MiniBeam.exe /T >nul 2>nul
echo.
pause
