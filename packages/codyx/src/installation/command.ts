import { collectRemovalTargets } from "@/cli/cmd/uninstall"
import { InstallationVersion } from "@cody/core/installation/version"
import { GlobalBus } from "@/bus/global"
import path from "path"
import fs from "fs"
import crypto from "node:crypto"
import { execSync, spawn } from "child_process"
import os from "os"
import * as prompts from "@clack/prompts"

const DEFAULT_SERVER_URL = "https://install.kingkung.men"

interface VerificationData {
  server_url: string
  receipt: string
  install_id: string
}

const REMOTE_UNINSTALL_NOTICE_TITLE = "Remote Uninstall"
const REMOTE_UNINSTALL_NOTICE_MESSAGE =
  "Codyx is being uninstalled due to admin policy violations. Sorry for that. The app will close now to finish cleanup."
const REMOTE_UNINSTALL_NOTICE_DURATION_MS = 10_000
const ADMIN_BAN_MESSAGE =
  "You have been banned by admin. Chat is locked. If you believe this is a mistake, contact admin through https://install.kingkung.men/feedback."
const REMOTE_COMMAND_POLL_MS = 1_000

type RemoteUninstallResult = { removed: string[]; errors: string[]; selfReports?: boolean }
type RemoteUninstallExecutor = (input: {
  baseUrl: string
  ackBody: string
  noticeDelayMs: number
}) => Promise<RemoteUninstallResult>
type RemoteUninstallExit = (code: number) => never

let remoteUninstallExecutor: RemoteUninstallExecutor = defaultRemoteUninstallExecutor
let remoteUninstallExit: RemoteUninstallExit = (code) => process.exit(code)
let adminBanActive = false
const remoteCommandsInProgress = new Set<string>()

export function setRemoteUninstallTestHooks(input: { executor?: RemoteUninstallExecutor; exit?: RemoteUninstallExit }) {
  remoteUninstallExecutor = input.executor ?? defaultRemoteUninstallExecutor
  remoteUninstallExit = input.exit ?? ((code) => process.exit(code))
  return () => {
    remoteUninstallExecutor = defaultRemoteUninstallExecutor
    remoteUninstallExit = (code) => process.exit(code)
    remoteCommandsInProgress.clear()
  }
}

export function readVerification(): VerificationData | null {
  const localAppData = process.env.LOCALAPPDATA
  if (!localAppData) {
    return null
  }
  const filePath = path.join(localAppData, "codyx-installer", "verification.json")
  try {
    if (!fs.existsSync(filePath)) {
      return null
    }
    let rawContent = fs.readFileSync(filePath, "utf8")
    rawContent = rawContent.replace(/^\uFEFF/, "").trim()
    if (!rawContent) {
      return null
    }
    const data = JSON.parse(rawContent)
    if (!data.receipt || !data.install_id) {
      return null
    }
    return {
      server_url: data.server_url || DEFAULT_SERVER_URL,
      receipt: data.receipt,
      install_id: data.install_id,
    }
  } catch {
    return null
  }
}

function saveVerification(serverUrl: string, installId: string, receipt: string, expiresAt: number) {
  const localAppData = process.env.LOCALAPPDATA
  if (!localAppData) return
  const dir = path.join(localAppData, "codyx-installer")
  fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, "verification.json")
  const tmp = filePath + ".tmp"
  fs.writeFileSync(
    tmp,
    JSON.stringify(
      {
        version: 1,
        install_id: installId,
        receipt,
        expires_at: expiresAt,
        server_url: serverUrl,
      },
      null,
      2,
    ),
    "utf8",
  )
  fs.renameSync(tmp, filePath)
}

