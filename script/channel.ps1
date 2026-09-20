function Get-CodyxChannelStatePath {
  $root = Join-Path $env:LOCALAPPDATA "codyx"
  return (Join-Path $root "update-channel.json")
}

function ConvertTo-CodyxUpdateChannel {
  param([string]$Value)

  if (-not $Value) { return "" }
  switch ($Value.Trim().ToLowerInvariant()) {
    "beta" { return "beta" }
    "end-user-x" { return "beta" }
    "dev" { return "beta" }
    "stable" { return "stable" }
    "prod" { return "stable" }
    "production" { return "stable" }
    "latest" { return "stable" }
    "codyx/end-user" { return "stable" }
    default { return "" }
  }
}

function Get-CodyxBranchForChannel {
  param([string]$Channel)

  switch (ConvertTo-CodyxUpdateChannel $Channel) {
    "beta" { return "end-user-x" }
    default { return "codyx/end-user" }
  }
}

function Get-CodyxChannelForBranch {
  param([string]$Branch)

  switch ($Branch) {
    "end-user-x" { return "beta" }
    "dev" { return "beta" }
    "codyx/end-user" { return "stable" }
    default { return "" }
  }
}

function Get-CodyxSavedUpdateChannel {
  $path = Get-CodyxChannelStatePath
  if (-not (Test-Path -LiteralPath $path)) { return "" }
  try {
    $state = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
    return (ConvertTo-CodyxUpdateChannel ([string]$state.channel))
  } catch {
    return ""
  }
}

function Set-CodyxUpdateChannel {
  param([Parameter(Mandatory = $true)][string]$Channel)

  $normalized = ConvertTo-CodyxUpdateChannel $Channel
  if (-not $normalized) { throw "Unknown codyx update channel: $Channel" }

  $path = Get-CodyxChannelStatePath
  $dir = Split-Path -Parent $path
  if ($dir) { $null = New-Item -ItemType Directory -Force -Path $dir }
  [pscustomobject]@{
    channel = $normalized
    branch = Get-CodyxBranchForChannel $normalized
    updatedAt = (Get-Date).ToUniversalTime().ToString("o")
  } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $path -Encoding UTF8
  return $normalized
}

function Resolve-CodyxUpdateChannel {
  param([string]$RequestedBranch)

  $branchChannel = Get-CodyxChannelForBranch $RequestedBranch
  if ($branchChannel) { return $branchChannel }

  $envBranchChannel = Get-CodyxChannelForBranch $env:CODY_BRANCH
  if ($envBranchChannel) { return $envBranchChannel }

  $saved = Get-CodyxSavedUpdateChannel
  if ($saved) { return $saved }

  $envChannel = ConvertTo-CodyxUpdateChannel $env:CODY_RELEASE_CHANNEL
  if ($envChannel) { return $envChannel }

  return "stable"
}

function Resolve-CodyxUpdateBranch {
  param([string]$RequestedBranch)

  if ($RequestedBranch) { return $RequestedBranch }
  if ($env:CODY_BRANCH) { return $env:CODY_BRANCH }
  return (Get-CodyxBranchForChannel (Resolve-CodyxUpdateChannel ""))
}
