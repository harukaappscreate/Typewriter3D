@echo off
REM Windows: double-click to start a local server
cd /d "%~dp0"
start "" http://localhost:8765/
python -m http.server 8765
