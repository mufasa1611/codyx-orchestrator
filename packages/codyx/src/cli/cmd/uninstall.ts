import type { Argv } from "yargs"
import { UI } from "../ui"
import * as prompts from "@clack/prompts"
import { Installation } from "../../installation"
import { Global } from "@cody/core/global"
import fs from "fs/promises"
import path from "path"
import os from "os"
import { spawn } from "child_process"
import { Filesystem } from "@/util/filesystem"
import { Process } from "@/util/process"

interface UninstallArgs {
  keepConfig: boolean
  keepData: boolean
  dryRun: boolean
  force: boolean
}

interface RemovalTargets {
  directories: Array<{ path: string; label: string; keep: boolean }>
  markedPaths: Array<{ path: string; label: string }>
  pathEntries: string[]
  packageCommands: Array<{ label: string; command: string[] }>
  shellConfig: string | null
  binary: string | null
  startMenu: string[]
  globalShims: string[]
  managedTools: ManagedTool[]
  envProxy: string | null
  installRoot: string | null
  installMarkers: string[]
}

interface ExecuteUninstallOptions {
  terminateOtherProcesses?: boolean
}

interface ManagedTool {
  name?: string
  manager?: string
  packageId?: string
  path?: string
  pathAdds?: string[]
}

interface InstallMarker {
  root?: string
  installed?: string[]
  pathAdds?: string[]
  shortcuts?: string[]
  shims?: string[]
  markerPaths?: string[]
  jsInstall?: {
    manager?: string
    packageName?: string
    packageSpec?: string
  }
  managedTools?: ManagedTool[]
}

function packageCommandForMethod(method: Installation.Method, packageName = "codyx-ai") {
  const commands: Partial<Record<Installation.Method, string[]>> = {
    npm: ["npm", "uninstall", "-g", packageName],
    pnpm: ["pnpm", "uninstall", "-g", packageName],
    bun: ["bun", "remove", "-g", packageName],
    yarn: ["yarn", "global", "remove", packageName],
    brew: ["brew", "uninstall", "codyx"],
    choco: ["choco", "uninstall", "codyx"],
    scoop: ["scoop", "uninstall", "codyx"],
  }
  return commands[method]
}

export const UninstallCommand = {
  command: "uninstall",
  describe: "uninstall codyx and remove all related files",
  builder: (yargs: Argv) =>
    yargs
      .option("keep-config", {
        alias: "c",
        type: "boolean",
        describe: "keep configuration files",
        default: false,
      })
      .option("keep-data", {
        alias: "d",
        type: "boolean",
        describe: "keep session data and snapshots",
        default: false,
      })
      .option("dry-run", {
        type: "boolean",
        describe: "show what would be removed without removing",
        default: false,
      })
      .option("force", {
        alias: "f",
        type: "boolean",
        describe: "skip confirmation prompts",
        default: false,
      }),

  handler: async (args: UninstallArgs) => {
    UI.empty()
    prompts.intro("Uninstall codyx")

    const method = await Installation.method()
    prompts.log.info(`Installation method: ${method}`)

    const targets = await collectRemovalTargets(args, method)

    await showRemovalSummary(targets, method, args.dryRun)

    if (!args.force && !args.dryRun) {
      const confirm = await prompts.confirm({
        message: "Are you sure you want to uninstall?",
        initialValue: false,
      })
      if (!confirm || prompts.isCancel(confirm)) {
        prompts.outro("Cancelled")
        return
      }
    }

    if (args.dryRun) {
      prompts.log.warn("Dry run - no changes made")
      prompts.outro("Done")
      return
    }

    const removalLog = await executeUninstall(method, targets)

    // Notify admin server about local uninstall (best-effort)
    try {
      const localAppData = process.env.LOCALAPPDATA
      if (localAppData) {
        const receiptPath = path.join(localAppData, "codyx-installer", "verification.json")
        try {
          await fs.access(receiptPath)
          const raw = await fs.readFile(receiptPath, "utf8")
          const data = JSON.parse(raw)
          if (data.server_url && data.install_id && data.receipt) {
            const base = String(data.server_url).replace(/\/+$/, "")
            await fetch(`${base}/v1/uninstall`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ install_id: data.install_id, receipt: data.receipt }),
            }).catch(() => {})
          }
        } catch {}
      }
    } catch {}

    await generateRemovalLog(removalLog)

    if (!args.force) await askRemoveOptionalDeps(targets.managedTools)

    prompts.outro("Done")
  },
}

