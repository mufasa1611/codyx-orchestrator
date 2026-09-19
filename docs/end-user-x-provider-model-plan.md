# End-User X Provider and Local Model Integration Plan

## Goal

Build a provider and model experience where an end user can choose between:

- online providers with free or paid API keys,
- official OpenCode Zen when the user's account is allowed to use it,
- local Ollama models,
- local GGUF models served by an installed local engine,
- future engines through the same provider registry.

The installer should guide non-technical users through engine installation, hardware detection, model recommendations, model download, and Codyx config generation.

## Principles

- Do not depend on unauthenticated third-party free tiers. Every online provider must use the provider's supported key, OAuth, or documented local setup.
- Keep local-first usage fully functional without cloud accounts.
- Treat model choice as a runtime configuration, not a hardcoded default.
- Never wipe user-local provider/model choices during launcher updates.
- Prefer existing Codyx primitives: `.cody/generated`, `script/discover-local-models.ps1`, provider config, and `providers login`.
- Separate detection from installation from selection so each step can be retried safely.

## Current Starting Point

Existing pieces to reuse:

- `script/discover-local-models.ps1` discovers Ollama and GGUF models and writes `.cody/generated/cody.jsonc`.
- `script/install.ps1` already has a model discovery phase and checks for Ollama.
- `script/launcher.ps1` auto-updates the install checkout and repairs tracked local changes.
- `packages/codyx/src/provider/provider.ts` already supports SDK loaders for `@ai-sdk/google`, `@ai-sdk/groq`, `@ai-sdk/cerebras`, `@openrouter/ai-sdk-provider`, `@ai-sdk/openai-compatible`, and others.
- `packages/codyx/src/config/provider.ts` already supports project provider config blocks with models, env vars, npm package, API URL, options, and headers.

Main gaps:

- No guided provider setup for common free-key providers.
- No provider presets for Gemini, Groq, OpenRouter, Cerebras, Mistral, Together, or DeepInfra in the end-user generated config.
- No automatic local engine install for Ollama or GGUF runners.
- No hardware scoring to recommend safe local model sizes.
- No stable user choice layer that survives installer/launcher repair.
- GGUF discovery finds files, but there is no full engine lifecycle for serving them.

## User Experience

### First Run

Installer asks:

1. "How do you want to run AI models?"
   - Local models on this computer
   - Free online API keys
   - Paid/provider API keys
   - Skip for now

2. If local:
   - Detect CPU, RAM, GPU, VRAM, disk free space, Windows build, and existing engines.
   - Recommend one track:
     - Small local: 4 GB to 8 GB RAM, CPU-only, 1B to 3B models.
     - Standard local: 8 GB to 16 GB RAM, CPU or small GPU, 3B to 8B quantized models.
     - Strong local: 16 GB to 32 GB RAM or 6 GB+ VRAM, 8B to 14B quantized models.
     - Workstation: 32 GB+ RAM or 12 GB+ VRAM, 14B to 32B quantized models.
   - Offer engine install:
     - Ollama recommended for most users.
     - llama.cpp server for direct GGUF users.
     - LM Studio manual/external option, detected but not silently installed.
   - Offer model download list sized to the hardware.

3. If online:
   - Show provider choices with key links and environment variable names:
     - Gemini: `GOOGLE_GENERATIVE_AI_API_KEY`
     - Groq: `GROQ_API_KEY`
     - OpenRouter: `OPENROUTER_API_KEY`
     - Cerebras: `CEREBRAS_API_KEY`
     - Mistral: `MISTRAL_API_KEY`
     - Together: `TOGETHER_API_KEY`
     - DeepInfra: `DEEPINFRA_API_KEY`
   - Write provider presets only after the user selects a provider or key is detected.

4. Generate `.cody/generated/cody.jsonc` with:
   - selected default model,
   - provider presets,
   - local provider blocks,
   - metadata report path for troubleshooting.

### Later Runs

