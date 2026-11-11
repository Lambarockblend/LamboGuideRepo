@echo off
title LamboGuide derleme
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-windows.ps1"
echo.
pause
