#!/usr/bin/env bun

import { createHash } from "node:crypto"
import { stat } from "node:fs/promises"
import path from "node:path"

type Asset = {
  id: string
  kind: "cli" | "desktop" | "android" | "launcher" | "installer"
  platform: "windows" | "macos" | "linux" | "android" | "any"
  arch: "x64" | "arm64" | "universal" | "unknown"
  file: string
  url: string
  sha256: string
  size: number
}

const root = path.resolve(import.meta.dir, "..")
const version = process.env.CODY_VERSION
const repo = process.env.GH_REPO || process.env.GITHUB_REPOSITORY || "mufasa1611/codyx-orchestrator"
const channel = process.env.CODY_CHANNEL || "prod"

if (!version) throw new Error("CODY_VERSION is required")

const tag = `v${version}`
const releaseBase = `https://github.com/${repo}/releases/download/${tag}`
const output = process.env.CODY_RELEASE_MANIFEST || path.join(root, "dist", "codyx-release-manifest.json")

const candidates = [
  "packages/codyx/dist/*.zip",
  "packages/codyx/dist/*.tar.gz",
  "dist/release-assets/*",
  "dist/codyx-end-user-installer-windows-x64.exe",
  "dist/codyx-launcher-windows-x64.exe",
]

function classify(file: string): Omit<Asset, "file" | "url" | "sha256" | "size"> | undefined {
  if (/^codyx-ai-windows-arm64\.zip$/.test(file)) {
    return { id: "cli.windows-arm64", kind: "cli", platform: "windows", arch: "arm64" }
  }
  if (/^codyx-ai-windows-x64-baseline\.zip$/.test(file)) {
    return { id: "cli.windows-x64", kind: "cli", platform: "windows", arch: "x64" }
  }
  if (/^codyx-ai-windows-x64\.zip$/.test(file)) {
    return { id: "cli.windows-x64-avx2", kind: "cli", platform: "windows", arch: "x64" }
  }
  if (/^codyx-ai-darwin-arm64\.zip$/.test(file)) {
    return { id: "cli.macos-arm64", kind: "cli", platform: "macos", arch: "arm64" }
  }
  if (/^codyx-ai-darwin-x64(?:-baseline)?\.zip$/.test(file)) {
    return { id: "cli.macos-x64", kind: "cli", platform: "macos", arch: "x64" }
  }
  if (/^codyx-ai-linux-arm64.*\.tar\.gz$/.test(file)) {
    return { id: "cli.linux-arm64", kind: "cli", platform: "linux", arch: "arm64" }
  }
  if (/^codyx-ai-linux-x64-baseline.*\.tar\.gz$/.test(file)) {
    return { id: "cli.linux-x64", kind: "cli", platform: "linux", arch: "x64" }
  }
  if (/^codyx-launcher-windows-x64\.exe$/.test(file)) {
    return { id: "installer.windows-x64.source", kind: "launcher", platform: "windows", arch: "x64" }
  }
  if (/^codyx-end-user-installer-windows-x64\.exe$/.test(file)) {
    return { id: "installer.windows-x64", kind: "installer", platform: "windows", arch: "x64" }
  }
  if (/^cody-desktop-.*\.exe$/.test(file)) {
    return {
      id: `desktop.windows-${file.includes("arm64") ? "arm64" : "x64"}`,
      kind: "desktop",
      platform: "windows",
      arch: file.includes("arm64") ? "arm64" : "x64",
    }
  }
  if (/^cody-desktop-mac-arm64/.test(file)) {
    return { id: "desktop.macos-arm64", kind: "desktop", platform: "macos", arch: "arm64" }
  }
  if (/^cody-desktop-mac-x64/.test(file)) {
    return { id: "desktop.macos-x64", kind: "desktop", platform: "macos", arch: "x64" }
  }
  if (/^app-release.*\.(apk|aab)$/.test(file)) {
    return {
      id: `android.${file.endsWith(".aab") ? "bundle" : "apk"}`,
      kind: "android",
      platform: "android",
      arch: "universal",
    }
  }
}

async function sha256(filePath: string) {
  const file = Bun.file(filePath)
  const bytes = await file.arrayBuffer()
  return createHash("sha256").update(Buffer.from(bytes)).digest("hex")
}

const seen = new Set<string>()
const assets: Asset[] = []

for (const pattern of candidates) {
  for await (const filePath of new Bun.Glob(pattern).scan({ cwd: root, absolute: true })) {
    const file = path.basename(filePath)
    if (seen.has(file)) continue
    const meta = classify(file)
    if (!meta) continue
    seen.add(file)
    const size = (await stat(filePath)).size
    assets.push({
      ...meta,
      file,
      url: `${releaseBase}/${encodeURIComponent(file)}`,
      sha256: await sha256(filePath),
      size,
    })
  }
}

assets.sort((a, b) => a.id.localeCompare(b.id))

const required = ["cli.windows-x64"]
for (const id of required) {
  if (!assets.some((asset) => asset.id === id)) {
    throw new Error(`Missing required release manifest asset: ${id}`)
  }
}

await Bun.write(
  output,
  `${JSON.stringify(
    {
      schema: 1,
      product: "Codyx-Orchestrator",
      repo,
      version,
      tag,
      channel,
      generatedAt: new Date().toISOString(),
      assets,
    },
    null,
    2,
  )}\n`,
)

console.log(`Wrote ${output} with ${assets.length} assets`)