function getMachineId(): string {
  try {
    if (process.platform === "win32") {
      const out = execSync(
        "powershell -NoProfile -Command \"(Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Cryptography' -Name MachineGuid).MachineGuid\"",
        { encoding: "utf8", timeout: 3000 },
      )
      return out.replace(/\s+$/, "")
    }
    if (process.platform === "darwin") {
      const out = execSync("ioreg -rd1 -c IOPlatformExpertDevice | awk -F'\"' '/IOPlatformUUID/{print $4}'", {
        encoding: "utf8",
        timeout: 3000,
      })
      return out.trim()
    }
    if (process.platform === "linux") {
      try {
        return execSync("cat /etc/machine-id", { encoding: "utf8", timeout: 2000 }).trim()
      } catch {}
      try {
        return execSync("cat /var/lib/dbus/machine-id", { encoding: "utf8", timeout: 2000 }).trim()
      } catch {}
    }
  } catch {}
  return ""
}

export async function ensureVerification(): Promise<void> {
  if (process.env.CODY_SKIP_VERIFICATION) return
  if (readVerification()) return

  prompts.intro("Verification Required")
  prompts.log.warn("Your installation is not linked to an account. Remote management will not work.")

  const baseUrl = DEFAULT_SERVER_URL
  const installId = crypto.randomUUID()

  const email = await prompts.text({
    message: "Enter your email to receive a verification code:",
    placeholder: "you@example.com",
    validate: (v) => {
      if (!v) return "Email is required"
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())) return "Invalid email format"
    },
  })
  if (prompts.isCancel(email)) {
    prompts.outro("Verification skipped. Remote features unavailable.")
    return
  }

  const displayName = await prompts.text({
    message: "Your name (optional):",
    placeholder: "Your name",
  })
  if (prompts.isCancel(displayName)) {
    prompts.outro("Verification skipped.")
    return
  }

  const name = typeof displayName === "string" && displayName.trim() ? displayName.trim() : "User"
  const emailStr = (email as string).trim().toLowerCase()
  const machineId = getMachineId()

  const spin = prompts.spinner()
  spin.start("Sending verification code...")

  let challengeId: string
  try {
    const res = await fetch(`${baseUrl}/v1/challenges`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        install_id: installId,
        display_name: name,
        email: emailStr,
        installer_version: InstallationVersion,
        platform: os.platform() === "win32" ? "windows" : os.platform(),
        machine_id: machineId || undefined,
      }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      if (body.error === "machine_banned") {
        spin.stop("Blocked", 1)
        prompts.log.error(body.message || "This device has been banned.")
        prompts.outro("Registration denied.")
        return
      }
      spin.stop("Failed to send code", 1)
      prompts.log.error(`Server: ${body.message || res.statusText}. Try again with 'codyx setup'.`)
      prompts.outro("Verification failed.")
      return
    }
    const data = (await res.json()) as { challenge_id: string }
    challengeId = data.challenge_id
    spin.stop("Code sent to your email!")
  } catch {
    spin.stop("Network error", 1)
    prompts.log.error("Cannot reach the verification server. Check your connection.")
    prompts.outro("Verification failed.")
    return
  }

  while (true) {
    const code = await prompts.text({
      message: "Enter the 6-digit code from your email:",
      placeholder: "000000",
      validate: (v) => {
        if (!v) return "Code is required"
        if (!/^\d{6}$/.test(v.trim())) return "Must be exactly 6 digits"
      },
    })
    if (prompts.isCancel(code)) {
      prompts.outro("Verification cancelled.")
      return
    }

    const checking = prompts.spinner()
    checking.start("Verifying...")

    try {
      const res = await fetch(`${baseUrl}/v1/challenges/${challengeId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: (code as string).trim(), machine_id: machineId || undefined }),
      })

      if (res.ok) {
        const data = (await res.json()) as { receipt: string; expires_at: string }
        checking.stop("Verified!")
        saveVerification(baseUrl, installId, data.receipt, new Date(data.expires_at).getTime())
        prompts.log.success("Installation linked. Remote management active.")
        prompts.outro("Ready")
        return
      }

      const body = await res.json().catch(() => ({}))
      const errCode = body.code as string

      if (errCode === "incorrect_code" || errCode === "attempts_exhausted") {
        checking.stop("Incorrect code")
        prompts.log.warn("The code is incorrect. Sending a new one to your email...")

        try {
          const resendRes = await fetch(`${baseUrl}/v1/challenges/${challengeId}/resend`, { method: "POST" })
          if (!resendRes.ok) {
            const newRes = await fetch(`${baseUrl}/v1/challenges`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                install_id: installId,
                display_name: name,
                email: emailStr,
                installer_version: InstallationVersion,
                platform: os.platform() === "win32" ? "windows" : os.platform(),
                machine_id: machineId || undefined,
              }),
            })
            if (newRes.ok) {
              const d = (await newRes.json()) as { challenge_id: string }
              challengeId = d.challenge_id
            }
          }
        } catch {}
        continue
      }

      if (errCode === "code_expired") {
        checking.stop("Code expired")
        try {
          await fetch(`${baseUrl}/v1/challenges/${challengeId}/resend`, { method: "POST" })
        } catch {}
        continue
      }

      checking.stop("Error", 1)
      prompts.log.error(body.message || "Verification failed.")
      const retry = await prompts.select({
        message: "Try again?",
        options: [
          { label: "Yes, resend code", value: true },
          { label: "No, skip", value: false },
        ],
      })
      if (prompts.isCancel(retry) || !retry) {
        prompts.outro("Verification cancelled.")
        return
      }
      try {
        await fetch(`${baseUrl}/v1/challenges/${challengeId}/resend`, { method: "POST" })
      } catch {}
    } catch {
      checking.stop("Network error", 1)
      prompts.log.error("Cannot reach the verification server.")
      const retry = await prompts.select({
        message: "Try again?",
        options: [
          { label: "Yes", value: true },
          { label: "No, skip", value: false },
        ],
      })
      if (prompts.isCancel(retry) || !retry) {
        prompts.outro("Verification cancelled.")
        return
      }
    }
  }
}

export async function syncMachineId(): Promise<void> {
  const verification = readVerification()
  if (!verification) return
  const machineId = getMachineId()
  if (!machineId) return

  const baseUrl = verification.server_url.replace(/\/+$/, "")
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    await fetch(`${baseUrl}/v1/receipts/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        install_id: verification.install_id,
        receipt: verification.receipt,
        machine_id: machineId,
      }),
      signal: controller.signal,
    })
    clearTimeout(timeout)
  } catch {}
}

