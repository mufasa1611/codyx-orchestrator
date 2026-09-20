#!/usr/bin/env pwsh
param(
  [string]$InstallRoot = "",
  [string]$Channel = $(if ($env:CODY_RELEASE_CHANNEL) { $env:CODY_RELEASE_CHANNEL } else { "stable" }),
  [string]$Repo = $(if ($env:CODY_RELEASE_REPO) { $env:CODY_RELEASE_REPO } else { "mufasa1611/codyx-orchestrator" }),
  [switch]$Launch,
  [switch]$Force,
  [switch]$Quiet
)

$ErrorActionPreference = "Stop"

function Write-RepairInfo($Message) {
  if (-not $Quiet) { Write-Host "[codyx-repair] $Message" -ForegroundColor Cyan }
}

function Write-RepairOk($Message) {
  if (-not $Quiet) { Write-Host "[ok] $Message" -ForegroundColor Green }
}

function Write-RepairWarn($Message) {
  if (-not $Quiet) { Write-Host "[warn] $Message" -ForegroundColor Yellow }
}

function Normalize-CodyxRepairChannel($Value) {
  $value = ([string]$Value).Trim().ToLowerInvariant()
  if ($value -in @("beta", "prerelease", "pre-release", "preview", "end-user-x", "dev")) { return "beta" }
  return "stable"
}

function Get-CodyxRepairInstallRoot {
  if ($InstallRoot) { return [System.IO.Path]::GetFullPath($InstallRoot) }
  if ($env:CODY_COMPILED_INSTALL_ROOT) { return [System.IO.Path]::GetFullPath($env:CODY_COMPILED_INSTALL_ROOT) }
  if ($env:CODYX_INSTALL_ROOT) { return [System.IO.Path]::GetFullPath($env:CODYX_INSTALL_ROOT) }
  return (Join-Path $env:LOCALAPPDATA "Programs\Codyx-Orchestrator")
}

function Get-CodyxRepairSha256($Path) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $stream = [System.IO.File]::OpenRead($Path)
    try {
      return ([BitConverter]::ToString($sha.ComputeHash($stream)).Replace("-", "").ToLowerInvariant())
    } finally {
      $stream.Dispose()
    }
  } finally {
    $sha.Dispose()
  }
}

function Invoke-CodyxRepairJson($Url) {
  return Invoke-RestMethod -Uri $Url -Headers @{ "User-Agent" = "codyx-launcher-repair" } -UseBasicParsing -TimeoutSec 30
}

function Get-CodyxRepairRelease($ChannelValue) {
  $wantBeta = (Normalize-CodyxRepairChannel $ChannelValue) -eq "beta"
  $releases = Invoke-CodyxRepairJson "https://api.github.com/repos/$Repo/releases?per_page=20"
  $release = @($releases | Where-Object {
    -not $_.draft -and (
      ($wantBeta -and $_.prerelease) -or
      ((-not $wantBeta) -and (-not $_.prerelease))
    )
  } | Select-Object -First 1)[0]
  if (-not $release -and $wantBeta) {
    Write-RepairWarn "No beta/pre-release launcher found. Falling back to stable."
    $release = @($releases | Where-Object { -not $_.draft -and -not $_.prerelease } | Select-Object -First 1)[0]
  }
  if (-not $release) { throw "No published release was found for $Repo." }
  return $release
}

function Save-CodyxRepairDownload($Url, $Path) {
  $dir = Split-Path -Parent $Path
  if ($dir) { $null = New-Item -ItemType Directory -Force -Path $dir }
  if (Test-Path -LiteralPath $Path) { Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue }
  Invoke-WebRequest -Uri $Url -OutFile $Path -Headers @{ "User-Agent" = "codyx-launcher-repair" } -UseBasicParsing -TimeoutSec 900
  $item = Get-Item -LiteralPath $Path -ErrorAction Stop
  if ($item.Length -le 0) { throw "Downloaded file is empty: $Path" }
}

function Repair-CodyxLauncher {
  $root = Get-CodyxRepairInstallRoot
  $launcher = Join-Path $root "codyx-installer-launcher.exe"
  $downloads = Join-Path $root "downloads"
  $updater = Join-Path $root "updater"
  $stamp = Join-Path $updater ".last-launcher-repair"
  $channelValue = Normalize-CodyxRepairChannel $Channel

  if (-not $Force -and $Quiet -and (Test-Path -LiteralPath $launcher) -and (Test-Path -LiteralPath $stamp)) {
    $age = (Get-Date) - (Get-Item -LiteralPath $stamp).LastWriteTime
    if ($age.TotalHours -lt 6) { return $launcher }
  }

  $release = Get-CodyxRepairRelease $channelValue
  Write-RepairInfo "Using release $($release.tag_name) on $channelValue channel."

  $manifestAsset = @($release.assets | Where-Object { $_.name -eq "codyx-release-manifest.json" } | Select-Object -First 1)[0]
  $manifestUrl = if ($manifestAsset -and $manifestAsset.browser_download_url) {
    [string]$manifestAsset.browser_download_url
  } else {
    "https://github.com/$Repo/releases/download/$($release.tag_name)/codyx-release-manifest.json"
  }
  $manifestPath = Join-Path $downloads "codyx-release-manifest.json"
  Save-CodyxRepairDownload $manifestUrl $manifestPath
  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  $asset = @($manifest.assets | Where-Object { $_.id -eq "installer.windows-x64" } | Select-Object -First 1)[0]
  if (-not $asset) { throw "Release manifest does not include installer.windows-x64." }

  $expected = ([string]$asset.sha256).ToLowerInvariant()
  if ((Test-Path -LiteralPath $launcher -PathType Leaf) -and ((Get-CodyxRepairSha256 $launcher) -eq $expected)) {
    Write-RepairOk "Launcher is already current."
    $null = New-Item -ItemType Directory -Force -Path $updater
    Set-Content -LiteralPath $stamp -Value ((Get-Date).ToUniversalTime().ToString("o")) -Encoding ASCII
    return $launcher
  }

  $downloadPath = Join-Path $downloads ([string]$asset.file)
  Write-RepairInfo "Downloading launcher $($asset.file)..."
  Save-CodyxRepairDownload ([string]$asset.url) $downloadPath
  $actual = Get-CodyxRepairSha256 $downloadPath
  if ($actual -ne $expected) {
    throw "Launcher SHA256 mismatch. Expected $expected, got $actual."
  }

  $running = @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
    try { $_.Path -and ([System.IO.Path]::GetFullPath($_.Path)).Equals([System.IO.Path]::GetFullPath($launcher), [StringComparison]::OrdinalIgnoreCase) } catch { $false }
  })
  foreach ($process in $running) {
    Write-RepairInfo "Stopping old launcher process $($process.Id)..."
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
  }

  $backup = "$launcher.old"
  if (Test-Path -LiteralPath $backup) { Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue }
  if (Test-Path -LiteralPath $launcher) {
    Move-Item -LiteralPath $launcher -Destination $backup -Force
  }
  Copy-Item -LiteralPath $downloadPath -Destination $launcher -Force
  $null = New-Item -ItemType Directory -Force -Path $updater
  Set-Content -LiteralPath $stamp -Value ((Get-Date).ToUniversalTime().ToString("o")) -Encoding ASCII
  Write-RepairOk "Launcher repaired: $launcher"
  return $launcher
}

try {
  $launcherPath = Repair-CodyxLauncher
  if ($Launch -and $launcherPath -and (Test-Path -LiteralPath $launcherPath)) {
    Start-Process -FilePath $launcherPath
  }
} catch {
  Write-RepairWarn $_.Exception.Message
  exit 1
}