export async function collectRemovalTargets(args: UninstallArgs, method: Installation.Method): Promise<RemovalTargets> {
  const directories: RemovalTargets["directories"] = [
    { path: Global.Path.data, label: "Data", keep: args.keepData },
    { path: Global.Path.cache, label: "Cache", keep: false },
    { path: Global.Path.config, label: "Config", keep: args.keepConfig },
    { path: Global.Path.state, label: "State", keep: false },
  ]

  const localAppData = process.env.LOCALAPPDATA
  if (localAppData) {
    directories.push({
      path: path.join(localAppData, "codyx-installer"),
      label: "Installer Verification",
      keep: false,
    })
  }

  const shellConfig = method === "curl" ? await getShellConfigFile() : null
  const binary = method === "curl" ? process.execPath : null
  const marker = await readInstallMarker()

  // Find Start Menu shortcuts
  const startMenu = await findStartMenuShortcut(marker)

  // Find global command shims
  const globalShims = await findGlobalShims(marker)

  // Find .env.proxy
  const envProxy = await findEnvProxy(marker)
  const installRoot = marker?.root ?? process.env.CODY_INSTALL_ROOT ?? (await findDefaultInstallRoot())
  const installMarkers = uniqueStrings(
    [...(marker?.markerPaths ?? []), ...(installRoot ? [path.join(installRoot, ".codyx-install-marker")] : [])].filter(
      (entry) => path.basename(entry) === ".codyx-install-marker" || entry.endsWith("install-marker.json"),
    ),
  )

  return {
    directories,
    markedPaths: findMarkedPaths(marker, [
      ...startMenu,
      ...globalShims,
      ...(envProxy ? [envProxy] : []),
      ...installMarkers,
    ]),
    pathEntries: uniqueStrings(marker?.pathAdds ?? []),
    packageCommands: await findPackageCommands(method, marker),
    shellConfig,
    binary,
    startMenu,
    globalShims,
    managedTools: marker?.managedTools ?? [],
    envProxy,
    installRoot,
    installMarkers,
  }
}

async function showRemovalSummary(targets: RemovalTargets, method: Installation.Method, dryRun: boolean) {
  const prefix = dryRun ? "[DRY RUN] " : ""
  prompts.log.message(`${prefix}The following will be removed:`)

  for (const dir of targets.directories) {
    const exists = await fs
      .access(dir.path)
      .then(() => true)
      .catch(() => false)
    if (!exists) continue

    const size = await getDirectorySize(dir.path)
    const sizeStr = formatSize(size)
    const status = dir.keep ? UI.Style.TEXT_DIM + "(keeping)" : ""
    const mark = dir.keep ? "○" : "✓"
    prompts.log.info(`  ${mark} ${dir.label}: ${shortenPath(dir.path)} ${UI.Style.TEXT_DIM}(${sizeStr})${status}`)
  }

  for (const startMenu of targets.startMenu) {
    prompts.log.info(`  ✓ Start Menu: ${shortenPath(startMenu)}`)
  }

  for (const shim of targets.globalShims) {
    prompts.log.info(`  ✓ Shim: ${shortenPath(shim)}`)
  }

  for (const markedPath of targets.markedPaths) {
    prompts.log.info(`  ✓ Marked install path: ${shortenPath(markedPath.path)}`)
  }

  for (const entry of targets.pathEntries) {
    prompts.log.info(`  ✓ PATH entry: ${shortenPath(entry)}`)
  }

  for (const marker of targets.installMarkers) {
    prompts.log.info(`  ✓ Install marker: ${shortenPath(marker)}`)
  }

  for (const tool of targets.managedTools) {
    prompts.log.info(`  ✓ Tool installed by codyx: ${formatManagedTool(tool)}`)
  }

  if (targets.envProxy) {
    prompts.log.info(`  ✓ .env.proxy: ${shortenPath(targets.envProxy)}`)
  }

  if (targets.installRoot) {
    prompts.log.info(`  ✓ Install root: ${shortenPath(targets.installRoot)}`)
  }

  if (targets.binary) {
    prompts.log.info(`  ✓ Binary: ${shortenPath(targets.binary)}`)
  }

  if (targets.shellConfig) {
    prompts.log.info(`  ✓ Shell PATH in ${shortenPath(targets.shellConfig)}`)
  }

  for (const item of targets.packageCommands) {
    prompts.log.info(`  ✓ Package: ${item.command.join(" ")}`)
  }
}

function isSameOrSubPath(child: string, parent: string | null | undefined): boolean {
  if (!parent) return false
  const normChild = path.resolve(child).toLowerCase()
  const normParent = path.resolve(parent).toLowerCase()
  return normChild === normParent || normChild.startsWith(normParent + path.sep)
}