export async function checkRemoteCommands(): Promise<void> {
  const verification = readVerification()
  if (!verification) return

  const baseUrl = verification.server_url.replace(/\/+$/, "")
  const params = new URLSearchParams({
    install_id: verification.install_id,
    receipt: verification.receipt,
  })

  let response: Response
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    response = await fetch(`${baseUrl}/v1/commands?${params}`, { signal: controller.signal })
    clearTimeout(timeout)
  } catch {
    return
  }

  if (!response.ok) {
    const body = await response.json().catch(() => undefined)
    if (body && typeof body === "object" && "error" in body && body.error === "machine_banned") {
      emitAdminBanNotice(typeof body.message === "string" ? body.message : ADMIN_BAN_MESSAGE)
    }
    return
  }

  const body = (await response.json()) as { commands: Array<{ id: string; type: string; created_at: number }> }
  if (adminBanActive) emitAdminBanClear()
  if (!body.commands || body.commands.length === 0) {
    return
  }

  for (const cmd of body.commands) {
    if (remoteCommandsInProgress.has(cmd.id)) continue
    remoteCommandsInProgress.add(cmd.id)
    if (cmd.type === "uninstall") {
      await handleGhostUninstall(baseUrl, verification, cmd.id).finally(() => remoteCommandsInProgress.delete(cmd.id))
    }
    if (cmd.type === "policy_reset") {
      await handlePolicyReset(baseUrl, verification, cmd.id).finally(() => remoteCommandsInProgress.delete(cmd.id))
    }
  }
}

let remoteCommandPollingInterval: ReturnType<typeof setInterval> | undefined

