@echo off
setlocal
cd /d "%~dp0"
set "PATH=%ProgramFiles%\nodejs;%ProgramFiles(x86)%\nodejs;%PATH%"

echo [MiniBeam] Checking code...
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: npm not found.
  echo.
  pause
  exit /b 1
)

npm run check
if errorlevel 1 (
  echo.
  echo Check failed.
  echo.
  pause
  exit /b 1
)

echo.
echo Check passed.
pause
