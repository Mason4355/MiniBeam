@echo off
setlocal
cd /d "%~dp0"

echo Checking MiniBeam JavaScript files...
echo.

npm run check

echo.
if errorlevel 1 (
  echo Code check failed.
) else (
  echo Code check passed.
)

echo.
pause