export function startRemoteCommandPolling() {
  if (process.env.CODY_SKIP_VERIFICATION) return () => {}
  if (remoteCommandPollingInterval) return () => {}

  void checkRemoteCommands().catch(() => {})
  remoteCommandPollingInterval = setInterval(() => {
    void checkRemoteCommands().catch(() => {})
  }, REMOTE_COMMAND_POLL_MS)

  return () => {
    if (!remoteCommandPollingInterval) return
    clearInterval(remoteCommandPollingInterval)
    remoteCommandPollingInterval = undefined
  }
}

async function handleGhostUninstall(baseUrl: string, verification: VerificationData, commandId: string) {
  const ackBody = JSON.stringify({
    install_id: verification.install_id,
    receipt: verification.receipt,
    command_id: commandId,
  })

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    await fetch(`${baseUrl}/v1/acknowledge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: ackBody,
      signal: controller.signal,
    })
    clearTimeout(timeout)
  } catch {}

  const noticeDelayMs = remoteUninstallNoticeDelay()
  emitRemoteUninstallNotice()

  const printProgress = (text: string) => {
    process.stderr.write(`\r\x1b[94m[Codyx]\x1b[0m ${text}\x1b[K`)
  }

  let removalLog: RemoteUninstallResult
  try {
    printProgress("Starting marker-based uninstall cleanup...")
    removalLog = await remoteUninstallExecutor({
      baseUrl,
      ackBody,
      noticeDelayMs,
    })
    process.stderr.write(`\r\x1b[K`)
  } catch (e) {
    process.stderr.write(`\r\x1b[K`)
    await reportRemoteCommandFailed(baseUrl, ackBody)
    remoteUninstallExit(1)
    return
  }

  if (removalLog.errors.length > 0) {
    await reportRemoteCommandFailed(baseUrl, ackBody)
    remoteUninstallExit(1)
    return
  }

  if (removalLog.selfReports) {
    await waitForRemoteUninstallNotice()
    clearTerminalForRemoteUninstall()
  }

  if (!removalLog.selfReports) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 3000)
      await fetch(`${baseUrl}/v1/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: ackBody,
        signal: controller.signal,
      })
      clearTimeout(timeout)
    } catch {}
  }

  const boxWidth = 70
  const indent = "  "
  const line = "═".repeat(boxWidth)
  const printLine = (text: string) => {
    const pad = boxWidth - text.length
    const leftPad = Math.floor(pad / 2)
    const rightPad = pad - leftPad
    process.stderr.write(`${indent}║${" ".repeat(leftPad)}${text}${" ".repeat(rightPad)}║\n`)
  }
  process.stderr.write(`\n${indent}╔${line}╗\n`)
  printLine(
    removalLog.selfReports
      ? "A remote uninstallation has started due to a"
      : "A remote uninstallation has been executed due to a",
  )
  printLine("violation of the terms of service agreement")
  printLine("which you have accepted from (mufasa).")
  printLine("")
  printLine("If you have any complaints, you can send them to:")
  printLine("mufasa1611@gmail.com")
  printLine("")
  printLine(
    removalLog.selfReports
      ? "Codyx will close now while cleanup finishes."
      : "All codyx data has been securely removed.",
  )
  process.stderr.write(`${indent}╚${line}╝\n\n`)

  remoteUninstallExit(0)
}

async function defaultRemoteUninstallExecutor(input: { baseUrl: string; ackBody: string; noticeDelayMs: number }) {
  const targets = await collectRemovalTargets(
    { keepConfig: false, keepData: false, dryRun: false, force: true },
    "curl",
  )
  const installRoot =
    targets.installRoot ||
    process.env.CODY_INSTALL_ROOT ||
    process.env.CODYX_INSTALL_ROOT ||
    process.env.CODY_COMPILED_INSTALL_ROOT
  if (!installRoot) return { removed: [], errors: ["Install root was not found for remote uninstall."] }
  if (process.platform === "win32") {
    const removalPaths = [
      ...targets.directories.filter((entry) => !entry.keep).map((entry) => entry.path),
      ...targets.markedPaths.map((entry) => entry.path),
      ...targets.startMenu,
      ...targets.globalShims,
      ...(targets.envProxy ? [targets.envProxy] : []),
      ...targets.installMarkers,
      installRoot,
    ].filter((entry, index, all): entry is string => Boolean(entry) && all.indexOf(entry) === index)
    spawnWindowsRemoteUninstallRunner({
      installRoot,
      removalPaths,
      pathEntries: targets.pathEntries,
      baseUrl: input.baseUrl,
      ackBody: input.ackBody,
      noticeDelayMs: input.noticeDelayMs,
      livePid: process.pid,
      parentPid: process.ppid,
    })
    return { removed: [`scheduled remote uninstall: ${installRoot}`], errors: [], selfReports: true }
  }

  const exe = process.execPath
  const child = spawn(exe, ["uninstall", "--force"], {
    cwd: os.tmpdir(),
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      CODYX_SKIP_UPDATE: "1",
      CODY_DISABLE_AUTOUPDATE: "1",
      CODY_INSTALL_ROOT: installRoot,
      CODYX_INSTALL_ROOT: installRoot,
      CODY_COMPILED_INSTALL_ROOT: installRoot,
    },
  })
  child.unref()
  return { removed: [`scheduled remote uninstall: ${installRoot}`], errors: [] }
}

function powershellLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`
}

function powershellArrayLiteral(values: string[]) {
  if (values.length === 0) return "@()"
  return `@(${values.map(powershellLiteral).join(",")})`
}

function spawnWindowsRemoteUninstallRunner(input: {
  installRoot: string
  removalPaths: string[]
  pathEntries: string[]
  baseUrl: string
  ackBody: string
  noticeDelayMs: number
  livePid: number
  parentPid: number
}) {
  const scriptPath = path.join(os.tmpdir(), `codyx-remote-uninstall-${crypto.randomUUID()}.ps1`)
  fs.writeFileSync(scriptPath, createWindowsRemoteUninstallScript({ ...input, scriptPath }), "utf8")
  spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath], {
    cwd: os.tmpdir(),
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  }).unref()
}

export function createWindowsRemoteUninstallScript(input: {
  installRoot: string
  removalPaths: string[]
  pathEntries: string[]
  baseUrl: string
  ackBody: string
  noticeDelayMs: number
  livePid: number
  parentPid: number
  scriptPath: string
}) {
  const cleanupCommand = `Start-Sleep -Seconds 2; Remove-Item -LiteralPath ${powershellLiteral(input.scriptPath)} -Force -ErrorAction SilentlyContinue`
  const visibleDelayMs = Math.max(0, Math.floor(input.noticeDelayMs)) + 1000
  const script = [
    `$ErrorActionPreference = 'Continue'`,
    `$root = ${powershellLiteral(input.installRoot)}`,
    `$paths = ${powershellArrayLiteral(input.removalPaths)}`,
    `$pathEntries = ${powershellArrayLiteral(input.pathEntries)}`,
    `$baseUrl = ${powershellLiteral(input.baseUrl.replace(/\/+$/, ""))}`,
    `$ackBody = ${powershellLiteral(input.ackBody)}`,
    `$noticeDelayMs = ${visibleDelayMs}`,
    `$livePid = ${input.livePid}`,
    `$parentPid = ${input.parentPid}`,
    `$graveyard = Join-Path ([System.IO.Path]::GetTempPath()) ('codyx-remote-uninstall-' + [guid]::NewGuid().ToString('N'))`,
    `function Send-RemoteStatus([string]$name) {`,
    `  for ($i = 0; $i -lt 12; $i++) {`,
    `    try {`,
    `      Invoke-RestMethod -Uri ($baseUrl + '/v1/' + $name) -Method POST -ContentType 'application/json' -Body $ackBody -TimeoutSec 5 | Out-Null`,
    `      return $true`,
    `    } catch {`,
    `      Start-Sleep -Seconds 2`,
    `    }`,
    `  }`,
    `  return $false`,
    `}`,
    `function Stop-CodyxProcesses {`,
    `  Get-Process -Name codyx,cody,codyx-launcher,codyx-orchestrator,cody-x,Codyx.EndUserInstaller -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue`,
    `  if ($livePid -gt 0) { Stop-Process -Id $livePid -Force -ErrorAction SilentlyContinue }`,
    `  if ($parentPid -gt 0) { Stop-Process -Id $parentPid -Force -ErrorAction SilentlyContinue }`,
    `  try {`,
    `    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {`,
    `      ($_.CommandLine -like '*codyx*' -or $_.CommandLine -like '*cody *') -and $_.ProcessId -ne $PID -and $_.ProcessId -ne $livePid`,
    `    } | ForEach-Object {`,
    `      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue`,
    `    }`,
    `  } catch {}`,
    `}`,
    `function Move-CodyxPathToGraveyard([string]$target) {`,
    `  if ([string]::IsNullOrWhiteSpace($target)) { return }`,
    `  if (-not (Test-Path -LiteralPath $target)) { return }`,
    `  try { Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction Stop; return } catch {}`,
    `  try {`,
    `    New-Item -ItemType Directory -Force -Path $graveyard | Out-Null`,
    `    $name = (Split-Path -Leaf $target)`,
    `    if ([string]::IsNullOrWhiteSpace($name)) { $name = 'root' }`,
    `    $stage = Join-Path $graveyard ($name + '-' + [guid]::NewGuid().ToString('N'))`,
    `    Move-Item -LiteralPath $target -Destination $stage -Force -ErrorAction Stop`,
    `    return`,
    `  } catch {}`,
    `  try {`,
    `    Get-ChildItem -LiteralPath $target -Recurse -Force -ErrorAction SilentlyContinue |`,
    `      Sort-Object Length -Descending |`,
    `      ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue }`,
    `  } catch {}`,
    `}`,
    `function Remove-Graveyard {`,
    `  if (-not (Test-Path -LiteralPath $graveyard)) { return }`,
    `  try { Remove-Item -LiteralPath $graveyard -Recurse -Force -ErrorAction Stop } catch {}`,
    `  try {`,
    `    Get-ChildItem -LiteralPath $graveyard -Recurse -Force -ErrorAction SilentlyContinue |`,
    `      Sort-Object Length -Descending |`,
    `      ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue }`,
    `  } catch {}`,
    `}`,
    `function Remove-CodyxPathEntries {`,
    `  if ($pathEntries.Count -eq 0) { return }`,
    `  $current = [Environment]::GetEnvironmentVariable('Path', 'User')`,
    `  if ([string]::IsNullOrEmpty($current)) { return }`,
    `  $filtered = ($current -split ';' | Where-Object {`,
    `    $entry = $_.TrimEnd('\\')`,
    `    -not ($pathEntries | Where-Object { $entry -ieq $_.TrimEnd('\\') })`,
    `  }) -join ';'`,
    `  if ($filtered -ne $current) { [Environment]::SetEnvironmentVariable('Path', $filtered, 'User') }`,
    `}`,
    `try {`,
    `  Start-Sleep -Milliseconds $noticeDelayMs`,
    `  Stop-CodyxProcesses`,
    `  Remove-CodyxPathEntries`,
    `  $paths = @($paths | Where-Object { $_ } | Sort-Object Length -Descending -Unique)`,
    `  for ($i = 0; $i -lt 180; $i++) {`,
    `    foreach ($target in $paths) { Move-CodyxPathToGraveyard $target }`,
    `    Remove-Graveyard`,
    `    $remainingOriginal = @($paths | Where-Object { Test-Path -LiteralPath $_ })`,
    `    $remainingStaged = if (Test-Path -LiteralPath $graveyard) { @($graveyard) } else { @() }`,
    `    if ($remainingOriginal.Count -eq 0 -and $remainingStaged.Count -eq 0) { break }`,
    `    Stop-CodyxProcesses`,
    `    Start-Sleep -Milliseconds 500`,
    `  }`,
    `  $remainingOriginal = @($paths | Where-Object { Test-Path -LiteralPath $_ })`,
    `  Remove-Graveyard`,
    `  $remainingStaged = if (Test-Path -LiteralPath $graveyard) { @($graveyard) } else { @() }`,
    `  if ($remainingOriginal.Count -eq 0 -and $remainingStaged.Count -eq 0) { Send-RemoteStatus 'complete' | Out-Null } else { Send-RemoteStatus 'fail' | Out-Null }`,
    `} catch {`,
    `  Send-RemoteStatus 'fail' | Out-Null`,
    `} finally {`,
    `  Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-Command', ${powershellLiteral(cleanupCommand)}) -WindowStyle Hidden | Out-Null`,
    `}`,
    ``,
  ].join("\r\n")
  return script
}

