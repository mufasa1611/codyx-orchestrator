#!/usr/bin/env pwsh
<#
.SYNOPSIS
  End-user installer for Codyx-Orchestrator compiled release assets.
.DESCRIPTION
  Downloads a release manifest and compiled CLI zip from GitHub Releases,
  verifies SHA256, installs the binary into the current user's profile, creates
  user shims and shortcuts, refreshes uninstall markers, and optionally launches
  codyx. This installer intentionally does not clone the repository or install
  Git/Bun.
#>
[CmdletBinding(PositionalBinding = $false)]
param(
  [string]$Repo = $(if ($env:CODY_RELEASE_REPO) { $env:CODY_RELEASE_REPO } else { "mufasa1611/codyx-orchestrator" }),
  [string]$Version = $(if ($env:CODY_RELEASE_VERSION) { $env:CODY_RELEASE_VERSION } else { "" }),
  [string]$Channel = $(if ($env:CODY_RELEASE_CHANNEL) { $env:CODY_RELEASE_CHANNEL } else { "prod" }),
  [string]$Branch = $(if ($env:CODY_RELEASE_BRANCH) { $env:CODY_RELEASE_BRANCH } else { "dev" }),
  [string]$InstallRoot = $(if ($env:CODY_COMPILED_INSTALL_ROOT) { $env:CODY_COMPILED_INSTALL_ROOT } else { "" }),
  [string]$ManifestUrl = $(if ($env:CODY_RELEASE_MANIFEST_URL) { $env:CODY_RELEASE_MANIFEST_URL } else { "" }),
  [switch]$AcceptLicense,
  [switch]$Quiet,
  [switch]$NoPathUpdate,
  [switch]$NoShortcuts,
  [switch]$NoLaunch,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$CodyxArgs
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$Script:ProductName = "Codyx-Orchestrator"
$Script:LicenseUrl = "https://install.kingkung.men/license"
$Script:PrivacyUrl = "https://install.kingkung.men/privacy"
$Script:VerificationUrl = "https://install.kingkung.men"
$Script:CodyxUserName = ""

function Write-Info($Message) { if (-not $Quiet) { Write-Host "[codyx] $Message" -ForegroundColor Cyan } }
function Write-Ok($Message) { if (-not $Quiet) { Write-Host "[ok] $Message" -ForegroundColor Green } }
function Write-Warn($Message) { Write-Host "[warn] $Message" -ForegroundColor Yellow }

function Get-DefaultInstallRoot {
  $local = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { [Environment]::GetFolderPath("LocalApplicationData") }
  return (Join-Path $local "Programs\Codyx-Orchestrator")
}

function Get-ObjectArray($Value) {
  if ($null -eq $Value) { return @() }
  if ($Value -is [System.Array]) { return @($Value) }
  return @($Value)
}

function Confirm-License {
  if ($AcceptLicense -or $env:CODY_ACCEPT_LICENSE -eq "1") {
    Write-Ok "License accepted through explicit installer option."
    return
  }

  Write-Host ""
  Write-Host "  $($Script:ProductName) End-User Installer" -ForegroundColor Cyan
  Write-Host "  License: $($Script:LicenseUrl)" -ForegroundColor DarkGray
  Write-Host "  Privacy: $($Script:PrivacyUrl)" -ForegroundColor DarkGray
  Write-Host ""
  Write-Host "Type A to agree and continue, or D to disagree:" -ForegroundColor White
  $answer = Read-Host "> "
  if ($answer -notmatch '^(A|a)$') {
    throw "License was not accepted."
  }
}

function Test-InteractiveHost {
  if ($env:CODY_LAUNCHER_UI -eq "1") { return $true }
  if (-not [Environment]::UserInteractive) { return $false }
  try { return -not [Console]::IsInputRedirected } catch { return $true }
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

function Ensure-UserMemo {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RootPath
  )

  $null = New-Item -ItemType Directory -Force -Path $RootPath
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

  Write-Info "Saving your username to memo.md..."
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

function Invoke-InstallerVerification {
  param(
    [Parameter(Mandatory = $true)]
    [string]$InstallerVersion
  )

  Write-Info "Loading installer email verification..."
  $local = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { [Environment]::GetFolderPath("LocalApplicationData") }
  $receiptPath = Join-Path (Join-Path $local "codyx-installer") "verification.json"
  $parameters = @{
    InstallerVersion = $InstallerVersion
    ServiceUrl = $Script:VerificationUrl
    ReceiptPath = $receiptPath
    NonInteractive = -not (Test-InteractiveHost)
    DisplayName = $Script:CodyxUserName
  }

  $localPath = Join-Path $PSScriptRoot "installer-verification.ps1"
  if (Test-Path -LiteralPath $localPath) {
    $result = & $localPath @parameters
  } else {
    $url = "https://raw.githubusercontent.com/$Repo/$Branch/script/installer-verification.ps1"
    try {
      $source = Invoke-RestMethod -Uri $url -TimeoutSec 20 -Headers @{ "User-Agent" = "codyx-compiled-installer" } -UseBasicParsing
    } catch {
      throw "Could not load the installer verification step. Check your connection and run the installer again."
    }
    $result = & ([scriptblock]::Create($source)) @parameters
  }

  if (-not $result.Success) {
    if ($result.Status -eq "rate_limited") {
      $wait = if ($result.RetryAfter) { " Try again after $($result.RetryAfter) seconds." } else { " Try again later." }
      throw "Email verification is temporarily rate limited.$wait"
    }
    if ($result.Message) {
      throw "Email verification failed: $($result.Message)"
    }
    throw "Email verification is required before installation can continue."
  }
}

function Invoke-JsonRequest($Url) {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $headers = @{ "User-Agent" = "codyx-compiled-installer" }
  $token = $env:GITHUB_TOKEN
  if (-not $token) { $token = $env:GH_TOKEN }
  if ($token) {
    $headers["Authorization"] = "Bearer $token"
  }
  return Invoke-RestMethod -Uri $Url -Headers $headers -UseBasicParsing
}

function Normalize-ReleaseChannel($Value) {
  $channelValue = ([string]$Value).Trim().ToLowerInvariant()
  if ($channelValue -in @("beta", "prerelease", "pre-release", "preview", "end-user-x", "dev")) { return "beta" }
  return "prod"
}

function Get-BranchForReleaseChannel($Value) {
  if ((Normalize-ReleaseChannel $Value) -eq "beta") { return "end-user-x" }
  return "codyx/end-user"
}

function Write-CodyxUpdateChannelState($Value) {
  try {
    $normalized = Normalize-ReleaseChannel $Value
    $local = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { [Environment]::GetFolderPath("LocalApplicationData") }
    $statePath = Join-Path (Join-Path $local "codyx") "update-channel.json"
    $stateDir = Split-Path -Parent $statePath
    if ($stateDir) { $null = New-Item -ItemType Directory -Force -Path $stateDir }
    [pscustomobject]@{
      channel = if ($normalized -eq "beta") { "beta" } else { "stable" }
      branch = Get-BranchForReleaseChannel $normalized
      updatedAt = (Get-Date).ToUniversalTime().ToString("o")
    } | ConvertTo-Json -Compress -Depth 4 | Set-Content -LiteralPath $statePath -Encoding UTF8
  } catch {}
}

function Compare-Versions($v1, $v2) {
  $v1 = $v1.TrimStart('v')
  $v2 = $v2.TrimStart('v')
  $p1 = $v1 -split '-'
  $p2 = $v2 -split '-'
  $base1 = [version]$p1[0]
  $base2 = [version]$p2[0]
  $cmp = $base1.CompareTo($base2)
  if ($cmp -ne 0) { return $cmp }
  if ($p1.Length -eq 1 -and $p2.Length -eq 1) { return 0 }
  if ($p1.Length -eq 1) { return 1 }
  if ($p2.Length -eq 1) { return -1 }
  return [string]::Compare($p1[1], $p2[1], [StringComparison]::OrdinalIgnoreCase)
}

function Get-NewestPublishedRelease([switch]$PrereleaseOnly, [switch]$StableOnly) {
  try {
    $feedUrl = "https://github.com/$Repo/releases.atom"
    $xmlText = (Invoke-WebRequest -Uri $feedUrl -Headers @{ "User-Agent" = "codyx-compiled-installer" } -UseBasicParsing -TimeoutSec 10).Content
    if ($xmlText) {
      $xml = [xml]$xmlText
      $entries = $xml.feed.entry
      if ($entries) {
        $bestRelease = $null
        foreach ($entry in $entries) {
          $tag = $entry.title.Trim()
          if ($tag -notmatch '^v\d') { continue }
          $isPrerelease = $tag.Contains("-")
          if ($PrereleaseOnly -and -not $isPrerelease) { continue }
          if ($StableOnly -and $isPrerelease) { continue }
          
          if (-not $bestRelease -or (Compare-Versions $tag $bestRelease.tag_name) -gt 0) {
            $bestRelease = [PSCustomObject]@{
              tag_name = $tag
              prerelease = $isPrerelease
              draft = $false
            }
          }
        }
        if ($bestRelease) { return $bestRelease }
      }
    }
  } catch {
    Write-Warning "Failed to fetch releases from Atom feed, falling back to REST API..."
  }

  $releases = Invoke-JsonRequest "https://api.github.com/repos/$Repo/releases"
  $release = @(
    $releases |
      Where-Object {
        (-not $_.draft) -and
        ((-not $PrereleaseOnly) -or $_.prerelease) -and
        ((-not $StableOnly) -or (-not $_.prerelease))
      } |
      Select-Object -First 1
  )[0]
  if ($PrereleaseOnly -and -not $release) { return $null }
  if (-not $release) {
    throw "No published GitHub Release was found for $Repo. Draft releases cannot be used by normal users. Publish a release that includes codyx-release-manifest.json and the compiled CLI assets, then run this installer again."
  }
  return $release
}

function Get-StableLatestRelease {
  try {
    $feedUrl = "https://github.com/$Repo/releases.atom"
    $xmlText = (Invoke-WebRequest -Uri $feedUrl -Headers @{ "User-Agent" = "codyx-compiled-installer" } -UseBasicParsing -TimeoutSec 10).Content
    if ($xmlText) {
      $xml = [xml]$xmlText
      $entries = $xml.feed.entry
      if ($entries) {
        $bestRelease = $null
        foreach ($entry in $entries) {
          $tag = $entry.title.Trim()
          if ($tag -notmatch '^v\d') { continue }
          if (-not $tag.Contains("-")) {
            if (-not $bestRelease -or (Compare-Versions $tag $bestRelease.tag_name) -gt 0) {
              $bestRelease = [PSCustomObject]@{
                tag_name = $tag
                prerelease = $false
                draft = $false
              }
            }
          }
        }
        if ($bestRelease) { return $bestRelease }
      }
    }
  } catch {}

  try {
    return Invoke-JsonRequest "https://api.github.com/repos/$Repo/releases/latest"
  } catch {
    Write-Warn "No stable latest release was found through GitHub latest. Trying newest published stable release..."
    return Get-NewestPublishedRelease -StableOnly
  }
}

function Get-ReleaseInfo {
  if ($Version) {
    $tag = if ($Version.StartsWith("v")) { $Version } else { "v$Version" }
    try {
      return Invoke-JsonRequest "https://api.github.com/repos/$Repo/releases/tags/$tag"
    } catch {
      throw "GitHub Release $tag was not found for $Repo, or it is still a draft. Publish that release first, then run this installer again."
    }
  }

  if ((Normalize-ReleaseChannel $Channel) -eq "beta") {
    $prerelease = Get-NewestPublishedRelease -PrereleaseOnly
    if ($prerelease) { return $prerelease }
    Write-Warn "No beta/pre-release was found. Falling back to latest stable release."
    return Get-StableLatestRelease
  }

  return Get-StableLatestRelease
}

function Save-Download($Url, $Path) {
  $parent = Split-Path -Parent $Path
  if ($parent) { $null = New-Item -ItemType Directory -Force -Path $parent }

  $localSource = $null
  if ($Url -match '^file://') {
    $localSource = ([Uri]$Url).LocalPath
  } elseif (Test-Path -LiteralPath $Url -PathType Leaf) {
    $localSource = $Url
  }

  if ($localSource) {
    Copy-Item -LiteralPath $localSource -Destination $Path -Force
    return
  }

  $headers = @{ "User-Agent" = "codyx-compiled-installer" }
  $maxAttempts = 3
  $idleTimeoutSeconds = 45
  $overallTimeoutSeconds = 900
  $buffer = New-Object byte[] (1024 * 1024)

  for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    if (Test-Path -LiteralPath $Path) {
      Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
    }

    try {
      Add-Type -AssemblyName System.Net.Http
      $handler = [System.Net.Http.HttpClientHandler]::new()
      $handler.AllowAutoRedirect = $true
      $client = [System.Net.Http.HttpClient]::new($handler)
      try {
        $client.Timeout = [TimeSpan]::FromSeconds($overallTimeoutSeconds)
        $client.DefaultRequestHeaders.UserAgent.ParseAdd("codyx-compiled-installer")
        $request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Get, $Url)
        $response = $client.SendAsync($request, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
        if (-not $response.IsSuccessStatusCode) {
          throw "HTTP $([int]$response.StatusCode) $($response.ReasonPhrase)"
        }

        $total = $response.Content.Headers.ContentLength
        $input = $response.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
        $output = [System.IO.File]::Open($Path, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
        try {
          $downloaded = [int64]0
          $lastProgress = Get-Date
          $lastLogMB = -1
          while ($true) {
            $readTask = $input.ReadAsync($buffer, 0, $buffer.Length)
            if (-not $readTask.Wait([TimeSpan]::FromSeconds($idleTimeoutSeconds))) {
              throw "Download stalled for more than $idleTimeoutSeconds seconds."
            }
            $read = $readTask.Result
            if ($read -le 0) { break }

            $output.Write($buffer, 0, $read)
            $downloaded += $read
            $lastProgress = Get-Date
            $downloadedMB = [math]::Floor($downloaded / 1MB)
            if ($downloadedMB -ne $lastLogMB -and ($downloadedMB % 10 -eq 0 -or $downloadedMB -lt 10)) {
              $lastLogMB = $downloadedMB
              if ($total) {
                $totalMB = [math]::Round($total / 1MB, 1)
                Write-Info ("Downloaded {0} MB of {1} MB..." -f $downloadedMB, $totalMB)
              } else {
                Write-Info ("Downloaded {0} MB..." -f $downloadedMB)
              }
            }
          }
        } finally {
          $output.Dispose()
          $input.Dispose()
        }

        $item = Get-Item -LiteralPath $Path -ErrorAction Stop
        if ($item.Length -le 0) { throw "Downloaded file is empty." }
        if ($total -and $item.Length -ne $total) {
          throw "Downloaded $($item.Length) bytes, expected $total bytes."
        }
        return
      } finally {
        $client.Dispose()
        $handler.Dispose()
      }
    } catch {
      Write-Warn "Download attempt $attempt/$maxAttempts failed: $($_.Exception.Message)"
      if (Test-Path -LiteralPath $Path) {
        Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
      }
      if ($attempt -lt $maxAttempts) {
        Start-Sleep -Seconds ([math]::Min(10, 2 * $attempt))
      }
    }
  }

  try {
    if (Get-Command Start-BitsTransfer -ErrorAction SilentlyContinue) {
      Write-Info "Trying BITS download fallback..."
      Start-BitsTransfer -Source $Url -Destination $Path -ErrorAction Stop
      if ((Get-Item -LiteralPath $Path -ErrorAction Stop).Length -gt 0) { return }
    }
  } catch {
    Write-Warn "BITS download fallback failed: $($_.Exception.Message)"
  }

  try {
    Write-Info "Trying WebClient download fallback..."
    $webClient = [System.Net.WebClient]::new()
    try {
      foreach ($key in $headers.Keys) { $webClient.Headers.Add($key, $headers[$key]) }
      $webClient.DownloadFile($Url, $Path)
      if ((Get-Item -LiteralPath $Path -ErrorAction Stop).Length -gt 0) { return }
    } finally {
      $webClient.Dispose()
    }
  } catch {
    Write-Warn "WebClient download fallback failed: $($_.Exception.Message)"
  }

  throw "Could not download $Url after $maxAttempts attempts and fallback download methods."
}

function Get-ReleaseManifest($Release) {
  $temp = Join-Path ([System.IO.Path]::GetTempPath()) ("codyx-release-" + [Guid]::NewGuid().ToString("N"))
  $null = New-Item -ItemType Directory -Force -Path $temp
  $manifestPath = Join-Path $temp "codyx-release-manifest.json"

  $url = $ManifestUrl
  if ($url -and (Test-Path -LiteralPath $url -PathType Leaf)) {
    $manifestPath = [System.IO.Path]::GetFullPath($url)
    return [pscustomobject]@{
      Path = $manifestPath
      Data = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
      Temp = $temp
      SourceDir = Split-Path -Parent $manifestPath
    }
  }

  if (-not $url) {
    if ($Release.assets) {
      $asset = @($Release.assets | Where-Object { $_.name -eq "codyx-release-manifest.json" } | Select-Object -First 1)[0]
      if ($asset) {
        $url = $asset.browser_download_url
      }
    }
    if (-not $url -and $Release.tag_name) {
      $url = "https://github.com/$Repo/releases/download/$($Release.tag_name)/codyx-release-manifest.json"
    }
    if (-not $url) {
      throw "Release $($Release.tag_name) does not contain codyx-release-manifest.json. Run the publish workflow for the compiled end-user installer and upload the manifest before distributing this installer."
    }
  }

  try {
    Save-Download $url $manifestPath
  } catch {
    throw "Could not download codyx-release-manifest.json from $url. Publish the release manifest first, then run this installer again."
  }
  try {
    return [pscustomobject]@{
      Path = $manifestPath
      Data = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
      Temp = $temp
      SourceDir = Split-Path -Parent $manifestPath
    }
  } catch {
    Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
    throw
  }
}

function Get-WindowsAssetId {
  $arch = $env:PROCESSOR_ARCHITECTURE
  if ($arch -match "ARM64") { return "cli.windows-arm64" }
  return "cli.windows-x64"
}

function Get-Sha256($Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Read-InstallMarker($Root) {
  $local = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { [Environment]::GetFolderPath("LocalApplicationData") }
  $paths = @(
    (Join-Path $Root ".codyx-install-marker"),
    (Join-Path (Join-Path $local "codyx-installer") "install-marker.json")
  )
  foreach ($path in $paths) {
    if (-not (Test-Path -LiteralPath $path)) { continue }
    try {
      return Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
    } catch {
      Write-Warn "Could not read install marker: $path"
    }
  }
}

function Test-InstalledAssetCurrent($Root, $CurrentDir, $Manifest, $Asset) {
  $exe = Join-Path $CurrentDir "codyx.exe"
  if (-not (Test-Path -LiteralPath $exe)) { return $false }

  $marker = Read-InstallMarker $Root
  if (-not $marker -or -not $marker.compiledInstall) { return $false }

  $installed = $marker.compiledInstall
  return (
    [string]$installed.version -eq [string]$Manifest.version -and
    [string]$installed.assetId -eq [string]$Asset.id -and
    ([string]$installed.sha256).ToLowerInvariant() -eq ([string]$Asset.sha256).ToLowerInvariant()
  )
}

function Expand-CodyxZip($ZipPath, $CurrentDir) {
  $tempExtract = Join-Path ([System.IO.Path]::GetTempPath()) ("codyx-extract-" + [Guid]::NewGuid().ToString("N"))
  try {
    $null = New-Item -ItemType Directory -Force -Path $tempExtract
    Expand-Archive -LiteralPath $ZipPath -DestinationPath $tempExtract -Force

    $binary = Get-ChildItem -LiteralPath $tempExtract -Recurse -File -Filter "codyx.exe" -ErrorAction SilentlyContinue |
      Select-Object -First 1
    if (-not $binary) { throw "The compiled release archive does not contain codyx.exe." }

    $nextDir = "$CurrentDir.next"
    $backupDir = "$CurrentDir.previous"
    Remove-Item -LiteralPath $nextDir -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $backupDir -Recurse -Force -ErrorAction SilentlyContinue
    $null = New-Item -ItemType Directory -Force -Path $nextDir

    Get-ChildItem -LiteralPath $binary.DirectoryName -Force | ForEach-Object {
      Copy-Item -LiteralPath $_.FullName -Destination $nextDir -Recurse -Force
    }
    if (Test-Path -LiteralPath $CurrentDir) {
      Move-Item -LiteralPath $CurrentDir -Destination $backupDir -Force
    }
    Move-Item -LiteralPath $nextDir -Destination $CurrentDir -Force
    Remove-Item -LiteralPath $backupDir -Recurse -Force -ErrorAction SilentlyContinue
  } catch {
    if ((Test-Path -LiteralPath "$CurrentDir.previous") -and -not (Test-Path -LiteralPath $CurrentDir)) {
      Move-Item -LiteralPath "$CurrentDir.previous" -Destination $CurrentDir -Force -ErrorAction SilentlyContinue
    }
    throw
  } finally {
    Remove-Item -LiteralPath $tempExtract -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath "$CurrentDir.next" -Recurse -Force -ErrorAction SilentlyContinue
  }
}

function Add-UserPathEntry($Path) {
  if (-not $Path) { return }
  $full = [System.IO.Path]::GetFullPath($Path).TrimEnd("\")
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $items = @()
  if ($userPath) { $items = @($userPath -split ";" | Where-Object { $_ -and $_.Trim() }) }
  foreach ($item in $items) {
    $expanded = [Environment]::ExpandEnvironmentVariables($item)
    try { $normalized = [System.IO.Path]::GetFullPath($expanded).TrimEnd("\") } catch { $normalized = $expanded.TrimEnd("\") }
    if ($normalized.Equals($full, [StringComparison]::OrdinalIgnoreCase)) {
      if (($env:PATH -split ";") -notcontains $full) { $env:PATH = "$full;$env:PATH" }
      return
    }
  }
  [Environment]::SetEnvironmentVariable("Path", (@($items + $full) -join ";"), "User")
  $env:PATH = "$full;$env:PATH"
}

function Write-TextFile($Path, $Content) {
  $dir = Split-Path -Parent $Path
  if ($dir) { $null = New-Item -ItemType Directory -Force -Path $dir }
  [System.IO.File]::WriteAllText($Path, $Content, [System.Text.UTF8Encoding]::new($false))
}

function Quote-PowerShellLiteral($Value) {
  return "'" + ([string]$Value).Replace("'", "''") + "'"
}

function New-Shims($BinDir, $CurrentDir, $Root, $UpdaterScript) {
  $exe = Join-Path $CurrentDir "codyx.exe"
  $cmd = Join-Path $BinDir "codyx.cmd"
  $ps1 = Join-Path $BinDir "codyx.ps1"
  $launcherCmd = Join-Path $BinDir "codyx-launcher.cmd"
  $launcherPs1 = Join-Path $BinDir "codyx-launcher.ps1"
  $repairCmd = Join-Path $BinDir "codyx-repair.cmd"
  $repairPs1 = Join-Path $BinDir "codyx-repair.ps1"
  $repairScript = Join-Path (Split-Path -Parent $UpdaterScript) "repair-launcher.ps1"
  $launcherExe = Join-Path $Root "codyx-installer-launcher.exe"

  $cmdContent = @"
@echo off
setlocal
set "CODY_COMPILED_INSTALL_ROOT=$Root"
set "CODYX_INSTALL_ROOT=$Root"
set "CODY_INSTALL_ROOT=$Root"
set "CODY_RELEASE_REPO=$Repo"
set "CODY_RELEASE_CHANNEL=$Channel"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$ps1" %*
exit /b %errorlevel%
"@

  $rootLiteral = Quote-PowerShellLiteral $Root
  $repoLiteral = Quote-PowerShellLiteral $Repo
  $channelLiteral = Quote-PowerShellLiteral $Channel
  $updaterLiteral = Quote-PowerShellLiteral $UpdaterScript
  $repairLiteral = Quote-PowerShellLiteral $repairScript
  $launcherLiteral = Quote-PowerShellLiteral $launcherExe
  $exeLiteral = Quote-PowerShellLiteral $exe
  $ps1Content = @"
`$env:CODY_COMPILED_INSTALL_ROOT = $rootLiteral
`$env:CODYX_INSTALL_ROOT = $rootLiteral
`$env:CODY_INSTALL_ROOT = $rootLiteral
`$env:CODY_RELEASE_REPO = $repoLiteral
`$env:CODY_RELEASE_CHANNEL = $channelLiteral
`$skipUpdate = `$env:CODYX_SKIP_UPDATE -eq "1" -or (`$args.Count -gt 0 -and `$args[0] -ieq "uninstall")
function Get-CodyxShimBranch {
  `$branch = `$env:CODY_RELEASE_BRANCH
  if (-not [string]::IsNullOrWhiteSpace(`$branch)) { return `$branch }
  `$channel = [string]`$env:CODY_RELEASE_CHANNEL
  `$channel = `$channel.Trim().ToLowerInvariant()
  if (`$channel -in @("beta", "prerelease", "pre-release", "preview", "end-user-x", "dev")) { return "end-user-x" }
  return "codyx/end-user"
}
function Update-CodyxInstalledUpdater {
  param([string]`$UpdaterPath)
  if (`$env:CODYX_SKIP_UPDATER_REFRESH -eq "1") { return }
  try {
    `$updaterDir = Split-Path -Parent `$UpdaterPath
    if (-not `$updaterDir) { return }
    `$stamp = Join-Path `$updaterDir ".last-refresh"
    if (`$env:CODYX_FORCE_UPDATER_REFRESH -ne "1" -and (Test-Path -LiteralPath `$stamp)) {
      `$age = (Get-Date) - (Get-Item -LiteralPath `$stamp).LastWriteTime
      if (`$age.TotalHours -lt 6) { return }
    }
    `$repo = [string]`$env:CODY_RELEASE_REPO
    if ([string]::IsNullOrWhiteSpace(`$repo)) { `$repo = "mufasa1611/codyx-orchestrator" }
    `$branch = Get-CodyxShimBranch
    `$encodedBranch = [System.Uri]::EscapeDataString(`$branch)
    `$url = "https://raw.githubusercontent.com/`$repo/`$encodedBranch/script/install-compiled.ps1"
    `$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("codyx-updater-" + [System.Guid]::NewGuid().ToString("N") + ".ps1")
    try {
      Invoke-WebRequest -Uri `$url -OutFile `$tmp -Headers @{ "User-Agent" = "codyx-updater-bootstrap" } -UseBasicParsing -TimeoutSec 30
      `$download = Get-Item -LiteralPath `$tmp -ErrorAction Stop
      if (`$download.Length -gt 10000) {
        Copy-Item -LiteralPath `$tmp -Destination `$UpdaterPath -Force
      }
    } finally {
      if (Test-Path -LiteralPath `$tmp) { Remove-Item -LiteralPath `$tmp -Force -ErrorAction SilentlyContinue }
      Set-Content -LiteralPath `$stamp -Value ((Get-Date).ToUniversalTime().ToString("o")) -Encoding ASCII -ErrorAction SilentlyContinue
    }
  } catch {}
}
if (-not `$skipUpdate) {
  if (Test-Path -LiteralPath $repairLiteral) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $repairLiteral -Quiet -Channel $channelLiteral
  }
  Update-CodyxInstalledUpdater -UpdaterPath $updaterLiteral
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $updaterLiteral -AcceptLicense -Quiet -NoLaunch
  if (`$LASTEXITCODE -ne 0) { exit `$LASTEXITCODE }
}
if (`$args.Count -gt 0 -and `$args[0] -ieq "uninstall") {
  Set-Location -LiteralPath ([System.IO.Path]::GetTempPath())
}
`$env:CODY_DISABLE_AUTOUPDATE = "1"
& $exeLiteral @args
exit `$LASTEXITCODE
"@

  $launcherCmdContent = @"
@echo off
setlocal
set "CODY_COMPILED_INSTALL_ROOT=$Root"
set "CODYX_INSTALL_ROOT=$Root"
set "CODY_INSTALL_ROOT=$Root"
set "CODY_RELEASE_REPO=$Repo"
set "CODY_RELEASE_CHANNEL=$Channel"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$launcherPs1" %*
exit /b %errorlevel%
"@

  $launcherPs1Content = @"
`$env:CODY_COMPILED_INSTALL_ROOT = $rootLiteral
`$env:CODYX_INSTALL_ROOT = $rootLiteral
`$env:CODY_INSTALL_ROOT = $rootLiteral
`$env:CODY_RELEASE_REPO = $repoLiteral
`$env:CODY_RELEASE_CHANNEL = $channelLiteral
if (Test-Path -LiteralPath $repairLiteral) {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $repairLiteral -Quiet -Channel $channelLiteral
}
if (Test-Path -LiteralPath $launcherLiteral) {
  Start-Process -FilePath $launcherLiteral
  exit 0
}
Write-Host "Cannot find Codyx launcher: $launcherLiteral"
exit 1
"@

  $repairCmdContent = @"
@echo off
setlocal
set "CODY_COMPILED_INSTALL_ROOT=$Root"
set "CODYX_INSTALL_ROOT=$Root"
set "CODY_INSTALL_ROOT=$Root"
set "CODY_RELEASE_REPO=$Repo"
set "CODY_RELEASE_CHANNEL=$Channel"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$repairPs1" %*
exit /b %errorlevel%
"@

  $repairPs1Content = @"
`$env:CODY_COMPILED_INSTALL_ROOT = $rootLiteral
`$env:CODYX_INSTALL_ROOT = $rootLiteral
`$env:CODY_INSTALL_ROOT = $rootLiteral
`$env:CODY_RELEASE_REPO = $repoLiteral
`$env:CODY_RELEASE_CHANNEL = $channelLiteral
if (-not (Test-Path -LiteralPath $repairLiteral)) {
  Write-Host "Cannot find Codyx repair script: $repairLiteral"
  exit 1
}
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $repairLiteral -Channel $channelLiteral @args
exit `$LASTEXITCODE
"@

  Write-TextFile $cmd ($cmdContent.TrimStart() + "`r`n")
  Write-TextFile $ps1 ($ps1Content.TrimStart() + "`r`n")
  Write-TextFile $launcherCmd ($launcherCmdContent.TrimStart() + "`r`n")
  Write-TextFile $launcherPs1 ($launcherPs1Content.TrimStart() + "`r`n")
  Write-TextFile $repairCmd ($repairCmdContent.TrimStart() + "`r`n")
  Write-TextFile $repairPs1 ($repairPs1Content.TrimStart() + "`r`n")
  return @($cmd, $ps1, $launcherCmd, $launcherPs1, $repairCmd, $repairPs1)
}

function New-Shortcut($Path, $Target, $Arguments, $WorkingDirectory) {
  try {
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($Path)
    $shortcut.TargetPath = $Target
    $shortcut.Arguments = $Arguments
    $shortcut.WorkingDirectory = $WorkingDirectory
    $shortcut.Save()
  } catch {
    Write-Warn "Could not create shortcut: $Path"
  }
}

function Write-Marker($Root, $VersionValue, $Asset, $Installed, $PathAdds, $Shims, $Shortcuts) {
  $local = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { [Environment]::GetFolderPath("LocalApplicationData") }
  $stateDir = Join-Path $local "codyx-installer"
  $receiptPath = Join-Path $stateDir "verification.json"
  $markerPaths = @(
    (Join-Path $stateDir "install-marker.json"),
    (Join-Path $Root ".codyx-install-marker")
  )
  $marker = [ordered]@{
    root = $Root
    compiledInstall = @{
      product = $Script:ProductName
      version = $VersionValue
      repo = $Repo
      channel = $Channel
      assetId = $Asset.id
      assetFile = $Asset.file
      sha256 = $Asset.sha256
    }
    installed = @($Installed | Where-Object { $_ } | Select-Object -Unique)
    pathAdds = @($PathAdds | Where-Object { $_ } | Select-Object -Unique)
    shortcuts = @($Shortcuts | Where-Object { $_ } | Select-Object -Unique)
    shims = @($Shims | Where-Object { $_ } | Select-Object -Unique)
    markerPaths = @($markerPaths)
    managedTools = @()
    adminUninstall = @{
      enabled = $true
      serviceUrl = "https://install.kingkung.men"
      receiptPath = $receiptPath
      commandsPath = "/v1/commands"
      acknowledgePath = "/v1/acknowledge"
      completePath = "/v1/complete"
    }
    updatedAt = (Get-Date).ToUniversalTime().ToString("o")
  }

  if (Test-Path -LiteralPath $receiptPath) {
    try {
      $verification = Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
      if ($verification -and $verification.install_id) {
        $marker["verification"] = @{
          installId = [string]$verification.install_id
          receiptPath = $receiptPath
          serverUrl = if ($verification.server_url) { [string]$verification.server_url } else { $Script:VerificationUrl }
        }
      }
    } catch {}
  }

  foreach ($markerPath in $markerPaths) {
    Write-TextFile $markerPath (($marker | ConvertTo-Json -Compress -Depth 10) + "`n")
  }
}

function Install-CodyxCompiled {
  Confirm-License

  $script:Channel = Normalize-ReleaseChannel $Channel
  if (-not $env:CODY_RELEASE_BRANCH -and ([string]::IsNullOrWhiteSpace($Branch) -or $Branch -eq "dev")) {
    $Branch = Get-BranchForReleaseChannel $script:Channel
  }
  Write-CodyxUpdateChannelState $script:Channel
  if (-not $InstallRoot) { $InstallRoot = Get-DefaultInstallRoot }
  $InstallRoot = [System.IO.Path]::GetFullPath($InstallRoot)
  $currentDir = Join-Path $InstallRoot "current"
  $binDir = Join-Path $InstallRoot "bin"
  $downloadsDir = Join-Path $InstallRoot "downloads"
  $updaterDir = Join-Path $InstallRoot "updater"
  $memoPath = Join-Path $InstallRoot "memo.md"
  $updaterScript = Join-Path $updaterDir "install-compiled.ps1"
  $startMenuDir = Join-Path ([Environment]::GetFolderPath("ApplicationData")) "Microsoft\Windows\Start Menu\Programs\Codyx-Orchestrator"

  if (-not $Quiet) {
    Write-Host ""
    Write-Host "  $($Script:ProductName) Compiled Installer" -ForegroundColor Cyan
    Write-Host "  Repo:   $Repo" -ForegroundColor DarkGray
    Write-Host "  Root:   $InstallRoot" -ForegroundColor DarkGray
    Write-Host "  Mode:   Compiled release assets" -ForegroundColor DarkGray
    Write-Host ""
  }

  $release = $null
  if (-not $ManifestUrl) {
    try {
      $release = Get-ReleaseInfo
      Write-Info "Using release $($release.tag_name)."
    } catch {
      $marker = Read-InstallMarker $InstallRoot
      $exe = Join-Path $currentDir "codyx.exe"
      if ($marker -and (Test-Path -LiteralPath $exe)) {
        Write-Warning "GitHub API connection failed or rate limited, but active installation exists. Skipping update check."
        Write-Ok "Compiled CLI is up to date (offline)."
        return
      }
      throw
    }
  } else {
    Write-Info "Using explicit release manifest."
  }
  $manifestBundle = Get-ReleaseManifest $release
  try {
    $manifest = $manifestBundle.Data
    $assetId = Get-WindowsAssetId
    $asset = @($manifest.assets | Where-Object { $_.id -eq $assetId } | Select-Object -First 1)[0]
    if (-not $asset) { throw "Release manifest does not include $assetId." }

    $null = New-Item -ItemType Directory -Force -Path $InstallRoot, $binDir, $downloadsDir, $updaterDir
    if (-not $NoShortcuts) {
      $null = New-Item -ItemType Directory -Force -Path $startMenuDir
    }
    if ($PSCommandPath) {
      $sourceScript = [System.IO.Path]::GetFullPath($PSCommandPath)
      $targetScript = [System.IO.Path]::GetFullPath($updaterScript)
      if (-not $sourceScript.Equals($targetScript, [StringComparison]::OrdinalIgnoreCase)) {
        Copy-Item -LiteralPath $sourceScript -Destination $updaterScript -Force
      }
    }
    $verificationSource = Join-Path $PSScriptRoot "installer-verification.ps1"
    if (Test-Path -LiteralPath $verificationSource) {
      $verificationDestination = Join-Path $updaterDir "installer-verification.ps1"
      $verificationSourceFull = [System.IO.Path]::GetFullPath($verificationSource)
      $verificationDestinationFull = [System.IO.Path]::GetFullPath($verificationDestination)
      if (-not $verificationSourceFull.Equals($verificationDestinationFull, [StringComparison]::OrdinalIgnoreCase)) {
        Copy-Item -LiteralPath $verificationSource -Destination $verificationDestination -Force
      }
    }
    $repairSource = Join-Path $PSScriptRoot "repair-launcher.ps1"
    if (Test-Path -LiteralPath $repairSource) {
      $repairDestination = Join-Path $updaterDir "repair-launcher.ps1"
      $repairSourceFull = [System.IO.Path]::GetFullPath($repairSource)
      $repairDestinationFull = [System.IO.Path]::GetFullPath($repairDestination)
      if (-not $repairSourceFull.Equals($repairDestinationFull, [StringComparison]::OrdinalIgnoreCase)) {
        Copy-Item -LiteralPath $repairSource -Destination $repairDestination -Force
      }
    }

    Ensure-UserMemo -RootPath $InstallRoot
    if (-not $Quiet) {
      Invoke-InstallerVerification -InstallerVersion $manifest.version
    }

    if (Test-InstalledAssetCurrent $InstallRoot $currentDir $manifest $asset) {
      Write-Ok "Compiled CLI is up to date."
    } else {
      $zipPath = Join-Path $downloadsDir $asset.file
      $assetUrl = $asset.url
      if ($manifestBundle.SourceDir) {
        $localAsset = Join-Path $manifestBundle.SourceDir $asset.file
        if (Test-Path -LiteralPath $localAsset -PathType Leaf) {
          $assetUrl = $localAsset
        }
      }
      Write-Info "Downloading $($asset.file)..."
      Save-Download $assetUrl $zipPath
      $actualHash = Get-Sha256 $zipPath
      if ($actualHash -ne ([string]$asset.sha256).ToLowerInvariant()) {
        throw "SHA256 mismatch for $($asset.file). Expected $($asset.sha256), got $actualHash."
      }
      Write-Ok "Download verified."

      Expand-CodyxZip $zipPath $currentDir
      Write-Ok "Installed compiled CLI to $currentDir."
    }

    $shims = New-Shims $binDir $currentDir $InstallRoot $updaterScript
    if (-not $NoPathUpdate) {
      Add-UserPathEntry $binDir
    }

    $launcherDest = Join-Path $InstallRoot "codyx-installer-launcher.exe"
    $copiedLauncher = $false
    if ($env:CODY_LAUNCHER_PATH -and (Test-Path -LiteralPath $env:CODY_LAUNCHER_PATH -PathType Leaf)) {
      try {
        Copy-Item -LiteralPath $env:CODY_LAUNCHER_PATH -Destination $launcherDest -Force -ErrorAction Stop
        $copiedLauncher = $true
        Write-Ok "Launcher copied to installation directory."
      } catch {
        Write-Warn "Could not copy launcher executable: $_"
      }
    }

    $cmdExe = Join-Path $env:SystemRoot "System32\cmd.exe"
    $cliShortcut = Join-Path $startMenuDir "Codyx-Orchestrator.lnk"
    $webShortcut = Join-Path $startMenuDir "Codyx-Orchestrator Web UI.lnk"
    $uninstallShortcut = Join-Path $startMenuDir "Uninstall Codyx-Orchestrator.lnk"
    $desktopShortcut = Join-Path ([Environment]::GetFolderPath([Environment+SpecialFolder]::Desktop)) "Codyx Installer Launcher.lnk"

    if (-not $NoShortcuts) {
      New-Shortcut $cliShortcut $cmdExe "/k `"$($shims[0])`"" $InstallRoot
      New-Shortcut $webShortcut $cmdExe "/k `"$($shims[0])`" web" $InstallRoot
      New-Shortcut $uninstallShortcut $cmdExe "/k `"$($shims[0])`" uninstall" $InstallRoot
      if ($copiedLauncher -and $shims.Count -ge 3) {
        New-Shortcut $desktopShortcut $cmdExe "/c `"$($shims[2])`"" $InstallRoot
        Write-Ok "Created desktop shortcut: Codyx Installer Launcher.lnk"
      }
    }

    Write-Marker $InstallRoot $manifest.version $asset @(
      $InstallRoot,
      $memoPath,
      $currentDir,
      $binDir,
      $downloadsDir,
      $updaterDir,
      $updaterScript,
      $(if ($copiedLauncher) { $launcherDest }),
      $(if (-not $NoShortcuts) { $startMenuDir }),
      $(if (-not $NoShortcuts) { $cliShortcut }),
      $(if (-not $NoShortcuts) { $webShortcut }),
      $(if (-not $NoShortcuts) { $uninstallShortcut }),
      $(if (-not $NoShortcuts -and $copiedLauncher) { $desktopShortcut })
    ) $(if ($NoPathUpdate) { @() } else { @($binDir) }) $shims $(
      $sList = @(
        $(if (-not $NoShortcuts) { $cliShortcut }),
        $(if (-not $NoShortcuts) { $webShortcut }),
        $(if (-not $NoShortcuts) { $uninstallShortcut }),
        $(if (-not $NoShortcuts -and $copiedLauncher) { $desktopShortcut })
      )
      $sList | Where-Object { $_ }
    )

    Write-Ok "Install marker refreshed."

    if (-not $NoLaunch) {
      Write-Info "Launching Codyx-Orchestrator..."
      & $shims[0] @CodyxArgs
      exit $LASTEXITCODE
    }
  } finally {
    if ($manifestBundle.Temp) {
      Remove-Item -LiteralPath $manifestBundle.Temp -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}

try {
  Install-CodyxCompiled
} catch {
  $message = if ($_.Exception.Message) { $_.Exception.Message } else { "$_" }
  Write-Host "[error] $message" -ForegroundColor Red
  exit 1
}
