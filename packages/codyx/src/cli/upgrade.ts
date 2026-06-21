import { Bus } from "@/bus"
import { Config } from "@/config/config"
import { AppRuntime } from "@/effect/app-runtime"
import { Flag } from "@cody/core/flag/flag"
import { Installation } from "@/installation"
import { InstallationVersion } from "@cody/core/installation/version"
import { Rpc } from "@/util/rpc"
import { execSync } from "child_process"
import fs from "fs"
import path from "path"

let _upgrading = false
const GH_REPO = process.env.GH_REPO || "mufasa1611/codyx-orchestrator"

function isCodyxRepoRoot(root: string) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")) as {
      name?: string
      repository?: { url?: string } | string
    }
    const repository = typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url
    return pkg.name === "codyx-orchestrator" || repository?.includes(GH_REPO) === true
  } catch {
    return false
  }
}

function sourceInstallRoot() {
  if (process.env.CODY_INSTALL_ROOT && isCodyxRepoRoot(process.env.CODY_INSTALL_ROOT))
    return process.env.CODY_INSTALL_ROOT
}

export function gitInstallRoot() {
  const root = sourceInstallRoot()
  if (root) return root
}

function currentBranch(repoRoot: string): string {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", { cwd: repoRoot, encoding: "utf8", timeout: 3000 }).trim()
  } catch {
    return "dev"
  }
}

function gitPullRestart(repoRoot: string) {
  if (_upgrading) return
  _upgrading = true
  execSync("git pull --ff-only", { cwd: repoRoot, encoding: "utf8", timeout: 30000 })
  Rpc.emit("restart", {})
}

async function sourceUpgrade() {
  try {
    const repoRoot = gitInstallRoot()
    if (!repoRoot) return
    const branch = process.env.CODY_BRANCH || currentBranch(repoRoot)
    execSync("git fetch origin " + branch + " --quiet", { cwd: repoRoot, encoding: "utf8", timeout: 15000 })
    const behind = execSync("git rev-list --count HEAD..origin/" + branch, {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 5000,
    }).trim()
    if (behind === "0" || behind === "") return

    await Bus.publish(Installation.Event.UpdateAvailable, { version: "latest" })

    const config = await AppRuntime.runPromise(Config.Service.use((cfg) => cfg.getGlobal()))
    if (config.autoupdate === true) {
      await new Promise((r) => setTimeout(r, 5000))
      gitPullRestart(repoRoot)
    }
  } catch (e) {
    console.error("[upgrade] sourceUpgrade failed:", e instanceof Error ? e.message : String(e))
  }
}

export function gitUpgrade() {
  try {
    const repoRoot = gitInstallRoot()
    if (!repoRoot) return
    gitPullRestart(repoRoot)
  } catch {
    // Best-effort
  }
}

export function checkForUpdates() {
  try {
    const repoRoot = gitInstallRoot()
    if (!repoRoot) return { updateAvailable: false }
    const branch = process.env.CODY_BRANCH || currentBranch(repoRoot)
    execSync("git fetch origin " + branch + " --quiet", { cwd: repoRoot, encoding: "utf8", timeout: 15000 })
    const behind = execSync("git rev-list --count HEAD..origin/" + branch, {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 5000,
    }).trim()
    if (behind === "0" || behind === "") return { updateAvailable: false }
    return { updateAvailable: true }
  } catch (e) {
    console.error("[upgrade] checkForUpdates failed:", e instanceof Error ? e.message : String(e))
    return { updateAvailable: false }
  }
}

export async function upgrade() {
  const config = await AppRuntime.runPromise(Config.Service.use((cfg) => cfg.getGlobal()))
  if (config.autoupdate === false || Flag.CODY_DISABLE_AUTOUPDATE) return

  if (gitInstallRoot()) {
    return sourceUpgrade()
  }

  const method = await Installation.method()
  const latest = await Installation.latest(method).catch(() => {})
  if (!latest) return

  if (Flag.CODY_ALWAYS_NOTIFY_UPDATE) {
    await Bus.publish(Installation.Event.UpdateAvailable, { version: latest })
    return
  }

  if (InstallationVersion === latest) return

  const kind = Installation.getReleaseType(InstallationVersion, latest)

  if (config.autoupdate === "notify" || kind !== "patch") {
    await Bus.publish(Installation.Event.UpdateAvailable, { version: latest })
    return
  }

  if (method === "unknown") return
  await Installation.upgrade(method, latest)
    .then(() => Bus.publish(Installation.Event.Updated, { version: latest }))
    .catch(() => {})
}