export async function executeUninstall(
  method: Installation.Method,
  targets: RemovalTargets,
  options: ExecuteUninstallOptions = {},
) {
  const spinner = prompts.spinner()
  const errors: string[] = []
  const removed: string[] = []
  const terminateOtherProcesses = options.terminateOtherProcesses ?? true

  // On Windows, stop other codyx processes that may hold file handles.
  // Do not use taskkill /im here: compiled installs run as codyx.exe, and
  // killing by image name also kills the uninstalling process before it can
  // finish cleanup or report remote admin completion.
  if (terminateOtherProcesses && os.platform() === "win32") {
    const script = [
      `$current = ${process.pid}`,
      `Get-Process codyx -ErrorAction SilentlyContinue |`,
      `  Where-Object { $_.Id -ne $current } |`,
      `  Stop-Process -Force -ErrorAction SilentlyContinue`,
    ].join("; ")
    spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }).unref()
    await new Promise((r) => setTimeout(r, 1500))
  }

  for (const dir of targets.directories) {
    if (dir.keep) {
      prompts.log.step(`Skipping ${dir.label} (--keep-${dir.label.toLowerCase()})`)
      continue
    }
    if (isSameOrSubPath(dir.path, targets.installRoot)) {
      prompts.log.step(`Deferring ${dir.label} cleanup to install root removal`)
      continue
    }
    const exists = await fs
      .access(dir.path)
      .then(() => true)
      .catch(() => false)
    if (!exists) continue

    spinner.start(`Removing ${dir.label}...`)
    const err = await removePathWithRenameFallback(dir.path)
    if (err) {
      spinner.stop(`Failed to remove ${dir.label}`, 1)
      errors.push(`${dir.label}: ${err.message}`)
      continue
    }
    removed.push(dir.path)
    spinner.stop(`Removed ${dir.label}`)
  }

  // Remove Start Menu shortcut
  for (const startMenu of targets.startMenu) {
    spinner.start(`Removing Start Menu shortcuts: ${path.basename(startMenu)}...`)
    const err = await removePathWithRenameFallback(startMenu)
    if (err) {
      spinner.stop("Failed to remove Start Menu shortcuts", 1)
      errors.push(`Start Menu: ${err.message}`)
    } else {
      removed.push(startMenu)
      spinner.stop("Removed Start Menu shortcuts")
    }
  }

  const startMenuDirs = new Set(
    targets.startMenu
      .map((entry) => path.dirname(entry))
      .filter((entry) => entry && entry !== "." && entry !== path.sep),
  )
  for (const dir of startMenuDirs) {
    const remaining = await fs.readdir(dir).catch(() => null)
    if (remaining && remaining.length === 0) {
      spinner.start(`Removing Start Menu folder: ${path.basename(dir)}...`)
      const err = await removePathWithRenameFallback(dir)
      if (err) {
        spinner.stop("Failed to remove Start Menu folder", 1)
        errors.push(`Start Menu folder ${dir}: ${err.message}`)
      } else {
        removed.push(dir)
        spinner.stop("Removed Start Menu folder")
      }
    }
  }

  // Remove global shims
  for (const shim of targets.globalShims) {
    spinner.start(`Removing shim: ${path.basename(shim)}...`)
    const err = await removePathWithRenameFallback(shim)
    if (err) {
      spinner.stop(`Failed to remove ${path.basename(shim)}`, 1)
      errors.push(`Shim ${shim}: ${err.message}`)
    } else {
      removed.push(shim)
      spinner.stop(`Removed ${path.basename(shim)}`)
    }
  }

  for (const entry of targets.pathEntries) {
    spinner.start(`Removing PATH entry: ${shortenPath(entry)}...`)
    const err = await removePathEntry(entry).catch((e) => e)
    if (err) {
      spinner.stop("Failed to remove PATH entry", 1)
      errors.push(`PATH ${entry}: ${err.message}`)
      continue
    }
    removed.push(`PATH entry: ${entry}`)
    spinner.stop("Removed PATH entry")
  }

  for (const item of targets.markedPaths) {
    if (isSameOrSubPath(item.path, targets.installRoot)) {
      prompts.log.step(`Deferring ${item.label} cleanup to install root removal`)
      continue
    }
    const exists = await fs
      .access(item.path)
      .then(() => true)
      .catch(() => false)
    if (!exists) continue

    spinner.start(`Removing ${item.label}: ${path.basename(item.path)}...`)
    const err = await removePathWithRenameFallback(item.path)
    if (err) {
      spinner.stop(`Failed to remove ${item.label}`, 1)
      errors.push(`${item.label} ${item.path}: ${err.message}`)
      continue
    }
    removed.push(item.path)
    spinner.stop(`Removed ${item.label}`)
  }

  // Remove .env.proxy
  if (targets.envProxy) {
    spinner.start("Removing .env.proxy...")
    const err = await fs.rm(targets.envProxy, { force: true }).catch((e) => e)
    if (err) {
      spinner.stop("Failed to remove .env.proxy", 1)
      errors.push(`.env.proxy: ${err.message}`)
    } else {
      removed.push(targets.envProxy)
      spinner.stop("Removed .env.proxy")
    }
  }

  for (const marker of targets.installMarkers) {
    if (isSameOrSubPath(marker, targets.installRoot)) {
      prompts.log.step("Deferring install marker cleanup to install root removal")
      continue
    }
    const exists = await fs
      .access(marker)
      .then(() => true)
      .catch(() => false)
    if (exists) {
      spinner.start("Removing install marker...")
      const err = await fs.rm(marker, { force: true }).catch((e) => e)
      if (err) {
        spinner.stop("Failed to remove install marker", 1)
        errors.push(`Install marker: ${err.message}`)
      } else {
        removed.push(marker)
        spinner.stop("Removed install marker")
      }
    }
  }

  // Clean shell config
  if (targets.shellConfig) {
    spinner.start("Cleaning shell config...")
    const err = await cleanShellConfig(targets.shellConfig).catch((e) => e)
    if (err) {
      spinner.stop("Failed to clean shell config", 1)
      errors.push(`Shell config: ${err.message}`)
    } else {
      spinner.stop("Cleaned shell config")
    }
  }

  for (const item of targets.packageCommands) {
    spinner.start(`Running ${item.command.join(" ")}...`)
    const result = await runCommandWithTimeout(item.command, 20_000)
    if (result.code !== 0) {
      spinner.stop(`Package cleanup failed: exit code ${result.code}`, 1)
      const text = `${result.stdout.toString("utf8")}\n${result.stderr.toString("utf8")}`
      if (item.command[0] === "choco" && text.includes("not running from an elevated command shell")) {
        prompts.log.warn("Run choco uninstall from an elevated command shell")
      } else {
        prompts.log.warn("Run manually: " + item.command.join(" "))
      }
    } else {
      removed.push(`package: ${item.label}`)
      spinner.stop("Package removed")
    }
  }

  if (method === "curl" && targets.binary) {
    if (targets.installRoot && isSameOrSubPath(targets.binary, targets.installRoot)) {
      // Defer to install root removal
    } else {
      UI.empty()
      prompts.log.message("To finish removing the binary, run:")
      prompts.log.info(`  rm "${targets.binary}"`)
      const binDir = path.dirname(targets.binary)
      if (binDir.includes(".cody")) {
        prompts.log.info(`  rmdir "${binDir}" 2>/dev/null`)
      }
    }
  }

  await removeManagedTools(targets.managedTools, removed, errors)

  // Remove memo.md inside install root
  if (targets.installRoot) {
    const memoPath = path.join(targets.installRoot, "memo.md")
    const exists = await fs
      .access(memoPath)
      .then(() => true)
      .catch(() => false)
    if (exists) {
      const err = await removePathWithRenameFallback(memoPath)
      if (err) {
        errors.push(`user memo ${memoPath}: ${err.message}`)
      } else {
        removed.push(`user memo: ${memoPath}`)
      }
    }
  }

  if (targets.installRoot) {
    const exists = await fs
      .access(targets.installRoot)
      .then(() => true)
      .catch(() => false)
    if (exists) {
      const root = targets.installRoot
      spinner.start("Scheduling install root removal...")
      const err = await scheduleInstallRootRemoval(root).catch((e) => e)
      if (err) {
        spinner.stop("Failed to schedule install root removal", 1)
        errors.push(`Install root: ${err.message}`)
      } else {
        removed.push(`scheduled root removal: ${root}`)
        spinner.stop("Scheduled install root removal")
      }
    }
  }

  if (errors.length > 0) {
    UI.empty()
    prompts.log.warn("Some operations failed:")
    for (const err of errors) {
      prompts.log.error(`  ${err}`)
    }
  }

  UI.empty()
  prompts.log.success("Thank you for using codyx!")

  return { removed, errors }
}

