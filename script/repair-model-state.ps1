param(
  [string]$DefaultProvider = "ollama",
  [string]$DefaultModel = "qwen2.5:32b",
  [string]$FallbackProvider = "openrouter",
  [string]$FallbackModel = "deepseek/deepseek-v4-flash-0731:free"
)

$ErrorActionPreference = "Stop"

function Get-CodyxStateRoot {
  $local = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { [Environment]::GetFolderPath("LocalApplicationData") }
  return Join-Path $local "codyx\state\codyx"
}

function New-ModelEntry($Provider, $Model) {
  [ordered]@{
    providerID = $Provider
    modelID = $Model
  }
}

$stateRoot = Get-CodyxStateRoot
$modelStatePath = Join-Path $stateRoot "model.json"
if (-not (Test-Path -LiteralPath $modelStatePath)) { exit 0 }

try {
  $state = Get-Content -LiteralPath $modelStatePath -Raw | ConvertFrom-Json
} catch {
  exit 0
}

$recent = @()
$hadStaleOpencode = $false
if ($state.recent) {
  foreach ($entry in @($state.recent)) {
    if (-not $entry.providerID -or -not $entry.modelID) { continue }
    if ([string]$entry.providerID -eq "opencode") {
      $hadStaleOpencode = $true
      continue
    }
    $recent += $entry
  }
}

if (-not $hadStaleOpencode) { exit 0 }

$preferred = @(
  (New-ModelEntry $DefaultProvider $DefaultModel),
  (New-ModelEntry $FallbackProvider $FallbackModel)
)

$seen = New-Object 'System.Collections.Generic.HashSet[string]'
$merged = @()
foreach ($entry in @($preferred + $recent)) {
  $key = "$($entry.providerID)/$($entry.modelID)"
  if ($seen.Add($key)) { $merged += $entry }
}

$variants = [ordered]@{}
if ($state.variant) {
  foreach ($property in $state.variant.PSObject.Properties) {
    if ($property.Name -like "opencode/*") { continue }
    $variants[$property.Name] = $property.Value
  }
}
$variants["$DefaultProvider/$DefaultModel"] = "default"
$variants["$FallbackProvider/$FallbackModel"] = "default"

$output = [ordered]@{
  recent = $merged
  favorite = if ($state.favorite) { @($state.favorite) } else { @() }
  variant = $variants
}

$json = $output | ConvertTo-Json -Depth 8
[System.IO.File]::WriteAllText($modelStatePath, $json + "`r`n", [System.Text.UTF8Encoding]::new($false))
