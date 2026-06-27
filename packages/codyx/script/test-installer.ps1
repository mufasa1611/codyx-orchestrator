param()

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$installerTest = Join-Path $repoRoot "script\test-installer.ps1"

if (-not (Test-Path -LiteralPath $installerTest)) {
  Write-Error "Cannot find installer test suite at $installerTest"
  exit 1
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installerTest
exit $LASTEXITCODE
