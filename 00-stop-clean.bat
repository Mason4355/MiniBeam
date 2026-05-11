@echo off
setlocal
cd /d "%~dp0"

echo [MiniBeam] Stopping old MiniBeam server/client processes...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$root=(Resolve-Path '.').Path; " ^
  "$procs=Get-CimInstance Win32_Process | Where-Object { " ^
  "  ($_.Name -match '^(node|electron|MiniBeam)\.exe$') -and " ^
  "  ($_.CommandLine -like ('*' + $root + '*') -or $_.CommandLine -like '*server.js*' -or $_.CommandLine -like '*launcher.js*' -or $_.CommandLine -like '*MINIBEAM_SERVER_URL*') " ^
  "}; " ^
  "foreach ($p in $procs) { try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop; Write-Host ('stopped ' + $p.Name + ' #' + $p.ProcessId) } catch {} }; " ^
  "Get-ChildItem $env:TEMP -Directory -Filter 'MiniBeamClient-*' -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue; " ^
  "Write-Host 'runtime temp cleaned'"

echo.
echo Done.
pause