- `codyx setup models` reopens the same wizard.
- `codyx models refresh` rescans online and local models.
- `codyx models recommend` prints hardware and recommended models.
- Launcher updates must not overwrite `.cody/generated/*`.

## Provider Registry Design

Add a provider preset registry, separate from `models.dev` fallback, for end-user setup:

`packages/codyx/src/provider/preset.ts`

Each preset:

```ts
type ProviderPreset = {
  id: string
  name: string
  env: string[]
  npm: string
  api?: string
  setupUrl: string
  freeTierNote: string
  models: Record<string, ProviderModelPreset>
}
```

Initial presets:

- `google`
  - npm: `@ai-sdk/google`
  - env: `GOOGLE_GENERATIVE_AI_API_KEY`
  - models: Gemini Flash and Flash-Lite family.

- `groq`
  - npm: `@ai-sdk/groq`
  - env: `GROQ_API_KEY`
  - models: GPT OSS, Qwen, and other Groq-hosted text models.

- `openrouter`
  - npm: `@openrouter/ai-sdk-provider`
  - env: `OPENROUTER_API_KEY`
  - models: `:free` models only in the starter preset, with room for paid models later.

- `cerebras`
  - npm: `@ai-sdk/cerebras`
  - env: `CEREBRAS_API_KEY`
  - models: Qwen/Cerebras current public models.

- `mistral`
  - npm: `@ai-sdk/mistral`
  - env: `MISTRAL_API_KEY`
  - models: free/low-cost starter models when available.

- `ollama`
  - npm: `@ai-sdk/openai-compatible`
  - api: `http://127.0.0.1:11434/v1`
  - models discovered dynamically.

- `llama-cpp`
  - npm: `@ai-sdk/openai-compatible`
  - api: `http://127.0.0.1:<managed-port>/v1`
  - models generated from GGUF files.

## Local Engine Plan

### Engine Detection

Create:

- `script/detect-system.ps1`
- `script/detect-system.sh`

Report:

```json
{
  "os": "windows",
  "arch": "x64",
  "cpuName": "...",
  "cpuCores": 8,
  "ramGB": 32,
  "gpu": [
    { "name": "NVIDIA ...", "vramGB": 8, "backend": "cuda" }
  ],
  "diskFreeGB": 250,
  "engines": {
    "ollama": { "installed": true, "version": "..." },
    "llamaCpp": { "installed": false },
    "lmStudio": { "installed": false }
  }
}
```

Windows detection:

- CPU/RAM: CIM/WMI.
- GPU/VRAM: `Win32_VideoController`, plus `nvidia-smi` when present.
- Disk: `Get-PSDrive`.

Linux/macOS detection:

- CPU/RAM: `uname`, `/proc/meminfo`, `sysctl`.
- GPU: `nvidia-smi`, `lspci`, `system_profiler`.
- Disk: `df`.

### Hardware Model Recommendation

Create:

- `script/recommend-local-models.ps1`
- `script/recommend-local-models.sh`

Output tiers:

| Tier | Minimum | Recommended models |
| --- | --- | --- |
| tiny | 4 GB RAM | Qwen2.5/3 1.5B, Llama 3.2 1B |
| small | 8 GB RAM | Qwen 3B, Gemma 3 4B, Phi 3 mini |
| standard | 16 GB RAM or 4 GB VRAM | Qwen 7B/8B Q4, Llama 3.1/3.2 8B Q4 |
| strong | 32 GB RAM or 8 GB VRAM | Qwen 14B Q4, DeepSeek coder small |
| workstation | 64 GB RAM or 16 GB VRAM | 30B+ quantized models |

Recommendation rules:

- Reserve at least 25% system RAM for OS/tools.
- Prefer GPU-fit models when VRAM is available.
- Prefer Q4_K_M or equivalent quantization as the default GGUF download target.
- Avoid recommending models larger than 70% of available disk free space.

### Ollama Installer

Windows:

- Prefer `winget install Ollama.Ollama`.
- Fall back to official installer download prompt.
- Do not silently install if winget is unavailable unless user confirms.

