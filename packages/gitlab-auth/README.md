# @cody/gitlab-auth

GitLab OAuth and personal access token authentication plugin used by codyx.

This package is adapted from the upstream GitLab auth plugin lineage and now
builds against the codyx plugin interface in `@cody/plugin`.

## Features

- GitLab.com and self-hosted GitLab instance support
- OAuth 2.0 with PKCE
- Personal access token fallback for automation
- Local callback server for browser-based OAuth completion
- Token refresh and secure local credential storage

## Development

Install dependencies from the repository root:

```bash
bun install
```

Build the package:

```bash
cd packages/gitlab-auth
bun run build
```

## Package Notes

- Published package name: `@cody/gitlab-auth`
- Runtime plugin dependency: `@cody/plugin`
- Node.js requirement: 18+
- Credential paths still preserve upstream compatibility in the current source.

Do not run `npm install` in this package. The monorepo uses Bun workspaces,
`catalog:` dependency versions, and `bun.lock`.
