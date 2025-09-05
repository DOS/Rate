@echo off
echo Starting Docker Desktop Auto-Fix Monitor...
echo ==========================================
echo.
echo This will monitor Docker Desktop and automatically fix it when it hangs.
echo Press Ctrl+C to stop monitoring.
echo.
echo Log file: docker-auto-fix.log
echo.

powershell.exe -ExecutionPolicy Bypass -File "%~dp0docker-auto-fix.ps1"

pause