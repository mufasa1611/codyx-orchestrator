#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Install codyx on Windows - single-command setup for novice users.
.DESCRIPTION
    Detects prerequisites, verifies email ownership, installs what's missing,
    clones/updates the repo, installs dependencies, builds the web UI, configures
    the Cloudflare proxy tunnel, and installs the global codyx command.
.PARAMETER Yes
    Auto-confirm optional installer prompts. Email verification is never bypassed.
.PARAMETER Branch
    Git branch to clone/checkout (default: dev).
.PARAMETER NoScan
    Skip local model discovery (Ollama/GGUF scanning).
.PARAMETER NoProxy
    Skip Cloudflare proxy tunnel setup.
.PARAMETER NoBuild
    Skip web UI build.
.PARAMETER InstallRoot
    Directory to clone/install codyx into (default: ~\AppData\Local\codyx).
.EXAMPLE
    irm https://raw.githubusercontent.com/mufasa1611/codyx-orchestrator/dev/script/install.ps1 | iex
.EXAMPLE
    .\install.ps1 -Yes -Branch dev -NoScan -NoProxy
#>
param(
  [switch]$Yes,
  [string]$Branch = "dev",
  [switch]$NoScan,
  [switch]$NoProxy,
  [switch]$NoBuild,
  [switch]$Verbose,
  [switch]$AcceptLicense,
  [string]$InstallRoot = ""
)

$ErrorActionPreference = "Stop"
try { $Host.UI.RawUI.WindowTitle = "codyx Installer" } catch {}

# Version & credits
$Script:CODY_VERSION = "1.0.0"
$Script:REPO_URL = "https://github.com/mufasa1611/codyx-orchestrator.git"
$Script:CREDITS = "Builder: M. Farid (Mufasa) | Repo: $REPO_URL"
$Script:VERIFICATION_URL = "https://install.kingkung.men"
$Script:LICENSE_URL = "https://install.kingkung.men/license"

# Configuration
$RepoUrl = $Script:REPO_URL
$DefaultParent = Join-Path $env:LOCALAPPDATA "codyx"
$Root = if ($InstallRoot) { $InstallRoot } else { $DefaultParent }
$GlobalBin = Join-Path $env:APPDATA "npm"
$GlobalCmd = Join-Path $GlobalBin "codyx.cmd"
$CheckoutRoot = if ($PSScriptRoot) { Split-Path -Parent $PSScriptRoot } else { $null }
$IsStandalone = -not ($CheckoutRoot -and (Test-Path (Join-Path $CheckoutRoot "codyx.cmd")))
$CreatedRepo = $false
$InstallerStateDir = Join-Path $env:LOCALAPPDATA "codyx-installer"
$InstallerMarkerPath = Join-Path $InstallerStateDir "install-marker.json"
$Script:ManagedTools = @()

# Verbose logging
$VerbosePref = if ($Verbose) { "Continue" } else { "SilentlyContinue" }

# Helpers

function Write-Step($Message) {
  Write-Host ">> $Message" -ForegroundColor Cyan
}

function Write-Ok($Message) {
  Write-Host "[ok] $Message" -ForegroundColor Green
}

function Write-Warn($Message) {
  Write-Host "[warn] $Message" -ForegroundColor Yellow
}

function Write-Err($Message) {
  Write-Host "[error] $Message" -ForegroundColor Red
}

function Write-Section($Number, $Label) {
  Write-Host ""
  Write-Host "=== $Number. $Label ===" -ForegroundColor Cyan
}

function Read-CodyxInstallerInput($Prompt) {
  if ($env:CODY_LAUNCHER_UI -eq "1") {
    Write-Host "::codyx-prompt::$Prompt"
    $value = [Console]::In.ReadLine()
    if ($null -eq $value) { return "" }
    return $value
  }
  return Read-Host $Prompt
}

$Script:CodyxUserName = ""

function Ensure-UserMemo {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RootPath
  )

  $memoPath = Join-Path $RootPath "memo.md"
  $existing = if (Test-Path -LiteralPath $memoPath) {
    [System.IO.File]::ReadAllText($memoPath, [System.Text.Encoding]::UTF8)
  } else {
    ""
  }

  if ($existing.Contains("- username:")) {
    Write-Ok "Username already saved in memo.md."
    $Script:CodyxUserName = ($existing -split "`n" | Where-Object { $_ -match "- username:" } | ForEach-Object { $_ -replace ".*- username: " } | Select-Object -First 1).Trim()
    return
  }

  Write-Step "Saving your username to memo.md..."
  while ($true) {
    $value = (Read-CodyxInstallerInput "What would you like codyx to call you?").Trim()
    if ($value.Length -lt 1) {
      Write-Warn "Enter a name."
      continue
    }
    if ($value.Length -gt 100) {
      Write-Warn "Keep it under 100 characters."
      continue
    }
    $Script:CodyxUserName = $value
    $content = if ([string]::IsNullOrWhiteSpace($existing)) {
@"
# Private Workspace Memo
*Note: This file is Gitignored and contains private machine-specific info.*

## User
- username: $value
"@
    } else {
      ($existing.TrimEnd() + "`r`n`r`n## User`r`n- username: $value`r`n")
    }
    [System.IO.File]::WriteAllText($memoPath, $content, [System.Text.UTF8Encoding]::new($false))
    Write-Ok "Saved username to $memoPath"
    return
  }
}

