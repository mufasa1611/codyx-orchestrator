# codyx Quickstart

## Start The TUI

If Node.js/npm is already installed, install the current beta package and launch the TUI:

```powershell
npm install -g codyx-ai@beta && codyx
```

If Node.js/npm is not installed on Windows, use the npm installer:

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/mufasa1611/codyx-orchestrator/dev/script/install-npm.ps1))) -Tag beta -Launch
```

From CMD:

```cmd
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "& ([scriptblock]::Create((irm https://raw.githubusercontent.com/mufasa1611/codyx-orchestrator/dev/script/install-npm.ps1))) -Tag beta -Launch"
```

After installation, the global command is:

```powershell
codyx
```

The npm installer installs Node.js LTS with `winget` when possible, installs `codyx-ai`, and does not clone the repository.

Use the source installer only when you want an editable checkout or source/server proxy setup:

```powershell
irm https://raw.githubusercontent.com/mufasa1611/codyx-orchestrator/dev/script/install.ps1 | iex
```

Or from CMD:

```cmd
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/mufasa1611/codyx-orchestrator/dev/script/install.ps1 | iex"
```

The root `install.bat` path is npm-first. The source installer clones the repository, checks Git/Bun, runs `bun install`, and creates the source checkout global shim.

If you prefer to clone manually:

```powershell
git clone https://github.com/mufasa1611/codyx-orchestrator.git
cd codyx-orchestrator
.\script\install.ps1
```

From the checkout directory:

```powershell
.\codyx.cmd
```

The fork config sets `operator` as the default primary agent, so this starts codyx in operator mode from the repo root.

Equivalent Bun command:

```powershell
bun run codyx
```

codyx branding is the default in this fork, even when launching from `packages/codyx`. Set `CODY_X=0` only if you need to inspect the inherited upstream branding.

Pass a project path if you want codyx to open somewhere else:

```powershell
.\codyx.cmd C:\path\to\project
```

Start with a primary agent:

```powershell
.\codyx.cmd --agent operator
```

You can still explicitly choose an upstream agent:

```powershell
.\codyx.cmd --agent build
```

## Useful Checks

```powershell
codyx --help
.\codyx.cmd --help
.\codyx.cmd agent list
.\codyx.cmd debug agent operator
```

If an npm global command is missing, reinstall the npm package:

```powershell
npm install -g codyx-ai@beta
```

If a source checkout shim is missing, reinstall the local shim from the checkout:

```powershell
.\script\install-codyx-global.ps1 -Root (Get-Location)
```

## Local Model Discovery

On first normal startup, codyx discovers local Ollama models and `.gguf` files, then writes a generated config:

```text
.cody\generated\cody.jsonc
```

During that scan it prints `[codyx:model-scan]` progress lines so you can see the current phase, drive, folder, and found model count. Refresh later with:

```powershell
$env:CODY_REFRESH_MODELS='1'
codyx
```

Skip discovery for one launch:

```powershell
$env:CODY_SKIP_MODEL_DISCOVERY='1'
codyx
```

Local model setup notes are in `CODYX_LOCAL_MODELS.md`.

## Notes

- The upstream `cody` entry point also works for testing upstream behavior.
- The first launch may run a local database migration.
- Keep dangerous infra actions permission-gated. codyx agents should inspect first and ask before mutating systems.
