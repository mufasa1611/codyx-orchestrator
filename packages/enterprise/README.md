# @cody/enterprise

Enterprise-facing codyx web package. It contains deployment-specific UI and
server integration code for hosted and Cloudflare-targeted environments.

## Development

Install dependencies from the repository root:

```bash
bun install
```

Start the package locally:

```bash
cd packages/enterprise
bun run dev
```

## Scripts

| Command                    | Purpose                                                |
| -------------------------- | ------------------------------------------------------ |
| `bun run dev`              | Start the Vite dev server                              |
| `bun run build`            | Build the default target                               |
| `bun run build:cloudflare` | Build with `CODY_DEPLOYMENT_TARGET=cloudflare`         |
| `bun run typecheck`        | Typecheck the package                                  |
| `bun run shell-prod`       | Open the production SST shell for enterprise resources |

## Requirements

- Node.js 22+ for runtime compatibility
- Bun for dependency installation and package scripts
- Cloudflare/SST credentials for production shell and deploy workflows

Do not run `npm install` in this package. The monorepo uses Bun workspaces,
`catalog:` dependency versions, and `bun.lock`.