function Write-VerboseMsg($Message) {
  if ($Verbose) { Write-Host "  [verbose] $Message" -ForegroundColor DarkGray }
}

function Test-Command($Name) {
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Get-CodyxOllamaCommand {
  $cmd = Get-Command ollama -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  foreach ($candidate in @(
    (Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"),
    (Join-Path $env:ProgramFiles "Ollama\ollama.exe")
  )) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) { return $candidate }
  }
  return $null
}

function Test-BunVersion {
  if (-not (Test-Command bun)) { return $false }
  try {
    return [version](& bun --version) -ge [version]"1.3.13"
  } catch {
    return $false
  }
}

function Test-InteractiveHost {
  if ($env:CODY_LAUNCHER_UI -eq "1") { return $true }
  if (-not [Environment]::UserInteractive) { return $false }
  try { return -not [Console]::IsInputRedirected } catch { return $true }
}

function Get-ObjectArray($Value) {
  if ($null -eq $Value) { return @() }
  if ($Value -is [System.Array]) { return @($Value) }
  return @($Value)
}

function Read-CodyxMarker {
  param([string]$Path)

  if (-not $Path) { return $null }
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  try {
    return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
  } catch {
    return $null
  }
}

function Write-CodyxMarker {
  param(
    [string]$Path,
    $Marker
  )

  $dir = Split-Path -Parent $Path
  if ($dir) { $null = New-Item -ItemType Directory -Force -Path $dir }
  [System.IO.File]::WriteAllText(
    $Path,
    ($Marker | ConvertTo-Json -Compress -Depth 8),
    [System.Text.UTF8Encoding]::new($false)
  )
}

function Set-CodyxMarkerValue {
  param(
    $Marker,
    [string]$Name,
    $Value
  )

  if ($Marker.PSObject.Properties.Name -contains $Name) {
    $Marker.$Name = $Value
    return
  }
  $Marker | Add-Member -NotePropertyName $Name -NotePropertyValue $Value
}

function Write-CodyxAdminUninstallMarker {
  param([string]$Path)

  if (-not $Path) { return }
  $marker = Read-CodyxMarker $Path
  if (-not $marker) { $marker = [pscustomobject]@{} }
  if (-not ($marker.PSObject.Properties.Name -contains "root") -or -not $marker.root) {
    Set-CodyxMarkerValue $marker "root" $Root
  }

  $receiptPath = Join-Path $InstallerStateDir "verification.json"
  Set-CodyxMarkerValue $marker "adminUninstall" ([pscustomobject]@{
    enabled = $true
    serviceUrl = $Script:VERIFICATION_URL
    receiptPath = $receiptPath
    commandsPath = "/v1/commands"
    acknowledgePath = "/v1/acknowledge"
    completePath = "/v1/complete"
  })

  $verification = Read-CodyxMarker $receiptPath
  if ($verification -and $verification.install_id) {
    Set-CodyxMarkerValue $marker "verification" ([pscustomobject]@{
      installId = [string]$verification.install_id
      receiptPath = $receiptPath
      serverUrl = if ($verification.server_url) { [string]$verification.server_url } else { $Script:VERIFICATION_URL }
    })
  }

  Write-CodyxMarker $Path $marker
}

function Test-SameManagedTool {
  param($Left, $Right)

  return (
    "$($Left.name)" -eq "$($Right.name)" -and
    "$($Left.manager)" -eq "$($Right.manager)" -and
    "$($Left.packageId)" -eq "$($Right.packageId)" -and
    "$($Left.path)" -eq "$($Right.path)"
  )
}

function Add-CodyxManagedTool {
  param(
    [string]$Name,
    [string]$Manager,
    [string]$PackageId = "",
    [string]$Path = "",
    [string[]]$PathAdds = @()
  )

  $tool = [pscustomobject]@{
    name = $Name
    manager = $Manager
    packageId = $PackageId
    path = $Path
    pathAdds = @($PathAdds | Where-Object { $_ })
  }

  if (-not ($Script:ManagedTools | Where-Object { Test-SameManagedTool $_ $tool } | Select-Object -First 1)) {
    $Script:ManagedTools += $tool
  }

  $marker = Read-CodyxMarker $InstallerMarkerPath
  if (-not $marker) { $marker = [pscustomobject]@{} }
  if (-not ($marker.PSObject.Properties.Name -contains "managedTools")) {
    $marker | Add-Member -NotePropertyName managedTools -NotePropertyValue @()
  }
  $tools = Get-ObjectArray $marker.managedTools
  if (-not ($tools | Where-Object { Test-SameManagedTool $_ $tool } | Select-Object -First 1)) {
    $marker.managedTools = @($tools + $tool)
    Write-CodyxMarker $InstallerMarkerPath $marker
  }
}

