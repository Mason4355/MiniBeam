@echo off
setlocal
cd /d "%~dp0"
set "PATH=%ProgramFiles%\nodejs;%ProgramFiles(x86)%\nodejs;%PATH%"
set "ELECTRON_RUN_AS_NODE="
set "MINIBEAM_PORT=3847"
set "MINIBEAM_SERVER_URL=http://127.0.0.1:3847"

echo [MiniBeam] Clean test: check code, start server, open two clients.
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

echo [1/4] Stop old MiniBeam processes and clean temp...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$root=(Resolve-Path '.').Path; " ^
  "$procs=Get-CimInstance Win32_Process | Where-Object { " ^
  "  ($_.Name -match '^(node|electron|MiniBeam)\.exe$') -and " ^
  "  ($_.CommandLine -like ('*' + $root + '*') -or $_.CommandLine -like '*server.js*' -or $_.CommandLine -like '*launcher.js*' -or $_.CommandLine -like '*MINIBEAM_SERVER_URL*') " ^
  "}; " ^
  "foreach ($p in $procs) { try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop } catch {} }; " ^
  "Get-ChildItem $env:TEMP -Directory -Filter 'MiniBeamClient-*' -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue"

echo.
echo [2/4] Check code...
call npm run check
if errorlevel 1 (
  echo.
  echo Check failed.
  pause
  exit /b 1
)

echo.
echo [3/4] Start server in a separate window...
start "MiniBeam Server" cmd /k "cd /d ""%~dp0"" && set ""MINIBEAM_PORT=3847"" && npm run server"

echo Waiting for server health...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ok=$false; " ^
  "for($i=0;$i -lt 30;$i++){ try { $r=Invoke-RestMethod 'http://127.0.0.1:3847/health' -TimeoutSec 1; if($r.ok){ $ok=$true; break } } catch {}; Start-Sleep -Milliseconds 500 }; " ^
  "if(-not $ok){ exit 1 }"
if errorlevel 1 (
  echo Server did not start on http://127.0.0.1:3847
  pause
  exit /b 1
)

echo.
echo [4/4] Start two Electron clients...
start "MiniBeam Client 1" cmd /c "cd /d ""%~dp0"" && set ""MINIBEAM_SERVER_URL=http://127.0.0.1:3847"" && npm run client"
timeout /t 2 /nobreak >nul
start "MiniBeam Client 2" cmd /c "cd /d ""%~dp0"" && set ""MINIBEAM_SERVER_URL=http://127.0.0.1:3847"" && npm run client"

echo.
echo Test is running.
echo Close client windows when done, then run 00-stop-clean.bat to stop the server and clean temp.
echo.
pause
