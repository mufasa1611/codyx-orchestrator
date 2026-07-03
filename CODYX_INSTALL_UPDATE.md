# codyx Install And Update Strategy

## Zero-Touch User Packages

| Package                   | User Action           | Update Mechanism                                                                                                                                                                                   |
| ------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| End-user installer `.exe` | Install once          | Installs only compiled release assets. The installed `codyx` shims quietly fetch the release manifest on every start, verify SHA256 hashes, update the CLI asset when needed, then launch `codyx`. |
| Source launcher `.exe`    | Double-click it daily | Developer/power-user path. The branded .NET launcher installs Git/Bun when needed, clones or updates a slim source checkout, refreshes dependencies/build output when needed, then starts `codyx`. |
| Electron installer        | Install once          | The desktop app uses `electron-updater` against this repo's GitHub Releases, downloads updates in the background on startup, and installs the downloaded update on app quit/restart.               |
| Android APK/AAB           | Install once          | The Android package is a Trusted Web Activity that opens the hosted codyx PWA, so web updates are fetched on app start. Native APK/AAB updates are distributed through releases or Play Store.     |

All packages are produced by the release workflow. Normal Windows users should receive `codyx-end-user-installer-windows-x64.exe`. The source launcher release asset is `codyx-launcher-windows-x64.exe`; Electron installers are produced from `packages/desktop`; Android artifacts are produced from `packages/android`.

## Recommended User Install

For normal Windows users, distribute the compiled end-user installer from GitHub Releases:

```text
codyx-end-user-installer-windows-x64.exe
```

It shows the hosted license link, installs the compiled CLI under:

```text
%LOCALAPPDATA%\Programs\Codyx-Orchestrator
```

It writes shims to `%LOCALAPPDATA%\Programs\Codyx-Orchestrator\bin`, adds that directory to the user PATH, records uninstall markers under `%LOCALAPPDATA%\codyx-installer`, and does not clone the repository or install Git/Bun.

If Node.js/npm is already installed:

```powershell
npm install -g codyx-ai@beta && codyx
```

If Node.js/npm is not installed on Windows:

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/mufasa1611/codyx-orchestrator/dev/script/install-npm.ps1))) -Tag beta -Launch
```

From CMD:

```cmd
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "& ([scriptblock]::Create((irm https://raw.githubusercontent.com/mufasa1611/codyx-orchestrator/dev/script/install-npm.ps1))) -Tag beta -Launch"
```

The npm installer shows the MIT license agreement before installation. If the user agrees, it installs Node.js LTS with `winget` when possible, installs `codyx-ai`, verifies the global `codyx` command, and can launch the TUI. If the user disagrees, it stops and removes codyx traces such as the global package, codyx shims, installer verification data, Start Menu shortcuts, and the default source install root. It also removes Node.js only when this installer recorded that it installed Node.js; pre-existing machine installs are left alone. It does not clone this repository, run `bun install`, build the web UI from source, or configure the source checkout proxy stack.

For noninteractive automation, review the license first and set:

```powershell
$env:CODY_ACCEPT_LICENSE = "1"
```

## User Update Policy

npm installs update through npm:

```powershell
npm update -g codyx-ai
```

For the current beta channel:

```powershell
npm install -g codyx-ai@beta
```

Inside codyx, `codyx upgrade` should detect npm installs as npm installs and must not run `git pull` in the user's current project repository.

## Source/Developer Install

Use the source installer only when you intentionally want an editable checkout or source/server setup:

```powershell
irm https://raw.githubusercontent.com/mufasa1611/codyx-orchestrator/dev/script/install.ps1 | iex
```

If you prefer to clone manually first:

```powershell
git clone https://github.com/mufasa1611/codyx-orchestrator.git
cd codyx-orchestrator
.\script\install.ps1
```

macOS/Linux source checkout:

```bash
CODY_FORCE_SOURCE=1 curl -fsSL https://raw.githubusercontent.com/mufasa1611/codyx-orchestrator/dev/script/install.sh | bash
```

The source installer shows the MIT license agreement before installing prerequisites. If the user disagrees, it starts codyx cleanup and exits. If the user agrees, it installs Git and Bun 1.3.13+ when needed, then pauses for email ownership verification before cloning the repository or continuing with the rest of installation. Cleanup removes Git, Bun, and cloudflared only when this installer recorded that it installed them; pre-existing machine installs are left alone. It explains what is collected, sends a six-digit code, and stores only a signed receipt under:

```text
%LOCALAPPDATA%\codyx-installer\verification.json
```

After verification, the source installer runs `bun install`, builds the web UI, discovers optional local models, and verifies the source checkout global shim. The privacy notice is available at https://install.kingkung.men/privacy and deletion requests can be sent to `privacy@kingkung.men`.

For non-technical Windows users who should not run a shell command, distribute the compiled end-user installer `.exe` from the GitHub Release. It shows the license agreement in the branded installer, installs compiled release assets, and keeps the installed CLI current through the release manifest on launch.

For testers or developers who need a source checkout, distribute the source launcher `.exe` from the same GitHub Release. It shows the license agreement in the branded launcher, opens the interactive name/email verification setup on first run, and then keeps the checkout up to date on launch.

For GUI users, distribute the Electron installer from the same GitHub Release. It starts the desktop Web UI experience and keeps itself current through `electron-updater`.

For Android users, distribute the APK/AAB from the same GitHub Release or through Play Store. The package wraps `https://app.codyx.ai` as a Trusted Web Activity. To get full-screen TWA verification instead of Custom Tabs fallback, publish the generated signing certificate fingerprint to `https://app.codyx.ai/.well-known/assetlinks.json`.

## Source Update Policy

Source installs update through git from the codyx checkout:

```powershell
git pull --ff-only
.\script\install.ps1
```

Updates use `git pull --ff-only`, so local divergent changes are not overwritten. The source launcher exports `CODY_INSTALL_ROOT` so update logic can distinguish the codyx checkout from the user's project repository.

## Reinstall Source Global Command

If the source checkout global shim is missing or stale:

```powershell
.\script\install-codyx-global.ps1 -Root (Get-Location)
```

## Release Checkpoint Criteria

Before tagging a codyx checkpoint:

- Worktree is clean.
- `codyx --help` shows codyx branding.
- `codyx debug agent operator` loads Cody agents and tools.
- Local provider smoke checks pass.
- Focused Cody tool smoke checks pass.
- `bun run typecheck` passes.
- Full test suite has either passed or has documented non-Cody failures.