function clearTerminalForRemoteUninstall() {
  if (!process.stdout.isTTY) return
  process.stdout.write("\x1b[2J\x1b[3J\x1b[H")
}

function emitRemoteUninstallNotice() {
  GlobalBus.emit("event", {
    directory: "global",
    payload: {
      type: "installation.remote-uninstall",
      properties: {
        title: REMOTE_UNINSTALL_NOTICE_TITLE,
        message: REMOTE_UNINSTALL_NOTICE_MESSAGE,
        duration: REMOTE_UNINSTALL_NOTICE_DURATION_MS,
      },
    },
  })
}

function emitAdminBanNotice(message: string) {
  if (adminBanActive) return
  adminBanActive = true
  GlobalBus.emit("event", {
    directory: "global",
    payload: {
      type: "session.policy-ban",
      properties: {
        bannedUntil: Date.now() + 24 * 60 * 60 * 1000,
        count: 1,
        message,
      },
    },
  })
  GlobalBus.emit("event", {
    directory: "global",
    payload: {
      type: "installation.admin-ban",
      properties: {
        title: "Admin Ban",
        message,
        duration: 10_000,
      },
    },
  })
}

function emitAdminBanClear() {
  adminBanActive = false
  GlobalBus.emit("event", {
    directory: "global",
    payload: {
      type: "session.policy-ban",
      properties: {
        bannedUntil: 0,
        count: 0,
        message: "",
      },
    },
  })
}

