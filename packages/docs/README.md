# Codyx Mintlify Docs

Mintlify documentation workspace for codyx guides, API references, and public
documentation snippets.

## Local Preview

Install the Mintlify CLI globally if it is not already available:

```bash
npm i -g mint
```

Start the preview from this directory, where `docs.json` lives:

```bash
cd packages/docs
mint dev
```

The preview runs at `http://localhost:3000`.

## Structure

| Path             | Purpose                                    |
| ---------------- | ------------------------------------------ |
| `docs.json`      | Mintlify navigation and site configuration |
| `index.mdx`      | Documentation landing page                 |
| `quickstart.mdx` | First-run guide                            |
| `essentials/`    | Core user guides                           |
| `ai-tools/`      | AI/tooling guides                          |
| `snippets/`      | Shared MDX snippets                        |
| `openapi.json`   | API reference input                        |

## Publishing

Mintlify deploys from the connected repository integration. Push documentation
changes to the configured default branch after previewing locally.

## Notes

The Mintlify CLI is installed with npm because it is a global documentation tool.
Do not use `npm install` for this monorepo's source dependencies; use `bun install`
from the repository root.
