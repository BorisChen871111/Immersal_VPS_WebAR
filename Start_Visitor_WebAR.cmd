@echo off
setlocal
cd /d "%~dp0"
if not exist webar.local.json copy /y webar.local.example.json webar.local.json >nul
node serve-webar.mjs
if errorlevel 1 pause
