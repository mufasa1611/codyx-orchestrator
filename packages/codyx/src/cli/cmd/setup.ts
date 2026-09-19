import type { Argv } from "yargs"
import { UI } from "../ui"
import * as prompts from "@clack/prompts"
import { Installation } from "../../installation"
import { InstallationVersion } from "@cody/core/installation/version"
import os from "os"
import path from "path"
import fs from "fs/promises"
import { existsSync } from "fs"
import { execFileSync, execSync } from "child_process"
import { parse as parseJsonc } from "jsonc-parser"
import { ProviderPreset } from "@/provider/preset"

interface CheckResult {
  ok: boolean
  detail?: string
}

type JsonRecord = Record<string, unknown>

type SetupArgs = {
  section?: string
  provider?: string
  model?: string
  list?: boolean
  yes?: boolean
}

type EngineStatus = {
  installed: boolean
  command?: string
  version?: string
  update?: "available" | "current" | "unknown"
  installCommand?: string
  updateCommand?: string
}

function checkExecutable(name: string): CheckResult {
  const paths = process.env.PATH?.split(path.delimiter) ?? []
  const isWin = os.platform() === "win32"
  const extensions = isWin ? ["", ".exe", ".cmd", ".bat", ".ps1"] : [""]
  for (const dir of paths) {
    for (const ext of extensions) {
      const full = path.join(dir, `${name}${ext}`)
      if (existsSync(full)) return { ok: true, detail: `${name} found` }
    }
  }
  return { ok: false, detail: `"${name}" not found on PATH` }
}

