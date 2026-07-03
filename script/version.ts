#!/usr/bin/env bun

import { Script } from "../packages/script/src/index.ts"
import { $ } from "bun"

const output = [`version=${Script.version}`]
const sha = process.env.GITHUB_SHA ?? (await $`git rev-parse HEAD`.text()).trim()
const repo = process.env.GH_REPO ?? ""
const token = process.env.GH_TOKEN ?? ""
console.log(
  `CODY_VERSION="${process.env.CODY_VERSION}" Script.version="${Script.version}" preview=${Script.preview} channel=${Script.channel} sha=${sha} repo=${repo}`,
)

const tagName = `v${Script.version}`

async function createGithubRelease(body: string, draft: boolean) {
  console.log(`Creating ${draft ? "draft " : ""}release ${tagName} on ${repo} @ ${sha} via API...`)
  const res = await fetch(`https://api.github.com/repos/${repo}/releases`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "codyx-version-script",
    },
    body: JSON.stringify({
      tag_name: tagName,
      target_commitish: sha,
      name: tagName,
      body,
      draft,
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`API ${res.status}: ${data.message} ${JSON.stringify(data.errors ?? [])}`)
  console.log(`Release created: id=${data.id} tag=${data.tag_name} url=${data.html_url}`)
  return data
}

if (!Script.preview) {
  await $`bun script/changelog.ts --to ${sha}`.cwd(process.cwd())
  const file = `${process.cwd()}/UPCOMING_CHANGELOG.md`
  const body = await Bun.file(file)
    .text()
    .catch(() => "No notable changes")
  const release = await createGithubRelease(body || "No notable changes", true)
  output.push(`release=${release.id}`)
  output.push(`tag=${release.tag_name}`)
} else if (Script.channel === "beta") {
  const release = await createGithubRelease("Beta release", true)
  output.push(`release=${release.id}`)
  output.push(`tag=${release.tag_name}`)
}

output.push(`repo=${repo}`)

if (process.env.GITHUB_OUTPUT) {
  await Bun.write(process.env.GITHUB_OUTPUT, output.join("\n"))
}

process.exit(0)
