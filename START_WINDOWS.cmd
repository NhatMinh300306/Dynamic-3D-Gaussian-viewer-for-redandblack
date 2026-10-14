@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 24 LTS from https://nodejs.org/en/download
  pause
  exit /b 1
)
echo Starting Gaussian Studio. Keep this window open.
node scripts\server.mjs --dist --open
if errorlevel 1 pause