macOS:

- Prefer `brew install --cask ollama` when Homebrew exists.
- Fall back to official download prompt.

Linux:

- Offer official install script only after explicit confirmation.

Post-install:

- Start `ollama serve`.
- Pull selected model with `ollama pull <model>`.
- Run `ollama list`.
- Write provider config.

### GGUF Engine Installer

Target engine:

- llama.cpp server, installed under `.cody/local-engines/llama-cpp/` or user-local app data, not inside tracked repo.

Windows:

- Download pinned release ZIP from official llama.cpp releases.
- Choose CUDA/Vulkan/CPU build based on detection.
- Verify file exists and record version/hash in `.cody/generated/local-engines.json`.

Linux/macOS:

- Prefer release artifact.
- Build from source only as an advanced option.

Runtime:

- Managed process launched on demand.
- Port allocated from a safe range.
- Health check `GET /v1/models`.
- Stop process on Codyx exit when Codyx started it.

GGUF model sources:

- Existing local files.
- User-selected download URL.
- Curated model list in a future `local-model-catalog.json`.

## Config Generation

Generated files:

- `.cody/generated/cody.jsonc`
- `.cody/generated/cody-local-models.report.json`
- `.cody/generated/provider-presets.report.json`
- `.cody/generated/local-engines.json`
- `.cody/generated/model-recommendations.json`

Rules:

- Generated files are gitignored.
- Do not edit `.cody/opencode.jsonc` or tracked project config for end-user choices.
- Default model selection order:
  1. user-selected local model,
  2. user-selected online provider model,
  3. first healthy local model,
  4. first provider with a valid key,
  5. fallback message that tells user to run setup.

Example generated provider block:

```jsonc
{
  "model": "groq/qwen-3.6-27b",
  "provider": {
    "groq": {
      "name": "Groq",
      "env": ["GROQ_API_KEY"],
      "npm": "@ai-sdk/groq",
      "models": {
        "qwen-3.6-27b": {
          "name": "Qwen 3.6 27B",
          "tool_call": true,
          "temperature": true,
          "limit": { "context": 131072, "output": 8192 }
        }
      }
    }
  }
}
```

## CLI and TUI Changes

Add commands:

- `codyx setup models`
  - guided provider/local setup.
- `codyx models refresh`
  - refresh online/provider/local catalog.
- `codyx models recommend`
  - show hardware report and suggested local models.
- `codyx engines list`
  - show Ollama/GGUF/LM Studio status.
- `codyx engines install ollama`
  - install or guide install.
- `codyx engines install llama-cpp`
  - install managed GGUF server.
- `codyx engines start llama-cpp --model <id>`
  - start local engine for a discovered GGUF.

TUI:

- Add model source filter tabs:
  - Local
  - Free-key online
  - Paid online
  - All
- Show model health:
  - key missing,
  - engine stopped,
  - model not downloaded,
  - ready.

## Installer Flow Changes

Update:

- `script/install.ps1`
- `script/install.sh`
- `script/launcher.ps1`

Phases:

1. Install core prerequisites.
2. Detect hardware.
3. Ask online/local provider preference.
4. Install selected local engine if requested.
5. Pull/download recommended local model if requested.
6. Configure selected online providers if keys are present.
7. Generate Codyx config.
8. Run health check against selected model.

Important launcher change:

- Add a developer/local branch escape hatch:
  - `CODY_SKIP_UPDATE_CHECK=1` already exists for the command.
  - Add installer/launcher option `CODYX_NO_AUTO_REPAIR=1` for development installs.
  - In production end-user installs, keep auto-repair but never reset generated config.

## Testing Plan

Automated:

- Unit tests for hardware tier calculation.
- Unit tests for provider preset generation.
- Unit tests for model recommendation boundaries.
- Unit tests for config merge and no-overwrite behavior.

Script tests:

- Windows PowerShell dry run:
  - no engines,
  - Ollama installed/no models,
  - Ollama installed/models,
  - GGUF files present,
  - low RAM machine profile,
  - NVIDIA GPU profile.

