# Codyx Windows Launcher Reference

Reference binary inspected: `X:\codyx-orchestrator\dist\luncher.exe`

SHA256: `F450120BD21AC6D1B0A13672A7846F961B3EEAB0B80CB4022BE1622148DCF017`

Size: `72,531,255` bytes

Status: unsigned local development build

## Required Visual Shape

- Top moving green/blue banner with `Codyx-Orchestrator`.
- Center Mufasa image from `Assets/mufasa.png`.
- Center welcome copy:
  - `Welcome to Codyx`
  - `A multi-agent assistant`
  - `by M. Farid (Mufasa)`
- Dark background, green highlight color, compact professional layout.
- A visible process log toggle/button labelled like `Show process`.

## Required Setup Behavior

- License acceptance is explicit before setup.
- Identity and email verification stay visible in the launcher window.
- The answer box unlocks only when the installer is waiting for a real prompt.
- Email entry must be confirmed before any PIN is sent.
- Common email typo domains such as `agmail.com` must be warned before sending.
- PIN entry must expose buttons for:
  - verify/submit code
  - resend code
  - change email
  - cancel

## Required Launch Behavior

- `Open CLI`, `Open Web UI`, and `Uninstall` must stay disabled until the installed command exists at:
  `%LOCALAPPDATA%\Programs\Codyx-Orchestrator\bin\codyx.cmd`
- Failed or cancelled setup must not enable launch or uninstall actions.
- Successful setup must refresh the button state from the real installed command path.

## Required Release Behavior

- The compiled end-user installer must embed:
  - `script/install-compiled.ps1`
  - `script/installer-verification.ps1`
  - `Assets/mufasa.png`
- It must not clone the source repo, install Git, or install Bun.
- It must install only compiled release assets and verify SHA256 from `codyx-release-manifest.json`.
