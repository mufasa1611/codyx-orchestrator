# @cody/web

Astro/Starlight documentation site for codyx.

## Development

Install dependencies from the repository root:

```bash
bun install
```

Start the docs site:

```bash
cd packages/web
bun run dev
```

The local site runs at `http://localhost:4321`.

## Scripts

| Command                   | Purpose                                    |
| ------------------------- | ------------------------------------------ |
| `bun run dev`             | Start the local Astro dev server           |
| `bun run dev:remote`      | Start the docs site against the remote API |
| `bun run build`           | Build the static/Cloudflare-ready site     |
| `bun run preview`         | Preview the built site locally             |
| `bun run astro -- --help` | Show Astro CLI help                        |

## Content

Documentation pages live under `src/content/docs`. Locale metadata and routing
helpers live under `src/content/i18n`, `src/i18n`, and `src/middleware.ts`.

Do not run `npm install` in this package. The monorepo uses Bun workspaces,
`catalog:` dependency versions, and `bun.lock`.
