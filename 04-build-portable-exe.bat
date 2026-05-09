@echo off
setlocal
cd /d "%~dp0"

echo Building MiniBeam portable EXE...
echo Output: portable\MiniBeam.exe
echo.

npm run dist

echo.
if errorlevel 1 (
  echo Build failed.
) else (
  echo Build complete: portable\MiniBeam.exe
)

echo.
pause
