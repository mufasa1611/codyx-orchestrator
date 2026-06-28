param(
    [Parameter(Mandatory = $true)]
    [string]$Action,
    [string]$Branch = "dev"
)

$ErrorActionPreference = "Stop"

function Invoke-WithSparklingProgress {
    param(
        [ScriptBlock]$ScriptBlock,
        [array]$ArgumentList = @(),
        [string]$StatusText = "Update in progress..."
    )
    $job = Start-Job -ScriptBlock $ScriptBlock -ArgumentList $ArgumentList
    $colors = @(196, 202, 208, 214, 220, 226, 190, 154, 118, 82, 46, 51, 21, 57, 93, 129, 165, 201)
    $chars = @([char]0x2588, [char]0x2593, [char]0x2592, [char]0x2591)
    $tick = 0
    while ($job.State -eq "Running") {
        $bar = ""
        for ($i = 0; $i -lt 25; $i++) {
            $color = $colors[($tick + $i) % $colors.Count]
            if ((Get-Random -Minimum 0 -Maximum 10) -eq 0) {
                $bar += "$([char]27)[38;5;231m$([char]0x2726)"
            } else {
                $charIndex = [math]::Floor(($tick + $i) / 2) % $chars.Count
                $char = $chars[$charIndex]
                $bar += "$([char]27)[38;5;${color}m$char"
            }
        }
        Write-Host -NoNewline "`r$([char]27)[94m[Codyx]$([char]27)[0m $StatusText $bar$([char]27)[0m"
        $tick++
        Start-Sleep -Milliseconds 80
    }
    $res = Receive-Job -Job $job
    Remove-Job -Job $job
    # Clear line
    Write-Host -NoNewline "`r$([char]27)[K"
    return $res
}

function Invoke-Native($Command, [object[]]$Arguments = @()) {
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & $Command @Arguments
        return $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
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
        "/packages/sdk/",
        "/packages/ui/",
        "!/packages/app/e2e/",
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
    $installRoot = (Get-Location).Path
    $relativePaths = @(
        "packages\app\e2e",
        "packages\codyx\test",
        "packages\core\test",
        "packages\gitlab-auth",
        "packages\poe-auth",
        "packages\script"
    )
    foreach ($relativePath in $relativePaths) {
        $target = Join-Path $installRoot $relativePath
        if ((Test-Path -LiteralPath $target) -and (Test-CodyxPathUnderRoot $installRoot $target)) {
            Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction Stop
        }
    }

    $packagesRoot = Join-Path $installRoot "packages"
    if (-not (Test-Path -LiteralPath $packagesRoot)) { return }
    Get-ChildItem -LiteralPath $packagesRoot -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -notmatch "\\node_modules\\" -and $_.Name -match "\.(test|spec)\.tsx?$|\.stories\.tsx$" } |
        ForEach-Object {
            if (Test-CodyxPathUnderRoot $installRoot $_.FullName) {
                Remove-Item -LiteralPath $_.FullName -Force -ErrorAction Stop
            }
        }
}

function Enable-CodyxSlimCheckout {
    $code = Invoke-Native "git" @("sparse-checkout", "init", "--no-cone")
    if ($code -ne 0) { throw "git sparse-checkout init failed." }
    $code = Invoke-Native "git" (@("sparse-checkout", "set", "--no-cone") + (Get-CodyxSparseCheckoutPaths))
    if ($code -ne 0) { throw "git sparse-checkout set failed." }
    Disable-CodyxGitPush
    Remove-CodyxEndUserSourceExtras
}

$cwd = (Get-Location).Path
$tempFile = [System.IO.Path]::GetTempFileName()

try {
    switch ($Action) {
        "repair" {
            $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
            $backupBranch = "installer-backup-$timestamp"
            $patchPath = Join-Path $env:TEMP "codyx-install-backup-$timestamp.patch"

            Write-Host "$([char]27)[94m[Codyx]$([char]27)[0m Backup branch: $backupBranch"
            
            # Create backup branch
            & git branch $backupBranch 2>$null
            
            # Check if there are tracked modifications
            $trackedChanges = @(& git status --porcelain --untracked-files=no 2>$null | Where-Object { $_ -and $_.Trim() })
            if ($trackedChanges.Count -gt 0) {
                & git diff --binary > $patchPath
                Write-Host "$([char]27)[94m[Codyx]$([char]27)[0m Backup patch: $patchPath"
            }

            Write-Host "$([char]27)[94m[Codyx]$([char]27)[0m Repairing install checkout..."
            & git fetch origin $Branch --quiet
            $fetchCode = $LASTEXITCODE
            if ($fetchCode -ne 0) {
                Write-Host "$([char]27)[93m[Codyx]$([char]27)[0m Could not refresh origin/$Branch. Trying the cached ref..."
            }

            & git rev-parse --verify --quiet "origin/$Branch" *> $null
            if ($LASTEXITCODE -ne 0) {
                Write-Host "$([char]27)[91m[Codyx]$([char]27)[0m Repair failed. origin/$Branch is not available."
                exit 1
            }

            & git reset --hard "origin/$Branch"
            $exitCode = $LASTEXITCODE
            if ($exitCode -eq 0) {
                Enable-CodyxSlimCheckout
                Write-Host "$([char]27)[94m[Codyx]$([char]27)[0m Repair complete. Install checkout is now in sync."
            } else {
                Write-Host "$([char]27)[91m[Codyx]$([char]27)[0m Repair failed. Re-run install.ps1."
                & git status --short
                exit 1
            }
        }
        "pull" {
            $pullBlock = {
                param($dir, $temp)
                Set-Location $dir
                git pull --ff-only
                $LASTEXITCODE | Set-Content -Path $temp
            }
            $null = Invoke-WithSparklingProgress -ScriptBlock $pullBlock -ArgumentList @($cwd, $tempFile) -StatusText "Update in progress..."
            
            $exitCode = (Get-Content -Path $tempFile -Raw -ErrorAction SilentlyContinue).Trim()
            if ($exitCode -eq "0") {
                Enable-CodyxSlimCheckout
                Write-Host "$([char]27)[94m[Codyx]$([char]27)[0m Update complete. Install checkout is now in sync."
            } else {
                Write-Host "$([char]27)[91m[Codyx]$([char]27)[0m Update failed."
                exit 1
            }
        }
        "npm" {
            $npmBlock = {
                param($temp)
                npm install -g codyx-ai@latest
                $LASTEXITCODE | Set-Content -Path $temp
            }
            $null = Invoke-WithSparklingProgress -ScriptBlock $npmBlock -ArgumentList @($tempFile) -StatusText "Updating codyx-ai..."
            
            $exitCode = (Get-Content -Path $tempFile -Raw -ErrorAction SilentlyContinue).Trim()
            if ($exitCode -eq "0") {
                Write-Host "$([char]27)[94m[Codyx]$([char]27)[0m NPM update complete."
            } else {
                Write-Host "$([char]27)[91m[Codyx]$([char]27)[0m NPM update failed."
                exit 1
            }
        }
    }
} finally {
    if (Test-Path -Path $tempFile) {
        Remove-Item -Path $tempFile -Force -ErrorAction SilentlyContinue
    }
}
