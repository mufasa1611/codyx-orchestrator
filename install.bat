@echo off
setlocal EnableExtensions

if not defined CODY_BRANCH set "CODY_BRANCH=dev"
if not defined CODY_NPM_TAG set "CODY_NPM_TAG=beta"

set "INSTALLER_URL=https://raw.githubusercontent.com/mufasa1611/codyx-orchestrator/%CODY_BRANCH%/script/install-npm.ps1"
set "TEMP_INSTALLER=%TEMP%\codyx-npm-install-%RANDOM%%RANDOM%.ps1"
set "CODY_TEMP_INSTALLER=%TEMP_INSTALLER%"

echo [info] Installing codyx from npm. This does not clone the repository.
echo [info] Package: codyx-ai@%CODY_NPM_TAG%
echo.

where powershell >nul 2>nul
if errorlevel 1 (
  echo [error] PowerShell is required to run the npm installer.
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -Uri '%INSTALLER_URL%' -OutFile '%TEMP_INSTALLER%'; exit 0 } catch { Write-Host ('[error] ' + $_.Exception.Message); exit 1 }"
if errorlevel 1 (
  echo [error] Could not download %INSTALLER_URL%
  del "%TEMP_INSTALLER%" >nul 2>nul
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "& { $installerArgs = @('-Tag', $env:CODY_NPM_TAG); if ($env:CODY_NPM_VERSION) { $installerArgs = @('-Version', $env:CODY_NPM_VERSION) }; if ($env:CODY_NO_VERIFY -eq '1') { $installerArgs += '-NoVerify' }; if ($env:CODY_NO_LAUNCH -ne '1') { $installerArgs += '-Launch' }; & $env:CODY_TEMP_INSTALLER @installerArgs; exit $LASTEXITCODE }"
set "EXIT_CODE=%ERRORLEVEL%"

del "%TEMP_INSTALLER%" >nul 2>nul
exit /b %EXIT_CODE%