async function generateRemovalLog(log: { removed: string[]; errors: string[] }) {
  if (log.errors.length === 0) {
    prompts.log.info("No uninstall errors. No removal log was written.")
    return
  }

  const logDir = os.tmpdir()
  await fs.mkdir(logDir, { recursive: true }).catch(() => {})
  const logPath = path.join(logDir, `uninstall-${Date.now()}.log`)
  const lines = [
    `# codyx Uninstall Log`,
    `# Date: ${new Date().toISOString()}`,
    `# OS: ${os.platform()} ${os.release()}`,
    ``,
    `## Removed`,
    ...log.removed.map((r) => `  - ${r}`),
    ``,
    log.errors.length > 0 ? `## Errors\n${log.errors.map((e) => `  - ${e}`).join("\n")}` : "## Errors\n  (none)",
  ]
  await fs.writeFile(logPath, lines.join("\n"), "utf-8").catch(() => {})
  prompts.log.info(`Removal log: ${logPath}`)
}

function formatManagedTool(tool: ManagedTool) {
  const name = tool.name || "tool"
  if (tool.manager === "path" && tool.path) return `${name} (${shortenPath(tool.path)})`
  if (tool.packageId) return `${name} (${tool.manager || "package"}: ${tool.packageId})`
  return name
}

