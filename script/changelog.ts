#!/usr/bin/env bun

import { rm } from "fs/promises"
import path from "path"
import { $ } from "bun"
import { parseArgs } from "util"

const root = path.resolve(import.meta.dir, "..")
const file = path.join(root, "UPCOMING_CHANGELOG.md")
const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    from: { type: "string", short: "f" },
    to: { type: "string", short: "t" },
    variant: { type: "string", default: "low" },
    quiet: { type: "boolean", default: false },
    print: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
  allowPositionals: true,
})
const args = [...positionals]

if (values.from) args.push("--from", values.from)
if (values.to) args.push("--to", values.to)

if (values.help) {
  console.log(`
Usage: bun script/changelog.ts [options]

Generates UPCOMING_CHANGELOG.md by running the cody changelog command.
Falls back to git log summary when the cody AI model is unavailable.

Options:
  -f, --from <version>   Starting version (default: latest non-draft GitHub release)
  -t, --to <ref>         Ending ref (default: HEAD)
      --variant <name>   Thinking variant for cody run (default: low)
      --quiet            Suppress cody command output unless it fails
      --print            Print the generated UPCOMING_CHANGELOG.md after success
  -h, --help             Show this help message

Examples:
  bun script/changelog.ts
  bun script/changelog.ts --from 1.0.200
  bun script/changelog.ts -f 1.0.200 -t 1.0.205
`)
  process.exit(0)
}

await rm(file, { force: true })

async function fallbackGitLog() {
  const to = values.to || "HEAD"
  const from = values.from || (await $`git describe --tags --abbrev=0 2>/dev/null`.text().catch(() => ""))
  const range = from ? `${from}..${to}` : to
  const log = await $`git log ${range} --oneline --no-decorate 2>/dev/null`.text().catch(() => "")
  if (!log.trim()) {
    await Bun.write(file, "No notable changes")
    return
  }
  const lines = log
    .split("\n")
    .filter(Boolean)
    .map((l) => `- ${l}`)
  const header = `## Changelog (${from || "start"} → ${to})\n\n`
  await Bun.write(file, header + lines.join("\n") + "\n")
}

const quiet = values.quiet
const cmd = ["cody", "run"]
cmd.push("--variant", values.variant)
cmd.push("--command", "changelog", "--", ...args)

const proc = Bun.spawn(cmd, {
  cwd: root,
  stdin: "inherit",
  stdout: quiet ? "pipe" : "inherit",
  stderr: quiet ? "pipe" : "inherit",
})

const [out, err] = quiet
  ? await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
  : ["", ""]
const code = await proc.exited
if (code === 0) {
  const exists = await Bun.file(file).exists()
  if (exists) {
    if (values.print) process.stdout.write(await Bun.file(file).text())
    process.exit(0)
  }
}

// fallback: generate changelog from git log
console.log("cody AI changelog failed, falling back to git log summary")
await fallbackGitLog()
if (values.print) process.stdout.write(await Bun.file(file).text())
process.exit(0)
