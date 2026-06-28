#!/usr/bin/env pwsh
<#
.SYNOPSIS
  First-run and daily launcher for codyx on Windows.
.DESCRIPTION
  Installs missing prerequisites, bootstraps the source checkout through the
  normal installer on first run, silently fast-forwards the install checkout on
  later launches, refreshes dependencies/build output when needed, then starts
  the normal codyx command so the existing TUI/Web menu and verification flow
  remain intact.
#>
[CmdletBinding(PositionalBinding = $false)]
param(
  [string]$RepoUrl = $(if ($env:CODY_REPO_URL) { $env:CODY_REPO_URL } else { "https://github.com/mufasa1611/codyx-orchestrator.git" }),
  [string]$Branch = $(if ($env:CODY_BRANCH) { $env:CODY_BRANCH } else { "dev" }),
  [string]$InstallRoot = $(if ($env:CODY_INSTALL_ROOT) { $env:CODY_INSTALL_ROOT } else { "" }),
  [switch]$AcceptLicense,
  [switch]$NoBuild,
  [switch]$NoLaunch,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$CodyxArgs
)

$ErrorActionPreference = "Stop"
try { $Host.UI.RawUI.WindowTitle = "codyx Launcher" } catch {}

function Write-Info($Message) {
  Write-Host "[codyx] $Message" -ForegroundColor Cyan
}

function Write-Ok($Message) {
  Write-Host "[ok] $Message" -ForegroundColor Green
}

function Write-Warn($Message) {
  Write-Host "[warn] $Message" -ForegroundColor Yellow
}

function Test-Command($Name) {
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Get-BunCommand {
  $cmd = Get-Command bun -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  foreach ($candidate in @(
    (Join-Path $env:USERPROFILE ".bun\bin\bun.exe"),
    (Join-Path $env:APPDATA "npm\bun.cmd")
  )) {
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }
  return $null
}

function Test-BunVersion {
  $bun = Get-BunCommand
  if (-not $bun) { return $false }
  try {
    return [version](& $bun --version) -ge [version]"1.3.13"
  } catch {
    return $false
  }
}

function Invoke-Native($Command, [object[]]$Arguments = @()) {
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    & $Command @Arguments
    return $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
}

function Install-WithWinget($CommandName, $PackageId, $Label) {
  if (Test-Command $CommandName) { return $true }
  if (-not (Test-Command winget)) { return $false }
  Write-Info "$Label not found. Installing with winget..."
  $code = Invoke-Native "winget" @("install", "--id", $PackageId, "--exact", "--source", "winget", "--silent", "--accept-package-agreements", "--accept-source-agreements")
  if ($code -ne 0) { return $false }
  $env:PATH = "$env:ProgramFiles\Git\cmd;$env:ProgramFiles\nodejs;$env:PATH"
  return (Test-Command $CommandName)
}

function Install-WithChoco($CommandName, $PackageId, $Label) {
  if (Test-Command $CommandName) { return $true }
  if (-not (Test-Command choco)) { return $false }
  Write-Info "$Label not found. Installing with Chocolatey..."
  $code = Invoke-Native "choco" @("install", $PackageId, "-y", "--no-progress")
  if ($code -ne 0) { return $false }
  refreshenv 2>$null
  return (Test-Command $CommandName)
}

function Ensure-Git {
  if (Test-Command git) {
    Write-Ok "Git found."
    return
  }
  if (Install-WithWinget "git" "Git.Git" "Git") {
    Write-Ok "Git installed."
    return
  }
  if (Install-WithChoco "git" "git" "Git") {
    Write-Ok "Git installed."
    return
  }
  throw "Git is required and could not be installed automatically. Install Git, then run this launcher again."
}

function Ensure-Bun {
  if (Test-BunVersion) {
    Write-Ok "Bun 1.3.13+ found."
    return
  }
  Write-Info "Bun 1.3.13+ not found. Installing Bun for the current user..."
  $windowsPowerShell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
  $code = Invoke-Native $windowsPowerShell @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "irm https://bun.sh/install.ps1 | iex")
  if ($code -ne 0) { throw "Bun installation failed." }
  $env:PATH = "$(Join-Path $env:USERPROFILE ".bun\bin");$(Join-Path $env:APPDATA "npm");$env:PATH"
  if (-not (Test-BunVersion)) { throw "Bun 1.3.13+ is still unavailable after install." }
  Write-Ok "Bun installed."
}

function Test-CodyxCheckout($Path) {
  if (-not $Path) { return $false }
  if (-not (Test-Path -LiteralPath (Join-Path $Path "package.json"))) { return $false }
  if (-not (Test-Path -LiteralPath (Join-Path $Path "codyx.cmd"))) { return $false }
  try {
    return (Get-Content -Raw -LiteralPath (Join-Path $Path "package.json")) -match '"name"\s*:\s*"codyx-orchestrator"'
  } catch {
    return $false
  }
}

