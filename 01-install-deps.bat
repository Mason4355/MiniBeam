@echo off
setlocal
cd /d "%~dp0"

echo Installing MiniBeam dependencies...
echo.

npm install

echo.
if errorlevel 1 (
  echo Failed to install dependencies.
) else (
  echo Done.
)

echo.
pause
