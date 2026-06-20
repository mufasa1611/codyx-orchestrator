<#
.SYNOPSIS
  codyx Windows npm installer.
.DESCRIPTION
  Installs Node.js LTS when needed, installs codyx-ai from npm, verifies the
  global codyx command, and optionally launches the TUI. This installer does
  not clone the repository or configure the source checkout proxy stack.
.EXAMPLE
  irm https://raw.githubusercontent.com/mufasa1611/codyx-orchestrator/dev/script/install-npm.ps1 | iex
.EXAMPLE
  & ([scriptblock]::Create((irm https://raw.githubusercontent.com/mufasa1611/codyx-orchestrator/dev/script/install-npm.ps1))) -Tag beta -Launch
.PARAMETER Tag
  npm dist-tag to install. Defaults to latest unless CODY_NPM_TAG is set.
.PARAMETER Version
  Exact version to install, e.g. 1.15.1. Overrides Tag.
.PARAMETER NoVerify
  Skip the post-install smoke test.
.PARAMETER Launch
  Launch codyx after a successful install.
#>
param(
  [string]$Tag = $(if ($env:CODY_NPM_TAG) { $env:CODY_NPM_TAG } else { "latest" }),
  [string]$Version = $(if ($env:CODY_NPM_VERSION) { $env:CODY_NPM_VERSION } else { "" }),
  [switch]$NoVerify,
  [switch]$Launch
)

$ErrorActionPreference = "Stop"

function Write-Ok($Message) {
  Write-Host "[ok] $Message" -ForegroundColor Green
}

function Write-Info($Message) {
  Write-Host "[info] $Message" -ForegroundColor Cyan
}

function Write-Warn($Message) {
  Write-Host "[warn] $Message" -ForegroundColor Yellow
}

function Write-Err($Message) {
  Write-Host "[error] $Message" -ForegroundColor Red
}

function Refresh-Path {
  $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $user = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:PATH = @($machine, $user, $env:PATH) -join ";"
}

function Add-PathForSession($Path) {
  if (-not $Path) { return }
  $normalized = [System.IO.Path]::GetFullPath($Path).TrimEnd("\")
  $exists = ($env:PATH -split ";" | Where-Object { $_ -and $_.Trim() }) | Where-Object {
    try {
      [System.IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($_)).TrimEnd("\").Equals(
        $normalized,
        [System.StringComparison]::OrdinalIgnoreCase
      )
    } catch {
      $false
    }
  }
  if (-not $exists) { $env:PATH = "$normalized;$env:PATH" }
}

function Get-NpmGlobalBin {
  $prefix = ""
  try {
    $prefix = ((& npm prefix -g 2>$null | Select-Object -First 1) -as [string]).Trim()
  } catch {}
  if ($prefix) { return $prefix.TrimEnd("\") }

  $root = ""
  try {
    $root = ((& npm root -g 2>$null | Select-Object -First 1) -as [string]).Trim()
  } catch {}
  if ($root) { return (Split-Path $root).TrimEnd("\") }

  return ""
}

function Find-CodyxCommand {
  $cmd = Get-Command codyx -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  $globalBin = Get-NpmGlobalBin
  if ($globalBin) {
    foreach ($name in @("codyx.cmd", "codyx.ps1", "codyx.exe", "codyx")) {
      $candidate = Join-Path $globalBin $name
      if (Test-Path -LiteralPath $candidate) { return $candidate }
    }
  }

  return ""
}

Write-Host ""
Write-Host "codyx npm installer for Windows" -ForegroundColor Cyan
Write-Host ""

$pkgSpec = if ($Version) { "codyx-ai@$Version" } else { "codyx-ai@$Tag" }
Write-Info "Target package: $pkgSpec"

Write-Host ""
Write-Info "Checking for Node.js 18+..."

$nodeOk = $false
if (Get-Command node -ErrorAction SilentlyContinue) {
  $nodeVerStr = (node --version 2>$null) -replace "^v", ""
  $nodeMajor = [int]($nodeVerStr -split "\.")[0]
  if ($nodeMajor -ge 18) {
    Write-Ok "Node.js v$nodeVerStr found."
    $nodeOk = $true
  } else {
    Write-Warn "Node.js v$nodeVerStr found but 18+ is required."
  }
}

if (-not $nodeOk) {
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    Write-Info "Installing Node.js LTS via winget..."
    winget install OpenJS.NodeJS.LTS --exact --source winget --accept-package-agreements --accept-source-agreements --silent
    if ($LASTEXITCODE -ne 0) {
      Write-Err "winget failed to install Node.js (exit $LASTEXITCODE)."
      Write-Err "Install Node.js 18+ from https://nodejs.org and rerun this installer."
      exit 1
    }
    Refresh-Path
  } else {
    Write-Err "Node.js 18+ was not found and winget is not available."
    Write-Err "Install Node.js 18+ from https://nodejs.org and rerun this installer."
    exit 1
  }

  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Err "Node.js still is not visible in this terminal. Open a new terminal and rerun."
    exit 1
  }
  Write-Ok "Node.js $((node --version 2>$null).Trim()) installed."
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Err "npm was not found. It should ship with Node.js."
  exit 1
}
Write-Ok "npm $((npm --version 2>$null).Trim()) found."

Write-Host ""
Write-Info "Installing $pkgSpec globally..."
npm install -g $pkgSpec
if ($LASTEXITCODE -ne 0) {
  Write-Err "npm install -g $pkgSpec failed (exit $LASTEXITCODE)."
  exit 1
}
Write-Ok "$pkgSpec installed."

Refresh-Path
Add-PathForSession (Get-NpmGlobalBin)

$codyx = Find-CodyxCommand
if (-not $NoVerify) {
  Write-Host ""
  Write-Info "Verifying installation..."
  if (-not $codyx) {
    Write-Warn "codyx is installed, but it is not visible on PATH in this terminal."
    Write-Warn "Open a new terminal or add the npm global bin to PATH: $(Get-NpmGlobalBin)"
  } else {
    $ver = (& $codyx --version 2>$null | Select-Object -First 1) -as [string]
    Write-Ok "codyx $(if ($ver) { $ver.Trim() } else { "installed" })"
  }
}

Write-Host ""
Write-Host "codyx installed successfully." -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "  codyx           Launch interactive menu"
Write-Host "  codyx web       Start web UI in browser"
Write-Host "  codyx --help    See all commands"
Write-Host ""
Write-Host "Update anytime:   npm update -g codyx-ai"
Write-Host "Uninstall:        npm uninstall -g codyx-ai"
Write-Host ""

if ($Launch) {
  $codyx = Find-CodyxCommand
  if (-not $codyx) {
    Write-Err "Cannot launch codyx because the command is not visible in this terminal."
    exit 1
  }
  Write-Info "Launching codyx..."
  & $codyx
  exit $LASTEXITCODE
}