function Test-CodyxInstallComplete($Path) {
  return (Test-CodyxCheckout $Path) -and (Test-Path -LiteralPath (Join-Path $Path ".codyx-install-marker"))
}

function Resolve-InstallRoot($RequestedRoot) {
  if ($RequestedRoot) { return $RequestedRoot }

  $defaultRoot = Join-Path $env:LOCALAPPDATA "codyx"
  if (Test-CodyxCheckout $defaultRoot) { return $defaultRoot }
  return (Join-Path $defaultRoot "source")
}

function Get-CodyxSparseCheckoutPaths {
  return @(
    "packages/codyx", "packages/sdk", "packages/plugin",
    "packages/gitlab-auth", "packages/poe-auth", "packages/script",
    "packages/app", "packages/ui", "packages/core", "packages/slack",
    "patches", "script"
  )
}

function Enable-CodyxSlimCheckout {
  if (-not (Test-Path -LiteralPath (Join-Path $InstallRoot ".git"))) { return $false }

  Write-Info "Ensuring slim end-user checkout..."
  Push-Location $InstallRoot
  try {
    $code = Invoke-Native "git" @("sparse-checkout", "init", "--cone")
    if ($code -ne 0) { throw "git sparse-checkout init failed." }
    $code = Invoke-Native "git" (@("sparse-checkout", "set") + (Get-CodyxSparseCheckoutPaths))
    if ($code -ne 0) { throw "git sparse-checkout set failed." }
    return $true
  } finally {
    Pop-Location
  }
}

function Update-CodyxInstallMarker {
  $markerScript = Join-Path $InstallRoot "script\update-install-marker.ps1"
  if (-not (Test-Path -LiteralPath $markerScript)) { return }
  $windowsPowerShell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
  $null = Invoke-Native $windowsPowerShell @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $markerScript, "-Root", $InstallRoot)
}

