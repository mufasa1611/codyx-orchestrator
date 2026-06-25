# codyx Desktop

Electron desktop wrapper for codyx.

## Development

Install dependencies from the repository root, then run the desktop package:

```bash
bun install
cd packages/desktop
bun run dev
```

## Build

Run the `build` script to build the app assets, then `package` to bundle the
desktop application. The resulting app is written to `dist/`.

```bash
bun run build && bun run package
```

Do not run `npm install` in this package. The monorepo uses Bun workspaces,
`catalog:` dependency versions, and `bun.lock`.
