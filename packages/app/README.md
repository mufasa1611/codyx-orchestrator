# @cody/app

SolidJS web client for codyx. This package provides the browser UI used by
`codyx web`, desktop builds, and server-backed deployments.

## Development

Install dependencies from the repository root with Bun:

```bash
bun install
```

Run the app package locally:

```bash
cd packages/app
bun run dev
```

The Vite dev server defaults to `http://localhost:3000`. For a complete local
session experience, also run a codyx backend:

```bash
cd packages/codyx
bun run src/index.ts serve --port 4096 --print-logs --log-level DEBUG
```

## Scripts

| Command                  | Purpose                                            |
| ------------------------ | -------------------------------------------------- |
| `bun run dev`            | Start the Vite dev server                          |
| `bun run build`          | Build the production web assets                    |
| `bun run serve`          | Preview the production build                       |
| `bun run typecheck`      | Typecheck the app package                          |
| `bun run test:unit`      | Run unit tests with Happy DOM                      |
| `bun run test:e2e:local` | Run Playwright tests against the local app/backend |

## E2E Testing

Playwright starts the Vite dev server automatically through `webServer`. UI tests
expect a codyx backend at `localhost:4096` by default.

```bash
cd packages/app
bunx playwright install chromium
bun run test:e2e:local
bun run test:e2e:local -- --grep "settings"
```

Environment options:

- `PLAYWRIGHT_SERVER_HOST` / `PLAYWRIGHT_SERVER_PORT` - backend address, default `localhost:4096`
- `PLAYWRIGHT_PORT` - Vite dev server port, default `3000`
- `PLAYWRIGHT_BASE_URL` - override base URL, default `http://localhost:<PLAYWRIGHT_PORT>`

## Notes

Do not run `npm install` in this package. The monorepo uses Bun workspaces,
`catalog:` dependency versions, and `bun.lock`.