function managedToolCommand(tool: ManagedTool) {
  if (!tool.manager) return
  if (tool.manager === "path") return
  if (!tool.packageId) return

  const sudo = os.platform() === "win32" || process.getuid?.() === 0 ? [] : ["sudo"]
  const commands: Record<string, string[]> = {
    winget: ["winget", "uninstall", "--id", tool.packageId, "--exact", "--source", "winget", "--silent"],
    choco: ["choco", "uninstall", tool.packageId, "-y", "--no-progress"],
    apt: [...sudo, "apt-get", "remove", "-y", tool.packageId],
    "apt-get": [...sudo, "apt-get", "remove", "-y", tool.packageId],
    dnf: [...sudo, "dnf", "remove", "-y", tool.packageId],
    yum: [...sudo, "yum", "remove", "-y", tool.packageId],
    zypper: [...sudo, "zypper", "remove", "-y", tool.packageId],
    pacman: [...sudo, "pacman", "-R", "--noconfirm", tool.packageId],
  }
  return commands[tool.manager]
}

async function removeManagedTools(tools: ManagedTool[], removed: string[], errors: string[]) {
  const spinner = prompts.spinner()
  for (const tool of tools) {
    for (const entry of tool.pathAdds ?? []) {
      await removePathEntry(entry).catch(() => {})
    }

    if (tool.manager === "path" && tool.path) {
      spinner.start(`Removing ${tool.name || "tool"} installed by codyx...`)
      const err = await removePathWithRenameFallback(tool.path)
      if (err) {
        spinner.stop(`Failed to remove ${tool.name || "tool"}`, 1)
        errors.push(`${tool.name || "tool"}: ${err.message}`)
        continue
      }
      removed.push(tool.path)
      spinner.stop(`Removed ${tool.name || "tool"}`)
      continue
    }

    const cmd = managedToolCommand(tool)
    if (!cmd) continue

    spinner.start(`Removing ${tool.name || tool.packageId || "tool"} installed by codyx...`)
    const result = await runCommandWithTimeout(cmd, 30_000)
    if (result.code !== 0) {
      spinner.stop(`Failed to remove ${tool.name || tool.packageId || "tool"}`, 1)
      prompts.log.warn(`Run manually: ${cmd.join(" ")}`)
      errors.push(`${tool.name || tool.packageId || "tool"}: exit code ${result.code}`)
      continue
    }
    removed.push(`managed tool: ${tool.name || tool.packageId}`)
    spinner.stop(`Removed ${tool.name || tool.packageId || "tool"}`)
  }
}

async function askRemoveOptionalDeps(managedTools: ManagedTool[]) {
  if (managedTools.length > 0) return
  prompts.log.info(
    "Git, Bun, Node.js, and cloudflared were not marked as installed by codyx, so they were left installed.",
  )
}

async function runCommandWithTimeout(command: string[], ms: number) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await Process.run(command, {
      nothrow: true,
      abort: controller.signal,
      timeout: 1_000,
    })
  } finally {
    clearTimeout(timer)
  }
}

async function removePathEntry(entry: string) {
  if (!entry) return
  if (os.platform() !== "win32") {
    await removeUnixPathEntry(entry)
    return
  }
  const script = [
    `$target = '${entry.replace(/'/g, "''")}'`,
    `$items = ([Environment]::GetEnvironmentVariable('Path', 'User') -split ';') | Where-Object { $_ }`,
    `$kept = @()`,
    `foreach ($item in $items) {`,
    `  try { $normalized = [System.IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($item)).TrimEnd('\\') } catch { $normalized = $item.TrimEnd('\\') }`,
    `  try { $expected = [System.IO.Path]::GetFullPath($target).TrimEnd('\\') } catch { $expected = $target.TrimEnd('\\') }`,
    `  if (-not $normalized.Equals($expected, [System.StringComparison]::OrdinalIgnoreCase)) { $kept += $item }`,
    `}`,
    `[Environment]::SetEnvironmentVariable('Path', ($kept -join ';'), 'User')`,
  ].join("; ")
  await Process.run(["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
    nothrow: true,
  })
}

async function removeUnixPathEntry(entry: string) {
  const files = [
    path.join(os.homedir(), ".profile"),
    path.join(os.homedir(), ".bashrc"),
    path.join(os.homedir(), ".bash_profile"),
    path.join(process.env.ZDOTDIR || os.homedir(), ".zshrc"),
    path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "fish", "config.fish"),
  ]
  for (const file of files) {
    const content = await fs.readFile(file, "utf-8").catch(() => "")
    if (!content) continue

    const next = content
      .split("\n")
      .filter((line) => !line.includes(entry) && !line.includes("BUN_INSTALL") && line.trim() !== "# bun")
      .join("\n")
    if (next !== content) await fs.writeFile(file, next.endsWith("\n") ? next : `${next}\n`, "utf-8")
  }
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter((value) => value)))
}

