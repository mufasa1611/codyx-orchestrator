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

type GithubRelease = {
  id: number
  tag_name: string
  html_url: string
}

const githubHeaders = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
  Accept: "application/vnd.github.v3+json",
  "User-Agent": "codyx-version-script",
}

async function findGithubRelease() {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/tags/${tagName}`, {
    headers: githubHeaders,
  })
  if (res.ok) return (await res.json()) as GithubRelease
  if (res.status !== 404) {
    const data = await res.json().catch(() => ({}))
    throw new Error(`API ${res.status}: ${data.message ?? "Could not inspect release"}`)
  }

  const list = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=100`, {
    headers: githubHeaders,
  })
  const data = await list.json()
  if (!list.ok) throw new Error(`API ${list.status}: ${data.message ?? "Could not list releases"}`)
  return (data as GithubRelease[]).find((release) => release.tag_name === tagName)
}

async function ensureGitTag() {
  const apiRef = `tags/${tagName}`
  const gitRef = `refs/${apiRef}`
  const check = await fetch(`https://api.github.com/repos/${repo}/git/ref/${apiRef}`, { headers: githubHeaders })
  if (check.ok) return
  if (check.status !== 404) {
    const data = await check.json().catch(() => ({}))
    throw new Error(`API ${check.status} checking ref: ${data.message ?? "Unknown"}`)
  }
  console.log(`Creating git tag ref ${gitRef} @ ${sha}...`)
  const res = await fetch(`https://api.github.com/repos/${repo}/git/refs`, {
    method: "POST",
    headers: githubHeaders,
    body: JSON.stringify({ ref: gitRef, sha }),
  })
  const data = await res.json()
  if (res.status === 422 && data.message === "Reference already exists") return
  if (!res.ok) throw new Error(`API ${res.status} creating ref: ${data.message} ${JSON.stringify(data.errors ?? [])}`)
}

async function upsertGithubRelease(body: string, draft: boolean) {
  await ensureGitTag()
  const existing = await findGithubRelease()
  const url = existing
    ? `https://api.github.com/repos/${repo}/releases/${existing.id}`
    : `https://api.github.com/repos/${repo}/releases`
  console.log(
    `${existing ? "Updating" : "Creating"} ${draft ? "draft " : ""}release ${tagName} on ${repo} @ ${sha} via API...`,
  )
  const res = await fetch(url, {
    method: existing ? "PATCH" : "POST",
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
  await $`bun script/changelog.ts --to ${sha}`.cwd(process.cwd()).catch(() => {})
  const file = `${process.cwd()}/UPCOMING_CHANGELOG.md`
  const body = await Bun.file(file)
    .text()
    .catch(() => "No notable changes")
  console.log(`Changelog body length: ${body.length} chars`)
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
