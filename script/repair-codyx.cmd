@echo off
setlocal EnableExtensions
set "CHANNEL=%~1"
if "%CHANNEL%"=="" set "CHANNEL=%CODY_RELEASE_CHANNEL%"
if "%CHANNEL%"=="" set "CHANNEL=beta"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0repair-launcher.ps1" -Channel "%CHANNEL%"
exit /b %ERRORLEVEL%
