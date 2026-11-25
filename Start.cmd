@echo off
cd /d "%~dp0"
where py >nul 2>nul
if errorlevel 1 goto python
py -3 -B server.py
goto done
:python
python -B server.py
:done
if errorlevel 1 pause
