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
    throw "Email verification is required before installation can continue."
  }
}

function Invoke-JsonRequest($Url) {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  return Invoke-RestMethod -Uri $Url -Headers @{ "User-Agent" = "codyx-compiled-installer" } -UseBasicParsing
}

function Get-NewestPublishedRelease {
  $releases = Invoke-JsonRequest "https://api.github.com/repos/$Repo/releases"
  $release = @($releases | Where-Object { -not $_.draft } | Select-Object -First 1)[0]
  if (-not $release) {
    throw "No published GitHub Release was found for $Repo. Draft releases cannot be used by normal users. Publish a release that includes codyx-release-manifest.json and the compiled CLI assets, then run this installer again."
  }
  return $release
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

  if ($Channel -eq "beta") {
    return Get-NewestPublishedRelease
  }

  try {
    return Invoke-JsonRequest "https://api.github.com/repos/$Repo/releases/latest"
  } catch {
    Write-Warn "No stable latest release was found. Trying the newest published prerelease or release..."
    return Get-NewestPublishedRelease
  }
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

  Invoke-WebRequest -Uri $Url -OutFile $Path -Headers @{ "User-Agent" = "codyx-compiled-installer" } -UseBasicParsing
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
    $asset = @($Release.assets | Where-Object { $_.name -eq "codyx-release-manifest.json" } | Select-Object -First 1)[0]
    if ($asset) {
      $url = $asset.browser_download_url
    } else {
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

  $cmdContent = @"
@echo off
setlocal
set "CODY_COMPILED_INSTALL_ROOT=$Root"
set "CODYX_INSTALL_ROOT=$Root"
set "CODY_RELEASE_REPO=$Repo"
set "CODY_RELEASE_CHANNEL=$Channel"
if /I "%~1"=="uninstall" goto codyx_run
if "%CODYX_SKIP_UPDATE%"=="1" goto codyx_run
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$UpdaterScript" -AcceptLicense -Quiet -NoLaunch
if errorlevel 1 exit /b %errorlevel%
:codyx_run
if /I "%~1"=="uninstall" (
  if defined TEMP cd /d "%TEMP%"
)
set "CODY_DISABLE_AUTOUPDATE=1"
"$exe" %*
exit /b %errorlevel%
"@

  $rootLiteral = Quote-PowerShellLiteral $Root
  $repoLiteral = Quote-PowerShellLiteral $Repo
  $channelLiteral = Quote-PowerShellLiteral $Channel
  $updaterLiteral = Quote-PowerShellLiteral $UpdaterScript
  $exeLiteral = Quote-PowerShellLiteral $exe
  $ps1Content = @"
`$env:CODY_COMPILED_INSTALL_ROOT = $rootLiteral
`$env:CODYX_INSTALL_ROOT = $rootLiteral
`$env:CODY_RELEASE_REPO = $repoLiteral
`$env:CODY_RELEASE_CHANNEL = $channelLiteral
`$skipUpdate = `$env:CODYX_SKIP_UPDATE -eq "1" -or (`$args.Count -gt 0 -and `$args[0] -ieq "uninstall")
if (-not `$skipUpdate) {
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

  Write-TextFile $cmd ($cmdContent.TrimStart() + "`r`n")
  Write-TextFile $ps1 ($ps1Content.TrimStart() + "`r`n")
  return @($cmd, $ps1)
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

  if (-not $InstallRoot) { $InstallRoot = Get-DefaultInstallRoot }
  $InstallRoot = [System.IO.Path]::GetFullPath($InstallRoot)
  $currentDir = Join-Path $InstallRoot "current"
  $binDir = Join-Path $InstallRoot "bin"
  $downloadsDir = Join-Path $InstallRoot "downloads"
  $updaterDir = Join-Path $InstallRoot "updater"
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
    $release = Get-ReleaseInfo
    Write-Info "Using release $($release.tag_name)."
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

    Ensure-UserMemo -RootPath $InstallRoot
    Invoke-InstallerVerification -InstallerVersion $manifest.version

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

    $cmdExe = Join-Path $env:SystemRoot "System32\cmd.exe"
    $cliShortcut = Join-Path $startMenuDir "Codyx-Orchestrator.lnk"
    $webShortcut = Join-Path $startMenuDir "Codyx-Orchestrator Web UI.lnk"
    $uninstallShortcut = Join-Path $startMenuDir "Uninstall Codyx-Orchestrator.lnk"
    if (-not $NoShortcuts) {
      New-Shortcut $cliShortcut $cmdExe "/k `"$($shims[0])`"" $InstallRoot
      New-Shortcut $webShortcut $cmdExe "/k `"$($shims[0])`" web" $InstallRoot
      New-Shortcut $uninstallShortcut $cmdExe "/k `"$($shims[0])`" uninstall" $InstallRoot
    }

    Write-Marker $InstallRoot $manifest.version $asset @(
      $InstallRoot,
      $currentDir,
      $binDir,
      $downloadsDir,
      $updaterDir,
      $updaterScript,
      $(if (-not $NoShortcuts) { $startMenuDir }),
      $(if (-not $NoShortcuts) { $cliShortcut }),
      $(if (-not $NoShortcuts) { $webShortcut }),
      $(if (-not $NoShortcuts) { $uninstallShortcut })
    ) $(if ($NoPathUpdate) { @() } else { @($binDir) }) $shims $(if ($NoShortcuts) { @() } else { @($cliShortcut, $webShortcut, $uninstallShortcut) })

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

Install-CodyxCompiled
