@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" goto missing
".venv\Scripts\python.exe" p2_test.py
if errorlevel 1 pause
exit /b
:missing
echo Run 1_install_dependencies.cmd first.
pause
exit /b 1
