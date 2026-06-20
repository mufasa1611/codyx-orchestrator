@echo off
setlocal EnableExtensions

if not defined CODY_BRANCH set "CODY_BRANCH=dev"

set "INSTALLER_URL=https://raw.githubusercontent.com/mufasa1611/codyx-orchestrator/%CODY_BRANCH%/script/install.ps1"
set "TEMP_INSTALLER=%TEMP%\codyx-install-%RANDOM%%RANDOM%.ps1"
set "CODY_TEMP_INSTALLER=%TEMP_INSTALLER%"

echo [warn] This installer (root install.bat) is deprecated.
echo [warn] Using the unified PowerShell installer:
echo   powershell -NoProfile -ExecutionPolicy Bypass -Command "irm %INSTALLER_URL% ^| iex"
echo.

where powershell >nul 2>nul
if errorlevel 1 (
  echo [error] PowerShell is required to run the unified installer.
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -Uri '%INSTALLER_URL%' -OutFile '%TEMP_INSTALLER%'; exit 0 } catch { Write-Host ('[error] ' + $_.Exception.Message); exit 1 }"
if errorlevel 1 (
  echo [error] Could not download %INSTALLER_URL%
  del "%TEMP_INSTALLER%" >nul 2>nul
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "& { $installerArgs = @('-Branch', $env:CODY_BRANCH); if ($env:CODY_YES -eq '1') { $installerArgs += '-Yes' }; if ($env:CODY_NO_SCAN -eq '1') { $installerArgs += '-NoScan' }; if ($env:CODY_NO_PROXY -eq '1') { $installerArgs += '-NoProxy' }; if ($env:CODY_NO_BUILD -eq '1') { $installerArgs += '-NoBuild' }; if ($env:CODY_INSTALL_ROOT) { $installerArgs += @('-InstallRoot', $env:CODY_INSTALL_ROOT) }; & $env:CODY_TEMP_INSTALLER @installerArgs; exit $LASTEXITCODE }"
set "EXIT_CODE=%ERRORLEVEL%"

del "%TEMP_INSTALLER%" >nul 2>nul
exit /b %EXIT_CODE%