function Get-CodyxManagedTools {
  $tools = @()
  foreach ($markerPath in @($InstallerMarkerPath, (Join-Path $Root ".codyx-install-marker"))) {
    $marker = Read-CodyxMarker $markerPath
    if ($marker -and ($marker.PSObject.Properties.Name -contains "managedTools")) {
      foreach ($tool in (Get-ObjectArray $marker.managedTools)) {
        if (-not ($tools | Where-Object { Test-SameManagedTool $_ $tool } | Select-Object -First 1)) {
          $tools += $tool
        }
      }
    }
  }
  return $tools
}

function Remove-CodyxPath {
  param(
    [string]$Path,
    [string]$Label
  )

  if (-not $Path) { return }
  if (-not (Test-Path -LiteralPath $Path)) { return }
  try {
    Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
    Write-Ok "Removed ${Label}: $Path"
  } catch {
    Write-Warn "Could not remove ${Label}: $Path"
  }
}

function Remove-UserPathEntry {
  param([string]$Entry)

  if (-not $Entry) { return }
  try { $target = [System.IO.Path]::GetFullPath($Entry).TrimEnd("\") } catch { $target = $Entry.TrimEnd("\") }
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  if (-not $userPath) { return }
  $items = @($userPath -split ";" | Where-Object { $_ -and $_.Trim() })
  $kept = @()
  $removed = $false
  foreach ($item in $items) {
    $expanded = [Environment]::ExpandEnvironmentVariables($item)
    try { $normalized = [System.IO.Path]::GetFullPath($expanded).TrimEnd("\") } catch { $normalized = $expanded.TrimEnd("\") }
    if ($normalized.Equals($target, [System.StringComparison]::OrdinalIgnoreCase)) {
      $removed = $true
      continue
    }
    $kept += $item
  }
  if ($removed) {
    [Environment]::SetEnvironmentVariable("Path", (@($kept) -join ";"), "User")
    $envItems = @()
    foreach ($item in @($env:PATH -split ";")) {
      if (-not $item -or -not $item.Trim()) { continue }
      $expanded = [Environment]::ExpandEnvironmentVariables($item)
      try { $normalized = [System.IO.Path]::GetFullPath($expanded).TrimEnd("\") } catch { $normalized = $expanded.TrimEnd("\") }
      if (-not $normalized.Equals($target, [System.StringComparison]::OrdinalIgnoreCase)) {
        $envItems += $item
      }
    }
    $env:PATH = @($envItems) -join ";"
    Write-Ok "Removed PATH entry installed by codyx: $Entry"
  }
}

function Invoke-CodyxManagedToolCleanup {
  $tools = Get-CodyxManagedTools
  foreach ($tool in $tools) {
    $name = "$($tool.name)"
    $manager = "$($tool.manager)"
    $packageId = "$($tool.packageId)"
    $toolPath = "$($tool.path)"

    foreach ($entry in (Get-ObjectArray $tool.pathAdds)) {
      Remove-UserPathEntry "$entry"
    }

    if ($manager -eq "path") {
      Remove-CodyxPath $toolPath "$name installed by codyx"
      continue
    }

    if ($manager -eq "winget" -and $packageId -and (Test-Command winget)) {
      Write-Step "Removing $name installed by codyx with winget..."
      & winget uninstall --id $packageId --exact --source winget --silent
      if ($LASTEXITCODE -eq 0) {
        Write-Ok "Removed $name installed by codyx."
      } else {
        Write-Warn "Could not remove $name with winget. Remove manually if needed: winget uninstall --id $packageId --exact"
      }
      continue
    }

    if ($manager -eq "choco" -and $packageId -and (Test-Command choco)) {
      Write-Step "Removing $name installed by codyx with Chocolatey..."
      & choco uninstall $packageId -y --no-progress | Out-Null
      if ($LASTEXITCODE -eq 0) {
        Write-Ok "Removed $name installed by codyx."
      } else {
        Write-Warn "Could not remove $name with Chocolatey. Remove manually if needed: choco uninstall $packageId -y"
      }
    }
  }
}

function Test-SafeInstallRootCleanup {
  param([string]$Path)

  if (-not $Path) { return $false }
  try {
    $full = [System.IO.Path]::GetFullPath($Path).TrimEnd("\")
    $default = [System.IO.Path]::GetFullPath($DefaultParent).TrimEnd("\")
    if ($full.Equals($default, [System.StringComparison]::OrdinalIgnoreCase)) { return $true }
    if (Test-Path -LiteralPath (Join-Path $full ".codyx-install-marker")) { return $true }
  } catch {}
  return $false
}

function Test-SafePartialInstallRoot {
  param([string]$Path)

  if (-not $Path) { return $false }
  try {
    $full = [System.IO.Path]::GetFullPath($Path).TrimEnd("\")
    $default = [System.IO.Path]::GetFullPath($DefaultParent).TrimEnd("\")
    if ($full.Equals($default, [System.StringComparison]::OrdinalIgnoreCase)) { return $true }
    if ($full.StartsWith("$default\", [System.StringComparison]::OrdinalIgnoreCase)) { return $true }
    if (Test-Path -LiteralPath (Join-Path $full ".git")) { return $true }
  } catch {}
  return $false
}

function Remove-PartialInstallRoot {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) { return }
  if (Test-Path -LiteralPath (Join-Path $Path "codyx.cmd")) { return }
  if (-not (Test-SafePartialInstallRoot $Path)) {
    Write-Err "Directory $Path exists but is not a codyx checkout."
    Write-Err "Move it away or remove it, then rerun."
    exit 1
  }
  Write-Warn "Removing incomplete install folder before retry: $Path"
  Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
}

function Invoke-CodyxTraceCleanup {
  Write-Step "Cleaning codyx installation traces..."

  if (Test-Command npm) {
    Write-Step "Removing global npm package codyx-ai if present..."
    try {
      $process = Start-Process -FilePath "npm" -ArgumentList @("uninstall", "-g", "codyx-ai", "--silent") -NoNewWindow -PassThru
      if ($process.WaitForExit(20000)) {
        if ($process.ExitCode -eq 0) { Write-Ok "Removed global npm package codyx-ai." }
      } else {
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        Write-Warn "npm global package cleanup timed out and was skipped."
      }
    } catch {
      Write-Warn "npm global package cleanup failed."
    }
  }

  foreach ($name in @("codyx.cmd", "codyx.ps1", "codyx.exe", "codyx")) {
    Remove-CodyxPath (Join-Path $GlobalBin $name) "global shim"
  }

  Remove-CodyxPath (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\codyx") "Start Menu shortcuts"
  Invoke-CodyxManagedToolCleanup

  if (Test-SafeInstallRootCleanup $Root) {
    Remove-CodyxPath $Root "install root"
  } else {
    Write-Warn "Skipped install root cleanup because it is not the default codyx path and has no install marker: $Root"
  }

  Remove-CodyxPath $InstallerStateDir "installer verification data"

  Write-Ok "codyx cleanup finished."
}

function Confirm-LicenseAgreement {
  if ($AcceptLicense -or $env:CODY_ACCEPT_LICENSE -eq "1") {
    Write-Ok "License accepted through explicit installer option."
    return $true
  }

  Write-Section 0 "License Agreement"
  Write-Host "codyx-orchestrator is distributed under the MIT License." -ForegroundColor White
  $esc = [char]27
  $ansiLink = "$esc]8;;$($Script:LICENSE_URL)$esc\\License: $($Script:LICENSE_URL)$esc]8;;$esc\\"
  Write-Host $ansiLink -ForegroundColor DarkGray
  Write-Host ""
  Write-Host "By installing, you agree to the license terms and understand that" -ForegroundColor White
  Write-Host "the software is provided AS IS, without warranty of any kind." -ForegroundColor White
  Write-Host ""
  Write-Host "[ ] Agree and continue installation" -ForegroundColor Green
  Write-Host "[ ] Disagree and remove codyx traces" -ForegroundColor Red
  Write-Host ""

  if (-not (Test-InteractiveHost)) {
    Write-Err "License agreement requires an interactive terminal."
    Write-Err "Rerun interactively or set CODY_ACCEPT_LICENSE=1 after reviewing the license."
    return $false
  }

  while ($true) {
    $choice = (Read-CodyxInstallerInput "Type A to agree or D to disagree").Trim().ToLowerInvariant()
    if ($choice -in @("a", "agree", "y", "yes")) {
      Write-Host "[x] Agree" -ForegroundColor Green
      Write-Ok "License accepted."
      return $true
    }
    if ($choice -in @("d", "disagree", "n", "no")) {
      Write-Host "[x] Disagree" -ForegroundColor Red
      Write-Warn "License declined. Starting uninstall cleanup."
      Invoke-CodyxTraceCleanup
      return $false
    }
    Write-Warn "Choose A to agree or D to disagree."
  }
}

function Add-UserPathEntry($entry) {
  $full = [System.IO.Path]::GetFullPath($entry).TrimEnd("\")
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $items = @()
  if ($userPath) { $items = $userPath -split ";" | Where-Object { $_ -and $_.Trim() } }
  $exists = $false
  foreach ($item in $items) {
    $expanded = [Environment]::ExpandEnvironmentVariables($item)
    try { $normalized = [System.IO.Path]::GetFullPath($expanded).TrimEnd("\") } catch { $normalized = $expanded.TrimEnd("\") }
    if ($normalized.Equals($full, [System.StringComparison]::OrdinalIgnoreCase)) { $exists = $true; break }
  }
  if (-not $exists) {
    $next = @($items + $full) -join ";"
    [Environment]::SetEnvironmentVariable("Path", $next, "User")
    Write-Ok "Added $full to user PATH"
  }
  $currentItems = @($env:PATH -split ";" | Where-Object { $_ -and $_.Trim() })
  $inCurrent = $false
  foreach ($item in $currentItems) {
    $expanded = [Environment]::ExpandEnvironmentVariables($item)
    try { $normalized = [System.IO.Path]::GetFullPath($expanded).TrimEnd("\") } catch { $normalized = $expanded.TrimEnd("\") }
    if ($normalized.Equals($full, [System.StringComparison]::OrdinalIgnoreCase)) { $inCurrent = $true; break }
  }
  if (-not $inCurrent) { $env:PATH = "$full;$env:PATH" }
}

function Install-WithWinget($Id, $Label) {
  if (-not (Test-Command winget)) {
    return $null
  }
  Write-Step "Installing $Label with winget..."
  & winget install --id $Id --exact --source winget --accept-package-agreements --accept-source-agreements
  if ($LASTEXITCODE -ne 0) {
    Write-Warn "winget install failed."
    return $false
  }
  Write-Ok "$Label installed via winget."
  return $true
}

function Install-WithChoco($Label) {
  if (-not (Test-Command choco)) {
    return $null
  }
  Write-Step "Installing $Label with Chocolatey..."
  & choco install $Label -y --no-progress | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Warn "Chocolatey install failed."
    return $false
  }
  Write-Ok "$Label installed via Chocolatey."
  return $true
}

function Install-EnsureCommand($Name, $WingetId, $Label) {
  if (Test-Command $Name) {
    Write-Ok "$Label found."
    return $true
  }

  Write-Warn "$Label not found."

  # Try winget
  $result = Install-WithWinget $WingetId $Label
  if ($result -eq $true) {
    Add-CodyxManagedTool $Name "winget" $WingetId
    if (Test-Command $Name) { return $true }
  }

  # Try choco as fallback
  if ($result -ne $true) {
    $result = Install-WithChoco $Label
    if ($result -eq $true) {
      Add-CodyxManagedTool $Name "choco" $Label
      refreshenv 2>$null
      if (Test-Command $Name) { return $true }
    }
  }

  # All methods failed
  Write-Err "$Label is required. Install it manually, then rerun."
  return $false
}

function Invoke-WithRetry($ScriptBlock, $Label, $MaxRetries = 3) {
  $backoff = 1
  for ($i = 0; $i -lt $MaxRetries; $i++) {
    try {
      & $ScriptBlock
      return
    } catch {
      if ($i -eq $MaxRetries - 1) { throw }
      Write-Warn "$Label failed (attempt $($i+1)/$MaxRetries). Retrying in ${backoff}s..."
      Start-Sleep -Seconds $backoff
      $backoff = [Math]::Min($backoff * 2, 16)
    }
  }
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
  Write-Step "Ensuring slim end-user checkout..."
  & git sparse-checkout init --cone
  if ($LASTEXITCODE -ne 0) { throw "git sparse-checkout init failed" }
  $sparsePaths = Get-CodyxSparseCheckoutPaths
  & git sparse-checkout set @sparsePaths
  if ($LASTEXITCODE -ne 0) { throw "git sparse-checkout set failed" }
}

function Sync-InstallCheckout($TargetBranch) {
  Write-VerboseMsg "Fetching origin/$TargetBranch..."
  & git fetch origin $TargetBranch --quiet
  if ($LASTEXITCODE -ne 0) { throw "git fetch failed" }

  $currentBranch = (& git branch --show-current 2>$null).Trim()
  if (-not $currentBranch) {
    Write-Step "Reattaching checkout to branch $TargetBranch..."
    & git switch -C $TargetBranch --track origin/$TargetBranch
    if ($LASTEXITCODE -ne 0) { throw "git switch failed" }
  } elseif ($currentBranch -ne $TargetBranch) {
    Write-Step "Switching to branch $TargetBranch..."
    & git switch $TargetBranch
    if ($LASTEXITCODE -ne 0) {
      & git switch -C $TargetBranch --track origin/$TargetBranch
      if ($LASTEXITCODE -ne 0) { throw "git switch failed" }
    }
  }

  $counts = (& git rev-list --left-right --count HEAD...origin/$TargetBranch 2>$null).Trim()
  $ahead = 0
  $behind = 0
  if ($counts) {
    $parts = $counts -split "\s+"
    if ($parts.Length -ge 2) {
      [void][int]::TryParse($parts[0], [ref]$ahead)
      [void][int]::TryParse($parts[1], [ref]$behind)
    }
  }

  $trackedChanges = @(& git status --porcelain --untracked-files=no 2>$null | Where-Object { $_ -and $_.Trim() })
  $needsRepair = $ahead -gt 0 -or $trackedChanges.Count -gt 0

  if ($needsRepair) {
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backupBranch = "installer-backup-$timestamp"
    $patchPath = Join-Path $env:TEMP "codyx-install-backup-$timestamp.patch"
    Write-Warn "Existing install checkout has local tracked changes or divergent commits."
    Write-Warn "Creating backup branch $backupBranch and patch $patchPath before repair."
    & git branch $backupBranch | Out-Null
    if ($trackedChanges.Count -gt 0) {
      & git diff --binary > $patchPath
    }
  }

  if ($behind -gt 0 -or $needsRepair) {
    Write-Step "Syncing install checkout to origin/$TargetBranch..."
    & git reset --hard origin/$TargetBranch
    if ($LASTEXITCODE -ne 0) { throw "git reset failed" }
  } else {
    Write-Ok "Repository already up to date."
  }

  Enable-CodyxSlimCheckout
}

# Banner

Write-Host ""
Write-Host "  =======================================" -ForegroundColor Cyan
Write-Host "       codyx Windows Installer v$($Script:CODY_VERSION)" -ForegroundColor Cyan
Write-Host "  =======================================" -ForegroundColor Cyan
Write-Host "  $($Script:CREDITS)" -ForegroundColor DarkGray
Write-Host "  Mode: End-user (slim clone)" -ForegroundColor DarkGray

if (-not (Confirm-LicenseAgreement)) {
  exit 1
}

# Phase 1: Prerequisites

Write-Section 1 "Prerequisites"

if (-not (Test-Command git)) {
  $ok = Install-EnsureCommand "git" "Git.Git" "Git"
  if (-not $ok) { exit 1 }
}

# Proxy awareness: pass HTTP_PROXY env vars to git if set
$gitProxyArgs = ""
if ($env:HTTP_PROXY -or $env:HTTPS_PROXY) {
  $proxy = $env:HTTPS_PROXY -or $env:HTTP_PROXY
  Write-VerboseMsg "Detected proxy: $proxy"
  $env:GIT_HTTP_PROXY = $proxy
  $env:GIT_HTTPS_PROXY = $proxy
}

$bunExistedBefore = Test-Command bun
if (-not (Test-BunVersion)) {
  if (Test-Command bun) {
    Write-Warn "Bun 1.3.13 or newer is required. Updating Bun..."
  } else {
    Write-Step "Bun not found. Installing Bun..."
  }
  $windowsPowerShell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
  $null = & $windowsPowerShell -NoProfile -ExecutionPolicy Bypass -Command "irm https://bun.sh/install.ps1 | iex"
  if ($LASTEXITCODE -ne 0) { Write-Err "Bun installation failed."; exit 1 }
  $env:PATH = "$env:USERPROFILE\.bun\bin;$env:APPDATA\npm;$env:PATH"
  if (-not (Test-BunVersion)) { Write-Err "Bun 1.3.13+ is still unavailable after install."; exit 1 }
  if (-not $bunExistedBefore) {
    Add-CodyxManagedTool "bun" "path" "" (Join-Path $env:USERPROFILE ".bun") @((Join-Path $env:USERPROFILE ".bun\bin"))
  }
  Write-Ok "Bun 1.3.13+ installed."
} else {
  Write-Ok "Bun 1.3.13+ found."
}

# Collect username before email verification (used in verification email and memo.md)
Ensure-UserMemo -RootPath $Root

# Email verification intentionally runs after Git/Bun and before any remaining
# installation work. The -Yes switch never bypasses this gate.
Write-Step "Loading installer email verification..."
$verificationPath = if ($CheckoutRoot) {
  Join-Path $CheckoutRoot "script\installer-verification.ps1"
} else {
  $null
}
$verificationParameters = @{
  InstallerVersion = $Script:CODY_VERSION
  ServiceUrl = $Script:VERIFICATION_URL
  ReceiptPath = (Join-Path $env:LOCALAPPDATA "codyx-installer\verification.json")
  NonInteractive = -not (Test-InteractiveHost)
  DisplayName = $Script:CodyxUserName
}

if ($verificationPath -and (Test-Path -LiteralPath $verificationPath)) {
  $verificationResult = & $verificationPath @verificationParameters
} else {
  $verificationSource = $null
  $verificationScriptUrl = "https://raw.githubusercontent.com/mufasa1611/codyx-orchestrator/$Branch/script/installer-verification.ps1"
  try {
    Invoke-WithRetry {
      $Script:verificationSource = Invoke-RestMethod -Uri $verificationScriptUrl -TimeoutSec 20
    } "verification helper download"
  } catch {
    Write-Err "Could not load the installer verification step."
    Write-Err "Rerun the installer when GitHub is available, or decline the license later to clean Codyx-owned tools."
    exit 1
  }
  $verificationResult = & ([scriptblock]::Create($Script:verificationSource)) @verificationParameters
}

if (-not $verificationResult.Success) {
  exit 1
}

if (-not $NoProxy) {
  if (-not (Test-Command cloudflared)) {
    Write-Warn "cloudflared not found."
    $ok = Install-WithWinget "Cloudflare.cloudflared" "cloudflared"
    if ($ok -eq $true) {
      Add-CodyxManagedTool "cloudflared" "winget" "Cloudflare.cloudflared"
    } else {
      Write-Warn "cloudflared install skipped. Proxy tunnel won't auto-start."
    }
  } else {
    Write-Ok "cloudflared found."
  }
} else {
  Write-Ok "Proxy setup skipped (--NoProxy)."
}

# Phase 2: Clone or update repo

Write-Section 2 "Repository"

if ($IsStandalone) {
  if (Test-Path $Root) {
    if (Test-Path (Join-Path $Root "codyx.cmd")) {
      Write-Ok "Existing checkout found at $Root"
    } else {
      Remove-PartialInstallRoot $Root
    }
  }

  if (-not (Test-Path (Join-Path $Root "codyx.cmd"))) {
    $null = New-Item -ItemType Directory -Force -Path $DefaultParent
    $activity = "Cloning codyx repository"
    Write-Step "Cloning codyx (slim end-user clone) from $RepoUrl (branch: $Branch)..."
    Invoke-WithRetry {
      if (Test-Path (Join-Path $Root "codyx.cmd")) { return }
      if ((Test-Path $Root) -and (Get-ChildItem -LiteralPath $Root -Force | Select-Object -First 1)) {
        Remove-PartialInstallRoot $Root
      }
      & git clone --filter=blob:none --no-checkout --branch $Branch $RepoUrl $Root
      if ($LASTEXITCODE -ne 0) { throw "git clone failed" }
      Push-Location $Root
      try {
        & git sparse-checkout init --cone
        $sparsePaths = Get-CodyxSparseCheckoutPaths
        & git sparse-checkout set @sparsePaths
        if ($LASTEXITCODE -ne 0) { throw "git sparse-checkout set failed" }
        & git checkout $Branch
        if ($LASTEXITCODE -ne 0) { throw "git checkout failed" }
      } finally { Pop-Location }
    } "git clone (sparse)"
    git config --global --add safe.directory "$Root" 2>$null
    $Script:CreatedRepo = $true
    Write-Ok "Cloned to $Root"
  }

  # Update if .git exists
  if (Test-Path (Join-Path $Root ".git")) {
    Push-Location $Root
    Invoke-WithRetry {
      Sync-InstallCheckout $Branch
    } "git sync"
    Pop-Location
    Write-Ok "Repository up to date."
  }
} else {
  $Root = $CheckoutRoot
  Write-Ok "Running from local checkout: $Root"
}

Set-Location $Root

# Phase 3: Dependencies

Write-Section 3 "Dependencies"

Write-Step "Installing dependencies..."

$activity = "Installing npm/bun dependencies"
Write-Progress -Activity $activity -Status "Running bun install..." -PercentComplete 30
Invoke-WithRetry {
  $previousHusky = $env:HUSKY
  $env:HUSKY = "0"
  try {
    & bun install
    if ($LASTEXITCODE -ne 0) { throw "bun install failed" }
  } finally {
    $env:HUSKY = $previousHusky
  }
} "bun install"
Write-Progress -Activity $activity -Completed

if (Test-Path (Join-Path $Root ".git")) {
  Push-Location $Root
  & git diff --quiet -- bun.lock
  if ($LASTEXITCODE -ne 0) {
    & git restore --source=HEAD --worktree --staged -- bun.lock
    if ($LASTEXITCODE -eq 0) {
      Write-Ok "Restored tracked bun.lock after dependency install."
    }
  }
  Pop-Location
}

Write-Ok "Dependencies installed."

# Phase 4: Web UI

if (-not $NoBuild) {
  Write-Section 4 "Web UI"

  Write-Step "Building web UI..."
  Push-Location (Join-Path $Root "packages\app")
  $activity = "Building web UI"
  Write-Progress -Activity $activity -Status "Running bun run build..." -PercentComplete 50
  & bun run build
  if ($LASTEXITCODE -ne 0) {
    Write-Warn "Web UI build failed. Server will proxy to app.codyx.ai."
  } else {
    Write-Ok "Web UI built."
  }
  Write-Progress -Activity $activity -Completed
  Pop-Location
} else {
  Write-Ok "Web UI build skipped (--NoBuild)."
}

# Phase 5: Proxy

Write-Section 5 "Proxy configuration"

if (-not $NoProxy) {
  Write-Step "Configuring proxy settings..."
  $envFile = Join-Path $Root ".env.proxy"
  if (-not (Test-Path $envFile)) {
    @"
CODY_PROXY_ENABLED=0
HTTPS_PROXY=http://localhost:9999
HTTP_PROXY=http://localhost:9999
NO_PROXY=localhost,127.0.0.1,::1,192.168.68.68
"@ | Set-Content -Encoding ASCII -Path $envFile
    Write-Ok ".env.proxy created (proxy disabled by default)."
    Write-Warn "To enable: edit .env.proxy and set CODY_PROXY_ENABLED=1"
  } else {
    Write-Ok ".env.proxy already exists."
  }
} else {
  Write-Ok "Proxy configuration skipped (--NoProxy)."
}

# Phase 6: Model discovery

Write-Section 6 "Model discovery"

if (-not $NoScan) {
  $ollama = Get-CodyxOllamaCommand
  if (-not $ollama) {
    Write-Ok "Ollama not found. Local Ollama model discovery skipped."
    Write-Ok "Install Ollama later and run: .\script\discover-local-models.ps1 -Refresh"
  } elseif ($Yes) {
    Write-Ok "Ollama found: $ollama"
    Write-Step "Running model discovery..."
    & (Join-Path $Root "script\discover-local-models.ps1") -Root $Root -MaxSeconds 30
  } else {
    Write-Ok "Ollama found: $ollama"
    Write-Host ""
    $scan = Read-CodyxInstallerInput "Scan local Ollama models now? [y/N]"
    if ($scan -eq "y") {
      & (Join-Path $Root "script\discover-local-models.ps1") -Root $Root -MaxSeconds 30
    } else {
      Write-Ok "Model discovery skipped. Run later: .\script\discover-local-models.ps1 -Refresh"
    }
  }
} else {
  Write-Ok "Model discovery skipped (--NoScan)."
}

# Ensure default config
$generatedDir = Join-Path $Root ".cody\generated"
$null = New-Item -ItemType Directory -Force -Path $generatedDir
& (Join-Path $Root "script\ensure-default-config.ps1") -Root $Root

# Phase 7: Global command

Write-Section 7 "Global command"

Write-Step "Installing global codyx command..."
& (Join-Path $Root "script\install-codyx-global.ps1") -Root $Root
if ($LASTEXITCODE -ne 0) {
  Write-Err "Global command install failed."
  exit 1
}

# Phase 8: Health check

Write-Section 8 "Health check"

Write-Step "Running health check..."
$version = $null
try {
  $previousSkipUpdate = $env:CODY_SKIP_UPDATE_CHECK
  $env:CODY_SKIP_UPDATE_CHECK = "1"
  $versionCommand = "`"`"$GlobalCmd`" --version 2>&1`""
  $version = & $env:ComSpec /d /s /c $versionCommand | Select-Object -Last 1
  if ($LASTEXITCODE -ne 0 -or -not $version) { throw "global command failed" }
  Write-Ok "codyx version: $version"
} catch {
  Write-Err "The global codyx command could not start."
  exit 1
} finally {
  $env:CODY_SKIP_UPDATE_CHECK = $previousSkipUpdate
}

# Phase 9: Shortcuts

Write-Section 9 "Shortcuts"

Write-Step "Creating uninstall shortcut..."
$startMenu = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\codyx"
$null = New-Item -ItemType Directory -Force -Path $startMenu
$shortcutPath = Join-Path $startMenu "Uninstall codyx.lnk"
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "cmd.exe"
$shortcut.Arguments = "/c `"$GlobalCmd`" uninstall"
$shortcut.Description = "Uninstall codyx"
$shortcut.WorkingDirectory = $Root
$shortcut.Save()
Write-Ok "Uninstall shortcut created."

$markerPath = Join-Path $Root ".codyx-install-marker"
if (Test-Path -LiteralPath $markerPath) {
  try {
    $marker = Get-Content -LiteralPath $markerPath -Raw | ConvertFrom-Json
    if (-not $marker.shortcuts) { $marker | Add-Member -NotePropertyName shortcuts -NotePropertyValue @() }
    if (-not $marker.installed) { $marker | Add-Member -NotePropertyName installed -NotePropertyValue @() }
    if (-not ($marker.PSObject.Properties.Name -contains "managedTools")) {
      $marker | Add-Member -NotePropertyName managedTools -NotePropertyValue @()
    }
    if ($marker.shortcuts -notcontains $shortcutPath) { $marker.shortcuts += $shortcutPath }
    if ($marker.installed -notcontains $shortcutPath) { $marker.installed += $shortcutPath }
    $managedTools = Get-ObjectArray $marker.managedTools
    foreach ($tool in (Get-CodyxManagedTools)) {
      if (-not ($managedTools | Where-Object { Test-SameManagedTool $_ $tool } | Select-Object -First 1)) {
        $managedTools += $tool
      }
    }
    $marker.managedTools = $managedTools
    [System.IO.File]::WriteAllText(
      $markerPath,
      ($marker | ConvertTo-Json -Compress -Depth 8),
      [System.Text.UTF8Encoding]::new($false)
    )
  } catch {
    Write-Warn "Could not update install marker with uninstall shortcut."
  }
}
foreach ($path in @($InstallerMarkerPath, $markerPath)) {
  Write-CodyxAdminUninstallMarker $path
}
$markerRefreshScript = Join-Path $Root "script\update-install-marker.ps1"
if (Test-Path -LiteralPath $markerRefreshScript) {
  & $markerRefreshScript -Root $Root
}

# Done

Write-Host ""
Write-Host "  =======================================" -ForegroundColor Green
Write-Host "       codyx installed successfully!     " -ForegroundColor Green
Write-Host "  =======================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Installed to:  $Root" -ForegroundColor White
Write-Host "  Global command: codyx" -ForegroundColor White
if ($version) { Write-Host "  Version:       $version" -ForegroundColor White }
Write-Host ""
Write-Host "  Next steps:"
Write-Host "    codyx           Launch interactive menu (TUI)"
Write-Host "    codyx web       Start web UI in browser"
Write-Host "    codyx --help    See all commands"
Write-Host "    codyx doctor    Run diagnostics"
Write-Host ""
Write-Host "  $($Script:CREDITS)" -ForegroundColor DarkGray
Write-Host ""
