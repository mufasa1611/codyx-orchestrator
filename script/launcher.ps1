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
    & $Command @Arguments | ForEach-Object { Write-Host $_ }
    return [int]$LASTEXITCODE
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

function Add-CurrentPathEntry($Path) {
  if (-not $Path) { return }
  if (-not (Test-Path -LiteralPath $Path)) { return }
  $full = [System.IO.Path]::GetFullPath($Path).TrimEnd("\")
  foreach ($item in @($env:PATH -split ";" | Where-Object { $_ -and $_.Trim() })) {
    $expanded = [Environment]::ExpandEnvironmentVariables($item)
    try { $normalized = [System.IO.Path]::GetFullPath($expanded).TrimEnd("\") } catch { $normalized = $expanded.TrimEnd("\") }
    if ($normalized.Equals($full, [System.StringComparison]::OrdinalIgnoreCase)) { return }
  }
  $env:PATH = "$full;$env:PATH"
}

function Add-UserPathEntry($Path) {
  if (-not $Path) { return }
  if (-not (Test-Path -LiteralPath $Path)) { return }
  $full = [System.IO.Path]::GetFullPath($Path).TrimEnd("\")
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $items = @()
  if ($userPath) { $items = $userPath -split ";" | Where-Object { $_ -and $_.Trim() } }
  foreach ($item in $items) {
    $expanded = [Environment]::ExpandEnvironmentVariables($item)
    try { $normalized = [System.IO.Path]::GetFullPath($expanded).TrimEnd("\") } catch { $normalized = $expanded.TrimEnd("\") }
    if ($normalized.Equals($full, [System.StringComparison]::OrdinalIgnoreCase)) {
      Add-CurrentPathEntry $full
      return
    }
  }
  [Environment]::SetEnvironmentVariable("Path", (@($items + $full) -join ";"), "User")
  Add-CurrentPathEntry $full
}

function Get-PortableGitDownloadUrls($Headers) {
  $urls = New-Object System.Collections.Generic.List[string]
  try {
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/git-for-windows/git/releases/latest" -Headers $Headers -UseBasicParsing -TimeoutSec 20
    $asset = @($release.assets | Where-Object {
      $_.name -match '^MinGit-.*-64-bit\.zip$' -and $_.name -notmatch 'busybox'
    } | Select-Object -First 1)[0]
    if ($asset -and $asset.browser_download_url) {
      $urls.Add([string]$asset.browser_download_url)
    }
  } catch {
    Write-Warn "Could not query latest portable Git release: $($_.Exception.Message)"
  }

  foreach ($fallback in @(
    "https://github.com/git-for-windows/git/releases/download/v2.55.0.windows.2/MinGit-2.55.0.2-64-bit.zip",
    "https://github.com/git-for-windows/git/releases/download/v2.54.2.windows.1/MinGit-2.54.2-64-bit.zip",
    "https://github.com/git-for-windows/git/releases/download/v2.53.0.windows.1/MinGit-2.53.0-64-bit.zip"
  )) {
    if (-not $urls.Contains($fallback)) { $urls.Add($fallback) }
  }
  return $urls
}

function Install-PortableGit {
  if (Test-Command git) { return $true }

  $toolsRoot = Join-Path $env:LOCALAPPDATA "codyx\tools"
  $gitRoot = Join-Path $toolsRoot "mingit"
  $gitCmd = Join-Path $gitRoot "cmd\git.exe"
  $gitBin = Join-Path $gitRoot "bin\git.exe"

  foreach ($candidate in @($gitCmd, $gitBin)) {
    if (Test-Path -LiteralPath $candidate) {
      $pathAdd = Split-Path -Parent $candidate
      Add-UserPathEntry $pathAdd
      $env:CODY_PORTABLE_GIT_ROOT = $gitRoot
      $env:CODY_PORTABLE_GIT_PATH = $pathAdd
      return (Test-Command git)
    }
  }

  Write-Info "Installing portable Git locally..."
  $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("codyx-mingit-" + [System.Guid]::NewGuid().ToString("N"))
  $zipPath = Join-Path $tempRoot "mingit.zip"
  try {
    $null = New-Item -ItemType Directory -Force -Path $tempRoot
    $null = New-Item -ItemType Directory -Force -Path $toolsRoot
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $headers = @{ "User-Agent" = "codyx-launcher" }
    foreach ($downloadUrl in (Get-PortableGitDownloadUrls $headers)) {
      try {
        Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
        Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath -Headers $headers -UseBasicParsing -TimeoutSec 120
        if (Test-Path -LiteralPath $gitRoot) {
          Remove-Item -LiteralPath $gitRoot -Recurse -Force -ErrorAction Stop
        }
        $null = New-Item -ItemType Directory -Force -Path $gitRoot
        Expand-Archive -LiteralPath $zipPath -DestinationPath $gitRoot -Force

        foreach ($candidate in @($gitCmd, $gitBin)) {
          if (Test-Path -LiteralPath $candidate) {
            $pathAdd = Split-Path -Parent $candidate
            Add-UserPathEntry $pathAdd
            $env:CODY_PORTABLE_GIT_ROOT = $gitRoot
            $env:CODY_PORTABLE_GIT_PATH = $pathAdd
            return (Test-Command git)
          }
        }
        Write-Warn "Portable Git archive did not contain git.exe: $downloadUrl"
      } catch {
        Write-Warn "Portable Git download failed from $downloadUrl`: $($_.Exception.Message)"
      }
    }
    Write-Warn "Portable Git could not be downloaded from any known source."
    return $false
  } catch {
    Write-Warn "Portable Git install failed: $($_.Exception.Message)"
    return $false
  } finally {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
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
  if (Install-PortableGit) {
    Write-Ok "Portable Git installed."
    return
  }
  throw "Git is required and could not be installed automatically. Install Git from https://git-scm.com/download/win, then run this launcher again."
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
    "/package.json", "/bun.lock", "/bunfig.toml", "/codyx.cmd", "/LICENSE",
    "/patches/",
    "/script/discover-local-models.ps1",
    "/script/ensure-default-config.ps1",
    "/script/install-codyx-global.ps1",
    "/script/install.ps1",
    "/script/installer-verification.ps1",
    "/script/launcher-menu.ps1",
    "/script/launcher.ps1",
    "/script/update-install-marker.ps1",
    "/script/update-progress.ps1",
    "/packages/app/",
    "/packages/codyx/",
    "/packages/core/",
    "/packages/plugin/",
    "/packages/script/",
    "/packages/sdk/",
    "/packages/ui/",
    "!/packages/app/e2e/",
    "!/packages/codyx/script/httpapi-exercise.ts",
    "!/packages/codyx/test/",
    "!/packages/core/test/",
    "!**/*.spec.ts",
    "!**/*.spec.tsx",
    "!**/*.stories.tsx",
    "!**/*.test.ts",
    "!**/*.test.tsx",
    "!**/src/storybook/"
  )
}

function Disable-CodyxGitPush {
  $null = Invoke-Native "git" @("remote", "set-url", "--push", "origin", "DISABLED-BY-CODYX-END-USER-INSTALL")
}

function Test-CodyxPathUnderRoot($Root, $Path) {
  try {
    $rootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd("\")
    $pathFull = [System.IO.Path]::GetFullPath($Path).TrimEnd("\")
    return $pathFull.Equals($rootFull, [System.StringComparison]::OrdinalIgnoreCase) -or $pathFull.StartsWith("$rootFull\", [System.StringComparison]::OrdinalIgnoreCase)
  } catch {
    return $false
  }
}

function Remove-CodyxEndUserSourceExtras {
  $relativePaths = @(
    "packages\app\e2e",
    "packages\codyx\script\httpapi-exercise.ts",
    "packages\codyx\test",
    "packages\core\test",
    "packages\gitlab-auth",
    "packages\poe-auth"
  )
  foreach ($relativePath in $relativePaths) {
    $target = Join-Path $InstallRoot $relativePath
    if ((Test-Path -LiteralPath $target) -and (Test-CodyxPathUnderRoot $InstallRoot $target)) {
      Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction Stop
    }
  }

  $packagesRoot = Join-Path $InstallRoot "packages"
  if (-not (Test-Path -LiteralPath $packagesRoot)) { return }
  Get-ChildItem -LiteralPath $packagesRoot -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch "\\node_modules\\" -and $_.Name -match "\.(test|spec)\.tsx?$|\.stories\.tsx$" } |
    ForEach-Object {
      if (Test-CodyxPathUnderRoot $InstallRoot $_.FullName) {
        Remove-Item -LiteralPath $_.FullName -Force -ErrorAction Stop
      }
    }
}

function Enable-CodyxSlimCheckout {
  if (-not (Test-Path -LiteralPath (Join-Path $InstallRoot ".git"))) { return $false }

  Write-Info "Ensuring slim end-user checkout..."
  Push-Location $InstallRoot
  try {
    $code = Invoke-Native "git" @("sparse-checkout", "init", "--no-cone")
    if ($code -ne 0) { throw "git sparse-checkout init failed." }
    $code = Invoke-Native "git" (@("sparse-checkout", "set", "--no-cone") + (Get-CodyxSparseCheckoutPaths))
    if ($code -ne 0) { throw "git sparse-checkout set failed." }
    Disable-CodyxGitPush
    Remove-CodyxEndUserSourceExtras
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
    $success = $false
    try {
      # Attempt 1: standard bun install without rewriting tracked lockfiles
      $code = Invoke-Native $bun @("install", "--no-save")
      if ($code -eq 0) {
        $success = $true
      } else {
        Write-Warn "Standard 'bun install' failed. Trying with --force..."
        $code = Invoke-Native $bun @("install", "--no-save", "--force")
        if ($code -eq 0) {
          $success = $true
        } else {
          Write-Warn "Forced dependency install failed. Cleaning bun cache and retrying..."
          $null = Invoke-Native $bun @("pm", "cache", "clean")
          $code = Invoke-Native $bun @("install", "--no-save")
          if ($code -eq 0) { $success = $true }
        }
      }
    } finally {
      $env:HUSKY = $previousHusky
      Pop-Location
    }

    if (-not $success) {
      $hasDrizzle = Test-Path -LiteralPath (Join-Path $InstallRoot "packages\codyx\node_modules\drizzle-orm\sqlite-core\index.js")
      $hasApp = Test-Path -LiteralPath (Join-Path $InstallRoot "node_modules")
      if ($hasDrizzle -and $hasApp) {
        Write-Warn "Some dependencies could not be refreshed, but critical workspace packages exist. Continuing launch..."
      } else {
        throw "Dependency installation failed and critical workspace packages are missing. Run bun install manually."
      }
    }
  }

  Update-CodyxInstallMarker

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
      $null = Invoke-Native "git" @("sparse-checkout", "init", "--no-cone")
      $code = Invoke-Native "git" (@("sparse-checkout", "set", "--no-cone") + (Get-CodyxSparseCheckoutPaths))
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
