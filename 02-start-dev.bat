@echo off
setlocal
cd /d "%~dp0"

echo Starting MiniBeam in development mode...
echo Close the app window to stop it.
echo.

npm start

echo.
pause