function findNativeBinary(startDir: string): string | null {
  const platformMap: Record<string, string> = { darwin: "darwin", linux: "linux", win32: "windows" }
  const archMap: Record<string, string> = { x64: "x64", arm64: "arm64", arm: "arm" }
  const platform = platformMap[os.platform()] || os.platform()
  const arch = archMap[os.arch()] || os.arch()
  const base = `cody-${platform}-${arch}`
  const binary = platform === "windows" ? "cody.exe" : "cody"

  let current = startDir
  for (;;) {
    const modules = path.join(current, "node_modules")
    const candidate = path.join(modules, base, "bin", binary)
    if (existsSync(candidate)) return candidate
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  return null
}

async function resolveCliBinary(): Promise<string | null> {
  const binName = "codyx"
  try {
    const cmd = os.platform() === "win32" ? `where ${binName}` : `which ${binName}`
    const out = execSync(cmd, { encoding: "utf8", timeout: 5000 }).trim().split("\n")[0].trim()
    if (out) return out
  } catch {}
  return null
}

async function isAutoStartEnabled(): Promise<boolean> {
  const plat = os.platform()
  if (plat === "win32") {
    try {
      const out = execSync(
        `reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "codyx" 2>nul`,
        { encoding: "utf8", timeout: 5000 },
      )
      return out.includes("codyx")
    } catch {
      return false
    }
  }
  if (plat === "darwin") {
    const plist = path.join(os.homedir(), "Library", "LaunchAgents", "com.codyx.plist")
    return existsSync(plist)
  }
  const desktop = path.join(os.homedir(), ".config", "autostart", "codyx.desktop")
  return existsSync(desktop)
}

async function enableAutoStart(): Promise<boolean> {
  const cliBin = await resolveCliBinary()
  if (!cliBin) return false

  const plat = os.platform()
  try {
    if (plat === "win32") {
      const escaped = `${cliBin} serve`.replace(/"/g, '\\"')
      execSync(
        `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "codyx" /t REG_SZ /d "${escaped}" /f`,
        { encoding: "utf8", timeout: 10000 },
      )
      return true
    }
    if (plat === "darwin") {
      const plistDir = path.join(os.homedir(), "Library", "LaunchAgents")
      await fs.mkdir(plistDir, { recursive: true })
      const plist = path.join(plistDir, "com.codyx.plist")
      await fs.writeFile(
        plist,
        `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.codyx</string>
  <key>ProgramArguments</key>
  <array>
    <string>${cliBin}</string>
    <string>serve</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <false/>
</dict>
</plist>\n`,
        "utf8",
      )
      execSync("launchctl load " + plist, { encoding: "utf8", timeout: 10000 })
      return true
    }
    const autoDir = path.join(os.homedir(), ".config", "autostart")
    await fs.mkdir(autoDir, { recursive: true })
    const autostart = path.join(autoDir, "codyx.desktop")
    await fs.writeFile(
      autostart,
      `[Desktop Entry]
Type=Application
Name=codyx
Comment=AI coding assistant server
Exec=${cliBin} serve
X-GNOME-Autostart-enabled=true\n`,
      "utf8",
    )
    // Also create application menu entry so it appears in the launcher
    const appsDir = path.join(os.homedir(), ".local", "share", "applications")
    await fs.mkdir(appsDir, { recursive: true })
    const menuEntry = path.join(appsDir, "codyx.desktop")
    await fs.writeFile(
      menuEntry,
      `[Desktop Entry]
Type=Application
Name=codyx
Comment=AI coding assistant server
Exec=${cliBin} serve
Terminal=false
Categories=Development;Utility;\n`,
      "utf8",
    )
    return true
  } catch {
    return false
  }
}

async function disableAutoStart(): Promise<boolean> {
  const plat = os.platform()
  try {
    if (plat === "win32") {
      execSync(
        `reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "codyx" /f 2>nul`,
        { encoding: "utf8", timeout: 10000 },
      )
      return true
    }
    if (plat === "darwin") {
      const plist = path.join(os.homedir(), "Library", "LaunchAgents", "com.codyx.plist")
      execSync(`launchctl unload ${plist} 2>/dev/null || true`, { encoding: "utf8", timeout: 10000 })
      await fs.rm(plist, { force: true })
      return true
    }
    const desktop = path.join(os.homedir(), ".config", "autostart", "codyx.desktop")
    await fs.rm(desktop, { force: true })
    return true
  } catch {
    return false
  }
}

async function generateDefaultConfig(): Promise<boolean> {
  try {
    const dir = generatedConfigDir()
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(
      path.join(dir, "cody.jsonc"),
      `// codyx configuration
{
  "\$schema": "https://opencode.ai/schema/cody.jsonc",
  "models": {
    "provider": "auto"
  },
  "server": {
    "port": 4097
  }
}
`,
      "utf8",
    )
    return true
  } catch {
    return false
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function generatedConfigDir() {
  return process.env.CODY_CONFIG_DIR || path.join(process.cwd(), ".cody", "generated")
}

async function readJsoncRecord(filepath: string): Promise<JsonRecord> {
  try {
    const data = parseJsonc(await fs.readFile(filepath, "utf8"))
    if (isRecord(data)) return data
    return {}
  } catch {
    return {}
  }
}

async function readGeneratedConfig() {
  const generatedDir = generatedConfigDir()
  const base = await readJsoncRecord(path.join(generatedDir, "cody.json"))
  const overlay = await readJsoncRecord(path.join(generatedDir, "cody.jsonc"))
  return { ...base, ...overlay }
}

async function writeGeneratedConfig(config: JsonRecord) {
  const generatedDir = generatedConfigDir()
  await fs.mkdir(generatedDir, { recursive: true })
  await fs.writeFile(
    path.join(generatedDir, "cody.jsonc"),
    `// Generated by codyx setup models. Safe to regenerate.
${JSON.stringify(config, null, 2)}
`,
    "utf8",
  )
}

function printProviderPresets() {
  const hardware = hardwareProfile()
  UI.println(`System: ${hardware.memoryGB} GB RAM, ${hardware.cpuCount} CPU threads, ${hardware.platform}/${hardware.arch}`)
  UI.empty()

  for (const providerID of ProviderPreset.providerIDs()) {
    const provider: ProviderPreset.PresetProvider = ProviderPreset.presets[providerID]
    UI.println(`${provider.id} - ${provider.name} [${provider.mode}]`)
    if (provider.env.length > 0) UI.println(`  key: ${provider.env.join(", ")}`)
    if (provider.engine) {
      UI.println(`  engine: ${provider.engine}`)
      printEngineStatus(provider, "  ")
    }
    UI.println(`  setup: ${provider.setupUrl}`)
    UI.println(`  note: ${provider.freeTierNote}`)
    for (const [modelID, model] of Object.entries(provider.models)) {
      const recommended = recommendedModel(provider, hardware)
      const marker = modelID === recommended ? " (recommended)" : modelID === provider.defaultModel ? " (default)" : ""
      const memory = model.minMemoryGB ? `, ${model.minMemoryGB} GB+ RAM` : ""
      UI.println(`  - ${modelID}${marker}: ${model.name}${memory}`)
    }
    UI.empty()
  }
}

function hardwareProfile() {
  return {
    memoryGB: Math.max(1, Math.floor(os.totalmem() / 1024 / 1024 / 1024)),
    cpuCount: os.cpus().length,
    platform: os.platform(),
    arch: os.arch(),
  }
}

function fittingModelIDs(provider: ProviderPreset.PresetProvider, hardware = hardwareProfile()) {
  const ids = Object.keys(provider.models)
  if (provider.mode !== "local") return ids

  const fitting = ids.filter((id) => (provider.models[id].minMemoryGB ?? 0) <= hardware.memoryGB)
  return fitting.length > 0 ? fitting : ids
}

function recommendedModel(provider: ProviderPreset.PresetProvider, hardware = hardwareProfile()) {
  if (provider.mode !== "local") return provider.defaultModel

  const fitting = fittingModelIDs(provider, hardware)
    .map((id) => [id, provider.models[id]] as const)
    .sort(([, a], [, b]) => (b.minMemoryGB ?? 0) - (a.minMemoryGB ?? 0))

  return fitting[0]?.[0] ?? provider.defaultModel
}

function providerHint(provider: ProviderPreset.PresetProvider) {
  if (provider.mode === "local") return provider.engine ?? "local"
  return provider.env.join(", ")
}

function localInstallCommand(provider: ProviderPreset.PresetProvider) {
  if (provider.engine === "ollama") {
    if (os.platform() === "win32") return "winget install -e --id Ollama.Ollama"
    if (os.platform() === "darwin") return "brew install --cask ollama"
    return "Install Ollama from https://ollama.com/download/linux"
  }
  if (provider.engine === "llama.cpp") {
    if (os.platform() === "win32") return "winget install -e --id ggml.llamacpp"
    if (os.platform() === "darwin") return "brew install llama.cpp"
    return "Install llama.cpp from https://github.com/ggerganov/llama.cpp"
  }
}

function localUpdateCommand(provider: ProviderPreset.PresetProvider) {
  if (os.platform() !== "win32") return
  if (provider.engine === "ollama") return "winget upgrade -e --id Ollama.Ollama"
  if (provider.engine === "llama.cpp") return "winget upgrade -e --id ggml.llamacpp"
}

function findExecutable(names: string[], extraCandidates: string[] = []) {
  const isWin = os.platform() === "win32"
  const extensions = isWin ? ["", ".exe", ".cmd", ".bat", ".ps1"] : [""]
  const paths = process.env.PATH?.split(path.delimiter) ?? []

  for (const candidate of extraCandidates) {
    if (candidate && existsSync(candidate)) return candidate
  }
  for (const dir of paths) {
    for (const name of names) {
      for (const ext of extensions) {
        const full = path.join(dir, `${name}${ext}`)
        if (existsSync(full)) return full
      }
    }
  }
}

function versionOutput(command: string, args: string[]) {
  try {
    const output = execFileSync(command, args, {
      encoding: "utf8",
      timeout: 5000,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    })
    const lines = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
    const line = lines.find((item) => /version/i.test(item) && !/could not connect/i.test(item)) ?? lines[0]
    return line?.replace(/^Warning:\s*/i, "")
  } catch {
    return
  }
}

function wingetUpgradeStatus(packageID: string): EngineStatus["update"] {
  if (os.platform() !== "win32") return "unknown"
  try {
    const output = execSync(`winget list --id ${packageID} --exact --source winget`, {
      encoding: "utf8",
      timeout: 15000,
      windowsHide: true,
    })
    const line = output
      .split(/\r?\n/)
      .map((item) => item.trim())
      .find((item) => item.includes(packageID))
    if (line) {
      const parts = line.split(/\s+/)
      const idIndex = parts.findIndex((part) => part === packageID)
      if (idIndex >= 0 && parts.length - idIndex >= 3) return "available"
      return "current"
    }
  } catch {}

  try {
    const output = execSync(`winget upgrade --id ${packageID} --exact --source winget`, {
      encoding: "utf8",
      timeout: 15000,
      windowsHide: true,
    })
    return output.includes(packageID) ? "available" : "current"
  } catch {
    return "unknown"
  }
}

function localEngineStatus(provider: ProviderPreset.PresetProvider): EngineStatus | undefined {
  if (provider.engine === "ollama") {
    const command = findExecutable(["ollama"], [
      path.join(process.env.LOCALAPPDATA ?? "", "Programs", "Ollama", "ollama.exe"),
      path.join(process.env.ProgramFiles ?? "", "Ollama", "ollama.exe"),
    ])
    return {
      installed: Boolean(command),
      command,
      version: command ? versionOutput(command, ["--version"]) : undefined,
      update: command ? wingetUpgradeStatus("Ollama.Ollama") : undefined,
      installCommand: localInstallCommand(provider),
      updateCommand: localUpdateCommand(provider),
    }
  }
  if (provider.engine === "llama.cpp") {
    const command = findExecutable(["llama-server", "llama-cli"])
    return {
      installed: Boolean(command),
      command,
      version: command ? versionOutput(command, ["--version"]) : undefined,
      update: command ? wingetUpgradeStatus("ggml.llamacpp") : undefined,
      installCommand: localInstallCommand(provider),
      updateCommand: localUpdateCommand(provider),
    }
  }
}

function printEngineStatus(provider: ProviderPreset.PresetProvider, indent = "") {
  const status = localEngineStatus(provider)
  if (!status) return

  if (!status.installed) {
    UI.println(`${indent}status: not installed`)
    if (status.installCommand) UI.println(`${indent}install: ${status.installCommand}`)
    return
  }

  UI.println(`${indent}status: installed${status.version ? ` (${status.version})` : ""}`)
  if (status.update === "available" && status.updateCommand) UI.println(`${indent}update: ${status.updateCommand}`)
  if (status.update === "current") UI.println(`${indent}update: current`)
}

async function setupModels(args: SetupArgs) {
  UI.empty()
  prompts.intro("codyx Model Setup")

  if (args.list) {
    printProviderPresets()
    prompts.outro("Use: codyx setup models --provider <id> --model <model>")
    return
  }

  const presetIDs = ProviderPreset.providerIDs()
  const providerID = args.provider
    ? args.provider
    : ((await prompts.select({
        message: "Choose a provider preset",
        options: presetIDs.map((id) => {
          const provider = ProviderPreset.presets[id]
          return {
            label: provider.name,
            value: provider.id,
            hint: providerHint(provider),
          }
        }),
      })) as string)

  if (prompts.isCancel(providerID)) {
    prompts.outro("Cancelled")
    return
  }

  const provider = ProviderPreset.get(providerID)
  if (!provider) {
    prompts.log.error(`Unknown provider preset: ${providerID}`)
    printProviderPresets()
    prompts.outro("No changes made")
    return
  }

  const models: Record<string, ProviderPreset.PresetModel> = provider.models
  const hardware = hardwareProfile()
  const modelIDs = provider.mode === "local" && !args.model ? fittingModelIDs(provider, hardware) : Object.keys(models)
  const recommended = recommendedModel(provider, hardware)
  const requestedModel = args.model ?? recommended

  if (provider.mode === "local") {
    prompts.log.info(`Detected system: ${hardware.memoryGB} GB RAM, ${hardware.cpuCount} CPU threads`)
    const status = localEngineStatus(provider)
    if (status?.installed) {
      prompts.log.success(`${provider.engine} installed${status.version ? `: ${status.version}` : ""}`)
      if (status.update === "available" && status.updateCommand) {
        prompts.log.warn(`${provider.engine} update available: ${status.updateCommand}`)
      }
    } else {
      prompts.log.warn(`${provider.engine ?? "Local engine"} is not installed or not on PATH.`)
      if (status?.installCommand) prompts.log.info(`Install command: ${status.installCommand}`)
    }
  }

  const modelID =
    args.model || args.yes
      ? requestedModel
      : ((await prompts.select({
          message: `Choose a ${provider.name} model`,
          initialValue: recommended,
          options: modelIDs.map((id) => ({
            label: models[id].name,
            value: id,
            hint:
              id === recommended
                ? `recommended for ${hardware.memoryGB} GB RAM`
                : models[id].minMemoryGB
                  ? `${models[id].minMemoryGB} GB+ RAM`
                  : id,
          })),
        })) as string)

  if (prompts.isCancel(modelID)) {
    prompts.outro("Cancelled")
    return
  }
  if (!models[modelID]) {
    prompts.log.error(`Unknown model for ${provider.id}: ${modelID}`)
    prompts.log.info(`Available: ${Object.keys(models).join(", ")}`)
    prompts.outro("No changes made")
    return
  }

  const config = await readGeneratedConfig()
  const providers = isRecord(config.provider) ? config.provider : {}
  config.$schema = typeof config.$schema === "string" ? config.$schema : "https://opencode.ai/schema/cody.jsonc"
  config.model = `${provider.id}/${modelID}`
  config.provider = {
    ...providers,
    [provider.id]: ProviderPreset.providerConfig(provider),
  }

  await writeGeneratedConfig(config)

  prompts.log.success(`Configured default model: ${config.model}`)
  prompts.log.info(`Wrote ${path.join(generatedConfigDir(), "cody.jsonc")}`)
  if (provider.mode === "local") {
    const status = localEngineStatus(provider)
    if (!status?.installed && status?.installCommand) prompts.log.info(`Engine install: ${status.installCommand}`)
    if (status?.installed && status.update === "available" && status.updateCommand) {
      prompts.log.info(`Engine update: ${status.updateCommand}`)
    }
    const installHint = models[modelID].installHint
    if (installHint) prompts.log.info(`Model setup: ${installHint}`)
    prompts.log.info(provider.freeTierNote)
  } else {
    for (const envName of provider.env) {
      if (process.env[envName]) continue
      prompts.log.warn(`${envName} is not set in this shell.`)
      if (os.platform() === "win32") {
        prompts.log.info(`Set it after creating a key: setx ${envName} "your-key"`)
      } else {
        prompts.log.info(`Set it after creating a key: export ${envName}="your-key"`)
      }
    }
    prompts.log.info(`Get a key: ${provider.setupUrl}`)
    prompts.log.info(provider.freeTierNote)
  }
  prompts.outro("Model setup complete")
}

async function ensureUserMemo() {
  const memoPath = path.join(process.cwd(), "memo.md")
  const existing = await fs.readFile(memoPath, "utf8").catch(() => "")
  if (existing.includes("username:")) return

  const name = await prompts.text({
    message: "What would you like codyx to call you?",
    placeholder: "Your name",
    validate: (value) => {
      if (!value) return "Name is required"
      const trimmed = value.trim()
      if (!trimmed) return "Name is required"
      if (trimmed.length > 100) return "Keep it under 100 characters"
    },
  })
  if (prompts.isCancel(name)) {
    prompts.outro("Cancelled")
    process.exit(0)
  }
  if (typeof name !== "string") return

  const trimmed = name.trim()
  const base = existing.trim()
  const content = base
    ? `${base}\n\n## User\n- username: ${trimmed}\n`
    : `# Private Workspace Memo
*Note: This file is Gitignored and contains private machine-specific info.*

## User
- username: ${trimmed}
`
  await fs.writeFile(memoPath, content, "utf8")
  prompts.log.info(`Saved your username in ${memoPath}`)
}

export const SetupCommand = {
  command: "setup [section]",
  describe: "first-run setup wizard — check health, configure auto-start, proxy, and more",
  builder: (yargs: Argv) =>
    yargs
      .positional("section", {
        describe: "setup section to run",
        choices: ["models"] as const,
      })
      .option("provider", {
        describe: "provider preset id for setup models",
        type: "string",
      })
      .option("model", {
        describe: "model id for setup models",
        type: "string",
      })
      .option("list", {
        describe: "list available setup model provider presets",
        type: "boolean",
      })
      .option("yes", {
        alias: "y",
        describe: "accept defaults for setup models",
        type: "boolean",
      }),
  handler: async (args: SetupArgs) => {
    if (args.section === "models") {
      await setupModels(args)
      return
    }

    UI.empty()
    prompts.intro("codyx Setup")

    const method = await Installation.method()
    prompts.log.info(`Installation method: ${method}`)
    prompts.log.info(`Version: ${InstallationVersion}`)
    prompts.log.info(`Platform: ${os.platform()} ${os.arch()}`)
    UI.empty()

    await ensureUserMemo()
    UI.empty()

    // --- Health checks ---
    const checks: Array<{ label: string; result: CheckResult }> = []

    const bunCheck = checkExecutable("bun")
    checks.push({ label: "Bun", result: bunCheck })

    const gitCheck = checkExecutable("git")
    checks.push({ label: "Git", result: gitCheck })

    const scriptDir = path.dirname(process.execPath)
    const cached = path.join(scriptDir, ".cody")
    let binCheck: CheckResult
    if (existsSync(cached)) {
      binCheck = { ok: true, detail: "cached binary" }
    } else {
      const checkDir = path.dirname(path.dirname(scriptDir))
      const found = findNativeBinary(checkDir)
      if (found) {
        binCheck = { ok: true, detail: path.basename(found) }
      } else {
        binCheck = { ok: false, detail: "native binary not found" }
      }
    }
    checks.push({ label: "Native binary", result: binCheck })

    const proxyEnabled = process.env.CODY_PROXY_ENABLED === "1"
    const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || ""
    checks.push({
      label: "Proxy",
      result: proxyEnabled && proxyUrl ? { ok: true, detail: proxyUrl } : { ok: false, detail: "not configured" },
    })

    const ollamaCheck = checkExecutable("ollama")
    checks.push({ label: "Ollama", result: ollamaCheck })

    const autoStart = await isAutoStartEnabled()
    checks.push({ label: "Auto-start", result: { ok: autoStart } })

    UI.println(`  ${UI.Style.TEXT_DIM}System Health:${UI.Style.TEXT_NORMAL}`)
    for (const c of checks) {
      const icon = c.result.ok ? "✓" : "✗"
      const detail = c.result.detail ? ` (${c.result.detail})` : ""
      const color = c.result.ok ? UI.Style.TEXT_SUCCESS : UI.Style.TEXT_WARNING
      UI.println(`  ${color}${icon} ${c.label}${detail}${UI.Style.TEXT_NORMAL}`)
    }
    UI.empty()

    // --- Auto-start configuration ---
    if (!autoStart) {
      const wantAuto = await prompts.select({
        message: "Start codyx automatically when you log in?",
        options: [
          { label: "Yes", value: true, hint: "recommended for background server" },
          { label: "No", value: false },
        ],
        initialValue: true,
      })
      if (prompts.isCancel(wantAuto)) {
        prompts.outro("Cancelled")
        return
      }
      if (wantAuto) {
        const spin = prompts.spinner()
        spin.start("Configuring auto-start...")
        const ok = await enableAutoStart()
        if (ok) spin.stop("Auto-start configured")
        else spin.stop("Failed to configure auto-start", 1)
      }
    } else {
      const wantRemove = await prompts.select({
        message: "Auto-start is currently enabled. Keep it?",
        options: [
          { label: "Keep enabled", value: false },
          { label: "Disable", value: true },
        ],
        initialValue: false,
      })
      if (prompts.isCancel(wantRemove)) {
        prompts.outro("Cancelled")
        return
      }
      if (wantRemove) {
        const spin = prompts.spinner()
        spin.start("Disabling auto-start...")
        const ok = await disableAutoStart()
        if (ok) spin.stop("Auto-start disabled")
        else spin.stop("Failed to disable auto-start", 1)
      }
    }

    // --- Proxy configuration ---
    if (!proxyEnabled || !proxyUrl) {
      const wantProxy = await prompts.select({
        message: "Configure a network proxy for remote access?",
        options: [
          { label: "Yes", value: true, hint: "for connecting from other devices" },
          { label: "No", value: false, hint: "local-only use" },
        ],
        initialValue: false,
      })
      if (prompts.isCancel(wantProxy)) {
        prompts.outro("Cancelled")
        return
      }
      if (wantProxy) {
        const proxyInput = await prompts.text({
          message: "Proxy URL (e.g. https://your-server:9999):",
          placeholder: "https://",
          validate: (v) => (v ? undefined : "Proxy URL is required"),
        })
        if (prompts.isCancel(proxyInput)) {
          prompts.outro("Cancelled")
          return
        }
        prompts.log.info(`Set CODY_PROXY_ENABLED=1 and HTTPS_PROXY=${proxyInput} in your shell profile or .env`)
        prompts.log.step("Add the following to your shell profile (~/.bashrc, ~/.zshrc, etc.):")
        prompts.log.info(`  export CODY_PROXY_ENABLED=1`)
        prompts.log.info(`  export HTTPS_PROXY=${proxyInput}`)
        UI.empty()
      }
    }

    // --- Ollama installation suggestion ---
    if (!ollamaCheck.ok) {
      const wantOllama = await prompts.select({
        message: "Ollama (local AI models) is not installed. Install it?",
        options: [
          { label: "Yes, show install instructions", value: true },
          { label: "Skip", value: false },
        ],
        initialValue: false,
      })
      if (prompts.isCancel(wantOllama)) {
        prompts.outro("Cancelled")
        return
      }
      if (wantOllama) {
        UI.empty()
        prompts.log.step("Install Ollama from:")
        if (os.platform() === "win32") {
          prompts.log.info("  Download from https://ollama.com/download/windows")
        } else if (os.platform() === "darwin") {
          prompts.log.info("  Download from https://ollama.com/download/mac")
        } else {
          prompts.log.info("  Run: curl -fsSL https://ollama.com/install.sh | sh")
        }
        UI.empty()
      }
    }

    // --- Config generation (if missing) ---
    const configPaths = [
      path.join(process.cwd(), ".cody", "generated", "cody.jsonc"),
      path.join(process.cwd(), ".cody", "generated", "cody.json"),
    ]
    let configMissing = true
    for (const cp of configPaths) {
      try {
        await fs.access(cp)
        configMissing = false
        break
      } catch {}
    }
    if (configMissing) {
      const wantConfig = await prompts.select({
        message: "No configuration file found. Generate a default one?",
        options: [
          { label: "Yes", value: true, hint: "creates .cody/generated/cody.jsonc" },
          { label: "No", value: false },
        ],
        initialValue: true,
      })
      if (prompts.isCancel(wantConfig)) {
        prompts.outro("Cancelled")
        return
      }
      if (wantConfig) {
        const spin = prompts.spinner()
        spin.start("Generating default config...")
        const ok = await generateDefaultConfig()
        if (ok) spin.stop("Default config created at .cody/generated/cody.jsonc")
        else spin.stop("Failed to generate config", 1)
      }
    }

    // --- Summary & next steps ---
    UI.empty()
    prompts.log.success("Setup complete!")
    UI.empty()
    prompts.log.step("Next steps:")
    prompts.log.info("  1. Start the server:  codyx serve")
    prompts.log.info("  2. Open the web UI:   codyx web")
    prompts.log.info("  3. Run diagnostics:   codyx doctor")
    prompts.log.info("  4. Get help:          codyx --help")
    UI.empty()
    prompts.outro("Happy coding with codyx!")
  },
}