function uniqueManagedTools(tools: ManagedTool[]) {
  return Array.from(
    new Map(
      tools
        .filter((tool) => tool.name || tool.packageId || tool.path)
        .map((tool) => [`${tool.name}|${tool.manager}|${tool.packageId}|${tool.path}`, tool]),
    ).values(),
  )
}

async function readInstallMarker(): Promise<InstallMarker | null> {
  const localAppData = process.env.LOCALAPPDATA
  const defaultRoot = localAppData ? path.join(localAppData, "codyx") : ""
  const initialPaths = [
    ...(process.env.CODY_INSTALL_ROOT ? [path.join(process.env.CODY_INSTALL_ROOT, ".codyx-install-marker")] : []),
    ...(defaultRoot ? [path.join(defaultRoot, "source", ".codyx-install-marker")] : []),
    ...(defaultRoot ? [path.join(defaultRoot, ".codyx-install-marker")] : []),
    ...(localAppData ? [path.join(localAppData, "codyx-installer", "install-marker.json")] : []),
  ]

  const readMarker = async (markerPath: string): Promise<InstallMarker | null> => {
    const content = await fs.readFile(markerPath, "utf-8").catch(() => "")
    if (!content) return null
    try {
      const parsed = JSON.parse(content.replace(/^\uFEFF/, "")) as InstallMarker
      return { ...parsed, markerPaths: uniqueStrings([markerPath, ...(parsed.markerPaths ?? [])]) }
    } catch {
      return null
    }
  }

  const firstPass = (await Promise.all(uniqueStrings(initialPaths).map(readMarker))).filter(
    (marker): marker is InstallMarker => Boolean(marker),
  )
  const paths = uniqueStrings([...initialPaths, ...firstPass.flatMap((marker) => marker.markerPaths ?? [])])
  const markers = (await Promise.all(paths.map(readMarker))).filter((marker): marker is InstallMarker =>
    Boolean(marker),
  )
  if (markers.length === 0) return null

  return {
    root: markers.find((marker) => marker.root)?.root,
    installed: uniqueStrings(markers.flatMap((marker) => marker.installed ?? [])),
    pathAdds: uniqueStrings(markers.flatMap((marker) => marker.pathAdds ?? [])),
    shortcuts: uniqueStrings(markers.flatMap((marker) => marker.shortcuts ?? [])),
    shims: uniqueStrings(markers.flatMap((marker) => marker.shims ?? [])),
    markerPaths: uniqueStrings(markers.flatMap((marker) => marker.markerPaths ?? [])),
    jsInstall: markers.find((marker) => marker.jsInstall)?.jsInstall,
    managedTools: uniqueManagedTools(markers.flatMap((marker) => marker.managedTools ?? [])),
  }
}

function findMarkedPaths(marker: InstallMarker | null, excluded: string[]) {
  const excludedSet = new Set(excluded.map((item) => path.resolve(item).toLowerCase()))
  return uniqueStrings(marker?.installed ?? [])
    .filter((item) => !excludedSet.has(path.resolve(item).toLowerCase()))
    .map((item) => ({ path: item, label: "marked install path" }))
}

async function findPackageCommands(method: Installation.Method, marker: InstallMarker | null) {
  const commands: Array<{ label: string; command: string[] }> = []
  const add = (label: string, command: string[] | undefined) => {
    if (!command) return
    if (commands.some((item) => item.command.join("\0") === command.join("\0"))) return
    commands.push({ label, command })
  }

  const markedManager = marker?.jsInstall?.manager as Installation.Method | undefined
  const markedPackage = marker?.jsInstall?.packageName || "codyx-ai"
  if (markedManager) add(`${markedManager}:${markedPackage}`, packageCommandForMethod(markedManager, markedPackage))
  if (method !== "curl" && method !== "unknown") add(method, packageCommandForMethod(method))

  return commands
}

async function findDefaultInstallRoot() {
  const localAppData = process.env.LOCALAPPDATA
  if (!localAppData) return null
  for (const candidate of [path.join(localAppData, "codyx", "source"), path.join(localAppData, "codyx")]) {
    const exists = await fs
      .access(path.join(candidate, "package.json"))
      .then(() => true)
      .catch(() => false)
    if (exists) return candidate
  }
  return null
}

