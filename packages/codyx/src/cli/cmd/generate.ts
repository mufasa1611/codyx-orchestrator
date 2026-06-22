import { Server } from "../../server/server"
import type { CommandModule } from "yargs"

type Args = {
  httpapi: boolean
  hono: boolean
}

export async function generateOpenApiJson(args: { hono: boolean }) {
  const specs = args.hono ? await Server.openapiHono() : await Server.openapi()
  for (const item of Object.values(specs.paths)) {
    for (const method of ["get", "post", "put", "delete", "patch"] as const) {
      const operation = item[method]
      if (!operation?.operationId) continue
      operation["x-codeSamples"] = [
        {
          lang: "js",
          source: [
            `import { createCodyClient } from "@cody/sdk`,
            ``,
            `const client = createCodyClient()`,
            `await client.${operation.operationId}({`,
            `  ...`,
            `})`,
          ].join("\n"),
        },
      ]
    }
  }
  const raw = JSON.stringify(specs, null, 2)

  // Format through prettier so output is byte-identical to committed file
  // regardless of whether ./script/format.ts runs afterward.
  const prettier = await import("prettier")
  const babel = await import("prettier/plugins/babel")
  const estree = await import("prettier/plugins/estree")
  const format = prettier.format ?? prettier.default?.format
  return format(raw, {
    parser: "json",
    plugins: [babel.default ?? babel, estree.default ?? estree],
    printWidth: 120,
  })
}

export const GenerateCommand = {
  command: "generate",
  builder: (yargs) =>
    yargs
      .option("httpapi", {
        type: "boolean",
        default: false,
        description:
          "Generate OpenAPI from the Effect HttpApi contract (default; flag retained for backwards compatibility)",
      })
      .option("hono", {
        type: "boolean",
        default: false,
        description: "Generate OpenAPI from the legacy Hono backend (parity-diff only; will be removed)",
      }),
  handler: async (args) => {
    // Wait for stdout to finish writing before process.exit() is called
    const json = await generateOpenApiJson(args)
    await new Promise<void>((resolve, reject) => {
      process.stdout.write(json, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
    process.exit(0)
  },
} satisfies CommandModule<object, Args>
