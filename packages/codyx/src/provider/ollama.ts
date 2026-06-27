import type { Provider } from "./provider"
import { Process } from "@/util/process"
import { which } from "@/util/which"
import { isRecord } from "@/util/record"

type StartedProcess = {
  unref?: () => void
}

export type PreflightDeps = {
  readonly command: (cmd: string) => string | null
  readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  readonly sleep: (ms: number) => Promise<void>
  readonly spawn: (cmd: string[], opts?: Process.Options) => StartedProcess
}

export type PreflightInput = {
  readonly provider: Provider.Info
  readonly model: Provider.Model
}

export type PreflightResult =
  | { readonly type: "skipped" }
  | { readonly type: "ready" }
  | { readonly type: "missing-model"; readonly endpoint: URL; readonly model: string }

const defaultDeps: PreflightDeps = {
  command: which,
  fetch,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  spawn: Process.spawn,
}

const localHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"])

export function endpoint(input: PreflightInput): URL | undefined {
  if (input.model.api.npm !== "@ai-sdk/openai-compatible") return

  const raw =
    typeof input.provider.options["baseURL"] === "string" && input.provider.options["baseURL"].trim() !== ""
      ? input.provider.options["baseURL"]
      : input.model.api.url
  const value = raw.trim()
  if (!URL.canParse(value)) return

  const url = new URL(value)
  const host = url.hostname.toLowerCase()
  const providerID = input.provider.id.toLowerCase()
  const isOllama = providerID.includes("ollama") || url.port === "11434"
  if (!isOllama || !localHosts.has(host)) return

  return new URL(url.origin)
}

export function hasModel(models: string[], model: string) {
  const id = model.trim()
  if (!id) return false
  return models.some((item) => item === id || (!id.includes(":") && item === `${id}:latest`))
}

export async function check(input: PreflightInput, deps: PreflightDeps = defaultDeps): Promise<PreflightResult> {
  const target = endpoint(input)
  if (!target) return { type: "skipped" }

  const ollama = deps.command("ollama")
  const models =
    (await readModelNames(target, deps)) ?? (await startAndReadModelNames(target, input.model.api.id, ollama, deps))
  if (hasModel(models, input.model.api.id)) return { type: "ready" }
  return { type: "missing-model", endpoint: target, model: input.model.api.id }
}

export async function pull(input: { endpoint: URL; model: string }, deps: PreflightDeps = defaultDeps) {
  const response = await deps.fetch(new URL("/api/pull", input.endpoint), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: input.model, stream: false }),
  })

  if (response.ok) return
  throw new Error(`Ollama failed to pull "${input.model}" (${response.status} ${response.statusText}).`)
}

async function startAndReadModelNames(endpoint: URL, model: string, ollama: string | null, deps: PreflightDeps) {
  if (!ollama) {
    throw new Error(
      `Ollama is required for local model "${model}" but it is not installed or not on PATH. Install it from https://ollama.com/download and retry.`,
    )
  }

  deps.spawn([ollama, "serve"], { stdin: "ignore", stdout: "ignore", stderr: "ignore" }).unref?.()

  for (const delay of [250, 500, 750, 1000, 1500, 2000, 2500, 3000]) {
    await deps.sleep(delay)
    const models = await readModelNames(endpoint, deps)
    if (models) return models
  }

  throw new Error(`Ollama is installed but ${endpoint.origin} did not respond after starting it.`)
}

async function readModelNames(endpoint: URL, deps: PreflightDeps) {
  return withSignal(1500, async (signal) => {
    const response = await deps.fetch(new URL("/api/tags", endpoint), { signal })
    if (!response.ok) return undefined
    return modelNames(await response.json())
  }).catch(() => undefined)
}

function modelNames(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.models)) return []
  return value.models.flatMap((item) => {
    if (!isRecord(item)) return []
    if (typeof item.name === "string") return [item.name]
    if (typeof item.model === "string") return [item.model]
    return []
  })
}

async function withSignal<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  return fn(controller.signal).finally(() => clearTimeout(timer))
}

export * as Ollama from "./ollama"