function Test-SafePartialInstallRoot($Path) {
  if (-not $Path) { return $false }
  try {
    $full = [System.IO.Path]::GetFullPath($Path).TrimEnd("\")
    $defaultRoot = [System.IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA "codyx")).TrimEnd("\")
    if ($full.Equals($defaultRoot, [System.StringComparison]::OrdinalIgnoreCase)) { return $true }
    if ($full.StartsWith("$defaultRoot\", [System.StringComparison]::OrdinalIgnoreCase)) { return $true }
    if (Test-Path -LiteralPath (Join-Path $full ".git")) { return $true }
  } catch {}
  return $false
}

function Remove-PartialInstallRoot($Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return }
  if (Test-CodyxCheckout $Path) { return }
  if (-not (Test-SafePartialInstallRoot $Path)) {
    throw "$Path exists but is not a codyx checkout. Move it away or set CODY_INSTALL_ROOT."
  }
  Write-Warn "Removing incomplete install folder before retry: $Path"
  Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
}

function Invoke-WithRetry($ScriptBlock, $Label, $MaxRetries = 3) {
  $backoff = 1
  for ($i = 0; $i -lt $MaxRetries; $i++) {
    try {
      & $ScriptBlock
      return
    } catch {
      if ($i -eq $MaxRetries - 1) { throw }
      Write-Warn "$Label failed (attempt $($i + 1)/$MaxRetries). Retrying in ${backoff}s..."
      Start-Sleep -Seconds $backoff
      $backoff = [Math]::Min($backoff * 2, 16)
    }
  }
}

function Invoke-FirstRunInstall {
  Write-Info "First run setup is needed."
  $installer = Join-Path $InstallRoot "script\install.ps1"
  $installerArgs = @("-Branch", $Branch, "-InstallRoot", $InstallRoot)
  if ($AcceptLicense -or $env:CODY_ACCEPT_LICENSE -eq "1") { $installerArgs += "-AcceptLicense" }
  if ($NoBuild) { $installerArgs += "-NoBuild" }
  $windowsPowerShell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    & $windowsPowerShell @(@("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $installer) + $installerArgs)
    $code = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  if ($code -ne 0) { exit $code }
}

function Sync-Checkout {
  if (-not (Test-Path -LiteralPath (Join-Path $InstallRoot ".git"))) { return $false }

  Push-Location $InstallRoot
  try {
    $beforeHead = (& git rev-parse HEAD 2>$null).Trim()
    $code = Invoke-Native "git" @("fetch", "origin", $Branch, "--quiet")
    if ($code -ne 0) {
      Write-Warn "Could not reach origin/$Branch. Launching the installed copy."
      return $false
    }

    $currentBranch = (& git branch --show-current 2>$null).Trim()
    if (-not $currentBranch) {
      Write-Warn "Detached checkout detected. Skipping launcher update."
      return $false
    }
    if ($currentBranch -ne $Branch) {
      Write-Info "Switching install checkout from $currentBranch to $Branch..."
      $code = Invoke-Native "git" @("switch", $Branch)
      if ($code -ne 0) {
        $code = Invoke-Native "git" @("switch", "-C", $Branch, "--track", "origin/$Branch")
        if ($code -ne 0) { throw "Could not switch to $Branch." }
      }
    }

    $counts = (& git rev-list --left-right --count HEAD...origin/$Branch 2>$null).Trim()
    $parts = if ($counts) { @($counts -split "\s+") } else { @("0", "0") }
    $ahead = if ($parts.Length -gt 0) { [int]$parts[0] } else { 0 }
    $behind = if ($parts.Length -gt 1) { [int]$parts[1] } else { 0 }
    $null = Invoke-Native "git" @("update-index", "-q", "--refresh")
    $trackedChanges = @(& git status --porcelain --untracked-files=no 2>$null | Where-Object { $_ -and $_.Trim() })

    if ($ahead -gt 0 -or $trackedChanges.Count -gt 0) {
      Write-Warn "Install checkout has local tracked changes or commits. Creating a backup and repairing..."
      $updateScript = Join-Path $InstallRoot "script\update-progress.ps1"
      $windowsPowerShell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
      $code = Invoke-Native $windowsPowerShell @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $updateScript, "-Action", "repair", "-Branch", $Branch)
      if ($code -ne 0) {
        Write-Warn "update-progress.ps1 failed. Falling back to direct git reset..."
        $code = Invoke-Native "git" @("fetch", "origin", $Branch, "--quiet")
        if ($code -eq 0) {
          $code = Invoke-Native "git" @("reset", "--hard", "origin/$Branch")
        }
        if ($code -ne 0) {
          throw "Repair failed. Stop here so the broken checkout does not launch."
        }
      }
      $null = Enable-CodyxSlimCheckout
      return $true
    }

    $sparseChanged = Enable-CodyxSlimCheckout

    if ($behind -eq 0) {
      Write-Ok "Install checkout is up to date."
      return $sparseChanged
    }

    Write-Info "Updating install checkout..."
    $code = Invoke-Native "git" @("pull", "--ff-only")
    if ($code -ne 0) {
      Write-Warn "Fast-forward update failed. Launching the installed copy."
      return $false
    }

    $afterHead = (& git rev-parse HEAD 2>$null).Trim()
    $sparseChanged = Enable-CodyxSlimCheckout
    return ($sparseChanged -or ($beforeHead -and $afterHead -and $beforeHead -ne $afterHead))
  } finally {
    Pop-Location
  }
}

function Test-DependencyFilesChanged($BeforeHead) {
  if (-not $BeforeHead) { return $true }
  Push-Location $InstallRoot
  try {
    $afterHead = (& git rev-parse HEAD 2>$null).Trim()
    if (-not $afterHead -or $BeforeHead -eq $afterHead) { return $false }
    return [bool](@(& git diff "$BeforeHead..$afterHead" --name-only | Where-Object {
      $_ -match '(^|/)package\.json$' -or $_ -eq "bun.lock"
    }) | Select-Object -First 1)
  } finally {
    Pop-Location
  }
}

function Refresh-Install {
  $bun = Get-BunCommand
  if (-not $bun) { throw "Bun is unavailable." }

  $beforeHead = if (Test-Path -LiteralPath (Join-Path $InstallRoot ".git")) {
    Push-Location $InstallRoot
    try { (& git rev-parse HEAD 2>$null).Trim() } finally { Pop-Location }
  } else {
    ""
  }
  $updated = Sync-Checkout
  $needInstall = $updated -and (Test-DependencyFilesChanged $beforeHead)
  if (-not (Test-Path -LiteralPath (Join-Path $InstallRoot "node_modules"))) { $needInstall = $true }
  if (-not (Test-Path -LiteralPath (Join-Path $InstallRoot "packages\codyx\node_modules\drizzle-orm\sqlite-core\index.js"))) { $needInstall = $true }
  $anthropicStores = Get-ChildItem -LiteralPath (Join-Path $InstallRoot "node_modules\.bun") -Directory -Filter "@anthropic-ai+sdk*" -ErrorAction SilentlyContinue
  if ($anthropicStores | Where-Object { -not (Test-Path -LiteralPath (Join-Path $_.FullName "node_modules\@anthropic-ai\sdk\version.mjs")) }) { $needInstall = $true }

  if ($needInstall) {
    Write-Info "Refreshing dependencies..."
    Push-Location $InstallRoot
    $previousHusky = $env:HUSKY
    $env:HUSKY = "0"
    try {
      $code = Invoke-Native $bun @("install", "--force")
      if ($code -ne 0) { throw "bun install failed." }
    } finally {
      $env:HUSKY = $previousHusky
      Pop-Location
    }
  }

  Update-CodyxInstallMarker

  if (-not $NoBuild -and $updated) {
    $appDir = Join-Path $InstallRoot "packages\app"
    if (Test-Path -LiteralPath $appDir) {
      Write-Info "Rebuilding Web UI..."
      Push-Location $appDir
      try {
        $code = Invoke-Native $bun @("run", "build")
        if ($code -ne 0) { Write-Warn "Web UI build failed. The CLI can still launch." }
      } finally {
        Pop-Location
      }
    }
  }
}

function Invoke-Codyx {
  if ($NoLaunch) { return }
  $launcher = Join-Path $InstallRoot "codyx.cmd"
  if (-not (Test-Path -LiteralPath $launcher)) { throw "Cannot find installed codyx command at $launcher." }

  $previousSkipUpdate = $env:CODY_SKIP_UPDATE_CHECK
  $previousLaunchDir = $env:CODY_LAUNCH_DIR
  $env:CODY_SKIP_UPDATE_CHECK = "1"
  if (-not $env:CODY_LAUNCH_DIR) {
    $candidate = (Get-Location).Path
    $root = [System.IO.Path]::GetPathRoot($candidate)
    $env:CODY_LAUNCH_DIR = if ($root -and $candidate.TrimEnd("\") -eq $root.TrimEnd("\")) { $env:USERPROFILE } else { $candidate }
  }
  try {
    $code = Invoke-Native $launcher $CodyxArgs
    exit $code
  } finally {
    $env:CODY_SKIP_UPDATE_CHECK = $previousSkipUpdate
    $env:CODY_LAUNCH_DIR = $previousLaunchDir
  }
}

$InstallRoot = Resolve-InstallRoot $InstallRoot

Write-Host ""
Write-Host "  codyx Launcher" -ForegroundColor Cyan
Write-Host "  Repo:   $RepoUrl" -ForegroundColor DarkGray
Write-Host "  Branch: $Branch" -ForegroundColor DarkGray
Write-Host "  Root:   $InstallRoot" -ForegroundColor DarkGray
Write-Host "  Mode:   End-user (slim clone)" -ForegroundColor DarkGray
Write-Host ""

Ensure-Git
Ensure-Bun

$needsFirstRunInstall = -not (Test-CodyxInstallComplete $InstallRoot)

if (-not (Test-CodyxCheckout $InstallRoot)) {
  if ((Test-Path -LiteralPath $InstallRoot) -and (Get-ChildItem -LiteralPath $InstallRoot -Force | Select-Object -First 1)) {
    Remove-PartialInstallRoot $InstallRoot
  }

  $parent = Split-Path -Parent $InstallRoot
  if ($parent) { $null = New-Item -ItemType Directory -Force -Path $parent }
  Write-Info "Cloning codyx (slim end-user clone)..."
  Invoke-WithRetry {
    if (Test-CodyxCheckout $InstallRoot) { return }
    if ((Test-Path -LiteralPath $InstallRoot) -and (Get-ChildItem -LiteralPath $InstallRoot -Force | Select-Object -First 1)) {
      Remove-PartialInstallRoot $InstallRoot
    }
    $code = Invoke-Native "git" @("clone", "--filter=blob:none", "--no-checkout", "--quiet", "--branch", $Branch, $RepoUrl, $InstallRoot)
    if ($code -ne 0) { throw "git clone failed." }
    Push-Location $InstallRoot
    try {
      $null = Invoke-Native "git" @("sparse-checkout", "init", "--cone")
      $code = Invoke-Native "git" (@("sparse-checkout", "set") + (Get-CodyxSparseCheckoutPaths))
      if ($code -ne 0) { throw "git sparse-checkout set failed." }
      $code = Invoke-Native "git" @("checkout", $Branch)
      if ($code -ne 0) { throw "git checkout failed." }
    } finally { Pop-Location }
  } "git clone (sparse)"
  git config --global --add safe.directory "$InstallRoot" 2>$null
  $needsFirstRunInstall = $true
} else {
  git config --global --add safe.directory "$InstallRoot" 2>$null
}

if ($needsFirstRunInstall) {
  if (Test-CodyxCheckout $InstallRoot) {
    $null = Sync-Checkout
  }
  Invoke-FirstRunInstall
} else {
  Refresh-Install
}

Invoke-Codyx
