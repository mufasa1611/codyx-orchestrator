param([string]$Root)

$channelScript = Join-Path $PSScriptRoot "channel.ps1"
if (Test-Path -LiteralPath $channelScript) {
    . $channelScript
}
if (-not (Get-Command Get-CodyxSavedUpdateChannel -ErrorAction SilentlyContinue)) {
    function Get-CodyxSavedUpdateChannel { return "" }
    function Set-CodyxUpdateChannel { param([string]$Channel) return $Channel }
}

$currentChannel = Get-CodyxSavedUpdateChannel
if (-not $currentChannel) { $currentChannel = "stable" }

$options = @(
    "CLI (Terminal UI)",
    "Web UI (Browser)",
    "Update channel: Stable",
    "Update channel: Beta"
)
$selected = 0
$esc = [char]0x1b
$menuHeight = $options.Length + 7
$first = $true
try {
    try { [Console]::CursorVisible = $false } catch {}
    $host.UI.RawUI.FlushInputBuffer()
    do {
        if (-not $first) {
            Write-Host "${esc}[${menuHeight}A${esc}[J" -NoNewline
        } else {
            $first = $false
        }
        Write-Host ""
        Write-Host "  codyx Launcher"
        Write-Host ""
        Write-Host "  Update channel: $currentChannel"
        Write-Host ""
        for ($i = 0; $i -lt $options.Length; $i++) {
            $label = $options[$i]
            if ($i -eq 2 -and $currentChannel -eq "stable") { $label = "$label [current]" }
            if ($i -eq 3 -and $currentChannel -eq "beta") { $label = "$label [current]" }
            if ($i -eq $selected) {
                Write-Host "${esc}[38;5;214m  > $label${esc}[0m"
            } else {
                Write-Host "${esc}[2m    $label${esc}[0m"
            }
        }
        Write-Host ""
        Write-Host "  (Up/Down to move, Enter to select)"
        $key = $host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        if ($key.VirtualKeyCode -eq 38) { $selected = ($selected - 1 + $options.Length) % $options.Length }
        elseif ($key.VirtualKeyCode -eq 40) { $selected = ($selected + 1) % $options.Length }
        elseif ($key.VirtualKeyCode -eq 27) { $selected = 255; break }
    } until ($key.VirtualKeyCode -eq 13)
} finally {
    try { [Console]::CursorVisible = $true } catch {}
    $host.UI.RawUI.FlushInputBuffer()
}

if ($selected -eq 2) {
    $null = Set-CodyxUpdateChannel "stable"
    Write-Host ""
    Write-Host "  Update channel saved: stable"
    Write-Host "  Restart codyx to update from the stable branch."
    exit 254
}
if ($selected -eq 3) {
    $null = Set-CodyxUpdateChannel "beta"
    Write-Host ""
    Write-Host "  Update channel saved: beta"
    Write-Host "  Restart codyx to update from the beta branch."
    exit 253
}

exit $selected
