import { expect, test } from "bun:test"

import { Ollama } from "@/provider/ollama"
import { Provider } from "@/provider/provider"
import { ModelID, ProviderID } from "@/provider/schema"

function model(id = "llama3"): Provider.Model {
  return {
    id: ModelID.make(id),
    providerID: ProviderID.make("ollama"),
    api: {
      id,
      url: "http://localhost:11434/v1",
      npm: "@ai-sdk/openai-compatible",
    },
    name: id,
    family: id,
    capabilities: {
      temperature: true,
      reasoning: false,
      attachment: false,
      toolcall: true,
      input: { text: true, audio: false, image: false, video: false, pdf: false },
      output: { text: true, audio: false, image: false, video: false, pdf: false },
      interleaved: false,
    },
    cost: {
      input: 0,
      output: 0,
      cache: { read: 0, write: 0 },
    },
    limit: { context: 4096, output: 2048 },
    status: "active",
    options: {},
    headers: {},
    release_date: "2026-01-01",
  }
}

function provider(baseURL = "http://localhost:11434/v1"): Provider.Info {
  return {
    id: ProviderID.make("ollama"),
    name: "Ollama",
    source: "config",
    env: [],
    options: { baseURL },
    models: {},
  }
}

function deps(input: Partial<Ollama.PreflightDeps>): Ollama.PreflightDeps {
  return {
    command: () => "ollama",
    fetch: async () => Response.json({ models: [] }),
    sleep: async () => undefined,
    spawn: () => ({}),
    ...input,
  }
}

function requestURL(input: RequestInfo | URL) {
  if (input instanceof URL) return input
  if (typeof input === "string") return new URL(input)
  return new URL(input.url)
}

test("detects local Ollama OpenAI-compatible endpoint", () => {
  expect(Ollama.endpoint({ provider: provider(), model: model() })?.href).toBe("http://localhost:11434/")
})

test("skips non-Ollama OpenAI-compatible endpoints", () => {
  expect(Ollama.endpoint({ provider: provider("https://example.com/v1"), model: model() })).toBeUndefined()
})

test("matches Ollama latest tag when selected model has no tag", () => {
  expect(Ollama.hasModel(["llama3:latest"], "llama3")).toBe(true)
  expect(Ollama.hasModel(["llama3:8b"], "llama3")).toBe(false)
})

test("starts Ollama when the local API is not responding", async () => {
  let started = false
  const result = await Ollama.check(
    { provider: provider(), model: model() },
    deps({
      fetch: async () => {
        if (!started) throw new Error("offline")
        return Response.json({ models: [{ name: "llama3:latest" }] })
      },
      spawn: () => {
        started = true
        return { unref: () => undefined }
      },
    }),
  )

  expect(started).toBe(true)
  expect(result.type).toBe("ready")
})

test("reports missing model after Ollama responds", async () => {
  const result = await Ollama.check(
    { provider: provider(), model: model("gemma4") },
    deps({
      fetch: async () => Response.json({ models: [{ name: "llama3:latest" }] }),
    }),
  )

  expect(result).toMatchObject({ type: "missing-model", model: "gemma4" })
})

test("requires the Ollama command when the local API is down", async () => {
  await expect(
    Ollama.check(
      { provider: provider(), model: model() },
      deps({
        command: () => null,
        fetch: async () => {
          throw new Error("offline")
        },
      }),
    ),
  ).rejects.toThrow("not installed")
})

test("pulls a missing model through the Ollama API", async () => {
  let body: unknown
  let pathname = ""

  await Ollama.pull(
    { endpoint: new URL("http://localhost:11434"), model: "gemma4" },
    deps({
      fetch: async (input, init) => {
        pathname = requestURL(input).pathname
        body = JSON.parse(String(init?.body))
        return new Response("{}", { status: 200 })
      },
    }),
  )

  expect(pathname).toBe("/api/pull")
  expect(body).toEqual({ name: "gemma4", stream: false })
})
