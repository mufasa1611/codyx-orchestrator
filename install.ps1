param(
  [string]$Branch = $(if ($env:CODY_BRANCH) { $env:CODY_BRANCH } else { "dev" }),
  [string]$Tag = $(if ($env:CODY_NPM_TAG) { $env:CODY_NPM_TAG } else { "beta" }),
  [string]$Version = $(if ($env:CODY_NPM_VERSION) { $env:CODY_NPM_VERSION } else { "" }),
  [switch]$NoVerify,
  [switch]$AcceptLicense,
  [switch]$NoLaunch
)

$ErrorActionPreference = "Stop"

Write-Host "[info] Installing codyx from npm. This does not clone the repository." -ForegroundColor Cyan
Write-Host "[info] Package: $(if ($Version) { "codyx-ai@$Version" } else { "codyx-ai@$Tag" })" -ForegroundColor Cyan
Write-Host ""

$installerUrl = "https://raw.githubusercontent.com/mufasa1611/codyx-orchestrator/$Branch/script/install-npm.ps1"
$tempFile = [System.IO.Path]::GetTempFileName() + ".ps1"

try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Invoke-WebRequest -UseBasicParsing -Uri $installerUrl -OutFile $tempFile
  $installerArgs = if ($Version) { @("-Version", $Version) } else { @("-Tag", $Tag) }
  if ($NoVerify) { $installerArgs += "-NoVerify" }
  if ($AcceptLicense -or $env:CODY_ACCEPT_LICENSE -eq "1") { $installerArgs += "-AcceptLicense" }
  if (-not $NoLaunch) { $installerArgs += "-Launch" }
  & $tempFile @installerArgs
  exit $LASTEXITCODE
} finally {
  Remove-Item -LiteralPath $tempFile -Force -ErrorAction SilentlyContinue
}
