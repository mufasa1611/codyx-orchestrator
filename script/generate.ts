#!/usr/bin/env bun

import { $ } from "bun"
import path from "path"

await $`bun script/openapi.ts > ../sdk/openapi.json`.cwd("packages/codyx")

await $`bun ./packages/sdk/js/script/build.ts`.env({
  ...process.env,
  CODY_SDK_OPENAPI_FILE: path.resolve("packages/sdk/openapi.json"),
})

await $`bun prettier --write packages/sdk/openapi.json packages/sdk/js/src/gen packages/sdk/js/src/v2`