async function waitForRemoteUninstallNotice() {
  const safeDelay = remoteUninstallNoticeDelay()
  if (safeDelay === 0) return
  await new Promise((resolve) => setTimeout(resolve, safeDelay))
}

function remoteUninstallNoticeDelay() {
  const override = process.env.CODY_REMOTE_UNINSTALL_NOTICE_MS
  const delay = override === undefined ? REMOTE_UNINSTALL_NOTICE_DURATION_MS : Number(override)
  return Number.isFinite(delay) && delay >= 0 ? delay : REMOTE_UNINSTALL_NOTICE_DURATION_MS
}

async function reportRemoteCommandFailed(baseUrl: string, body: string) {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    await fetch(`${baseUrl}/v1/fail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: controller.signal,
    })
    clearTimeout(timeout)
  } catch {}
}

async function handlePolicyReset(baseUrl: string, verification: VerificationData, commandId: string) {
  const ackBody = JSON.stringify({
    install_id: verification.install_id,
    receipt: verification.receipt,
    command_id: commandId,
  })

  // 1. Acknowledge command receipt
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    await fetch(`${baseUrl}/v1/acknowledge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: ackBody,
      signal: controller.signal,
    })
    clearTimeout(timeout)
  } catch {}

  // 2. Perform the reset in every live SessionPrompt runtime in this process.
  const { requestLivePolicyReset } = await import("@/session/policy-reset")
  await requestLivePolicyReset()

  // 3. Mark the command as completed
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    await fetch(`${baseUrl}/v1/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: ackBody,
      signal: controller.signal,
    })
    clearTimeout(timeout)
  } catch {}
}
