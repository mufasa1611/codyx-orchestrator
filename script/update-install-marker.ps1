param(
  [string]$Root = "",
  [string]$ServiceUrl = "https://install.kingkung.men"
)

$ErrorActionPreference = "Continue"

function Get-ObjectArray($Value) {
  if ($null -eq $Value) { return @() }
  if ($Value -is [System.Array]) { return @($Value) }
  return @($Value)
}

function Read-CodyxMarker($Path) {
  if (-not $Path -or -not (Test-Path -LiteralPath $Path)) { return $null }
  try { return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json } catch { return $null }
}

function Add-UniqueString {
  param([string[]]$Items, [string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) { return @($Items) }
  if ($Items -contains $Value) { return @($Items) }
  return @($Items + $Value)
}

function Test-SameManagedTool($Left, $Right) {
  return (
    "$($Left.name)" -eq "$($Right.name)" -and
    "$($Left.manager)" -eq "$($Right.manager)" -and
    "$($Left.packageId)" -eq "$($Right.packageId)" -and
    "$($Left.path)" -eq "$($Right.path)"
  )
}

function Add-UniqueManagedTool {
  param($Tools, $Tool)
  if ($null -eq $Tool) { return @($Tools) }
  if ($Tools | Where-Object { Test-SameManagedTool $_ $Tool } | Select-Object -First 1) { return @($Tools) }
  return @($Tools + $Tool)
}

function Resolve-CodyxRoot {
  if ($Root -and (Test-Path -LiteralPath (Join-Path $Root "package.json"))) {
    return (Resolve-Path -LiteralPath $Root).Path
  }
  if ($env:CODY_INSTALL_ROOT -and (Test-Path -LiteralPath (Join-Path $env:CODY_INSTALL_ROOT "package.json"))) {
    return (Resolve-Path -LiteralPath $env:CODY_INSTALL_ROOT).Path
  }

  $local = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { [Environment]::GetFolderPath("LocalApplicationData") }
  foreach ($candidate in @(
    (Join-Path $local "codyx\source"),
    (Join-Path $local "codyx")
  )) {
    if (Test-Path -LiteralPath (Join-Path $candidate "package.json")) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }
  return ""
}

function Write-CodyxMarker($Path, $Marker) {
  if ([string]::IsNullOrWhiteSpace($Path)) { return }
  $dir = Split-Path -Parent $Path
  if ($dir) { $null = New-Item -ItemType Directory -Force -Path $dir }
  [System.IO.File]::WriteAllText(
    $Path,
    ($Marker | ConvertTo-Json -Compress -Depth 10),
    [System.Text.UTF8Encoding]::new($false)
  )
}

$resolvedRoot = Resolve-CodyxRoot
if (-not $resolvedRoot) { exit 0 }

$local = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { [Environment]::GetFolderPath("LocalApplicationData") }
$roaming = if ($env:APPDATA) { $env:APPDATA } else { [Environment]::GetFolderPath("ApplicationData") }
$installerState = Join-Path $local "codyx-installer"
$installerMarkerPath = Join-Path $installerState "install-marker.json"
$checkoutMarkerPath = Join-Path $resolvedRoot ".codyx-install-marker"
$receiptPath = Join-Path $installerState "verification.json"

$installed = @()
$pathAdds = @()
$shortcuts = @()
$shims = @()
$markerPaths = @()
$managedTools = @()
$jsInstall = $null

foreach ($markerPath in @($installerMarkerPath, $checkoutMarkerPath)) {
  $marker = Read-CodyxMarker $markerPath
  if (-not $marker) { continue }
  foreach ($item in (Get-ObjectArray $marker.installed)) { $installed = Add-UniqueString $installed "$item" }
  foreach ($item in (Get-ObjectArray $marker.pathAdds)) { $pathAdds = Add-UniqueString $pathAdds "$item" }
  foreach ($item in (Get-ObjectArray $marker.shortcuts)) { $shortcuts = Add-UniqueString $shortcuts "$item" }
  foreach ($item in (Get-ObjectArray $marker.shims)) { $shims = Add-UniqueString $shims "$item" }
  foreach ($item in (Get-ObjectArray $marker.markerPaths)) { $markerPaths = Add-UniqueString $markerPaths "$item" }
  foreach ($tool in (Get-ObjectArray $marker.managedTools)) { $managedTools = Add-UniqueManagedTool $managedTools $tool }
  if ($marker.PSObject.Properties.Name -contains "jsInstall") { $jsInstall = $marker.jsInstall }
}

foreach ($markerPath in @($installerMarkerPath, $checkoutMarkerPath)) {
  $markerPaths = Add-UniqueString $markerPaths $markerPath
}

$envProxy = Join-Path $resolvedRoot ".env.proxy"
if (Test-Path -LiteralPath $envProxy) {
  $installed = Add-UniqueString $installed $envProxy
}

$npmDir = Join-Path $roaming "npm"
foreach ($shimName in @("codyx", "cody", "cody-x", "codyx-ai")) {
  foreach ($extension in @(".cmd", ".ps1", ".exe", "")) {
    $shimPath = Join-Path $npmDir "$shimName$extension"
    if (Test-Path -LiteralPath $shimPath) {
      $shims = Add-UniqueString $shims $shimPath
      $installed = Add-UniqueString $installed $shimPath
    }
  }
}

$startMenuDir = Join-Path $roaming "Microsoft\Windows\Start Menu\Programs\codyx"
if (Test-Path -LiteralPath $startMenuDir) {
  $installed = Add-UniqueString $installed $startMenuDir
  foreach ($shortcut in (Get-ChildItem -LiteralPath $startMenuDir -Filter "*.lnk" -File -ErrorAction SilentlyContinue)) {
    $shortcuts = Add-UniqueString $shortcuts $shortcut.FullName
    $installed = Add-UniqueString $installed $shortcut.FullName
  }
}

if (Test-Path -LiteralPath $receiptPath) {
  $installed = Add-UniqueString $installed $receiptPath
}

$verificationData = Read-CodyxMarker $receiptPath
$verification = $null
if ($verificationData -and $verificationData.install_id) {
  $verification = @{
    installId = [string]$verificationData.install_id
    receiptPath = $receiptPath
    serverUrl = if ($verificationData.server_url) { [string]$verificationData.server_url } else { $ServiceUrl }
  }
}

$baseMarker = [ordered]@{
  root = $resolvedRoot
  installed = @($installed | Where-Object { $_ } | Select-Object -Unique)
  pathAdds = @($pathAdds | Where-Object { $_ } | Select-Object -Unique)
  shortcuts = @($shortcuts | Where-Object { $_ } | Select-Object -Unique)
  shims = @($shims | Where-Object { $_ } | Select-Object -Unique)
  markerPaths = @($markerPaths | Where-Object { $_ } | Select-Object -Unique)
  managedTools = @($managedTools)
  adminUninstall = @{
    enabled = $true
    serviceUrl = $ServiceUrl
    receiptPath = $receiptPath
    commandsPath = "/v1/commands"
    acknowledgePath = "/v1/acknowledge"
    completePath = "/v1/complete"
  }
  updatedAt = (Get-Date).ToUniversalTime().ToString("o")
}

if ($verification) { $baseMarker["verification"] = $verification }
if ($jsInstall) { $baseMarker["jsInstall"] = $jsInstall }

foreach ($markerPath in @($installerMarkerPath, $checkoutMarkerPath)) {
  Write-CodyxMarker $markerPath ([pscustomobject]$baseMarker)
}
