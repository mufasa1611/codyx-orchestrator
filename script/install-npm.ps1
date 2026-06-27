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
  [switch]$AcceptLicense,
  [switch]$Launch
)

$ErrorActionPreference = "Stop"
$LicenseUrl = "https://install.kingkung.men/license"
$InstallerStateDir = Join-Path $env:LOCALAPPDATA "codyx-installer"
$InstallerMarkerPath = Join-Path $InstallerStateDir "install-marker.json"

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

function Test-InteractiveHost {
  if (-not [Environment]::UserInteractive) { return $false }
  try { return -not [Console]::IsInputRedirected } catch { return $true }
}

function Get-ObjectArray($Value) {
  if ($null -eq $Value) { return @() }
  if ($Value -is [System.Array]) { return @($Value) }
  return @($Value)
}

function Read-CodyxMarker {
  if (-not (Test-Path -LiteralPath $InstallerMarkerPath)) { return $null }
  try {
    return Get-Content -LiteralPath $InstallerMarkerPath -Raw | ConvertFrom-Json
  } catch {
    return $null
  }
}

function Write-CodyxMarker($Marker) {
  $null = New-Item -ItemType Directory -Force -Path $InstallerStateDir
  [System.IO.File]::WriteAllText(
    $InstallerMarkerPath,
    ($Marker | ConvertTo-Json -Compress -Depth 8),
    [System.Text.UTF8Encoding]::new($false)
  )
}

function Set-CodyxMarkerValue($Marker, [string]$Name, $Value) {
  if ($Marker.PSObject.Properties.Name -contains $Name) {
    $Marker.$Name = $Value
    return
  }
  $Marker | Add-Member -NotePropertyName $Name -NotePropertyValue $Value
}

function Add-UniqueMarkerString($Marker, [string]$Name, [string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return }
  if (-not ($Marker.PSObject.Properties.Name -contains $Name)) {
    $Marker | Add-Member -NotePropertyName $Name -NotePropertyValue @()
  }
  $items = @(Get-ObjectArray $Marker.$Name)
  if ($items -notcontains $Value) { $Marker.$Name = @($items + $Value) }
}

function Update-CodyxNpmInstallMarker([string]$PackageSpec) {
  $marker = Read-CodyxMarker
  if (-not $marker) { $marker = [pscustomobject]@{} }

  Set-CodyxMarkerValue $marker "jsInstall" ([pscustomobject]@{
    manager = "npm"
    packageName = "codyx-ai"
    packageSpec = $PackageSpec
  })

  Add-UniqueMarkerString $marker "markerPaths" $InstallerMarkerPath

  $globalBin = Get-NpmGlobalBin
  if (-not $globalBin) { $globalBin = Join-Path $env:APPDATA "npm" }
  foreach ($name in @("codyx", "cody", "cody-x", "codyx-ai")) {
    foreach ($extension in @(".cmd", ".ps1", ".exe", "")) {
      $candidate = Join-Path $globalBin "$name$extension"
      if (Test-Path -LiteralPath $candidate) {
        Add-UniqueMarkerString $marker "shims" $candidate
        Add-UniqueMarkerString $marker "installed" $candidate
      }
    }
  }

  Write-CodyxMarker $marker
}

function Test-SameManagedTool($Left, $Right) {
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
  $marker = Read-CodyxMarker
  if (-not $marker) { $marker = [pscustomobject]@{} }
  if (-not ($marker.PSObject.Properties.Name -contains "managedTools")) {
    $marker | Add-Member -NotePropertyName managedTools -NotePropertyValue @()
  }
  $tools = Get-ObjectArray $marker.managedTools
  if (-not ($tools | Where-Object { Test-SameManagedTool $_ $tool } | Select-Object -First 1)) {
    $marker.managedTools = @($tools + $tool)
    Write-CodyxMarker $marker
  }
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

function Invoke-CodyxManagedToolCleanup {
  $marker = Read-CodyxMarker
  if (-not $marker -or -not ($marker.PSObject.Properties.Name -contains "managedTools")) { return }

  foreach ($tool in (Get-ObjectArray $marker.managedTools)) {
    $name = "$($tool.name)"
    $manager = "$($tool.manager)"
    $packageId = "$($tool.packageId)"
    $toolPath = "$($tool.path)"

    if ($manager -eq "path") {
      Remove-CodyxPath $toolPath "$name installed by codyx"
      continue
    }

    if ($manager -eq "winget" -and $packageId -and (Get-Command winget -ErrorAction SilentlyContinue)) {
      Write-Info "Removing $name installed by codyx with winget..."
      winget uninstall --id $packageId --exact --source winget --silent
      if ($LASTEXITCODE -eq 0) {
        Write-Ok "Removed $name installed by codyx."
      } else {
        Write-Warn "Could not remove $name with winget. Remove manually if needed: winget uninstall --id $packageId --exact"
      }
    }
  }
}

function Invoke-CodyxTraceCleanup {
  Write-Info "Cleaning codyx installation traces..."

  if (Get-Command npm -ErrorAction SilentlyContinue) {
    Write-Info "Removing global npm package codyx-ai if present..."
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

  $globalBin = Get-NpmGlobalBin
  if (-not $globalBin) { $globalBin = Join-Path $env:APPDATA "npm" }
  foreach ($name in @("codyx.cmd", "codyx.ps1", "codyx.exe", "codyx")) {
    Remove-CodyxPath (Join-Path $globalBin $name) "global shim"
  }

  Remove-CodyxPath (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\codyx") "Start Menu shortcuts"
  Invoke-CodyxManagedToolCleanup
  Remove-CodyxPath (Join-Path $env:LOCALAPPDATA "codyx") "source install root"
  Remove-CodyxPath $InstallerStateDir "installer verification data"

  Write-Ok "codyx cleanup finished."
}

function Confirm-LicenseAgreement {
  if ($AcceptLicense -or $env:CODY_ACCEPT_LICENSE -eq "1") {
    Write-Ok "License accepted through explicit installer option."
    return $true
  }

  Write-Host "License Agreement" -ForegroundColor Cyan
  Write-Host "codyx-orchestrator is distributed under the MIT License." -ForegroundColor White
  $esc = [char]27
  $ansiLink = "$esc]8;;$LicenseUrl$esc\\License: $LicenseUrl$esc]8;;$esc\\"
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
    $choice = (Read-Host "Type A to agree or D to disagree").Trim().ToLowerInvariant()
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

Write-Host ""
Write-Host "codyx npm installer for Windows" -ForegroundColor Cyan
Write-Host ""

$pkgSpec = if ($Version) { "codyx-ai@$Version" } else { "codyx-ai@$Tag" }
Write-Info "Target package: $pkgSpec"

if (-not (Confirm-LicenseAgreement)) {
  exit 1
}

Write-Host ""
Write-Info "Checking for Node.js 18+..."

$nodeOk = $false
$nodeExistedBefore = [bool](Get-Command node -ErrorAction SilentlyContinue)
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
    if (-not $nodeExistedBefore) {
      Add-CodyxManagedTool "node" "winget" "OpenJS.NodeJS.LTS"
    }
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
Update-CodyxNpmInstallMarker $pkgSpec

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
Write-Host "Update anytime:   npm install -g $pkgSpec"
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
