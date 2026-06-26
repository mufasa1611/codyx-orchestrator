#!/usr/bin/env bun

const version = Bun.env.CODY_VERSION ?? (await Bun.file("../codyx/package.json").json()).version ?? "0.0.0"
const match = String(version).match(/^(\d+)\.(\d+)\.(\d+)/)
if (!match) throw new Error(`Cannot derive Android versionCode from version '${version}'`)

const manifest = await Bun.file("twa-manifest.json").json()
manifest.appVersion = String(version)
manifest.appVersionName = String(version)
manifest.appVersionCode = Number(match[1]) * 1_000_000 + Number(match[2]) * 1_000 + Number(match[3])

await Bun.write("twa-manifest.json", JSON.stringify(manifest, null, 2) + "\n")
console.log(`Updated Android version to ${manifest.appVersionName} (${manifest.appVersionCode})`)
