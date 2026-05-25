@echo off
cd /d "%~dp0"
echo.
echo  FinancasCasa - servidor local
echo  http://localhost:8000/
echo.
node serve.js
if errorlevel 1 pause