Manual smoke tests:

- Fresh Windows install with no keys.
- Fresh Windows install with Gemini key.
- Fresh Windows install with Groq key.
- Ollama install and pull small model.
- GGUF engine install and serve one Q4 model.
- Launcher update does not wipe `.cody/generated`.

Validation commands:

```powershell
bun typecheck
X:\codyx-orchestrator\codyx.cmd models
X:\codyx-orchestrator\codyx.cmd models refresh
X:\codyx-orchestrator\codyx.cmd run --model <selected-model> "Say pong only"
```

## Milestones

### Milestone 1: Provider Presets

- Add provider preset registry.
- Add Gemini, Groq, OpenRouter, Cerebras config generation.
- Add `codyx setup models` basic online provider path.
- Test one key-based provider end to end.

### Milestone 2: Hardware Detection

- Add system detection scripts.
- Add recommendation scripts.
- Write `.cody/generated/model-recommendations.json`.
- Show recommendations in installer.

### Milestone 3: Ollama Managed Path

- Install/detect Ollama.
- Pull recommended model.
- Generate Ollama provider config.
- Health-check local model.

### Milestone 4: GGUF Managed Path

- Install llama.cpp server.
- Detect GGUF files.
- Serve selected model.
- Generate llama.cpp provider config.
- Health-check OpenAI-compatible endpoint.

### Milestone 5: TUI Model Source UX

- Add source filters and health labels.
- Add "fix" actions for missing key/engine/model.

### Milestone 6: Installer Hardening

- Protect generated config from auto-repair.
- Add development branch/update escape hatch.
- Add logs and user-readable reports.

## Risks

- Provider free tiers change often. Keep presets configurable and avoid hard promises about free usage.
- Silent engine installs can be invasive. Always ask before installing third-party engines.
- GGUF model downloads can be huge. Require disk estimate and confirmation.
- Hardware detection can be imperfect. Show recommendations as guidance, not guarantees.
- Launcher auto-repair can remove tracked local experiments. Development workflow must use a branch and skip auto-update.

## Immediate Next Steps

1. Implement provider preset registry and Gemini/Groq config generation.
2. Add `codyx setup models` minimal online-provider wizard.
3. Add hardware detection script and recommendation JSON.
4. Extend installer model discovery phase to offer Ollama installation.
5. Add `CODYX_NO_AUTO_REPAIR=1` for developer installs on `end-user-x`.

## Implementation Status

- 2026-09-17: Started Milestone 1 on branch `end-user-x`.
  - Added provider preset registry for Google Gemini, Groq, OpenRouter, and Cerebras.
  - Added `codyx setup models` with `--list`, `--provider`, `--model`, and `--yes`.
  - Generated provider config writes to `CODY_CONFIG_DIR` when launched through `codyx.cmd`, preserving the installer's generated-config location.
  - Verified generated Groq config loads through `models groq` in a temporary config directory.
- 2026-09-17: Started the local-model path.
  - Added Ollama and llama.cpp/GGUF presets using OpenAI-compatible local endpoints.
  - Added Llama local model choices for Ollama and a Llama GGUF alias for llama.cpp.
  - Added basic RAM/CPU detection to `codyx setup models --list`.
  - Added local engine detection for Ollama and llama.cpp, including version output and Windows `winget` update/install hints.
  - Filtered interactive local model choices to models that fit the detected system RAM by default.
  - Added local-model recommendation hints and setup instructions for Ollama model pulls and llama.cpp aliasing.
  - Verified generated Ollama config in an isolated temporary config directory.
- 2026-09-19: Wired the Windows installer into the local-engine flow.
  - Added installer detection for Ollama and llama.cpp executables.
  - Added installed-version display and Windows `winget` update checks.
  - Added prompted Ollama install/update, prompted llama.cpp install/update, and hardware-ranked Ollama model choices.
  - Added model pull and generated-config setup after successful Ollama pull, with discovery ordered before final default-model config generation.
