# @cody/console-app

Console web application for codyx account, billing, deployment, and operational
management surfaces.

## Development

Install dependencies from the repository root:

```bash
bun install
```

Start the console app:

```bash
cd packages/console/app
bun run dev
```

The dev server binds to `0.0.0.0` so it can be opened from local browsers,
containers, and forwarded development environments.

## Scripts

| Command              | Purpose                                                            |
| -------------------- | ------------------------------------------------------------------ |
| `bun run dev`        | Start the Vite dev server                                          |
| `bun run dev:remote` | Run against the configured dev auth/Stripe/SST environment         |
| `bun run build`      | Generate sitemap, build assets, and generate public config schemas |
| `bun run typecheck`  | Typecheck the package                                              |
| `bun run start`      | Start the built app                                                |

## Requirements

- Node.js 22+ for runtime compatibility
- Bun for dependency installation and package scripts
- Wrangler/SST credentials when using remote or deployment workflows

Do not run `npm install` in this package. The monorepo uses Bun workspaces,
`catalog:` dependency versions, and `bun.lock`.