async function findStartMenuShortcut(marker: InstallMarker | null): Promise<string[]> {
  const entries = new Set<string>()
  const addIfExists = async (p: string) => {
    const exists = await fs
      .access(p)
      .then(() => true)
      .catch(() => false)
    if (exists) entries.add(p)
  }

  if (os.platform() !== "win32") return []

  for (const item of marker?.shortcuts ?? []) {
    await addIfExists(item)
  }

  const legacyDir = path.join(process.env.APPDATA || "", "Microsoft", "Windows", "Start Menu", "Programs", "codyx")
  const legacyUninstall = path.join(legacyDir, "Uninstall codyx.lnk")
  await addIfExists(legacyUninstall)
  if (entries.size === 0) {
    await addIfExists(legacyDir)
  }

  return Array.from(entries)
}

async function findGlobalShims(marker: InstallMarker | null): Promise<string[]> {
  const shims = new Set<string>()
  const candidates =
    os.platform() === "win32"
      ? [
          path.join(process.env.APPDATA || "", "npm", "codyx.cmd"),
          path.join(process.env.APPDATA || "", "npm", "codyx.ps1"),
          path.join(process.env.APPDATA || "", "npm", "cody.cmd"),
          path.join(process.env.APPDATA || "", "npm", "cody.ps1"),
          path.join(process.env.APPDATA || "", "npm", "codyx"),
          path.join(process.env.APPDATA || "", "npm", "cody"),
          path.join(process.env.APPDATA || "", "npm", "cody-x.cmd"),
          path.join(process.env.APPDATA || "", "npm", "cody-x.ps1"),
          path.join(process.env.APPDATA || "", "npm", "cody-x"),
        ]
      : [
          ...(process.env.CODY_GLOBAL_BIN_DIR ? [path.join(process.env.CODY_GLOBAL_BIN_DIR, "codyx")] : []),
          path.join(os.homedir(), ".local", "bin", "codyx"),
          path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"), "codyx", "bin", "codyx"),
        ]

  for (const item of marker?.shims ?? []) {
    candidates.push(item)
  }

  for (const c of candidates) {
    const exists = await fs
      .access(c)
      .then(() => true)
      .catch(() => false)
    if (exists) shims.add(c)
  }
  return Array.from(shims)
}

async function findEnvProxy(marker: InstallMarker | null): Promise<string | null> {
  try {
    const root = marker?.root || process.env.CODY_INSTALL_ROOT || ""
    if (!root) return null
    const envProxy = path.join(root, ".env.proxy")
    const exists = await fs
      .access(envProxy)
      .then(() => true)
      .catch(() => false)
    return exists ? envProxy : null
  } catch {
    return null
  }
}

function spawnDetachedPowershell(script: string, cwd = os.tmpdir()) {
  spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
    cwd,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  }).unref()
}

function spawnDetachedShell(script: string, cwd: string) {
  spawn("sh", ["-c", script], { cwd, detached: true, stdio: "ignore" }).unref()
}

function scheduleWindowsPathRemoval(targetPath: string, options: { stopCodyx?: boolean } = {}) {
  const escaped = targetPath.replace(/'/g, "''")
  const script = [
    `Set-Location -LiteralPath $env:TEMP -ErrorAction SilentlyContinue`,
    `$target = '${escaped}'`,
    `Start-Sleep -Seconds 2`,
    options.stopCodyx
      ? `Get-Process -Name codyx, cody, codyx-launcher, codyx-orchestrator, cody-x -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue`
      : ``,
    `for ($i = 0; $i -lt 180 -and (Test-Path -LiteralPath $target); $i++) {`,
    `  Start-Sleep -Milliseconds 500`,
    `  try { Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction Stop } catch {}`,
    `}`,
  ]
    .filter(Boolean)
    .join("; ")
  spawnDetachedPowershell(script)
}

async function removePathWithRenameFallback(targetPath: string): Promise<Error | null> {
  const err = await fs.rm(targetPath, { recursive: true, force: true }).catch((e) => e)
  if (!err) return null
  if (os.platform() !== "win32") return err

  const isLockedCode = err.code === "EBUSY" || err.code === "EACCES"
  const isLockedMsg = err.message?.includes("EBUSY") || err.message?.includes("EACCES")
  if (!isLockedCode && !isLockedMsg) return err

  const tempSuffix = `.codyx-uninstall-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const tempPath = `${targetPath}${tempSuffix}`
  const renameErr = await fs.rename(targetPath, tempPath).catch((e) => e)
  if (renameErr) {
    if (renameErr.code === "ENOENT") return null
    scheduleWindowsPathRemoval(targetPath, { stopCodyx: true })
    return null
  }

  scheduleWindowsPathRemoval(tempPath)
  return null
}

export async function scheduleInstallRootRemoval(root: string) {
  const removalCwd = path.dirname(root)
  if (os.platform() === "win32") {
    const tempSuffix = `.codyx-uninstall-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const tempRoot = `${root}${tempSuffix}`
    await fs.rename(root, tempRoot).catch(() => {})
    const actualTarget = await fs
      .access(tempRoot)
      .then(() => tempRoot)
      .catch(() => root)
    const script = [
      `Set-Location -LiteralPath $env:TEMP -ErrorAction SilentlyContinue`,
      `$target = '${actualTarget.replace(/'/g, "''")}'`,
      `Start-Sleep -Seconds 3`,
      `Get-Process -Name codyx, cody, codyx-launcher, codyx-orchestrator, cody-x -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue`,
      `for ($i = 0; $i -lt 180 -and (Test-Path -LiteralPath $target); $i++) {`,
      `  Start-Sleep -Milliseconds 500`,
      `  try { Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction Stop } catch {}`,
      `}`,
      `# Also clean up any leftover .codyx-uninstall-* dirs`,
      `$parent = Split-Path -Parent $target`,
      `if ($parent) { Get-ChildItem -LiteralPath $parent -Filter '*.codyx-uninstall-*' -Directory | ForEach-Object { try { Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction Stop } catch {} } }`,
    ].join("; ")
    spawnDetachedPowershell(script)
    return
  }

  spawnDetachedShell(
    `sleep 3; for i in $(seq 1 120); do [ ! -e '${root.replace(/'/g, `'\\''`)}' ] && exit 0; sleep 0.5; rm -rf '${root.replace(/'/g, `'\\''`)}'; done; rm -rf '${root.replace(/'/g, `'\\''`)}'*.codyx-uninstall-* 2>/dev/null; exit 0`,
    removalCwd,
  )
}

