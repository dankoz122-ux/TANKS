@echo off
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel%==0 (
  echo Starting ARMOR LAB with Node.js (single player + online rooms)...
  echo Open http://localhost:8000
  echo For LAN play: set HOST=0.0.0.0 before running, friends open http://YOUR_IP:8000
  node server.cjs
  echo.
  echo If an error appeared above, take a screenshot.
  pause
  exit /b
)
where python >nul 2>nul
if %errorlevel%==0 (
  echo Node.js not found. Starting static server with Python - ONLINE MODE WILL NOT WORK, single player only.
  python -m http.server 8000 --bind 127.0.0.1
  pause
  exit /b
)
echo Neither Node.js nor Python was found.
echo Install Node.js from https://nodejs.org/ (needed for online mode)
pause
