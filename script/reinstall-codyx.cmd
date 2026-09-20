@echo off
setlocal EnableExtensions

set "CHANNEL=%~1"
if "%CHANNEL%"=="" set "CHANNEL=%CODY_RELEASE_CHANNEL%"
if "%CHANNEL%"=="" (
  echo.
  echo Codyx reinstall / repair
  echo.
  echo   1. Stable
  echo   2. Beta
  echo.
  set /p "CHOICE=Choose update channel [1-2] (default: Stable): "
  if "%CHOICE%"=="2" (
    set "CHANNEL=beta"
  ) else (
    set "CHANNEL=stable"
  )
)

if /i "%CHANNEL%"=="prod" set "CHANNEL=stable"
if /i "%CHANNEL%"=="production" set "CHANNEL=stable"
if /i "%CHANNEL%"=="latest" set "CHANNEL=stable"
if /i "%CHANNEL%"=="dev" set "CHANNEL=beta"
if /i "%CHANNEL%"=="end-user-x" set "CHANNEL=beta"

if /i "%CHANNEL%"=="beta" (
  set "BRANCH=end-user-x"
) else (
  set "CHANNEL=stable"
  set "BRANCH=codyx/end-user"
)

echo.
echo Reinstalling Codyx on %CHANNEL% channel from branch %BRANCH%...
if exist "%~dp0install.ps1" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" -Channel "%CHANNEL%" -Branch "%BRANCH%"
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $env:CODY_RELEASE_CHANNEL='%CHANNEL%'; $env:CODY_BRANCH='%BRANCH%'; $branch='%BRANCH%'.Replace('/','%%2F'); irm ('https://raw.githubusercontent.com/mufasa1611/codyx-orchestrator/' + $branch + '/script/install.ps1') | iex"
)
exit /b %ERRORLEVEL%
