export type PresetModel = {
  name: string
  id?: string
  family?: string
  minMemoryGB?: number
  installHint?: string
  reasoning?: boolean
  temperature?: boolean
  tool_call?: boolean
  attachment?: boolean
  limit: {
    context: number
    output: number
  }
}

export type PresetProvider = {
  id: string
  name: string
  mode: "online" | "local"
  engine?: "ollama" | "llama.cpp"
  env: string[]
  npm: string
  api?: string
  options?: Record<string, unknown>
  setupUrl: string
  freeTierNote: string
  defaultModel: string
  models: Record<string, PresetModel>
}

export const presets = {
  google: {
    id: "google",
    name: "Google Gemini",
    mode: "online",
    env: ["GOOGLE_GENERATIVE_AI_API_KEY"],
    npm: "@ai-sdk/google",
    setupUrl: "https://aistudio.google.com/app/apikey",
    freeTierNote: "Google AI Studio has a free tier with per-project rate limits.",
    defaultModel: "gemini-2.5-flash",
    models: {
      "gemini-2.5-flash": {
        name: "Gemini 2.5 Flash",
        family: "gemini",
        reasoning: true,
        temperature: true,
        tool_call: true,
        attachment: true,
        limit: { context: 1_000_000, output: 65_536 },
      },
      "gemini-2.5-flash-lite": {
        name: "Gemini 2.5 Flash Lite",
        family: "gemini",
        reasoning: true,
        temperature: true,
        tool_call: true,
        attachment: true,
        limit: { context: 1_000_000, output: 65_536 },
      },
    },
  },
  groq: {
    id: "groq",
    name: "Groq",
    mode: "online",
    env: ["GROQ_API_KEY"],
    npm: "@ai-sdk/groq",
    setupUrl: "https://console.groq.com/keys",
    freeTierNote: "Groq has a free developer tier with organization-level rate limits.",
    defaultModel: "openai/gpt-oss-120b",
    models: {
      "openai/gpt-oss-120b": {
        name: "GPT OSS 120B",
        family: "gpt-oss",
        reasoning: true,
        temperature: true,
        tool_call: true,
        limit: { context: 131_072, output: 16_384 },
      },
      "openai/gpt-oss-20b": {
        name: "GPT OSS 20B",
        family: "gpt-oss",
        reasoning: true,
        temperature: true,
        tool_call: true,
        limit: { context: 131_072, output: 16_384 },
      },
      "qwen/qwen3-32b": {
        name: "Qwen 3 32B",
        family: "qwen",
        reasoning: true,
        temperature: true,
        tool_call: true,
        limit: { context: 131_072, output: 16_384 },
      },
    },
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    mode: "online",
    env: ["OPENROUTER_API_KEY"],
    npm: "@openrouter/ai-sdk-provider",
    setupUrl: "https://openrouter.ai/keys",
    freeTierNote: "OpenRouter exposes rotating :free models; availability can change.",
    defaultModel: "deepseek/deepseek-v4-flash-0731:free",
    models: {
      "deepseek/deepseek-v4-flash-0731:free": {
        name: "DeepSeek V4 Flash 0731 Free",
        family: "deepseek",
        reasoning: true,
        temperature: true,
        tool_call: true,
        limit: { context: 1_048_576, output: 16_384 },
      },
      "poolside/laguna-s-2.1:free": {
        name: "Laguna S 2.1 Free",
        family: "poolside",
        reasoning: true,
        temperature: true,
        tool_call: true,
        limit: { context: 262_144, output: 16_384 },
      },
      "qwen/qwen3.8-27b:free": {
        name: "Qwen3.8 27B Free",
        family: "qwen",
        reasoning: true,
        temperature: true,
        tool_call: true,
        limit: { context: 262_144, output: 16_384 },
      },
      "openrouter/free": {
        name: "OpenRouter Free Router",
        family: "router",
        reasoning: false,
        temperature: true,
        attachment: true,
        tool_call: true,
        limit: { context: 200_000, output: 8_192 },
      },
    },
  },
  cerebras: {
    id: "cerebras",
    name: "Cerebras",
    mode: "online",
    env: ["CEREBRAS_API_KEY"],
    npm: "@ai-sdk/cerebras",
    setupUrl: "https://cloud.cerebras.ai/",
    freeTierNote: "Cerebras offers an API key to get started; rate limits and free access can change.",
    defaultModel: "qwen-3.8-27b",
    models: {
      "qwen-3.8-27b": {
        name: "Qwen 3.8 27B",
        family: "qwen",
        reasoning: true,
        temperature: true,
        tool_call: true,
        limit: { context: 131_072, output: 16_384 },
      },
      "qwen-3.6-27b": {
        name: "Qwen 3.6 27B",
        family: "qwen",
        reasoning: true,
        temperature: true,
        tool_call: true,
        limit: { context: 131_072, output: 16_384 },
      },
    },
  },
  ollama: {
    id: "ollama",
    name: "Ollama Local",
    mode: "local",
    engine: "ollama",
    env: [],
    npm: "@ai-sdk/openai-compatible",
    api: "http://127.0.0.1:11434/v1",
    options: {
      baseURL: "http://127.0.0.1:11434/v1",
      apiKey: "ollama",
    },
    setupUrl: "https://ollama.com/download",
    freeTierNote: "Runs on this computer. No API key is required, but the model must be pulled locally.",
    defaultModel: "qwen2.5-coder:3b",
    models: {
      "llama3.2:1b": {
        name: "Llama 3.2 1B",
        family: "llama",
        minMemoryGB: 4,
        installHint: "ollama pull llama3.2:1b",
        reasoning: false,
        temperature: true,
        tool_call: false,
        limit: { context: 32_768, output: 8_192 },
      },
      "llama3.2:3b": {
        name: "Llama 3.2 3B",
        family: "llama",
        minMemoryGB: 8,
        installHint: "ollama pull llama3.2:3b",
        reasoning: false,
        temperature: true,
        tool_call: false,
        limit: { context: 32_768, output: 8_192 },
      },
      "llama3.1:8b": {
        name: "Llama 3.1 8B",
        family: "llama",
        minMemoryGB: 16,
        installHint: "ollama pull llama3.1:8b",
        reasoning: false,
        temperature: true,
        tool_call: false,
        limit: { context: 32_768, output: 8_192 },
      },
      "qwen2.5-coder:1.5b": {
        name: "Qwen2.5 Coder 1.5B",
        family: "qwen",
        minMemoryGB: 4,
        installHint: "ollama pull qwen2.5-coder:1.5b",
        reasoning: false,
        temperature: true,
        tool_call: false,
        limit: { context: 32_768, output: 8_192 },
      },
      "qwen2.5-coder:3b": {
        name: "Qwen2.5 Coder 3B",
        family: "qwen",
        minMemoryGB: 8,
        installHint: "ollama pull qwen2.5-coder:3b",
        reasoning: false,
        temperature: true,
        tool_call: false,
        limit: { context: 32_768, output: 8_192 },
      },
      "qwen2.5-coder:7b": {
        name: "Qwen2.5 Coder 7B",
        family: "qwen",
        minMemoryGB: 16,
        installHint: "ollama pull qwen2.5-coder:7b",
        reasoning: false,
        temperature: true,
        tool_call: false,
        limit: { context: 32_768, output: 8_192 },
      },
      "deepseek-r1:8b": {
        name: "DeepSeek R1 8B",
        family: "deepseek",
        minMemoryGB: 16,
        installHint: "ollama pull deepseek-r1:8b",
        reasoning: true,
        temperature: true,
        tool_call: false,
        limit: { context: 32_768, output: 8_192 },
      },
      "qwen2.5:32b": {
        name: "Qwen2.5 32B",
        family: "qwen",
        minMemoryGB: 48,
        installHint: "ollama pull qwen2.5:32b",
        reasoning: false,
        temperature: true,
        tool_call: true,
        limit: { context: 32_768, output: 8_192 },
      },
    },
  },
  llamacpp: {
    id: "llamacpp",
    name: "llama.cpp GGUF Server",
    mode: "local",
    engine: "llama.cpp",
    env: [],
    npm: "@ai-sdk/openai-compatible",
    api: "http://127.0.0.1:8080/v1",
    options: {
      baseURL: "http://127.0.0.1:8080/v1",
      apiKey: "llama.cpp",
    },
    setupUrl: "https://github.com/ggerganov/llama.cpp",
    freeTierNote: "Runs GGUF files through a local OpenAI-compatible llama.cpp server.",
    defaultModel: "local-model",
    models: {
      "local-model": {
        name: "Current GGUF model",
        family: "gguf",
        minMemoryGB: 8,
        installHint: "Start llama-server with --alias local-model and --port 8080.",
        reasoning: false,
        temperature: true,
        tool_call: false,
        limit: { context: 32_768, output: 8_192 },
      },
      "llama-local": {
        name: "Current Llama GGUF model",
        family: "llama",
        minMemoryGB: 8,
        installHint: "Start llama-server with a Llama GGUF file, --alias llama-local, and --port 8080.",
        reasoning: false,
        temperature: true,
        tool_call: false,
        limit: { context: 32_768, output: 8_192 },
      },
    },
  },
} satisfies Record<string, PresetProvider>

export type PresetProviderID = keyof typeof presets

export function providerIDs() {
  return Object.keys(presets) as PresetProviderID[]
}

export function get(id: string) {
  return presets[id as PresetProviderID]
}

export function providerConfig(provider: PresetProvider) {
  return {
    name: provider.name,
    env: provider.env,
    npm: provider.npm,
    ...(provider.api ? { api: provider.api } : {}),
    ...(provider.options ? { options: provider.options } : {}),
    models: Object.fromEntries(
      Object.entries(provider.models).map(([modelID, model]) => [
        modelID,
        {
          ...(model.id ? { id: model.id } : {}),
          name: model.name,
          ...(model.family ? { family: model.family } : {}),
          reasoning: model.reasoning ?? false,
          temperature: model.temperature ?? true,
          attachment: model.attachment ?? false,
          tool_call: model.tool_call ?? true,
          limit: model.limit,
        },
      ]),
    ),
  }
}

export * as ProviderPreset from "./preset"