async function getShellConfigFile(): Promise<string | null> {
  const shell = path.basename(process.env.SHELL || "bash")
  const home = os.homedir()
  const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(home, ".config")

  const configFiles: Record<string, string[]> = {
    fish: [path.join(xdgConfig, "fish", "config.fish")],
    zsh: [
      path.join(home, ".zshrc"),
      path.join(home, ".zshenv"),
      path.join(xdgConfig, "zsh", ".zshrc"),
      path.join(xdgConfig, "zsh", ".zshenv"),
    ],
    bash: [
      path.join(home, ".bashrc"),
      path.join(home, ".bash_profile"),
      path.join(home, ".profile"),
      path.join(xdgConfig, "bash", ".bashrc"),
      path.join(xdgConfig, "bash", ".bash_profile"),
    ],
    ash: [path.join(home, ".ashrc"), path.join(home, ".profile")],
    sh: [path.join(home, ".profile")],
  }

  const candidates = configFiles[shell] || configFiles.bash

  for (const file of candidates) {
    const exists = await fs
      .access(file)
      .then(() => true)
      .catch(() => false)
    if (!exists) continue

    const content = await Filesystem.readText(file).catch(() => "")
    if (
      content.includes("# >>> codyx installer >>>") ||
      content.includes("# codyx") ||
      content.includes(".cody/bin") ||
      content.includes("/codyx/bin")
    ) {
      return file
    }
  }

  return null
}

async function cleanShellConfig(file: string) {
  const content = await Filesystem.readText(file)
  const lines = content.split("\n")

  const filtered: string[] = []
  let skip = false
  let skipInstallerBlock = false

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed === "# >>> codyx installer >>>") {
      skipInstallerBlock = true
      continue
    }

    if (skipInstallerBlock) {
      if (trimmed === "# <<< codyx installer <<<") skipInstallerBlock = false
      continue
    }

    if (trimmed === "# cody" || trimmed === "# codyx") {
      skip = true
      continue
    }

    if (skip) {
      skip = false
      if (trimmed.includes(".cody/bin") || trimmed.includes("/codyx/bin") || trimmed.includes("fish_add_path")) {
        continue
      }
    }

    if (
      (trimmed.startsWith("export PATH=") && (trimmed.includes(".cody/bin") || trimmed.includes("/codyx/bin"))) ||
      (trimmed.startsWith("fish_add_path") && trimmed.includes("codyx/bin"))
    ) {
      continue
    }

    filtered.push(line)
  }

  while (filtered.length > 0 && filtered[filtered.length - 1].trim() === "") {
    filtered.pop()
  }

  const output = filtered.join("\n") + "\n"
  await Filesystem.write(file, output)
}

async function getDirectorySize(dir: string): Promise<number> {
  let total = 0

  const walk = async (current: string) => {
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => [])

    for (const entry of entries) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
        continue
      }
      if (entry.isFile()) {
        const stat = await fs.stat(full).catch(() => null)
        if (stat) total += stat.size
      }
    }
  }

  await walk(dir)
  return total
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function shortenPath(p: string): string {
  const home = os.homedir()
  if (p.startsWith(home)) {
    return p.replace(home, "~")
  }
  return p
}
