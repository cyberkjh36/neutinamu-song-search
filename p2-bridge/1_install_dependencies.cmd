@echo off
cd /d "%~dp0"
py -3 --version
if errorlevel 1 goto missing
py -3 -m venv .venv
if errorlevel 1 goto failed
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 goto failed
echo Setup complete. Run 2_start_test.cmd.
pause
exit /b 0
:missing
echo Python 3.10 or later is required. Install Python from python.org.
pause
exit /b 1
:failed
echo Setup failed. Keep this window open and report the message above.
pause
exit /b 1
