#!/usr/bin/env bun

import { generateOpenApiJson } from "../src/cli/cmd/generate"

const json = await generateOpenApiJson({ hono: process.argv.includes("--hono") })

await new Promise<void>((resolve, reject) => {
  process.stdout.write(json, (err) => {
    if (err) reject(err)
    else resolve()
  })
})

process.exit(0)
