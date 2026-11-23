@echo off
setlocal
cd /d "%~dp0"
where python >nul 2>&1
if errorlevel 1 (
  echo Python 3 is required.
  pause
  exit /b 1
)
echo Immersal VPS for Web: http://127.0.0.1:8766/index_three.html
python -m http.server 8766 --bind 127.0.0.1 --directory VPS-for-Web
if errorlevel 1 pause
