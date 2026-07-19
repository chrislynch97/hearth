@echo off
REM Double-click (or run) to register the Hearth host updater without worrying
REM about PowerShell's execution policy. cd's to the install root so the .ps1
REM finds the compose file + scripts, then passes any extra args through.
cd /d "%~dp0.."
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0register-hearth-updater.ps1" %*
echo.
pause
