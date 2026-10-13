@echo off
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel%==0 (
  echo Starting ARMOR LAB with Node.js...
  node server.cjs
  echo.
  echo If an error appeared above, take a screenshot.
  pause
  exit /b
)
where python >nul 2>nul
if %errorlevel%==0 (
  echo Starting ARMOR LAB with Python...
  python -m http.server 8000 --bind 127.0.0.1
  pause
  exit /b
)
echo Neither Node.js nor Python was found.
echo Multiplayer server requires Node.js. Install it from https://nodejs.org/
echo The Python fallback only serves files; it does not provide WebSocket multiplayer.
pause
