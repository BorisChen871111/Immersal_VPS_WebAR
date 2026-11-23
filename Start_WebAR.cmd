@echo off
setlocal
cd /d "%~dp0"
where python >nul 2>&1
if errorlevel 1 (
  echo Python 3 is required to start the local preview.
  pause
  exit /b 1
)
echo Open http://127.0.0.1:8765/ in your browser.
python -m http.server 8765 --bind 127.0.0.1 --directory dist
if errorlevel 1 pause
