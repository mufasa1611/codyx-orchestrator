param()

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$failures = [System.Collections.Generic.List[string]]::new()
$checks = 0

function Assert-Contains($Path, $Pattern, $Label) {
  $script:checks++
  $content = Get-Content -LiteralPath (Join-Path $Root $Path) -Raw
  if ($content -notmatch $Pattern) {
    $script:failures.Add("$Label ($Path)")
  }
}

function Assert-NotContains($Path, $Pattern, $Label) {
  $script:checks++
  $content = Get-Content -LiteralPath (Join-Path $Root $Path) -Raw
  if ($content -match $Pattern) {
    $script:failures.Add("$Label ($Path)")
  }
}

Assert-Contains "README.md" "codyx-orchestrator/dev/script/install\.sh" "README uses the dev branch"
Assert-NotContains "README.md" "codyx-orchestrator/master/script/install\.sh" "README has no stale master installer URL"
Assert-Contains "README.md" "script/install-npm\.ps1" "README points normal Windows users to the npm installer"
Assert-Contains "install.ps1" "script/install-npm\.ps1" "Root PowerShell installer is npm-first"
Assert-Contains "install.bat" "script/install-npm\.ps1" "Root CMD installer is npm-first"
Assert-NotContains "install.bat" "script/install\.ps1" "Root CMD installer does not trigger source checkout install"
Assert-NotContains "install.ps1" "Cody Pro|cody-pro|packages/opencode" "Root PowerShell installer has no Cody Pro branding"
Assert-NotContains "install.bat" "Cody Pro|cody-pro|packages/opencode" "Root CMD installer has no Cody Pro branding"
Assert-NotContains "script/install-npm.ps1" "Cody Pro|cody-pro|packages/opencode" "npm Windows installer has no Cody Pro branding"
Assert-Contains "script/install-npm.ps1" 'npm prefix -g' "npm installer uses npm prefix for npm 11 compatibility"
Assert-NotContains "script/install-npm.ps1" 'npm bin -g' "npm installer does not use removed npm bin command"
Assert-Contains "script/install-npm.ps1" '\[switch\]\$Launch' "npm installer can launch codyx after install"
Assert-Contains "script/install-npm.ps1" 'License Agreement' "npm installer shows the license agreement"
Assert-Contains "script/install-npm.ps1" 'Invoke-CodyxTraceCleanup' "npm installer cleans codyx traces when license is declined"
Assert-Contains "script/install-npm.ps1" 'CODY_ACCEPT_LICENSE' "npm installer supports explicit license acceptance for automation"
Assert-Contains "script/install-npm.ps1" 'Add-CodyxManagedTool "node" "winget" "OpenJS\.NodeJS\.LTS"' "npm installer records Node.js only when it installs Node.js"
Assert-Contains "script/install-npm.ps1" 'managedTools' "npm installer records Codyx-owned tools"
Assert-Contains "CODYX_INSTALL_UPDATE.md" "dev/script/install\.ps1" "Install guide uses the unified Windows installer"
Assert-Contains "CODYX_INSTALL_UPDATE.md" "dev/script/install-npm\.ps1" "Install guide documents the npm-first Windows installer"
Assert-NotContains "CODYX_INSTALL_UPDATE.md" "master/install\.ps1" "Install guide has no deprecated master URL"
Assert-Contains "script/install.ps1" 'install-codyx-global\.ps1.*-Root \$Root' "Windows installer propagates InstallRoot"
Assert-Contains "script/install.ps1" '\$env:ComSpec /d /s /c \$versionCommand' "Windows installer verifies the global shim through cmd"
Assert-NotContains "script/install.ps1" '\& \$GlobalCmd --version 2>\$null' "Windows health check does not convert version stderr into a PowerShell error"
Assert-NotContains "script/install.ps1" '\& powershell ' "Windows installer has no ambiguous bare PowerShell invocation"
Assert-NotContains "script/install.ps1" '(git clone|git fetch|git switch|git pull|bun install|bun run build)[^\r\n]*2>&1' "Windows native tools do not merge stderr into PowerShell errors"
Assert-Contains "script/install.ps1" '\$CheckoutRoot.*Split-Path -Parent \$PSScriptRoot' "Windows installer detects a local checkout"
Assert-Contains "script/install.ps1" 'Test-BunVersion' "Windows installer enforces the supported Bun version"
Assert-Contains "script/install.ps1" 'VERIFICATION_URL = "https://install\.kingkung\.men"' "Windows installer uses the production verification service"
Assert-Contains "script/install.ps1" 'installer-verification\.ps1' "Windows installer loads the verification helper"
Assert-Contains "script/install.ps1" 'NonInteractive = -not \(Test-InteractiveHost\)' "Windows installer detects noninteractive verification"
Assert-Contains "script/install.ps1" 'if \(-not \$verificationResult\.Success\)' "Windows installer stops when verification fails"
Assert-Contains "script/install.ps1" 'Bun 1\.3\.13\+ found\.[\s\S]*Loading installer email verification[\s\S]*cloudflared' "Windows verification runs after Bun and before cloudflared"
Assert-Contains "script/install.ps1" 'License Agreement' "Windows source installer shows the license agreement"
Assert-Contains "script/install.ps1" 'Invoke-CodyxTraceCleanup' "Windows source installer cleans codyx traces when license is declined"
Assert-Contains "script/install.ps1" 'CODY_ACCEPT_LICENSE' "Windows source installer supports explicit license acceptance for automation"
Assert-Contains "script/install.ps1" 'Add-CodyxManagedTool \$Name "winget" \$WingetId' "Windows source installer records winget tools it installs"
Assert-Contains "script/install.ps1" 'Add-CodyxManagedTool "bun" "path"' "Windows source installer records Bun only when it installs Bun"
Assert-Contains "script/install.ps1" 'Add-CodyxManagedTool "cloudflared" "winget" "Cloudflare\.cloudflared"' "Windows source installer records cloudflared only when it installs cloudflared"
Assert-Contains "install.ps1" 'AcceptLicense' "Root PowerShell installer forwards license acceptance"
Assert-Contains "install.bat" 'CODY_ACCEPT_LICENSE' "Root CMD installer forwards license acceptance"
Assert-NotContains "script/install.ps1" '[^\x00-\x7F]' "Streamed Windows installer is ASCII-safe for Windows PowerShell"
Assert-Contains "codyx.cmd" 'CODY_ORIGINAL_HTTP_PROXY=!HTTP_PROXY!' "Windows launcher preserves the user's HTTP proxy"
Assert-Contains "codyx.cmd" 'if not "%CODY_PROXY_ENABLED%"=="1" \([\s\S]*HTTP_PROXY=!CODY_ORIGINAL_HTTP_PROXY![\s\S]*HTTPS_PROXY=!CODY_ORIGINAL_HTTPS_PROXY!' "Disabled Cody proxy does not hijack update checks"
Assert-Contains "codyx.cmd" 'script\\launcher-menu\.ps1' "Windows command launcher delegates the interactive menu to launcher-menu.ps1"
Assert-Contains "script/launcher.ps1" 'codyx-orchestrator\.git' "Standalone launcher uses the codyx-orchestrator repo"
Assert-Contains "script/launcher.ps1" 'else \{ "dev" \}' "Standalone launcher defaults to the dev branch"
Assert-Contains "script/launcher.ps1" 'Resolve-InstallRoot' "Standalone launcher resolves a safe source checkout root"
Assert-Contains "script/launcher.ps1" 'Join-Path \$defaultRoot "source"' "Standalone launcher avoids runtime app data when the default root is not a checkout"
Assert-Contains "script/launcher.ps1" 'Test-CodyxInstallComplete' "Standalone launcher checks for a completed source install"
Assert-Contains "script/launcher.ps1" '\.codyx-install-marker' "Standalone launcher resumes first-run setup after an interrupted clone"
Assert-Contains "script/launcher.ps1" 'Install-WithWinget "git" "Git\.Git" "Git"' "Standalone launcher installs Git automatically when winget is available"
Assert-Contains "script/launcher.ps1" 'bun\.sh/install\.ps1' "Standalone launcher installs Bun automatically"
Assert-Contains "script/launcher.ps1" 'Invoke-FirstRunInstall' "Standalone launcher runs the normal installer on first launch"
Assert-Contains "script/launcher.ps1" '\$AcceptLicense -or \$env:CODY_ACCEPT_LICENSE -eq "1"' "Standalone launcher requires explicit license acceptance before forwarding it"
Assert-Contains "script/launcher.ps1" '"clone", "--quiet", "--branch"' "Standalone launcher suppresses git clone progress on stderr"
Assert-Contains "script/launcher.ps1" 'update-progress\.ps1"[\s\S]*"-Action", "repair"' "Standalone launcher repairs dirty install checkouts before launch"
Assert-Contains "script/launcher-menu.ps1" 'CLI \(Terminal UI\)' "Interactive launcher menu keeps the CLI option"
Assert-Contains "script/launcher-menu.ps1" 'Web UI \(Browser\)' "Interactive launcher menu keeps the Web UI option"
Assert-Contains ".github/workflows/publish.yml" 'build-launcher-windows' "Release workflow builds the Windows launcher exe"
Assert-Contains ".github/workflows/publish.yml" 'codyx-launcher-windows-x64\.exe' "Release workflow publishes the Windows launcher exe"
Assert-Contains ".github/workflows/publish.yml" 'actions/setup-dotnet@v4' "Release workflow sets up .NET for the Windows launcher"
Assert-Contains ".github/workflows/publish.yml" 'dotnet publish packages\\launcher\\Codyx\.Launcher\.csproj' "Release workflow publishes the .NET launcher"
Assert-Contains ".github/workflows/publish.yml" '(?s)build-launcher-windows:.*?if: env\.AZURE_CLIENT_ID != '''' && env\.AZURE_TENANT_ID != '''' && env\.AZURE_SUBSCRIPTION_ID != ''''' "Release workflow skips Azure login when signing secrets are absent"
Assert-NotContains ".github/workflows/publish.yml" 'Invoke-ps2exe' "Release workflow no longer builds the launcher through PS2EXE"
Assert-Contains ".github/workflows/publish.yml" 'GH_REPO: \$\{\{ needs\.version\.outputs\.repo \}\}' "Electron packaging receives the release repo for updater metadata"
Assert-Contains ".github/workflows/publish.yml" 'build-android' "Release workflow builds Android artifacts"
Assert-Contains ".github/workflows/publish.yml" 'packages/android/app-release\*\.aab' "Release workflow publishes Android app bundles"
Assert-NotContains ".github/workflows/publish.yml" 'packages\\cody\\dist|packages/cody/dist' "Release workflow has no stale packages/cody artifact paths"
Assert-Contains "packages/desktop/electron-builder.config.ts" 'process\.env\.GH_REPO' "Electron updater publishes to the selected release repo"
Assert-NotContains "packages/desktop/electron-builder.config.ts" 'anomalyco' "Electron updater no longer publishes to upstream anomalyco repos"
Assert-Contains "packages/desktop/src/main/updater.ts" 'checkForUpdatesInBackground' "Electron updater supports startup background checks"
Assert-Contains "packages/desktop/src/main/updater.ts" 'autoInstallOnAppQuit = true' "Electron updater installs downloaded updates on quit"
Assert-Contains "packages/launcher/Codyx.Launcher.csproj" '<UseWPF>true</UseWPF>' "Windows launcher is a WPF app"
Assert-Contains "packages/launcher/Codyx.Launcher.csproj" 'Assets\\mufasa\.png' "Windows launcher bundles the Mufasa image"
Assert-Contains "packages/launcher/Codyx.Launcher.csproj" 'launcher\.ps1' "Windows launcher embeds the PowerShell bootstrapper"
Assert-Contains "packages/launcher/Program.cs" 'License agreement' "Windows launcher shows a license panel"
Assert-Contains "packages/launcher/Program.cs" 'Agree and continue' "Windows launcher requires explicit agreement"
Assert-Contains "packages/launcher/Program.cs" 'identity and email verification' "Windows launcher keeps verification visible"
Assert-Contains "packages/android/twa-manifest.json" '"host": "app\.codyx\.ai"' "Android package opens the hosted codyx PWA"
Assert-Contains "packages/android/twa-manifest.json" '"fallbackType": "customtabs"' "Android package has a browser fallback before TWA verification"
Assert-Contains "packages/android/package.json" '--manifest twa-manifest\.json' "Android package scripts pass Bubblewrap the manifest file"
Assert-NotContains ".github/workflows/publish.yml" '--manifest \.' "Release workflow does not pass Bubblewrap a directory as the manifest"
Assert-Contains "script/installer-verification.ps1" 'receipts/validate' "Verification helper validates saved receipts online"
Assert-Contains "script/installer-verification.ps1" 'change-email, retry, or cancel' "Verification helper exposes recovery commands"
Assert-Contains "script/installer-verification.ps1" 'privacy@kingkung\.men' "Verification helper publishes the deletion contact"
Assert-Contains "script/installer-verification.ps1" 'source code, prompts, project content' "Verification helper discloses excluded project data"
Assert-NotContains "script/installer-verification.ps1" 'if \(\$Yes\)' "Verification helper cannot be bypassed by -Yes"
Assert-Contains "script/install-codyx-global.ps1" 'call "\$repoLauncher" %\*' "CMD shim delegates to the repo launcher"
Assert-Contains "script/install-codyx-global.ps1" '\& "\$repoLauncher" @args' "PowerShell shim delegates to the repo launcher"
Assert-Contains "script/install-codyx-global.ps1" '\$launchShortcut\.Arguments = "/k' "Start Menu launcher keeps the console open"
Assert-Contains "codyx.cmd" 'Press any key to close this window' "Menu launcher leaves errors visible before closing"
Assert-NotContains "script/install-codyx-global.ps1" '%~dp0\.\.\\\.\.\\codyx' "CMD shim has no guessed install path"
Assert-NotContains "script/install-codyx-global.ps1" '[^\x00-\x7F]' "Global installer is ASCII-safe for Windows PowerShell"
Assert-Contains "script/discover-local-models.ps1" '127\.0\.0\.1:11434/api/tags' "Model discovery uses the bounded Ollama API"
Assert-NotContains "script/discover-local-models.ps1" 'ollama\.Source list|running: ollama list' "Model discovery does not invoke an unbounded Ollama process"
Assert-Contains "script/discover-local-models.ps1" 'CODY_GGUF_PATHS' "Model discovery supports explicit GGUF roots"
Assert-NotContains "script/discover-local-models.ps1" 'Get-PSDrive' "Model discovery does not crawl every fixed drive"
Assert-Contains "script/install.sh" 'GLOBAL_BIN_DIR="\$\{CODY_GLOBAL_BIN_DIR:-\$HOME/\.local/bin\}"' "Unix launcher uses the standard user bin"
Assert-Contains "script/install.sh" 'export CODY_INSTALL_ROOT=' "Unix launcher exports its install root"
Assert-Contains "script/install.sh" 'fish_add_path' "Unix installer writes valid Fish PATH syntax"
Assert-Contains "script/install.sh" 'Global command verified' "Unix installer verifies the global command"
Assert-Contains "script/install.sh" '\[ "\$YES" = "1" \] && \[ "\$REBOOT" = "1" \]' "Non-interactive server install does not reboot by default"
Assert-Contains "script/install.sh" 'bun_version_supported' "Unix installer enforces the supported Bun version"
Assert-Contains "script/install.sh" 'record_managed_tool "bun" "path"' "Unix installer records Bun only when it installs Bun"
Assert-Contains "script/install.sh" 'write_install_marker' "Unix installer writes the Codyx ownership marker"
Assert-Contains "packages/codyx/src/cli/cmd/uninstall.ts" 'codyx-ai' "Uninstall uses the current package name"
Assert-Contains "packages/codyx/src/cli/cmd/uninstall.ts" '\.local", "bin", "codyx"' "Uninstall removes the Unix global launcher"
Assert-NotContains "packages/codyx/src/cli/cmd/uninstall.ts" 'removeNpmPathEntry' "Uninstall preserves the shared npm PATH entry"
Assert-Contains "packages/codyx/src/cli/cmd/uninstall.ts" 'managedTools' "Uninstall reads Codyx-owned tool markers"
Assert-Contains "packages/codyx/src/cli/cmd/uninstall.ts" 'removeManagedTools' "Uninstall removes tools installed by Codyx"
Assert-Contains "packages/codyx/src/cli/cmd/uninstall.ts" 'were not marked as installed by codyx, so they were left installed' "Uninstall preserves shared system tools"
Assert-Contains "packages/codyx/src/installation/index.ts" 'CODY_INSTALL_ROOT' "Installation method detection uses the install root"
Assert-Contains "packages/codyx/src/cli/upgrade.ts" 'CODY_INSTALL_ROOT' "Auto-update uses the install root"
Assert-NotContains "packages/codyx/src/cli/upgrade.ts" 'git rev-parse --git-dir' "Auto-update does not treat the user's current repo as the codyx install"
Assert-NotContains "packages/codyx/src/index.ts" 'git rev-parse --show-toplevel' "CLI entry point does not git-pull the user's current repo"
Assert-NotContains "packages/codyx/src/index.ts" 'system-state\.json' "CLI has no state-file deletion switch"
Assert-NotContains "packages/codyx/src/index.ts" 'rm -rf|rmdir /s /q' "CLI entry point cannot delete its checkout"
Assert-Contains ".gitignore" '\.codyx-install-marker' "Generated install marker is ignored"

if ($failures.Count -gt 0) {
  Write-Host "$($failures.Count) of $checks installer checks failed:" -ForegroundColor Red
  $failures | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
  exit 1
}

Write-Host "All $checks installer checks passed." -ForegroundColor Green
