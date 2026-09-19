# Codyx End-User Auto-Update TODO

Goal: users install Codyx once, then the app keeps itself useful with the least possible manual work.

## Principles

- Never ask normal users to understand Git, branches, tags, or GitHub Actions.
- Prefer automatic repair and clear status over manual instructions.
- Keep the launcher/updater stable and small.
- Separate model/provider catalog updates from full binary updates.
- Preserve user config, API keys, selected channel, selected model, and local model downloads.
- Fail soft: if network/update/model catalog refresh fails, launch the currently installed version.

## Phase 1 - Catalog Updates Without Binary Releases

- [x] Add a checked-in provider preset catalog at `release/catalog/provider-presets.json`.
- [x] Make `codyx setup models` merge the checked-in catalog over built-in presets.
- [ ] Add updater support to refresh `release/catalog/provider-presets.json` from a channel catalog URL.
- [ ] Store downloaded catalogs under `%LOCALAPPDATA%\Programs\Codyx-Orchestrator\release\catalog`.
- [ ] Validate catalog schema before replacing the active file.
- [ ] Keep the previous known-good catalog as rollback.
- [ ] Add `codyx setup models --refresh-catalog`.
- [ ] Add a simple provider health probe for free models and mark rate-limited models as fallback only.

## Phase 2 - Channel Manifest Auto-Update

- [ ] Publish stable and beta channel manifests outside release tags.
- [ ] Manifest shape:
  - `schema`
  - `product`
  - `channel`
  - `version`
  - `tag`
  - `generatedAt`
  - `minimumUpdaterVersion`
  - `catalogUrl`
  - `assets[]` with `id`, `kind`, `platform`, `arch`, `file`, `url`, `sha256`, `size`
- [ ] Updater reads channel manifest first, then falls back to GitHub Releases.
- [ ] If manifest points to a newer compatible asset, download it silently.
- [ ] Verify SHA256 before install.
- [ ] Extract into a staging folder, run smoke check, then atomically switch `current`.
- [ ] Regenerate wrappers with `CODY_CONFIG_DIR`.
- [ ] Relaunch Codyx after successful update when launched from the GUI.
- [ ] If update fails, keep the old version and show a short message.

## Phase 3 - Maximum Automation For New Users

- [ ] First launch checks local hardware.
- [ ] Detect Ollama and llama.cpp.
- [ ] If Ollama exists, update it when safe or show one-click update.
- [ ] If Ollama does not exist, offer one-click install.
- [ ] Recommend model tier from RAM, VRAM, CPU threads, and free disk.
- [ ] Pull the recommended local model automatically after user confirms once.
- [ ] Default to local model when available.
- [ ] Detect saved provider API keys from user environment and `memo.md`.
- [ ] If OpenRouter key exists, add working free models automatically.
- [ ] Keep online providers as fallback after local models.

## Phase 4 - Self-Healing

- [ ] Run a startup health check:
  - wrapper has `CODY_CONFIG_DIR`
  - generated config exists
  - selected default model exists in config
  - local engine responds if local model is selected
  - provider key exists if online model is selected
- [ ] If generated config is missing, rebuild it from catalog and detected local models.
- [ ] If selected model is unavailable, choose the best available fallback.
- [ ] Keep repair logs in `%LOCALAPPDATA%\codyx\log`.
- [ ] Never delete user config during repair.

## Phase 5 - Release Operator Flow

- [ ] One GitHub Action builds binaries and release manifests.
- [ ] A second step updates the `stable` or `beta` channel manifest.
- [ ] The channel manifest update should be the only thing users need for auto-update.
- [ ] Add a dry-run mode that validates manifest URLs and SHA256 before publishing.
- [ ] Add a rollback command that points a channel manifest back to the previous version.

## Acceptance Tests

- [ ] Fresh install on Windows with no Git/Bun.
- [ ] Existing compiled install updates from beta manifest without reinstall.
- [ ] Existing source install still fast-forwards its branch.
- [ ] Broken network launches old version.
- [ ] Bad manifest is rejected.
- [ ] Missing catalog falls back to built-in presets.
- [ ] OpenRouter free model change can be shipped by catalog-only update.
- [ ] Local Ollama model selection survives an app update.
